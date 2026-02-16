import { useEffect, useRef, useState } from "react";


/* ==========================================================================
   ROCKET MISSION TIMER
   ========================================================================== */
export function RocketTimer() {
  const [elapsedTime, setElapsedTime] = useState(0);


  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsedTime(Date.now() - start), 10);
    return () => clearInterval(id);
  }, []);


  const formatTime = () => {
    const mins = Math.floor((elapsedTime / 60000) % 60);
    const secs = Math.floor((elapsedTime / 1000) % 60);
    const cs = Math.floor((elapsedTime % 1000) / 10);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(cs).padStart(2, "0")}`;
  };


  return (
    <div className="rocket-timer-container">
      <div className="timer-header">MISSION TIME</div>
      <div className="timer-display">T-{formatTime()}</div>
    </div>
  );
}


/* ==========================================================================
   Responsive digit step
   ========================================================================== */
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
    SIZE: 300,
    MINOR_TICK_HEIGHT: 15,
    MAJOR_TICK_HEIGHT: 20,
    TICK_COUNT: 100,
    ARC_START: 90,
    ARC_SWEEP: 360,
    MAX_VALUE: maxValue,
    DIGIT_SPACING: niceStep(maxValue, targetLabels),
  };
}


/* ==========================================================================
   Generate ticks + digits (digits rotate with ticks)
   ========================================================================== */
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


  // base tick geometry
  for (let i = 0; i < TICK_COUNT; i++) {
    const isMajor = majorTickIndices.has(i);
    const tickValue = (i / (TICK_COUNT - 1)) * MAX_VALUE;
    const angle = ARC_START + (tickValue / maxV) * ARC_SWEEP;


    const height = isMajor ? MAJOR_TICK_HEIGHT : MINOR_TICK_HEIGHT;
    const offset = RADIUS - height;


    ticks.push({ id: i, angle, isMajor, offset });
  }


  // base digit geometry
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


  // rotate BOTH layers so vNow lines up with the fixed arrow at ARC_START
  const containerRotation = -((vNow / maxV) * ARC_SWEEP);


  return { ticks, digits, containerRotation };
}


/* ==========================================================================
   Digits layer (rotates with ticks; text stays upright)
   ========================================================================== */
function DigitArcLayer({ digits, digitRadius, rotation }) {
  return (
    <div className="digit-arc-layer" style={{ transform: `rotate(${rotation}deg)` }}>
      {digits.map((d) => (
        <div
          key={d.id}
          className={`digit ${d.isActive ? "active" : ""}`}
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


/* ==========================================================================
   Ticks layer
   ========================================================================== */
function TicksContainer({ ticks, rotation }) {
  return (
    <div className="ticks-container" style={{ transform: `rotate(${rotation}deg)` }}>
      {ticks.map((tick) => (
        <div
          key={tick.id}
          className={`tick ${tick.isMajor ? "major" : ""}`}
          style={{ transform: `rotate(${tick.angle}deg) translateY(-${tick.offset}px)` }}
        />
      ))}
    </div>
  );
}


/* ==========================================================================
   Badge
   ========================================================================== */
function GaugeBadge({ side, label, value }) {
  return (
    <div className={`gauge-badge-${side}`}>
      <svg viewBox="0 0 100 100" className="badge-arc">
        <path className="badge-arc-path" />
        <text className="badge-label-text">
          <textPath href={`#curve-${side}`} startOffset="70%" textAnchor="middle">
            {label}
          </textPath>
        </text>
        <path className="badge-curve" id={`curve-${side}`} />
      </svg>


      <div className="badge-content">
        <span className="badge-value">{Math.floor(value)}</span>
      </div>


      <div className={`gauge-arrow-indicator ${side}`}>
        <svg className="arrow-svg">
          <path className={`arrow-path ${side}`} />
        </svg>
      </div>
    </div>
  );
}


/* ==========================================================================
   SideGauge (exported)
   ========================================================================== */
export function SideGauge({
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
  const DIGIT_RADIUS = baseConfig.SIZE / 2 - 35;


  return (
    <div className={`side-gauge ${side}`}>
      {showDigits && (
        <DigitArcLayer digits={digits} digitRadius={DIGIT_RADIUS} rotation={containerRotation} />
      )}
      <TicksContainer ticks={ticks} rotation={containerRotation} />
      <div className="gauge-ring-bg" />
      <GaugeBadge side={side} label={label} value={value} />
    </div>
  );
}


/* ==========================================================================
   RandomGauges (exported) - updates value + maxValue
   ========================================================================== */
export function RandomGauges() {
  // what you SHOW (smoothly animated)
  const [accMax, setAccMax] = useState(100);
  const [accVal, setAccVal] = useState(0);
  const [velMax, setVelMax] = useState(500);
  const [velVal, setVelVal] = useState(0);


  // what you WANT (jumps here are OK)
  const targetRef = useRef({
    accMax: 100,
    accVal: 0,
    velMax: 500,
    velVal: 0,
  });


  // update targets occasionally (NOT what you render directly)
  useEffect(() => {
    const accChoices = [100, 200, 500, 1000];
    const velChoices = [500, 1000, 2000, 5000];


    const id = setInterval(() => {
      const t = targetRef.current;


      // change scales less often to reduce "label popping"
      if (Math.random() < 0.10) t.accMax = accChoices[Math.floor(Math.random() * accChoices.length)];
      if (Math.random() < 0.10) t.velMax = velChoices[Math.floor(Math.random() * velChoices.length)];


      // random walk targets
      t.accVal = Math.max(0, Math.min(t.accMax, t.accVal + (Math.floor(Math.random() * 41) - 20)));
      t.velVal = Math.max(0, Math.min(t.velMax, t.velVal + (Math.floor(Math.random() * 101) - 50)));


      targetRef.current = t;
    }, 300);


    return () => clearInterval(id);
  }, []);


  // smooth animation loop (eases displayed toward targets)
  useEffect(() => {
    let raf = 0;
    let last = performance.now();


    const tau = 0.43;


    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;


      const a = 1 - Math.exp(-dt / tau);


      const t = targetRef.current;


      setAccMax((m) => m + (t.accMax - m) * a);
      setVelMax((m) => m + (t.velMax - m) * a);


      setAccVal((v) => {
        const next = v + (t.accVal - v) * a;
        return Math.max(0, Math.min(accMax, next));
      });


      setVelVal((v) => {
        const next = v + (t.velVal - v) * a;
        return Math.max(0, Math.min(velMax, next));
      });


      raf = requestAnimationFrame(tick);
    };


    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [accMax, velMax]);


  return (
    <>
      <SideGauge side="left" label="VELOCITY" value={velVal} maxValue={velMax} />
      <SideGauge side="right" label="ACCELERATION" value={accVal} maxValue={accMax} />
    </>
  );
}


/* ==========================================================================
   CROSSHAIR
   ========================================================================== */
export function Crosshair2D({ periodMs = 2000, rotation = { x: 0, y: 0, z: 0 } }) {
  const [glow, setGlow] = useState(false);


  useEffect(() => {
    const id = setInterval(() => setGlow((g) => !g), periodMs / 2);
    return () => clearInterval(id);
  }, [periodMs]);


  const rollDeg = -(rotation.z * 180) / Math.PI;


  return (
    <div
      className={`crosshair ${glow ? "glow" : ""}`}
      style={{ transform: `translate(-50%, -50%) rotate(${rollDeg}deg)` }}
    >
      <div className="crosshair-line h left" />
      <div className="crosshair-line h right" />
      <div className="crosshair-line v top" />
      <div className="crosshair-line v bottom" />
      <div className="crosshair-circle" />
    </div>
  );
}


/* ==========================================================================
   ARC GAUGE
   ========================================================================== */
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
        {x1: -50, y1: -130, x2: -40, y2: -110},
        {x1: 50, y1: -130, x2: 40, y2: -110}
      ]
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
        {x1: -90, y1: 90, x2: -75, y2: 80},
        {x1: -45, y1: 115, x2: -40, y2: 98}
      ]
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
        {x1: 45, y1: 115, x2: 40, y2: 98},
        {x1: 90, y1: 90, x2: 75, y2: 80}
      ]
    }
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
    <div className={`arc-gauge ${position}`} style={{ transform: cfg.transform }}>
      <svg viewBox="-150 -150 300 300" width="100%" height="100%">
        <defs>
          <path id={`arc-text-path-${position}`} d={cfg.textPath} fill="none" />
        </defs>


        {cfg.supports.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                stroke="#FFCB05" strokeWidth="3" opacity="0.8" />
        ))}


        <circle cx={cfg.supports[0].x1} cy={cfg.supports[0].y1} r="5" fill="#3498db" />
        <circle cx={cfg.supports[1].x1} cy={cfg.supports[1].y1} r="5" fill="#3498db" />


        <path d={cfg.d} fill="none" stroke="#1e3a2f" strokeWidth="20" strokeLinecap="round" />
        <path
          d={cfg.d}
          fill="none"
          stroke="#FFCB05"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={offset}
          style={{ filter: "drop-shadow(0 0 4px rgba(0, 102, 255, 0.8))", transition: "all 0.2s ease-out" }}
        />


        <text fill="#FFCB05" fontSize="11" fontWeight="bold" letterSpacing="2">
          <textPath 
            href={`#arc-text-path-${position}`} 
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
          fontSize="13" 
          fontFamily="monospace" 
          fontWeight="bold"
          transform={`rotate(${cfg.valueRotation}, ${cfg.valX}, ${cfg.valY})`}
        >
          {show}
        </text>
      </svg>
    </div>
  );
}


/* ==========================================================================
   HELPER FUNCTIONS
   ========================================================================== */
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


/* ==========================================================================
   ATTITUDE GAUGES - Tracks NavBall rotation in real-time
   ========================================================================== */
export function AttitudeGauges({ rotation }) {
  // Convert radians to degrees and normalize
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
        formatValue={(v) => `${v.toFixed(0)}°`}
      />

      <ArcGauge
        position="bottomLeft"
        label="ROLL"
        value={roll}
        maxValue={180}
        formatValue={(v) => `${v.toFixed(0)}°`}
      />
      
      <ArcGauge
        position="bottomRight"
        label="YAW"
        value={yaw}
        maxValue={360}
        formatValue={(v) => `${v.toFixed(0)}°`}
      />
    </>
  );
}
