# Arduino Telemetry

Upload `rocket_telemetry/rocket_telemetry.ino` to your Arduino.

## Setup

1. **Arduino IDE** – Open the `.ino` file, select your board (Uno, Nano, Mega, etc.), upload.
2. **Find your COM port** – Windows: Device Manager → Ports. Mac/Linux: `ls /dev/tty*`
3. **Edit `backend/serial_bridge.py`** – Set `SERIAL_PORT` to your port (e.g. `COM3` or `/dev/ttyUSB0`).

## Running with Arduino

```bash
# Terminal 1: Backend + Serial bridge (reads from Arduino)
cd backend
pip install pyserial
python serial_bridge.py

# Terminal 2: Node bridge
cd frontend
npm run server

# Terminal 3: React app
npm start
```

## Modes

- **MODE 0** (default): Simulates flight data – no sensors needed. Good for testing.
- **MODE 1**: Reads real sensors. Uncomment sensor libs and implement `readAltitude()`, `readGyro()`, etc.

## JSON format

Each line on Serial is one JSON packet. Your backend expects these fields – the Arduino sends them all.
