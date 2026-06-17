import time
import random
import math
import json
import threading

# ---------------------------------------------------------------------------
# Physically consistent rocket flight simulator.
#
# Integrates real equations of motion at packet rate, so altitude, velocity,
# acceleration and barometric pressure always agree with each other (the old
# piecewise profile had a 1 km discontinuity at apogee):
#   boost:   a = thrust - g - k*v|v|
#   coast:   a = -g - k*v|v|
#   drogue:  a = -g - k_drogue*v|v|   (terminal ~25 m/s)
#   main:    a = -g - k_main*v|v|     (terminal ~6.5 m/s, below 260 m)
# `apogee_pred` is the flight computer's own naive no-drag estimate
# (alt + v^2/2g) — intentionally simpler than the ground-station ML model.
# ---------------------------------------------------------------------------

# CONFIG
PACKET_RATE_HZ = 20
DT = 1 / PACKET_RATE_HZ
PACKET_DROP_PROBABILITY = 0.005  # 0.5%

G = 9.80665
BURN_SEC = 4.2
THRUST_ACCEL = 78.0       # m/s^2 net thrust acceleration during burn
K_COAST = 0.00085         # drag constant CdA*rho/(2m)
K_DROGUE = 0.0155
K_MAIN = 0.25
DROGUE_DELAY_SEC = 2.5    # freefall after apogee before drogue fires
MAIN_DEPLOY_ALT = 260.0
LANDED_DWELL_SEC = 5.0    # keep transmitting a few seconds after touchdown

SEA_LEVEL_HPA = 1013.25
SCALE_HEIGHT_M = 8400.0

BASE_LON = -102.0779

# flight_state codes (match mapTelemetryPacket.js FLIGHT_STATE_PHASE)
STATE_READY = 0
STATE_BOOST = 1
STATE_ASCENT = 2   # coast
STATE_COAST = 3
STATE_DESCENT = 4
STATE_RECOVERY = 5


class FlightModel:
    def __init__(self):
        self.t = 0.0
        self.alt = 0.0
        self.vel = 0.0
        self.accel = 0.0
        self.phase = "boost"
        self.apogee_t = None
        self.landed_t = None
        self.spin = 0.0
        self.roll_rate = 0.0
        self.heading = 212.0
        self.downrange = 0.0
        self.drain = 0.0   # cumulative battery drain, volts
        self.sag = 0.0     # transient load sag, volts
        self.voltage = 12.55

    def step(self, dt):
        self.t += dt
        a = 0.0

        if self.phase == "boost":
            burn_frac = self.t / BURN_SEC
            thrust = THRUST_ACCEL * (1 - (burn_frac - 0.8) * 3 if burn_frac > 0.8 else 1)
            a = thrust - G - K_COAST * self.vel * abs(self.vel)
            self.spin = min(220.0, self.spin + 70 * dt)   # deg/s fin-induced spin
            if self.t >= BURN_SEC:
                self.phase = "coast"
        elif self.phase == "coast":
            a = -G - K_COAST * self.vel * abs(self.vel)
            self.spin *= 1 - 0.10 * dt
            if self.vel <= 0:
                self.phase = "freefall"
                self.apogee_t = self.t
        elif self.phase == "freefall":
            a = -G - K_COAST * self.vel * abs(self.vel)
            if self.t - self.apogee_t >= DROGUE_DELAY_SEC:
                self.phase = "drogue"
        elif self.phase == "drogue":
            a = -G - K_DROGUE * self.vel * abs(self.vel)
            self.spin *= 1 - 0.6 * dt
            if self.alt <= MAIN_DEPLOY_ALT:
                self.phase = "main"
        elif self.phase == "main":
            a = -G - K_MAIN * self.vel * abs(self.vel)
            self.spin *= 1 - 0.9 * dt

        if self.phase != "landed":
            self.vel += a * dt
            self.alt += self.vel * dt
            self.accel = a
            if self.alt <= 0 and self.vel < 0:
                self.alt = 0.0
                self.vel = 0.0
                self.accel = 0.0
                self.spin = 0.0
                self.phase = "landed"
                self.landed_t = self.t

        # heading drifts slowly; descent wind carries the vehicle downrange
        self.heading = (self.heading + 1.2 * dt + random.uniform(-0.3, 0.3)) % 360
        if self.vel < 0 and self.alt > 0:
            self.downrange += 6.5 * dt
        elif self.phase in ("boost", "coast"):
            self.downrange += max(0.0, self.vel) * 0.06 * dt

        # battery: ~0.35 V transient sag under boost current (recovers after
        # burnout) plus a slow ~2 mV/s permanent drain (3S LiPo behaviour)
        sag_target = 0.35 if self.phase == "boost" else 0.0
        self.sag += (sag_target - self.sag) * min(1.0, dt / 0.8)
        self.drain += 0.002 * dt
        self.voltage = 12.55 - self.drain - self.sag

    @property
    def flight_state(self):
        return {
            "boost": STATE_BOOST,
            "coast": STATE_ASCENT,
            "freefall": STATE_DESCENT,
            "drogue": STATE_DESCENT,
            "main": STATE_DESCENT,
            "landed": STATE_RECOVERY,
        }[self.phase]

    @property
    def done(self):
        return self.phase == "landed" and (self.t - self.landed_t) > LANDED_DWELL_SEC

    def onboard_apogee_pred(self):
        """The FC's naive no-drag estimate — what a real altimeter would telemeter."""
        if self.vel > 0:
            return self.alt + self.vel * self.vel / (2 * G)
        return self.alt if self.apogee_t is None else None


def generate_packet(model, cycle):
    alt = max(0.0, model.alt + random.uniform(-1.2, 1.2))
    baro = SEA_LEVEL_HPA * math.exp(-alt / SCALE_HEIGHT_M) + random.uniform(-0.35, 0.35)
    apogee_pred = model.onboard_apogee_pred()

    packet = {
        "timestamp_ms": int(time.time() * 1000),
        "flight_state": model.flight_state,
        "act_cmd": round(random.uniform(0, 1), 3),
        "act_meas": round(random.uniform(0, 1), 3),
        "ctrl_health": 1,
        "altitude_est": round(alt, 2),
        "vel_est": round(model.vel + random.uniform(-0.6, 0.6), 2),
        "apogee_pred": round(apogee_pred, 1) if apogee_pred is not None else None,
        "GPS": round(BASE_LON - (model.downrange / 111320.0) * 0.82, 6),
        "acceleration": round(model.accel + random.uniform(-0.4, 0.4), 2),
        "magnetic_heading": round(model.heading, 1),
        "barometric_pressure": round(baro, 2),
        "cycles": cycle,
        "voltage": round(model.voltage + random.uniform(-0.015, 0.015), 2),
        # gyro in deg/s: z carries the roll spin, x/y small coning wobble
        "gyro_x": round(random.uniform(-12, 12), 1),
        "gyro_y": round(random.uniform(-12, 12), 1),
        "gyro_z": round(model.spin + random.uniform(-4, 4), 1),
    }
    return packet


def rocket_simulator(backend_callback):
    """
    Rocket simulator with integrated virtual LoRa channel.
    Sends packets directly to backend processor via callback. Runs one full
    flight (boost -> coast -> apogee -> drogue -> main -> touchdown).

    Args:
        backend_callback: Function to call with JSON packet string
    """
    stop_event = threading.Event()
    model = FlightModel()
    cycle = 0

    while not model.done:
        cycle += 1
        model.step(DT)

        if random.random() < PACKET_DROP_PROBABILITY:
            print(f"[DROP] Packet {cycle}")
            time.sleep(DT)
            continue

        packet = generate_packet(model, cycle)
        backend_callback(json.dumps(packet))
        print(f"[ROCKET TX] Packet {cycle} t={model.t:.1f}s alt={model.alt:.0f}m phase={model.phase}")

        time.sleep(DT)

    stop_event.set()
    print("\n[SIMULATOR] Transmission complete.")
