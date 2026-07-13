import { useEffect, useState } from 'react';
import steplyLogo from '../../../assets/steply-logo.png';
import { SteplyIcon } from './icons';
import { goTo, referenceNavItems } from './navigation';

const REFERENCE_CANVAS_WIDTH = 1680;
const REFERENCE_CANVAS_HEIGHT = 945;

function getViewportFit() {
  if (typeof window === 'undefined' || window.innerWidth < 1100) return { enabled: false, style: undefined };

  const scale = Math.min(
    window.innerWidth / REFERENCE_CANVAS_WIDTH,
    window.innerHeight / REFERENCE_CANVAS_HEIGHT,
  );
  const renderedWidth = REFERENCE_CANVAS_WIDTH * scale;
  const renderedHeight = REFERENCE_CANVAS_HEIGHT * scale;

  return {
    enabled: true,
    style: {
      '--ref-fit-scale': scale,
      '--ref-fit-left': `${Math.max(0, (window.innerWidth - renderedWidth) / 2)}px`,
      '--ref-fit-top': `${Math.max(0, (window.innerHeight - renderedHeight) / 2)}px`,
    },
  };
}

function useViewportFit() {
  const [fit, setFit] = useState(getViewportFit);

  useEffect(() => {
    function syncViewportFit() {
      setFit(getViewportFit());
    }

    window.addEventListener('resize', syncViewportFit);
    return () => window.removeEventListener('resize', syncViewportFit);
  }, []);

  return fit;
}

const defaultProfile = {
  displayName: 'Mrs. Kim',
  initials: 'MK',
  age: 76,
  sex: 'Female',
};

function Brand() {
  return (
    <button type="button" className="ref-brand" onClick={() => goTo('/display/home')} aria-label="Steply home">
      <img className="ref-brand__icon" src={steplyLogo} alt="" aria-hidden="true" />
      <strong>Steply</strong>
    </button>
  );
}

function UserMenu({ profile = defaultProfile }) {
  return (
    <button type="button" className="ref-user" aria-label="Open profile menu">
      <span className="ref-avatar" aria-hidden="true">{profile.initials}</span>
      <span>{profile.displayName}</span>
      <SteplyIcon name="chevronDown" size={18} />
    </button>
  );
}

function Sidebar({ active, profile = defaultProfile }) {
  return (
    <aside className="ref-sidebar">
      <Brand />
      <nav aria-label="Primary navigation">
        {referenceNavItems.map((item) => (
          <button
            type="button"
            key={item.label}
            className={`${active === item.label ? 'is-active' : ''}${item.interactive === false ? ' is-inert' : ''}`}
            onClick={item.interactive === false ? undefined : () => goTo(item.href)}
            aria-disabled={item.interactive === false || undefined}
          >
            <span><SteplyIcon name={item.icon} size={22} /></span>
            {item.label}
          </button>
        ))}
      </nav>
      <section className="ref-profile-card">
        <div className="ref-profile-card__portrait" aria-hidden="true"><span>{profile.initials}</span></div>
        <h3>{profile.displayName}</h3>
        <p>Age {profile.age}&nbsp; · &nbsp;{profile.sex}</p>
        <button type="button" onClick={() => goTo('/display/profile')}><SteplyIcon name="user" size={16} />View Profile</button>
      </section>
    </aside>
  );
}

export function PageShell({ active, children, wide = false, topUser = true, className = '', profile }) {
  const viewportFit = useViewportFit();

  return (
    <div
      className={`ref-app ${viewportFit.enabled ? 'ref-app--fit' : ''} ${wide ? 'ref-app--wide' : ''} ${className}`}
      style={viewportFit.style}
    >
      <Sidebar active={active} profile={profile} />
      <section className="ref-workspace">
        {topUser ? <div className="ref-top-user"><UserMenu profile={profile} /></div> : null}
        {children}
      </section>
    </div>
  );
}
