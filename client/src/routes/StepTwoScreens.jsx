import { useEffect, useMemo, useState } from 'react';
import { HomeLogo } from '../components/HomeLogo';
import { navigateSpa } from './spaNavigation';
import {
  AppHeader,
  CameraPreview,
  ConnectionIndicator,
  EmergencyStopButton,
  MetricCard,
  PrimaryActionBar,
} from '../components/foundation/SteplyDesignSystem';

function formatDate(value, style = 'long') {
  const options = style === 'short'
    ? { month: 'short', day: 'numeric' }
    : { month: 'long', day: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat('en-US', options).format(value);
}

function goTo(path) {
  navigateSpa(path);
}

export function startLaptopCameraAndContinue(startCamera, navigate = goTo) {
  if (typeof startCamera !== 'function') return false;
  const startResult = startCamera();
  navigate('/display/home');
  return startResult;
}

function connectionScenario(dashboard) {
  const laptopSelected = dashboard?.cameraInputMode === 'LOCAL_WEBCAM';
  if (laptopSelected) {
    const ready = dashboard?.isCameraReady === true;
    const requesting = dashboard?.localCameraState === 'REQUESTING';
    return {
      status: ready ? 'connected' : 'waiting',
      label: ready ? 'Laptop camera ready' : requesting ? 'Starting laptop camera' : 'Laptop camera unavailable',
      detail: ready
        ? dashboard?.session?.profile
          ? 'Your laptop camera will be used for this session'
          : 'Camera ready. Scan the QR code to load your Mobile profile and recent history.'
        : dashboard?.localCameraError || 'Allow camera access to continue.',
      deviceLabel: 'Camera source',
      phoneName: 'This laptop camera',
      batteryLevel: 'Powered by laptop',
      networkQuality: 'Local — no video upload',
      cameraStatus: ready ? 'Streaming' : requesting ? 'Requesting permission' : 'Unavailable',
      success: ready ? 'Laptop camera selected. Video stays in this browser and is not saved.' : null,
    };
  }
  if (dashboard?.hasReceivedPhoneFrame || dashboard?.remoteCameraFrame?.decoded === true) {
    return {
      status: 'connected',
      label: 'Phone camera streaming',
      detail: dashboard.session?.profile?.displayName ? `${dashboard.session.profile.displayName}'s phone camera is live` : 'Phone camera video is live',
      deviceLabel: 'Phone name',
      phoneName: 'Paired Steply phone',
      batteryLevel: 'Unavailable on this PC',
      networkQuality: dashboard.remoteCameraStatus || 'Connected',
      cameraStatus: 'Streaming',
      success: 'Your phone camera is streaming. Steply is ready to continue.',
    };
  }
  if (dashboard?.session?.profile) {
    const disconnected = dashboard?.phoneCameraState === 'DISCONNECTED';
    return {
      status: 'waiting',
      label: disconnected ? 'Phone camera disconnected' : 'Phone profile linked',
      detail: dashboard.session.profile.displayName
        ? `${dashboard.session.profile.displayName}'s profile is linked. Waiting for the live phone camera frame.`
        : 'Phone profile is linked. Waiting for the live phone camera frame.',
      deviceLabel: 'Phone name',
      phoneName: 'Paired Steply phone',
      batteryLevel: 'Unavailable on this PC',
      networkQuality: dashboard.remoteCameraStatus || 'Waiting for video',
      cameraStatus: disconnected ? 'Disconnected' : 'Waiting for video',
    };
  }
  return {
    status: 'waiting',
    label: 'Waiting for your phone',
    detail: 'Scan the QR code or enter the connection code',
    deviceLabel: 'Phone name',
    phoneName: 'Not connected',
    batteryLevel: '-',
    networkQuality: 'Waiting',
    cameraStatus: 'Waiting',
  };
}

function connectionCode(dashboard) {
  const value = dashboard?.session?.id || dashboard?.sessionBundle?.qrPayload;
  if (!value) return '------';
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1000000;
  }
  return String(hash).padStart(6, '0');
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
  const isConnected = Boolean(dashboard?.session?.profile);
  const laptopSelected = dashboard?.cameraInputMode === 'LOCAL_WEBCAM';

  useEffect(() => {
    if (!isConnected) return undefined;
    const timer = window.setTimeout(() => goTo(profileTarget), 1600);
    return () => window.clearTimeout(timer);
  }, [isConnected, profileTarget]);

  return (
    <div className="foundation-shell step-two-shell step-two-connect">
      <main className="step-two-connect__layout">
        <section className="step-two-connect__intro">
          <div className="foundation-brand-mark" aria-hidden="true">S</div>
          <div className="foundation-eyebrow">Camera connection</div>
          <h1>Connect a Camera</h1>
          <p>Use your phone camera or this laptop camera while Steply gives you clear instructions.</p>
          <ol className="step-two-steps">
            <li><StepIcon>1</StepIcon><span>Choose the phone camera or select the laptop camera below.</span></li>
            <li><StepIcon>2</StepIcon><span>For Mobile profile and history, scan the QR code.</span></li>
            <li><StepIcon>3</StepIcon><span>Place the selected camera where your full body is visible.</span></li>
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
            <InfoRow label={state.deviceLabel} value={state.phoneName} tone={state.status === 'connected' ? 'success' : 'info'} />
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
            tertiaryLabel={laptopSelected ? 'Use Phone Camera' : 'Use This Laptop Camera'}
            onTertiary={laptopSelected
              ? dashboard?.handleUsePhoneCamera
              : () => startLaptopCameraAndContinue(dashboard?.handleStartLocalCamera)}
          />
        </section>
      </main>
    </div>
  );
}

export function DisplayProfileScreen({ dashboard }) {
  const continueTarget = '/display/home';
  const profile = dashboard?.session?.profile || null;

  if (!profile) {
    return (
      <div className="foundation-shell step-two-shell">
        <AppHeader
          title="No Mobile profile linked"
          eyebrow="Profile"
          description="Connect Steply Mobile and choose a stored profile before continuing."
          connection={<ConnectionIndicator status="waiting" label="Profile not ready" detail="Mobile profile required" />}
        />
        <main className="step-two-single-profile">
          <SectionCard title="Profile data is not available">
            <p>Steply does not create a temporary profile on the display.</p>
            <PrimaryActionBar primaryLabel="Connect Mobile" onPrimary={() => goTo('/display/connect')} />
          </SectionCard>
        </main>
      </div>
    );
  }

  return (
    <div className="foundation-shell step-two-shell">
      <AppHeader
        title="Profile ready"
        eyebrow="Profile"
        description="The paired phone supplied this profile for the current connection."
        connection={<ConnectionIndicator status="connected" label="Profile ready" detail={profile.displayName || 'Ready to continue'} />}
      />
      <main className="step-two-single-profile">
        <SectionCard title={`Continue as ${profile.displayName || 'Steply User'}`}>
          <p>The home screen is ready for today&apos;s assessment.</p>
          <PrimaryActionBar primaryLabel="Go to Home" onPrimary={() => goTo(continueTarget)} />
        </SectionCard>
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
  return (
    <div className="foundation-shell step-two-shell">
      <AppHeader
        title="Set up your profile on your phone"
        eyebrow="Profile setup"
        description="Profiles, safety acknowledgements, caregiver details, and sharing consent are stored and managed by the Steply phone app."
        connection={<ConnectionIndicator status="waiting" label="Phone setup required" detail="Unavailable on this PC" />}
      />
      <main className="step-two-onboarding">
        <SectionCard title="Continue in the paired Steply phone app">
          <p>This PC cannot create a profile or record consent. Complete setup on your phone, then reconnect this display.</p>
          <PrimaryActionBar
            primaryLabel="Reconnect Phone"
            secondaryLabel="Back to Profile"
            onPrimary={() => goTo('/display/connect')}
            onSecondary={() => goTo('/display/profile')}
          />
        </SectionCard>
      </main>
    </div>
  );
}

function supportLevelFromResult(dashboard) {
  const risk = dashboard?.assessmentSession?.steadi?.riskLevel
    || dashboard?.session?.assessmentSession?.steadi?.riskLevel
    || dashboard?.finalResult?.structuredPipeline?.steadiRiskLevel
    || dashboard?.finalResult?.fallRiskLevel;
  const normalizedRisk = String(risk || '').toLowerCase();
  if (!normalizedRisk || normalizedRisk.includes('not_scorable')) return 'Assessment not ready';
  if (normalizedRisk.includes('high') || normalizedRisk === 'needs_review') return 'Professional assessment recommended';
  if (normalizedRisk.includes('low')) return 'Low support needs';
  return 'Moderate support needs';
}

export function DisplayHomeScreen({ dashboard }) {
  const profile = dashboard?.session?.profile || {};
  const name = profile.displayName || null;
  const today = useMemo(() => formatDate(new Date()), []);
  const supportLevel = supportLevelFromResult(dashboard);
  const hasCameraConnection = Boolean(dashboard?.isCameraLinked);
  const phoneProfileLinked = dashboard?.cameraInputMode !== 'LOCAL_WEBCAM'
    && Boolean(dashboard?.isPhoneProfileLinked ?? dashboard?.session?.profile);
  const waitingForPhoneFrame = phoneProfileLinked && !hasCameraConnection;
  const cameraName = dashboard?.cameraInputMode === 'LOCAL_WEBCAM' ? 'Laptop camera' : 'Phone camera';
  const cameraConnectionLabel = hasCameraConnection
    ? `${cameraName} ready`
    : phoneProfileLinked
      ? dashboard?.phoneCameraState === 'DISCONNECTED'
        ? 'Phone camera disconnected'
        : 'Phone profile linked'
      : 'Connect a camera';
  const cameraConnectionDetail = hasCameraConnection
    ? 'Live video received and ready for today'
    : phoneProfileLinked
      ? dashboard?.activeCameraStatus || 'Waiting for live phone camera video'
      : 'Connect a phone or laptop camera before starting';
  const assessment = dashboard?.assessmentSession || dashboard?.session?.assessmentSession || null;
  const chair = assessment?.functionalTests?.CHAIR_STAND_30S?.acceptedResult;
  const balance = assessment?.functionalTests?.FOUR_STAGE_BALANCE?.acceptedResult;
  const tandem = balance?.balance?.stages?.find((stage) => stage.stage === 'TANDEM')?.holdSeconds
    ?? balance?.tandemHoldSeconds;

  return (
    <div className="foundation-shell step-two-shell">
      <AppHeader
        title={name ? `Good morning, ${name}` : 'Welcome to Steply'}
        eyebrow={today}
        description="Connect your phone and complete a balance or chair stand assessment."
        connection={(
          <ConnectionIndicator
            status={hasCameraConnection ? 'connected' : 'waiting'}
            label={cameraConnectionLabel}
            detail={cameraConnectionDetail}
          />
        )}
      />
      <main className="step-two-home">
        <section className="step-two-home-camera" aria-label="Selected camera live view">
          <CameraPreview
            frameSrc={dashboard?.activeCameraFrame?.src}
            mediaStream={dashboard?.activeCameraStream}
            label={`${cameraName} live preview`}
            guide="Keep your full body inside the frame"
            onFrameLoaded={dashboard?.handleCameraFrameLoaded}
            onFrameError={dashboard?.handleCameraFrameError}
          />
          <ConnectionIndicator
            status={hasCameraConnection ? 'connected' : 'waiting'}
            label={cameraConnectionLabel}
            detail={cameraConnectionDetail}
          />
        </section>
        <section className="step-two-session-card">
          <div>
            <div className="foundation-eyebrow">Today's Session</div>
            <h2>Today's Session</h2>
            <p>Use the selected {cameraName.toLowerCase()} for today&apos;s balance and chair stand checks.</p>
          </div>
          <div className="step-two-session-details">
            <InfoRow label={cameraName} value={hasCameraConnection ? 'Ready' : 'Connection required'} />
            <InfoRow label="Assessment history" value={dashboard?.historyItems?.length ? `${dashboard.historyItems.length} recent results` : 'Waiting for Mobile data'} />
          </div>
          <button
            type="button"
            className="ds-button ds-button--primary home-challenge-button"
            disabled={waitingForPhoneFrame}
            onClick={() => goTo(hasCameraConnection
              ? '/display/session/camera-setup'
              : '/display/connect')}
          >
            <span>Start Challenge</span>
            <small>{hasCameraConnection
              ? 'Begin today’s balance and chair stand checks'
              : waitingForPhoneFrame
                ? 'Waiting for live phone camera'
                : 'Connect a camera first'}</small>
          </button>
          <PrimaryActionBar
            secondaryLabel={hasCameraConnection ? 'Split Into Two Short Sessions' : 'View Progress'}
            onSecondary={() => goTo(hasCameraConnection ? '/display/session/plan' : '/display/progress')}
          />
        </section>

        <div className="step-two-status-grid">
          <MetricCard label="Current support level" value={supportLevel} detail={`Updated ${today}`} status={supportLevel === 'Low support needs' ? 'success' : 'info'} />
          <MetricCard label="Chair Stand result" value={chair?.chairStand?.cdcScoredRepetitions == null ? 'No valid result' : `${chair.chairStand.cdcScoredRepetitions} stands`} detail="Stored aggregate result" status="info" />
          <MetricCard label="Tandem Stand time" value={tandem == null ? 'No valid result' : `${Number(tandem).toFixed(1)} seconds`} detail="Stored aggregate result" status="info" />
        </div>

        <div className="step-two-dashboard-grid">
          <SectionCard title="Recent assessment history">
            <p>{dashboard?.historyItems?.length ? `${dashboard.historyItems.length} stored result entries are available.` : 'No stored assessment history is available yet.'}</p>
          </SectionCard>
          <SectionCard title="Care plan and reports">
            <p>Exercise adherence, reassessment scheduling, Care Agent decisions, and reports are unavailable on this PC. Review them in the paired Steply phone app.</p>
            <PrimaryActionBar
              primaryLabel="Report Guidance"
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
  const hasCameraConnection = Boolean(dashboard?.isCameraLinked);
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
            status={hasCameraConnection ? 'connected' : 'waiting'}
            label={hasCameraConnection ? 'Ready to start' : 'Camera needed'}
            detail={hasCameraConnection ? 'Support surface recommended' : 'Connect a phone or laptop camera before setup'}
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
            primaryLabel={hasCameraConnection ? 'Start Setup' : 'Connect Camera'}
            secondaryLabel="Return Home"
            onPrimary={() => goTo(hasCameraConnection ? '/display/session/screening' : '/display/connect')}
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
        <HomeLogo />
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

export function CameraPermissionScreen({ dashboard }) {
  const denied = dashboard?.cameraPermissionStatus === 'denied';
  const [settingsHint, setSettingsHint] = useState(false);

  return (
    <div className="foundation-camera-shell step-two-phone">
      <header className="foundation-camera-header">
        <HomeLogo />
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
        <HomeLogo />
        <div>
          <div className="foundation-eyebrow">Preview</div>
          <h1>Set Up Camera View</h1>
        </div>
      </header>
      <main className="step-two-phone-preview">
        <CameraPreview
          frameSrc={dashboard?.activeCameraFrame?.src}
          mediaStream={dashboard?.activeCameraStream}
          label={dashboard?.cameraInputMode === 'LOCAL_WEBCAM' ? 'Laptop camera preview' : 'Phone camera preview'}
          guide="Keep your full body in the frame"
          onFrameLoaded={dashboard?.handleCameraFrameLoaded}
          onFrameError={dashboard?.handleCameraFrameError}
        />
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

export function CameraStreamingScreen({ dashboard }) {
  const state = connectionScenario(dashboard);
  const selectedTest = dashboard?.selectedTest;
  return (
    <div className="foundation-camera-shell step-two-phone step-two-phone--streaming">
      <main className="step-two-streaming-panel">
        <HomeLogo />
        <h1>Connected to Display</h1>
        <p>Current assessment: {selectedTest ? selectedTest.replaceAll('_', ' ') : 'No assessment selected'}</p>
        <InfoRow label="Battery level" value={state.batteryLevel} />
        <InfoRow label="Network quality" value={state.networkQuality} tone={state.status === 'connected' ? 'success' : 'info'} />
        <InfoRow label="Camera status" value={state.cameraStatus} tone={state.status === 'connected' ? 'success' : 'info'} />
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
