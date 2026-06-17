
import math
import threading
from collections import deque

G = 9.80665
RHO0 = 1.225          # sea-level air density kg/m^3
SCALE_HEIGHT = 8400.0


def _fmt_clock(seconds):
    s = max(0, int(round(seconds)))
    return f"{s // 60:02d}:{s % 60:02d}"


class EventDescriber:
    def __init__(self, predictor=None):
        self.lock = threading.Lock()
        self.predictor = predictor
        self.t0 = None
        self.events = []           # {t, type, label, tone, description}
        self.seen = set()
        self.prev = None           # previous (t, alt, vel, accel)
        self.max_q = (0.0, 0.0, 0.0)   # (q, t, alt)
        self.max_alt = 0.0
        self.last_status_t = -1e9
        self.landed = False
        self.vel_trail = deque()   # (t, vel) over the last ~1.2 s

    # ------------------------------------------------------------------ input
    def update(self, packet):
        try:
            ts = float(packet.get("timestamp_ms"))
            alt = float(packet.get("altitude_est"))
            vel = float(packet.get("vel_est"))
        except (TypeError, ValueError):
            return
        accel = packet.get("acceleration")
        accel = float(accel) if isinstance(accel, (int, float)) else None

        with self.lock:
            if self.t0 is None:
                self.t0 = ts
                self._emit(0.0, "armed", "System Armed", "good",
                           "Telemetry link established. Flight computer is armed and streaming — all systems standing by for launch.")
            t = (ts - self.t0) / 1000.0
            self.max_alt = max(self.max_alt, alt)

            # dynamic pressure q = 0.5 * rho(alt) * v^2  (max-Q detection)
            q = 0.5 * RHO0 * math.exp(-max(alt, 0.0) / SCALE_HEIGHT) * vel * vel
            if vel > 0 and q > self.max_q[0]:
                self.max_q = (q, t, alt)

            self._detect(t, alt, vel, accel)
            self._periodic_status(t, alt, vel)
            self.prev = (t, alt, vel, accel)

    # -------------------------------------------------------------- detection
    def _detect(self, t, alt, vel, accel):
        prev = self.prev

        # Launch: strong upward acceleration or sudden climb from the pad.
        if "launch" not in self.seen and (vel > 15 or alt > 10):
            a_txt = f" pulling {accel / G:.1f} g off the pad" if accel else ""
            self._emit(t, "launch", "Launch Detected", "good",
                       f"Liftoff! The vehicle has left the pad{a_txt}. Now passing {alt:.0f} m at {vel:.0f} m/s.")
            self.seen.add("launch")

        # Burnout: acceleration flips from strongly positive to negative
        # while still climbing fast.
        if ("launch" in self.seen and "burnout" not in self.seen
                and prev and accel is not None and prev[3] is not None
                and prev[3] > 5 and accel < 0 and vel > 40):
            self._emit(t, "burnout", "Motor Burnout", "info",
                       f"Motor burnout at {alt:.0f} m. Peak velocity {vel:.0f} m/s — the vehicle is now coasting on momentum against gravity and drag.")
            self.seen.add("burnout")

        # Max Q: dynamic pressure has clearly passed its peak.
        if ("launch" in self.seen and "maxq" not in self.seen and vel > 0
                and self.max_q[0] > 500 and self.max_q[0] > 0):
            q_now = 0.5 * RHO0 * math.exp(-max(alt, 0.0) / SCALE_HEIGHT) * vel * vel
            if q_now < self.max_q[0] * 0.8:
                self._emit(self.max_q[1], "maxq", "Max Q Passed", "info",
                           f"Maximum dynamic pressure of {self.max_q[0] / 1000:.1f} kPa endured at {self.max_q[2]:.0f} m — the worst structural loading of the flight is behind us.")
                self.seen.add("maxq")

        # Apogee: velocity crosses from positive to negative high up.
        if ("launch" in self.seen and "apogee" not in self.seen
                and prev and prev[2] > 0 and vel <= 0 and self.max_alt > 50):
            extra = ""
            pred = self._predicted_apogee()
            if pred:
                delta = (self.max_alt - pred) / pred * 100.0
                if abs(delta) < 1.0:
                    extra = " That is right on the model's prediction."
                else:
                    extra = f" That is {abs(delta):.1f}% {'above' if delta >= 0 else 'below'} the model's prediction."
            self._emit(t, "apogee", "Apogee Detected", "warn",
                       f"Apogee! Peak altitude {self.max_alt:.0f} m reached at T+{_fmt_clock(t)}.{extra} The vehicle is tipping over into descent.")
            self.seen.add("apogee")

        # Chute deploy: during descent, the fall slows sharply over ~1 s.
        # A windowed comparison (not packet-to-packet delta) rejects sensor noise.
        self.vel_trail.append((t, vel))
        while self.vel_trail and t - self.vel_trail[0][0] > 1.2:
            self.vel_trail.popleft()
        if ("apogee" in self.seen and not self.landed and alt > 30
                and vel < 0 and len(self.vel_trail) > 4):
            t_old, v_old = self.vel_trail[0]
            window = t - t_old
            slowed = vel - v_old   # positive => decelerating the fall
            if window > 0.8 and slowed > 8 and v_old < -8:
                if "drogue" not in self.seen:
                    self._emit(t, "drogue", "Drogue Chute Deployed", "info",
                               f"Sharp deceleration detected at {alt:.0f} m — drogue chute is out. Descent rate stabilising near {abs(vel):.0f} m/s.")
                    self.seen.add("drogue")
                    self.vel_trail.clear()
                elif "main" not in self.seen and alt < self.max_alt * 0.5:
                    self._emit(t, "main", "Main Chute Deployed", "info",
                               f"Main chute deployment at {alt:.0f} m. Descent slowed to {abs(vel):.0f} m/s for a soft recovery.")
                    self.seen.add("main")
                    self.vel_trail.clear()

        # Landing: near the ground, descent stopped.
        if ("apogee" in self.seen and not self.landed
                and alt < 15 and abs(vel) < 3):
            self._emit(t, "landing", "Touchdown", "good",
                       f"Touchdown at T+{_fmt_clock(t)}. Flight complete — peak altitude {self.max_alt:.0f} m. Recovery team is go.")
            self.landed = True

    def _predicted_apogee(self):
        if not self.predictor:
            return None
        try:
            p = self.predictor.get_predictions()
            return p.get("apogee_m") if p.get("ready") else None
        except Exception:
            return None

    # -------------------------------------------------- periodic status lines
    def _periodic_status(self, t, alt, vel):
        if self.landed or t - self.last_status_t < 8.0 or "launch" not in self.seen:
            return
        self.last_status_t = t

        if vel > 2:
            line = f"Climbing through {alt:.0f} m at {vel:.0f} m/s."
            pred = self._predicted_apogee()
            if pred:
                line += f" The model projects apogee near {pred:.0f} m."
        elif vel < -2:
            eta = alt / max(-vel, 1.0)
            line = f"Descending through {alt:.0f} m at {abs(vel):.0f} m/s — ground contact in roughly {eta:.0f} s."
        else:
            line = f"Holding near {alt:.0f} m."
        self._emit(t, "status", "Status", "muted", line, transient=True)

    # ------------------------------------------------------------------ emit
    def _emit(self, t, etype, label, tone, description, transient=False):
        self.events.append({
            "t": round(t, 1),
            "clock": _fmt_clock(t),
            "type": etype,
            "label": label,
            "tone": tone,
            "description": description,
            "transient": transient,
        })
        # keep the log bounded; drop the oldest transient lines first
        if len(self.events) > 60:
            for i, e in enumerate(self.events):
                if e["transient"]:
                    del self.events[i]
                    break
            else:
                del self.events[0]
        print(f"[NARRATOR] T+{_fmt_clock(t)} {label}: {description}")

    # ----------------------------------------------------------------- output
    def get_events(self):
        with self.lock:
            return list(self.events)
