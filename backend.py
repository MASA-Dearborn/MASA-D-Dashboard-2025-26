import asyncio
import serial
import json
import websockets

# --- CONFIGURATION ---
SERIAL_PORT = "COM10"   # Your Arduino COM port
BAUD_RATE = 9600

# --- SETUP SERIAL ---
try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    print(f"✅ Connected to {SERIAL_PORT}")
except Exception as e:
    print(f"❌ Could not open serial port: {e}")
    ser = None

# --- HANDLE CLIENT CONNECTION ---
async def send_data(websocket):
    print("🌐 Client connected to WebSocket")

    while True:
        try:
            if ser and ser.in_waiting > 0:
                line = ser.readline().decode().strip()
                if line:
                    try:
                        values = [float(x) for x in line.split(',')]
                        await websocket.send(json.dumps(values))
                        print("📤 Sent:", values)
                    except ValueError:
                        pass  # ignore invalid lines
            await asyncio.sleep(0.1)
        except Exception as e:
            print("⚠️ Error reading serial:", e)
            break

# --- START WEBSOCKET SERVER ---
async def main():
    async with websockets.serve(send_data, "localhost", 6789):
        print("🚀 WebSocket running at ws://localhost:6789")
        await asyncio.Future()  # run forever

asyncio.run(main())
