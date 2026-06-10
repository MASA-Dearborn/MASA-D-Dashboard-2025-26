import React, { useMemo } from 'react';
import RocketDashboard from './RocketDashboard';
import useMockTelemetrySimulation from './useMockTelemetrySimulation';
import useTelemetrySocket from './useTelemetrySocket';

function App() {
  const { telemetry: socketTelemetry, connected: socketConnected, hasLiveData } =
    useTelemetrySocket(true);
  const useMock = !hasLiveData;
  const mockTelemetry = useMockTelemetrySimulation(useMock);

  const linkMode = hasLiveData ? 'socket' : useMock ? 'simulation' : 'offline';

  const telemetry = useMemo(() => {
    if (hasLiveData) return socketTelemetry;
    if (useMock) return mockTelemetry;
    return null;
  }, [hasLiveData, socketTelemetry, useMock, mockTelemetry]);

  return (
    <div className="App">
      <RocketDashboard
        telemetry={telemetry}
        linkMode={linkMode}
        connected={socketConnected || linkMode === 'simulation'}
      />
    </div>
  );
}

export default App;
