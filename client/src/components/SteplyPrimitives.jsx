import { initials, statusLabel } from '../utils/format';
import { SteplyIcon } from '../features/reference-ui/shared/icons';

export function SteplyCard({ className = '', tone = 'surface', children, ...props }) {
  return (
    <section className={`steply-card steply-card--${tone} ${className}`} {...props}>
      {children}
    </section>
  );
}

export function SteplyButton({ variant = 'primary', className = '', children, ...props }) {
  return (
    <button className={`steply-button steply-button--${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function StatusPill({ status = 'steady', children }) {
  return <span className={`status-pill status-pill--${status}`}>{children || statusLabel(status)}</span>;
}

export function ProfileAvatar({ name = 'Steply User', size = 'large' }) {
  return <div className={`profile-avatar profile-avatar--${size}`} aria-hidden="true">{initials(name)}</div>;
}

export function MetricCard({ value, label, detail, status, accent = false }) {
  return (
    <SteplyCard className={`metric-card ${accent ? 'metric-card--accent' : ''}`}>
      <div className="metric-card__value">{value}</div>
      <div className="metric-card__label">{label}</div>
      {detail ? <p className="metric-card__detail">{detail}</p> : null}
      {status ? <StatusPill status={status} /> : null}
    </SteplyCard>
  );
}

export function SafetyNoticeCard({ children }) {
  return (
    <SteplyCard tone="notice" className="safety-notice">
      <div className="safety-notice__icon"><SteplyIcon name="shieldCheck" /></div>
      <div>
        <strong>Safety first</strong>
        <p>{children}</p>
      </div>
    </SteplyCard>
  );
}

export function EmptyStateCard({ title, message, action }) {
  return (
    <SteplyCard className="empty-state-card">
      <div className="empty-state-card__symbol"><SteplyIcon name="fileText" size={26} /></div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </SteplyCard>
  );
}

export function TimerCircle({ value = 17, max = 30, label = 'seconds', score = 88 }) {
  const progress = Math.max(0, Math.min(1, value / max));
  const degrees = progress * 360;

  return (
    <div className="timer-circle" style={{ '--timer-deg': `${degrees}deg` }} aria-label={`${value} ${label} remaining`}>
      <div className="timer-circle__inner">
        <span className="timer-circle__value">{value}</span>
        <span className="timer-circle__label">{label}</span>
        <span className="timer-circle__score">Record {score}</span>
      </div>
    </div>
  );
}

export function ExerciseCard({
  number,
  title,
  description,
  minutes,
  type = 'A',
  completed = false,
  safety,
  action,
  active = false,
}) {
  return (
    <SteplyCard className={`exercise-card ${completed ? 'exercise-card--complete' : ''} ${active ? 'exercise-card--active' : ''}`}>
      <div className="exercise-card__topline">
        <span className="exercise-card__number">{number}</span>
        <span className="exercise-card__chip">{type}</span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="exercise-card__meta">
        <span>{minutes} min</span>
        <span>{completed ? 'Completed' : 'Guided'}</span>
      </div>
      {safety ? <div className="exercise-card__safety">{safety}</div> : null}
      {action ? <div className="exercise-card__action">{action}</div> : null}
    </SteplyCard>
  );
}
