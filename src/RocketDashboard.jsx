import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bounds, useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import './RocketDashboard.css';
import NavballAssembly from './NavballAssembly';

const PLACEHOLDER = {
  missionTime: -992,
  velocity: 342,
  acceleration: 47,
  lat: 42.3223,
  long: -83.1763,
  alt: 1524,
  vol: 11.84,
  bar: 1013.2,
  magneticHeading: 45,
  roll: 5,
  packetDropped: 3,
};

const LOGO_SRC = '/logo.png';
const SPACE_BG_SRC = '/space.png';
const ROCKET_IMAGE_SRC = '/rocket.png';
const ROCKET_MODEL_SRC = '/rocket-model/Untitled.glf.gltf';

function formatMissionTime(totalSeconds) {
  if (totalSeconds == null) return '--:--:--';
  const isNegative = totalSeconds < 0;
  const absSeconds = Math.abs(totalSeconds);
  const hours = Math.floor(absSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((absSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (absSeconds % 60).toString().padStart(2, '0');
  return `${isNegative ? '-' : '+'}${hours}:${minutes}:${seconds}`;
}

function formatNumber(value, digits = 0) {
  if (value == null) return '--';
  return Number(value).toFixed(digits);
}

function formatCoordinate(value, positive, negative, digits = 3) {
  if (value == null) return '--';
  const direction = value >= 0 ? positive : negative;
  return `${Math.abs(Number(value)).toFixed(digits)}\u00B0 ${direction}`;
}

function getFlightPhase({ missionTime, alt, velocity, flightPhase }) {
  if (flightPhase) return flightPhase;
  if (missionTime < 0) return 'BOOST';
  if (alt > 1200 || velocity > 250) return 'BOOST';
  if (alt > 250 || velocity > 90) return 'ASCENT';
  return 'READY';
}

function getSignalStrength(packetDropped) {
  if (packetDropped == null) return 84;
  return Math.max(60, 96 - packetDropped * 4);
}

function getPacketRate(packetDropped) {
  if (packetDropped == null) return '10 pkts/s';
  return `${Math.max(6, 13 - packetDropped)} pkts/s`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getRocketAttitude(telemetry, signalStrength) {
  const altitudeRatio = clamp((telemetry.alt || 0) / 2600, 0, 1);
  const velocityRatio = clamp((telemetry.velocity || 0) / 360, 0, 1);
  const pressureRatio = clamp((1013.2 - (telemetry.bar || 1013.2)) / 280, 0, 1);
  const voltageRatio = clamp(((telemetry.vol || 11.8) - 10.8) / 1.8, 0, 1);
  const signalRatio = clamp((signalStrength || 84) / 100, 0, 1);
  const headingRad = THREE.MathUtils.degToRad(telemetry.magneticHeading || 0);

  return {
    altitudeRatio,
    velocityRatio,
    pressureRatio,
    voltageRatio,
    signalRatio,
    pitch: clamp((telemetry.acceleration || 0) * 0.22 + velocityRatio * 6 - pressureRatio * 4, -16, 18),
    yaw: clamp(Math.sin(headingRad) * 7 + (signalRatio - 0.84) * 6, -12, 12),
    roll: clamp((telemetry.roll || 0) * 0.55 + pressureRatio * 5 - (telemetry.packetDropped || 0) * 3, -30, 30),
    stageRoll: clamp((telemetry.roll || 0) * 0.15 + Math.cos(headingRad) * 4, -10, 10),
    stageY: -altitudeRatio * 18 + pressureRatio * 6,
    stageScale: 0.98 + velocityRatio * 0.05 + voltageRatio * 0.01,
  };
}

function TopMetricCard({ label, value, unit, emphasis = false, icon }) {
  return (
    <article className={`top-metric-card ${emphasis ? 'top-metric-card-emphasis' : ''}`}>
      <div className="top-metric-label">{label}</div>
      <div className="top-metric-value">
        <span>{value}</span>
        {unit ? <small>{unit}</small> : null}
        {icon || null}
      </div>
      <div className="top-metric-line" />
    </article>
  );
}

const ICONS = {
  battery: (
    <svg className="side-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="6" width="18" height="12" rx="2" />
      <line x1="23" y1="10" x2="23" y2="14" />
      <rect x="4" y="9" width="8" height="6" rx="1" fill="currentColor" opacity="0.4" />
    </svg>
  ),
  barometer: (
    <svg className="side-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 22h20L12 2z" fill="currentColor" opacity="0.15" />
      <path d="M12 2L2 22h20L12 2z" />
      <line x1="12" y1="9" x2="12" y2="15" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  ),
  signal: (
    <svg className="side-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M2 20h2V14h-2zM7 20h2V10H7zM12 20h2V6h-2zM17 20h2V2h-2z" fill="currentColor" opacity="0.6" />
    </svg>
  ),
  alert: (
    <svg className="side-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 22h20L12 2z" fill="currentColor" opacity="0.2" />
      <path d="M12 2L2 22h20L12 2z" />
      <line x1="12" y1="9" x2="12" y2="14" />
      <circle cx="12" cy="17.5" r="0.5" fill="currentColor" />
    </svg>
  ),
  rssi: (
    <svg style={{ width: 18, height: 18, marginLeft: 4, verticalAlign: 'middle' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 12.55a11 11 0 0114 0" />
      <path d="M8.53 16.11a6 6 0 016.95 0" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  ),
};

function SideStatCard({ label, value, unit, meter = 72, alert = false, icon }) {
  return (
    <article className={`side-stat-card ${alert ? 'side-stat-card-alert' : ''}`}>
      {icon && ICONS[icon]}
      <div className="side-stat-label">{label}</div>
      <div className="side-stat-value">
        <span>{value}</span>
        {unit ? <small>{unit}</small> : null}
      </div>
      <div className="side-stat-meter">
        <div className="side-stat-meter-fill" style={{ width: `${meter}%` }} />
      </div>
    </article>
  );
}

function StatusPanel({ missionTime, signalStrength, packetRate }) {
  const [utcClock, setUtcClock] = useState('--:--:--');

  useEffect(() => {
    const tick = () => setUtcClock(
      new Date().toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'UTC',
      })
    );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="status-panel">
      <div className="status-row">
        <span className="status-dot" />
        <span className="status-text">CONNECTED</span>
        <span className="status-sep">{'>'}</span>
        <span className="status-text">{packetRate}</span>
      </div>
      <div className="status-row status-row-secondary">
        <span>UTCC &gt;99</span>
        <span>{utcClock}</span>
      </div>
      <div className="status-row status-row-secondary">
        <span>RSSI {signalStrength}%</span>
        <span>T {formatMissionTime(missionTime)}</span>
      </div>
    </div>
  );
}

function LeftTelemetryPanel({ telemetry }) {
  return (
    <section className="left-panel">
      <div className="map-window">
        <div className="map-window-image" />
        <div className="map-path" />
        <span className="map-point map-point-start" />
        <span className="map-point map-point-end" />
      </div>

      <div className="left-panel-stats">
        <div className="left-panel-stat">
          <span>LAT</span>
          <strong>{formatCoordinate(telemetry.lat, 'N', 'S')}</strong>
        </div>
        <div className="left-panel-stat">
          <span>LONG</span>
          <strong>{formatCoordinate(telemetry.long, 'E', 'W')}</strong>
        </div>
        <div className="left-panel-stat">
          <span>ALT</span>
          <strong>{formatNumber(telemetry.alt)} m</strong>
        </div>
      </div>
    </section>
  );
}

function AirbrakeBay() {
  const groupRef = useRef();
  const { scene, animations } = useGLTF(ROCKET_MODEL_SRC);
  const modelScene = useMemo(() => scene.clone(true), [scene]);
  const { actions, names } = useAnimations(animations, groupRef);

  useEffect(() => {
    modelScene.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;

      const material = object.material?.clone?.() || new THREE.MeshStandardMaterial();
      const name = object.name.toLowerCase();
      if (name.includes('flap') || name.includes('airbreak')) {
        material.color = new THREE.Color('#1fc4ad');
        material.emissive = new THREE.Color('#06231f');
        material.emissiveIntensity = 0.16;
      } else if (name.includes('hinge') || name.includes('arm')) {
        material.color = new THREE.Color('#3b315f');
        material.emissive = new THREE.Color('#0d0a19');
        material.emissiveIntensity = 0.12;
      } else {
        material.color = new THREE.Color('#c6ced8');
        material.emissive = new THREE.Color('#07111f');
        material.emissiveIntensity = 0.08;
      }
      material.metalness = 0.35;
      material.roughness = 0.38;
      material.side = THREE.DoubleSide;
      object.material = material;
    });
  }, [modelScene]);

  useEffect(() => {
    if (!names.length) return undefined;
    const action = actions[names[0]];
    action?.reset().setLoop(THREE.LoopPingPong, Infinity).play();
    return () => action?.stop();
  }, [actions, names]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.5) * 0.04;
  });

  return (
    <group ref={groupRef} rotation={[0, 0, Math.PI / 2]} position={[0.1, 0, 0.02]} scale={0.95}>
      <primitive object={modelScene} />
    </group>
  );
}

function RocketModuleModal({ module, onClose }) {
  if (!module) return null;

  return (
    <div className="module-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="module-modal" role="dialog" aria-modal="true" aria-label={`${module.label} module`} onClick={(event) => event.stopPropagation()}>
        <header className="module-modal-header">
          <div>
            <span>{module.kicker}</span>
            <strong>{module.label}</strong>
          </div>
          <button type="button" onClick={onClose} aria-label="Close module detail">X</button>
        </header>
        <div className="module-viewer">
          {module.id === 'airbrakes' ? (
            <Canvas dpr={[1, 2]} gl={{ alpha: true, antialias: true }} camera={{ position: [0, 0, 4.8], fov: 34, near: 0.001, far: 100 }}>
              <ambientLight intensity={1.5} />
              <hemisphereLight args={['#d9e7ff', '#101826', 2.2]} />
              <directionalLight position={[2.2, 3.2, 2.4]} intensity={3.4} color="#ffffff" />
              <directionalLight position={[-1.8, 1, -1.5]} intensity={2.2} color="#7cb3ff" />
              <Suspense fallback={null}>
                <Bounds fit clip observe margin={1.35}>
                  <AirbrakeBay />
                </Bounds>
              </Suspense>
            </Canvas>
          ) : (
            <div className="module-placeholder">
              <span>{module.label}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const ROCKET_MODULES = [
  { id: 'airbrakes', label: 'Airbrakes', kicker: 'GLB Detail', x: 43, y: 47 },
];

function RocketImageStage({ onSelectModule }) {
  return (
    <div className="rocket-image-stage" aria-label="Rocket module map">
      <img className="rocket-image" src={ROCKET_IMAGE_SRC} alt="" />
      {ROCKET_MODULES.map((module) => (
        <button
          type="button"
          key={module.id}
          className="rocket-module-button"
          style={{ left: `${module.x}%`, top: `${module.y}%` }}
          onClick={() => onSelectModule(module)}
          aria-label={`Open ${module.label} module`}
        >
          <span />
        </button>
      ))}
    </div>
  );
}

function FlightStage({ telemetry, flightPhase, signalStrength }) {
  const [selectedModule, setSelectedModule] = useState(null);

  return (
    <section className="flight-stage-panel">
      <div className="flight-stage-annotation flight-stage-annotation-top">
        HEADING {formatNumber(telemetry.magneticHeading)}&deg;
      </div>
      <div className="flight-stage-annotation flight-stage-annotation-bottom">
        ROLL {formatNumber(telemetry.roll)}&deg;
      </div>

      <div className="flight-arc flight-arc-one" />
      <div className="flight-arc flight-arc-two" />

      <div className="rocket-stage">
        <div className="rocket-plume" />
        <RocketImageStage onSelectModule={setSelectedModule} />
      </div>

      <div className="flight-phase-badge">{flightPhase}</div>

      <div className="navball-wrap">
        <NavballAssembly
          acceleration={telemetry.acceleration}
          magneticHeading={telemetry.magneticHeading}
          roll={telemetry.roll}
          velocity={telemetry.velocity}
        />
      </div>

      <RocketModuleModal module={selectedModule} onClose={() => setSelectedModule(null)} />
    </section>
  );
}

const RocketDashboard = ({ telemetry: telemetryProp }) => {
  const telemetry = { ...PLACEHOLDER, ...telemetryProp };
  const signalStrength = getSignalStrength(telemetry.packetDropped);
  const packetRate = getPacketRate(telemetry.packetDropped);
  const flightPhase = getFlightPhase(telemetry);

  const topCards = [
    { label: 'ALT', value: formatNumber(telemetry.alt), unit: 'm' },
    { label: 'VEL', value: formatNumber(telemetry.velocity), unit: 'm/s' },
    { label: 'VOLT', value: formatNumber(telemetry.vol, 2), unit: 'V' },
    { label: 'BAR', value: formatNumber(telemetry.bar, 1), unit: 'hPa' },
    { label: 'RSSI', value: formatNumber(signalStrength), unit: '%', icon: ICONS.rssi },
    { label: 'FLIGHT PHASE', value: flightPhase, emphasis: true },
  ];

  return (
    <div className="dashboard-container">
      <div className="dashboard-backdrop" style={{ backgroundImage: `url(${SPACE_BG_SRC})` }} />
      <div className="dashboard-overlay" />

      <main className="dashboard-shell">
        <header className="dashboard-header">
          <div className="dashboard-header-spacer" />

          <div className="brand-lockup">
            <img className="dashboard-logo" src={LOGO_SRC} alt="MASA logo" />
            <p>DEARBORN</p>
          </div>

          <StatusPanel
            missionTime={telemetry.missionTime}
            signalStrength={signalStrength}
            packetRate={packetRate}
          />
        </header>

        <section className="top-metrics-row">
          {topCards.map((card) => (
            <TopMetricCard key={card.label} {...card} />
          ))}
        </section>

        <section className="dashboard-main">
          <aside className="dashboard-left">
            <LeftTelemetryPanel telemetry={telemetry} />
          </aside>

          <section className="dashboard-center">
            <FlightStage telemetry={telemetry} flightPhase={flightPhase} signalStrength={signalStrength} />
          </section>

          <aside className="dashboard-right">
            <SideStatCard
              label="VOLT"
              value={formatNumber(telemetry.vol, 2)}
              unit="V"
              meter={Math.min(100, (telemetry.vol / 14) * 100)}
              icon="battery"
            />
            <SideStatCard
              label="BAR"
              value={formatNumber(telemetry.bar, 1)}
              unit="hPa"
              meter={Math.min(100, ((telemetry.bar - 900) / 200) * 100)}
              icon="barometer"
            />
            <SideStatCard
              label="RSSI"
              value={formatNumber(signalStrength)}
              unit="%"
              meter={signalStrength}
              icon="signal"
            />
            <SideStatCard
              label="ALERTS"
              value={telemetry.packetDropped > 0 ? 'PACKETS DROPPED' : 'CLEAR'}
              meter={telemetry.packetDropped > 0 ? 38 : 90}
              alert={telemetry.packetDropped > 0}
              icon="alert"
            />
          </aside>
        </section>
      </main>
    </div>
  );
};

useGLTF.preload(ROCKET_MODEL_SRC);

export default RocketDashboard;
export { PLACEHOLDER };
