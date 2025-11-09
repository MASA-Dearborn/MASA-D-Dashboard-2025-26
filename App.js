import React, { useEffect, useState } from "react";
import "./App.css";

function App() {
  // Initialize 8 sensor values with 0
  const [values, setValues] = useState(Array(8).fill(0));

  useEffect(() => {
    // Connect to the backend WebSocket (Python server)
    const ws = new WebSocket("ws://localhost:6789");

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        // Update the values if we get an array of 8 numbers
        if (Array.isArray(data)) setValues(data.slice(0, 8));
      } catch (err) {
        console.error("Invalid message:", e.data);
      }
    };

    ws.onerror = (err) => console.error("WebSocket error:", err);
    ws.onclose = () => console.log("WebSocket disconnected");

    // Cleanup
    return () => ws.close();
  }, []);

  return (
    <div className="container">
      <h1>Arduino Data Dashboard</h1>
      <div className="grid">
        {values.map((val, i) => (
          <div key={i} className="box">
            <div className="label">Sensor {i + 1}</div>
            <div className="val">{val.toFixed(1)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
