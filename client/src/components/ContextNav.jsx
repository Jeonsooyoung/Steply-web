import { SteplyButton } from './SteplyPrimitives';

const contextOptions = [
  { id: 'home', label: "I'm exercising", helper: 'Simple guided mission' },
  { id: 'care', label: "I'm supporting a group", helper: 'Center screening dashboard' },
  { id: 'reports', label: "I'm checking a report", helper: 'Weekly movement trends' },
];

const navItems = [
  { id: 'home', label: 'Today', context: 'home' },
  { id: 'mission', label: 'Start Mission', context: 'home' },
  { id: 'exercise', label: 'Recommended Exercise', context: 'home' },
  { id: 'progress', label: 'My Progress', context: 'home' },
  { id: 'care', label: 'Care Dashboard', context: 'care' },
  { id: 'reports', label: 'Reports', context: 'reports' },
];

const seniorNavItems = navItems.filter((item) => item.context === 'home');

function CameraStatus({ isMobileConnected, onOpenCameraLink }) {
  return (
    <div className="camera-link-status">
      <span className={isMobileConnected ? 'status-dot' : 'status-dot status-dot--waiting'} />
      <span>{isMobileConnected ? 'Camera linked' : 'Camera not linked'}</span>
      <SteplyButton variant="secondary" className="camera-link-status__button" onClick={onOpenCameraLink}>
        Connect phone camera
      </SteplyButton>
    </div>
  );
}

export function ContextNav({
  activeContext,
  activeView,
  onContextChange,
  onNavigate,
  onOpenCameraLink,
  isMobileConnected,
}) {
  if (activeContext === 'home') {
    return (
      <div className="service-navigation service-navigation--senior" aria-label="Steply home navigation">
        <nav className="senior-primary-nav" aria-label="Home sections">
          {seniorNavItems
            .filter((item) => item.id !== 'exercise')
            .map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? 'primary-nav__item primary-nav__item--active' : 'primary-nav__item'}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className="primary-nav__item senior-camera-link"
            onClick={onOpenCameraLink}
          >
            <span className={isMobileConnected ? 'status-dot' : 'status-dot status-dot--waiting'} />
            {isMobileConnected ? 'Camera Ready' : 'Connect Camera'}
          </button>
          <button type="button" className="senior-support-link" onClick={() => onNavigate('care')}>
            Staff
          </button>
          <button type="button" className="senior-support-link" onClick={() => onNavigate('reports')}>
            Reports
          </button>
        </nav>
      </div>
    );
  }

  return (
    <div className="service-navigation" aria-label="Steply service navigation">
      <div className="context-switcher" role="tablist" aria-label="Choose how you are using Steply">
        {contextOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={activeContext === option.id}
            className={activeContext === option.id ? 'context-option context-option--active' : 'context-option'}
            onClick={() => onContextChange(option.id)}
          >
            <strong>{option.label}</strong>
            <span>{option.helper}</span>
          </button>
        ))}
      </div>

      <div className="primary-nav-row">
        <nav className="primary-nav" aria-label="Main sections">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? 'primary-nav__item primary-nav__item--active' : 'primary-nav__item'}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <CameraStatus isMobileConnected={isMobileConnected} onOpenCameraLink={onOpenCameraLink} />
      </div>
    </div>
  );
}
