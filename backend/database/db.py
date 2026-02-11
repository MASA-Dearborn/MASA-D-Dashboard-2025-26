# backend/database/db.py
import sqlite3

DB_PATH = "telemetry.db"


def _get_connection():
    """Connection with durability settings for crash recovery"""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA synchronous=FULL")  # Ensure data is on disk before commit
    conn.execute("PRAGMA journal_mode=WAL")  # Better crash recovery
    return conn


def init_database():
    """Initialize SQLite database with telemetry table"""
    conn = _get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS telemetry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp_ms INTEGER NOT NULL,
            flight_state INTEGER,
            act_cmd REAL,
            act_meas REAL,
            ctrl_health INTEGER,
            altitude_est REAL,
            vel_est REAL,
            apogee_pred REAL,
            GPS REAL,
            latitude REAL,
            acceleration REAL,
            magnetic_heading REAL,
            barometric_pressure REAL,
            cycles INTEGER,
            voltage REAL,
            gyro_x INTEGER,
            gyro_y INTEGER,
            gyro_z INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Migrate existing DB: add latitude if missing
    cursor.execute("PRAGMA table_info(telemetry)")
    cols = [r[1] for r in cursor.fetchall()]
    if "latitude" not in cols:
        cursor.execute("ALTER TABLE telemetry ADD COLUMN latitude REAL")
        conn.commit()
    
    conn.commit()
    conn.close()
    print("[DATABASE] Initialized telemetry.db")

def write_to_sql(data):
    """Write telemetry data directly to SQL database (expects normalized dict)"""
    conn = _get_connection()
    cursor = conn.cursor()

    lat = data.get("latitude")
    gps = data.get("GPS")

    cursor.execute("""
        INSERT INTO telemetry (
            timestamp_ms, flight_state, act_cmd, act_meas, ctrl_health,
            altitude_est, vel_est, apogee_pred, GPS, latitude, acceleration,
            magnetic_heading, barometric_pressure, cycles, voltage,
            gyro_x, gyro_y, gyro_z
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data["timestamp_ms"],
        data.get("flight_state"),
        data.get("act_cmd"),
        data.get("act_meas"),
        data.get("ctrl_health"),
        data["altitude_est"],
        data["vel_est"],
        data.get("apogee_pred"),
        gps,
        lat,
        data.get("acceleration"),
        data.get("magnetic_heading"),
        data.get("barometric_pressure"),
        data["cycles"],
        data.get("voltage"),
        data.get("gyro_x"),
        data.get("gyro_y"),
        data.get("gyro_z")
    ))

    conn.commit()
    conn.close()


def direct_to_sql(data):
    """
    PATH 2: Simulator/Arduino → SQL (direct)
    Receives a normalized packet dict and writes directly to database
    """
    try:
        write_to_sql(data)
        print(f"[SQL] Packet {data['cycles']}: alt={data['altitude_est']:.2f}m, state={data.get('flight_state', '?')}")
    except Exception as e:
        print(f"[SQL ERROR] {e}")

def get_stats():
    """Get database statistics"""
    conn = _get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM telemetry")
    total_packets = cursor.fetchone()[0]
    
    cursor.execute("SELECT MAX(altitude_est) FROM telemetry")
    result = cursor.fetchone()[0]
    max_altitude = result if result is not None else 0.0
    
    conn.close()
    
    return {
        "total_packets": total_packets,
        "max_altitude": max_altitude
    }