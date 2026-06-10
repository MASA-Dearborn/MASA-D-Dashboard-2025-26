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

function normalizePacket(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const packet = {
    ...raw,
    cycles: Number(raw.cycles),
    timestamp_ms: Number(raw.timestamp_ms),
    altitude_est: Number(raw.altitude_est),
    vel_est: Number(raw.vel_est),
    acceleration: Number(raw.acceleration),
    magnetic_heading: Number(raw.magnetic_heading),
    barometric_pressure: Number(raw.barometric_pressure),
    voltage: Number(raw.voltage),
    gyro_x: Number(raw.gyro_x),
    gyro_y: Number(raw.gyro_y),
    gyro_z: Number(raw.gyro_z),
  };
  if (
    !Number.isFinite(packet.cycles) ||
    !Number.isFinite(packet.timestamp_ms) ||
    !Number.isFinite(packet.altitude_est) ||
    !Number.isFinite(packet.vel_est) ||
    !Number.isFinite(packet.acceleration)
  ) {
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
