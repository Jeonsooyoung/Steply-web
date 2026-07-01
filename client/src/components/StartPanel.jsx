import { SteplyButton, SteplyCard, MetricCard, SafetyNoticeCard } from './SteplyPrimitives';

export function StartPanel({ session, onStartAnalysis }) {
  const profileName = session?.profile?.displayName || session?.profile?.name || 'Waiting for mobile profile';

  return (
    <div className="panel-grid panel-grid--start">
      <SteplyCard className="hero-card hero-card--wellness">
        <div className="hero-card__content">
          <div className="eyebrow">Remote Camera Mode</div>
          <h1>Link the phone camera to this PC screen</h1>
          <p>Create a QR session on the PC, then scan it in the mobile app to link the profile and camera stream.</p>
          <div className="hero-card__actions">
            <SteplyButton onClick={onStartAnalysis}>
              {session ? 'Open Camera Receiver' : 'Create QR Session'}
            </SteplyButton>
            <span className="hero-card__helper">Profile: <strong>{profileName}</strong></span>
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
