// Rocket module registry.
// ---------------------------------------------------------------------------
// Each entry describes a viewable 3D module. The dashboard only renders a
// marker / opens a viewer for modules that actually have a `modelPath`, so
// adding a future module is as simple as dropping its GLB in /public and
// appending an entry here — no airbrakes-specific logic lives in the UI.
//
// Schema:
//   id          stable identifier
//   label       display name
//   kicker      small label shown above the title in the modal
//   modelPath   path to the GLTF/GLB (omit to leave a module defined-but-hidden)
//   marker      { x, y } percentage position over the 2D rocket image
//   description short blurb shown in the viewer
//   animations  named Blender/GLTF clips to expose later (viewer is static for now)

const ROCKET_MODULES = [
  {
    id: 'airbrakes',
    label: 'Airbrakes',
    kicker: 'MODULE DETAIL',
    modelPath: '/rocket-model/Untitled.glf.gltf',
    marker: { x: 43, y: 47 },
    description:
      'Deployable airbrake flaps used for apogee targeting. Drag the model to inspect; deployment animations will be wired in once the rigged GLB is delivered.',
    animations: [], // e.g. ['Deploy', 'Retract'] once exported from Blender
  },
  // Future modules (avionics bay, boat tails, …) get appended here with their
  // own GLB once available. Until a `modelPath` exists they stay out of the UI.
];

export function getAvailableModules() {
  return ROCKET_MODULES.filter((module) => Boolean(module.modelPath));
}

export default ROCKET_MODULES;
