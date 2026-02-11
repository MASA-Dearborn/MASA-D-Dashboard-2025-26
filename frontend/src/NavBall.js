import React from 'react';

const RADIUS = 80;
const D2R = Math.PI / 180;

/**
 * Nav ball (attitude indicator) - pitch, roll, heading from telemetry
 * Pitch: derived from acceleration (boost up = nose up, freefall = nose down)
 * Roll: integrated from gyro_z (passed from parent)
 * Heading: magnetic_heading
 */
function NavBall({ acceleration = 0, magneticHeading = 0, roll = 0 }) {

  // Pitch from acceleration: 60 m/s² = nose up (90°), -10 = level, -9.8 = nose down (-90°)
  const pitch = Math.max(-90, Math.min(90, 90 * (acceleration + 10) / 70));

  // Horizon: pitch up = horizon moves down (positive y), roll = horizon tilt
  const horizonOffsetY = Math.sin(pitch * D2R) * RADIUS;
  const horizonAngle = roll;

  const size = RADIUS * 2 + 40;

  return (
    <div className="navball-container">
      <div className="navball-card">
        <div className="navball-title">ATTITUDE</div>
        <div className="navball-wrapper" style={{ width: size, height: size }}>
          {/* Fixed aircraft symbol (center) */}
          <div className="navball-aircraft" />

          {/* Clipped ball with horizon */}
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="navball-svg"
            style={{ width: size, height: size }}
          >
            <defs>
              <clipPath id="navball-clip">
                <circle cx={size / 2} cy={size / 2} r={RADIUS + 2} />
              </clipPath>
              {/* Sky/ground gradient: horizon rotates with roll, position with pitch */}
              <linearGradient
                id="navball-gradient"
                x1="0%"
                y1="0%"
                x2="0%"
                y2="100%"
                gradientUnits="objectBoundingBox"
                gradientTransform={`rotate(${horizonAngle} 0.5 0.5)`}
              >
                <stop offset="0%" stopColor="#1e3a5f" />
                <stop
                  offset={`${(0.5 + (horizonOffsetY / RADIUS) * 0.5) * 100}%`}
                  stopColor="#1e3a5f"
                />
                <stop
                  offset={`${(0.5 + (horizonOffsetY / RADIUS) * 0.5) * 100}%`}
                  stopColor="#654321"
                />
                <stop offset="100%" stopColor="#654321" />
              </linearGradient>
            </defs>

            <g clipPath="url(#navball-clip)">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={RADIUS + 2}
                fill="url(#navball-gradient)"
              />
              {/* Horizon line */}
              <g
                transform={`translate(${size / 2}, ${size / 2 + horizonOffsetY}) rotate(${horizonAngle})`}
              >
                <line
                  x1={-RADIUS}
                  y1={0}
                  x2={RADIUS}
                  y2={0}
                  stroke="#06b6d4"
                  strokeWidth={3}
                  strokeLinecap="round"
                />
              </g>
            </g>

            {/* Compass tape */}
            <g transform={`translate(${size / 2}, ${size / 2}) rotate(${-magneticHeading})`}>
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <g key={deg} transform={`rotate(${deg}) translate(0, -${RADIUS - 5})`}>
                  <line
                    x1={0}
                    y1={0}
                    x2={0}
                    y2={deg % 90 === 0 ? 12 : 8}
                    stroke="#94a3b8"
                    strokeWidth={deg % 90 === 0 ? 2 : 1}
                  />
                  {deg % 90 === 0 && (
                    <text
                      x={0}
                      y={-4}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize={10}
                      fontFamily="JetBrains Mono"
                    >
                      {['N', 'E', 'S', 'W'][deg / 90]}
                    </text>
                  )}
                </g>
              ))}
            </g>

            {/* Outer ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={RADIUS}
              fill="none"
              stroke="rgba(6, 182, 212, 0.5)"
              strokeWidth={2}
            />
          </svg>

          {/* Heading readout */}
          <div className="navball-heading">
            {Math.round(magneticHeading)}°
          </div>
        </div>
      </div>
    </div>
  );
}

export default NavBall;
