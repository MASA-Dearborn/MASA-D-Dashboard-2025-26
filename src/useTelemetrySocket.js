import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { mapBackendPacket } from './mapTelemetryPacket';
import { resolveRoll, stripInvalidGyro } from './gyroUtils';

const SOCKET_URL = process.env.REACT_APP_TELEMETRY_URL || 'http://localhost:4000';

export default function useTelemetrySocket(enabled = true) {
  const [telemetry, setTelemetry] = useState(null);
  const [insights, setInsights] = useState(null);
  const [connected, setConnected] = useState(false);
  const [hasLiveData, setHasLiveData] = useState(false);
  const missionStartRef = useRef(null);
  const gpsOriginRef = useRef(null);
  const rollRef = useRef(0);
  const lastTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return undefined;

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      setConnected(false);
      setHasLiveData(false);
      setTelemetry(null);
      setInsights(null);
      rollRef.current = 0;
      lastTimeRef.current = Date.now();
    };

    const onInsights = (payload) => {
      if (payload && typeof payload === 'object') setInsights(payload);
    };

    const onTelemetry = (rawPacket) => {
      const packet = stripInvalidGyro(rawPacket);
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

      const { roll } = resolveRoll(packet, rollRef.current, dt);
      if (roll !== undefined) rollRef.current = roll;

      setHasLiveData(true);
      setTelemetry((prev) => ({
        ...prev,
        ...mapBackendPacket(packet, {
          roll,
          missionStartMs: missionStartRef.current,
          gpsOrigin: gpsOriginRef.current,
        }),
      }));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('telemetry', onTelemetry);
    socket.on('insights', onInsights);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('telemetry', onTelemetry);
      socket.off('insights', onInsights);
      socket.disconnect();
    };
  }, [enabled]);

  return { telemetry, insights, connected, hasLiveData };
}
