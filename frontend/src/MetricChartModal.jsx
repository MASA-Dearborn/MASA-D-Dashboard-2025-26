import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { METRICS } from './metricDefinitions';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

const PHASE_LABELS = ['READY', 'BOOST', 'ASCENT', 'COAST', 'DESCENT', 'RECOVERY'];

function MetricChartModal({ metricId, history, onClose }) {
  const metric = METRICS[metricId];

  const chart = useMemo(() => {
    if (!metric || !history.length) {
      return { labels: [], datasets: [] };
    }

    const labels = history.map((s) =>
      s.useMissionTime ? `${Number(s.t).toFixed(0)}s` : `${Number(s.t).toFixed(1)}s`
    );
    const values = history.map((s) => {
      const v = metric.getValue(s);
      return v == null || Number.isNaN(Number(v)) ? null : Number(v);
    });

    return {
      labels,
      datasets: [
        {
          label: `${metric.label} (${metric.unit})`,
          data: values,
          borderColor: metric.color,
          backgroundColor: metric.fill,
          fill: true,
          tension: metric.isPhase ? 0 : 0.25,
          stepped: metric.isPhase ? 'after' : false,
          pointRadius: history.length > 80 ? 0 : 2,
          borderWidth: 2,
        },
      ],
    };
  }, [metric, history]);

  if (!metric) return null;

  const latest = history[history.length - 1];
  const currentVal = latest ? metric.getValue(latest) : null;
  const displayCurrent = metric.isPhase
    ? latest?.flightPhaseLabel ?? '--'
    : metric.format(currentVal);

  const timeLabel = history[0]?.useMissionTime ? 'Mission time (s)' : 'Elapsed time (s)';

  return (
    <div className="metric-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="metric-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metric-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="metric-modal-header">
          <div>
            <span className="metric-modal-kicker">Telemetry history</span>
            <h2 id="metric-modal-title">{metric.label}</h2>
          </div>
          <button type="button" className="metric-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p className="metric-modal-desc">{metric.description}</p>

        <div className="metric-modal-current">
          <span>Current</span>
          <strong>
            {displayCurrent}
            {!metric.isPhase && metric.unit ? ` ${metric.unit}` : ''}
          </strong>
          <span className="metric-modal-points">{history.length} samples</span>
        </div>

        <div className="metric-modal-chart">
          {history.length < 2 ? (
            <p className="metric-modal-empty">Collecting data… wait for a few packets from the buffer.</p>
          ) : (
            <Line
              data={chart}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                  legend: { display: false },
                  tooltip: metric.isPhase
                    ? {
                        callbacks: {
                          label: (ctx) => {
                            const phase =
                              history[ctx.dataIndex]?.flightPhaseLabel ??
                              PHASE_LABELS[ctx.parsed.y] ??
                              ctx.parsed.y;
                            return `Phase: ${phase}`;
                          },
                        },
                      }
                    : undefined,
                },
                scales: {
                  x: {
                    ticks: { color: '#9cb2cf', maxTicksLimit: 12 },
                    grid: { color: 'rgba(121, 162, 214, 0.12)' },
                  },
                  y: {
                    ticks: {
                      color: '#9cb2cf',
                      ...(metric.isPhase
                        ? {
                            stepSize: 1,
                            callback: (v) => PHASE_LABELS[v] ?? v,
                          }
                        : {}),
                    },
                    grid: { color: 'rgba(121, 162, 214, 0.12)' },
                    suggestedMin: metric.isPhase ? -0.5 : undefined,
                    suggestedMax: metric.isPhase ? 5.5 : undefined,
                  },
                },
              }}
            />
          )}
        </div>

        <p className="metric-modal-axis-label">X-axis: {timeLabel}</p>
      </section>
    </div>
  );
}

export default MetricChartModal;
