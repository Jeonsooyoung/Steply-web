import { SteplyButton, SteplyCard, MetricCard, SafetyNoticeCard } from './SteplyPrimitives';

export function StartPanel({ session, onStartAnalysis, isMobileConnected = false }) {
  const profileName = session?.profile?.displayName || session?.profile?.name || 'Waiting for mobile profile';

  return (
    <div className="panel-grid panel-grid--start">
      <SteplyCard className="hero-card hero-card--wellness">
        <div className="hero-card__content">
          <div className="eyebrow">Remote Camera Mode</div>
          <h1>Steply PC Movement Coach</h1>
          <p>Start the movement test after the mobile app is linked and ready to stream camera frames.</p>
          <div className="hero-card__actions">
            <SteplyButton onClick={onStartAnalysis} disabled={!isMobileConnected}>
              Start Test
            </SteplyButton>
            <span className="hero-card__helper">
              {isMobileConnected ? 'Profile' : 'Status'}:{' '}
              <strong>{isMobileConnected ? profileName : 'Connect the mobile camera first'}</strong>
            </span>
          </div>
        </div>
        <div className="hero-illustration" aria-hidden="true">
          <div className="soft-orbit soft-orbit--one" />
          <div className="soft-orbit soft-orbit--two" />
          <div className="coach-figure coach-figure--hero">
            <span className="coach-head" />
            <span className="coach-body" />
            <span className="coach-arm coach-arm--left" />
            <span className="coach-arm coach-arm--right" />
            <span className="coach-leg coach-leg--left" />
            <span className="coach-leg coach-leg--right" />
          </div>
          <div className="step-shadow" />
        </div>
      </SteplyCard>

      <div className="metric-row">
        <MetricCard value="QR" label="Account Link" detail="Mobile profile link" />
        <MetricCard value="Live" label="Camera" detail="Phone video receiver" accent />
        <MetricCard value="Local" label="Network" detail="Same Wi-Fi required" />
      </div>

      <SafetyNoticeCard>
        This version keeps profile storage and camera streaming on the phone, while MediaPipe keypoint extraction and pose analysis run on the PC.
      </SafetyNoticeCard>
    </div>
  );
}
