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
    start_api
)
from database.db import init_database, direct_to_sql, get_stats

SERIAL_PORT = "COM5"
BAUD_RATE = 9600  # Match Arduino Serial.begin(9600)


_shutdown_done = False


def _normalize_packet(data):
    """Map Arduino field names to backend canonical keys."""
    if "longitude" in data and "GPS" not in data:
        data["GPS"] = data["longitude"]
    if "magnetic heading" in data:
        data["magnetic_heading"] = data["magnetic heading"]
    if "barometric pressure" in data:
        data["barometric_pressure"] = data["barometric pressure"]


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
        data = json.loads(json_packet)
        _normalize_packet(data)
        buffer_thread = threading.Thread(target=buffer_to_frontend, args=(data,))
        buffer_thread.start()
        sql_thread = threading.Thread(target=direct_to_sql, args=(data,))
        sql_thread.start()
    except json.JSONDecodeError as e:
        print(f"[PACKET ERROR] Invalid JSON: {e}")


def run_arduino_bridge():
    """Read JSON from Arduino Serial, forward to process_packet. Runs until Ctrl+C."""
    try:
        import serial
    except ImportError:
        print("Install pyserial for Arduino: pip install pyserial")
        sys.exit(1)

    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=0.01)
        print(f"[SERIAL] Connected to {SERIAL_PORT} @ {BAUD_RATE}")
    except Exception as e:
        print(f"[SERIAL] Failed to open {SERIAL_PORT}: {e}")
        sys.exit(1)

    buffer = ""
    try:
        while True:
            if ser.in_waiting:
                buffer += ser.read(ser.in_waiting).decode("utf-8", errors="ignore")
            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                line = line.strip()
                if line and line.startswith("{"):
                    try:
                        json.loads(line)
                        process_packet(line)
                    except json.JSONDecodeError:
                        pass
    except KeyboardInterrupt:
        pass
    finally:
        ser.close()


def main():
    use_arduino = "--simulator" not in sys.argv  # Arduino by default; use --simulator for fake data

    # Register crash/shutdown handler - flush last 30s to recovery_dump.json
    signal.signal(signal.SIGINT, _shutdown_handler)
    signal.signal(signal.SIGTERM, _shutdown_handler)

    print("=" * 60)
    print("ROCKET TELEMETRY BACKEND")
    print("=" * 60)

    init_database()

    api_thread = threading.Thread(target=start_api, daemon=True)
    api_thread.start()

    if use_arduino:
        print("\nArduino mode – reading from Serial")
        print("PATH 1: ARDUINO → BUFFER → API → FRONTEND")
        print("PATH 2: ARDUINO → SQL DATABASE")
        print(f"Port: {SERIAL_PORT} (edit SERIAL_PORT in main.py if wrong)\n")
        try:
            run_arduino_bridge()
        finally:
            # Flush on any exit (disconnect, error) - Ctrl+C uses signal handler
            _shutdown_handler()
    else:
        print("\nSimulator mode")
        print("PATH 1: SIMULATOR → BUFFER → API → FRONTEND (10 Hz)")
        print("PATH 2: SIMULATOR → SQL DATABASE\n")

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
