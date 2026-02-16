import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, Suspense, useState } from "react";
import "./App.css";
import { RocketTimer, RandomGauges, Crosshair2D, AttitudeGauges } from "./2D UI";
import { useTexture } from "@react-three/drei";
import texturePath from "./assets/navball texture for masa.png";
import { degToRad } from "three/src/math/MathUtils.js";

function NavBall({ onRotationChange }) {
  const texture = useTexture(texturePath);
  const meshRef = useRef();

  useFrame((state) => {
    if (!meshRef.current) return;

    meshRef.current.rotation.y = state.clock.elapsedTime;
    meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime);
    meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime);

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
        roughness={0.3}
        metalness={0.4}
        emissive="#00274C"
        emissiveIntensity={0.15}
      />
    </mesh>
  );
}

export default function App() {
  const [navRotation, setNavRotation] = useState({ x: 0, y: 0, z: 0 });

  return (
    <div className="hud-container">
      <div className="main-panel">
        <div className="panel-left" />
        <div className="panel-center">
          <div className="navball-assembly">
            <div className="gauge-ring">
              <RandomGauges />
            </div>

            <div className="glow-container">
              <div className="outer-glow" />
              <div className="inner-glow" />
            </div>

            <div className="canvas-wrapper">
              <div className="canvas-container">
                <Canvas orthographic camera={{ position: [0, 0, 5], zoom: 100 }} gl={{ alpha: true, antialias: true }}>
                  <ambientLight intensity={5} />
                  <pointLight position={[10, 10, 10]} intensity={1} color="#FFCB05" />
                  <pointLight position={[-10, -10, 10]} intensity={0.5} color="#00274C" />
                  <Suspense fallback={null}>
                    <NavBall onRotationChange={setNavRotation} />
                  </Suspense>
                </Canvas>

                <Crosshair2D periodMs={2000} rotation={navRotation} />
              </div>
            </div>

            {/* Attitude gauges OUTSIDE canvas-wrapper so they overlay properly */}
            <AttitudeGauges rotation={navRotation} />
          </div>
        </div>

        <div className="panel-right">
          <RocketTimer />
        </div>
      </div>
    </div>
  );
}
