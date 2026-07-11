import { useMemo, useState } from 'react';
import {
  AppHeader,
  CameraPreview,
  ConnectionIndicator,
  EmergencyStopButton,
  PrimaryActionBar,
  SessionProgress,
} from '../components/foundation/SteplyDesignSystem';

function queryParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function queryValue(name, fallback = '') {
  return queryParams().get(name) || fallback;
}

function goTo(path) {
  if (typeof window !== 'undefined') window.location.assign(path);
}

function routeWithParams(path, updates = {}) {
  const params = queryParams();
  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  });
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function StepIcon({ children = 'i', tone = 'info' }) {
  return <span className={`step-three-icon step-three-icon--${tone}`} aria-hidden="true">{children}</span>;
}

function VoiceButton({ script, onReplay }) {
  return (
    <button
      type="button"
      className="ds-button ds-button--secondary step-three-voice-button"
      data-voice-script={script}
      aria-label={`Hear again. ${script}`}
      onClick={onReplay}
    >
      Hear Again
    </button>
  );
}

function StatusRow({ label, status = 'checking', detail }) {
  const tone = status === 'ready' ? 'success' : status === 'adjust' ? 'warning' : status === 'lost' ? 'danger' : 'info';
  const value = status === 'ready' ? 'Ready' : status === 'adjust' ? 'Adjust Needed' : status === 'lost' ? 'Paused' : 'Checking';
  return (
    <div className={`step-three-status-row step-three-status-row--${tone}`}>
      <StepIcon tone={tone}>{tone === 'success' ? 'OK' : tone === 'danger' ? '!' : 'i'}</StepIcon>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function SessionShell({
  eyebrow,
  title,
  description,
  progress,
  connection,
  children,
  className = '',
}) {
  return (
    <div className={`foundation-shell step-three-shell ${className}`}>
      <AppHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        connection={connection}
        actions={<EmergencyStopButton label="Stop Session" onClick={() => goTo('/display/session/complete')} />}
      />
      {progress}
      {children}
    </div>
  );
}

function ScreeningProgress({ current }) {
  return (
    <div className="step-three-progress" aria-label={`Health check progress: ${current} of 3`}>
      <div>
        <span>Health Check {current} of 3</span>
        <strong>{Math.round((current / 3) * 100)}%</strong>
      </div>
      <div aria-hidden="true"><span style={{ width: `${(current / 3) * 100}%` }} /></div>
    </div>
  );
}

function answerLabel(value, map = {}) {
  if (!value) return 'Not answered';
  return map[value] || (value === 'yes' ? 'Yes' : value === 'no' ? 'No' : value);
}

function screeningAnswers() {
  const params = queryParams();
  return {
    fallen: params.get('fallen') || '',
    fallCount: params.get('fallCount') || '',
    injured: params.get('injured') || '',
    unsteady: params.get('unsteady') || '',
    worried: params.get('worried') || '',
  };
}

const screeningVoiceScripts = {
  1: 'Have you fallen in the past year? Choose Yes or No.',
  'fall-count': 'How many times have you fallen? Choose Once or Two or more times.',
  'fall-injury': 'Were you injured in a fall? Choose Yes or No.',
  2: 'Do you feel unsteady when standing or walking? Choose Yes or No.',
  3: 'Are you worried about falling? Choose Yes or No.',
  summary: 'Please review your answers. You can confirm them or make changes.',
};

export function DisplayScreeningScreen() {
  const screen = queryValue('q', '1');
  const answers = screeningAnswers();
  const [lastReplay, setLastReplay] = useState('');
  const isSummary = screen === 'summary';
  const questionNumber = screen === '2' ? 2 : screen === '3' ? 3 : 1;
  const voiceScript = screeningVoiceScripts[screen] || screeningVoiceScripts[1];

  const previousPath = useMemo(() => {
    if (screen === 'fall-count') return routeWithParams('/display/session/screening', { q: '1' });
    if (screen === 'fall-injury') return routeWithParams('/display/session/screening', { q: 'fall-count' });
    if (screen === '2') {
      return answers.fallen === 'yes'
        ? routeWithParams('/display/session/screening', { q: 'fall-injury' })
        : routeWithParams('/display/session/screening', { q: '1' });
    }
    if (screen === '3') return routeWithParams('/display/session/screening', { q: '2' });
    if (screen === 'summary') return routeWithParams('/display/session/screening', { q: '3' });
    return '/display/session/plan';
  }, [answers.fallen, screen]);

  const replay = () => setLastReplay(voiceScript);

  if (isSummary) {
    return (
      <SessionShell
        eyebrow="Health check"
        title="Please Review Your Answers"
        description="Check that your answers are correct before moving to the safety setup."
        connection={<ConnectionIndicator status="connected" label="Health check complete" detail="No result is shown yet" />}
        progress={<ScreeningProgress current={3} />}
      >
        <main className="step-three-screening step-three-screening--summary">
          <section className="step-three-question-card" data-voice-script={voiceScript}>
            <StepIcon>i</StepIcon>
            <div>
              <h2>Please Review Your Answers</h2>
              <p>No result is shown until the assessment is complete.</p>
            </div>
          </section>
          <div className="step-three-answer-summary">
            <StatusRow label="Fallen in the past year" status="ready" detail={answerLabel(answers.fallen)} />
            {answers.fallen === 'yes' ? (
              <>
                <StatusRow label="Number of falls" status="ready" detail={answerLabel(answers.fallCount, { once: 'Once', twoPlus: 'Two or more times' })} />
                <StatusRow label="Injured in a fall" status="ready" detail={answerLabel(answers.injured)} />
              </>
            ) : null}
            <StatusRow label="Unsteady standing or walking" status="ready" detail={answerLabel(answers.unsteady)} />
            <StatusRow label="Worried about falling" status="ready" detail={answerLabel(answers.worried)} />
          </div>
          <div className="step-three-actions">
            <VoiceButton script={voiceScript} onReplay={replay} />
            <PrimaryActionBar
              primaryLabel="Confirm Answers"
              secondaryLabel="Make Changes"
              onPrimary={() => goTo('/display/session/safety')}
              onSecondary={() => goTo('/display/session/screening?q=1')}
            />
          </div>
          {lastReplay ? <span className="step-three-sr-status" role="status">{lastReplay}</span> : null}
        </main>
      </SessionShell>
    );
  }

  let question = 'Have you fallen in the past year?';
  let support = 'This is part of the CDC STEADI health check.';
  let options = [
    { label: 'Yes', path: routeWithParams('/display/session/screening', { q: 'fall-count', fallen: 'yes' }) },
    { label: 'No', path: routeWithParams('/display/session/screening', { q: '2', fallen: 'no', fallCount: null, injured: null }) },
  ];

  if (screen === 'fall-count') {
    question = 'How many times have you fallen?';
    support = 'Choose the answer that best matches the past year.';
    options = [
      { label: 'Once', path: routeWithParams('/display/session/screening', { q: 'fall-injury', fallCount: 'once' }) },
      { label: 'Two or more times', path: routeWithParams('/display/session/screening', { q: 'fall-injury', fallCount: 'twoPlus' }) },
    ];
  } else if (screen === 'fall-injury') {
    question = 'Were you injured in a fall?';
    support = 'Choose Yes if any fall caused pain, a cut, a bruise, or needed medical attention.';
    options = [
      { label: 'Yes', path: routeWithParams('/display/session/screening', { q: '2', injured: 'yes' }) },
      { label: 'No', path: routeWithParams('/display/session/screening', { q: '2', injured: 'no' }) },
    ];
  } else if (screen === '2') {
    question = 'Do you feel unsteady when standing or walking?';
    support = 'Think about normal standing, turning, and walking at home or outside.';
    options = [
      { label: 'Yes', path: routeWithParams('/display/session/screening', { q: '3', unsteady: 'yes' }) },
      { label: 'No', path: routeWithParams('/display/session/screening', { q: '3', unsteady: 'no' }) },
    ];
  } else if (screen === '3') {
    question = 'Are you worried about falling?';
    support = 'Choose the answer that feels most true today.';
    options = [
      { label: 'Yes', path: routeWithParams('/display/session/screening', { q: 'summary', worried: 'yes' }) },
      { label: 'No', path: routeWithParams('/display/session/screening', { q: 'summary', worried: 'no' }) },
    ];
  }

  return (
    <SessionShell
      eyebrow="Health check"
      title={`Health Check ${questionNumber} of 3`}
      description="Answer one question at a time. Your answers help prepare today's session."
      connection={<ConnectionIndicator status="connected" label="Health check in progress" detail="Answers can be changed before confirming" />}
      progress={<ScreeningProgress current={questionNumber} />}
    >
      <main className="step-three-screening">
        <section className="step-three-question-card" data-voice-script={voiceScript}>
          <StepIcon>i</StepIcon>
          <div>
            <h2>{question}</h2>
            <p>{support}</p>
          </div>
        </section>
        <div className="step-three-screening__controls">
          <VoiceButton script={voiceScript} onReplay={replay} />
          <div className="step-three-answer-buttons">
            {options.map((option) => (
              <button
                type="button"
                className="ds-button ds-button--primary step-three-answer-button"
                key={option.label}
                onClick={() => goTo(option.path)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo(previousPath)}>
            Previous Question
          </button>
        </div>
        {lastReplay ? <span className="step-three-sr-status" role="status">{lastReplay}</span> : null}
      </main>
    </SessionShell>
  );
}

const safetyItems = [
  { id: 'support', label: 'A stable support surface is within reach.' },
  { id: 'floor', label: 'The floor is clear and dry.' },
  { id: 'symptoms', label: 'I do not feel dizzy or have chest pain.' },
  { id: 'breathing', label: 'I am not experiencing severe pain or unusual shortness of breath.' },
  { id: 'chair', label: 'The chair is placed firmly against a wall.' },
];

const safetyGuideCards = [
  { id: 'counter', title: 'Stable table or countertop', text: 'Keep a firm support surface close enough to reach.' },
  { id: 'chair', title: 'Chair against a wall', text: 'Use a stable chair that cannot slide backward.' },
  { id: 'floor', title: 'Clear floor', text: 'Remove rugs, cords, bags, or anything that could catch your feet.' },
  { id: 'clothing', title: 'Safe clothing and footwear', text: 'Wear secure shoes and clothing that does not limit movement.' },
];

function initialSafetyChecks() {
  const checked = queryValue('checked', '');
  if (checked === 'all') return Object.fromEntries(safetyItems.map((item) => [item.id, true]));
  if (checked === 'partial') return { support: true, floor: true };
  return {};
}

export function DisplaySafetyScreen() {
  const [checked, setChecked] = useState(initialSafetyChecks);
  const [guideOpen, setGuideOpen] = useState(queryValue('guide', '') === '1');
  const allChecked = safetyItems.every((item) => checked[item.id]);
  const voiceScript = 'Check the support surface, chair, floor, clothing, and how you feel before starting.';

  return (
    <SessionShell
      eyebrow="Safety setup"
      title="Safety Setup"
      description="Prepare the room before the camera assessment starts."
      connection={<ConnectionIndicator status={allChecked ? 'connected' : 'waiting'} label={allChecked ? 'Safety ready' : 'Safety checks needed'} detail="Stop at any time if you feel unsafe" />}
      progress={<SessionProgress current={3} total={9} label="Session progress" />}
      className="step-three-safety-shell"
    >
      <main className="step-three-safety">
        <section className="step-three-setup-guide" aria-label="Room setup guide">
          {safetyGuideCards.map((card) => (
            <article className={`step-three-setup-card step-three-setup-card--${card.id}`} key={card.id}>
              <div className="step-three-setup-illustration" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h2>{card.title}</h2>
              <p>{card.text}</p>
            </article>
          ))}
        </section>
        <section
          className={`step-three-checklist ${guideOpen ? 'step-three-checklist--guide-open' : ''}`}
          data-voice-script={voiceScript}
        >
          <div>
            <h2>Confirm before continuing</h2>
            <p>Continue only when each required safety item is true today.</p>
          </div>
          <div className="step-three-checklist__items">
            {safetyItems.map((item) => (
              <label className="step-three-check-item" key={item.id}>
                <input
                  type="checkbox"
                  checked={Boolean(checked[item.id])}
                  onChange={(event) => setChecked((current) => ({ ...current, [item.id]: event.target.checked }))}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
          <div className="step-three-note">
            <StepIcon>i</StepIcon>
            <span>Your camera video is analyzed live and is not saved.</span>
          </div>
          <div className="step-three-actions">
            <PrimaryActionBar
              primaryLabel="I'm Ready"
              secondaryLabel="Show Setup Guide"
              tertiaryLabel="End Today's Session"
              primaryDisabled={!allChecked}
              onPrimary={() => goTo('/display/session/camera-setup')}
              onSecondary={() => setGuideOpen(true)}
              onTertiary={() => goTo('/display/session/complete')}
            />
          </div>
        </section>
      </main>
    </SessionShell>
  );
}

const setupInstructions = {
  balance: [
    'Place the phone about 2 meters away.',
    'Keep the camera at about hip height.',
    'Face the camera directly.',
    'Make sure your full body, including both feet, is visible.',
  ],
  chair: [
    'Place the phone about 2 meters away.',
    'Position the camera at a 45-degree front-side angle.',
    'Keep the camera at about hip height.',
    'Make sure the chair, your knees, and both feet are visible.',
    'Place the chair firmly against a wall.',
  ],
};

function setupMode() {
  const test = queryValue('test', 'balance');
  return test === 'chair' || test === 'chair_stand' ? 'chair' : 'balance';
}

function normalizeQualityMessage(quality) {
  if (quality === 'body') return 'Step back until your full body is visible.';
  if (quality === 'feet') return 'Lower the camera slightly so both feet are visible.';
  if (quality === 'angle') return 'Adjust the phone to match the guide.';
  if (quality === 'lighting') return 'Move to a brighter area.';
  if (quality === 'person') return 'Only one person should remain in the assessment area.';
  return 'Hold still while Steply checks the camera view.';
}

function cameraQualityScenario(dashboard, mode) {
  const urlQuality = queryValue('quality', '');
  const state = queryValue('state', '');
  if (state === 'lost') {
    return {
      ready: false,
      correction: 'The phone connection was lost. Reconnect before continuing.',
      rows: [
        { label: 'Phone Connected', status: 'lost' },
        { label: 'Full Body Visible', status: 'checking' },
        { label: 'Feet Visible', status: 'checking' },
        { label: 'Camera Angle', status: 'checking' },
        { label: 'Lighting', status: 'checking' },
        { label: 'Ready to Continue', status: 'adjust' },
      ],
    };
  }

  if (urlQuality) {
    const ready = urlQuality === 'ready';
    const checking = urlQuality === 'checking';
    const statusFor = (key) => {
      if (ready) return 'ready';
      if (checking) return 'checking';
      return key === urlQuality ? 'adjust' : 'ready';
    };
    return {
      ready,
      correction: ready ? 'Camera setup looks ready.' : normalizeQualityMessage(urlQuality),
      rows: [
        { label: 'Phone Connected', status: 'ready' },
        { label: 'Full Body Visible', status: statusFor('body') },
        { label: 'Feet Visible', status: statusFor('feet') },
        { label: 'Camera Angle', status: statusFor('angle') },
        { label: 'Lighting', status: statusFor('lighting') },
        { label: 'Ready to Continue', status: ready ? 'ready' : checking ? 'checking' : 'adjust' },
      ],
    };
  }

  const readiness = dashboard?.poseAnalysis?.cameraReadiness;
  const phoneConnected = Boolean(dashboard?.remoteCameraFrame?.src || dashboard?.session?.profile);
  const ready = Boolean(readiness?.isReady);
  return {
    ready,
    correction: ready ? 'Camera setup looks ready.' : readiness?.mainMessage || readiness?.message || 'Stand where your full body and both feet are visible.',
    rows: [
      { label: 'Phone Connected', status: phoneConnected ? 'ready' : 'checking' },
      { label: 'Full Body Visible', status: readiness?.fullBodyVisible ? 'ready' : phoneConnected ? 'checking' : 'checking' },
      { label: 'Feet Visible', status: readiness?.feetVisible ? 'ready' : phoneConnected ? 'checking' : 'checking' },
      { label: 'Camera Angle', status: mode === 'chair' && !ready ? 'checking' : readiness?.checks?.correctDirection === false ? 'adjust' : ready ? 'ready' : 'checking' },
      { label: 'Lighting', status: readiness?.brightnessOk ? 'ready' : phoneConnected ? 'checking' : 'checking' },
      { label: 'Ready to Continue', status: ready ? 'ready' : 'checking' },
    ],
  };
}

function FramingOverlay({ mode }) {
  return (
    <div className={`step-three-framing step-three-framing--${mode}`} aria-hidden="true">
      <span className="step-three-framing__head">Head</span>
      <span className="step-three-framing__safe-area">Safe movement area</span>
      <span className="step-three-framing__foot step-three-framing__foot--left">Foot</span>
      <span className="step-three-framing__foot step-three-framing__foot--right">Foot</span>
      {mode === 'chair' ? <span className="step-three-framing__chair">Chair</span> : null}
    </div>
  );
}

export function DisplayCameraSetupScreen({ dashboard }) {
  const mode = setupMode();
  const scenario = cameraQualityScenario(dashboard, mode);
  const title = mode === 'chair' ? 'Chair Stand Camera Setup' : 'Balance Test Camera Setup';
  const voiceScript = mode === 'chair'
    ? 'Place the phone about 2 meters away at a front-side angle. Keep the chair, knees, and both feet visible.'
    : 'Place the phone about 2 meters away at hip height. Face the camera and keep your full body visible.';

  return (
    <SessionShell
      eyebrow="Camera setup"
      title={title}
      description="Use the live view to adjust the phone before calibration."
      connection={<ConnectionIndicator status={queryValue('state') === 'lost' ? 'lost' : scenario.ready ? 'connected' : 'waiting'} label={scenario.ready ? 'Camera ready' : queryValue('state') === 'lost' ? 'Connection lost' : 'Camera check needed'} detail={scenario.correction} />}
      progress={<SessionProgress current={4} total={9} label="Session progress" />}
      className="step-three-camera-shell"
    >
      <main className="step-three-camera-setup">
        <section className="step-three-camera-stage">
          <div className="step-three-mode-switch" role="group" aria-label="Assessment setup mode">
            <button
              type="button"
              className={mode === 'balance' ? 'step-three-mode-switch__button step-three-mode-switch__button--active' : 'step-three-mode-switch__button'}
              onClick={() => goTo('/display/session/camera-setup?test=balance')}
            >
              Balance Test
            </button>
            <button
              type="button"
              className={mode === 'chair' ? 'step-three-mode-switch__button step-three-mode-switch__button--active' : 'step-three-mode-switch__button'}
              onClick={() => goTo('/display/session/camera-setup?test=chair')}
            >
              Chair Stand Test
            </button>
          </div>
          <CameraPreview frameSrc={dashboard?.remoteCameraFrame?.src} label={`${title} preview`} guide="Keep your body inside the guide">
            <FramingOverlay mode={mode} />
          </CameraPreview>
          <div className="step-three-setup-instructions">
            {setupInstructions[mode].map((item) => (
              <div className="step-three-instruction-chip" key={item}>
                <StepIcon>i</StepIcon>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>
        <aside className="step-three-quality-panel">
          <h2>Camera quality</h2>
          <div className="step-three-quality-list">
            {scenario.rows.map((row) => <StatusRow key={row.label} {...row} />)}
          </div>
          <div className={scenario.ready ? 'step-three-correction step-three-correction--ready' : 'step-three-correction'}>
            <StepIcon tone={scenario.ready ? 'success' : 'warning'}>{scenario.ready ? 'OK' : 'i'}</StepIcon>
            <span>{scenario.correction}</span>
          </div>
          <div className="step-three-note">
            <StepIcon>i</StepIcon>
            <span>Your camera video is analyzed live and is not saved.</span>
          </div>
          <div className="step-three-actions">
            <VoiceButton script={voiceScript} onReplay={() => {}} />
            <PrimaryActionBar
              primaryLabel="Continue"
              secondaryLabel="Check Camera"
              primaryDisabled={!scenario.ready}
              onPrimary={() => goTo(`/display/session/calibration?test=${mode}`)}
              onSecondary={() => goTo(`/display/session/camera-setup?test=${mode}&quality=ready`)}
            />
          </div>
        </aside>
      </main>
    </SessionShell>
  );
}

function calibrationState() {
  const state = queryValue('state', '');
  const result = queryValue('result', '');
  const quality = queryValue('quality', 'ready');
  if (state === 'lost') {
    return {
      type: 'lost',
      title: 'Phone Connection Lost',
      message: 'The assessment has been paused.',
      canContinue: false,
    };
  }
  if (result === 'success') {
    return {
      type: 'success',
      title: 'Calibration Complete',
      message: 'The camera position is ready for the next step.',
      canContinue: true,
    };
  }
  if (result === 'failed' || quality !== 'ready') {
    const fail = queryValue('fail', quality);
    const message = fail === 'feet'
      ? 'Please keep both feet still.'
      : fail === 'lighting'
        ? 'The lighting changed during calibration.'
        : 'Your full body was not visible.';
    return {
      type: 'failed',
      title: 'Calibration needs another try',
      message,
      canContinue: false,
    };
  }
  return {
    type: 'checking',
    title: 'Checking position',
    message: 'Hold still while the countdown finishes.',
    canContinue: false,
  };
}

export function DisplayCalibrationScreen({ dashboard }) {
  const test = setupMode();
  const position = queryValue('position', test === 'chair' ? 'standing' : 'standing');
  const isSeated = test === 'chair' && position === 'seated';
  const state = calibrationState();
  const count = Math.min(3, Math.max(1, Number(queryValue('count', '3')) || 3));
  const title = isSeated ? 'Sit Still for a Moment' : 'Stand Still for a Moment';
  const instruction = isSeated
    ? 'Sit in the middle of the chair with both feet flat on the floor.'
    : 'Stand upright, face the camera, and keep both feet still.';
  const needsSeatedCalibration = test === 'chair' && !isSeated && queryValue('seated', '') === '1';
  const nextPath = needsSeatedCalibration
    ? '/display/session/calibration?test=chair&position=seated&count=3'
    : test === 'chair'
    ? '/display/assessment/chair/instruction'
    : '/display/assessment/balance/instruction';
  const voiceScript = `${instruction} Steply will count down from 3 while checking the camera view.`;

  return (
    <SessionShell
      eyebrow="Calibration"
      title={title}
      description={instruction}
      connection={<ConnectionIndicator status={state.type === 'lost' ? 'lost' : state.type === 'success' ? 'connected' : 'waiting'} label={state.title} detail={state.message} />}
      progress={<SessionProgress current={5} total={9} label="Session progress" />}
      className="step-three-calibration-shell"
    >
      <main className="step-three-calibration">
        <section className="step-three-calibration-stage">
          <CameraPreview frameSrc={dashboard?.remoteCameraFrame?.src} label="Calibration preview" guide={isSeated ? 'Keep the chair and both feet visible' : 'Keep your full body visible'}>
            <FramingOverlay mode={test === 'chair' ? 'chair' : 'balance'} />
          </CameraPreview>
          <div className="step-three-countdown" aria-label={`Countdown ${count}`}>
            <strong>{state.type === 'success' ? 'OK' : count}</strong>
            <div aria-hidden="true">
              {[3, 2, 1].map((number) => (
                <span className={number === count ? 'step-three-countdown__chip step-three-countdown__chip--active' : 'step-three-countdown__chip'} key={number}>
                  {number}
                </span>
              ))}
            </div>
          </div>
        </section>
        <aside className="step-three-calibration-panel">
          <h2>{state.title}</h2>
          <p>{state.message}</p>
          <div className="step-three-quality-list">
            <StatusRow label="Phone Connected" status={state.type === 'lost' ? 'lost' : 'ready'} />
            <StatusRow label="Camera quality" status={state.type === 'success' ? 'ready' : state.type === 'failed' ? 'adjust' : 'checking'} />
            <StatusRow label={isSeated ? 'Seated position' : 'Standing position'} status={state.type === 'success' ? 'ready' : state.type === 'failed' ? 'adjust' : 'checking'} />
          </div>
          {test === 'chair' ? (
            <div className="step-three-note">
              <StepIcon>i</StepIcon>
              <span>Chair Stand setup may include a seated check before the test begins.</span>
            </div>
          ) : null}
          <div className="step-three-note">
            <StepIcon>i</StepIcon>
            <span>Your camera video is analyzed live and is not saved.</span>
          </div>
          <div className="step-three-actions">
            <VoiceButton script={voiceScript} onReplay={() => {}} />
            {state.canContinue ? (
              <PrimaryActionBar
                primaryLabel="Continue"
                secondaryLabel="Check Camera Position"
                onPrimary={() => goTo(nextPath)}
                onSecondary={() => goTo(`/display/session/camera-setup?test=${test}`)}
              />
            ) : (
              <PrimaryActionBar
                primaryLabel={state.type === 'lost' ? 'Reconnect Phone' : 'Try Again'}
                secondaryLabel="Check Camera Position"
                onPrimary={() => goTo(`/display/session/calibration?test=${test}${isSeated ? '&position=seated' : ''}&count=3`)}
                onSecondary={() => goTo(`/display/session/camera-setup?test=${test}`)}
              />
            )}
          </div>
        </aside>
      </main>
    </SessionShell>
  );
}
