const FLIGHT_STATE_PHASE = {
  0: 'READY',
  1: 'BOOST',
  2: 'ASCENT',
  3: 'COAST',
  4: 'DESCENT',
  5: 'RECOVERY',
};

const BASE_LAT = 42.3223;
const BASE_LON = -83.1763;

export function mapBackendPacket(packet, { roll, missionStartMs, gpsOrigin }) {
  const missionTime =
    missionStartMs != null && packet.timestamp_ms != null
      ? Math.floor((packet.timestamp_ms - missionStartMs) / 1000)
      : undefined;

  const gps = typeof packet.GPS === 'number' ? packet.GPS : BASE_LON;
  const lonDelta = gpsOrigin != null ? gps - gpsOrigin.lon : 0;

  return {
    alt: Number(packet.altitude_est),
    velocity: Number(packet.vel_est),
    acceleration: Number(
      packet.acceleration ?? packet.accel ?? packet.accelerometer ?? 0
    ),
    magneticHeading: packet.magnetic_heading,
    bar: packet.barometric_pressure,
    vol: packet.voltage,
    long: packet.longitude ?? packet.GPS ?? BASE_LON + lonDelta,
    lat: packet.latitude ?? BASE_LAT + lonDelta * 0.65,
    roll,
    packetDropped: packet.droppedPackets ?? 0,
    flightPhase: FLIGHT_STATE_PHASE[packet.flight_state] ?? undefined,
    missionTime,
    cycles: packet.cycles,
  };
}
