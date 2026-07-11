import { MetricCard, SteplyButton, SteplyCard } from './SteplyPrimitives';

export function StartPanel({
  session,
  onStartAnalysis,
  isMobileConnected = false,
}) {
  const profileName = session?.profile?.displayName || session?.profile?.name || '';

  return (
    <div className="panel-grid panel-grid--start home-screen">
      <SteplyCard className="home-hero">
        <div className="home-hero__content">
          <div>
            <div className="eyebrow">Home / Today</div>
            <h1>{profileName ? `Good to see you, ${profileName}.` : 'Good to see you today.'}</h1>
            <p>
              Use your phone camera and follow the large guide on this screen.
            </p>
          </div>
          <div className="home-hero__actions">
            <SteplyButton onClick={onStartAnalysis}>
              Start Today&apos;s Guided Check
            </SteplyButton>
          </div>
        </div>
        <div className="home-hero__visual" aria-hidden="true">
          <div className="living-room-scene">
            <span className="living-room-scene__screen" />
            <span className="living-room-scene__phone" />
            <span className="living-room-scene__person" />
            <span className="living-room-scene__support" />
          </div>
        </div>
      </SteplyCard>

      <div className="metric-row home-readiness-row">
        <MetricCard
          value={isMobileConnected ? 'Ready' : 'Set up'}
          label="Phone Camera"
          detail={isMobileConnected ? 'Linked through the mobile app' : 'Link before entering home'}
          accent={isMobileConnected}
        />
        <MetricCard value="1.5m" label="Camera Distance" detail="A comfortable full-body view" />
        <MetricCard value="Chair" label="Support Nearby" detail="Use a wall or stable chair if needed" />
      </div>

      <div className="home-pipeline">
        <SteplyCard className="home-pipeline-card">
          <strong>Safety Check</strong>
          <span>Confirm you feel safe before moving.</span>
        </SteplyCard>
        <SteplyCard className="home-pipeline-card">
          <strong>Camera Setup</strong>
          <span>Place the camera for a clear full-body view.</span>
        </SteplyCard>
        <SteplyCard className="home-pipeline-card">
          <strong>Calibration</strong>
          <span>Hold still while we set up the camera.</span>
        </SteplyCard>
        <SteplyCard className="home-pipeline-card">
          <strong>Result</strong>
          <span>Review measured findings and the exercise plan.</span>
        </SteplyCard>
        <SteplyCard className="home-pipeline-card">
          <strong>Progress Tracking</strong>
          <span>Watch your last five sessions.</span>
        </SteplyCard>
      </div>
    </div>
  );
}
