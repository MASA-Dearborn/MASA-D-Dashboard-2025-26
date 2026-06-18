# MASA Rocket Dashboard

Live telemetry dashboard for the MASA rocket. It reads JSON packets from a Teensy over serial, stores them in SQLite, and streams them to the React UI in real time.

## Run the dashboard

The only supported way to run the full stack is:

```bash
npm run teensy
```

This starts three services together:

| Service | What it does | Port |
|---------|--------------|------|
| Python backend | Reads Teensy serial, buffers telemetry, writes to DB | 5000 |
| Node bridge | Polls backend, pushes live data over WebSocket | 4000 |
| React UI | Dashboard in the browser | 3000 |

Open [http://localhost:3000](http://localhost:3000) after everything is up.

## Prerequisites

- **Node.js** (v18+ recommended)
- **Python** (3.10+)
- **Teensy** connected via USB, sending newline-delimited JSON on serial

## First-time setup

From the project root:

```bash
npm install
npm install --prefix server
pip install -r backend/requirements.txt
```

## Serial port

By default the backend connects to **COM6** at **115200** baud.

Set your port before starting if needed:

**Windows (PowerShell)**

```powershell
$env:MASA_SERIAL_PORT = "COM3"
npm run teensy
```

**Windows (cmd)**

```cmd
set MASA_SERIAL_PORT=COM3
npm run teensy
```

**macOS / Linux**

```bash
MASA_SERIAL_PORT=/dev/ttyACM0 npm run teensy
```

Optional baud override: `MASA_SERIAL_BAUD` (default `115200`).

Find your port:

- **Windows** — Device Manager → Ports (COM & LPT)
- **macOS / Linux** — `ls /dev/tty*`

Close the Arduino Serial Monitor or any other app using the port before starting.

## Stopping

Press `Ctrl+C` in the terminal where `npm run teensy` is running. That stops all three services.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `[SERIAL] Failed to open COM6` | Set `MASA_SERIAL_PORT` to the correct port. Close other apps on that port. |
| `Install pyserial for Teensy` | Run `pip install -r backend/requirements.txt` |
| UI shows no live data | Confirm the Teensy is powered, sending JSON lines, and the backend log shows `[SERIAL] Connected` |
| Port already in use | Stop any leftover `node` or `python` processes from a previous run |

## Data flow

```
Teensy (serial) → Python backend → SQLite + REST API (5000)
                              ↘
                    Node bridge (4000) → React UI (3000)
```
