import { useEffect, useRef } from 'react';
import { HomeLogo } from '../HomeLogo';

function Icon({ children = 'i', tone = 'info' }) {
  return (
    <span className={`ds-icon ds-icon--${tone}`} aria-hidden="true">
      {children}
    </span>
  );
}

export function AppHeader({
  title,
  eyebrow = 'Steply',
  description,
  connection,
  actions,
}) {
  return (
    <header className="foundation-app-header">
      <div className="foundation-app-header__brand">
        <HomeLogo />
        <div>
          <div className="foundation-eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <div className="foundation-app-header__aside">
        {connection}
        {actions}
      </div>
    </header>
  );
}

export function SessionHeader({
  title,
  eyebrow = 'Session',
  instruction,
  progress,
  connection,
  emergencyAction,
}) {
  return (
    <header className="foundation-session-header">
      <div>
        <div className="foundation-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {instruction ? <p>{instruction}</p> : null}
      </div>
      <div className="foundation-session-header__right">
        {progress}
        {connection}
        {emergencyAction}
      </div>
    </header>
  );
}

export function SessionProgress({ current = 1, total = 1, label = 'Session progress' }) {
  const boundedTotal = Math.max(1, Number(total) || 1);
  const boundedCurrent = Math.min(boundedTotal, Math.max(0, Number(current) || 0));
  const percent = Math.round((boundedCurrent / boundedTotal) * 100);

  return (
    <div className="session-progress" aria-label={`${label}: step ${boundedCurrent} of ${boundedTotal}`}>
      <div className="session-progress__label">
        <span>{label}</span>
        <strong>{boundedCurrent} of {boundedTotal}</strong>
      </div>
      <div className="session-progress__track" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function Navigation({ items = [], currentPath = '' }) {
  return (
    <nav className="foundation-nav" aria-label="Main navigation">
      {items.map((item) => (
        <a
          key={item.href}
          className={currentPath === item.href ? 'foundation-nav__link foundation-nav__link--active' : 'foundation-nav__link'}
          href={item.href}
          aria-current={currentPath === item.href ? 'page' : undefined}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function ConnectionIndicator({
  status = 'waiting',
  label = 'Camera waiting',
  detail,
}) {
  const tone = status === 'connected' ? 'success' : status === 'lost' ? 'danger' : 'warning';
  const icon = status === 'connected' ? 'OK' : status === 'lost' ? '!' : 'i';

  return (
    <div className={`connection-indicator connection-indicator--${tone}`} role="status" aria-live="polite">
      <Icon tone={tone}>{icon}</Icon>
      <span>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </div>
  );
}

export function EmergencyStopButton({ label = 'Stop Session', onClick }) {
  return (
    <button type="button" className="ds-button emergency-stop-button" onClick={onClick}>
      <Icon tone="danger">!</Icon>
      <span>{label}</span>
    </button>
  );
}

export function PrimaryActionBar({
  primaryLabel,
  secondaryLabel,
  tertiaryLabel,
  onPrimary,
  onSecondary,
  onTertiary,
  primaryDisabled = false,
  tertiaryDisabled = false,
}) {
  return (
    <div className="primary-action-bar">
      {secondaryLabel ? (
        <button type="button" className="ds-button ds-button--secondary" onClick={onSecondary}>
          {secondaryLabel}
        </button>
      ) : null}
      {primaryLabel ? (
        <button type="button" className="ds-button ds-button--primary" onClick={onPrimary} disabled={primaryDisabled}>
          {primaryLabel}
        </button>
      ) : null}
      {tertiaryLabel ? (
        <button type="button" className="ds-button ds-button--ghost" onClick={onTertiary} disabled={tertiaryDisabled}>
          {tertiaryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function TodaySessionCard({ title, date, description, actionLabel }) {
  return (
    <section className="foundation-card today-session-card">
      <div className="foundation-card__icon"><Icon tone="info">i</Icon></div>
      <div>
        <p className="foundation-card__kicker">{date}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actionLabel ? <span className="foundation-card__action">{actionLabel}</span> : null}
    </section>
  );
}

export function MetricCard({ label, value, detail, status = 'info' }) {
  return (
    <section className="foundation-card metric-card-v2">
      <Icon tone={status}>{status === 'success' ? 'OK' : status === 'danger' ? '!' : 'i'}</Icon>
      <div>
        <div className="metric-card-v2__value">{value}</div>
        <h3>{label}</h3>
        {detail ? <p>{detail}</p> : null}
      </div>
    </section>
  );
}

export function TrendSummaryCard({ title, trend, detail, status = 'info' }) {
  return (
    <section className="foundation-card trend-summary-card">
      <Icon tone={status}>{status === 'success' ? 'OK' : 'i'}</Icon>
      <div>
        <h3>{title}</h3>
        <strong>{trend}</strong>
        <p>{detail}</p>
      </div>
    </section>
  );
}

export function AssessmentCard({ title, description, duration, status = 'Ready' }) {
  return (
    <section className="foundation-card assessment-card-v2">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <span>{duration}</span>
      <small>{status}</small>
    </section>
  );
}

export function ExerciseCard({ title, description, minutes, support = 'Use support nearby' }) {
  return (
    <section className="foundation-card exercise-card-v2">
      <Icon tone="info">i</Icon>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        <small>{minutes} minutes - {support}</small>
      </div>
    </section>
  );
}

export function RiskStatusCard({ level = 'Needs review', message, status = 'warning' }) {
  return (
    <section className={`foundation-card risk-status-card risk-status-card--${status}`}>
      <Icon tone={status}>{status === 'danger' ? '!' : status === 'success' ? 'OK' : 'i'}</Icon>
      <div>
        <p className="foundation-card__kicker">Risk status</p>
        <h2>{level}</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}

export function FunctionalAreaCard({ title, status, detail }) {
  return (
    <section className="foundation-card functional-area-card">
      <Icon tone={status === 'Stable' ? 'success' : 'warning'}>{status === 'Stable' ? 'OK' : 'i'}</Icon>
      <div>
        <h3>{title}</h3>
        <strong>{status}</strong>
        <p>{detail}</p>
      </div>
    </section>
  );
}

export function SafetyChecklist({ items = [] }) {
  return (
    <section className="foundation-card safety-checklist" aria-labelledby="safety-checklist-title">
      <h2 id="safety-checklist-title">Safety checklist</h2>
      <ul>
        {items.map((item) => (
          <li key={item.label}>
            <Icon tone={item.checked ? 'success' : 'warning'}>{item.checked ? 'OK' : '!'}</Icon>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CameraGuideOverlay({ label = 'Keep your full body inside the frame' }) {
  return (
    <div className="camera-guide-overlay" aria-hidden="true">
      <div className="camera-guide-overlay__frame" />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonOverlay({ label = 'Loading camera view' }) {
  return (
    <div className="skeleton-overlay" role="status" aria-live="polite">
      <span />
      <strong>{label}</strong>
    </div>
  );
}

export function CameraPreview({
  frameSrc,
  mediaStream = null,
  label = 'Camera preview',
  guide = 'Full body view',
  onFrameLoaded,
  onFrameError,
  children,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    video.srcObject = mediaStream;
    if (mediaStream) video.play().catch(() => {});
    return () => {
      if (video.srcObject === mediaStream) video.srcObject = null;
    };
  }, [mediaStream]);

  return (
    <section className={`camera-preview${mediaStream ? ' camera-preview--local' : ''}`} aria-label={label}>
      {mediaStream ? (
        <video ref={videoRef} autoPlay muted playsInline aria-label="Live laptop camera preview" />
      ) : frameSrc ? (
        <img
          src={frameSrc}
          alt="Live phone camera preview"
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            const loadedSrc = event.currentTarget.currentSrc || event.currentTarget.src;
            if (naturalWidth > 0 && naturalHeight > 0) {
              onFrameLoaded?.(loadedSrc, { naturalWidth, naturalHeight });
            } else {
              onFrameError?.(loadedSrc);
            }
          }}
          onError={(event) => onFrameError?.(event.currentTarget.currentSrc || event.currentTarget.src)}
        />
      ) : (
        <div className="camera-preview__placeholder">
          <div className="camera-preview__person" aria-hidden="true" />
          <SkeletonOverlay label="Waiting for camera view" />
        </div>
      )}
      <CameraGuideOverlay label={guide} />
      {children}
    </section>
  );
}

export function QualityStatusChip({ label, status = 'waiting' }) {
  const tone = status === 'good' ? 'success' : status === 'poor' ? 'danger' : 'warning';
  return (
    <span className={`quality-status-chip quality-status-chip--${tone}`}>
      <Icon tone={tone}>{tone === 'success' ? 'OK' : tone === 'danger' ? '!' : 'i'}</Icon>
      {label}
    </span>
  );
}

export function CameraQualityPanel({ items = [] }) {
  return (
    <section className="foundation-card camera-quality-panel" aria-labelledby="camera-quality-title">
      <h2 id="camera-quality-title">Camera quality</h2>
      <div>
        {items.map((item) => (
          <QualityStatusChip key={item.label} label={item.label} status={item.status} />
        ))}
      </div>
    </section>
  );
}

export function InstructionPanel({ title, instruction, detail, icon = 'i' }) {
  return (
    <section className="instruction-panel" aria-live="polite">
      <Icon tone={icon === '!' ? 'warning' : 'info'}>{icon}</Icon>
      <div>
        <h2>{title}</h2>
        <p>{instruction}</p>
        {detail ? <small>{detail}</small> : null}
      </div>
    </section>
  );
}

export function VoiceReplayButton({ label = 'Hear Again', onClick }) {
  return (
    <button type="button" className="ds-button ds-button--secondary voice-replay-button" onClick={onClick}>
      <Icon tone="info">i</Icon>
      <span>{label}</span>
    </button>
  );
}

export function CountdownTimer({ seconds = 3, label = 'Starting in' }) {
  return (
    <div className="countdown-timer" aria-label={`${label} ${seconds} seconds`}>
      <span>{seconds}</span>
      <small>{label}</small>
    </div>
  );
}

export function RepCounter({ count = 0, label = 'Completed stands' }) {
  return (
    <div className="counter-tile" aria-label={`${count} ${label}`}>
      <span>{count}</span>
      <small>{label}</small>
    </div>
  );
}

export function HoldTimer({ seconds = 10, label = 'seconds to hold' }) {
  return (
    <div className="counter-tile counter-tile--hold" aria-label={`${seconds} ${label}`}>
      <span>{seconds}</span>
      <small>{label}</small>
    </div>
  );
}

export function ExerciseRestTimer({ seconds = 30, label = 'rest seconds' }) {
  return (
    <div className="counter-tile counter-tile--rest" aria-label={`${seconds} ${label}`}>
      <span>{seconds}</span>
      <small>{label}</small>
    </div>
  );
}

export function ResultSummary({ title, message, status = 'warning' }) {
  return (
    <section className="result-summary-v2">
      <RiskStatusCard level={title} message={message} status={status} />
    </section>
  );
}

export function TestResultCard({ title, value, detail, status = 'info' }) {
  return (
    <section className="foundation-card test-result-card-v2">
      <Icon tone={status}>{status === 'success' ? 'OK' : status === 'danger' ? '!' : 'i'}</Icon>
      <div>
        <h3>{title}</h3>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </section>
  );
}

export function ThresholdLineChart({
  label = 'Threshold',
  value = 7,
  threshold = 10,
  max = 15,
}) {
  const boundedMax = Math.max(1, Number(max) || 1);
  const valuePercent = Math.min(100, Math.max(0, (Number(value) / boundedMax) * 100));
  const thresholdPercent = Math.min(100, Math.max(0, (Number(threshold) / boundedMax) * 100));

  return (
    <section className="foundation-card threshold-line-chart" aria-label={`${label}: value ${value}, threshold ${threshold}`}>
      <h3>{label}</h3>
      <div className="threshold-line-chart__track">
        <span className="threshold-line-chart__value" style={{ width: `${valuePercent}%` }} />
        <span className="threshold-line-chart__threshold" style={{ left: `${thresholdPercent}%` }} />
      </div>
      <div className="threshold-line-chart__labels">
        <span>Today: {value}</span>
        <span>Guide: {threshold}</span>
      </div>
    </section>
  );
}

export function AdherenceChart({ days = [] }) {
  return (
    <section className="foundation-card adherence-chart" aria-label="Exercise adherence chart">
      <h3>Exercise practice</h3>
      <div className="adherence-chart__bars">
        {days.map((day) => (
          <span key={day.label} style={{ height: `${Math.max(8, day.value || 0)}%` }}>
            <small>{day.label}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

export function FullScreenAlert({ title, message, actionLabel = 'Continue', tone = 'warning', onAction, children }) {
  return (
    <section className={`full-screen-alert full-screen-alert--${tone}`} role="alertdialog" aria-labelledby="full-screen-alert-title">
      <Icon tone={tone}>{tone === 'danger' ? '!' : 'i'}</Icon>
      <h2 id="full-screen-alert-title">{title}</h2>
      <p>{message}</p>
      <div className="full-screen-alert__actions">
        {children}
        <button type="button" className="ds-button ds-button--primary" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
    </section>
  );
}

export function ConnectionLostDialog({ onReconnect, onStop }) {
  return (
    <FullScreenAlert
      title="Phone Connection Lost"
      message="The assessment has been paused."
      actionLabel="Reconnect"
      tone="danger"
      onAction={onReconnect}
    >
      <button type="button" className="ds-button ds-button--secondary" onClick={onStop}>End Session</button>
    </FullScreenAlert>
  );
}

export function InvalidAssessmentPanel({ message = 'Reason: camera quality was too low. No result was saved. Adjust the camera and try again.' }) {
  return (
    <section className="foundation-card invalid-assessment-panel">
      <Icon tone="warning">!</Icon>
      <div>
        <h2>We Couldn't Complete This Measurement</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}

export function SafetyStopPanel({ message = 'The session was stopped for safety.' }) {
  return (
    <section className="foundation-card safety-stop-panel">
      <Icon tone="danger">!</Icon>
      <div>
        <h2>Session stopped</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}

export function ExpertReferralPanel({ message = 'Share this report with a healthcare professional if support is needed.' }) {
  return (
    <section className="foundation-card expert-referral-panel">
      <Icon tone="info">i</Icon>
      <div>
        <h2>Professional follow-up</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}
