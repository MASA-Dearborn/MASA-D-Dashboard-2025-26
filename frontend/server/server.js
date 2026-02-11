// frontend/server/server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

const PORT = 4000;
const BACKEND_URL = 'http://localhost:5000';

// ======================
// TELEMETRY VALIDATION
// ======================
function isValidTelemetry(p) {
  return (
    p &&
    typeof p === 'object' &&
    typeof p.cycles === 'number' &&
    typeof p.timestamp_ms === 'number' &&
    typeof p.altitude_est === 'number' &&
    typeof p.vel_est === 'number' &&
    typeof p.acceleration === 'number'
  );
}

// ======================
// PACKET TRACKING
// ======================
let lastCycle = null;
let droppedPackets = 0;

io.on('connection', (socket) => {
  console.log('[SERVER] Client connected');

  socket.on('disconnect', () => {
    console.log('[SERVER] Client disconnected');
  });
});

// ======================
// POLL BACKEND @ 10 Hz
// ======================
setInterval(async () => {
  try {
    const response = await axios.get(`${BACKEND_URL}/get_packet`);
    const packet = response.data;

    // Validate telemetry
    if (!isValidTelemetry(packet)) {
      console.warn('[SERVER] Invalid telemetry packet dropped');
      return;
    }

    // Detect dropped packets
    if (lastCycle !== null && packet.cycles !== lastCycle + 1) {
      const missed = packet.cycles - lastCycle - 1;
      if (missed > 0) {
        droppedPackets += missed;
        console.warn(`[SERVER] ⚠️ Dropped ${missed} packet(s)`);
      }
    }

    lastCycle = packet.cycles;

    // Emit enriched telemetry
    io.emit('telemetry', {
      ...packet,
      droppedPackets
    });

    console.log(`[SERVER] Packet ${packet.cycles} → clients`);

  } catch (error) {
    // Backend offline / RF silence
  }
}, 100);

server.listen(PORT, () => {
  console.log('================================');
  console.log('TELEMETRY WEBSOCKET SERVER');
  console.log('================================');
  console.log(`Server: http://localhost:${PORT}`);
  console.log('Waiting for React app on :3000');
});
