import React, { useMemo } from 'react';
import RocketDashboard from './RocketDashboard';
import useMockTelemetrySimulation from './useMockTelemetrySimulation';
import useTelemetrySocket from './useTelemetrySocket';

// Set by `npm run teensy` — wait for real hardware; no mock flight.
const TEENSY_MODE = process.env.REACT_APP_TEENSY_MODE === 'true';

function App() {
  const {
    telemetry: socketTelemetry,
    insights: socketInsights,
    connected: socketConnected,
    hasLiveData,
  } = useTelemetrySocket(true);

  const useMock = !TEENSY_MODE && !hasLiveData;
  const mockTelemetry = useMockTelemetrySimulation(useMock);

  const linkMode = hasLiveData ? 'socket' : useMock ? 'simulation' : 'offline';

  const telemetry = useMemo(() => {
    if (hasLiveData) return socketTelemetry;
    if (useMock) return mockTelemetry;
    return null;
  }, [hasLiveData, socketTelemetry, useMock, mockTelemetry]);

  const connected = TEENSY_MODE
    ? hasLiveData && socketConnected
    : socketConnected || linkMode === 'simulation';

  return (
    <div className="App">
      <RocketDashboard
        telemetry={telemetry}
        serverInsights={hasLiveData ? socketInsights : null}
        linkMode={linkMode}
        connected={connected}
      />
    </div>
  );
}

export default App;
