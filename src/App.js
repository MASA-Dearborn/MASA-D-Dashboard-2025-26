import React from 'react';
import RocketDashboard from './RocketDashboard';
import useMockTelemetrySimulation from './useMockTelemetrySimulation';

// Mock-only test layer. Set false or remove this hook when real telemetry is wired in.
const USE_MOCK_SIMULATION = true;

function App() {
  const mockTelemetry = useMockTelemetrySimulation(USE_MOCK_SIMULATION);

  return (
    <div className="App">
      <RocketDashboard telemetry={mockTelemetry} />
    </div>
  );
}

export default App;
