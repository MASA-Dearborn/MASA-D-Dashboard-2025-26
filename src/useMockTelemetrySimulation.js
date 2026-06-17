import { useEffect, useRef, useState } from 'react';

// Physically consistent mock flight. Unlike the old hand-tuned curves, this
// integrates real equations of motion every tick so altitude, velocity,
// acceleration, barometric pressure and the derived AI predictions all agree
// with each other:
//   boost:   a = thrust/m - g - k·v|v|     (motor burns for BURN_SEC)
//   coast:   a = -g - k·v|v|
//   drogue:  a = -g - k_drogue·v|v|        (deployed shortly after apogee)
//   main:    a = -g - k_main·v|v|          (deployed below MAIN_DEPLOY_ALT)
// Pressure follows the ISA barometric formula, voltage sags under boost
// current draw, temperatures follow motor heat with exponential cooling.

const G = 9.80665;
const TICK_MS = 100;
const DT = TICK_MS / 1000;

const COUNTDOWN_SEC = 10;
const BURN_SEC = 4.2;
const THRUST_ACCEL = 78; // m/s² of thrust over weight during burn
const K_COAST = 0.00085; // ballistic drag constant (CdA·rho / 2m)
const K_DROGUE = 0.0155; // terminal velocity ≈ sqrt(g/k) ≈ 25 m/s
const K_MAIN = 0.25; // terminal velocity ≈ 6.3 m/s
const DROGUE_DELAY_SEC = 2.5; // freefall after apogee before drogue fires
const MAIN_DEPLOY_ALT = 260;
const RECYCLE_PAD_SEC = 12; // dwell on the ground before the demo loops

const BASE_LAT = 42.3223;
const BASE_LON = -83.1763;
const SEA_LEVEL_HPA = 1013.25;
const SCALE_HEIGHT_M = 8400;

const PHASE_STATE = {
  pad: 'ARMED',
  boost: 'BOOST',
  coast: 'COAST',
  freefall: 'DESCENT',
  drogue: 'DESCENT',
  main: 'DESCENT',
  landed: 'RECOVERY',
};

function noise(magnitude) {
  return (Math.random() * 2 - 1) * magnitude;
}

function createFlight() {
  return {
    t: -COUNTDOWN_SEC, // mission clock, seconds
    alt: 0,
    vel: 0, // vertical velocity, signed (m/s)
    accel: 0, // net vertical acceleration (m/s²)
    phase: 'pad',
    apogeeT: null,
    landedT: null,
    burnHeat: 0, // motor thermal state, decays after burnout
    spin: 0, // roll rate deg/s, induced by boost, damped after
    roll: 0,
    heading: 212,
    downrange: 0, // metres, drifts with wind during descent
    drain: 0, // cumulative battery drain, volts
    sag: 0, // transient load sag, volts
  };
}

// One physics step. Mutates and returns the flight state.
function step(f) {
  f.t += DT;

  if (f.phase === 'pad') {
    if (f.t >= 0) f.phase = 'boost';
  }

  let a = 0;
  switch (f.phase) {
    case 'boost': {
      // thrust tail-off in the last 20% of the burn
      const burnFrac = f.t / BURN_SEC;
      const thrust = THRUST_ACCEL * (burnFrac > 0.8 ? 1 - (burnFrac - 0.8) * 3 : 1);
      a = thrust - G - K_COAST * f.vel * Math.abs(f.vel);
      f.burnHeat = Math.min(1, f.burnHeat + DT / BURN_SEC);
      f.spin = Math.min(40, f.spin + 14 * DT); // launch-rail + fin-induced spin
      if (f.t >= BURN_SEC) f.phase = 'coast';
      break;
    }
    case 'coast': {
      a = -G - K_COAST * f.vel * Math.abs(f.vel);
      f.spin *= 1 - 0.12 * DT;
      if (f.vel <= 0) {
        f.phase = 'freefall';
        f.apogeeT = f.t;
      }
      break;
    }
    case 'freefall': {
      a = -G - K_COAST * f.vel * Math.abs(f.vel);
      if (f.t - f.apogeeT >= DROGUE_DELAY_SEC) f.phase = 'drogue';
      break;
    }
    case 'drogue': {
      a = -G - K_DROGUE * f.vel * Math.abs(f.vel);
      f.spin *= 1 - 0.5 * DT;
      if (f.alt <= MAIN_DEPLOY_ALT) f.phase = 'main';
      break;
    }
    case 'main': {
      a = -G - K_MAIN * f.vel * Math.abs(f.vel);
      f.spin *= 1 - 0.8 * DT;
      break;
    }
    default:
      a = 0;
  }

  if (f.phase !== 'pad' && f.phase !== 'landed') {
    f.vel += a * DT;
    f.alt += f.vel * DT;
    f.accel = a;
    if (f.alt <= 0 && f.vel < 0) {
      f.alt = 0;
      f.vel = 0;
      f.accel = 0;
      f.phase = 'landed';
      f.landedT = f.t;
      f.spin = 0;
    }
  }

  // Motor cools exponentially once the burn ends.
  if (f.phase !== 'boost') f.burnHeat *= 1 - 0.018 * DT * 10;

  // Roll integrates the spin rate; heading weathervanes slightly with descent wind.
  f.roll += f.spin * DT;
  if (f.roll > 180) f.roll -= 360;
  if (f.roll < -180) f.roll += 360;
  const wind = f.vel < 0 ? 1.6 : 0.4;
  f.heading = (f.heading + wind * DT * 4 + noise(0.4)) % 360;

  // Descent wind drift carries the vehicle downrange (used for GPS).
  if (f.vel < 0 && f.alt > 0) f.downrange += 6.5 * DT;
  else if (f.phase === 'boost' || f.phase === 'coast') f.downrange += Math.max(0, f.vel) * 0.06 * DT;

  // Battery: ~0.35 V transient sag under boost current, recovers after
  // burnout; on top of a slow ~2 mV/s permanent drain (3S LiPo behaviour).
  const sagTarget = f.phase === 'boost' ? 0.35 : 0;
  f.sag += (sagTarget - f.sag) * Math.min(1, DT / 0.8);
  f.drain += 0.002 * DT;
  f.voltage = 12.55 - f.drain - f.sag;

  // Loop the demo a while after touchdown.
  if (f.phase === 'landed' && f.t - f.landedT > RECYCLE_PAD_SEC) {
    return createFlight();
  }
  return f;
}

function toPacket(f) {
  const alt = Math.max(0, f.alt + noise(1.2));
  const speed = Math.abs(f.vel) + noise(0.6);
  const baro = SEA_LEVEL_HPA * Math.exp(-alt / SCALE_HEIGHT_M) + noise(0.35);
  // Downrange drift in degrees (~111 km per degree).
  const lonDelta = (f.downrange / 111320) * 0.82;
  const latDelta = (f.downrange / 111320) * 0.57;

  return {
    missionTime: f.t,
    flightPhase: PHASE_STATE[f.phase],
    alt,
    velocity: Math.max(0, speed),
    acceleration: f.accel + noise(0.4),
    vol: Math.round((f.voltage + noise(0.015)) * 100) / 100,
    bar: Math.round(baro * 100) / 100,
    magneticHeading: (f.heading + 360) % 360,
    roll: f.roll + noise(0.5),
    lat: BASE_LAT + latDelta,
    long: BASE_LON - lonDelta,
    packetDropped: Math.random() < 0.04 ? 1 : 0,
    ctrlHealth: 1,
    // Thermals: motor heat + avionics/battery self-heating, °C.
    motorTemp: 24 + f.burnHeat * 46 + noise(0.3),
    avionicsTemp: 29 + f.burnHeat * 6 + Math.min(8, Math.max(0, f.t) * 0.06) + noise(0.2),
    batteryTemp: 31 + f.burnHeat * 4 + Math.min(6, Math.max(0, f.t) * 0.05) + noise(0.2),
  };
}

export default function useMockTelemetrySimulation(enabled = true) {
  const flightRef = useRef(null);
  const lastTickRef = useRef(null);
  const accumulatorRef = useRef(0);
  const [telemetry, setTelemetry] = useState(null);

  useEffect(() => {
    if (!enabled) return undefined;

    if (!flightRef.current) flightRef.current = createFlight();
    lastTickRef.current = performance.now();

    // Integrate by wall-clock elapsed time in fixed DT substeps, so the
    // flight stays real-time even when the browser throttles timers in
    // background tabs (a plain per-tick step would run in slow motion).
    const tick = () => {
      const now = performance.now();
      const elapsed = Math.min((now - lastTickRef.current) / 1000, 60);
      lastTickRef.current = now;
      accumulatorRef.current += elapsed;
      while (accumulatorRef.current >= DT) {
        flightRef.current = step(flightRef.current);
        accumulatorRef.current -= DT;
      }
      setTelemetry(toPacket(flightRef.current));
    };

    tick();
    const intervalId = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [enabled]);

  return enabled ? telemetry : undefined;
}
