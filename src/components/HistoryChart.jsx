import React, { useLayoutEffect, useRef, useState } from 'react';
import { formatTelemetryValue } from '../telemetryDefinitions';
import './components.css';

// Pull the numeric, finite samples for one metric out of the shared history
// buffer. Non-numeric metrics (e.g. flight phase) simply yield an empty set so
// charts render an empty state instead of crashing.
export function getNumericHistory(history, definition) {
  if (!definition) return [];
  return history
    .map((sample, index) => ({
      index,
      time: sample.time,
      missionTime: sample.missionTime,
      value: sample.values?.[definition.id],
    }))
    .filter((sample) => typeof sample.value === 'number' && Number.isFinite(sample.value));
}

// Measure an element so SVG charts can be drawn at exact pixel size — keeps
// strokes and text crisp regardless of container aspect ratio.
function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const element = ref.current;

    // Measure synchronously on mount: ResizeObserver callbacks are delivered
    // on rendering frames, which are suspended in occluded/background windows,
    // so charts must not depend on the observer's first callback to appear.
    const rect = element.getBoundingClientRect();
    setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      // Only update on a real change to avoid resize feedback loops.
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min || 0];
  }
  const span = max - min;
  const rawStep = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let value = start; value <= max + step * 0.001; value += step) {
    ticks.push(value);
  }
  return ticks;
}

// Compact, axis-free sparkline used inside telemetry cards.
export function Sparkline({ samples, definition }) {
  const [ref, { width, height }] = useElementSize();
  const numeric = getNumericHistory(samples, definition);

  return (
    <div className="sparkline" ref={ref}>
      {numeric.length >= 2 && width > 0 && height > 0 ? (
        <SparklineSvg numeric={numeric} definition={definition} width={width} height={height} />
      ) : (
        <span className="sparkline-empty">GRAPH</span>
      )}
    </div>
  );
}

function SparklineSvg({ numeric, definition, width, height }) {
  const pad = 3;
  const values = numeric.map((s) => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = numeric.map((sample, i) => {
    const x = pad + (i / (numeric.length - 1)) * (width - pad * 2);
    const y = height - pad - ((sample.value - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${points.join(' L ')}`;
  const area = `${line} L ${(width - pad).toFixed(1)},${height - pad} L ${pad},${height - pad} Z`;
  const gid = `spark-${definition.id}`;

  return (
    <svg width={width} height={height} role="img" aria-label={`${definition.label} trend`}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={definition.color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={definition.color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={definition.color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Full history chart with grid, axes, filled area and plotted points. Used by
// the telemetry modal and the bottom chart row.
export default function HistoryChart({
  samples,
  definition,
  showPoints = true,
  showValueTag = true,
  xLabel = (t) => `${Math.round(t)}s`,
  compact = false,
  forecast = null,
}) {
  const [ref, { width, height }] = useElementSize();
  const numeric = getNumericHistory(samples, definition);
  const ready = numeric.length >= 2 && width > 0 && height > 0;

  return (
    <div className={`history-chart ${compact ? 'is-compact' : ''}`} ref={ref}>
      {ready ? (
        <HistoryChartSvg
          numeric={numeric}
          definition={definition}
          width={width}
          height={height}
          showPoints={showPoints && !compact}
          showValueTag={showValueTag}
          xLabel={xLabel}
          compact={compact}
          forecast={forecast}
        />
      ) : (
        <div className="history-chart-empty">Collecting samples…</div>
      )}
    </div>
  );
}

function HistoryChartSvg({ numeric, definition, width, height, showPoints, showValueTag, xLabel, compact, forecast }) {
  const padL = compact ? 38 : 52;
  const padR = compact ? 10 : 18;
  const padT = compact ? 10 : 16;
  const padB = compact ? 22 : 30;
  const plotW = Math.max(1, width - padL - padR);
  const plotH = Math.max(1, height - padT - padB);

  // ML forecast overlay: predicted samples are spaced in seconds, so convert
  // them into fractional sample indices using the observed sample cadence.
  // The x-domain is widened (capped at +45%) so the dashed line has room.
  const n = numeric.length;
  const first = numeric[0];
  const last0 = numeric[n - 1];
  const dtAvg = first.time != null && last0.time != null && n > 1
    ? Math.max((last0.time - first.time) / 1000 / (n - 1), 1e-3)
    : 1;
  const maxExtra = (n - 1) * 0.45;
  const forecastPts = (forecast || [])
    .filter((f) => Number.isFinite(f.dt) && Number.isFinite(f.alt) && f.dt > 0)
    .map((f) => ({ idx: (n - 1) + f.dt / dtAvg, value: f.alt }))
    .filter((f) => f.idx <= (n - 1) + maxExtra);
  const domainMax = forecastPts.length
    ? Math.max(...forecastPts.map((f) => f.idx))
    : n - 1;

  const values = numeric.map((s) => s.value);
  const forecastValues = forecastPts.map((f) => f.value);
  const dataMin = Math.min(...values, ...(forecastValues.length ? forecastValues : [Infinity]));
  const dataMax = Math.max(...values, ...(forecastValues.length ? forecastValues : [-Infinity]));
  const ticks = niceTicks(dataMin, dataMax, compact ? 3 : 4);
  const axisMin = Math.min(dataMin, ticks[0]);
  const axisMax = Math.max(dataMax, ticks[ticks.length - 1]);
  const range = axisMax - axisMin || 1;

  const toX = (i) => padL + (i / Math.max(domainMax, 1)) * plotW;
  const toY = (value) => padT + (1 - (value - axisMin) / range) * plotH;

  const points = numeric.map((sample, i) => ({ x: toX(i), y: toY(sample.value), sample }));
  const line = `M ${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;
  const area = `${line} L ${points[points.length - 1].x.toFixed(1)},${padT + plotH} L ${points[0].x.toFixed(1)},${padT + plotH} Z`;
  const last = points[points.length - 1];
  const gid = `hist-${definition.id}`;

  // Evenly sample x-axis labels from the available points.
  const labelCount = compact ? 5 : 6;
  const xTicks = [];
  for (let k = 0; k < labelCount; k += 1) {
    const i = Math.round((k / (labelCount - 1)) * (numeric.length - 1));
    xTicks.push({ x: toX(i), label: xLabel(numeric[i].missionTime) });
  }

  return (
    <svg width={width} height={height} role="img" aria-label={`${definition.label} history chart`}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={definition.color} stopOpacity="0.30" />
          <stop offset="100%" stopColor={definition.color} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {ticks.map((tickValue) => {
        const y = toY(tickValue);
        return (
          <g key={tickValue}>
            <line className="chart-grid" x1={padL} x2={width - padR} y1={y} y2={y} />
            <text className="chart-axis-label" x={padL - 8} y={y} textAnchor="end" dominantBaseline="middle">
              {formatTelemetryValue(tickValue, definition)}
            </text>
          </g>
        );
      })}

      {xTicks.map((tick, i) => (
        <text
          key={`${tick.x}-${i}`}
          className="chart-axis-label"
          x={tick.x}
          y={height - padB + 16}
          textAnchor="middle"
        >
          {tick.label}
        </text>
      ))}

      <path d={area} fill={`url(#${gid})`} />
      <path className="chart-line" d={line} stroke={definition.color} vectorEffect="non-scaling-stroke" />

      {forecastPts.length > 0 && (
        <g className="chart-forecast">
          <path
            className="chart-forecast-line"
            d={`M ${last.x.toFixed(1)},${last.y.toFixed(1)} L ${forecastPts
              .map((f) => `${toX(f.idx).toFixed(1)},${toY(f.value).toFixed(1)}`)
              .join(' L ')}`}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
          <text
            className="chart-forecast-label"
            x={toX(forecastPts[forecastPts.length - 1].idx)}
            y={toY(forecastPts[forecastPts.length - 1].value) - 8}
            textAnchor="end"
          >
            AI FORECAST
          </text>
        </g>
      )}

      {showPoints &&
        points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.4" fill={definition.color} />
        ))}

      {showValueTag && (
        <text className="chart-value-tag" x={last.x} y={last.y - 10} textAnchor="end">
          {formatTelemetryValue(last.sample.value, definition)} {definition.unit}
        </text>
      )}
    </svg>
  );
}
