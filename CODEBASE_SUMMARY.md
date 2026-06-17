# MASA Rocket Telemetry Dashboard – Codebase Summary

The MASA dashboard is a real-time rocket telemetry system built with a Python backend, Node.js bridge, and React frontend at the repo root (`src/`). Data arrives from either an Arduino over Serial USB or a software simulator at 20 Hz. The backend (`backend/main/main.py`) routes each packet in parallel: one path feeds a data buffer that serves the live dashboard via a Flask API at 10 Hz, while the other path writes every packet directly to SQLite. The buffer implements a thread-safe circular queue using `collections.deque` to decouple the high-frequency (20 Hz) data source from the variable-speed consumer. It uses a `threading.Lock` to serialize access, preventing race conditions and data corruption during simultaneous reads and writes. A fixed maximum size (40 packets) automatically manages memory by discarding the oldest packets when full, preventing overflows during long simulations. A separate recovery buffer holds the last 30 seconds of data and is flushed to disk on shutdown or crash, so the most critical flight data is preserved.

The Node.js server (`server/server.js`) polls the Flask API every 100 ms and broadcasts validated telemetry to React clients over Socket.IO on port 4000. The React dashboard (`src/App.js`) connects via `useTelemetrySocket`, maps backend packets with `mapTelemetryPacket.js`, and falls back to mock simulation when the bridge is offline. The UI displays live telemetry cards, trajectory/system panels, history charts, a 3D navball, and optional rocket module viewers.

## Machine learning layer

`backend/ml/` holds online (streaming) models fed by every packet in `buffer_to_frontend` — pure Python, no extra dependencies. `predictor.py` (`FlightPredictor`) runs a recency-weighted quadratic regression on altitude plus a recursive-least-squares drag estimator (`a = -g - k·v|v|` during coast) that integrates the ballistic model forward to predict apogee; the two are blended into an ensemble with a confidence score derived from fit residuals. It also produces a 20 s altitude forecast, descent-rate/landing ETA, a battery time-to-floor regression, and rolling z-score anomaly detection (baro-vs-altitude divergence, velocity steps, low bus voltage). `event_describer.py` (`EventDescriber`) detects flight events from physical signatures — launch, motor burnout, max-Q (peak dynamic pressure), apogee, drogue/main chute (windowed deceleration), touchdown — and emits natural-language narration with real telemetry numbers, plus periodic status lines. Both are served by Flask at `/get_insights`, polled by the Node bridge at 2 Hz, and broadcast to clients as the Socket.IO `insights` event. `backend/test_ml.py` runs the models against a synthetic drag flight.

The frontend mirrors the same models in `src/ai/flightAI.js` (used by `src/ai/useFlightInsights.js`) so the AI panels keep working in mock-simulation mode; when the bridge is live the backend's physics-informed insights take precedence. The UI shows them in an AI PREDICTIONS panel (predicted apogee, ETAs, battery, model confidence, anomaly alerts), a full-width MISSION NARRATOR typewriter strip, the Flight Events panel (now driven by detected events instead of a template), and a dashed "AI FORECAST" overlay on the altitude history chart.

The stack is Python 3 with Flask, pyserial, and SQLite on the backend; Node.js with Express and Socket.IO for the bridge; and React 18 with react-scripts, Three.js, and socket.io-client on the frontend.

## Running locally

Start three terminals from the project root:

1. **Backend (simulator):** `npm run backend` or `run_backend.bat --simulator`
2. **Node bridge:** `npm run server`
3. **React dashboard:** `npm start`

For Arduino instead of the simulator, use `npm run backend:arduino` and set `SERIAL_PORT` in `backend/main/main.py`.

Ports: Flask API `5000`, Socket.IO bridge `4000`, React dev server `3000`.
