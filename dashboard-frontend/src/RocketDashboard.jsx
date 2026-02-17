import React, { useMemo } from 'react';
import './RocketDashboard.css';
import NavballAssembly from './NavballAssembly';

// -----------------------------------------------------------------------------
// Backend integration: pass optional `telemetry` prop with shape below to display
// live data. Omit it or pass null to show placeholders.
//
// telemetry = {
//   missionTime,      // number (seconds from launch, negative = countdown)
//   velocity,         // number (m/s)
//   acceleration,     // number (m/s^2)
//   lat,              // number
//   long,             // number
//   alt,              // number (altitude, m)
//   vol,              // number (voltage, V)        — displayed as bar
//   bar,              // number (barometric pressure, hPa) — displayed as bar
//   magneticHeading,  // number (degrees, 0-360)
//   roll,             // number (degrees)
//   packetDropped,    // number (dropped packets)
// }
// -----------------------------------------------------------------------------

const PLACEHOLDER = {
  missionTime: -992,
  velocity: 342,
  acceleration: 47,
  lat: 42.3223,
  long: 83.1763,
  alt: 1524,
  vol: 11.84,
  bar: 1013.2,
  magneticHeading: 45,
  roll: 5,
  packetDropped: 3,
};

const ROCKET_GRAPHIC_SRC = '/rocket.png';
const LOGO_SRC = '/logo.png';

function formatMissionTime(totalSeconds) {
  if (totalSeconds == null) return '—:—:—';
  const isNegative = totalSeconds < 0;
  const absSeconds = Math.abs(totalSeconds);
  const h = Math.floor(absSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((absSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = (absSeconds % 60).toString().padStart(2, '0');
  return `T ${isNegative ? '-' : '+'} ${h}:${m}:${s}`;
}

function MissionTimer({ missionTime }) {
  return (
    <div className="mission-timer-inline">
      <div className="label-small">Mission Time</div>
      <div className="timer-display">{formatMissionTime(missionTime)}</div>
    </div>
  );
}

function SideGauge({ label, value, unit = null, ticksRotation = 0, pointerLeft = false, className = '' }) {
  const display = value != null ? Math.round(value) : '—';
  return (
    <div className={`gauge-circle side-gauge ${className}`.trim()}>
      <div className="ticks-ring" style={ticksRotation ? { transform: `rotate(${ticksRotation}deg)` } : undefined} />
      <div className={`triangle-pointer ${pointerLeft ? 'triangle-left' : ''}`} />
      <div className="gauge-value-container">
        <span className="gauge-label">{label}</span>
        <div className="gauge-number">
          {display}
          {display !== '—' && unit ? <span className="gauge-unit">{unit}</span> : null}
        </div>
      </div>
    </div>
  );
}

function CoordsPanel({ label, value, align }) {
  const display = value != null ? value : '—';
  return (
    <div className="coords-panel" style={{ textAlign: align }}>
      <div className="coord-group">
        <div className="coord-label">{label}</div>
        <div className="coord-value">{display}</div>
      </div>
    </div>
  );
}

function DataBar({ label, value, unit, min = 0, max = 100 }) {
  const display = value != null ? value : '—';
  const pct = value != null ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <div className="data-bar">
      <div className="data-bar-header">
        <span className="data-bar-label">{label}</span>
        <span className="data-bar-value">{display}{value != null && unit ? ` ${unit}` : ''}</span>
      </div>
      <div className="data-bar-track">
        <div className="data-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RocketGraphic() {
  return (
    <div className="rocket-panel">
      <img className="rocket-graphic" src={ROCKET_GRAPHIC_SRC} alt="Rocket graphic" />
    </div>
  );
}

function useStarfield(count = 48) {
  return useMemo(() => Array.from({ length: count }, () => ({
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: 1.5 + Math.random() * 2,
    delay: Math.random() * 3,
    duration: 2 + Math.random() * 2,
  })), []);
}

// Mock simulation — uncomment for demo/testing without backend
// function useMockTelemetry() {
//   const [mock, setMock] = useState({
//     magneticHeading: 45,
//     roll: 0,
//     acceleration: 47,
//     velocity: 342,
//   });
//
//   useEffect(() => {
//     let t = 0;
//     const id = setInterval(() => {
//       t += 0.05;
//       setMock({
//         magneticHeading: (45 + Math.sin(t * 0.4) * 60 + 360) % 360,
//         roll: Math.sin(t * 0.7) * 15,
//         acceleration: 47 + Math.sin(t * 0.3) * 20,
//         velocity: 342 + Math.sin(t * 0.5) * 40,
//       });
//     }, 50);
//     return () => clearInterval(id);
//   }, []);
//
//   return mock;
// }

const RocketDashboard = ({ telemetry: telemetryProp }) => {
  // const mockValues = useMockTelemetry();
  const telemetry = { ...PLACEHOLDER, ...telemetryProp };
  const stars = useStarfield(48);

  return (
    <div className="dashboard-container">
      <div className="starfield" aria-hidden="true">
        {stars.map((s, i) => (
          <span
            key={i}
            className="star"
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
      </div>
      <div className="scanline" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <header className="dashboard-header">
        <h1 className="dashboard-title">
          <img className="dashboard-logo" src={LOGO_SRC} alt="MASA logo" />
        </h1>
        <p className="dashboard-subtitle">DEARBORN</p>
      </header>

      <div className="middle-stage">
        <div className="sensor-column sensor-column-left">
          <CoordsPanel
            label="LAT"
            value={telemetry.lat != null ? `${Number(telemetry.lat).toFixed(4)}° N` : null}
            align="right"
          />
          <CoordsPanel
            label="LONG"
            value={telemetry.long != null ? `${Number(telemetry.long).toFixed(4)}° W` : null}
            align="right"
          />
          <CoordsPanel
            label="ALT"
            value={telemetry.alt != null ? `${Number(telemetry.alt).toFixed(0)} m` : null}
            align="right"
          />
        </div>

        <RocketGraphic />

        <div className="sensor-column sensor-column-right">
          <CoordsPanel
            label="PKTS DROP"
            value={telemetry.packetDropped != null ? `${Number(telemetry.packetDropped)}` : null}
            align="left"
          />
          <DataBar label="VOL" value={telemetry.vol != null ? Number(telemetry.vol).toFixed(2) : null} unit="V" min={0} max={14} />
          <DataBar label="BAR" value={telemetry.bar != null ? Number(telemetry.bar).toFixed(1) : null} unit="hPa" min={900} max={1100} />
        </div>
      </div>

      <div className="cluster-container cluster-lower">
        <NavballAssembly
          acceleration={telemetry.acceleration}
          magneticHeading={telemetry.magneticHeading}
          roll={telemetry.roll}
          velocity={telemetry.velocity}
        />
      </div>

      <div className="mission-timer-row">
        <MissionTimer missionTime={telemetry.missionTime} />
      </div>
    </div>
  );
};

export default RocketDashboard;
export { PLACEHOLDER };
