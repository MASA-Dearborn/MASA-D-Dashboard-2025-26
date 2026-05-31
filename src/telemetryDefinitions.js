// Telemetry configuration layer.
// ---------------------------------------------------------------------------
// The UI never reads raw packet fields directly. Every metric is described
// here with: a stable `id`, display `label`/`shortLabel`, `unit`, `precision`,
// chart `color`, and a list of `aliases`. `readTelemetryValue` walks the
// aliases (supporting dotted paths) so the incoming telemetry schema can change
// field names last-minute without touching any component. Anything not present
// in a packet simply resolves to `undefined` and the UI degrades gracefully.

const TELEMETRY_DEFINITIONS = [
  {
    id: 'altitude',
    label: 'Altitude',
    shortLabel: 'ALTITUDE',
    unit: 'm',
    precision: 0,
    color: '#f4c430',
    icon: 'altitude',
    aliases: ['alt', 'altitude', 'altitudeMeters', 'altitude_m'],
    secondary: 'max',
    maxLabel: 'MAX',
    description:
      'Vehicle altitude above the launch site. Depending on the incoming packet this maps to GPS, barometric, or fused altitude.',
  },
  {
    id: 'velocity',
    label: 'Velocity',
    shortLabel: 'VELOCITY',
    unit: 'm/s',
    precision: 0,
    color: '#3aa0ff',
    icon: 'velocity',
    aliases: ['velocity', 'vel', 'speed', 'velocityMps'],
    secondary: 'max',
    maxLabel: 'MAX',
    description:
      'Vehicle speed estimate, usually derived from GPS, barometric integration, or simulated telemetry during testing.',
  },
  {
    id: 'voltage',
    label: 'Voltage',
    shortLabel: 'VOLTAGE',
    unit: 'V',
    precision: 2,
    color: '#48d6ff',
    icon: 'voltage',
    aliases: ['vol', 'volt', 'voltage', 'batteryVoltage', 'battery_v'],
    secondary: 'nominal',
    nominal: '12.00 V',
    description:
      'Battery bus voltage (typically 3S LiPo ~12.6 V). Sags under heavy current during boost, recovers in coast and descent.',
  },
  {
    id: 'pressure',
    label: 'Pressure',
    shortLabel: 'PRESSURE',
    unit: 'hPa',
    precision: 1,
    color: '#a06bff',
    icon: 'pressure',
    aliases: ['bar', 'pressure', 'pressureHpa', 'barometer', 'hpa'],
    secondary: 'nominal',
    nominal: '1013.25 hPa',
    description:
      'Barometric pressure reading. Decreases with altitude and is commonly fused into the altitude estimate.',
  },
  {
    id: 'rssi',
    label: 'RSSI',
    shortLabel: 'RSSI',
    unit: '%',
    precision: 0,
    color: '#38d977',
    icon: 'rssi',
    aliases: ['rssi', 'signalStrength', 'signal', 'linkQuality'],
    secondary: 'quality',
    description:
      'Radio link quality estimate. Both raw signal strength and recent packet drops feed into this view.',
  },
  {
    id: 'acceleration',
    // IMU-derived and explicitly optional. May be removed from the packet;
    // any consumer must tolerate `undefined` (the G-force gauge and navball do).
    label: 'Acceleration',
    shortLabel: 'ACCEL',
    unit: 'm/s²',
    precision: 1,
    color: '#ff7a59',
    icon: 'acceleration',
    aliases: ['acceleration', 'accel', 'accelMagnitude', 'accelerationMps2'],
    optional: true,
    description:
      'Current acceleration estimate from the IMU. Optional — if IMU data is dropped this metric and the G-force gauge degrade to an empty state.',
  },
  {
    id: 'flightPhase',
    label: 'Flight Phase',
    shortLabel: 'PHASE',
    unit: '',
    precision: 0,
    color: '#f4c430',
    icon: 'phase',
    aliases: ['flightPhase', 'phase', 'state'],
    description:
      'Current mission phase. Intentionally string-based so phase names can change late without breaking the UI.',
  },
  {
    id: 'packetDrops',
    label: 'Packet Drops',
    shortLabel: 'ALERTS',
    unit: '',
    precision: 0,
    color: '#ffcf3f',
    icon: 'alert',
    aliases: ['packetDropped', 'packetDrops', 'droppedPackets', 'link.packetDrops'],
    description: 'Recent packet-drop count or alert state from the telemetry link.',
  },
];

// Temperature channels are rendered in their own panel rather than as cards,
// but are still alias-driven so real telemetry can supply them (and they
// degrade to "--" when absent).
export const TEMPERATURE_CHANNELS = [
  { id: 'avionics', label: 'Avionics', aliases: ['avionicsTemp', 'tempAvionics', 'temp_avionics'] },
  { id: 'battery', label: 'Battery', aliases: ['batteryTemp', 'tempBattery', 'temp_battery'] },
  { id: 'motor', label: 'Motor', aliases: ['motorTemp', 'tempMotor', 'temp_motor'] },
];

function getNestedValue(source, path) {
  return path.split('.').reduce((value, key) => {
    if (value == null) return undefined;
    return value[key];
  }, source);
}

// Resolve the first alias that is present in the packet. `fallbacks` lets the
// dashboard inject derived values (e.g. an RSSI computed from packet drops).
export function readTelemetryValue(telemetry, definition, fallbacks = {}) {
  if (!definition) return undefined;
  if (fallbacks[definition.id] != null) return fallbacks[definition.id];

  for (const alias of definition.aliases || []) {
    const value = alias.includes('.') ? getNestedValue(telemetry, alias) : telemetry?.[alias];
    if (value != null) return value;
  }

  return undefined;
}

export function readByAliases(telemetry, aliases = []) {
  for (const alias of aliases) {
    const value = alias.includes('.') ? getNestedValue(telemetry, alias) : telemetry?.[alias];
    if (value != null) return value;
  }
  return undefined;
}

export function formatTelemetryValue(value, definition) {
  if (value == null || value === '') return '--';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '--';
    if ((definition?.precision ?? 0) === 0) {
      return Math.round(value).toLocaleString('en-US');
    }
    return value.toFixed(definition.precision);
  }
  return String(value);
}

export function getDefinition(id) {
  return TELEMETRY_DEFINITIONS.find((definition) => definition.id === id);
}

// Qualitative RSSI banding used for the card footnote ("EXCELLENT", etc.).
export function getSignalQuality(value) {
  if (value == null || !Number.isFinite(value)) return { label: '--', tone: 'muted' };
  if (value >= 88) return { label: 'EXCELLENT', tone: 'good' };
  if (value >= 72) return { label: 'GOOD', tone: 'good' };
  if (value >= 55) return { label: 'FAIR', tone: 'warn' };
  return { label: 'WEAK', tone: 'bad' };
}

export default TELEMETRY_DEFINITIONS;
