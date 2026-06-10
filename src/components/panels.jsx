import React, { useState } from 'react';
import Icon from './icons';
import HistoryChart from './HistoryChart';
import './components.css';

// ---------------------------------------------------------------------------
// Header: MASA logo (left) · title + live mission clock (center) · status (right)
// ---------------------------------------------------------------------------
const LINK_LABELS = {
  socket: 'LIVE',
  simulation: 'SIMULATION',
  offline: 'OFFLINE',
};

const CONNECT_LABELS = {
  socket: 'CONNECTED',
  simulation: 'SIM RUNNING',
  offline: 'NO LINK',
};

export function DashboardHeader({ logoSrc, missionClock, linkMode = 'offline', status, connected }) {
  const active = linkMode !== 'offline';
  const linkLabel = LINK_LABELS[linkMode] || LINK_LABELS.offline;
  const connectLabel = connected ? (CONNECT_LABELS[linkMode] || 'CONNECTED') : 'NO LINK';

  return (
    <header className="dash-header">
      <div className="dash-header-left">
        <img className="dash-logo" src={logoSrc} alt="MASA Dearborn" />
        <span className="dash-logo-sub">DEARBORN</span>
      </div>

      <div className="dash-header-center">
        <h1 className="dash-title">ROCKET TELEMETRY DASHBOARD</h1>
        <div className="dash-subtitle">
          <span className={`live-dot ${active ? 'is-live' : ''} ${linkMode === 'simulation' ? 'is-sim' : ''}`} />
          <span className={`live-text ${linkMode === 'simulation' ? 'is-sim' : ''} ${active ? 'is-live' : ''}`}>{linkLabel}</span>
          <span className="dash-subtitle-sep">MISSION TIME</span>
          <span className="dash-clock">{missionClock}</span>
        </div>
      </div>

      <div className="dash-header-right">
        <div className="dash-status-block">
          <span className="dash-status-label">STATUS</span>
          <strong className={`dash-status-value tone-${status.tone}`}>{status.label}</strong>
        </div>
        <div className="dash-status-block">
          <span className={`dash-status-value ${connected ? 'tone-good' : 'tone-bad'}`}>
            {connectLabel}
          </span>
          <span className={`conn-dot ${connected ? 'is-on' : ''} ${linkMode === 'simulation' ? 'is-sim' : ''}`} />
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Trajectory / map view with coordinates
// ---------------------------------------------------------------------------
export function TrajectoryPanel({ lat, lon, alt, progress = 0 }) {
  const [zoom, setZoom] = useState(1);
  // Marker rides a stylised launch arc based on flight progress (0..1).
  const t = Math.max(0, Math.min(1, progress));
  const mx = 14 + t * 70;
  const my = 84 - Math.sin(t * (Math.PI / 2)) * 64;

  return (
    <section className="panel trajectory-panel">
      <div className="panel-head">
        <h2 className="panel-title">TRAJECTORY</h2>
        <span className="panel-subtitle">MAP VIEW</span>
      </div>

      <div className="map-view">
        <div className="map-grid" style={{ transform: `scale(${zoom})` }}>
          <svg className="map-arc" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d={`M 14 84 Q ${mx} ${my} ${mx} ${my}`} className="map-arc-path" />
            <path d="M 14 84 Q 48 86 84 20" className="map-arc-guide" />
          </svg>
          <span className="map-launch" />
          <span className="map-vehicle" style={{ left: `${mx}%`, top: `${my}%` }}>🚀</span>
          <span className="map-label">LAUNCH</span>
        </div>
        <div className="map-zoom">
          <button type="button" onClick={() => setZoom((z) => Math.min(1.8, z + 0.2))} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} aria-label="Zoom out">−</button>
        </div>
      </div>

      <div className="coordinates">
        <span className="coord-head">COORDINATES</span>
        <div className="coord-row"><span>LAT</span><strong>{lat}</strong></div>
        <div className="coord-row"><span>LON</span><strong>{lon}</strong></div>
        <div className="coord-row"><span>ALT</span><strong>{alt}</strong></div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// System status list
// ---------------------------------------------------------------------------
export function SystemStatusPanel({ items }) {
  return (
    <section className="panel system-panel">
      <div className="panel-head">
        <h2 className="panel-title">SYSTEM STATUS</h2>
      </div>
      <ul className="system-list">
        {items.map((item) => (
          <li key={item.label} className="system-row">
            <Icon name={item.icon} size={16} className="system-icon" />
            <span className="system-label">{item.label}</span>
            <strong className={`system-value tone-${item.tone}`}>{item.value}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Flight events feed
// ---------------------------------------------------------------------------
export function FlightEventsPanel({ events }) {
  return (
    <section className="panel events-panel">
      <div className="panel-head">
        <h2 className="panel-title">FLIGHT EVENTS</h2>
      </div>
      {events.length ? (
        <ul className="events-list">
          {events.map((event) => (
            <li key={event.label} className="event-row">
              <span className={`event-dot tone-${event.tone}`} />
              <span className="event-time">{event.time}</span>
              <span className="event-label">{event.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="events-empty">Awaiting launch…</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// G-force gauge (degrades to an empty state when acceleration/IMU is missing)
// ---------------------------------------------------------------------------
function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

export function GForceGauge({ gforce }) {
  const SIZE = 150;
  const cx = SIZE / 2;
  const cy = SIZE / 2 + 8;
  const r = 52;
  const SPAN = 120; // ± degrees from vertical → ±5 G
  const MAX_G = 5;
  const has = typeof gforce === 'number' && Number.isFinite(gforce);
  const clamped = has ? Math.max(-MAX_G, Math.min(MAX_G, gforce)) : 0;
  const angle = (clamped / MAX_G) * SPAN;

  const [sx, sy] = polar(cx, cy, r, -SPAN);
  const [ex, ey] = polar(cx, cy, r, SPAN);
  const [vx, vy] = polar(cx, cy, r, angle);
  const [nx, ny] = polar(cx, cy, r - 6, angle);
  const ticks = [-5, -2.5, 0, 2.5, 5];

  return (
    <section className="panel gforce-panel">
      <div className="panel-head">
        <h2 className="panel-title">G-FORCE</h2>
      </div>
      <div className="gforce-body">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="gforce-svg">
          <path d={`M ${sx} ${sy} A ${r} ${r} 0 1 1 ${ex} ${ey}`} className="gforce-track" />
          {has && (
            <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${Math.abs(angle + SPAN) > 180 ? 1 : 0} 1 ${vx} ${vy}`} className="gforce-fill" />
          )}
          {ticks.map((tv) => {
            const [tx1, ty1] = polar(cx, cy, r + 2, (tv / MAX_G) * SPAN);
            const [tx2, ty2] = polar(cx, cy, r - 7, (tv / MAX_G) * SPAN);
            return <line key={tv} x1={tx1} y1={ty1} x2={tx2} y2={ty2} className="gforce-tick" />;
          })}
          {has && <line x1={cx} y1={cy} x2={nx} y2={ny} className="gforce-needle" />}
          <circle cx={cx} cy={cy} r="4" className="gforce-hub" />
          <text x={cx} y={cy - 18} className="gforce-value" textAnchor="middle">
            {has ? clamped.toFixed(1) : '--'}
          </text>
          <text x={cx} y={cy - 4} className="gforce-unit" textAnchor="middle">G</text>
        </svg>
        <div className="gforce-scale"><span>-5</span><span>5</span></div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Temperatures
// ---------------------------------------------------------------------------
export function TemperaturesPanel({ channels }) {
  return (
    <section className="panel temps-panel">
      <div className="panel-head">
        <h2 className="panel-title">TEMPERATURES</h2>
      </div>
      <ul className="temps-list">
        {channels.map((channel) => (
          <li key={channel.label} className="temp-row">
            <span className="temp-label">{channel.label}</span>
            <strong className="temp-value">{channel.display}</strong>
            <span className="temp-bar">
              <span className={`temp-bar-fill tone-${channel.tone}`} style={{ width: `${channel.pct}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bottom chart row
// ---------------------------------------------------------------------------
function formatClockLabel(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '';
  const sign = seconds < 0 ? '-' : '';
  const abs = Math.abs(Math.round(seconds));
  const m = Math.floor(abs / 60).toString().padStart(2, '0');
  const s = (abs % 60).toString().padStart(2, '0');
  return `${sign}${m}:${s}`;
}

export function BottomCharts({ history, definitions }) {
  return (
    <section className="bottom-charts">
      {definitions.map((definition) => (
        <div className="chart-card" key={definition.id}>
          <div className="chart-card-head">
            <h3 className="chart-card-title">{definition.shortLabel}</h3>
            <span className="chart-card-unit">({definition.unit})</span>
          </div>
          <div className="chart-card-body">
            <HistoryChart samples={history} definition={definition} showPoints={false} xLabel={formatClockLabel} />
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer metadata + actions
// ---------------------------------------------------------------------------
export function DashboardFooter({ meta, onExport, onSettings }) {
  return (
    <footer className="dash-footer">
      <div className="footer-meta">
        {meta.map((item) => (
          <div className="footer-meta-item" key={item.label}>
            <span className="footer-meta-label">{item.label}</span>
            <strong className="footer-meta-value">{item.value}</strong>
          </div>
        ))}
      </div>
      <div className="footer-actions">
        <button type="button" className="footer-button" onClick={onSettings}>⚙ SETTINGS</button>
        <button type="button" className="footer-button" onClick={onExport}>⭳ EXPORT</button>
      </div>
    </footer>
  );
}
