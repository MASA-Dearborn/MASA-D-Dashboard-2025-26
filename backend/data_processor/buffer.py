"""Live display buffer and ML insights API for the telemetry backend.

This is Path 1 of the backend. main.py hands every normalized packet to
buffer_to_frontend(). This module keeps the newest packet for the dashboard
and feeds every packet to the online ML models. The SQLite path (db.py) owns
the complete, ordered record; nothing in this module is responsible for
persistence.

Public interface used by main.py (keep these stable):
    buffer_to_frontend(payload)
    telemetry_buffer.flush_for_shutdown() / .dump_buffer() / .stop()
    start_api()
"""

import json
import logging
import os
import sys
import threading
import traceback

from flask import Flask, jsonify
from flask_cors import CORS

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml import EventDescriber, FlightPredictor  # noqa: E402

# A backward jump in `cycles` larger than this means the flight computer
# restarted its counter, not that a packet arrived late. Thread-per-packet
# reordering leaves a packet a few cycles behind at most; a reboot drops the
# counter by thousands. 100 cycles is 5 s at the ~20 Hz telemetry rate.
RESET_JUMP_CYCLES = 100

# How often the ground-station console gets a one-line health summary.
STATUS_INTERVAL_SEC = 5.0


class TelemetryBuffer:
    """One-slot mailbox holding the newest packet for the live display.

    Writers replace the packet; readers look at it without removing it, so
    during a radio dropout the dashboard holds the last known values instead
    of going blank or replaying old data.

    Invariant: a stored packet is never modified after it is stored. put()
    stores its own copy, and a newer packet replaces the reference rather
    than editing the dict. That is what lets get() hand out the stored dict
    without copying it, and lets Flask serialize it outside the lock.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._packet = None
        self._cycles = None
        # Counters for the periodic status line; reset every interval.
        self._received = 0
        self._late = 0
        self._polls = 0
        self._stop = threading.Event()

    def put(self, packet):
        """Offer a packet to the display. Returns True if it was stored.

        Accepted: the first packet, any higher cycle number, or a backward
        jump larger than RESET_JUMP_CYCLES (counter reset after a reboot).
        Rejected: a small backward step or a repeat, which is a packet whose
        thread ran late. The display already has something newer.

        Known edge case: a pre-reset packet that runs late *after* a reset
        has been accepted (stored 1, late 5999) is taken as "newer." The
        next real packet is then a large backward jump, so it is accepted as
        another reset and the display recovers within one packet (~50 ms).

        Known edge case: a reboot within the first RESET_JUMP_CYCLES cycles
        (old counter at 80, new at 1) is too small a jump to detect. The
        display holds the old packet until the new counter passes the old
        value, which takes at most RESET_JUMP_CYCLES packets (~5 s).
        """
        cycles = packet.get("cycles")
        # normalize_packet() always produces an int. Anything else means the
        # packet skipped main.py's normal path, so keep it off the display.
        if not isinstance(cycles, int):
            return False

        snapshot = dict(packet)  # our own copy, made outside the lock

        with self._lock:
            self._received += 1
            previous = self._cycles
            is_reset = previous is not None and cycles < previous - RESET_JUMP_CYCLES
            if previous is not None and cycles <= previous and not is_reset:
                self._late += 1
                return False
            self._packet = snapshot
            self._cycles = cycles

        # Print outside the lock so console I/O never blocks other threads.
        if is_reset:
            print(f"[BUFFER] cycles reset {previous} -> {cycles}; "
                  "flight computer likely restarted")
        return True

    def get(self):
        """Return the newest packet (or None) without removing it."""
        with self._lock:
            self._polls += 1
            return self._packet

    def start_status_reporter(self):
        """Start the background thread that prints the status line."""
        thread = threading.Thread(target=self._report_status,
                                  name="buffer-status", daemon=True)
        thread.start()

    def _take_status(self):
        """Read and reset the interval counters as one atomic step."""
        with self._lock:
            status = (self._received, self._late, self._polls, self._cycles)
            self._received = self._late = self._polls = 0
        return status

    def _report_status(self):
        # Event.wait() is an interruptible sleep: it returns False when the
        # interval times out, and True as soon as stop() sets the event.
        while not self._stop.wait(STATUS_INTERVAL_SEC):
            received, late, polls, cycles = self._take_status()
            if cycles is None:
                print(f"[BUFFER] Waiting for first packet | {polls} dashboard polls")
            elif received == 0:
                print(f"[BUFFER] No packets in last {STATUS_INTERVAL_SEC:.0f}s, "
                      f"display holding cycle {cycles} | {polls} dashboard polls")
            else:
                rate = received / STATUS_INTERVAL_SEC
                print(f"[BUFFER] {received} packets ({rate:.1f} Hz) | "
                      f"latest cycle {cycles} | {late} late | {polls} dashboard polls")

    def stop(self):
        """Stop the status reporter.

        Safe to call from main.py's signal handler: Event.set() takes the
        event's internal lock, but only the status thread ever waits on it,
        so the interrupted main thread can never be the one holding it.
        """
        self._stop.set()

    def dump_buffer(self):
        """No-op, kept because main.py calls it during shutdown.

        The old version wrote the display queue to buffer_dump.json as crash
        recovery. SQLite already records every packet as it arrives and
        survives a force-kill, so there is nothing here to recover.
        """

    def flush_for_shutdown(self):
        """No-op, kept because main.py calls it during shutdown."""


# main.py imports this instance by name.
telemetry_buffer = TelemetryBuffer()

# Online ML models: fed every packet here, read by /get_insights.
flight_predictor = FlightPredictor()
event_describer = EventDescriber(predictor=flight_predictor)

# Separate from the display lock so /get_packet never waits on a model update.
# No code path ever holds both locks at once, so they cannot deadlock. The cost
# is that the display and the insights can be one packet apart for a moment,
# which is harmless because the bridge polls them separately anyway.
_models_lock = threading.Lock()


def buffer_to_frontend(payload):
    """Accept one already-normalized packet from main.py.

    main.py normalizes each packet and then serializes it, so this decodes
    the JSON but deliberately does not normalize a second time.

    Every valid packet goes to the ML models, including ones the display
    rejects as late: the display only wants the newest, but the models'
    regressions need every data point.
    """
    try:
        packet = json.loads(payload) if isinstance(payload, str) else payload
        if not isinstance(packet, dict):
            raise ValueError("packet must be a JSON object")
    except ValueError as exc:  # json.JSONDecodeError subclasses ValueError
        print(f"[BUFFER ERROR] Invalid packet: {exc}")
        return

    telemetry_buffer.put(packet)

    # The lock stops two threads from updating the models at the same time.
    # It cannot guarantee cycle order: main.py starts one thread per packet,
    # and threads can reach this lock out of order. A single ordered worker
    # in main.py (phase 2) is the real fix.
    try:
        with _models_lock:
            flight_predictor.update(packet)
            event_describer.update(packet)
    except Exception:
        print("[BUFFER ERROR] ML update failed:")
        traceback.print_exc()


flask_app = Flask(__name__)
CORS(flask_app)


@flask_app.route("/get_packet", methods=["GET"])
def api_get_packet():
    """Newest packet, or {} before the first packet arrives."""
    packet = telemetry_buffer.get()
    # Serializing outside the lock is safe: stored packets are never modified.
    return jsonify(packet if packet is not None else {})


@flask_app.route("/get_insights", methods=["GET"])
def api_get_insights():
    """ML predictions and narrated flight events for the dashboard panels."""
    # Serialize while holding the lock. If the models return references to
    # their internal state, a packet thread could otherwise change that state
    # partway through serialization.
    with _models_lock:
        return jsonify({
            "predictions": flight_predictor.get_predictions(),
            "events": event_describer.get_events(),
        })


def start_api():
    """Start the status reporter and the Flask API server."""
    # Werkzeug logs every HTTP request, about 12 per second from the bridge,
    # which buries everything else on the console. The status line reports
    # dashboard polls instead, so a connected bridge is still visible.
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    telemetry_buffer.start_status_reporter()
    print("[API] Starting on port 5000...")
    flask_app.run(host="0.0.0.0", port=5000, debug=False, use_reloader=False)