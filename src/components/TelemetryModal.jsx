import React, { useEffect, useState } from 'react';
import HistoryChart, { getNumericHistory } from './HistoryChart';
import { formatTelemetryValue } from '../telemetryDefinitions';
import './components.css';

// Single reusable telemetry history modal. The dashboard renders exactly one of
// these and feeds it whichever metric definition the user clicked — no per-metric
// modal duplication.
export default function TelemetryModal({ metric, history, onClose }) {
  const [isClosing, setIsClosing] = useState(false);

  const requestClose = () => {
    setIsClosing(true);
    window.setTimeout(onClose, 170);
  };

  useEffect(() => {
    setIsClosing(false);
  }, [metric]);

  useEffect(() => {
    if (!metric) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setIsClosing(true);
        window.setTimeout(onClose, 170);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [metric, onClose]);

  if (!metric) return null;

  const numeric = getNumericHistory(history, metric);
  const latest = history[history.length - 1]?.values?.[metric.id];
  const chartable = numeric.length >= 2;

  return (
    <div
      className={`telemetry-modal-backdrop ${isClosing ? 'is-closing' : ''}`}
      role="presentation"
      onClick={requestClose}
    >
      <section
        className="telemetry-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${metric.label} telemetry history`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="telemetry-modal-header">
          <div className="telemetry-modal-titles">
            <span className="telemetry-modal-kicker">TELEMETRY HISTORY</span>
            <strong className="telemetry-modal-title">{metric.label}</strong>
          </div>
          <button type="button" className="telemetry-modal-close" onClick={requestClose} aria-label="Close">
            ✕
          </button>
        </header>

        {metric.description ? <p className="telemetry-modal-copy">{metric.description}</p> : null}

        <div className="telemetry-modal-stats">
          <div className="telemetry-modal-current">
            <span className="telemetry-modal-stat-label">CURRENT</span>
            <strong className="telemetry-modal-stat-value">
              {formatTelemetryValue(latest, metric)} {metric.unit}
            </strong>
          </div>
          <div className="telemetry-modal-samples">{history.length} samples</div>
        </div>

        <div className="telemetry-modal-chart">
          {chartable ? (
            <HistoryChart samples={history} definition={metric} />
          ) : (
            <div className="telemetry-modal-nochart">
              No numeric history available for this metric yet.
            </div>
          )}
        </div>

        <p className="telemetry-modal-xaxis">X-axis: Mission time (s)</p>
      </section>
    </div>
  );
}
