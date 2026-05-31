import React from 'react';
import Icon from './icons';
import { Sparkline, getNumericHistory } from './HistoryChart';
import { formatTelemetryValue, getSignalQuality } from '../telemetryDefinitions';
import './components.css';

// Build the small secondary line shown at the bottom of a card. Driven entirely
// by `definition.secondary` so cards stay generic and config-controlled.
function getFootnote(definition, history) {
  switch (definition.secondary) {
    case 'max': {
      const numeric = getNumericHistory(history, definition);
      if (!numeric.length) return null;
      const peak = Math.max(...numeric.map((s) => s.value));
      return { label: definition.maxLabel || 'MAX', value: `${formatTelemetryValue(peak, definition)} ${definition.unit}`.trim() };
    }
    case 'nominal':
      return definition.nominal ? { label: 'NOMINAL', value: definition.nominal } : null;
    case 'quality': {
      const numeric = getNumericHistory(history, definition);
      const latest = numeric[numeric.length - 1]?.value;
      const quality = getSignalQuality(latest);
      return { text: quality.label, tone: quality.tone };
    }
    default:
      return null;
  }
}

// Reusable, button-like telemetry card. Used for every metric in the top row.
// Clicking (or activating via keyboard) opens the matching telemetry modal.
export default function TelemetryCard({ definition, value, history, onOpen, emphasis = false }) {
  if (!definition) return null;

  const display = formatTelemetryValue(value, definition);
  const footnote = getFootnote(definition, history);
  const interactive = typeof onOpen === 'function';

  return (
    <button
      type="button"
      className={`telemetry-card ${emphasis ? 'is-emphasis' : ''}`}
      onClick={interactive ? () => onOpen(definition) : undefined}
      aria-label={`${definition.label} ${display} ${definition.unit}. Open history.`}
    >
      <div className="telemetry-card-top">
        <Icon name={definition.icon} className="telemetry-card-icon" size={18} />
        <span className="telemetry-card-label">{definition.shortLabel}</span>
      </div>

      <div className="telemetry-card-value">
        <span className="telemetry-card-number">{display}</span>
        {definition.unit ? <small className="telemetry-card-unit">{definition.unit}</small> : null}
      </div>

      <div className="telemetry-card-spark">
        <Sparkline samples={history} definition={definition} />
      </div>

      {footnote ? (
        <div className={`telemetry-card-foot ${footnote.tone ? `tone-${footnote.tone}` : ''}`}>
          {footnote.label ? <span className="foot-label">{footnote.label}</span> : null}
          <span className="foot-value">{footnote.text || footnote.value}</span>
        </div>
      ) : (
        <div className="telemetry-card-foot foot-empty" />
      )}
    </button>
  );
}
