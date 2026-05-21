import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { mapBackendPacket } from './mapTelemetryPacket';

const SOCKET_URL = process.env.REACT_APP_TELEMETRY_URL || 'http://localhost:4000';

export default function useTelemetrySocket(enabled = true) {
  const [telemetry, setTelemetry] = useState(null);
  const [connected, setConnected] = useState(false);
  const [hasLiveData, setHasLiveData] = useState(false);
  const rollRef = useRef(0);
  const missionStartRef = useRef(null);
  const gpsOriginRef = useRef(null);
  const lastTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return undefined;

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      setConnected(false);
      setHasLiveData(false);
      setTelemetry(null);
    };

    const onTelemetry = (packet) => {
      if (!packet || typeof packet.cycles !== 'number') return;

      if (missionStartRef.current == null && packet.timestamp_ms != null) {
        missionStartRef.current = packet.timestamp_ms;
      }

      if (gpsOriginRef.current == null && typeof packet.GPS === 'number') {
        gpsOriginRef.current = { lon: packet.GPS, lat: packet.latitude ?? 42.3223 };
      }

      const now = Date.now();
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      let nextRoll = rollRef.current + (packet.gyro_z ?? 0) * dt * 0.5;
      if (nextRoll > 180) nextRoll -= 360;
      if (nextRoll < -180) nextRoll += 360;
      rollRef.current = nextRoll;

      setHasLiveData(true);
      setTelemetry((prev) => ({
        ...prev,
        ...mapBackendPacket(packet, {
          roll: nextRoll,
          missionStartMs: missionStartRef.current,
          gpsOrigin: gpsOriginRef.current,
        }),
      }));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('telemetry', onTelemetry);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('telemetry', onTelemetry);
      socket.disconnect();
    };
  }, [enabled]);

  return { telemetry, connected, hasLiveData };
}
