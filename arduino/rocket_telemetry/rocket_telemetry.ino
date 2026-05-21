/*
 * MASA Rocket Telemetry — Arduino test transmitter
 *
 * Sends newline-delimited JSON at 10 Hz (9600 baud).
 * MODE 0: Physics-based flight simulation (no sensors).
 * MODE 1: Fill in readSensors() for real hardware.
 *
 * Run backend (no --simulator):
 *   python backend/main/main.py
 * Set SERIAL_PORT in backend/main/main.py to your COM port.
 */

#include <math.h>

#define BAUD_RATE 9600
#define TELEMETRY_HZ 10
#define MODE 0

// Launch site (Dearborn, MI area)
const float BASE_LAT = 42.3223f;
const float BASE_LON = -83.1763f;

// --- Mission timeline (seconds) --------------------------------------------
const float T_ARMED_END = 2.0f;       // Pad, pre-launch checks
const float T_BURN_END = 6.2f;        // ~4.2 s motor burn
const float T_APOGEE = 27.0f;         // Coast to zero vertical speed
const float T_MAIN_CHUTE = 40.0f;     // Drogue/main deployment
const float T_LANDED = 50.0f;
const float T_MISSION_RESET = 55.0f;  // Loop for continuous bench testing

// --- Vehicle / motor (high-power model rocket class) -----------------------
const float BURN_ACCEL_START = 56.0f;   // m/s² peak (~5.7 g) at ignition
const float BURN_ACCEL_END = 24.0f;     // m/s² tail-off before burnout
const float DRAG_DECEL_COAST = 8.1f;    // m/s² avg drag decel during coast (tuned for apogee @ ~27 s)
const float G = 9.80665f;
const float CHUTE_ALT_M = 650.0f;
const float CHUTE_DESCENT_MS = -6.5f;   // Under canopy
const float TERMINAL_FREEfall_MS = -52.0f;

unsigned long cycle = 0;
unsigned long flightStartMs = 0;
float maxAltitudeM = 0.0f;
float headingDeg = 182.0f;

// Deterministic sensor noise (no random() — repeatable plots)
float sensorNoise(float t, int channel) {
  return sinf(t * 12.989f + channel * 78.233f);
}

float clampf(float v, float lo, float hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

float lerp(float a, float b, float u) {
  return a + (b - a) * u;
}

// Barometric pressure (hPa) from altitude — ISA scale height approx.
float baroFromAltitude(float altM) {
  return 1013.25f * expf(-altM / 8434.5f);
}

// flight_state: 0 READY, 1 BOOST, 2 ASCENT, 3 COAST, 4 DESCENT, 5 RECOVERY
void simulatedFlight(float t, float &alt, float &vel, float &accel, int &state) {
  alt = 0.0f;
  vel = 0.0f;
  accel = 0.0f;
  state = 0;

  if (t < T_ARMED_END) {
    // Pad: small vibration, no climb
    state = 0;
    alt = 0.0f;
    vel = 0.0f;
    accel = 1.2f * sensorNoise(t, 1);
    return;
  }

  if (t < T_BURN_END) {
    // Motor burn: thrust tapers as propellant burns (linear accel decay)
    float tb = t - T_ARMED_END;
    float burnT = T_BURN_END - T_ARMED_END;
    float a0 = BURN_ACCEL_START;
    float a1 = BURN_ACCEL_END;
    state = 1;
    accel = lerp(a0, a1, tb / burnT);
    vel = a0 * tb - 0.5f * (a0 - a1) * tb * tb / burnT;
    alt = a0 * tb * tb / 2.0f - (a0 - a1) * tb * tb * tb / (6.0f * burnT);
    return;
  }

  float tBurnout = T_BURN_END;
  float uBurn = (T_BURN_END - T_ARMED_END);
  float velBurnout = BURN_ACCEL_START * uBurn
      - 0.5f * (BURN_ACCEL_START - BURN_ACCEL_END) * uBurn * uBurn
      / (T_BURN_END - T_ARMED_END);
  float altBurnout = BURN_ACCEL_START * uBurn * uBurn / 2.0f
      - (BURN_ACCEL_START - BURN_ACCEL_END) * uBurn * uBurn * uBurn
      / (6.0f * (T_BURN_END - T_ARMED_END));

  if (t < T_APOGEE) {
    // Coast: velocity bleeds off from drag; altitude still increases until apogee
    float tc = t - tBurnout;
    float coastDur = T_APOGEE - tBurnout;
    state = (tc < coastDur * 0.35f) ? 2 : 3;  // ASCENT then COAST label
    vel = velBurnout - DRAG_DECEL_COAST * tc;
    if (vel < 0.0f) vel = 0.0f;
    alt = altBurnout + velBurnout * tc - 0.5f * DRAG_DECEL_COAST * tc * tc;
    accel = -DRAG_DECEL_COAST * (vel > 5.0f ? 1.0f : vel / 5.0f);
    return;
  }

  float tApogee = T_APOGEE;
  float tcMax = tApogee - tBurnout;
  float velApogee = velBurnout - DRAG_DECEL_COAST * tcMax;
  if (velApogee < 0.0f) velApogee = 0.0f;
  float altApogee = altBurnout + velBurnout * tcMax - 0.5f * DRAG_DECEL_COAST * tcMax * tcMax;

  if (t < T_MAIN_CHUTE) {
    // Ballistic descent (Z-up); body-frame accel ≈ -g plus noise
    float td = t - tApogee;
    state = 4;
    vel = -G * td;
    if (vel < TERMINAL_FREEfall_MS) vel = TERMINAL_FREEfall_MS;
    alt = altApogee + 0.5f * vel * td;  // vel negative
    if (alt < 0.0f) alt = 0.0f;
    accel = -G + 1.5f * sensorNoise(t, 2);
    return;
  }

  if (t < T_LANDED) {
    // Main chute: target ~6.5 m/s descent
    float tp = t - T_MAIN_CHUTE;
    state = 5;
    vel = CHUTE_DESCENT_MS;
    alt = CHUTE_ALT_M + CHUTE_DESCENT_MS * tp;
    if (alt < 0.0f) alt = 0.0f;
    accel = -2.2f + 0.4f * sensorNoise(t, 3);
    return;
  }

  // On ground
  state = 0;
  alt = 0.0f;
  vel = 0.0f;
  accel = 0.0f;
}

void printFloat(float v, int decimals) {
  Serial.print(v, decimals);
}

void sendTelemetryPacket() {
  cycle++;
  unsigned long nowMs = millis();
  if (flightStartMs == 0) flightStartMs = nowMs;

  float t = (nowMs - flightStartMs) / 1000.0f;
  if (t >= T_MISSION_RESET) {
    flightStartMs = nowMs;
    t = 0.0f;
    maxAltitudeM = 0.0f;
    headingDeg = 182.0f;
  }

  float alt, vel, accel;
  int flightState;
  int gx = 0, gy = 0, gz = 0;
  float voltage = 12.55f;
  float actCmd = 0.0f;
  float actMeas = 0.0f;
  int ctrlHealth = 1;

#if MODE == 0
  simulatedFlight(t, alt, vel, accel, flightState);

  if (alt > maxAltitudeM) maxAltitudeM = alt;

  // IMU gyro (deg/s) — modest rates; buffet spikes near apogee/descent
  float motion = fabsf(vel) / 220.0f + fabsf(accel) / 60.0f;
  gx = (int)(8.0f * sinf(t * 1.9f) + 6.0f * motion * sensorNoise(t, 4));
  gy = (int)(5.0f * cosf(t * 1.4f) + 4.0f * motion * sensorNoise(t, 5));
  gz = (int)(12.0f * sinf(t * 0.85f) + 18.0f * motion * sensorNoise(t, 6));

  // Heading: slow azimuth drift + slight roll coupling (deg)
  headingDeg += 0.18f * sensorNoise(t, 7) + 0.05f * gz * 0.01f;
  if (headingDeg < 0.0f) headingDeg += 360.0f;
  if (headingDeg >= 360.0f) headingDeg -= 360.0f;

  // 3S LiPo: sag under load during boost, recovers in coast
  if (flightState == 1) {
    voltage = 11.6f + 0.35f * (1.0f - (t - T_ARMED_END) / (T_BURN_END - T_ARMED_END));
  } else if (flightState == 0 && t < T_ARMED_END) {
    voltage = 12.55f;
  } else {
    voltage = 12.2f + 0.25f * (alt / max(maxAltitudeM, 1.0f));
  }
  voltage += 0.04f * sensorNoise(t, 8);

  // Airbrakes / fin canards: stowed until descent, then active control
  if (flightState == 4) {
    actCmd = clampf(0.55f + 0.25f * sensorNoise(t, 9), 0.0f, 1.0f);
    actMeas = actCmd - 0.02f + 0.03f * sensorNoise(t, 10);
  } else if (flightState == 5) {
    actCmd = 0.15f;
    actMeas = 0.14f;
  }

  // Rare controller fault flag during high-vibration boost
  if (flightState == 1 && sensorNoise(t, 11) > 0.98f) {
    ctrlHealth = 0;
  }
#else
  readSensors(alt, vel, accel, flightState, headingDeg, gx, gy, gz, voltage, actCmd, actMeas);
#endif

  // Sensor noise on kinematics (GPS/barometer class)
  float altMeas = alt + 0.8f * sensorNoise(t, 12);
  float velMeas = vel + 0.4f * sensorNoise(t, 13);
  float accelMeas = accel + 0.25f * sensorNoise(t, 14);
  if (altMeas < 0.0f) altMeas = 0.0f;

  float baro = baroFromAltitude(altMeas) + 0.2f * sensorNoise(t, 15);

  // Ground track ~ horizontal speed from velocity vector (small lat/lon drift)
  float horizMs = fabsf(velMeas) * 0.12f;
  float lat = BASE_LAT + (horizMs * t * 8.9e-6f);
  float lon = BASE_LON + (horizMs * t * 11.3e-6f) + 0.00002f * sensorNoise(t, 16);

  float apogeePred = maxAltitudeM * 1.01f + 0.5f * sensorNoise(t, 17);

  Serial.print('{');
  Serial.print("\"timestamp_ms\":");
  Serial.print(nowMs);
  Serial.print(",\"flight_state\":");
  Serial.print(flightState);
  Serial.print(",\"act_cmd\":");
  printFloat(actCmd, 3);
  Serial.print(",\"act_meas\":");
  printFloat(actMeas, 3);
  Serial.print(",\"ctrl_health\":");
  Serial.print(ctrlHealth);
  Serial.print(",\"altitude_est\":");
  printFloat(altMeas, 2);
  Serial.print(",\"vel_est\":");
  printFloat(velMeas, 2);
  Serial.print(",\"apogee_pred\":");
  printFloat(apogeePred, 1);
  Serial.print(",\"GPS\":");
  printFloat(lon, 6);
  Serial.print(",\"latitude\":");
  printFloat(lat, 6);
  Serial.print(",\"acceleration\":");
  printFloat(accelMeas, 2);
  Serial.print(",\"magnetic_heading\":");
  printFloat(headingDeg, 1);
  Serial.print(",\"barometric_pressure\":");
  printFloat(baro, 2);
  Serial.print(",\"cycles\":");
  Serial.print(cycle);
  Serial.print(",\"voltage\":");
  printFloat(voltage, 2);
  Serial.print(",\"gyro_x\":");
  Serial.print(gx);
  Serial.print(",\"gyro_y\":");
  Serial.print(gy);
  Serial.print(",\"gyro_z\":");
  Serial.print(gz);
  Serial.println('}');
}

#if MODE == 1
void readSensors(float &alt, float &vel, float &accel, int &flightState,
                 float &heading, int &gx, int &gy, int &gz,
                 float &voltage, float &actCmd, float &actMeas) {
  alt = 0;
  vel = 0;
  accel = 0;
  flightState = 0;
  heading = 0;
  gx = gy = gz = 0;
  voltage = 12.0f;
  actCmd = 0;
  actMeas = 0;
}
#endif

void setup() {
  Serial.begin(BAUD_RATE);
  while (!Serial && millis() < 3000) {
    ;
  }
  delay(300);
}

void loop() {
  sendTelemetryPacket();
  delay(1000 / TELEMETRY_HZ);
}
