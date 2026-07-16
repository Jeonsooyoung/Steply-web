import { useEffect, useMemo, useState } from 'react';
import {
  AppHeader,
  CameraPreview,
  ConnectionIndicator,
  EmergencyStopButton,
  PrimaryActionBar,
  SessionProgress,
} from '../components/foundation/SteplyDesignSystem';
import { PoseOverlay } from '../components/pose/PoseOverlay';
import { useStableAssessmentCountdown } from '../hooks/useStableAssessmentCountdown.js';
import {
  ASSESSMENT_AUTO_START_COUNTDOWN_SECONDS,
  isStableAssessmentStartReady,
} from '../pipeline/ui/assessmentAutoStart.js';
import { UserScreenIds } from '../pipeline/ui/sessionFlow';
import { LiveCamera, useEnsureLocalCamera } from '../features/reference-ui/shared/LiveCamera';
import { PageShell } from '../features/reference-ui/shared/ReferenceShell';
import { CheckList, Metric, Panel, ProgressRing, ScreenHeading, SectionTitle } from '../features/reference-ui/shared/components';
import { SteplyIcon } from '../features/reference-ui/shared/icons';
import { navigateSpa } from './spaNavigation';

function goTo(path) {
  navigateSpa(path);
}

function useTimedBackGuard(active = true) {
  const [warningVisible, setWarningVisible] = useState(false);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;
    const state = { steplyActiveTimedAssessment: window.location.pathname };
    window.history.pushState(state, '', window.location.href);

    const handlePopState = () => {
      setWarningVisible(true);
      window.history.pushState(state, '', window.location.href);
      window.setTimeout(() => setWarningVisible(false), 3200);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [active]);

  return warningVisible;
}

function StepIcon({ children = 'i', tone = 'info' }) {
  return <span className={`step-five-icon step-five-icon--${tone}`} aria-hidden="true">{children}</span>;
}

function VoiceButton({ label = 'Hear Again', script, onReplay }) {
  return (
    <button
      type="button"
      className="ds-button ds-button--secondary step-five-voice-button"
      data-voice-script={script}
      aria-label={`${label}. ${script}`}
      onClick={onReplay}
    >
      {label}
    </button>
  );
}

function StatusRow({ label, status = 'checking', detail }) {
  const tone = status === 'ready' ? 'success' : status === 'adjust' ? 'warning' : status === 'lost' ? 'danger' : 'info';
  const value = status === 'ready' ? 'Ready' : status === 'adjust' ? 'Adjust Needed' : status === 'lost' ? 'Paused' : 'Checking';
  return (
    <div className={`step-five-status-row step-five-status-row--${tone}`}>
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
  connection,
  progress,
  children,
  className = '',
}) {
  return (
    <div className={`foundation-shell step-five-shell ${className}`}>
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

const preparationSteps = [
  'Sit in the middle of the chair',
  'Place both feet flat on the floor',
  'Cross your arms over your chest',
  'Stand all the way up',
  'Sit all the way down',
  'Repeat for 30 seconds',
];

const numberWords = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
  'Twenty',
  'Twenty-one',
  'Twenty-two',
  'Twenty-three',
  'Twenty-four',
  'Twenty-five',
  'Twenty-six',
  'Twenty-seven',
  'Twenty-eight',
  'Twenty-nine',
  'Thirty',
];

function boundedNumber(value, fallback = 0, min = 0, max = 999) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function wholeNumber(value, fallback = 0, min = 0, max = 999) {
  return Math.round(boundedNumber(value, fallback, min, max));
}

function repetitionLabel(count) {
  const repetitions = wholeNumber(count, 0, 0, 99);
  return `${repetitions} ${repetitions === 1 ? 'repetition' : 'repetitions'}`;
}

function numberWord(count) {
  const repetitions = wholeNumber(count, 0, 0, 99);
  return numberWords[repetitions] || String(repetitions);
}

function chairStateFromDashboard(dashboard) {
  const analysisState = dashboard?.poseAnalysis?.analysisState || {};
  const finalResult = dashboard?.finalResult || {};
  const chairStandResult = analysisState?.chairStandResult
    || finalResult?.chairStandResult
    || finalResult?.chairStand
    || finalResult;

  return {
    analysisState,
    chairStandResult,
  };
}

function hasCameraConnection(dashboard) {
  return Boolean(dashboard?.isCameraLinked);
}

function instructionReadiness(dashboard) {
  const seatedCalibrationReady = dashboard?.poseAnalysis?.calibrationStatus?.canStartAssessment === true;
  const cameraReady = isStableAssessmentStartReady({
    cameraReady: dashboard?.isCameraReady,
    cameraReadiness: dashboard?.poseAnalysis?.cameraReadiness,
    landmarkCount: dashboard?.poseAnalysis?.landmarks?.length
      || dashboard?.poseAnalysis?.analysisLandmarks?.length,
  });

  return {
    ready: cameraReady && seatedCalibrationReady,
    cameraReady,
    seatedCalibrationReady,
  };
}

function naturalMotionFromPhase(phase) {
  if (phase === 'rising') return 'stand_up';
  if (phase === 'standing') return 'stand_tall';
  if (phase === 'lowering') return 'sit_down';
  if (phase === 'seated') return 'ready';
  return 'ready';
}

function cameraPauseMessage(quality) {
  if (quality === 'feet') return 'Keep both feet in view.';
  if (quality === 'area') return 'Please return to the marked area.';
  if (quality === 'connection') return 'The camera connection was interrupted.';
  return 'Move back so your full body and chair are visible.';
}

function baseMovementScenario(key, reps, remaining) {
  if (key === 'stand_up') {
    return {
      key,
      reps,
      remaining,
      instruction: 'Stand all the way up',
      cue: 'Press through both feet and stand with control.',
      movementLabel: 'Stand up',
      banner: 'Stand all the way up before sitting down.',
      bannerTone: 'info',
      voice: `${reps > 0 ? `${numberWord(reps)}. ` : ''}Stand all the way up.`,
    };
  }

  if (key === 'stand_tall') {
    return {
      key,
      reps,
      remaining,
      instruction: 'Stand tall',
      cue: 'Reach a full standing position before sitting.',
      movementLabel: 'Stand tall',
      banner: 'Good. Stand tall, then sit down slowly.',
      bannerTone: 'success',
      voice: `${reps > 0 ? `${numberWord(reps)}. ` : ''}Stand tall.`,
    };
  }

  if (key === 'sit_down') {
    return {
      key,
      reps,
      remaining,
      instruction: 'Sit down slowly',
      cue: 'Sit all the way down before the next stand.',
      movementLabel: 'Sit down slowly',
      banner: 'Sit all the way down with control.',
      bannerTone: 'info',
      voice: `${reps > 0 ? `${numberWord(reps)}. ` : ''}Sit down slowly.`,
    };
  }

  return {
    key: 'ready',
    reps,
    remaining,
    instruction: 'Ready',
    cue: 'Start seated with both feet flat and arms crossed.',
    movementLabel: 'Ready',
    banner: 'Begin when the timer starts.',
    bannerTone: 'info',
    voice: 'Start seated with both feet flat and arms crossed.',
  };
}

function chairLiveScenario(dashboard) {
  const { analysisState, chairStandResult } = chairStateFromDashboard(dashboard);
  const durationSeconds = wholeNumber(
    analysisState?.durationSeconds ?? chairStandResult?.durationSeconds ?? 30,
    30,
    1,
    60,
  );
  const reps = wholeNumber(
    analysisState?.repetitionCount ?? analysisState?.primaryValue ?? chairStandResult?.repetitionCount ?? 0,
    0,
    0,
    99,
  );
  const elapsed = wholeNumber(analysisState?.elapsedSeconds ?? 0, 0, 0, durationSeconds);
  const remaining = wholeNumber(Math.max(0, durationSeconds - elapsed), durationSeconds, 0, durationSeconds);

  if (dashboard?.poseAnalysis?.calibrationStatus?.state === 'INVALID') {
    return {
      key: 'calibration_failed',
      reps,
      remaining,
      instruction: 'Check the camera position first',
      cue: 'Seated calibration is required before this test.',
      movementLabel: 'Not ready',
      banner: 'Check the camera position and seated calibration before starting.',
      bannerTone: 'warning',
      timerPaused: true,
      voice: 'Check the camera position and seated calibration before starting.',
      primaryLabel: 'Check Camera Position',
      primaryPath: '/display/session/camera-setup?mode=chair',
    };
  }

  if (analysisState?.isArmUseSuspected && !analysisState?.armUseDisqualified) {
    return {
      key: 'arm_first',
      reps,
      remaining,
      instruction: 'Keep your arms crossed over your chest.',
      cue: 'You may restart the test once.',
      movementLabel: 'Paused',
      banner: 'Keep your arms crossed over your chest.',
      bannerTone: 'warning',
      timerPaused: true,
      armFirst: true,
      voice: 'Keep your arms crossed over your chest. You may restart the test once.',
    };
  }

  if (analysisState?.armUseDisqualified || chairStandResult?.armUseDisqualified) {
    return {
      key: 'arm_second',
      reps,
      remaining: 0,
      instruction: 'Your hands were used to help you stand.',
      cue: 'For safety, this test has ended.',
      movementLabel: 'Test ended',
      banner: 'For safety, this test has ended.',
      bannerTone: 'warning',
      timerPaused: true,
      armSecond: true,
      voice: 'Your hands were used to help you stand. For safety, this test has ended.',
    };
  }

  if (String(dashboard?.activeCameraStatus || '').toLowerCase().includes('closed')) {
    return {
      key: 'lost',
      reps,
      remaining,
      instruction: 'Phone Connection Lost',
      cue: 'The assessment has been paused.',
      movementLabel: 'Paused',
      banner: 'Phone Connection Lost. The assessment has been paused.',
      bannerTone: 'danger',
      timerPaused: true,
      voice: 'Phone Connection Lost. The assessment has been paused.',
    };
  }

  if (analysisState?.isFullBodyVisible === false) {
    const message = cameraPauseMessage('body');
    return {
      key: 'camera',
      reps,
      remaining,
      instruction: message,
      cue: 'The timer is paused until tracking is clear.',
      movementLabel: 'Paused',
      banner: message,
      bannerTone: 'warning',
      timerPaused: true,
      voice: `${message} The timer is paused.`,
    };
  }

  if (chairStandResult?.incompleteStandAttemptDetected) {
    return {
      key: 'incomplete_stand',
      reps,
      remaining,
      instruction: 'Stand all the way up',
      cue: 'This movement is not counted yet.',
      movementLabel: 'Stand up',
      banner: 'Stand all the way up before sitting down.',
      bannerTone: 'warning',
      voice: 'Stand all the way up before sitting down.',
    };
  }

  if (Number(chairStandResult?.halfStandCredit) > 0) {
    return {
      key: 'half_rep',
      reps,
      remaining: 0,
      instruction: 'Final stand saved',
      cue: 'The saved test rule counted the final partial stand.',
      movementLabel: 'Test complete',
      banner: 'The final stand was saved.',
      bannerTone: 'success',
      voice: 'The final partial stand has been saved.',
    };
  }

  if (analysisState?.phase === 'completed' || chairStandResult?.status === 'completed') {
    return {
      key: 'complete',
      reps,
      remaining: 0,
      instruction: 'Test complete',
      cue: `You completed ${reps} valid ${reps === 1 ? 'stand' : 'stands'}.`,
      movementLabel: 'Test complete',
      banner: `You completed ${reps} valid ${reps === 1 ? 'stand' : 'stands'}.`,
      bannerTone: 'success',
      testComplete: true,
      voice: `Test complete. You completed ${reps} valid ${reps === 1 ? 'stand' : 'stands'}.`,
    };
  }

  const movementKey = naturalMotionFromPhase(analysisState?.phase);
  return baseMovementScenario(movementKey, reps, remaining);
}

function liveQualityRows(scenario, dashboard) {
  const connected = hasCameraConnection(dashboard);
  const sourceLabel = dashboard?.cameraInputMode === 'LOCAL_WEBCAM' ? 'Laptop Camera' : 'Phone Connected';

  if (scenario.key === 'lost') {
    return [
      { label: sourceLabel, status: 'lost', detail: 'Reconnect before continuing.' },
      { label: 'Full Body and Chair Visible', status: 'checking' },
      { label: 'Feet Visible', status: 'checking' },
      { label: 'Arms Crossed', status: 'checking' },
      { label: 'Ready to Continue', status: 'checking' },
    ];
  }

  if (scenario.key === 'camera') {
    const reasons = dashboard?.poseAnalysis?.qualityStatus?.reasons || [];
    const hasReason = (code) => reasons.some((reason) => reason?.code === code);
    return [
      { label: sourceLabel, status: connected ? 'ready' : 'checking' },
      { label: 'Full Body and Chair Visible', status: hasReason('BODY_OUT_OF_FRAME') ? 'adjust' : 'ready' },
      { label: 'Feet Visible', status: hasReason('FEET_NOT_VISIBLE') ? 'adjust' : 'ready' },
      { label: 'Marked Area', status: hasReason('BODY_OUT_OF_FRAME') ? 'adjust' : 'ready' },
      { label: 'Ready to Continue', status: 'adjust' },
    ];
  }

  if (scenario.key === 'arm_first' || scenario.key === 'arm_second') {
    return [
      { label: sourceLabel, status: connected ? 'ready' : 'checking' },
      { label: 'Full Body and Chair Visible', status: 'ready' },
      { label: 'Feet Visible', status: 'ready' },
      { label: 'Arms Crossed', status: 'adjust' },
      { label: 'Ready to Continue', status: 'adjust' },
    ];
  }

  if (scenario.key === 'calibration_failed') {
    return [
      { label: sourceLabel, status: connected ? 'ready' : 'checking' },
      { label: 'Full Body and Chair Visible', status: 'checking' },
      { label: 'Seated Calibration', status: 'adjust' },
      { label: 'Chair Against Wall', status: 'checking' },
      { label: 'Ready to Continue', status: 'adjust' },
    ];
  }

  return [
    { label: sourceLabel, status: connected ? 'ready' : 'checking' },
    { label: 'Full Body and Chair Visible', status: 'ready' },
    { label: 'Feet Visible', status: 'ready' },
    { label: 'Arms Crossed', status: 'ready' },
    { label: 'Ready to Continue', status: scenario.timerPaused ? 'checking' : 'ready' },
  ];
}

function ChairDemonstration({ compact = false }) {
  return (
    <div className={compact ? 'step-five-demo step-five-demo--compact' : 'step-five-demo'} aria-label="Chair stand movement demonstration" role="img">
      <span className="step-five-demo__wall" aria-hidden="true" />
      <span className="step-five-demo__chair" aria-hidden="true" />
      <span className="step-five-demo__person" aria-hidden="true" />
      <span className="step-five-demo__arms" aria-hidden="true" />
      <strong>Chair against wall</strong>
    </div>
  );
}

function ChairPreview({ dashboard, scenario }) {
  return (
    <section className="step-five-preview">
      <CameraPreview frameSrc={dashboard?.activeCameraFrame?.src} mediaStream={dashboard?.activeCameraStream} label="Chair Stand Test preview" guide="Keep your chair and full body inside the guide" onFrameLoaded={dashboard?.handleCameraFrameLoaded} onFrameError={dashboard?.handleCameraFrameError}>
        <PoseOverlay
          landmarks={dashboard?.poseAnalysis?.analysisLandmarks?.length
            ? dashboard.poseAnalysis.analysisLandmarks
            : dashboard?.poseAnalysis?.landmarks || []}
          frameSize={dashboard?.poseAnalysis?.frameSize}
          fit={dashboard?.cameraInputMode === 'LOCAL_WEBCAM' ? 'contain' : 'cover'}
        />
        <div className="step-five-chair-overlay" aria-hidden="true">
          <span className="step-five-chair-overlay__body">Body guide</span>
          <span className="step-five-chair-overlay__chair">Chair area</span>
          <span className="step-five-chair-overlay__feet">Feet</span>
          <span className="step-five-chair-overlay__safe">Safe movement area</span>
        </div>
      </CameraPreview>
      <div className="step-five-preview-status">
        <StatusRow label="Arm position" status={scenario.key === 'arm_first' || scenario.key === 'arm_second' ? 'adjust' : 'ready'} detail="Keep arms crossed over your chest." />
        <StatusRow label="Body visibility" status={scenario.key === 'camera' || scenario.key === 'lost' ? 'adjust' : 'ready'} detail="Chair, knees, and feet stay in view." />
      </div>
    </section>
  );
}

function ScenarioBanner({ scenario }) {
  return (
    <div className={`step-five-state-banner step-five-state-banner--${scenario.bannerTone}`} role="status">
      <StepIcon tone={scenario.bannerTone === 'success' ? 'success' : scenario.bannerTone === 'danger' ? 'danger' : scenario.bannerTone === 'warning' ? 'warning' : 'info'}>
        {scenario.bannerTone === 'success' ? 'OK' : scenario.bannerTone === 'danger' ? '!' : 'i'}
      </StepIcon>
      <span>{scenario.banner}</span>
    </div>
  );
}

function ChairStandAlert({ scenario, dashboard, dominant = false }) {
  const dominantClass = dominant ? ' step-five-alert--dominant' : '';

  if (scenario.safetyStop) {
    return (
      <section className={`step-five-alert step-five-alert--danger${dominantClass}`} aria-live="assertive">
        <StepIcon tone="danger">!</StepIcon>
        <h2>Please sit down safely.</h2>
        <p>Do not continue if you feel dizzy, have chest pain, or cannot catch your breath.</p>
        <p>Contact a healthcare professional if symptoms continue.</p>
        <div className="step-five-alert__actions">
          <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo('/display/error/safety-stop')}>
            Contact Caregiver
          </button>
          <button type="button" className="ds-button ds-button--primary" onClick={() => goTo('/display/session/complete?status=symptom')}>
            End Session
          </button>
        </div>
      </section>
    );
  }

  if (scenario.armFirst) {
    return (
      <section className={`step-five-alert step-five-alert--warning${dominantClass}`} aria-live="assertive">
        <StepIcon tone="warning">!</StepIcon>
        <h2>Keep your arms crossed over your chest.</h2>
        <p>You may restart the test once.</p>
        <div className="step-five-alert__actions">
          <button
            type="button"
            className="ds-button ds-button--primary"
            onClick={() => {
              dashboard?.poseAnalysis?.resetAnalysis?.('arm_use_retry');
              goTo('/display/assessment/chair/instruction');
            }}
          >
            Restart Test
          </button>
          <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo('/display/session/complete')}>
            End Test
          </button>
        </div>
      </section>
    );
  }

  if (scenario.armSecond) {
    return (
      <section className={`step-five-alert step-five-alert--warning${dominantClass}`} aria-live="assertive">
        <StepIcon tone="warning">!</StepIcon>
        <h2>Your hands were used to help you stand.</h2>
        <p>For safety, this test has ended.</p>
        <PrimaryActionBar
          primaryLabel="Continue to Results"
          onPrimary={() => goTo('/display/assessment/chair/result')}
        />
      </section>
    );
  }

  return null;
}

function ChairResultState(dashboard) {
  const { chairStandResult } = chairStateFromDashboard(dashboard);
  const reps = wholeNumber(
    chairStandResult?.repetitionCount ?? chairStandResult?.countedRepetitionCount ?? 0,
    0,
    0,
    99,
  );
  const halfCredit = Number(chairStandResult?.halfStandCredit ?? 0) > 0;
  const endedByHands = Boolean(chairStandResult?.armUseDisqualified);
  const endedEarly = Boolean(chairStandResult?.endedEarly);

  if (endedByHands) {
    return {
      title: 'Chair Stand Test Ended',
      status: 'For safety, this test has ended.',
      detail: 'Your hands were used to help you stand.',
      reps,
      tone: 'warning',
      voice: 'Your hands were used to help you stand. For safety, this test has ended.',
    };
  }

  if (endedEarly) {
    return {
      title: 'Chair Stand Test Ended',
      status: 'The test has ended.',
      detail: 'We saved the valid stands already counted.',
      reps,
      tone: 'warning',
      voice: 'The test has ended. We saved the valid stands already counted.',
    };
  }

  return {
    title: 'Test complete',
    status: `You completed ${reps} valid ${reps === 1 ? 'stand' : 'stands'}.`,
    detail: halfCredit ? 'The final stand was saved by the existing test rule.' : 'The valid repetition count has been saved.',
    reps,
    tone: 'success',
    voice: `Test complete. You completed ${reps} valid ${reps === 1 ? 'stand' : 'stands'}.`,
  };
}

export function DisplayChairInstructionScreen({ dashboard }) {
  const [lastReplay, setLastReplay] = useState('');
  const readiness = instructionReadiness(dashboard);
  const voiceScript = 'Sit in the middle of the chair with both feet flat on the floor. Cross your arms over your chest. Stand all the way up, then sit all the way down.';
  const autoStartSeconds = useStableAssessmentCountdown({
    ready: readiness.ready,
    onComplete: () => goTo('/display/assessment/chair/live'),
  });
  useEnsureLocalCamera(dashboard, !dashboard?.isPhoneProfileLinked);

  return (
    <PageShell active="Assessment" className="ref-balance-page ref-chair-page">
      <main className="ref-balance-test ref-chair-test" data-voice-script={voiceScript}>
        <div className="ref-balance-heading ref-chair-heading">
          <h1>30-Second Chair Stand Test</h1>
          <div className="ref-stage-track ref-chair-track">
            {['Prepare', '30-second test', 'Results'].map((label, index) => <div key={label} className={index === 0 ? 'active' : ''}><span>{index + 1}</span><small>{label}</small></div>)}
          </div>
        </div>
        <div className="ref-balance-grid ref-chair-grid">
          <LiveCamera dashboard={dashboard} className="ref-balance-camera ref-chair-camera" label="Chair stand starting-position camera" />
          <aside className="ref-balance-guidance ref-chair-guidance">
            <Panel><SectionTitle icon="clipboardList" tone="amber">Prepare for the test</SectionTitle><CheckList items={preparationSteps.slice(0, 4)} /></Panel>
            <Panel className="ref-balance-timer ref-chair-ready-timer">
              <SectionTitle icon="timer">Starting position</SectionTitle>
              <ProgressRing value={readiness.ready ? (autoStartSeconds ?? ASSESSMENT_AUTO_START_COUNTDOWN_SECONDS) : '—'} progress={readiness.ready ? ((ASSESSMENT_AUTO_START_COUNTDOWN_SECONDS - (autoStartSeconds ?? ASSESSMENT_AUTO_START_COUNTDOWN_SECONDS)) / ASSESSMENT_AUTO_START_COUNTDOWN_SECONDS) * 100 : 0} large />
              <p>{readiness.ready ? 'Hold still. The test will start automatically.' : 'Sit centered with both feet visible.'}</p>
            </Panel>
          </aside>
          <Panel className="ref-stage-status ref-chair-status">
            <SectionTitle icon="flag" tone="amber">Readiness status</SectionTitle>
            <p>Step 1 of 3</p><h2>{readiness.ready ? 'Ready to begin' : 'Starting position needed'}</h2><b>{readiness.ready ? 'Starting soon' : 'Checking'}</b>
            <ol>
              <li className={readiness.cameraReady ? 'complete' : 'active'}><span>1</span><p><strong>Full body and chair</strong><small>{readiness.cameraReady ? 'Visible' : 'Move into view'}</small></p></li>
              <li className={readiness.seatedCalibrationReady ? 'complete' : 'active'}><span>2</span><p><strong>Seated position</strong><small>{readiness.seatedCalibrationReady ? 'Calibrated' : 'Sit still with feet flat'}</small></p></li>
              <li><span>3</span><p><strong>Arms crossed</strong><small>Keep arms across your chest</small></p></li>
            </ol>
          </Panel>
        </div>
        <footer className="ref-balance-actions ref-chair-actions">
          <button type="button" onClick={() => goTo('/display/session/plan')}><SteplyIcon name="arrowLeft" />Back</button>
          <button type="button" onClick={() => setLastReplay(voiceScript)}><SteplyIcon name="help" />Hear instructions</button>
          <button type="button" className="solid" disabled={!readiness.ready}>{readiness.ready ? `Starting in ${autoStartSeconds ?? ASSESSMENT_AUTO_START_COUNTDOWN_SECONDS}…` : 'Waiting for starting position'}</button>
        </footer>
        {lastReplay ? <span className="step-five-sr-status" role="status">{lastReplay}</span> : null}
      </main>
    </PageShell>
  );
}

export function DisplayChairLiveScreen({ dashboard }) {
  const [lastReplay, setLastReplay] = useState('');
  const showBackWarning = useTimedBackGuard(true);
  const scenario = useMemo(() => chairLiveScenario(dashboard), [dashboard]);
  const qualityRows = useMemo(() => liveQualityRows(scenario, dashboard), [scenario, dashboard]);
  const hasDominantAlert = Boolean(scenario.armFirst || scenario.armSecond || scenario.safetyStop);
  const alert = <ChairStandAlert scenario={scenario} dashboard={dashboard} dominant={hasDominantAlert} />;
  useEnsureLocalCamera(dashboard, !dashboard?.isPhoneProfileLinked);

  useEffect(() => {
    dashboard?.setActiveStep?.(UserScreenIds.Assessment);
    if (dashboard?.selectedTest !== 'chair_stand') {
      dashboard?.handleSelectTest?.('chair_stand');
      return;
    }
    const analysis = dashboard?.poseAnalysis;
    const startReady = isStableAssessmentStartReady({
      cameraReady: dashboard?.isCameraReady,
      cameraReadiness: analysis?.cameraReadiness,
      landmarkCount: analysis?.analysisLandmarks?.length || analysis?.landmarks?.length || 0,
    });
    if (
      startReady
      && !analysis?.isRunning
      && ['IDLE', 'CANCELLED'].includes(analysis?.analysisSessionState)
    ) {
      analysis.startAnalysis?.();
    }
  }, [
    dashboard?.selectedTest,
    dashboard?.isCameraReady,
    dashboard?.poseAnalysis?.analysisSessionState,
    dashboard?.poseAnalysis?.calibrationStatus?.canStartAssessment,
    dashboard?.poseAnalysis?.cameraReadiness?.isReady,
    dashboard?.poseAnalysis?.cameraReadiness?.fullBodyVisible,
    dashboard?.poseAnalysis?.cameraReadiness?.checks?.fullBodyVisible,
    dashboard?.poseAnalysis?.landmarks?.length,
    dashboard?.poseAnalysis?.analysisLandmarks?.length,
  ]);

  useEffect(() => {
    const analysis = dashboard?.poseAnalysis;
    const result = analysis?.analysisResult;
    if (
      analysis?.analysisSessionState !== 'COMPLETED'
      || result?.status !== 'VALID'
      || result?.resultType !== 'FINAL_RESULT'
      || result?.testType !== 'chair_stand'
      || result?.analysisSessionId !== analysis?.analysisSessionId
    ) return;
    goTo('/display/assessment/chair/result');
  }, [dashboard?.poseAnalysis?.analysisResult, dashboard?.poseAnalysis?.analysisSessionState]);

  useEffect(() => {
    if (scenario.remaining !== 0) return;
    goTo('/display/assessment/chair/result');
  }, [scenario.remaining]);

  return (
    <PageShell active="Assessment" className="ref-balance-page ref-chair-page">
      <main className="ref-balance-test ref-chair-test" data-assessment-state={scenario.key} data-voice-script={scenario.voice}>
        <div className="ref-balance-heading ref-chair-heading"><h1>30-Second Chair Stand Test</h1><div className="ref-stage-track ref-chair-track">{['Prepare', '30-second test', 'Results'].map((label, index) => <div key={label} className={index <= 1 ? 'active' : ''}><span>{index + 1}</span><small>{label}</small></div>)}</div></div>
        {hasDominantAlert ? alert : null}
        <div className="ref-balance-grid ref-chair-grid">
          <LiveCamera dashboard={dashboard} className="ref-balance-camera ref-chair-camera" label="Live 30-second chair stand camera" />
          <aside className="ref-balance-guidance ref-chair-guidance" aria-live="polite">
            <Panel><SectionTitle icon="clipboardList" tone="amber">Current instruction</SectionTitle><h2 className="ref-chair-current-instruction">{scenario.instruction}</h2><CheckList items={[scenario.cue, 'Keep your arms crossed over your chest.', 'Stand fully, then sit fully before the next repetition.']} /></Panel>
            <Panel className="ref-balance-timer"><SectionTitle icon="timer">Time remaining</SectionTitle><ProgressRing value={scenario.remaining} progress={((30 - scenario.remaining) / 30) * 100} large /></Panel>
          </aside>
          <Panel className="ref-stage-status ref-chair-status">
            <SectionTitle icon="flag" tone="amber">Test status</SectionTitle><p>30-second test</p><h2>{scenario.movementLabel}</h2><b>{scenario.timerPaused ? 'Paused for safety' : scenario.testComplete ? 'Complete' : 'In progress'}</b>
            <div className="ref-chair-reps"><strong>{scenario.reps}</strong><span>{scenario.reps === 1 ? 'valid repetition' : 'valid repetitions'}</span></div>
            <ol className="ref-chair-quality-list">{qualityRows.slice(0, 4).map((row, index) => <li key={row.label} className={row.status === 'ready' ? 'complete' : row.status === 'adjust' || row.status === 'lost' ? 'active' : ''}><span>{index + 1}</span><p><strong>{row.label}</strong><small>{row.detail || (row.status === 'ready' ? 'Ready' : row.status === 'adjust' ? 'Adjust position' : row.status === 'lost' ? 'Connection lost' : 'Checking')}</small></p></li>)}</ol>
          </Panel>
        </div>
        {!hasDominantAlert ? alert : null}
        <footer className="ref-balance-actions ref-chair-actions">
          <button type="button" className="amber" onClick={() => goTo('/display/session/complete')}><SteplyIcon name="pause" />Stop test</button>
          <button type="button" onClick={() => setLastReplay(scenario.voice)}><SteplyIcon name="help" />Hear again</button>
          <button type="button" className="solid" disabled={!scenario.testComplete && scenario.key !== 'half_rep'} onClick={() => goTo('/display/assessment/chair/result')}>{scenario.testComplete || scenario.key === 'half_rep' ? 'View Results' : `${scenario.remaining} seconds remaining`}<SteplyIcon name="arrowRight" /></button>
        </footer>
        {showBackWarning ? <div className="foundation-back-warning" role="status">Use Hear Again or Stop Test during this timed assessment.</div> : null}
        {lastReplay ? <span className="step-five-sr-status" role="status">{lastReplay}</span> : null}
      </main>
    </PageShell>
  );
}

export function DisplayChairResultScreen({ dashboard }) {
  const result = ChairResultState(dashboard);
  const { chairStandResult } = chairStateFromDashboard(dashboard);
  const armUseCount = wholeNumber(chairStandResult?.armUse?.occurrenceCount ?? chairStandResult?.armUseOccurrenceCount ?? 0, 0, 0, 2);
  const completed = result.tone === 'success';
  const safetyLabel = armUseCount === 0 ? 'No arm support' : armUseCount === 1 ? 'Restart used' : 'Review needed';
  const observations = [
    `${result.reps} valid ${result.reps === 1 ? 'repetition was' : 'repetitions were'} recorded.`,
    completed ? 'The 30-second test was completed.' : result.status,
    armUseCount === 0 ? 'No hand support was detected during the saved attempt.' : armUseCount === 1 ? 'One arm-use event was recorded and the permitted restart was used.' : 'Hand support was detected more than once, so the result needs review.',
    Number(chairStandResult?.halfStandCredit ?? 0) > 0 ? 'The final partial stand was credited under the test rule.' : 'Only completed stand-and-sit cycles were counted.',
  ];

  return (
    <PageShell active="Assessment" className="ref-posture-page ref-chair-result-page">
      <main className="ref-page ref-posture ref-chair-result" data-voice-script={result.voice}>
        <ScreenHeading title="Chair Stand Test Results" subtitle="Here’s a summary of your 30-second lower-body strength assessment." />
        <section className="ref-posture-metrics">
          <Metric icon="accessibility" label="Valid Chair Stands" value={`${result.reps} reps`} note="Completed stand-and-sit cycles" tone="amber" />
          <Metric icon="timer" label="Test Duration" value="30 sec" note="CDC STEADI Chair Stand Test" />
          <Metric icon="shieldCheck" label="Test Status" value={completed ? 'Complete' : 'Review'} note={result.detail} />
          <Metric icon="personStanding" label="Arm Support" value={safetyLabel} note={armUseCount === 0 ? 'Arms remained crossed' : `${armUseCount} arm-use event${armUseCount === 1 ? '' : 's'} detected`} tone={armUseCount === 0 ? 'green' : 'amber'} />
        </section>
        <section className="ref-posture-grid">
          <Panel className="ref-alignment ref-chair-result-details">
            <SectionTitle>Assessment details</SectionTitle>
            <dl>
              <div><dt>Assessment</dt><dd>30-Second Chair Stand</dd></div>
              <div><dt>Valid repetitions</dt><dd>{result.reps}</dd></div>
              <div><dt>Duration</dt><dd>30 seconds</dd></div>
              <div><dt>Arm-use events</dt><dd className={armUseCount > 0 ? 'amber' : ''}>{armUseCount}</dd></div>
              <div><dt>Result</dt><dd className={!completed ? 'amber' : ''}>{completed ? 'Saved' : 'Needs review'}</dd></div>
            </dl>
            <div className="ref-alignment-note"><SteplyIcon name={completed ? 'shieldCheck' : 'shieldAlert'} size={30} /><span>{result.status}<br />{result.detail}</span></div>
          </Panel>
          <aside className="ref-posture-aside">
            <Panel><SectionTitle icon="eye">What we observed</SectionTitle><CheckList items={observations} /></Panel>
            <Panel>
              <SectionTitle icon="target" tone="amber">Recommended focus areas</SectionTitle>
              <button type="button" onClick={() => goTo('/display/exercises/plan')}><span><SteplyIcon name="accessibility" /></span><b>Lower-body strength<small>Practice controlled sit-to-stand movements.</small></b><i><SteplyIcon name="arrowRight" size={19} /></i></button>
              <button type="button" onClick={() => goTo('/display/exercises/plan')}><span><SteplyIcon name="scale" /></span><b>Movement control<small>Build steady transitions between sitting and standing.</small></b><i><SteplyIcon name="arrowRight" size={19} /></i></button>
            </Panel>
          </aside>
        </section>
        <footer className="ref-posture-actions">
          <div className="ref-posture-actions__secondary">
            <button type="button" onClick={() => window.print()}><SteplyIcon name="download" size={18} />Download Report</button>
            <button type="button" onClick={() => goTo('/display/session/plan')}>Back to Assessment</button>
          </div>
          <button type="button" className="ref-posture-recommendation" onClick={() => goTo('/display/results/summary')}>
            <span><SteplyIcon name="scan" size={19} /></span><b>View Full Assessment Results<small>Review balance, strength, and recommended next steps</small></b><i><SteplyIcon name="arrowRight" size={23} /></i>
          </button>
        </footer>
      </main>
    </PageShell>
  );
}
