import { useEffect, useRef, useState } from 'react';
import FlightAI from './flightAI';

// Prefer the backend's physics-informed insights when the socket bridge is
// delivering them; otherwise run the client-side FlightAI mirror over the
// same history buffer the charts use. Either way the panels get one shape:
// { predictions, events }.
export default function useFlightInsights(history, serverInsights, preferServer) {
  const aiRef = useRef(null);
  const [clientInsights, setClientInsights] = useState(null);

  useEffect(() => {
    if (!history.length) return;
    if (!aiRef.current) aiRef.current = new FlightAI();
    const ai = aiRef.current;

    const sample = history[history.length - 1];
    const v = sample.values || {};

    // The mock simulation loops; a mission-clock jump backwards means a fresh
    // flight, so the models and event log start over.
    if (
      ai.lastMissionTime != null &&
      sample.missionTime != null &&
      sample.missionTime < ai.lastMissionTime - 2
    ) {
      ai.reset();
    }
    ai.lastMissionTime = sample.missionTime;

    ai.push({
      t: sample.time / 1000,
      missionTime: sample.missionTime,
      alt: Number(v.altitude),
      vel: Number(v.velocity),
      accel: Number(v.acceleration),
      volt: Number(v.voltage),
    });
    setClientInsights(ai.getInsights());
  }, [history]);

  if (preferServer && serverInsights && serverInsights.predictions) {
    return normalizeServerInsights(serverInsights);
  }
  return clientInsights;
}

// Backend forecast timestamps are absolute (seconds since first packet);
// the charts want offsets from "now" so both sources line up.
function normalizeServerInsights(insights) {
  const predictions = { ...(insights.predictions || { ready: false }) };
  if (predictions.forecast && predictions.t != null) {
    predictions.forecast = predictions.forecast.map((f) => ({
      dt: f.t - predictions.t,
      alt: f.alt,
    }));
  }
  return { predictions, events: insights.events || [] };
}
