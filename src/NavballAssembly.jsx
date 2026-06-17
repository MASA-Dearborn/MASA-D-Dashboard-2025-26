import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, Suspense, useState, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { degToRad } from "three/src/math/MathUtils.js";
import { TelemetryGauges, Crosshair2D, AttitudeGauges } from "./NavballUI";
import texturePath from "./assets/navball-texture.png";
import "./navball.css";

function NavBall3D({ onRotationChange, pitch = 0, yaw = 0, roll = 0 }) {
  const texture = useTexture(texturePath);
  const meshRef = useRef();

  const targetRotation = useMemo(
    () => ({
      x: degToRad(pitch),
      y: degToRad(yaw),
      z: degToRad(roll),
    }),
    [pitch, yaw, roll]
  );

  useFrame(() => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x +=
      (targetRotation.x - meshRef.current.rotation.x) * 0.1;
    meshRef.current.rotation.y +=
      (targetRotation.y - meshRef.current.rotation.y) * 0.1;
    meshRef.current.rotation.z +=
      (targetRotation.z - meshRef.current.rotation.z) * 0.1;

    onRotationChange?.({
      x: meshRef.current.rotation.x,
      y: meshRef.current.rotation.y,
      z: meshRef.current.rotation.z,
    });
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]} rotation={[0, degToRad(270), 0]}>
      <sphereGeometry args={[2.2, 64, 64]} />
      <meshStandardMaterial
        map={texture}
        roughness={0.35}
        metalness={0.3}
        emissive="#001327"
        emissiveIntensity={0.12}
      />
    </mesh>
  );
}

export default function NavballAssembly({
  acceleration = 0,
  magneticHeading = 0,
  roll,
  velocity = 0,
  altitude = 0,
}) {
  const [navRotation, setNavRotation] = useState({ x: 0, y: 0, z: 0 });
  const hasRoll = typeof roll === 'number' && Number.isFinite(roll);
  const rollDeg = hasRoll ? roll : 0;
  const pitch = Math.max(-90, Math.min(90, (90 * (acceleration + 10)) / 70));
  const headingLabel = Number.isFinite(Number(magneticHeading))
    ? `${Math.round(((magneticHeading % 360) + 360) % 360)}°`
    : '--';

  return (
    <div className="nb-assembly">
      <div className="nb-gauge-ring">
        <TelemetryGauges velocity={velocity} altitude={altitude} />
      </div>

      <div className="nb-hdg-label">HDG <span>{headingLabel}</span></div>
      <div className="nb-crs-label">CRS <span>{headingLabel}</span></div>

      <div className="nb-glow-container">
        <div className="nb-outer-glow" />
        <div className="nb-inner-glow" />
      </div>

      <div className="nb-navball-area">
        <div className="nb-navball-round">
          <Canvas
            orthographic
            camera={{ position: [0, 0, 5], zoom: 53 }}
            gl={{ alpha: true, antialias: true }}
          >
            <ambientLight intensity={3.5} />
            <pointLight position={[8, 8, 10]} intensity={1.2} color="#FFCB05" />
            <pointLight position={[-6, -4, 8]} intensity={0.6} color="#4a6a8a" />
            <pointLight position={[0, -8, 6]} intensity={0.3} color="#001d3b" />
            <Suspense fallback={null}>
              <NavBall3D
                onRotationChange={setNavRotation}
                pitch={pitch}
                yaw={magneticHeading}
                roll={rollDeg}
              />
            </Suspense>
          </Canvas>
          <Crosshair2D periodMs={2000} rotation={navRotation} />
        </div>
      </div>

      <AttitudeGauges rotation={navRotation} hasRoll={hasRoll} />
    </div>
  );
}
