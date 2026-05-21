# Arduino Telemetry Test

Upload `rocket_telemetry/rocket_telemetry.ino` to your board (Uno, Nano, Mega, etc.).

## Arduino setup

1. Open `rocket_telemetry/rocket_telemetry.ino` in Arduino IDE.
2. Select your board and port.
3. Upload.
4. Open **Serial Monitor** at **9600 baud** — you should see one JSON line about every 100 ms.

## Backend setup

1. Find your COM port (Windows: Device Manager → Ports, e.g. `COM3`).
2. Edit `backend/main/main.py`:
   ```python
   SERIAL_PORT = "COM3"   # your port
   BAUD_RATE = 9600
   ```
3. Close Serial Monitor before starting Python (only one program can use the port).

## Run with dashboard

**Terminal 1 — backend (Arduino mode, no `--simulator`):**
```powershell
cd c:\Users\arsla\masa-dashboard
pip install -r backend\requirements.txt
python backend\main\main.py
```

**Terminal 2 — frontend:**
```powershell
cd c:\Users\arsla\masa-dashboard\frontend
npm run dev
```

Open **http://localhost:3000**. Status should show **CONNECTED** and values should update.

## Simulated flight (MODE 0)

~55 s loop: pad → motor burn (~4 s, decaying thrust) → coast to apogee (~2.2 km) → free fall → main chute @ 650 m → landing. Gyro, voltage sag, baro, and GPS drift behave like real sensors.

## Modes in the sketch

| `MODE` | Behavior |
|--------|----------|
| `0` | Physics-based flight simulation (default) — no sensors |
| `1` | Call `readSensors()` — add your BMP280 / IMU / GPS code |

## JSON fields (one line per packet)

`timestamp_ms`, `flight_state`, `act_cmd`, `act_meas`, `ctrl_health`, `altitude_est`, `vel_est`, `apogee_pred`, `GPS` (longitude), `latitude`, `acceleration`, `magnetic_heading`, `barometric_pressure`, `cycles`, `voltage`, `gyro_x`, `gyro_y`, `gyro_z`

Example line:
```json
{"timestamp_ms":45231,"flight_state":1,"act_cmd":0.412,"act_meas":0.442,"ctrl_health":1,"altitude_est":125.50,"vel_est":45.20,"apogee_pred":3500.0,"GPS":-83.176300,"latitude":42.322310,"acceleration":55.00,"magnetic_heading":182.5,"barometric_pressure":1008.20,"cycles":42,"voltage":12.10,"gyro_x":10,"gyro_y":-5,"gyro_z":3}
```

## Troubleshooting

- **No data on dashboard:** Wrong `SERIAL_PORT`, or Serial Monitor still open.
- **BUFFER errors in Python:** Ensure each line is valid JSON ending with `\n`.
- **Still using simulator:** Do **not** pass `--simulator` when testing Arduino.
