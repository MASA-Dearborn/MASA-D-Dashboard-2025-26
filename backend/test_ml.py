import math
import random
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from ml import FlightPredictor, EventDescriber

G = 9.80665
K = 0.0008  # true drag constant


def simulate():
    pred = FlightPredictor()
    desc = EventDescriber(predictor=pred)

    t, dt = 0.0, 0.05
    alt, vel = 0.0, 0.0
    phase = "pad"
    burn_end = 4.0
    true_apogee = None
    checked = False

    while t < 120:
        if phase == "pad" and t > 1.0:
            phase = "boost"
        if phase == "boost":
            a = 70.0 - G - K * vel * abs(vel)
            if t > burn_end:
                phase = "coast"
        if phase == "coast":
            a = -G - K * vel * abs(vel)
            if vel <= 0:
                phase = "freefall"
                true_apogee = alt
                t_apogee = t
        if phase == "freefall":
            a = -G - K * vel * abs(vel)
            if t - t_apogee > 4.0:
                phase = "descent"  # drogue out
        if phase == "descent":
            a = -G - 0.0157 * vel * abs(vel)
            if alt <= 0:
                alt, vel, a = 0.0, 0.0, 0.0
                phase = "landed"
        if phase == "pad" or phase == "landed":
            a = 0.0
            vel = 0.0

        vel += a * dt
        alt = max(0.0, alt + vel * dt)

        packet = {
            "timestamp_ms": int(t * 1000),
            "flight_state": {"pad": 0, "boost": 1, "coast": 2, "freefall": 4, "descent": 4, "landed": 5}[phase],
            "altitude_est": round(alt + random.uniform(-2, 2), 2),
            "vel_est": round(vel + random.uniform(-1, 1), 2),
            "acceleration": round(a + random.uniform(-0.5, 0.5), 2),
            "voltage": round(12.4 - t * 0.004 + random.uniform(-0.02, 0.02), 3),
            "barometric_pressure": round(1013.25 * math.exp(-alt / 8400) + random.uniform(-0.5, 0.5), 2),
        }
        pred.update(packet)
        desc.update(packet)

        # mid-coast prediction check
        if phase == "coast" and vel < 100 and not checked:
            p = pred.get_predictions()
            print(f"\n--- mid-coast @ t={t:.1f}s alt={alt:.0f} vel={vel:.0f} ---")
            print(f"  predicted apogee: {p['apogee_m']} m (eta {p['apogee_eta_s']} s, "
                  f"source={p['apogee_source']}, conf={p['confidence']})")
            checked = True
            mid_pred = p["apogee_m"]

        t += dt

    p = pred.get_predictions()
    print(f"\n--- end of flight ---")
    print(f"  true apogee:      {true_apogee:.0f} m")
    print(f"  final max alt:    {p['max_altitude_m']} m")
    print(f"  battery est left: {p['battery_minutes_left']} min")
    print(f"  drag k learned:   {p['drag_coefficient']} (true {K})")
    print(f"  anomalies: {len(p['anomalies'])}")
    print(f"\n  events:")
    for e in desc.get_events():
        if not e["transient"]:
            print(f"   T+{e['clock']} [{e['label']}] {e['description']}")


if __name__ == "__main__":
    simulate()
