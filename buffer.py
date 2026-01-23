import json
import threading
from collections import deque

class RocketDataBuffer:
    def __init__(self, max_size=1000):
        self._data_store = deque(maxlen=max_size)
        self._lock = threading.Lock()

    def push_json(self, json_packet):
        """This matches the callback signature for rocket_simulator"""
        try:
            data = json.loads(json_packet)
            with self._lock:
                self._data_store.append(data)
        except Exception as e:
            print(f"Error buffering data: {e}")

    def get_all(self):
        """Returns all packets currently in buffer and clears it"""
        with self._lock:
            data = list(self._data_store)
            self._data_store.clear()
            return data

    def get_latest(self):
        """Returns the most recent packet without clearing"""
        with self._lock:
            return self._data_store[-1] if self._data_store else None
