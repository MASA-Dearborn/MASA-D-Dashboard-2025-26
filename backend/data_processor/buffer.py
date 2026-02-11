import queue
import json
import threading
import time
from flask import Flask, jsonify
from flask_cors import CORS

BUFFER_SIZE = 40
DUMP_INTERVAL_SEC = 5  # Dump buffer to disk/log every 5 seconds
FRONTEND_RATE_HZ = 10  # Send to frontend at 10 Hz
FRONTEND_DT = 1 / FRONTEND_RATE_HZ

class TelemetryBuffer:
    def __init__(self):
        self.queue = queue.Queue(maxsize=BUFFER_SIZE)
        self.dump_file = "buffer_dump.json"
        self.last_dump_time = time.time()
        self.dump_lock = threading.Lock()
        self.running = True
        
        # Start automatic dump thread
        self.dump_thread = threading.Thread(target=self._auto_dump, daemon=True)
        self.dump_thread.start()
    
    def put(self, data):
        """Add data to buffer"""
        try:
            self.queue.put(data, block=False)
            print(f"[BUFFER] Queue size: {self.queue.qsize()}/{BUFFER_SIZE} | Packet {data.get('cycles', '?')}")
            return True
        except queue.Full:
            print(f"[BUFFER] FULL - Dropping packet {data.get('cycles', '?')}")
            return False
    
    def get(self):
        """Get data from buffer (non-blocking)"""
        try:
            return self.queue.get(block=False)
        except queue.Empty:
            return None
    
    def size(self):
        """Get current buffer size"""
        return self.queue.qsize()
    
    def dump_buffer(self):
        """Dump all current buffer contents to file"""
        with self.dump_lock:
            if self.queue.empty():
                return
            
            dump_data = []
            temp_queue = queue.Queue(maxsize=BUFFER_SIZE)
            
            # Extract all items
            while not self.queue.empty():
                try:
                    item = self.queue.get(block=False)
                    dump_data.append(item)
                    temp_queue.put(item)  # Put back for frontend
                except queue.Empty:
                    break
            
            # Restore queue
            self.queue = temp_queue
            
            # Write to file
            if dump_data:
                try:
                    with open(self.dump_file, 'a') as f:
                        for item in dump_data:
                            f.write(json.dumps(item) + '\n')
                    print(f"[BUFFER DUMP] Wrote {len(dump_data)} packets to {self.dump_file}")
                except Exception as e:
                    print(f"[BUFFER DUMP ERROR] {e}")
    
    def _auto_dump(self):
        """Automatically dump buffer every N seconds"""
        while self.running:
            time.sleep(DUMP_INTERVAL_SEC)
            self.dump_buffer()
    
    def stop(self):
        """Stop automatic dumping"""
        self.running = False

# Global buffer instance
telemetry_buffer = TelemetryBuffer()

# Frontend packet queue (10 Hz rate limiting)
frontend_queue = queue.Queue(maxsize=100)
last_frontend_send_time = 0

def buffer_to_frontend(json_packet):
    """
    PATH 1: Simulator → Buffer → Frontend
    Receives packets and puts them in buffer for frontend consumption
    """
    try:
        data = json.loads(json_packet)
        telemetry_buffer.put(data)
        
    except json.JSONDecodeError as e:
        print(f"[BUFFER ERROR] Invalid JSON: {e}")
    except Exception as e:
        print(f"[BUFFER ERROR] {e}")

def get_frontend_packet():
    """
    Frontend calls this to get packets from buffer at 10 Hz
    Rate-limited to prevent overwhelming frontend
    """
    global last_frontend_send_time
    
    current_time = time.time()
    
    # Rate limit to 10 Hz
    if current_time - last_frontend_send_time < FRONTEND_DT:
        return None
    
    packet = telemetry_buffer.get()
    if packet:
        last_frontend_send_time = current_time
        print(f"[FRONTEND] Sending packet {packet.get('cycles', '?')} (10 Hz)")
    
    return packet

def start_frontend_publisher(websocket_callback=None):
    """
    Starts a thread that publishes to frontend at 10 Hz
    Optional: Pass websocket callback for real-time push
    """
    def publisher():
        while telemetry_buffer.running:
            packet = get_frontend_packet()
            if packet and websocket_callback:
                websocket_callback(packet)
            time.sleep(FRONTEND_DT)
    
    thread = threading.Thread(target=publisher, daemon=True)
    thread.start()
    print("[FRONTEND PUBLISHER] Started 10 Hz publisher thread")
    return thread
    
flask_app = Flask(__name__)
CORS(flask_app)

@flask_app.route('/get_packet', methods=['GET'])
def api_get_packet():
    """API endpoint for frontend to get packets from buffer"""
    packet = get_frontend_packet()
    if packet:
        return jsonify(packet)
    return jsonify({})

def start_api():
    """Start Flask API server"""
    print("[API] Starting on port 5000...")
    flask_app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False)


