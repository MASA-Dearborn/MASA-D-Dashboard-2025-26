# backend/main/main.py
import sys
import os
import json
import signal
import threading

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from simulator.simulator import rocket_simulator
from data_processor.buffer import (
    buffer_to_frontend,
    telemetry_buffer,
    start_api,
)
from database.db import init_database, direct_to_sql, get_stats
from packet_normalize import normalize_packet

SERIAL_PORT = os.environ.get("MASA_SERIAL_PORT", "COM6")
BAUD_RATE = int(os.environ.get("MASA_SERIAL_BAUD", "115200"))

_shutdown_done = False


def _extract_json_line(line):
    """Pull a JSON object from a serial line (handles prefix noise)."""
    line = line.strip()
    if not line:
        return None
    start = line.find("{")
    end = line.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return line[start : end + 1]


def _shutdown_handler(signum=None, frame=None):
    """Flush recovery buffer on crash/shutdown - don't lose last 30s of data."""
    global _shutdown_done
    if _shutdown_done:
        sys.exit(0)
    _shutdown_done = True
    print("\n[SHUTDOWN] Flushing recovery buffer...")
    telemetry_buffer.flush_for_shutdown()
    telemetry_buffer.dump_buffer()
    telemetry_buffer.stop()
    print("[SHUTDOWN] Done.")
    sys.exit(0)


def process_packet(json_packet):
    try:
        raw = json.loads(json_packet) if isinstance(json_packet, str) else json_packet
        data = normalize_packet(raw)
        payload = json.dumps(data)
        buffer_thread = threading.Thread(target=buffer_to_frontend, args=(payload,))
        buffer_thread.start()
        sql_thread = threading.Thread(target=direct_to_sql, args=(data,))
        sql_thread.start()
    except (json.JSONDecodeError, ValueError) as e:
        print(f"[PACKET ERROR] Invalid packet: {e}")


def run_arduino_bridge():
    """Read JSON from Teensy serial, forward to process_packet. Runs until Ctrl+C."""
    try:
        import serial
    except ImportError:
        print("Install pyserial for Teensy: pip install pyserial")
        sys.exit(1)

    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=0.01)
        print(f"[SERIAL] Connected to {SERIAL_PORT} @ {BAUD_RATE}")
    except Exception as e:
        print(f"[SERIAL] Failed to open {SERIAL_PORT}: {e}")
        print("[SERIAL] Close Serial Monitor or any app using this port.")
        sys.exit(1)

    buffer = ""
    try:
        while True:
            if ser.in_waiting:
                buffer += ser.read(ser.in_waiting).decode("utf-8", errors="ignore")
            buffer = buffer.replace("\r\n", "\n").replace("\r", "\n")
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                json_line = _extract_json_line(line)
                if json_line:
                    process_packet(json_line)
    except KeyboardInterrupt:
        pass
    finally:
        ser.close()


def main():
    use_arduino = "--simulator" not in sys.argv

    signal.signal(signal.SIGINT, _shutdown_handler)
    signal.signal(signal.SIGTERM, _shutdown_handler)

    print("=" * 60)
    print("ROCKET TELEMETRY BACKEND")
    print("=" * 60)

    init_database()

    api_thread = threading.Thread(target=start_api, daemon=True)
    api_thread.start()

    if use_arduino:
        print("\nTeensy mode - reading from Serial")
        print("PATH 1: TEENSY -> BUFFER -> API -> FRONTEND")
        print("PATH 2: TEENSY -> SQL DATABASE")
        print(f"Port: {SERIAL_PORT} @ {BAUD_RATE} (MASA_SERIAL_PORT / MASA_SERIAL_BAUD)\n")
        try:
            run_arduino_bridge()
        finally:
            _shutdown_handler()
    else:
        print("\nSimulator mode")
        print("PATH 1: SIMULATOR -> BUFFER -> API -> FRONTEND (10 Hz)")
        print("PATH 2: SIMULATOR -> SQL DATABASE\n")

        sim_thread = threading.Thread(target=rocket_simulator, args=(process_packet,))
        sim_thread.start()
        sim_thread.join()

        telemetry_buffer.flush_for_shutdown()
        telemetry_buffer.dump_buffer()
        telemetry_buffer.stop()

        stats = get_stats()
        print("\n" + "=" * 60)
        print("SIMULATION COMPLETE")
        print("=" * 60)
        print(f"Total packets in SQL: {stats['total_packets']}")
        print(f"Maximum altitude: {stats['max_altitude']:.2f}m")


if __name__ == "__main__":
    main()
