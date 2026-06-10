import React from 'react';

// Small line-icon set used by telemetry cards and panels. Keyed by the `icon`
// string on each telemetry definition so cards stay fully data-driven.
const PATHS = {
  altitude: (
    <>
      <path d="M3 20l6-9 4 5 3-4 5 8z" />
      <path d="M9 11l1.5-2" />
    </>
  ),
  velocity: (
    <>
      <path d="M12 13a8 8 0 018-8" />
      <path d="M4 13a8 8 0 012.3-5.6" />
      <path d="M12 13l4-3" />
      <circle cx="12" cy="13" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  voltage: <path d="M13 2L4 14h6l-1 8 9-12h-6z" />,
  pressure: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12l4-3" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  rssi: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M5.5 20a6.5 6.5 0 0113 0" />
    </>
  ),
  acceleration: (
    <>
      <path d="M5 19l7-14 7 14" />
      <path d="M8.5 12h7" />
    </>
  ),
  phase: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3L2 21h20L12 3z" />
      <path d="M12 10v5" />
      <circle cx="12" cy="18" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  battery: (
    <>
      <rect x="2" y="7" width="16" height="10" rx="2" />
      <path d="M21 10v4" />
    </>
  ),
  gps: (
    <>
      <path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.4" />
    </>
  ),
  computer: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  sensor: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  payload: (
    <>
      <path d="M12 3l7 4v10l-7 4-7-4V7z" />
      <path d="M12 3v18M5 7l7 4 7-4" />
    </>
  ),
  thermometer: (
    <>
      <path d="M14 14.5V5a2 2 0 10-4 0v9.5a4 4 0 104 0z" />
    </>
  ),
};

export default function Icon({ name, className = '', size = 22 }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      className={`tm-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
