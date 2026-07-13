import { SteplyIcon } from './icons';

export function Panel({ children, className = '' }) {
  return <section className={`ref-panel ${className}`}>{children}</section>;
}

export function SectionTitle({ icon, children, tone = 'green' }) {
  return (
    <div className={`ref-section-title ref-section-title--${tone}`}>
      {icon ? <span><SteplyIcon name={icon} /></span> : null}
      <h2>{children}</h2>
    </div>
  );
}

export function CheckList({ items, amber = false }) {
  return (
    <ul className={`ref-check-list${amber ? ' ref-check-list--amber' : ''}`}>
      {items.map((item) => <li key={item}><span><SteplyIcon name="check" size={11} strokeWidth={2.5} /></span>{item}</li>)}
    </ul>
  );
}

export function ProgressRing({ value = 18, label = 'seconds', progress = 72, large = false }) {
  return (
    <div className={`ref-ring${large ? ' ref-ring--large' : ''}`} style={{ '--ring-progress': `${progress * 3.6}deg` }}>
      <div><strong>{value}</strong><span>{label}</span></div>
    </div>
  );
}

export function ScreenHeading({ title, subtitle, children }) {
  return (
    <header className="ref-page-heading">
      <div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
      {children}
    </header>
  );
}

export function Metric({ icon, label, value, note, tone = 'green' }) {
  return (
    <Panel className={`ref-metric ref-metric--${tone}`}>
      <span className="ref-metric__icon"><SteplyIcon name={icon} size={24} /></span>
      <div><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</div>
    </Panel>
  );
}
