"""Canonical telemetry packet shape for buffer, SQL, and the Node bridge."""
import time

_cycle_counter = 0
MAX_GYRO_DEG_S = 500.0
MAX_ROLL_DEG = 180.0


def _sanitize_gyro_fields(out: dict) -> None:
    """Strip junk gyro / roll values from Teensy packets (no IMU wired yet)."""
    for key in ("gyro_x", "gyro_y", "gyro_z"):
        if key in out:
            try:
                v = float(out[key])
                if not (-MAX_GYRO_DEG_S <= v <= MAX_GYRO_DEG_S):
                    del out[key]
            except (TypeError, ValueError):
                del out[key]
    if "roll" in out:
        try:
            r = float(out["roll"])
            if not (-MAX_ROLL_DEG <= r <= MAX_ROLL_DEG):
                del out["roll"]
        except (TypeError, ValueError):
            del out["roll"]


def _num(value, default=0.0):
    if value is None:
        return default
    try:
        n = float(value)
        return n if n == n else default  # reject NaN
    except (TypeError, ValueError):
        return default


def normalize_packet(data: dict) -> dict:
    """Map Teensy / Arduino field names and fill required defaults."""
    global _cycle_counter

    if not isinstance(data, dict):
        raise ValueError("packet must be a dict")

    out = dict(data)

    # Field aliases (spaces, short names, legacy keys)
    alias_pairs = [
        ("magnetic heading", "magnetic_heading"),
        ("barometric pressure", "barometric_pressure"),
        ("alt", "altitude_est"),
        ("altitude", "altitude_est"),
        ("vel", "vel_est"),
        ("velocity", "vel_est"),
        ("accel", "acceleration"),
        ("volt", "voltage"),
        ("bar", "barometric_pressure"),
        ("pressure", "barometric_pressure"),
        ("longitude", "GPS"),
        ("lon", "GPS"),
        ("lat", "latitude"),
    ]
    for src, dst in alias_pairs:
        if src in out and out.get(dst) is None:
            out[dst] = out[src]

    if out.get("longitude") is not None and out.get("GPS") is None:
        out["GPS"] = out["longitude"]

    # Required numeric fields — bridge and SQL expect these
    if out.get("timestamp_ms") is None:
        out["timestamp_ms"] = int(time.time() * 1000)

    if out.get("cycles") is None:
        _cycle_counter += 1
        out["cycles"] = _cycle_counter
    else:
        try:
            out["cycles"] = int(out["cycles"])
            _cycle_counter = max(_cycle_counter, out["cycles"])
        except (TypeError, ValueError):
            _cycle_counter += 1
            out["cycles"] = _cycle_counter

    out["altitude_est"] = _num(out.get("altitude_est"))
    out["vel_est"] = _num(out.get("vel_est"))
    out["acceleration"] = _num(out.get("acceleration"))
    out["timestamp_ms"] = int(_num(out.get("timestamp_ms"), time.time() * 1000))

    _sanitize_gyro_fields(out)

    return out
