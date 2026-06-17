/** Gyro / roll helpers for live telemetry and the navball. */

export const MAX_GYRO_DEG_S = 500;
export const MAX_ROLL_DEG = 180;
export const MAX_INTEGRATION_DT_SEC = 0.25;

export function norm180(deg) {
  if (!Number.isFinite(deg)) return 0;
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function saneGyroRate(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_GYRO_DEG_S;
}

export function saneRoll(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_ROLL_DEG;
}

/** Drop garbage gyro fields so they are never integrated or stored. */
export function stripInvalidGyro(packet) {
  if (!packet || typeof packet !== 'object') return packet;
  const out = { ...packet };
  for (const key of ['gyro_x', 'gyro_y', 'gyro_z']) {
    if (!saneGyroRate(out[key])) delete out[key];
  }
  if (!saneRoll(out.roll)) delete out.roll;
  return out;
}

/** Integrate roll rate (deg/s) over dt (seconds). */
export function integrateRollFromGyro(prevRoll, gyroZ, dtSec) {
  if (!saneGyroRate(gyroZ)) return prevRoll;
  const dt = Math.min(Math.max(dtSec, 0), MAX_INTEGRATION_DT_SEC);
  return norm180(prevRoll + gyroZ * dt);
}

/**
 * Prefer fused roll from the flight computer; otherwise integrate gyro_z.
 * Returns { roll, hasGyro }.
 */
export function resolveRoll(packet, prevRoll = 0, dtSec = 0) {
  if (saneRoll(packet?.roll)) {
    return { roll: packet.roll, hasGyro: true };
  }
  if (saneGyroRate(packet?.gyro_z)) {
    return {
      roll: integrateRollFromGyro(prevRoll, packet.gyro_z, dtSec),
      hasGyro: true,
    };
  }
  return { roll: undefined, hasGyro: false };
}
