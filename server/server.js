const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.REACT_APP_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.TELEMETRY_SERVER_PORT || 4000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const MAX_GYRO_DEG_S = 500;

function saneGyro(value) {
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= MAX_GYRO_DEG_S ? n : undefined;
}

function normalizePacket(raw) {
  if (!raw || typeof raw !== 'object' || Object.keys(raw).length === 0) return null;

  const packet = {
    ...raw,
    cycles: Number(raw.cycles ?? 0),
    timestamp_ms: Number(raw.timestamp_ms ?? Date.now()),
    altitude_est: Number(raw.altitude_est ?? raw.alt ?? 0),
    vel_est: Number(raw.vel_est ?? raw.vel ?? raw.velocity ?? 0),
    acceleration: Number(raw.acceleration ?? raw.accel ?? 0),
    magnetic_heading: Number(raw.magnetic_heading ?? raw['magnetic heading'] ?? 0),
    barometric_pressure: Number(raw.barometric_pressure ?? raw.bar ?? raw['barometric pressure'] ?? 0),
    voltage: Number(raw.voltage ?? raw.vol ?? 0),
  };

  const gyroX = saneGyro(raw.gyro_x);
  const gyroY = saneGyro(raw.gyro_y);
  const gyroZ = saneGyro(raw.gyro_z);
  if (gyroX !== undefined) packet.gyro_x = gyroX;
  if (gyroY !== undefined) packet.gyro_y = gyroY;
  if (gyroZ !== undefined) packet.gyro_z = gyroZ;

  const roll = Number(raw.roll);
  if (Number.isFinite(roll) && Math.abs(roll) <= 180) packet.roll = roll;

  if (!Number.isFinite(packet.cycles) || !Number.isFinite(packet.timestamp_ms)) {
    return null;
  }
  if (!Number.isFinite(packet.altitude_est) || !Number.isFinite(packet.vel_est)) {
    return null;
  }
  return packet;
}

let lastCycle = null;
let droppedPackets = 0;

io.on('connection', (socket) => {
  console.log('[SERVER] Client connected');
  socket.on('disconnect', () => console.log('[SERVER] Client disconnected'));
});

// Poll the ML insights endpoint at 2 Hz and broadcast predictions + narrated
// flight events alongside the raw telemetry stream.
setInterval(async () => {
  try {
    const response = await axios.get(`${BACKEND_URL}/get_insights`);
    const insights = response.data;
    if (insights && (insights.predictions || insights.events)) {
      io.emit('insights', insights);
    }
  } catch {
    // Backend offline — the React app computes its own client-side insights
  }
}, 500);

setInterval(async () => {
  try {
    const response = await axios.get(`${BACKEND_URL}/get_packet`);
    const packet = normalizePacket(response.data);
    if (!packet) return;

    if (lastCycle !== null) {
      const gap = packet.cycles - lastCycle;
      if (gap > 50) {
        lastCycle = null;
        droppedPackets = 0;
      } else if (gap > 1) {
        droppedPackets += gap - 1;
      }
    }

    lastCycle = packet.cycles;

    io.emit('telemetry', {
      ...packet,
      droppedPackets,
    });
  } catch {
    // Backend offline — mock fallback runs in the React app
  }
}, 100);

server.listen(PORT, () => {
  console.log('Telemetry bridge on http://localhost:' + PORT);
  console.log('Polling backend at ' + BACKEND_URL);
});
