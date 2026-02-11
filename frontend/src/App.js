import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import NavBall from './NavBall';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import './App.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

const socket = io('http://localhost:4000');

const chartColors = {
  altitude: { border: '#06b6d4', fill: 'rgba(6, 182, 212, 0.15)' },
  velocity: { border: '#a78bfa', fill: 'rgba(167, 139, 250, 0.15)' },
  acceleration: { border: '#fb923c', fill: 'rgba(251, 146, 60, 0.15)' },
  gyroX: '#ef4444',
  gyroY: '#22c55e',
  gyroZ: '#3b82f6'
};

function App() {
  const [telemetry, setTelemetry] = useState({
    altitude_est: 0,
    vel_est: 0,
    flight_state: 0,
    acceleration: 0,
    cycles: 0,
    droppedPackets: 0
  });

  const [connected, setConnected] = useState(false);
  const [roll, setRoll] = useState(0);
  const lastTimeRef = useRef(Date.now());

  const [chartData, setChartData] = useState({
    timestamps: [],
    altitude: [],
    velocity: [],
    acceleration: [],
    gyroX: [],
    gyroY: [],
    gyroZ: []
  });

  const maxPoints = 50;

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('telemetry', (data) => {
      if (!data || typeof data.cycles !== 'number') return;

      const now = Date.now();
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      setRoll(r => {
        let next = r + (data.gyro_z ?? 0) * dt * 0.5;
        if (next > 180) next -= 360;
        if (next < -180) next += 360;
        return next;
      });

      setTelemetry(data);

      setChartData(prev => {
        const time = new Date(data.timestamp_ms).toLocaleTimeString();

        const next = {
          timestamps: [...prev.timestamps, time],
          altitude: [...prev.altitude, data.altitude_est ?? 0],
          velocity: [...prev.velocity, data.vel_est ?? 0],
          acceleration: [...prev.acceleration, data.acceleration ?? 0],
          gyroX: [...prev.gyroX, data.gyro_x ?? 0],
          gyroY: [...prev.gyroY, data.gyro_y ?? 0],
          gyroZ: [...prev.gyroZ, data.gyro_z ?? 0]
        };

        Object.keys(next).forEach(key => {
          if (next[key].length > maxPoints) {
            next[key] = next[key].slice(-maxPoints);
          }
        });

        return next;
      });
    });

    return () => {
      socket.off('telemetry');
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        labels: {
          color: '#94a3b8',
          font: { family: 'JetBrains Mono', size: 11 }
        }
      }
    },
    scales: {
      x: { display: false },
      y: {
        ticks: { color: '#64748b', font: { size: 10 } },
        grid: { color: 'rgba(100, 116, 139, 0.15)' },
        border: { display: false }
      }
    }
  };

  return (
    <div className="App">
      <div className="app-content">
        <header className="header">
          <h1>ROCKET TELEMETRY</h1>
          <p className="subtitle">MASA Dashboard</p>
          <div className="status-bar">
            <span className={`status-dot ${connected ? '' : 'offline'}`} />
            {connected ? 'LIVE' : 'WAITING FOR CONNECTION'}
          </div>
        </header>

        <div className="dashboard-top">
          <div className="stats">
            <Stat label="ALTITUDE" value={telemetry.altitude_est.toFixed(2)} unit="m" />
          <Stat label="VELOCITY" value={telemetry.vel_est.toFixed(2)} unit="m/s" />
          <Stat label="FLIGHT STATE" value={telemetry.flight_state} unit="state" />
          <Stat label="PACKET" value={telemetry.cycles} unit="count" />
            <Stat label="DROPPED" value={telemetry.droppedPackets} unit="pkts" highlight />
          </div>
          <NavBall
            acceleration={telemetry.acceleration}
            magneticHeading={telemetry.magnetic_heading ?? 0}
            roll={roll}
          />
        </div>

        <div className="charts">
          <Chart
            title="Altitude"
            data={chartData.altitude}
            labels={chartData.timestamps}
            color={chartColors.altitude}
          />
          <Chart
            title="Velocity"
            data={chartData.velocity}
            labels={chartData.timestamps}
            color={chartColors.velocity}
          />
          <Chart
            title="Acceleration"
            data={chartData.acceleration}
            labels={chartData.timestamps}
            color={chartColors.acceleration}
          />

          <div className="chart-container">
            <div className="chart-title">Gyroscope (X, Y, Z)</div>
            <Line
              data={{
                labels: chartData.timestamps,
                datasets: [
                  { label: 'Gyro X', data: chartData.gyroX, borderColor: chartColors.gyroX },
                  { label: 'Gyro Y', data: chartData.gyroY, borderColor: chartColors.gyroY },
                  { label: 'Gyro Z', data: chartData.gyroZ, borderColor: chartColors.gyroZ }
                ]
              }}
              options={chartOptions}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, highlight }) {
  return (
    <div className={`stat-box ${highlight ? 'highlight' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-unit">{unit}</div>
    </div>
  );
}

function Chart({ title, data, labels, color }) {
  const opts = typeof color === 'object'
    ? { borderColor: color.border, backgroundColor: color.fill }
    : { borderColor: color, backgroundColor: `${color}22` };

  return (
    <div className="chart-container">
      <div className="chart-title">{title}</div>
      <Line
        data={{
          labels,
          datasets: [{
            label: title,
            data,
            borderColor: opts.borderColor,
            backgroundColor: opts.backgroundColor,
            fill: true,
            tension: 0.4
          }]
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          plugins: {
            legend: { labels: { color: '#94a3b8', font: { size: 11 } } }
          },
          scales: {
            x: { display: false },
            y: {
              ticks: { color: '#64748b', font: { size: 10 } },
              grid: { color: 'rgba(100, 116, 139, 0.15)' },
              border: { display: false }
            }
          }
        }}
      />
    </div>
  );
}

export default App;
