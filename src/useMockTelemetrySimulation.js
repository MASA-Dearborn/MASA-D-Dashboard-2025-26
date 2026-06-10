import { useEffect, useState } from 'react';
import { PLACEHOLDER } from './RocketDashboard';

const LAUNCH_CYCLE_SECONDS = 95;
const COUNTDOWN_SECONDS = 10;
const TICK_MS = 100;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function getMockFlightState(time) {
  if (time < 0) {
    return {
      flightPhase: 'ARMED',
      alt: 0,
      velocity: 0,
      acceleration: 0,
    };
  }

  if (time < 14) {
    const p = time / 14;
    return {
      flightPhase: 'BOOST',
      alt: 1525 * p * p,
      velocity: lerp(24, 342, p),
      acceleration: lerp(54, 38, p),
    };
  }

  if (time < 42) {
    const p = (time - 14) / 28;
    return {
      flightPhase: 'COAST',
      alt: lerp(1525, 2540, 1 - Math.pow(1 - p, 2)),
      velocity: lerp(342, 42, p),
      acceleration: lerp(10, -8, p),
    };
  }

  if (time < 76) {
    const p = (time - 42) / 34;
    return {
      flightPhase: 'DESCENT',
      alt: lerp(2540, 180, p * p),
      velocity: lerp(42, 118, p),
      acceleration: lerp(-7, -18, Math.sin(p * Math.PI)),
    };
  }

  const p = (time - 76) / 9;
  return {
    flightPhase: 'RECOVERY',
    alt: lerp(180, 0, clamp(p, 0, 1)),
    velocity: lerp(118, 0, clamp(p, 0, 1)),
    acceleration: lerp(-4, 0, clamp(p, 0, 1)),
  };
}

function buildTelemetry(elapsedSeconds) {
  const cycleTime = (elapsedSeconds % LAUNCH_CYCLE_SECONDS) - COUNTDOWN_SECONDS;
  const state = getMockFlightState(cycleTime);
  const missionTime = Math.round(cycleTime);
  const altitudePressureDrop = state.alt * 0.115;
  const signalWobble = Math.sin(elapsedSeconds * 0.55);
  const flightLoad = clamp(Math.max(0, cycleTime) / 42, 0, 1);

  return {
    ...PLACEHOLDER,
    ...state,
    missionTime,
    alt: Math.max(0, state.alt),
    velocity: Math.max(0, state.velocity + Math.sin(elapsedSeconds * 1.4) * 3),
    acceleration: state.acceleration + Math.sin(elapsedSeconds * 2.1) * 1.2,
    lat: 42.3223 + Math.max(0, cycleTime) * 0.000012,
    long: -83.1763 - Math.max(0, cycleTime) * 0.000018,
    vol: clamp(12.36 - Math.max(0, cycleTime) * 0.012 + signalWobble * 0.03, 10.8, 12.6),
    bar: clamp(1013.2 - altitudePressureDrop, 735, 1013.2),
    magneticHeading: (45 + Math.max(0, cycleTime) * 2.4 + Math.sin(elapsedSeconds * 0.7) * 8) % 360,
    roll: Math.sin(elapsedSeconds * 1.25) * 22,
    packetDropped: Math.floor(elapsedSeconds / 17) % 4 === 0 ? 1 : 0,
    // Optional channels — real telemetry can override via aliases, and the UI
    // already handles these being absent.
    avionicsTemp: 31 + flightLoad * 6 + Math.sin(elapsedSeconds * 0.4) * 0.6,
    batteryTemp: 33 + flightLoad * 5 + Math.sin(elapsedSeconds * 0.3) * 0.5,
    motorTemp: 27 + flightLoad * 14 + Math.sin(elapsedSeconds * 0.6) * 0.8,
  };
}

export default function useMockTelemetrySimulation(enabled = true) {
  const [telemetry, setTelemetry] = useState(() => buildTelemetry(0));

  useEffect(() => {
    if (!enabled) return undefined;

    const startedAt = performance.now();
    const tick = () => {
      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      setTelemetry(buildTelemetry(elapsedSeconds));
    };

    tick();
    const intervalId = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [enabled]);

  return enabled ? telemetry : undefined;
}
