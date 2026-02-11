import time
import random
import math
import json
import threading

# CONFIG
RUN_TIME_SEC = 30
PACKET_RATE_HZ = 20
DT = 1 / PACKET_RATE_HZ
PACKET_DROP_PROBABILITY = 0.005  # 0.5%

# SENSOR NAMES
SENSORS = [
    "timestamp_ms",
    "flight_state",
    "act_cmd",
    "act_meas",
    "ctrl_health",
    "altitude_est",
    "vel_est",
    "apogee_pred",
    "GPS",
    "acceleration",
    "magnetic_heading",
    "barometric_pressure",
    "cycles",
    "voltage",
    "gyro_x",
    "gyro_y",
    "gyro_z",
]

def flight_profile(t):
    if t < 5:
        alt = 0.5 * 60 * t**2
        vel = 60 * t
        accel = 60
        state = 1
    elif t < 20:
        alt = 750 + 250 * (t - 5)
        vel = 250 - 10 * (t - 5)
        accel = -10
        state = 2
    else:
        alt = max(0, 3500 - 120 * (t - 20))
        vel = -120
        accel = -9.8
        state = 4
    
    return alt, vel, accel, state

# LORA PACKET GENERATOR
def generate_packet(cycle, t):
    alt, vel, accel, state = flight_profile(t)
    
    baro = 1013.25 * math.exp(-alt / 8400) + random.uniform(-1, 1)
    heading = (180 + random.uniform(-5, 5)) % 360
    
    packet = {
        "timestamp_ms": int(time.time() * 1000),
        "flight_state": state,
        "act_cmd": round(random.uniform(0, 1), 3),
        "act_meas": round(random.uniform(0, 1), 3),
        "ctrl_health": random.choice([0, 1]),
        "altitude_est": round(alt + random.uniform(-2, 2), 2),
        "vel_est": round(vel + random.uniform(-1, 1), 2),
        "apogee_pred": 3500.0,
        "GPS": round(-102.0779 + random.uniform(-0.01, 0.01), 6),
        "acceleration": round(accel + random.uniform(-0.5, 0.5), 2),
        "magnetic_heading": round(heading, 1),
        "barometric_pressure": round(baro, 2),
        "cycles": cycle,
        "voltage": round(random.uniform(11.5, 12.6), 2),
        "gyro_x": random.randint(-200, 200),
        "gyro_y": random.randint(-200, 200),
        "gyro_z": random.randint(-200, 200),
    }
    
    return packet

def rocket_simulator(backend_callback):
    """
    Rocket simulator with integrated virtual LoRa channel.
    Sends packets directly to backend processor via callback.
    
    Args:
        backend_callback: Function to call with JSON packet string
    """
    stop_event = threading.Event()
    start_time = time.time()
    cycle = 0
    
    while time.time() - start_time < RUN_TIME_SEC:
        cycle += 1
        t = time.time() - start_time
        
        if random.random() < PACKET_DROP_PROBABILITY:
            print(f"[DROP] Packet {cycle}")
            time.sleep(DT)
            continue
        
        packet = generate_packet(cycle, t)
        json_packet = json.dumps(packet)
        
        backend_callback(json_packet)
        print(f"[ROCKET TX] Packet {cycle}")
        
        time.sleep(DT)
    
    stop_event.set()
    print(f"\n[SIMULATOR] Transmission complete.")