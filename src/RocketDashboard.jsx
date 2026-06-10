import React, { useEffect, useMemo, useState } from 'react';
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

const PLACEHOLDER = {
  missionTime: -992,
  velocity: 342,
  acceleration: 47,
  lat: 42.3223,
  long: -83.1763,
  alt: 1524,
  vol: 11.84,
  bar: 1013.2,
  magneticHeading: 45,
  roll: 5,
  packetDropped: 3,
};

const LOGO_SRC = '/logo.png';
const SPACE_BG_SRC = '/space.png';
const ROCKET_IMAGE_SRC = '/rocket.png';
const HISTORY_LIMIT = 80;
const APOGEE_REFERENCE = 2540; // m, used only for the stylised trajectory marker

const TOP_CARD_IDS = ['altitude', 'velocity', 'voltage', 'pressure', 'rssi'];
const BOTTOM_CHART_IDS = ['altitude', 'velocity', 'pressure'];

const FLIGHT_EVENT_TEMPLATE = [
  { at: 0, label: 'System Armed', tone: 'good' },
  { at: 1, label: 'Launch Detected', tone: 'good' },
  { at: 8, label: 'Max Q Passed', tone: 'info' },
  { at: 42, label: 'Apogee Detected', tone: 'warn' },
  { at: 44, label: 'Drogue Deployed', tone: 'info' },
  { at: 62, label: 'Main Chute Deployed', tone: 'info' },
];

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

function getFlightPhase({ missionTime, alt, velocity, flightPhase }) {
  if (flightPhase) return flightPhase;
  if (missionTime != null && missionTime < 0) return 'ARMED';
  if (alt > 1200 || velocity > 250) return 'BOOST';
  if (alt > 250 || velocity > 90) return 'ASCENT';
  return 'READY';
}

function getSignalStrength(packetDropped) {
  if (packetDropped == null) return 84;
  return Math.max(60, 96 - packetDropped * 4);
}

// Append the latest packet to a rolling history buffer, resolving every metric
// through the definitions layer so charts never touch raw fields.
function useTelemetryHistory(telemetry, fallbacks) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const sample = {
      time: Date.now(),
      missionTime: telemetry.missionTime,
      values: TELEMETRY_DEFINITIONS.reduce((acc, definition) => {
        acc[definition.id] = readTelemetryValue(telemetry, definition, fallbacks);
        return acc;
      }, {}),
    };
    setHistory((previous) => [...previous.slice(-(HISTORY_LIMIT - 1)), sample]);
  }, [telemetry, fallbacks]);

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

function buildFlightEvents(missionTime) {
  if (missionTime == null) return [];
  return FLIGHT_EVENT_TEMPLATE.filter((event) => event.at <= missionTime)
    .sort((a, b) => b.at - a.at)
    .slice(0, 5)
    .map((event) => ({ ...event, time: formatClock(event.at) }));
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

function buildSystemStatus(telemetry) {
  const hasGps =
    Number.isFinite(Number(telemetry.lat)) && Number.isFinite(Number(telemetry.long));
  const voltage = Number(telemetry.vol);
  const hasVoltage = Number.isFinite(voltage);
  return [
    { icon: 'computer', label: 'Flight Computer', value: 'OK', tone: 'good' },
    { icon: 'sensor', label: 'Sensors', value: 'OK', tone: 'good' },
    { icon: 'gps', label: 'GPS', value: hasGps ? 'LOCKED' : 'NO FIX', tone: hasGps ? 'good' : 'warn' },
    {
      icon: 'battery',
      label: 'Battery',
      value: hasVoltage ? `${voltage.toFixed(2)} V` : '--',
      tone: !hasVoltage ? 'muted' : voltage >= 11 ? 'good' : 'warn',
    },
    { icon: 'payload', label: 'Payload', value: 'ACTIVE', tone: 'good' },
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
    const pitch = clamp((telemetry.acceleration || 0) * 0.22 + 8, -30, 30);
    annotations.push({ key: 'pitch', cls: 'annotation-pitch', label: 'PITCH', value: `${pitch.toFixed(1)}°` });
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

const RocketDashboard = ({ telemetry: telemetryProp, linkMode = 'offline', connected = false }) => {
  // Memoise the merged packet so the history effect (and downstream memos) only
  // re-run when a new telemetry packet actually arrives — not on every render.
  const telemetry = useMemo(
    () => ({ ...PLACEHOLDER, ...(telemetryProp || {}) }),
    [telemetryProp],
  );
  const now = useClock();

  const signalStrength = getSignalStrength(telemetry.packetDropped);
  const flightPhase = getFlightPhase(telemetry);
  const telemetryFallbacks = useMemo(
    () => ({ rssi: signalStrength, flightPhase }),
    [signalStrength, flightPhase],
  );
  const history = useTelemetryHistory(telemetry, telemetryFallbacks);

  const [selectedMetric, setSelectedMetric] = useState(null);
  const [selectedModule, setSelectedModule] = useState(null);

  const packetDropped = Number(telemetry.packetDropped) || 0;
  const status = packetDropped > 1 ? { label: 'CAUTION', tone: 'warn' } : { label: 'NOMINAL', tone: 'good' };

  const topCards = TOP_CARD_IDS.map((id) => {
    const definition = getDefinition(id);
    return {
      definition,
      value: readTelemetryValue(telemetry, definition, telemetryFallbacks),
    };
  });
  const bottomChartDefs = BOTTOM_CHART_IDS.map(getDefinition);

  const flightEvents = buildFlightEvents(telemetry.missionTime);
  const temperatureChannels = buildTemperatureChannels(telemetry);
  const systemStatus = buildSystemStatus(telemetry);
  const gforce = Number.isFinite(Number(telemetry.acceleration))
    ? telemetry.acceleration / 9.80665
    : null;
  const trajectoryProgress = clamp((Number(telemetry.alt) || 0) / APOGEE_REFERENCE, 0, 1);

  const footerMeta = [
    { label: 'MISSION', value: 'Test Flight #24' },
    { label: 'ROCKET', value: 'MSA-1' },
    { label: 'PAYLOAD', value: 'Telemetry v2.1' },
    { label: 'TEAM', value: 'MASA Dearborn' },
    { label: 'DATE', value: now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) },
    { label: 'TIME', value: now.toLocaleTimeString('en-US', { hour12: false }) },
  ];

  return (
    <div className="dashboard-container">
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

        <BottomCharts history={history} definitions={bottomChartDefs} />

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
export { PLACEHOLDER };
