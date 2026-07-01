import { SteplyButton, SteplyCard, ProfileAvatar, StatusPill } from './SteplyPrimitives';
import { formatDate } from '../utils/format';

function profileValue(value, fallback = '-') {
  return value === null || value === undefined || value === '' ? fallback : value;
}

export function SessionRail({
  sessionBundle,
  networkInfo,
  onCreateSession,
  onCopyPayload,
  onRefreshSession,
  busy,
  error,
}) {
  const session = sessionBundle?.session;
  const profile = session?.profile;
  const profileName = profile?.displayName || profile?.name;

  return (
    <aside className="session-rail" aria-label="Mobile connection panel">
      <div className="brand-lockup">
        <div className="brand-mark">S</div>
        <div>
          <strong>Steply</strong>
          <span>Remote Camera</span>
        </div>
      </div>

      <SteplyCard className="session-card">
        <div className="eyebrow">Mobile Link</div>
        <h2>QR Camera Session</h2>
        <p>Create a local QR session so the mobile app can link its profile and stream camera frames to this PC.</p>
        <SteplyButton onClick={onCreateSession} disabled={busy}>
          {busy ? 'Creating...' : session ? 'Create New QR Session' : 'Create QR Session'}
        </SteplyButton>
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
      </SteplyCard>

      <SteplyCard className="qr-card" tone="sand">
        <div className="card-heading-row">
          <div>
            <div className="eyebrow">Mobile QR</div>
            <h3>Scan in App</h3>
          </div>
          <StatusPill status={profile ? 'steady' : 'practice_needed'}>{profile ? 'Linked' : 'Waiting'}</StatusPill>
        </div>
        {sessionBundle?.qrDataUrl ? (
          <img className="qr-image" src={sessionBundle.qrDataUrl} alt="Steply mobile connection QR code" />
        ) : (
          <div className="qr-placeholder">QR</div>
        )}
        <div className="qr-payload-box" title={sessionBundle?.qrPayload || ''}>
          {sessionBundle?.qrPayload || 'Create a QR session to show the payload for the mobile app.'}
        </div>
        <SteplyButton variant="secondary" onClick={onCopyPayload} disabled={!sessionBundle?.qrPayload}>
          Copy Payload
        </SteplyButton>
      </SteplyCard>

      <SteplyCard className="rail-profile-card">
        <div className="card-heading-row">
          <div>
            <div className="eyebrow">Connected Profile</div>
            <h3>{profileName || 'No profile yet'}</h3>
          </div>
          <ProfileAvatar name={profileName || 'Steply User'} size="small" />
        </div>
        <p className="profile-helper-text">After QR linking, click lookup to refresh the profile saved on the phone.</p>
        <SteplyButton variant="secondary" onClick={onRefreshSession} disabled={!session?.id || busy}>
          Lookup Profile Info
        </SteplyButton>
        <dl className="profile-facts profile-facts--expanded">
          <div><dt>Name</dt><dd>{profileName || '-'}</dd></div>
          <div><dt>Birth Year</dt><dd>{profileValue(profile?.birthYear)}</dd></div>
          <div><dt>Gender</dt><dd>{profileValue(profile?.gender)}</dd></div>
          <div><dt>Height</dt><dd>{profile?.heightCm ? `${profile.heightCm} cm` : '-'}</dd></div>
          <div><dt>Session</dt><dd>{session?.id || '-'}</dd></div>
          <div><dt>Created</dt><dd>{formatDate(session?.createdAt)}</dd></div>
        </dl>
        <div className="profile-note-box">
          <strong>Movement Notes</strong>
          <span>{profileValue(profile?.movementNotes, 'No movement notes saved.')}</span>
        </div>
        <div className="profile-note-box">
          <strong>Safety Note</strong>
          <span>{profileValue(profile?.safetyNote, 'No safety note saved.')}</span>
        </div>
      </SteplyCard>

      <div className="local-network-note">
        <strong>Local-first setup</strong>
        <span>{networkInfo?.dashboardUrl || 'Connect the PC and phone to the same network.'}</span>
      </div>
    </aside>
  );
}
