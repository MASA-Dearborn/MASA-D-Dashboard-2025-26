# backend/ml/predictor.py
#
# Online machine-learning models for flight prediction. Everything here is
# pure Python (no numpy/sklearn) so it adds zero install burden on the
# ground-station laptop and runs comfortably at packet rate (20 Hz).
#
# Models:
#   1. Recency-weighted quadratic regression on altitude  -> short-term
#      trajectory forecast + apogee estimate (data-driven).
#   2. Online drag-coefficient estimator (recursive least squares on
#      a = -g - k*v*|v| during coast)                     -> physics-informed
#      ballistic integration to apogee.
#   3. Linear regression on bus voltage                   -> battery time-to-
#      threshold estimate.
#   4. Rolling z-score anomaly detector on sensor residuals (baro-vs-altitude
#      consistency, voltage sag, velocity jumps).
#
# The apogee estimate blends (1) and (2): the physics model dominates during
# coast when its drag estimate has converged; the polynomial model covers
# boost and degraded-sensor cases. Confidence is derived from fit residuals.

import math
import threading
from collections import deque

G = 9.80665
WINDOW_SEC = 8.0            # regression window
FORECAST_HORIZON_SEC = 20.0
FORECAST_STEP_SEC = 1.0
HALF_LIFE_SEC = 2.5         # recency weighting half-life for the poly fit
BATTERY_FLOOR_V = 10.5
MAX_SAMPLES = 400


def _solve3(m, b):
    """Solve a 3x3 linear system with Gaussian elimination. Returns None if singular."""
    a = [row[:] + [b[i]] for i, row in enumerate(m)]
    for col in range(3):
        pivot = max(range(col, 3), key=lambda r: abs(a[r][col]))
        if abs(a[pivot][col]) < 1e-12:
            return None
        a[col], a[pivot] = a[pivot], a[col]
        for r in range(3):
            if r != col:
                f = a[r][col] / a[col][col]
                for c in range(col, 4):
                    a[r][c] -= f * a[col][c]
    return [a[i][3] / a[i][i] for i in range(3)]


class WeightedQuadraticFit:
    """Recency-weighted least-squares fit of y = c0 + c1*t + c2*t^2.

    This is the classic normal-equations formulation; weights decay
    exponentially with sample age so the model tracks regime changes
    (motor burnout, chute deploy) within a couple of seconds.
    """

    def fit(self, samples, now):
        # samples: iterable of (t, y)
        s = [0.0] * 5   # sums of w * t^k for k=0..4
        sy = [0.0] * 3  # sums of w * y * t^k for k=0..2
        n = 0
        for t, y in samples:
            age = now - t
            w = 0.5 ** (age / HALF_LIFE_SEC)
            tk = 1.0
            for k in range(5):
                s[k] += w * tk
                if k < 3:
                    sy[k] += w * y * tk
                tk *= t
            n += 1
        if n < 6:
            return None
        coeffs = _solve3(
            [[s[0], s[1], s[2]], [s[1], s[2], s[3]], [s[2], s[3], s[4]]],
            sy,
        )
        if coeffs is None:
            return None
        # weighted RMS residual for confidence scoring
        sse = 0.0
        wsum = 0.0
        for t, y in samples:
            w = 0.5 ** ((now - t) / HALF_LIFE_SEC)
            pred = coeffs[0] + coeffs[1] * t + coeffs[2] * t * t
            sse += w * (y - pred) ** 2
            wsum += w
        rms = math.sqrt(sse / wsum) if wsum > 0 else float("inf")
        return {"coeffs": coeffs, "rms": rms}


class DragEstimator:
    """Recursive least squares for the ballistic drag constant k in
    a = -g - k * v * |v| (coast phase, velocity in m/s).

    One-parameter RLS with forgetting factor; k maps to CdA*rho/(2m).
    """

    def __init__(self, forgetting=0.995):
        self.k = 0.0
        self.p = 1.0          # parameter covariance
        self.lam = forgetting
        self.samples = 0

    def update(self, vel, accel):
        if abs(vel) < 15:     # regressor too small -> skip (avoids blowup)
            return
        x = vel * abs(vel)
        y = -(accel + G)      # y = k * x  under the ballistic model
        gain = self.p * x / (self.lam + x * self.p * x)
        self.k += gain * (y - x * self.k)
        self.p = (self.p - gain * x * self.p) / self.lam
        self.k = max(0.0, min(self.k, 0.01))
        self.samples += 1

    @property
    def converged(self):
        return self.samples >= 20

    def apogee_from(self, alt, vel):
        """Integrate the ballistic model forward to apogee (vel must be > 0)."""
        if vel <= 0:
            return alt, 0.0
        dt = 0.05
        t = 0.0
        while vel > 0 and t < 120:
            vel += (-G - self.k * vel * abs(vel)) * dt
            alt += vel * dt
            t += dt
        return alt, t


class RollingStats:
    """Online mean/std over a fixed window for z-score anomaly detection."""

    def __init__(self, maxlen=80):
        self.values = deque(maxlen=maxlen)

    def push(self, v):
        self.values.append(v)

    def zscore(self, v):
        n = len(self.values)
        if n < 12:
            return 0.0
        mean = sum(self.values) / n
        var = sum((x - mean) ** 2 for x in self.values) / n
        std = math.sqrt(var)
        if std < 1e-9:
            return 0.0
        return (v - mean) / std


class FlightPredictor:
    """Aggregates all online models. Thread-safe: `update()` is called from the
    packet path, `get_predictions()` from the Flask thread."""

    def __init__(self):
        self.lock = threading.Lock()
        self.samples = deque(maxlen=MAX_SAMPLES)   # (t, alt, vel, accel)
        self.volt_samples = deque(maxlen=MAX_SAMPLES)
        self.poly = WeightedQuadraticFit()
        self.drag = DragEstimator()
        self.baro_resid_stats = RollingStats()
        self.vel_jump_stats = RollingStats()
        self.t0 = None
        self.max_alt = 0.0
        self.max_vel = 0.0
        self.anomalies = deque(maxlen=20)
        self.last_vel = None

    # ------------------------------------------------------------------ input
    def update(self, packet):
        try:
            ts = float(packet.get("timestamp_ms"))
            alt = float(packet.get("altitude_est"))
            vel = float(packet.get("vel_est"))
        except (TypeError, ValueError):
            return
        accel = packet.get("acceleration")
        accel = float(accel) if isinstance(accel, (int, float)) else None
        volt = packet.get("voltage")
        baro = packet.get("barometric_pressure")
        state = packet.get("flight_state")

        with self.lock:
            if self.t0 is None:
                self.t0 = ts
            t = (ts - self.t0) / 1000.0

            self.samples.append((t, alt, vel, accel))
            self.max_alt = max(self.max_alt, alt)
            self.max_vel = max(self.max_vel, vel)

            if isinstance(volt, (int, float)):
                self.volt_samples.append((t, float(volt)))

            # drag model only learns during unpowered ascent (coast)
            if accel is not None and vel > 30 and accel < 2 and state in (2, 3, None):
                self.drag.update(vel, accel)

            # --- anomaly features ---
            if isinstance(baro, (int, float)) and baro > 0:
                # barometric altitude from ISA; residual vs estimator altitude
                baro_alt = 44330.0 * (1.0 - (baro / 1013.25) ** 0.1903)
                resid = baro_alt - alt
                z = self.baro_resid_stats.zscore(resid)
                self.baro_resid_stats.push(resid)
                if abs(z) > 4:
                    self._flag(t, "baro-divergence",
                               f"Barometric altitude disagrees with the state estimate by {abs(resid):.0f} m (z={z:.1f}).")
            if self.last_vel is not None:
                jump = vel - self.last_vel
                z = self.vel_jump_stats.zscore(jump)
                self.vel_jump_stats.push(jump)
                if abs(z) > 5 and abs(jump) > 8:
                    self._flag(t, "velocity-step",
                               f"Velocity stepped {jump:+.0f} m/s in one packet — possible sensor glitch or staging event.")
            else:
                self.vel_jump_stats.push(0.0)
            self.last_vel = vel

            if isinstance(volt, (int, float)) and volt < BATTERY_FLOOR_V:
                self._flag(t, "battery-low",
                           f"Bus voltage {volt:.2f} V is below the {BATTERY_FLOOR_V:.1f} V floor.")

    def _flag(self, t, kind, message):
        if self.anomalies and self.anomalies[-1][1] == kind and t - self.anomalies[-1][0] < 5:
            return  # debounce repeats of the same anomaly
        self.anomalies.append((t, kind, message))

    # ----------------------------------------------------------------- output
    def get_predictions(self):
        with self.lock:
            if len(self.samples) < 8:
                return {"ready": False}

            now, alt, vel, _ = self.samples[-1]
            window = [(t, a) for (t, a, _v, _ac) in self.samples if now - t <= WINDOW_SEC]
            fit = self.poly.fit(window, now)

            descending = vel < -2
            apogee = None
            apogee_eta = None
            source = None
            confidence = 0.3

            if descending or alt >= self.max_alt - 1 and vel < 1 and self.max_alt > 50:
                apogee = self.max_alt
                apogee_eta = 0.0
                source = "observed"
                confidence = 0.99
            else:
                phys_alt = phys_eta = None
                if self.drag.converged and vel > 5:
                    phys_alt, phys_eta = self.drag.apogee_from(alt, vel)

                poly_alt = poly_eta = None
                if fit:
                    c0, c1, c2 = fit["coeffs"]
                    if c2 < -0.05:  # concave -> a vertex (apogee) exists
                        t_apo = -c1 / (2 * c2)
                        if now - 1 < t_apo < now + 90:
                            poly_alt = c0 + c1 * t_apo + c2 * t_apo * t_apo
                            poly_eta = max(0.0, t_apo - now)

                if phys_alt is not None and poly_alt is not None:
                    # physics model wins once converged; poly regularises it
                    apogee = 0.7 * phys_alt + 0.3 * poly_alt
                    apogee_eta = 0.7 * phys_eta + 0.3 * poly_eta
                    source = "ensemble"
                    confidence = 0.9
                elif phys_alt is not None:
                    apogee, apogee_eta, source, confidence = phys_alt, phys_eta, "physics", 0.8
                elif poly_alt is not None:
                    apogee, apogee_eta, source, confidence = poly_alt, poly_eta, "regression", 0.6

                if apogee is not None:
                    apogee = max(apogee, self.max_alt)
                if fit and apogee is not None:
                    # tighter fit -> more confidence (rms in metres)
                    confidence = max(0.2, min(0.99, confidence * (1.0 - min(fit["rms"] / 80.0, 0.5))))

            # ----- short-term forecast (drives the dashed chart overlay) -----
            forecast = []
            if fit:
                c0, c1, c2 = fit["coeffs"]
                steps = int(FORECAST_HORIZON_SEC / FORECAST_STEP_SEC)
                for i in range(1, steps + 1):
                    tf = now + i * FORECAST_STEP_SEC
                    af = c0 + c1 * tf + c2 * tf * tf
                    forecast.append({"t": round(tf, 2), "alt": round(max(0.0, af), 1)})

            # ----- landing estimate (descent) -----
            landing_eta = None
            descent_rate = None
            if descending and alt > 5:
                descent_rate = -vel
                landing_eta = alt / max(descent_rate, 1.0)

            # ----- battery model: linear regression, time to floor -----
            battery_minutes = None
            if len(self.volt_samples) >= 30:
                vs = list(self.volt_samples)
                n = len(vs)
                mt = sum(t for t, _ in vs) / n
                mv = sum(v for _, v in vs) / n
                num = sum((t - mt) * (v - mv) for t, v in vs)
                den = sum((t - mt) ** 2 for t, _ in vs)
                if den > 0:
                    slope = num / den  # V per second
                    if slope < -1e-5:
                        battery_minutes = (vs[-1][1] - BATTERY_FLOOR_V) / (-slope) / 60.0

            return {
                "ready": True,
                "t": round(now, 2),
                "apogee_m": round(apogee, 1) if apogee is not None else None,
                "apogee_eta_s": round(apogee_eta, 1) if apogee_eta is not None else None,
                "apogee_source": source,
                "confidence": round(confidence, 2),
                "forecast": forecast,
                "descent_rate_mps": round(descent_rate, 1) if descent_rate is not None else None,
                "landing_eta_s": round(landing_eta, 1) if landing_eta is not None else None,
                "battery_minutes_left": round(battery_minutes, 1) if battery_minutes is not None else None,
                "drag_coefficient": round(self.drag.k, 6) if self.drag.converged else None,
                "max_altitude_m": round(self.max_alt, 1),
                "max_velocity_mps": round(self.max_vel, 1),
                "anomalies": [
                    {"t": round(t, 1), "kind": kind, "message": msg}
                    for (t, kind, msg) in self.anomalies
                ],
            }
