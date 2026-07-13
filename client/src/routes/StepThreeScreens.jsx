import { useEffect, useMemo, useState } from 'react';
import { PoseOverlay } from '../components/pose/PoseOverlay';
import { useStableAssessmentCountdown } from '../hooks/useStableAssessmentCountdown.js';
import {
  ASSESSMENT_AUTO_START_COUNTDOWN_SECONDS,
  isStableAssessmentStartReady,
} from '../pipeline/ui/assessmentAutoStart.js';
import { navigateSpa } from './spaNavigation';
import {
  AppHeader,
  CameraPreview,
  ConnectionIndicator,
  EmergencyStopButton,
  PrimaryActionBar,
  SessionProgress,
} from '../components/foundation/SteplyDesignSystem';

function goTo(path) {
  navigateSpa(path);
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

function screeningAnswers(dashboard) {
  const screening = dashboard?.assessmentSession?.screening || {};
  const responses = screening.responses || {};
  const fallHistory = screening.fallHistory || {};
  return {
    fallen: typeof responses.fallenPastYear === 'boolean' ? (responses.fallenPastYear ? 'yes' : 'no') : '',
    fallCount: fallHistory.count || '',
    injured: typeof fallHistory.injuriousFall === 'boolean' ? (fallHistory.injuriousFall ? 'yes' : 'no') : '',
    unsteady: typeof responses.feelsUnsteady === 'boolean' ? (responses.feelsUnsteady ? 'yes' : 'no') : '',
    worried: typeof responses.worriedAboutFalling === 'boolean' ? (responses.worriedAboutFalling ? 'yes' : 'no') : '',
    status: screening.status || 'NOT_STARTED',
  };
}

function firstIncompleteScreen(answers) {
  if (!answers.fallen) return '1';
  if (answers.fallen === 'yes' && !answers.fallCount) return 'fall-count';
  if (answers.fallen === 'yes' && !answers.injured) return 'fall-injury';
  if (!answers.unsteady) return '2';
  if (!answers.worried) return '3';
  return 'summary';
}

function canonicalScreening(answers, status = 'IN_PROGRESS') {
  return {
    status,
    responses: {
      fallenPastYear: answers.fallen ? answers.fallen === 'yes' : null,
      feelsUnsteady: answers.unsteady ? answers.unsteady === 'yes' : null,
      worriedAboutFalling: answers.worried ? answers.worried === 'yes' : null,
    },
    fallHistory: {
      count: answers.fallCount || null,
      injuriousFall: answers.injured ? answers.injured === 'yes' : null,
    },
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

export function DisplayScreeningScreen({ dashboard }) {
  const persistedAnswers = screeningAnswers(dashboard);
  const [screen, setScreen] = useState(() => firstIncompleteScreen(persistedAnswers));
  const [answers, setAnswers] = useState(persistedAnswers);
  const [saveError, setSaveError] = useState('');
  const [lastReplay, setLastReplay] = useState('');
  const isSummary = screen === 'summary';
  const questionNumber = screen === '2' ? 2 : screen === '3' ? 3 : 1;
  const voiceScript = screeningVoiceScripts[screen] || screeningVoiceScripts[1];

  const previousScreen = useMemo(() => {
    if (screen === 'fall-count') return '1';
    if (screen === 'fall-injury') return 'fall-count';
    if (screen === '2') {
      return answers.fallen === 'yes'
        ? 'fall-injury'
        : '1';
    }
    if (screen === '3') return '2';
    if (screen === 'summary') return '3';
    return null;
  }, [answers.fallen, screen]);

  useEffect(() => {
    const next = screeningAnswers(dashboard);
    setAnswers(next);
    if (next.status === 'COMPLETED') setScreen('summary');
  }, [dashboard?.assessmentSession?.revision]);

  const saveAnswers = async (nextAnswers, nextScreen, status = 'IN_PROGRESS') => {
    setSaveError('');
    try {
      await dashboard?.handleUpdateScreening?.(canonicalScreening(nextAnswers, status));
      setAnswers(nextAnswers);
      if (nextScreen) setScreen(nextScreen);
      return true;
    } catch (error) {
      setSaveError(error.message || 'Could not save the health check answer. Please try again.');
      return false;
    }
  };

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
                <StatusRow label="Number of falls" status="ready" detail={answerLabel(answers.fallCount, { ZERO: 'Zero', ONE: 'Once', TWO_OR_MORE: 'Two or more times' })} />
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
              onPrimary={async () => {
                const saved = await saveAnswers(answers, null, 'COMPLETED');
                if (saved) goTo('/display/session/safety');
              }}
              onSecondary={() => setScreen('1')}
            />
          </div>
          {saveError ? <p className="step-three-disabled-note" role="alert">{saveError}</p> : null}
          {lastReplay ? <span className="step-three-sr-status" role="status">{lastReplay}</span> : null}
        </main>
      </SessionShell>
    );
  }

  let question = 'Have you fallen in the past year?';
  let support = 'This is part of the CDC STEADI health check.';
  let options = [
    { label: 'Yes', patch: { fallen: 'yes', fallCount: '', injured: '' }, next: 'fall-count' },
    { label: 'No', patch: { fallen: 'no', fallCount: 'ZERO', injured: 'no' }, next: '2' },
  ];

  if (screen === 'fall-count') {
    question = 'How many times have you fallen?';
    support = 'Choose the answer that best matches the past year.';
    options = [
      { label: 'Zero', patch: { fallCount: 'ZERO' }, next: 'fall-injury' },
      { label: 'Once', patch: { fallCount: 'ONE' }, next: 'fall-injury' },
      { label: 'Two or more times', patch: { fallCount: 'TWO_OR_MORE' }, next: 'fall-injury' },
    ];
  } else if (screen === 'fall-injury') {
    question = 'Were you injured in a fall?';
    support = 'Choose Yes if any fall caused pain, a cut, a bruise, or needed medical attention.';
    options = [
      { label: 'Yes', patch: { injured: 'yes' }, next: '2' },
      { label: 'No', patch: { injured: 'no' }, next: '2' },
    ];
  } else if (screen === '2') {
    question = 'Do you feel unsteady when standing or walking?';
    support = 'Think about normal standing, turning, and walking at home or outside.';
    options = [
      { label: 'Yes', patch: { unsteady: 'yes' }, next: '3' },
      { label: 'No', patch: { unsteady: 'no' }, next: '3' },
    ];
  } else if (screen === '3') {
    question = 'Are you worried about falling?';
    support = 'Choose the answer that feels most true today.';
    options = [
      { label: 'Yes', patch: { worried: 'yes' }, next: 'summary' },
      { label: 'No', patch: { worried: 'no' }, next: 'summary' },
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
                onClick={() => saveAnswers({ ...answers, ...option.patch }, option.next)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ds-button ds-button--secondary"
            onClick={() => previousScreen ? setScreen(previousScreen) : goTo('/display/session/plan')}
          >
            Previous Question
          </button>
        </div>
        {saveError ? <p className="step-three-disabled-note" role="alert">{saveError}</p> : null}
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
  return {};
}

export function DisplaySafetyScreen() {
  const [checked, setChecked] = useState(initialSafetyChecks);
  const [guideOpen, setGuideOpen] = useState(false);
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
    'Place the selected camera about 2 meters away.',
    'Keep the camera at about hip height.',
    'Face the camera directly.',
    'Make sure your full body, including both feet, is visible.',
  ],
  chair: [
    'Place the selected camera about 2 meters away.',
    'Position the camera at a 45-degree front-side angle.',
    'Keep the camera at about hip height.',
    'Stand upright and hold still for the standing calibration.',
    'Make sure the chair, your knees, and both feet are visible.',
    'Place the chair firmly against a wall.',
  ],
};

function setupMode(dashboard) {
  const test = dashboard?.selectedTest
    || (dashboard?.assessmentCompletion?.balanceCompleted ? 'chair_stand' : 'four_stage_balance');
  return test === 'chair' || test === 'chair_stand' ? 'chair' : 'balance';
}

function cameraQualityScenario(dashboard, mode) {
  const connectionStatus = String(dashboard?.activeCameraStatus || '').toLowerCase();
  const cameraLabel = dashboard?.cameraInputMode === 'LOCAL_WEBCAM' ? 'Laptop Camera' : 'Phone Connected';
  if (connectionStatus.includes('lost') || connectionStatus.includes('disconnect')) {
    return {
      ready: false,
      correction: 'The camera connection was lost. Reconnect before continuing.',
      rows: [
        { label: cameraLabel, status: 'lost' },
        { label: 'Full Body Visible', status: 'checking' },
        { label: 'Feet Visible', status: 'checking' },
        { label: 'Camera Angle', status: 'checking' },
        { label: 'Lighting', status: 'checking' },
        { label: 'Ready to Continue', status: 'adjust' },
      ],
    };
  }

  const readiness = dashboard?.poseAnalysis?.cameraReadiness;
  const cameraConnected = Boolean(dashboard?.isCameraLinked);
  const fullBodyVisible = Boolean(readiness?.fullBodyVisible || readiness?.checks?.fullBodyVisible);
  const landmarkCount = dashboard?.poseAnalysis?.landmarks?.length || 0;
  const ready = isStableAssessmentStartReady({
    cameraReady: dashboard?.isCameraReady,
    cameraReadiness: readiness,
    landmarkCount,
  });
  return {
    ready,
    correction: ready ? 'Camera setup looks ready.' : readiness?.mainMessage || readiness?.message || 'Stand where your full body and both feet are visible.',
    rows: [
      { label: cameraLabel, status: cameraConnected ? 'ready' : 'checking' },
      { label: 'Full Body Visible', status: fullBodyVisible ? 'ready' : cameraConnected ? 'checking' : 'checking' },
      { label: 'Feet Visible', status: readiness?.feetVisible ? 'ready' : cameraConnected ? 'checking' : 'checking' },
      { label: 'Camera Angle', status: mode === 'chair' && !ready ? 'checking' : readiness?.checks?.correctDirection === false ? 'adjust' : ready ? 'ready' : 'checking' },
      { label: 'Lighting', status: readiness?.brightnessOk ? 'ready' : cameraConnected ? 'checking' : 'checking' },
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
  const mode = setupMode(dashboard);
  const scenario = cameraQualityScenario(dashboard, mode);
  const nextTestPath = mode === 'chair'
    ? '/display/assessment/chair/instruction'
    : '/display/assessment/balance/live';
  const title = mode === 'chair' ? 'Chair Stand Camera Setup' : 'Balance Test Camera Setup';
  const cameraName = dashboard?.cameraInputMode === 'LOCAL_WEBCAM' ? 'laptop' : 'phone';
  const voiceScript = mode === 'chair'
    ? `Place the ${cameraName} camera about 2 meters away at a front-side angle. Stand upright and hold still. Keep the chair, knees, and both feet visible.`
    : `Place the ${cameraName} camera about 2 meters away at hip height. Face the camera and keep your full body visible.`;
  const calibrationStatus = dashboard?.poseAnalysis?.calibrationStatus;
  const calibrationGateReady = mode === 'chair'
    ? calibrationStatus?.progress?.standingStable === true
    : calibrationStatus?.canStartAssessment === true;

  const autoContinueSeconds = useStableAssessmentCountdown({
    ready: scenario.ready,
    completionReady: scenario.ready && calibrationGateReady,
    onComplete: () => goTo(nextTestPath),
  });

  return (
    <SessionShell
      eyebrow="Camera setup"
      title={title}
      description="Keep your full body visible. The selected test starts automatically after the countdown."
      connection={<ConnectionIndicator status={scenario.rows[0]?.status === 'lost' ? 'lost' : scenario.ready ? 'connected' : 'waiting'} label={scenario.ready ? 'Camera ready' : scenario.rows[0]?.status === 'lost' ? 'Connection lost' : 'Camera check needed'} detail={scenario.correction} />}
      progress={<SessionProgress current={4} total={9} label="Session progress" />}
      className="step-three-camera-shell"
    >
      <main className="step-three-camera-setup">
        <section className="step-three-camera-stage">
          <div className="step-three-mode-switch" role="group" aria-label="Assessment setup mode">
            <button
              type="button"
              className={mode === 'balance' ? 'step-three-mode-switch__button step-three-mode-switch__button--active' : 'step-three-mode-switch__button'}
              onClick={() => dashboard?.handleSelectTest?.('four_stage_balance')}
            >
              Balance Test
            </button>
            <button
              type="button"
              className={mode === 'chair' ? 'step-three-mode-switch__button step-three-mode-switch__button--active' : 'step-three-mode-switch__button'}
              onClick={() => dashboard?.handleSelectTest?.('chair_stand')}
            >
              Chair Stand Test
            </button>
          </div>
          <CameraPreview frameSrc={dashboard?.activeCameraFrame?.src} mediaStream={dashboard?.activeCameraStream} label={`${title} preview`} guide="Keep your body inside the guide" onFrameLoaded={dashboard?.handleCameraFrameLoaded} onFrameError={dashboard?.handleCameraFrameError}>
            <PoseOverlay
              landmarks={dashboard?.poseAnalysis?.landmarks || []}
              rawLandmarks={dashboard?.poseAnalysis?.rawLandmarks || []}
              frameSize={dashboard?.poseAnalysis?.frameSize}
              fit={dashboard?.cameraInputMode === 'LOCAL_WEBCAM' ? 'contain' : 'cover'}
            />
            <FramingOverlay mode={mode} />
            {autoContinueSeconds !== null ? (
              <div className="step-three-auto-start-countdown" role="timer" aria-live="assertive" aria-label={`Test starts in ${autoContinueSeconds} seconds`}>
                <strong>{autoContinueSeconds || 'GO'}</strong>
                <span>Starting test</span>
              </div>
            ) : null}
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
            <span>{autoContinueSeconds ? `${scenario.correction} Continuing in ${autoContinueSeconds}...` : scenario.correction}</span>
          </div>
          <div className="step-three-note">
            <StepIcon>i</StepIcon>
            <span>Your camera video is analyzed live and is not saved.</span>
          </div>
          <div className="step-three-actions">
            <VoiceButton script={voiceScript} onReplay={() => {}} />
            <PrimaryActionBar
              primaryLabel={scenario.ready
                ? `Starting in ${autoContinueSeconds ?? ASSESSMENT_AUTO_START_COUNTDOWN_SECONDS}...`
                : 'Waiting for stable standing'}
              secondaryLabel="Check Camera"
              primaryDisabled
              onPrimary={() => {}}
              onSecondary={() => goTo('/display/session/camera-setup')}
            />
          </div>
        </aside>
      </main>
    </SessionShell>
  );
}

function calibrationState(dashboard) {
  const connectionStatus = String(dashboard?.activeCameraStatus || '').toLowerCase();
  if (connectionStatus.includes('lost') || connectionStatus.includes('disconnect')) {
    return {
      type: 'lost',
      title: 'Camera Connection Lost',
      message: 'The assessment has been paused.',
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
  const test = setupMode(dashboard);
  const isSeated = false;
  const fallbackState = calibrationState(dashboard);
  const poseAnalysis = dashboard?.poseAnalysis;
  const hasPose = (poseAnalysis?.landmarks?.length || 0) > 0;
  const fullBodyVisible = Boolean(
    poseAnalysis?.cameraReadiness?.fullBodyVisible
    || poseAnalysis?.cameraReadiness?.checks?.fullBodyVisible
  );
  const liveReady = test === 'balance'
    ? Boolean(hasPose && fullBodyVisible)
    : Boolean(hasPose && poseAnalysis?.cameraReadiness?.isReady);
  const [count, setCount] = useState(3);
  const title = isSeated ? 'Sit Still for a Moment' : 'Stand Still for a Moment';
  const instruction = isSeated
    ? 'Sit in the middle of the chair with both feet flat on the floor.'
    : 'Stand upright, face the camera, and keep both feet still.';
  const nextPath = test === 'chair'
    ? '/display/assessment/chair/instruction'
    : '/display/assessment/balance/instruction';
  const voiceScript = `${instruction} Steply will count down from 3 while checking the camera view.`;

  useEffect(() => {
    if (!liveReady) {
      setCount(3);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setCount((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [liveReady]);

  useEffect(() => {
    if (!liveReady || count > 0) return;
    const timer = window.setTimeout(() => goTo(nextPath), 350);
    return () => window.clearTimeout(timer);
  }, [count, liveReady, nextPath]);

  const state = liveReady && count === 0
    ? { type: 'success', title: 'Calibration Complete', message: 'Starting the challenge now.', canContinue: true }
    : hasPose
      ? {
        type: liveReady ? 'checking' : 'failed',
        title: liveReady ? 'Checking position' : 'Adjust your position',
        message: liveReady
          ? `Hold still for ${count} more second${count === 1 ? '' : 's'}.`
          : poseAnalysis?.cameraReadiness?.mainMessage || poseAnalysis?.cameraReadiness?.warnings?.[0] || 'Keep your full body visible and stand still.',
        canContinue: false,
      }
      : fallbackState;

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
          <CameraPreview frameSrc={dashboard?.activeCameraFrame?.src} mediaStream={dashboard?.activeCameraStream} label="Calibration preview" guide={isSeated ? 'Keep the chair and both feet visible' : 'Keep your full body visible'} onFrameLoaded={dashboard?.handleCameraFrameLoaded} onFrameError={dashboard?.handleCameraFrameError}>
            <PoseOverlay
              landmarks={poseAnalysis?.landmarks || []}
              rawLandmarks={poseAnalysis?.rawLandmarks || []}
              frameSize={poseAnalysis?.frameSize}
              fit={dashboard?.cameraInputMode === 'LOCAL_WEBCAM' ? 'contain' : 'cover'}
            />
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
            <StatusRow label={dashboard?.cameraInputMode === 'LOCAL_WEBCAM' ? 'Laptop Camera' : 'Phone Connected'} status={state.type === 'lost' ? 'lost' : 'ready'} />
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
                onSecondary={() => goTo('/display/session/camera-setup')}
              />
            ) : (
              <PrimaryActionBar
                primaryLabel={state.type === 'lost' ? 'Reconnect Camera' : 'Try Again'}
                secondaryLabel="Check Camera Position"
                onPrimary={() => goTo('/display/session/calibration')}
                onSecondary={() => goTo('/display/session/camera-setup')}
              />
            )}
          </div>
        </aside>
      </main>
    </SessionShell>
  );
}
