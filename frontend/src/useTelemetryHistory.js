import { useEffect, useRef, useState } from 'react';
import { buildHistorySample } from './metricDefinitions';

const MAX_POINTS = 150;

export default function useTelemetryHistory(telemetry, signalStrength, flightPhase, active) {
  const [history, setHistory] = useState([]);
  const lastCycleRef = useRef(null);
  const lastAppendMsRef = useRef(0);
  const wallStartRef = useRef(null);

  useEffect(() => {
    if (!active || !telemetry) return;

    const cycle = telemetry.cycles;
    const now = Date.now();

    if (cycle != null) {
      if (cycle === lastCycleRef.current) return;
      lastCycleRef.current = cycle;
    } else if (now - lastAppendMsRef.current < 90) {
      return;
    }
    lastAppendMsRef.current = now;

    if (wallStartRef.current == null) {
      wallStartRef.current = now;
    }

    const sample = buildHistorySample(telemetry, signalStrength, flightPhase);
    if (!sample.useMissionTime) {
      sample.t = (now - wallStartRef.current) / 1000;
    }

    setHistory((prev) => {
      const next = [...prev, sample];
      if (next.length > MAX_POINTS) return next.slice(-MAX_POINTS);
      return next;
    });
  }, [telemetry, signalStrength, flightPhase, active]);

  return { history };
}
