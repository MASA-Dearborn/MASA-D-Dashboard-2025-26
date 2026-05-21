import React from 'react';
import RocketDashboard from './RocketDashboard';
import useMockTelemetrySimulation from './useMockTelemetrySimulation';
import useTelemetrySocket from './useTelemetrySocket';

const USE_MOCK = process.env.REACT_APP_USE_MOCK === 'true';

function App() {
  const mockTelemetry = useMockTelemetrySimulation(USE_MOCK);
  const { telemetry: liveTelemetry, connected, hasLiveData } = useTelemetrySocket(!USE_MOCK);

  return (
    <div className="App">
      <RocketDashboard
        telemetry={USE_MOCK ? mockTelemetry : liveTelemetry}
        connected={USE_MOCK ? true : connected}
        hasLiveData={USE_MOCK ? true : hasLiveData}
      />
    </div>
  );
}

export default App;
