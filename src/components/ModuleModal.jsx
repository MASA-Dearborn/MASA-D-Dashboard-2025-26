import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bounds, OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import './components.css';

// Generic GLTF/GLB viewer — works for ANY module in the registry, not just the
// airbrakes. Applies a neutral metallic material pass and, if the module names
// animation clips that exist in the file, plays the first one. Static rotation
// only for now (OrbitControls drag + slow auto-rotate).
function ModuleModel({ modelPath, animations: requested = [] }) {
  const groupRef = useRef();
  const { scene, animations } = useGLTF(modelPath);
  const modelScene = useMemo(() => scene.clone(true), [scene]);
  const { actions, names } = useAnimations(animations, groupRef);

  useEffect(() => {
    modelScene.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const material = object.material?.clone?.() || new THREE.MeshStandardMaterial();
      if (!material.map) material.color = new THREE.Color('#c6ced8');
      material.emissive = new THREE.Color('#07111f');
      material.emissiveIntensity = 0.08;
      material.metalness = 0.35;
      material.roughness = 0.4;
      material.side = THREE.DoubleSide;
      object.material = material;
    });
  }, [modelScene]);

  useEffect(() => {
    if (!names.length) return undefined;
    // Prefer an explicitly-requested clip; fall back to the first available.
    const clipName = requested.find((name) => names.includes(name)) || names[0];
    const action = actions[clipName];
    action?.reset().setLoop(THREE.LoopPingPong, Infinity).play();
    return () => action?.stop();
  }, [actions, names, requested]);

  return (
    <group ref={groupRef}>
      <primitive object={modelScene} />
    </group>
  );
}

function ModelViewer({ module }) {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0, 4.8], fov: 34, near: 0.001, far: 100 }}
    >
      <ambientLight intensity={1.5} />
      <hemisphereLight args={['#d9e7ff', '#101826', 2.0]} />
      <directionalLight position={[2.2, 3.2, 2.4]} intensity={3.2} color="#ffffff" />
      <directionalLight position={[-1.8, 1, -1.5]} intensity={2.0} color="#7cb3ff" />
      <Suspense fallback={null}>
        <Bounds fit clip observe margin={0.6}>
          <ModuleModel modelPath={module.modelPath} animations={module.animations} />
        </Bounds>
      </Suspense>
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        autoRotate
        autoRotateSpeed={0.8}
        minDistance={2}
        maxDistance={9}
      />
    </Canvas>
  );
}

export default function ModuleModal({ module, onClose }) {
  const [isClosing, setIsClosing] = useState(false);

  const requestClose = () => {
    setIsClosing(true);
    window.setTimeout(onClose, 170);
  };

  useEffect(() => {
    if (!module) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setIsClosing(true);
        window.setTimeout(onClose, 170);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [module, onClose]);

  if (!module) return null;

  return (
    <div className={`module-modal-backdrop ${isClosing ? 'is-closing' : ''}`} role="presentation" onClick={requestClose}>
      <section
        className="module-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${module.label} module`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="module-modal-header">
          <div className="module-modal-titles">
            <span className="module-modal-kicker">{module.kicker || 'MODULE DETAIL'}</span>
            <strong className="module-modal-title">{module.label}</strong>
          </div>
          <button type="button" className="module-modal-close" onClick={requestClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="module-viewer">
          {module.modelPath ? (
            <ModelViewer module={module} />
          ) : (
            <div className="module-placeholder">Model coming soon</div>
          )}
          <span className="module-viewer-hint">Drag to rotate · scroll to zoom</span>
        </div>

        {module.description ? <p className="module-modal-copy">{module.description}</p> : null}
      </section>
    </div>
  );
}
