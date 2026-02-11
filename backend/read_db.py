# backend/read_db.py - Open and read telemetry.db
import sqlite3
import os

# DB lives in backend/ when you run main from project root, or as telemetry.db in cwd
DB_PATH = os.path.join(os.path.dirname(__file__), "telemetry.db")
if not os.path.exists(DB_PATH):
    DB_PATH = "telemetry.db"

def main():
    if not os.path.exists(DB_PATH):
        print(f"No database found at {DB_PATH}. Run the backend first to create it.")
        return
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # so we can use column names
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM telemetry")
    n = cur.fetchone()[0]
    print(f"Total rows: {n}")

    if n == 0:
        conn.close()
        return

    cur.execute("SELECT MAX(altitude_est) FROM telemetry")
    max_alt = cur.fetchone()[0] or 0
    print(f"Max altitude (m): {max_alt:.2f}\n")

    print("Last 10 rows:")
    print("-" * 80)
    cur.execute("""
        SELECT id, timestamp_ms, cycles, flight_state, altitude_est, vel_est, 
               apogee_pred, GPS, latitude, voltage, created_at
        FROM telemetry ORDER BY id DESC LIMIT 10
    """)
    rows = cur.fetchall()
    for r in rows:
        print(dict(r))
    conn.close()

if __name__ == "__main__":
    main()
