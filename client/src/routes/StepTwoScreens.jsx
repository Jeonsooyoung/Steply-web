import { useEffect, useMemo, useState } from 'react';
import {
  AdherenceChart,
  AppHeader,
  CameraPreview,
  ConnectionIndicator,
  EmergencyStopButton,
  MetricCard,
  PrimaryActionBar,
  TrendSummaryCard,
} from '../components/foundation/SteplyDesignSystem';

function formatDate(value, style = 'long') {
  const options = style === 'short'
    ? { month: 'short', day: 'numeric' }
    : { month: 'long', day: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat('en-US', options).format(value);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function queryValue(name, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  return new URLSearchParams(window.location.search).get(name) || fallback;
}

function goTo(path) {
  if (typeof window !== 'undefined') window.location.assign(path);
}

function connectionScenario(dashboard) {
  const state = queryValue('state', '');
  if (state === 'connected') {
    return {
      status: 'connected',
      label: 'Phone connected',
      detail: "Maria's iPhone is ready",
      phoneName: "Maria's iPhone",
      batteryLevel: '82%',
      networkQuality: 'Strong',
      cameraStatus: 'Ready',
      success: 'Your phone is connected. Steply is ready to continue.',
    };
  }
  if (state === 'timeout') {
    return {
      status: 'lost',
      label: 'Connection timed out',
      detail: 'Refresh the code and try again',
      phoneName: 'Not connected',
      batteryLevel: '-',
      networkQuality: 'No connection',
      cameraStatus: 'Waiting',
    };
  }
  if (state === 'lost') {
    return {
      status: 'lost',
      label: 'Connection lost',
      detail: 'Reconnect the phone before starting',
      phoneName: "Maria's iPhone",
      batteryLevel: '78%',
      networkQuality: 'Disconnected',
      cameraStatus: 'Paused',
    };
  }
  if (state === 'unstable') {
    return {
      status: 'waiting',
      label: 'Network connection is unstable',
      detail: 'Move closer to Wi-Fi if possible',
      phoneName: "Maria's iPhone",
      batteryLevel: '78%',
      networkQuality: 'Weak',
      cameraStatus: 'Waiting',
    };
  }
  if (dashboard?.remoteCameraFrame?.src || dashboard?.session?.profile) {
    return {
      status: 'connected',
      label: 'Phone connected',
      detail: dashboard.session?.profile?.name ? `${dashboard.session.profile.name}'s phone is linked` : 'Phone camera is linked',
      phoneName: dashboard.session?.profile?.deviceName || 'Linked phone',
      batteryLevel: dashboard.session?.profile?.batteryLevel || 'Ready',
      networkQuality: 'Connected',
      cameraStatus: dashboard.remoteCameraFrame?.src ? 'Streaming' : 'Ready',
      success: 'Your phone is connected. Steply is ready to continue.',
    };
  }
  return {
    status: 'waiting',
    label: 'Waiting for your phone',
    detail: 'Scan the QR code or enter the connection code',
    phoneName: 'Not connected',
    batteryLevel: '-',
    networkQuality: 'Waiting',
    cameraStatus: 'Waiting',
  };
}

function connectionCode(dashboard) {
  const value = dashboard?.session?.id || dashboard?.sessionBundle?.qrPayload || 'STEPLY';
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1000000;
  }
  return String(hash || 428193).padStart(6, '0');
}

function StepIcon({ children = 'i', tone = 'info' }) {
  return <span className={`step-two-icon step-two-icon--${tone}`} aria-hidden="true">{children}</span>;
}

function InfoRow({ label, value, tone = 'info' }) {
  return (
    <div className="step-two-info-row">
      <StepIcon tone={tone}>{tone === 'success' ? 'OK' : tone === 'danger' ? '!' : 'i'}</StepIcon>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionCard({ title, children, className = '' }) {
  return (
    <section className={`step-two-card ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function DisplayConnectScreen({ dashboard }) {
  const state = connectionScenario(dashboard);
  const code = connectionCode(dashboard);
  const hasQrCode = Boolean(dashboard?.sessionBundle?.qrDataUrl);
  const profileTarget = dashboard?.session?.profile ? '/display/home' : '/display/profile';
  const isConnected = state.status === 'connected';

  useEffect(() => {
    if (!isConnected || queryValue('state', '')) return undefined;
    const timer = window.setTimeout(() => goTo(profileTarget), 1600);
    return () => window.clearTimeout(timer);
  }, [isConnected, profileTarget]);

  return (
    <div className="foundation-shell step-two-shell step-two-connect">
      <main className="step-two-connect__layout">
        <section className="step-two-connect__intro">
          <div className="foundation-brand-mark" aria-hidden="true">S</div>
          <div className="foundation-eyebrow">Phone connection</div>
          <h1>Connect Your Phone</h1>
          <p>Your phone will record your movement while this screen gives you clear instructions.</p>
          <ol className="step-two-steps">
            <li><StepIcon>1</StepIcon><span>Open Steply on your phone.</span></li>
            <li><StepIcon>2</StepIcon><span>Scan the QR code or enter the connection code.</span></li>
            <li><StepIcon>3</StepIcon><span>Place your phone where your full body is visible.</span></li>
          </ol>
          <div className="step-two-privacy">
            <StepIcon>i</StepIcon>
            <span>Your camera video is analyzed live and is not saved.</span>
          </div>
        </section>

        <section className="step-two-connect__panel" aria-labelledby="connection-panel-title">
          <div>
            <div className="foundation-eyebrow">Secure code</div>
            <h2 id="connection-panel-title">Pair this display</h2>
          </div>
          <div className="step-two-qr-frame">
            {hasQrCode ? (
              <img src={dashboard.sessionBundle.qrDataUrl} alt="QR code for connecting the phone camera" />
            ) : (
              <div className="step-two-qr-placeholder">
                <span>QR</span>
                <small>Create or refresh a code</small>
              </div>
            )}
          </div>
          <div className="step-two-code" aria-label={`Connection code ${code}`}>
            {code.split('').map((digit, index) => <span key={`${digit}-${index}`}>{digit}</span>)}
          </div>
          <ConnectionIndicator status={state.status} label={state.label} detail={state.detail} />
          <div className="step-two-device-grid">
            <InfoRow label="Phone name" value={state.phoneName} tone={state.status === 'connected' ? 'success' : 'info'} />
            <InfoRow label="Battery level" value={state.batteryLevel} />
            <InfoRow label="Network quality" value={state.networkQuality} tone={state.networkQuality === 'Weak' ? 'danger' : 'info'} />
          </div>
          {state.success ? (
            <div className="step-two-success" role="status">
              <StepIcon tone="success">OK</StepIcon>
              <span>{state.success}</span>
            </div>
          ) : null}
          <PrimaryActionBar
            primaryLabel={isConnected ? 'Continue' : 'Refresh Code'}
            secondaryLabel={isConnected ? 'Refresh Code' : 'Connection Help'}
            onPrimary={isConnected ? () => goTo(profileTarget) : dashboard?.handleCreateSession}
            onSecondary={isConnected ? dashboard?.handleCreateSession : () => goTo('/camera/connect')}
          />
        </section>
      </main>
    </div>
  );
}

const demoProfiles = [
  {
    id: 'maria',
    name: 'Maria',
    lastSessionDate: 'July 7, 2026',
    nextReassessmentDate: 'August 8, 2026',
    supportLevel: 'Moderate support needs',
  },
  {
    id: 'james',
    name: 'James',
    lastSessionDate: 'July 4, 2026',
    nextReassessmentDate: 'August 1, 2026',
    supportLevel: 'Low support needs',
  },
];

export function DisplayProfileScreen({ dashboard }) {
  const profileMode = queryValue('profiles', dashboard?.session?.profile ? 'one' : 'multiple');
  const profiles = profileMode === 'one'
    ? [dashboard?.session?.profile || demoProfiles[0]]
    : demoProfiles;

  if (profiles.length <= 1) {
    return (
      <div className="foundation-shell step-two-shell">
        <AppHeader
          title="Profile ready"
          eyebrow="Profile"
          description="Steply found one profile, so this selection step is skipped."
          connection={<ConnectionIndicator status="connected" label="Profile ready" detail={profiles[0]?.name || 'Ready to continue'} />}
        />
        <main className="step-two-single-profile">
          <SectionCard title={`Continue as ${profiles[0]?.name || 'Steply User'}`}>
            <p>The home screen is ready for today's session.</p>
            <PrimaryActionBar
              primaryLabel="Go to Home"
              secondaryLabel="Add New Profile"
              onPrimary={() => goTo('/display/home')}
              onSecondary={() => goTo('/display/onboarding')}
            />
          </SectionCard>
        </main>
      </div>
    );
  }

  return (
    <div className="foundation-shell step-two-shell">
      <AppHeader
        title="Who is using Steply today?"
        eyebrow="Profile"
        description="Choose the profile for this session."
        connection={<ConnectionIndicator status="connected" label="Phone connected" detail="Profiles are ready" />}
      />
      <main className="step-two-profile-grid">
        {profiles.map((profile) => (
          <section className="step-two-profile-card" key={profile.id}>
            <div className="step-two-avatar" aria-hidden="true">{profile.name.charAt(0)}</div>
            <div>
              <h2>{profile.name}</h2>
              <p>{profile.supportLevel}</p>
            </div>
            <InfoRow label="Last session" value={profile.lastSessionDate} />
            <InfoRow label="Next reassessment" value={profile.nextReassessmentDate} />
            <button type="button" className="ds-button ds-button--primary" onClick={() => goTo('/display/home')}>
              Continue as {profile.name}
            </button>
          </section>
        ))}
        <button type="button" className="step-two-add-profile" onClick={() => goTo('/display/onboarding')}>
          <StepIcon>+</StepIcon>
          <span>Add New Profile</span>
        </button>
      </main>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="step-two-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function DisplayOnboardingScreen() {
  const step = Number(queryValue('step', '1'));
  const safeStep = Math.min(3, Math.max(1, Number.isFinite(step) ? step : 1));

  return (
    <div className="foundation-shell step-two-shell">
      <AppHeader
        title="Set Up Steply"
        eyebrow={`Step ${safeStep} of 3`}
        description="Steply uses a few details to make today's session easier to follow."
        connection={<ConnectionIndicator status="waiting" label="Setup in progress" detail="You can set up sharing later" />}
      />
      <main className="step-two-onboarding">
        {safeStep === 1 ? (
          <SectionCard title="Basic information">
            <div className="step-two-form-grid">
              <Field label="Preferred name">
                <input type="text" defaultValue="Maria" aria-label="Preferred name" />
              </Field>
              <Field label="Age">
                <input type="number" defaultValue="74" min="18" aria-label="Age" />
              </Field>
              <Field label="Sex used for the CDC reference range">
                <select defaultValue="female" aria-label="Sex used for the CDC reference range">
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="not_shared">Prefer not to say</option>
                </select>
              </Field>
            </div>
            <p className="step-two-note">Age and sex are used only to compare your Chair Stand result with the CDC reference range.</p>
            <PrimaryActionBar
              primaryLabel="Continue"
              secondaryLabel="Back"
              onPrimary={() => goTo('/display/onboarding?step=2')}
              onSecondary={() => goTo('/display/profile')}
            />
          </SectionCard>
        ) : null}

        {safeStep === 2 ? (
          <SectionCard title="Health and safety notice">
            <div className="step-two-safety-grid">
              {[
                'Steply does not provide a medical diagnosis.',
                'Stop immediately if you feel dizzy, have chest pain, or cannot catch your breath.',
                'Talk with a healthcare professional if you recently fell or have severe pain.',
                'A professional assessment is required before starting advanced exercises when a high level of concern is identified.',
              ].map((item) => (
                <div className="step-two-safety-card" key={item}>
                  <StepIcon>i</StepIcon>
                  <p>{item}</p>
                </div>
              ))}
            </div>
            <label className="step-two-checkbox">
              <input type="checkbox" />
              <span>I have read and understood this safety information.</span>
            </label>
            <PrimaryActionBar
              primaryLabel="Continue"
              secondaryLabel="Back"
              onPrimary={() => goTo('/display/onboarding?step=3')}
              onSecondary={() => goTo('/display/onboarding?step=1')}
            />
          </SectionCard>
        ) : null}

        {safeStep === 3 ? (
          <SectionCard title="Family or caregiver sharing">
            <div className="step-two-form-grid">
              <Field label="Caregiver name">
                <input type="text" placeholder="Optional" aria-label="Caregiver name" />
              </Field>
              <Field label="Contact information">
                <input type="text" placeholder="Phone or email" aria-label="Contact information" />
              </Field>
              <Field label="Weekly report sharing">
                <select defaultValue="ask" aria-label="Weekly report sharing">
                  <option value="ask">Ask me first</option>
                  <option value="on">Share weekly report</option>
                  <option value="off">Do not share</option>
                </select>
              </Field>
              <Field label="Safety notification preference">
                <select defaultValue="important" aria-label="Safety notification preference">
                  <option value="important">Important safety updates only</option>
                  <option value="all">All safety updates</option>
                  <option value="none">No safety notifications</option>
                </select>
              </Field>
            </div>
            <PrimaryActionBar
              primaryLabel="Save and Continue"
              secondaryLabel="Set Up Later"
              onPrimary={() => goTo('/display/home')}
              onSecondary={() => goTo('/display/home')}
            />
          </SectionCard>
        ) : null}
      </main>
    </div>
  );
}

function supportLevelFromResult(dashboard) {
  const risk = dashboard?.finalResult?.fallRiskLevel || queryValue('support', 'moderate');
  if (String(risk).includes('high') || risk === 'needs_review') return 'Professional assessment recommended';
  if (String(risk).includes('low')) return 'Low support needs';
  return 'Moderate support needs';
}

export function DisplayHomeScreen({ dashboard }) {
  const name = dashboard?.session?.profile?.name || queryValue('name', 'Maria');
  const today = useMemo(() => formatDate(new Date()), []);
  const nextDate = useMemo(() => formatDate(addDays(28), 'short'), []);
  const supportLevel = supportLevelFromResult(dashboard);
  const hasPhoneConnection = Boolean(dashboard?.remoteCameraFrame?.src || dashboard?.session?.profile);

  return (
    <div className="foundation-shell step-two-shell">
      <AppHeader
        title={`Good morning, ${name}`}
        eyebrow={today}
        description="Today includes a balance reassessment and your recommended exercises."
        connection={(
          <ConnectionIndicator
            status={hasPhoneConnection ? 'connected' : 'waiting'}
            label={hasPhoneConnection ? 'Phone camera connected' : 'Connect phone camera'}
            detail={hasPhoneConnection ? 'Ready for today' : 'Scan the QR code before starting the camera assessment'}
          />
        )}
      />
      <main className="step-two-home">
        <section className="step-two-session-card">
          <div>
            <div className="foundation-eyebrow">Today's Session</div>
            <h2>Today's Session</h2>
            <p>Today includes a balance reassessment and your recommended exercises.</p>
            <p>Your Tandem Stand time has decreased across recent sessions, so Steply moved your reassessment forward.</p>
          </div>
          <div className="step-two-session-details">
            <InfoRow label="Session type" value="Reassessment and exercise" />
            <InfoRow label="Estimated duration" value="18 minutes" />
            <InfoRow label="Included today" value="Balance test, chair stand, exercises" />
          </div>
          <PrimaryActionBar
            primaryLabel={hasPhoneConnection ? "Start Today's Session" : 'Connect Phone Camera'}
            secondaryLabel={hasPhoneConnection ? 'Split Into Two Short Sessions' : 'View Progress'}
            onPrimary={() => goTo(hasPhoneConnection ? '/display/session/plan' : '/display/connect')}
            onSecondary={() => goTo(hasPhoneConnection ? '/display/session/plan?split=1' : '/display/progress')}
          />
        </section>

        <div className="step-two-status-grid">
          <MetricCard label="Current support level" value={supportLevel} detail={`Updated ${today}`} status={supportLevel === 'Low support needs' ? 'success' : 'info'} />
          <MetricCard label="Chair Stand result" value="9 stands" detail="Previous: 10 stands. CDC reference line shown in details." status="info" />
          <MetricCard label="Tandem Stand time" value="8.6 seconds" detail="Previous: 9.1 seconds. Measured July 7." status="info" />
        </div>

        <div className="step-two-dashboard-grid">
          <TrendSummaryCard title="Recent five-session trend" trend="Balance needs attention" detail="Small changes are easier to notice across repeated sessions." />
          <AdherenceChart days={[
            { label: 'Mon', value: 70 },
            { label: 'Tue', value: 60 },
            { label: 'Wed', value: 80 },
            { label: 'Thu', value: 55 },
            { label: 'Fri', value: 75 },
          ]} />
          <SectionCard title="Next reassessment">
            <p>Next assessment: {nextDate}</p>
            <p>Steply may move this date forward if recent sessions need closer review.</p>
          </SectionCard>
          <SectionCard title="Latest weekly report">
            <p>Your weekly report is ready to review with family or a healthcare professional.</p>
            <PrimaryActionBar
              primaryLabel="View Weekly Report"
              secondaryLabel="View Progress"
              onPrimary={() => goTo('/display/reports')}
              onSecondary={() => goTo('/display/progress')}
            />
          </SectionCard>
        </div>
      </main>
    </div>
  );
}

export function DisplaySessionPlanScreen({ dashboard }) {
  const hasPhoneConnection = Boolean(dashboard?.remoteCameraFrame?.src || dashboard?.session?.profile);
  const timeline = [
    { icon: 'i', name: 'Quick Health Check', time: '2 minutes', detail: 'Answer a few short CDC STEADI questions.' },
    { icon: '!', name: 'Safety Setup', time: '2 minutes', detail: 'Check the chair, floor, and support surface.' },
    { icon: 'i', name: 'Balance Test', time: '5 minutes', detail: 'Complete the 4-Stage Balance Test with clear guidance.' },
    { icon: 'i', name: 'Chair Stand Test', time: '3 minutes', detail: 'Complete the 30-Second Chair Stand Test at a safe pace.' },
    { icon: 'OK', name: 'Recommended Exercises', time: '6 minutes', detail: 'Practice exercises from the Otago Exercise Programme.' },
  ];

  return (
    <div className="foundation-shell step-two-shell">
      <AppHeader
        title="Today's Session"
        eyebrow="Session plan"
        description="Review the plan before starting setup."
        connection={(
          <ConnectionIndicator
            status={hasPhoneConnection ? 'connected' : 'waiting'}
            label={hasPhoneConnection ? 'Ready to start' : 'Phone camera needed'}
            detail={hasPhoneConnection ? 'Support surface recommended' : 'Connect the phone camera before setup'}
          />
        )}
      />
      <main className="step-two-plan">
        <section className="step-two-timeline" aria-label="Today's session timeline">
          {timeline.map((item) => (
            <article className="step-two-timeline-item" key={item.name}>
              <StepIcon tone={item.icon === '!' ? 'warning' : item.icon === 'OK' ? 'success' : 'info'}>{item.icon}</StepIcon>
              <div>
                <h2>{item.name}</h2>
                <p>{item.detail}</p>
              </div>
              <strong>{item.time}</strong>
            </article>
          ))}
        </section>
        <aside className="step-two-summary-panel">
          <h2>Session summary</h2>
          <InfoRow label="Total estimated time" value="18 minutes" />
          <InfoRow label="Equipment needed" value="Stable chair" />
          <InfoRow label="Support surface needed" value="Chair, wall, or counter" />
          <InfoRow label="Caregiver recommended" value="Helpful, not required" />
          <PrimaryActionBar
            primaryLabel={hasPhoneConnection ? 'Start Setup' : 'Connect Phone Camera'}
            secondaryLabel="Return Home"
            onPrimary={() => goTo(hasPhoneConnection ? '/display/session/screening' : '/display/connect')}
            onSecondary={() => goTo('/display/home')}
          />
        </aside>
      </main>
    </div>
  );
}

export function CameraConnectScreen() {
  const [code, setCode] = useState('');
  return (
    <div className="foundation-camera-shell step-two-phone">
      <header className="foundation-camera-header">
        <div className="foundation-brand-mark" aria-hidden="true">S</div>
        <div>
          <div className="foundation-eyebrow">Phone camera</div>
          <h1>Connect to Display</h1>
        </div>
      </header>
      <main className="step-two-phone-main">
        <SectionCard title="Scan or enter code">
          <button type="button" className="step-two-scan-button">
            <StepIcon>i</StepIcon>
            <span>Scan QR Code</span>
          </button>
          <Field label="Six-digit connection code">
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              placeholder="123456"
              aria-label="Six-digit connection code"
            />
          </Field>
        </SectionCard>
      </main>
      <PrimaryActionBar
        primaryLabel="Connect to Display"
        secondaryLabel="Cancel"
        onPrimary={() => goTo('/camera/permission')}
        onSecondary={() => goTo('/camera/stopped')}
      />
    </div>
  );
}

export function CameraPermissionScreen() {
  const denied = queryValue('denied', '') === '1' || queryValue('state', '') === 'denied';
  const [settingsHint, setSettingsHint] = useState(queryValue('settings', '') === '1');

  return (
    <div className="foundation-camera-shell step-two-phone">
      <header className="foundation-camera-header">
        <div className="foundation-brand-mark" aria-hidden="true">S</div>
        <div>
          <div className="foundation-eyebrow">Permission</div>
          <h1>{denied ? 'Camera Access Is Required' : 'Allow Camera Access'}</h1>
        </div>
      </header>
      <main className="step-two-phone-main">
        <SectionCard title={denied ? 'Camera access is required' : 'Why permission is needed'}>
          {denied ? <p>Camera access is needed before Steply can guide a camera-supported session.</p> : null}
          <div className="step-two-safety-grid step-two-safety-grid--phone">
            <div className="step-two-safety-card"><StepIcon>i</StepIcon><p>Camera access lets the large display guide your movement.</p></div>
            <div className="step-two-safety-card"><StepIcon>i</StepIcon><p>Local network access may be needed to connect this phone to the display.</p></div>
            <div className="step-two-safety-card"><StepIcon>OK</StepIcon><p>Your camera video is analyzed live and is not stored.</p></div>
          </div>
          {settingsHint ? <p className="step-two-note" role="status">Open your browser camera settings and allow camera access for Steply.</p> : null}
        </SectionCard>
      </main>
      <PrimaryActionBar
        primaryLabel={denied ? 'Try Again' : 'Allow Camera Access'}
        secondaryLabel={denied ? 'Open Browser Settings' : 'Not Now'}
        onPrimary={() => goTo(denied ? '/camera/permission' : '/camera/preview')}
        onSecondary={() => (denied ? setSettingsHint(true) : goTo('/camera/stopped'))}
      />
    </div>
  );
}

export function CameraPreviewScreen({ dashboard }) {
  return (
    <div className="foundation-camera-shell step-two-phone step-two-phone--preview">
      <header className="foundation-camera-header">
        <div className="foundation-brand-mark" aria-hidden="true">S</div>
        <div>
          <div className="foundation-eyebrow">Preview</div>
          <h1>Set Up Camera View</h1>
        </div>
      </header>
      <main className="step-two-phone-preview">
        <CameraPreview frameSrc={dashboard?.remoteCameraFrame?.src} label="Phone camera preview" guide="Keep your full body in the frame" />
        <ConnectionIndicator status="connected" label="Connected to display" detail="Portrait or landscape is fine if your full body is visible" />
        <SectionCard title="Framing guide">
          <p>Place the phone where the display can see your head, shoulders, hips, knees, and feet.</p>
        </SectionCard>
      </main>
      <PrimaryActionBar
        primaryLabel="Start Camera"
        secondaryLabel="Back"
        onPrimary={() => goTo('/camera/streaming')}
        onSecondary={() => goTo('/camera/permission')}
      />
    </div>
  );
}

export function CameraStreamingScreen() {
  const state = connectionScenario({ remoteCameraFrame: { src: 'ready' } });
  return (
    <div className="foundation-camera-shell step-two-phone step-two-phone--streaming">
      <main className="step-two-streaming-panel">
        <div className="foundation-brand-mark" aria-hidden="true">S</div>
        <h1>Connected to Display</h1>
        <p>Current assessment: 4-Stage Balance Test</p>
        <InfoRow label="Battery level" value={state.batteryLevel} />
        <InfoRow label="Network quality" value="Strong" tone="success" />
        <InfoRow label="Camera status" value="Streaming" tone="success" />
      </main>
      <EmergencyStopButton label="Stop Session" onClick={() => goTo('/camera/stopped')} />
    </div>
  );
}

export function CameraDisconnectedScreen() {
  return (
    <div className="foundation-camera-shell step-two-phone step-two-phone--disconnected">
      <main className="step-two-streaming-panel">
        <StepIcon tone="danger">!</StepIcon>
        <h1>Phone Connection Lost</h1>
        <p>The assessment has been paused.</p>
        <ConnectionIndicator status="lost" label="Phone Connection Lost" detail="The assessment has been paused." />
      </main>
      <PrimaryActionBar
        primaryLabel="Reconnect"
        secondaryLabel="End Session"
        onPrimary={() => goTo('/camera/connect')}
        onSecondary={() => goTo('/camera/stopped')}
      />
    </div>
  );
}
