import { ProfileAvatar, StatusPill } from './SteplyPrimitives';

function profileValue(value, fallback = '-') {
  return value === null || value === undefined || value === '' ? fallback : value;
}

function statusText(value, fallback = 'Waiting') {
  return value || fallback;
}

export function ProfileSidebar({
  session,
  remoteCameraStatus,
  workerStatus,
  collapsed = false,
  onToggle,
}) {
  const profile = session?.profile;
  const profileName = profile?.displayName || profile?.name || 'Waiting for mobile profile';
  const isLinked = Boolean(profile);

  return (
    <aside className={`profile-sidebar ${collapsed ? 'profile-sidebar--collapsed' : ''}`} aria-label="Profile sidebar">
      <button
        type="button"
        className="profile-sidebar__toggle"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Expand profile sidebar' : 'Collapse profile sidebar'}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        {collapsed ? '›' : '‹'}
      </button>

      <div className="profile-sidebar__brand">
        <div className="brand-mark">S</div>
        {!collapsed ? (
          <div>
            <strong>Steply</strong>
            <span>PC Movement Coach</span>
          </div>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="steply-card profile-sidebar__card">
          <div className="card-heading-row">
            <div>
              <div className="eyebrow">Mobile Profile</div>
              <h3>{profileName}</h3>
            </div>
            <ProfileAvatar name={profileName} size="small" />
          </div>

          <div className="profile-sidebar__status-list">
            <div>
              <span>Mobile Link</span>
              <StatusPill status={isLinked ? 'steady' : 'practice_needed'}>
                {isLinked ? 'Connected' : 'Waiting'}
              </StatusPill>
            </div>
            <div>
              <span>Camera</span>
              <strong>{statusText(remoteCameraStatus, 'Not connected')}</strong>
            </div>
            <div>
              <span>Pose Worker</span>
              <strong>{statusText(workerStatus, 'Booting')}</strong>
            </div>
          </div>

          <dl className="profile-facts profile-facts--expanded">
            <div><dt>Name</dt><dd>{profile?.displayName || profile?.name || '-'}</dd></div>
            <div><dt>Birth Year</dt><dd>{profileValue(profile?.birthYear)}</dd></div>
            <div><dt>Gender</dt><dd>{profileValue(profile?.gender)}</dd></div>
            <div><dt>Height</dt><dd>{profile?.heightCm ? `${profile.heightCm} cm` : '-'}</dd></div>
          </dl>
        </div>
      ) : (
        <div className="profile-sidebar__collapsed-status" title={isLinked ? 'Connected' : 'Waiting'}>
          <span className={isLinked ? 'status-dot' : 'status-dot status-dot--waiting'} />
        </div>
      )}
    </aside>
  );
}
