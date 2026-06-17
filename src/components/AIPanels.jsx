import React, { useEffect, useRef, useState } from 'react';
import './components.css';

// ---------------------------------------------------------------------------
// AI PREDICTIONS — surfaces the online ML models: predicted apogee + ETA,
// landing estimate, battery time-left regression, model source + confidence.
// ---------------------------------------------------------------------------
const SOURCE_LABELS = {
  physics: 'PHYSICS MODEL',
  regression: 'REGRESSION',
  ensemble: 'ENSEMBLE',
  observed: 'OBSERVED',
};

function fmt(value, digits = 0, suffix = '') {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return `${Number(value).toFixed(digits)}${suffix}`;
}

function fmtEta(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return '--';
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `T-${s}s`;
  return `T-${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`;
}

export function AIPredictionsPanel({ predictions }) {
  const ready = predictions?.ready;
  const p = predictions || {};
  const confidence = ready ? Math.round((p.confidence ?? 0) * 100) : 0;
  const anomaly = ready && p.anomalies?.length ? p.anomalies[p.anomalies.length - 1] : null;

  const rows = [
    { label: 'TIME TO APOGEE', value: p.apogee_eta_s != null && p.apogee_eta_s > 0 ? fmtEta(p.apogee_eta_s) : p.apogee_source === 'observed' ? 'PASSED' : '--' },
    { label: 'DESCENT RATE', value: fmt(p.descent_rate_mps, 1, ' m/s') },
    { label: 'LANDING ETA', value: fmtEta(p.landing_eta_s) },
    { label: 'BATTERY LEFT', value: p.battery_minutes_left != null ? `${fmt(p.battery_minutes_left, 0)} min` : '--' },
  ];

  return (
    <section className="panel ai-panel">
      <div className="panel-head">
        <h2 className="panel-title">AI PREDICTIONS</h2>
        <span className="ai-chip"><span className="ai-chip-dot" />ML</span>
      </div>

      <div className="ai-apogee">
        <span className="ai-apogee-label">PREDICTED APOGEE</span>
        <strong className="ai-apogee-value">
          {ready && p.apogee_m != null ? Math.round(p.apogee_m).toLocaleString('en-US') : '----'}
          <span className="ai-apogee-unit"> m</span>
        </strong>
        <span className="ai-apogee-source">{SOURCE_LABELS[p.apogee_source] || 'LEARNING…'}</span>
      </div>

      <ul className="ai-rows">
        {rows.map((row) => (
          <li key={row.label} className="ai-row">
            <span className="ai-row-label">{row.label}</span>
            <strong className="ai-row-value">{ready ? row.value : '--'}</strong>
          </li>
        ))}
      </ul>

      <div className="ai-confidence">
        <span className="ai-confidence-label">MODEL CONFIDENCE</span>
        <span className="ai-confidence-track">
          <span
            className={`ai-confidence-fill ${confidence >= 75 ? 'tone-good' : confidence >= 45 ? 'tone-warn' : 'tone-bad'}`}
            style={{ width: `${Math.max(confidence, 3)}%` }}
          />
        </span>
        <span className="ai-confidence-pct">{ready ? `${confidence}%` : '--'}</span>
      </div>

      {anomaly && (
        <div className="ai-anomaly" title={anomaly.message}>
          <span className="ai-anomaly-dot" />
          <span className="ai-anomaly-text">{anomaly.message}</span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// MISSION NARRATOR — full-width commentary strip. The newest narration line
// types itself out; the two previous lines fade behind it.
// ---------------------------------------------------------------------------
function useTypewriter(text, speedMs = 14) {
  const [shown, setShown] = useState('');
  const targetRef = useRef(text);

  useEffect(() => {
    targetRef.current = text || '';
    setShown('');
    if (!text) return undefined;
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setShown(targetRef.current.slice(0, i));
      if (i >= targetRef.current.length) clearInterval(id);
    }, speedMs);
    return () => clearInterval(id);
  }, [text, speedMs]);

  return shown;
}

export function MissionNarratorPanel({ events }) {
  const log = events || [];
  const latest = log.length ? log[log.length - 1] : null;
  const previous = log.slice(0, -1).filter((e) => !e.transient).slice(-2);
  const typed = useTypewriter(latest?.description);

  return (
    <section className="panel narrator-panel">
      <div className="narrator-head">
        <span className="narrator-title">MISSION NARRATOR</span>
        <span className="ai-chip"><span className="ai-chip-dot" />AI</span>
      </div>
      <div className="narrator-body">
        {latest ? (
          <>
            <p className="narrator-line">
              <span className={`narrator-clock tone-${latest.tone}`}>T+{latest.clock}</span>
              <span className="narrator-text">
                {typed}
                <span className="narrator-caret" />
              </span>
            </p>
            <div className="narrator-history">
              {previous.map((e, i) => (
                <span key={`${e.type}-${e.clock}-${i}`} className="narrator-history-line">
                  <span className="narrator-history-clock">T+{e.clock}</span> {e.description}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="narrator-line narrator-idle">Standing by — narration begins when telemetry starts flowing.</p>
        )}
      </div>
    </section>
  );
}
