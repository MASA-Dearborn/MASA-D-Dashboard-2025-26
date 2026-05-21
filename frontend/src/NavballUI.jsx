import { useEffect, useRef, useState } from "react";

function niceStep(maxValue, targetLabels = 20) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return 1;

  const raw = maxValue / targetLabels;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / exp;

  const allow2_5 = exp >= 10;

  let nice;
  if (frac <= 1) nice = 1;
  else if (frac <= 2) nice = 2;
  else if (frac <= 2.5 && allow2_5) nice = 2.5;
  else if (frac <= 5) nice = 5;
  else nice = 10;

  return Math.max(1, Math.round(nice * exp));
}


function getGaugeConfig({ maxValue = 100, targetLabels = 20 } = {}) {
  return {
    SIZE: 170,
    MINOR_TICK_HEIGHT: 9,
    MAJOR_TICK_HEIGHT: 12,
    TICK_COUNT: 100,
    ARC_START: 90,
    ARC_SWEEP: 360,
    MAX_VALUE: maxValue,
    DIGIT_SPACING: niceStep(maxValue, targetLabels),
  };
}


function generateTicksAndDigits(config, value, { hideLastLabel = true } = {}) {
  const {
    TICK_COUNT,
    ARC_START,
    ARC_SWEEP,
    MAJOR_TICK_HEIGHT,
    MINOR_TICK_HEIGHT,
    SIZE,
    MAX_VALUE,
    DIGIT_SPACING,
  } = config;

  const RADIUS = SIZE / 2;
  const ticks = [];
  const digits = [];

  const maxV = Math.max(1e-9, MAX_VALUE);
  const vNow = Math.max(0, Math.min(MAX_VALUE, value));

  const digitValues = [];
  for (let v = 0; v <= MAX_VALUE; v += DIGIT_SPACING) digitValues.push(v);
  if (hideLastLabel && digitValues.length > 0) digitValues.pop();
  if (digitValues.length === 0) digitValues.push(0);

  const activeValue = digitValues.reduce(
    (best, v) => (Math.abs(v - vNow) < Math.abs(best - vNow) ? v : best),
    digitValues[0]
  );

  const majorTickIndices = new Set(
    digitValues.map((dv) => Math.round((dv / maxV) * (TICK_COUNT - 1)))
  );

  for (let i = 0; i < TICK_COUNT; i++) {
    const isMajor = majorTickIndices.has(i);
    const tickValue = (i / (TICK_COUNT - 1)) * MAX_VALUE;
    const angle = ARC_START + (tickValue / maxV) * ARC_SWEEP;
    const height = isMajor ? MAJOR_TICK_HEIGHT : MINOR_TICK_HEIGHT;
    const offset = RADIUS - height;
    ticks.push({ id: i, angle, isMajor, offset });
  }

  for (const digitValue of digitValues) {
    const angle = ARC_START + (digitValue / maxV) * ARC_SWEEP;
    digits.push({
      id: digitValue,
      value: digitValue,
      angle,
      opacity: 1,
      isActive: digitValue === activeValue,
    });
  }

  const containerRotation = -((vNow / maxV) * ARC_SWEEP);

  return { ticks, digits, containerRotation };
}


function DigitArcLayer({ digits, digitRadius, rotation }) {
  return (
    <div className="nb-digit-arc-layer" style={{ transform: `rotate(${rotation}deg)` }}>
      {digits.map((d) => (
        <div
          key={d.id}
          className={`nb-digit ${d.isActive ? "active" : ""}`}
          style={{
            opacity: d.opacity,
            transform: `translate(-50%, -50%) rotate(${d.angle}deg) translateY(-${digitRadius}px) rotate(${-(d.angle + rotation)}deg)`,
          }}
        >
          {d.value}
        </div>
      ))}
    </div>
  );
}


function TicksContainer({ ticks, rotation }) {
  return (
    <div className="nb-ticks-container" style={{ transform: `rotate(${rotation}deg)` }}>
      {ticks.map((tick) => (
        <div
          key={tick.id}
          className={`nb-tick ${tick.isMajor ? "major" : ""}`}
          style={{ transform: `rotate(${tick.angle}deg) translateY(-${tick.offset}px)` }}
        />
      ))}
    </div>
  );
}


function GaugeBadge({ side, label, value }) {
  return (
    <div className={`nb-gauge-badge-${side}`}>
      <svg viewBox="0 0 100 100" className="nb-badge-arc">
        <path className="nb-badge-arc-path" />
        <text className="nb-badge-label-text">
          <textPath href={`#nb-curve-${side}`} startOffset="70%" textAnchor="middle">
            {label}
          </textPath>
        </text>
        <path className="nb-badge-curve" id={`nb-curve-${side}`} />
      </svg>

      <div className="nb-badge-content">
        <span className="nb-badge-value">{Math.floor(value)}</span>
      </div>

      <div className={`nb-gauge-arrow-indicator ${side}`}>
        <svg className="nb-arrow-svg">
          <path className={`nb-arrow-path ${side}`} />
        </svg>
      </div>
    </div>
  );
}


export function NavballSideGauge({
  side,
  label,
  value = 0,
  maxValue = 100,
  targetLabels = 20,
  hideLastLabel = true,
}) {
  const baseConfig = getGaugeConfig({ maxValue, targetLabels });
  const configWithStart = { ...baseConfig, ARC_START: side === "right" ? 90 : 270 };

  const { ticks, digits, containerRotation } = generateTicksAndDigits(configWithStart, value, {
    hideLastLabel,
  });

  const showDigits = label === "ACCELERATION" || label === "VELOCITY";
  const DIGIT_RADIUS = baseConfig.SIZE / 2 - 20;

  return (
    <div className={`nb-side-gauge ${side}`}>
      {showDigits && (
        <DigitArcLayer digits={digits} digitRadius={DIGIT_RADIUS} rotation={containerRotation} />
      )}
      <TicksContainer ticks={ticks} rotation={containerRotation} />
      <div className="nb-gauge-ring-bg" />
      <GaugeBadge side={side} label={label} value={value} />
    </div>
  );
}


export function TelemetryGauges({ velocity = 0, acceleration = 0 }) {
  const vel = Math.abs(Number(velocity) || 0);
  const acc = Math.abs(Number(acceleration) || 0);
  const velMax = Math.max(100, Math.ceil(vel * 1.5 / 100) * 100 || 500);
  const accMax = Math.max(100, Math.ceil(acc * 1.5 / 10) * 10 || 100);

  return (
    <>
      <NavballSideGauge side="left" label="VELOCITY" value={vel} maxValue={velMax} />
      <NavballSideGauge side="right" label="ACCELERATION" value={acc} maxValue={accMax} />
    </>
  );
}


export function Crosshair2D({ periodMs = 2000, rotation = { x: 0, y: 0, z: 0 } }) {
  const [glow, setGlow] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setGlow((g) => !g), periodMs / 2);
    return () => clearInterval(id);
  }, [periodMs]);

  const rollDeg = -(rotation.z * 180) / Math.PI;

  return (
    <div
      className={`nb-crosshair ${glow ? "glow" : ""}`}
      style={{ transform: `translate(-50%, -50%) rotate(${rollDeg}deg)` }}
    >
      <div className="nb-crosshair-line h left" />
      <div className="nb-crosshair-line h right" />
      <div className="nb-crosshair-line v top" />
      <div className="nb-crosshair-line v bottom" />
      <div className="nb-crosshair-circle" />
    </div>
  );
}


export function ArcGauge({ position, label, value, maxValue = 100, formatValue }) {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const configs = {
    top: {
      d: "M -50,-130 A 130,130 0 0,1 50,-130",
      textPath: "M -50,-145 A 145,145 0 0,1 50,-145",
      transform: "translate(0, 0)",
      labelStartOffset: "50%",
      valX: 0,
      valY: -139,
      valueRotation: 0,
      supports: [
        { x1: -50, y1: -130, x2: -40, y2: -110 },
        { x1: 50, y1: -130, x2: 40, y2: -110 },
      ],
    },
    bottomLeft: {
      d: "M -90,90 A 130,130 0 0,0 -45,115",
      textPath: "M -100,110 A 145,145 0 0,0 -60,135",
      transform: "translate(0, 0)",
      labelStartOffset: "50%",
      valX: -68,
      valY: 107,
      valueRotation: 30,
      supports: [
        { x1: -90, y1: 90, x2: -75, y2: 80 },
        { x1: -45, y1: 115, x2: -40, y2: 98 },
      ],
    },
    bottomRight: {
      d: "M 45,115 A 130,130 0 0,0 90,90",
      textPath: "M 50,135 A 130,130 0 0,0 100,110",
      transform: "translate(0, -5px)",
      labelStartOffset: "50%",
      valX: 68,
      valY: 107,
      valueRotation: -20,
      supports: [
        { x1: 45, y1: 115, x2: 40, y2: 98 },
        { x1: 90, y1: 90, x2: 75, y2: 80 },
      ],
    },
  };

  const cfg = configs[position];
  const arcLength =
    position === "top" ? 110 :
    position === "left" || position === "right" ? 150 :
    50;

  const safeMax = Math.max(1e-9, maxValue);
  const fillValue = Math.min(Math.abs(displayValue), safeMax);
  const offset = arcLength - (fillValue / safeMax) * arcLength;

  const show = formatValue ? formatValue(displayValue) : displayValue;

  return (
    <div className={`nb-arc-gauge ${position}`} style={{ transform: cfg.transform }}>
      <svg viewBox="-150 -150 300 300" width="100%" height="100%">
        <defs>
          <path id={`nb-arc-text-path-${position}`} d={cfg.textPath} fill="none" />
        </defs>

        {cfg.supports.map((s, i) => (
          <line
            key={i}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke="rgba(255, 203, 5, 0.5)" strokeWidth="2" opacity="0.7"
          />
        ))}

        <circle cx={cfg.supports[0].x1} cy={cfg.supports[0].y1} r="4" fill="rgba(255, 203, 5, 0.6)" />
        <circle cx={cfg.supports[1].x1} cy={cfg.supports[1].y1} r="4" fill="rgba(255, 203, 5, 0.6)" />

        <path d={cfg.d} fill="none" stroke="#001327" strokeWidth="18" strokeLinecap="round" />
        <path
          d={cfg.d}
          fill="none"
          stroke="#FFCB05"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={offset}
          style={{
            filter: "drop-shadow(0 0 4px rgba(255, 203, 5, 0.35))",
            transition: "all 0.25s ease-out",
          }}
        />

        <text fill="rgba(138, 155, 176, 0.85)" fontSize="10" fontWeight="600" letterSpacing="2" fontFamily="'IBM Plex Sans', sans-serif">
          <textPath
            href={`#nb-arc-text-path-${position}`}
            startOffset={cfg.labelStartOffset}
            textAnchor="middle"
          >
            {label}
          </textPath>
        </text>

        <text
          x={cfg.valX}
          y={cfg.valY}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#ffffff"
          fontSize="14"
          fontFamily="'IBM Plex Sans', sans-serif"
          fontWeight="700"
          style={{ textShadow: "0 0 6px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.7)" }}
          stroke="#000915"
          strokeWidth="0.3"
          paintOrder="stroke"
          transform={`rotate(${cfg.valueRotation}, ${cfg.valX}, ${cfg.valY})`}
        >
          {show}
        </text>
      </svg>
    </div>
  );
}


function radToDeg(r) {
  return (r * 180) / Math.PI;
}
function norm360(deg) {
  return ((deg % 360) + 360) % 360;
}
function norm180(deg) {
  const d = norm360(deg);
  return d > 180 ? d - 360 : d;
}


export function AttitudeGauges({ rotation }) {
  const pitch = norm180(radToDeg(rotation?.x ?? 0));
  const yaw = norm360(radToDeg(rotation?.y ?? 0));
  const roll = norm180(-radToDeg(rotation?.z ?? 0));

  return (
    <>
      <ArcGauge
        position="top"
        label="PITCH"
        value={pitch}
        maxValue={180}
        formatValue={(v) => `${v.toFixed(0)}\u00B0`}
      />
      <ArcGauge
        position="bottomLeft"
        label="ROLL"
        value={roll}
        maxValue={180}
        formatValue={(v) => `${v.toFixed(0)}\u00B0`}
      />
      <ArcGauge
        position="bottomRight"
        label="YAW"
        value={yaw}
        maxValue={360}
        formatValue={(v) => `${v.toFixed(0)}\u00B0`}
      />
    </>
  );
}
