export const PHASE_TO_NUM = {
  READY: 0,
  ARMED: 0,
  BOOST: 1,
  ASCENT: 2,
  COAST: 3,
  DESCENT: 4,
  RECOVERY: 5,
};

export const METRICS = {
  ALT: {
    id: 'ALT',
    label: 'Altitude',
    unit: 'm',
    color: '#06b6d4',
    fill: 'rgba(6, 182, 212, 0.12)',
    description:
      'Estimated height above launch pad from barometric/GPS fusion. Rises during boost and coast, peaks at apogee, then falls during descent.',
    getValue: (s) => s.alt,
    format: (v) => (v == null ? '--' : Number(v).toFixed(0)),
  },
  ACCEL: {
    id: 'ACCEL',
    label: 'Acceleration',
    unit: 'm/s²',
    color: '#fb923c',
    fill: 'rgba(251, 146, 60, 0.12)',
    description:
      'Body-frame acceleration along the flight axis. High positive values during motor burn, near zero at apogee, negative during free fall and under parachute.',
    getValue: (s) => s.acceleration,
    format: (v) => (v == null ? '--' : Number(v).toFixed(1)),
  },
  VEL: {
    id: 'VEL',
    label: 'Velocity',
    unit: 'm/s',
    color: '#a78bfa',
    fill: 'rgba(167, 139, 250, 0.12)',
    description:
      'Vertical speed (positive = ascending, negative = descending). Increases during boost, decreases through coast, crosses zero near apogee.',
    getValue: (s) => s.velocity,
    format: (v) => (v == null ? '--' : Number(v).toFixed(0)),
  },
  VOLT: {
    id: 'VOLT',
    label: 'Voltage',
    unit: 'V',
    color: '#22c55e',
    fill: 'rgba(34, 197, 94, 0.12)',
    description:
      'Battery bus voltage (typically 3S LiPo ~12.6 V). Sags under heavy current during boost, recovers in coast and descent.',
    getValue: (s) => s.vol,
    format: (v) => (v == null ? '--' : Number(v).toFixed(2)),
  },
  BAR: {
    id: 'BAR',
    label: 'Barometric pressure',
    unit: 'hPa',
    color: '#38bdf8',
    fill: 'rgba(56, 189, 248, 0.12)',
    description:
      'Static air pressure from the barometer. Drops as altitude increases (roughly exponential with height).',
    getValue: (s) => s.bar,
    format: (v) => (v == null ? '--' : Number(v).toFixed(1)),
  },
  RSSI: {
    id: 'RSSI',
    label: 'Signal strength (RSSI)',
    unit: '%',
    color: '#f472b6',
    fill: 'rgba(244, 114, 182, 0.12)',
    description:
      'Derived link quality from packet drops. 100% = clean link; lower values mean missed telemetry packets.',
    getValue: (s) => s.rssi,
    format: (v) => (v == null ? '--' : Number(v).toFixed(0)),
  },
  'FLIGHT PHASE': {
    id: 'FLIGHT PHASE',
    label: 'Flight phase',
    unit: 'state',
    color: '#ffd24c',
    fill: 'rgba(255, 210, 76, 0.12)',
    description:
      'Flight computer state: READY → BOOST → ASCENT/COAST → DESCENT → RECOVERY. Graph shows state index over mission time.',
    getValue: (s) => s.flightPhaseNum,
    format: () => '--',
    isPhase: true,
  },
};

export function buildHistorySample(telemetry, signalStrength, flightPhase) {
  const missionTime =
    telemetry.missionTime != null ? Number(telemetry.missionTime) : null;

  return {
    t: missionTime ?? Date.now() / 1000,
    useMissionTime: missionTime != null,
    alt: telemetry.alt,
    acceleration: telemetry.acceleration,
    velocity: telemetry.velocity,
    vol: telemetry.vol,
    bar: telemetry.bar,
    rssi: signalStrength,
    flightPhaseLabel: flightPhase,
    flightPhaseNum: PHASE_TO_NUM[flightPhase] ?? 0,
    cycles: telemetry.cycles,
  };
}
