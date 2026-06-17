// Client-side flight AI — a JavaScript mirror of backend/ml.
// ---------------------------------------------------------------------------
// When the Python backend is live, the dashboard shows its `/get_insights`
// output (physics-informed drag model + regression ensemble). When running on
// the in-browser mock simulation — or if the backend goes quiet — this module
// computes the same predictions and narrated events locally so the AI panels
// never go dark. Output shape matches the backend exactly.
//
// Models here:
//   * recency-weighted quadratic regression on altitude -> apogee + forecast
//   * smoothed vertical-rate estimator (EMA of dAlt/dt) -> phase/event logic
//   * linear regression on voltage -> battery time-to-floor

const G = 9.80665;
const WINDOW_SEC = 8;
const HALF_LIFE_SEC = 2.5;
const FORECAST_HORIZON_SEC = 18;
const FORECAST_STEP_SEC = 1;
const BATTERY_FLOOR_V = 10.5;
const RHO0 = 1.225;
const SCALE_HEIGHT = 8400;

function solve3(m, b) {
  const a = m.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 3; r += 1) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < 3; r += 1) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let c = col; c < 4; c += 1) a[r][c] -= f * a[col][c];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

// Recency-weighted least squares fit of alt = c0 + c1*t + c2*t^2.
function quadraticFit(samples, now) {
  if (samples.length < 6) return null;
  const s = [0, 0, 0, 0, 0];
  const sy = [0, 0, 0];
  for (const { t, alt } of samples) {
    const w = 0.5 ** ((now - t) / HALF_LIFE_SEC);
    let tk = 1;
    for (let k = 0; k < 5; k += 1) {
      s[k] += w * tk;
      if (k < 3) sy[k] += w * alt * tk;
      tk *= t;
    }
  }
  const coeffs = solve3([[s[0], s[1], s[2]], [s[1], s[2], s[3]], [s[2], s[3], s[4]]], sy);
  if (!coeffs) return null;
  let sse = 0;
  let wsum = 0;
  for (const { t, alt } of samples) {
    const w = 0.5 ** ((now - t) / HALF_LIFE_SEC);
    const p = coeffs[0] + coeffs[1] * t + coeffs[2] * t * t;
    sse += w * (alt - p) ** 2;
    wsum += w;
  }
  return { coeffs, rms: wsum > 0 ? Math.sqrt(sse / wsum) : Infinity };
}

function fmtClock(seconds) {
  const sign = seconds < 0 ? '-' : '';
  const s = Math.abs(Math.round(seconds));
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  return `${sign}${m}:${(s % 60).toString().padStart(2, '0')}`;
}

export default class FlightAI {
  constructor() {
    this.reset();
  }

  reset() {
    this.samples = [];        // {t, missionTime, alt, vel, accel, volt}
    this.events = [];
    this.seen = new Set();
    this.maxAlt = 0;
    this.maxVel = 0;
    this.maxQ = { q: 0, t: 0, missionTime: 0, alt: 0 };
    this.vrate = 0;           // smoothed vertical rate from altitude deltas
    this.prev = null;
    this.prevAccel = null;
    this.landed = false;
    this.lastStatusT = -Infinity;
    this.lastMissionTime = null;
  }

  push(sample) {
    const { t, missionTime, alt, vel, accel, volt } = sample;
    if (!Number.isFinite(alt)) return;

    // Ignore samples arriving closer than 30 ms apart — a near-zero dt makes
    // the finite-difference rate meaningless and would corrupt the smoother.
    if (this.prev && t - this.prev.t < 0.03) return;

    if (this.prev) {
      const dt = t - this.prev.t;
      const rate = (alt - this.prev.alt) / dt;
      const a = Math.min(1, dt / 0.4); // ~0.4 s smoothing time constant
      this.vrate += (rate - this.vrate) * a;
    }

    this.samples.push(sample);
    const cutoff = t - Math.max(WINDOW_SEC, 30);
    while (this.samples.length > 400 || this.samples[0].t < cutoff) this.samples.shift();

    this.maxAlt = Math.max(this.maxAlt, alt);
    if (Number.isFinite(vel)) this.maxVel = Math.max(this.maxVel, vel);

    if (this.events.length === 0) {
      this.emit(missionTime, 'armed', 'System Armed', 'good',
        'Telemetry link established. Flight computer is armed and streaming — all systems standing by for launch.');
    }

    this.detect(t, missionTime, alt, vel, accel);
    this.periodicStatus(t, missionTime, alt);
    this.prev = { t, alt };
    if (Number.isFinite(accel)) this.prevAccel = accel;
    if (Number.isFinite(volt)) this.lastVolt = volt;
  }

  detect(t, missionTime, alt, vel, accel) {
    const climbing = this.vrate > 2;
    const falling = this.vrate < -2;

    if (!this.seen.has('launch') && (this.vrate > 10 || alt > 10)) {
      const g = Number.isFinite(accel) ? ` pulling ${(accel / G).toFixed(1)} g off the pad` : '';
      this.emit(missionTime, 'launch', 'Launch Detected', 'good',
        `Liftoff! The vehicle has left the pad${g}. Now passing ${alt.toFixed(0)} m at ${Math.abs(vel ?? this.vrate).toFixed(0)} m/s.`);
      this.seen.add('launch');
      this.landed = false;
    }
    if (!this.seen.has('launch')) return;

    // Burnout: longitudinal acceleration flips negative while still climbing hard.
    if (!this.seen.has('burnout') && Number.isFinite(accel)
      && this.prevAccel != null && this.prevAccel > 5 && accel < 0 && climbing && this.vrate > 30) {
      this.emit(missionTime, 'burnout', 'Motor Burnout', 'info',
        `Motor burnout at ${alt.toFixed(0)} m. Peak velocity ${this.maxVel.toFixed(0)} m/s — the vehicle is now coasting on momentum against gravity and drag.`);
      this.seen.add('burnout');
    }

    // Max Q from dynamic pressure on airspeed.
    const speed = Math.abs(Number.isFinite(vel) ? vel : this.vrate);
    const q = 0.5 * RHO0 * Math.exp(-Math.max(alt, 0) / SCALE_HEIGHT) * speed * speed;
    if (climbing && q > this.maxQ.q) this.maxQ = { q, t, missionTime, alt };
    if (!this.seen.has('maxq') && climbing && this.maxQ.q > 500 && q < this.maxQ.q * 0.8) {
      this.emit(this.maxQ.missionTime, 'maxq', 'Max Q Passed', 'info',
        `Maximum dynamic pressure of ${(this.maxQ.q / 1000).toFixed(1)} kPa endured at ${this.maxQ.alt.toFixed(0)} m — the worst structural loading of the flight is behind us.`);
      this.seen.add('maxq');
    }

    // Apogee: altitude trend turns over near the recorded maximum.
    if (!this.seen.has('apogee') && falling && this.maxAlt > 50 && alt < this.maxAlt - 5) {
      let extra = '';
      const pred = this.lastApogeePrediction;
      if (pred) {
        const delta = ((this.maxAlt - pred) / pred) * 100;
        extra = Math.abs(delta) < 1
          ? " That is right on the model's prediction."
          : ` That is ${Math.abs(delta).toFixed(1)}% ${delta >= 0 ? 'above' : 'below'} the model's prediction.`;
      }
      this.emit(missionTime, 'apogee', 'Apogee Detected', 'warn',
        `Apogee! Peak altitude ${this.maxAlt.toFixed(0)} m reached at T+${fmtClock(missionTime)}.${extra} The vehicle is tipping over into descent.`);
      this.seen.add('apogee');
    }

    // Chute deploys: descent rate slows sharply over a ~1 s window.
    if (this.seen.has('apogee') && !this.landed && alt > 30 && falling) {
      const old = this.samples.find((s) => t - s.t <= 1.4);
      if (old && t - old.t > 0.7 && this.prev) {
        const oldRate = (alt - old.alt) / (t - old.t); // avg rate over window
        const slowed = this.vrate - oldRate;
        if (slowed > 8 && oldRate < -12) {
          if (!this.seen.has('drogue') && alt > this.maxAlt * 0.5) {
            this.emit(missionTime, 'drogue', 'Drogue Chute Deployed', 'info',
              `Sharp deceleration detected at ${alt.toFixed(0)} m — drogue chute is out. Descent rate stabilising near ${Math.abs(this.vrate).toFixed(0)} m/s.`);
            this.seen.add('drogue');
          } else if (!this.seen.has('main') && alt <= this.maxAlt * 0.5) {
            this.emit(missionTime, 'main', 'Main Chute Deployed', 'info',
              `Main chute deployment at ${alt.toFixed(0)} m. Descent slowed to ${Math.abs(this.vrate).toFixed(0)} m/s for a soft recovery.`);
            this.seen.add('main');
          }
        }
      }
    }

    if (this.seen.has('apogee') && !this.landed && alt < 15 && Math.abs(this.vrate) < 3) {
      this.emit(missionTime, 'landing', 'Touchdown', 'good',
        `Touchdown at T+${fmtClock(missionTime)}. Flight complete — peak altitude ${this.maxAlt.toFixed(0)} m. Recovery team is go.`);
      this.landed = true;
    }
  }

  periodicStatus(t, missionTime, alt) {
    if (this.landed || !this.seen.has('launch') || t - this.lastStatusT < 8) return;
    this.lastStatusT = t;
    let line;
    if (this.vrate > 2) {
      line = `Climbing through ${alt.toFixed(0)} m at ${this.vrate.toFixed(0)} m/s.`;
      if (this.lastApogeePrediction) {
        line += ` The model projects apogee near ${this.lastApogeePrediction.toFixed(0)} m.`;
      }
    } else if (this.vrate < -2) {
      const eta = alt / Math.max(-this.vrate, 1);
      line = `Descending through ${alt.toFixed(0)} m at ${Math.abs(this.vrate).toFixed(0)} m/s — ground contact in roughly ${eta.toFixed(0)} s.`;
    } else {
      line = `Holding near ${alt.toFixed(0)} m.`;
    }
    this.emit(missionTime, 'status', 'Status', 'muted', line, true);
  }

  emit(missionTime, type, label, tone, description, transient = false) {
    this.events.push({
      t: missionTime,
      clock: fmtClock(missionTime ?? 0),
      type,
      label,
      tone,
      description,
      transient,
    });
    if (this.events.length > 60) {
      const i = this.events.findIndex((e) => e.transient);
      this.events.splice(i >= 0 ? i : 0, 1);
    }
  }

  getInsights() {
    if (this.samples.length < 8) {
      return { predictions: { ready: false }, events: [...this.events] };
    }
    const last = this.samples[this.samples.length - 1];
    const now = last.t;
    const window = this.samples.filter((s) => now - s.t <= WINDOW_SEC);
    const fit = quadraticFit(window, now);

    let apogee = null;
    let apogeeEta = null;
    let source = null;
    let confidence = 0.3;

    if (this.seen.has('apogee') || this.landed) {
      apogee = this.maxAlt;
      apogeeEta = 0;
      source = 'observed';
      confidence = 0.99;
    } else if (fit) {
      const [c0, c1, c2] = fit.coeffs;
      if (c2 < -0.05) {
        const tApo = -c1 / (2 * c2);
        if (tApo > now - 1 && tApo < now + 90) {
          apogee = Math.max(c0 + c1 * tApo + c2 * tApo * tApo, this.maxAlt);
          apogeeEta = Math.max(0, tApo - now);
          source = 'regression';
          confidence = Math.max(0.2, Math.min(0.95, 0.75 * (1 - Math.min(fit.rms / 80, 0.5))));
        }
      }
    }
    this.lastApogeePrediction = apogee;

    const forecast = [];
    if (fit) {
      const [c0, c1, c2] = fit.coeffs;
      for (let i = 1; i <= FORECAST_HORIZON_SEC / FORECAST_STEP_SEC; i += 1) {
        const tf = now + i * FORECAST_STEP_SEC;
        forecast.push({ dt: i * FORECAST_STEP_SEC, alt: Math.max(0, c0 + c1 * tf + c2 * tf * tf) });
      }
    }

    let landingEta = null;
    let descentRate = null;
    if (this.vrate < -2 && last.alt > 5 && !this.landed) {
      descentRate = -this.vrate;
      landingEta = last.alt / Math.max(descentRate, 1);
    }

    // Battery: ordinary least squares on the recent voltage trace.
    let batteryMinutes = null;
    const volts = this.samples.filter((s) => Number.isFinite(s.volt));
    if (volts.length >= 30) {
      const n = volts.length;
      const mt = volts.reduce((acc, s) => acc + s.t, 0) / n;
      const mv = volts.reduce((acc, s) => acc + s.volt, 0) / n;
      let num = 0;
      let den = 0;
      for (const s of volts) {
        num += (s.t - mt) * (s.volt - mv);
        den += (s.t - mt) ** 2;
      }
      if (den > 0) {
        const slope = num / den;
        if (slope < -1e-5) {
          batteryMinutes = (volts[n - 1].volt - BATTERY_FLOOR_V) / -slope / 60;
        }
      }
    }

    return {
      predictions: {
        ready: true,
        apogee_m: apogee != null ? Math.round(apogee * 10) / 10 : null,
        apogee_eta_s: apogeeEta != null ? Math.round(apogeeEta * 10) / 10 : null,
        apogee_source: source,
        confidence: Math.round(confidence * 100) / 100,
        forecast,
        descent_rate_mps: descentRate != null ? Math.round(descentRate * 10) / 10 : null,
        landing_eta_s: landingEta != null ? Math.round(landingEta) : null,
        battery_minutes_left: batteryMinutes != null ? Math.round(batteryMinutes * 10) / 10 : null,
        max_altitude_m: Math.round(this.maxAlt * 10) / 10,
        max_velocity_mps: Math.round(this.maxVel * 10) / 10,
        anomalies: [],
      },
      events: [...this.events],
    };
  }
}
