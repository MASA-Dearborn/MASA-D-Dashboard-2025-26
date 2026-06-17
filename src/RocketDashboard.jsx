import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import './RocketDashboard.css';
import NavballAssembly from './NavballAssembly';
import { getAvailableModules } from './rocketModules';
import TELEMETRY_DEFINITIONS, {
  TEMPERATURE_CHANNELS,
  getDefinition,
  readByAliases,
  readTelemetryValue,
} from './telemetryDefinitions';
import TelemetryCard from './components/TelemetryCard';
import TelemetryModal from './components/TelemetryModal';
import ModuleModal from './components/ModuleModal';
import { AIPredictionsPanel, MissionNarratorPanel } from './components/AIPanels';
import useFlightInsights from './ai/useFlightInsights';
import {
  BottomCharts,
  DashboardFooter,
  DashboardHeader,
  FlightEventsPanel,
  GForceGauge,
  SystemStatusPanel,
  TemperaturesPanel,
  TrajectoryPanel,
} from './components/panels';

const LOGO_SRC = '/logo.png';
const SPACE_BG_SRC = '/space.png';
const ROCKET_IMAGE_SRC = '/rocket.png';
const HISTORY_LIMIT = 80;
const APOGEE_REFERENCE = 2540; // m, trajectory fallback before the ML model has a prediction

const TOP_CARD_IDS = ['altitude', 'velocity', 'voltage', 'pressure', 'rssi'];
const BOTTOM_CHART_IDS = ['altitude', 'velocity', 'pressure'];

const AVAILABLE_MODULES = getAvailableModules();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value, digits = 0) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return Number(value).toFixed(digits);
}

function formatCoordinate(value, positive, negative, digits = 3) {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  const direction = value >= 0 ? positive : negative;
  return `${Math.abs(Number(value)).toFixed(digits)}° ${direction}`;
}

function formatClock(totalSeconds) {
  if (totalSeconds == null || !Number.isFinite(totalSeconds)) return '--:--:--';
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.abs(Math.round(totalSeconds));
  const h = Math.floor(abs / 3600).toString().padStart(2, '0');
  const m = Math.floor((abs % 3600) / 60).toString().padStart(2, '0');
  const s = (abs % 60).toString().padStart(2, '0');
  return `${sign}${h}:${m}:${s}`;
}

// Phase comes from the packet's flight_state when the flight computer reports
// one; otherwise it is derived from the AI event detector's latest milestone —
// never guessed from raw magnitude thresholds.
const EVENT_PHASE = {
  armed: 'ARMED',
  launch: 'BOOST',
  burnout: 'COAST',
  apogee: 'DESCENT',
  drogue: 'DESCENT',
  main: 'DESCENT',
  landing: 'RECOVERY',
};

function getFlightPhase(telemetry, insights) {
  if (telemetry.flightPhase) return telemetry.flightPhase;
  const events = (insights?.events || []).filter((e) => !e.transient);
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const phase = EVENT_PHASE[events[i].type];
    if (phase) return phase;
  }
  return 'STANDBY';
}

// Link-quality estimate from recent packet drops; undefined until the link
// has reported anything, so the card shows '--' rather than an invented value.
function getSignalStrength(packetDropped) {
  if (packetDropped == null || !Number.isFinite(Number(packetDropped))) return undefined;
  return Math.max(40, 98 - Number(packetDropped) * 4);
}

// Append the latest packet to a rolling history buffer, resolving every metric
// through the definitions layer so charts never touch raw fields. Exactly one
// sample per packet: fallbacks are read through a ref so a fallback-only
// change (e.g. RSSI recomputed) can never append a duplicate sample — that
// would corrupt sample-rate-sensitive consumers like the AI rate estimator.
function useTelemetryHistory(telemetry, fallbacks) {
  const [history, setHistory] = useState([]);
  const fallbacksRef = useRef(fallbacks);
  fallbacksRef.current = fallbacks;

  useEffect(() => {
    const sample = {
      time: Date.now(),
      missionTime: telemetry.missionTime,
      values: TELEMETRY_DEFINITIONS.reduce((acc, definition) => {
        acc[definition.id] = readTelemetryValue(telemetry, definition, fallbacksRef.current);
        return acc;
      }, {}),
    };
    setHistory((previous) => [...previous.slice(-(HISTORY_LIMIT - 1)), sample]);
  }, [telemetry]);

  return history;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// Flight events come from the AI event describer (backend when live, the
// client-side mirror otherwise) — newest first, transient status lines hidden.
function buildFlightEvents(insights) {
  const events = insights?.events || [];
  return events
    .filter((event) => !event.transient)
    .slice(-6)
    .reverse()
    .map((event) => ({
      label: event.label,
      tone: event.tone,
      time: formatClock(event.t),
      key: `${event.type}-${event.clock}`,
    }));
}

function buildTemperatureChannels(telemetry) {
  return TEMPERATURE_CHANNELS.map((channel) => {
    const value = readByAliases(telemetry, channel.aliases);
    const has = typeof value === 'number' && Number.isFinite(value);
    const tone = !has ? 'muted' : value >= 55 ? 'bad' : value >= 42 ? 'warn' : 'good';
    return {
      label: channel.label,
      display: has ? `${value.toFixed(1)} °C` : '--',
      pct: has ? clamp(((value - 20) / 40) * 100, 4, 100) : 0,
      tone,
    };
  });
}

// Every row is derived from real telemetry — nothing is hardcoded "OK".
function buildSystemStatus(telemetry, hasData) {
  const hasGps =
    Number.isFinite(Number(telemetry.lat)) && Number.isFinite(Number(telemetry.long));
  const voltage = Number(telemetry.vol);
  const hasVoltage = Number.isFinite(voltage);
  const hasBaro = Number.isFinite(Number(telemetry.bar));
  const hasImu = Number.isFinite(Number(telemetry.acceleration));
  const sensors = hasBaro && hasImu
    ? { value: 'OK', tone: 'good' }
    : hasBaro || hasImu
      ? { value: 'DEGRADED', tone: 'warn' }
      : { value: 'NO DATA', tone: hasData ? 'bad' : 'muted' };
  const ctrl = telemetry.ctrlHealth;

  return [
    {
      icon: 'computer',
      label: 'Flight Computer',
      value: hasData ? 'OK' : 'NO LINK',
      tone: hasData ? 'good' : 'muted',
    },
    { icon: 'sensor', label: 'Sensors', ...sensors },
    { icon: 'gps', label: 'GPS', value: hasGps ? 'LOCKED' : 'NO FIX', tone: hasGps ? 'good' : 'warn' },
    {
      icon: 'battery',
      label: 'Battery',
      value: hasVoltage ? `${voltage.toFixed(2)} V` : '--',
      tone: !hasVoltage ? 'muted' : voltage >= 11.1 ? 'good' : voltage >= 10.5 ? 'warn' : 'bad',
    },
    {
      icon: 'payload',
      label: 'Payload',
      value: ctrl === 1 ? 'ACTIVE' : ctrl === 0 ? 'FAULT' : '--',
      tone: ctrl === 1 ? 'good' : ctrl === 0 ? 'bad' : 'muted',
    },
  ];
}

// ---------------------------------------------------------------------------
// Center flight stage: 2D rocket image, orbital guides, navball cluster and the
// clickable module markers (only rendered for modules that ship a model).
// ---------------------------------------------------------------------------
function FlightStage({ telemetry, flightPhase, onSelectModule }) {
  const annotations = [];
  if (Number.isFinite(Number(telemetry.magneticHeading))) {
    annotations.push({ key: 'heading', cls: 'annotation-heading', label: 'HEADING', value: `${formatNumber(telemetry.magneticHeading)}°` });
  }
  if (Number.isFinite(Number(telemetry.roll))) {
    annotations.push({ key: 'roll', cls: 'annotation-roll', label: 'ROLL', value: `${formatNumber(telemetry.roll, 1)}°` });
  }
  if (Number.isFinite(Number(telemetry.acceleration))) {
    annotations.push({ key: 'accel', cls: 'annotation-pitch', label: 'ACCEL', value: `${formatNumber(telemetry.acceleration, 1)} m/s²` });
  }

  return (
    <section className="flight-stage">
      <div className="flight-arc flight-arc-one" />
      <div className="flight-arc flight-arc-two" />
      <div className="flight-phase-badge">{flightPhase}</div>

      {annotations.map((a) => (
        <div key={a.key} className={`stage-annotation ${a.cls}`}>
          <span className="annotation-label">{a.label}</span>
          <span className="annotation-value">{a.value}</span>
        </div>
      ))}

      <div className="rocket-stage">
        <div className="rocket-plume" />
        <div className="rocket-image-stage">
          <img className="rocket-image" src={ROCKET_IMAGE_SRC} alt="" />
          {AVAILABLE_MODULES.map((module) => (
            <button
              type="button"
              key={module.id}
              className="rocket-module-button"
              style={{ left: `${module.marker.x}%`, top: `${module.marker.y}%` }}
              onClick={() => onSelectModule(module)}
              aria-label={`Inspect ${module.label} module`}
            >
              <span />
            </button>
          ))}
        </div>
      </div>

      <div className="navball-wrap">
        <NavballAssembly
          acceleration={telemetry.acceleration}
          magneticHeading={telemetry.magneticHeading}
          roll={telemetry.roll}
          velocity={telemetry.velocity}
          altitude={telemetry.alt}
        />
      </div>
    </section>
  );
}

const RocketDashboard = ({
  telemetry: telemetryProp,
  serverInsights = null,
  linkMode = 'offline',
  connected = false,
}) => {
  // Memoise the packet so the history effect (and downstream memos) only
  // re-run when a new telemetry packet actually arrives — not on every render.
  // No placeholder values: any channel that is absent simply reads '--'.
  const telemetry = useMemo(() => telemetryProp || {}, [telemetryProp]);
  const hasData = telemetryProp != null;
  const now = useClock();

  const signalStrength = getSignalStrength(telemetry.packetDropped);
  const telemetryFallbacks = useMemo(
    () => ({ rssi: signalStrength }),
    [signalStrength],
  );
  const history = useTelemetryHistory(telemetry, telemetryFallbacks);

  const [selectedMetric, setSelectedMetric] = useState(null);
  const [selectedModule, setSelectedModule] = useState(null);

  const topCards = TOP_CARD_IDS.map((id) => {
    const definition = getDefinition(id);
    return {
      definition,
      value: readTelemetryValue(telemetry, definition, telemetryFallbacks),
    };
  });
  const bottomChartDefs = BOTTOM_CHART_IDS.map(getDefinition);

  // ML insights: backend models when the bridge is live, client mirror otherwise.
  const insights = useFlightInsights(history, serverInsights, linkMode === 'socket');
  const predictions = insights?.predictions;
  const altitudeForecast = predictions?.ready ? predictions.forecast : null;
  const flightPhase = getFlightPhase(telemetry, insights);

  // Overall status rolls up link health, battery and active ML anomalies.
  const packetDropped = Number(telemetry.packetDropped) || 0;
  const voltage = Number(telemetry.vol);
  const recentAnomalies = (predictions?.ready && predictions.anomalies
    ? predictions.anomalies.filter((a) => predictions.t == null || predictions.t - a.t < 30)
    : []);
  let status = { label: 'NOMINAL', tone: 'good' };
  if (!hasData) status = { label: 'STANDBY', tone: 'muted' };
  else if (
    packetDropped > 1 ||
    recentAnomalies.length > 0 ||
    (Number.isFinite(voltage) && voltage < 11.1)
  ) status = { label: 'CAUTION', tone: 'warn' };
  if (
    (Number.isFinite(voltage) && voltage < 10.5) ||
    recentAnomalies.some((a) => a.kind === 'battery-low')
  ) status = { label: 'CRITICAL', tone: 'bad' };

  const flightEvents = buildFlightEvents(insights);
  const temperatureChannels = buildTemperatureChannels(telemetry);
  const systemStatus = buildSystemStatus(telemetry, hasData);
  const gforce = Number.isFinite(Number(telemetry.acceleration))
    ? telemetry.acceleration / 9.80665
    : null;
  // The trajectory marker climbs toward the ML-predicted apogee (falls back to
  // a nominal target before the model converges).
  const apogeeReference = predictions?.ready && predictions.apogee_m > 100
    ? predictions.apogee_m
    : APOGEE_REFERENCE;
  const trajectoryProgress = clamp((Number(telemetry.alt) || 0) / apogeeReference, 0, 1);

  const footerMeta = [
    { label: 'MISSION', value: 'Test Flight #24' },
    { label: 'ROCKET', value: 'MSA-1' },
    { label: 'PAYLOAD', value: 'Telemetry v2.1' },
    { label: 'TEAM', value: 'MASA Dearborn' },
    { label: 'DATE', value: now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) },
    { label: 'TIME', value: now.toLocaleTimeString('en-US', { hour12: false }) },
  ];

  return (
    <div className="dashboard-container" data-phase={flightPhase}>
      <div className="dashboard-backdrop" style={{ backgroundImage: `url(${SPACE_BG_SRC})` }} />
      <div className="dashboard-overlay" />

      <main className="dashboard-shell">
        <DashboardHeader
          logoSrc={LOGO_SRC}
          missionClock={formatClock(telemetry.missionTime)}
          linkMode={linkMode}
          status={status}
          connected={connected}
        />

        <section className="top-cards">
          {topCards.map(({ definition, value }) => (
            <TelemetryCard
              key={definition.id}
              definition={definition}
              value={value}
              history={history}
              onOpen={setSelectedMetric}
            />
          ))}
        </section>

        <div className="dashboard-main">
          <aside className="dashboard-col dashboard-left">
            <TrajectoryPanel
              lat={formatCoordinate(telemetry.lat, 'N', 'S')}
              lon={formatCoordinate(telemetry.long, 'E', 'W')}
              alt={`${formatNumber(telemetry.alt)} m`}
              progress={trajectoryProgress}
            />
            <SystemStatusPanel items={systemStatus} />
            <AIPredictionsPanel predictions={predictions} />
          </aside>

          <section className="dashboard-center">
            <FlightStage telemetry={telemetry} flightPhase={flightPhase} onSelectModule={setSelectedModule} />
          </section>

          <aside className="dashboard-col dashboard-right">
            <FlightEventsPanel events={flightEvents} />
            <GForceGauge gforce={gforce} />
            <TemperaturesPanel channels={temperatureChannels} />
          </aside>
        </div>

        <MissionNarratorPanel events={insights?.events} />

        <BottomCharts
          history={history}
          definitions={bottomChartDefs}
          altitudeForecast={altitudeForecast}
        />

        <DashboardFooter
          meta={footerMeta}
          onSettings={() => {}}
          onExport={() => {}}
        />
      </main>

      <TelemetryModal metric={selectedMetric} history={history} onClose={() => setSelectedMetric(null)} />
      <ModuleModal module={selectedModule} onClose={() => setSelectedModule(null)} />
    </div>
  );
};

AVAILABLE_MODULES.forEach((module) => {
  if (module.modelPath) useGLTF.preload(module.modelPath);
});

export default RocketDashboard;
