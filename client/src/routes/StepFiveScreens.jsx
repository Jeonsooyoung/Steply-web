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

  return (
    <SessionShell
      eyebrow="CDC STEADI"
      title="30-Second Chair Stand Test"
      description="Stand up and sit down with control for 30 seconds."
      connection={<ConnectionIndicator status={readiness.ready ? 'connected' : 'waiting'} label={readiness.ready ? 'Starting position ready' : 'Starting position needed'} detail={readiness.ready ? `Test starts automatically in ${autoStartSeconds ?? ASSESSMENT_AUTO_START_COUNTDOWN_SECONDS} seconds.` : 'Sit centered with both feet visible and hold still.'} />}
      progress={<SessionProgress current={8} total={9} label="Session progress" />}
      className="step-five-instruction-shell"
    >
      <main className="step-five-instruction" data-voice-script={voiceScript}>
        <section className="step-five-prep-grid">
          <ChairDemonstration />
          <div className="step-five-prep-panel">
            <h2>Prepare for the test</h2>
            <div className="step-five-prep-sequence" aria-label="Chair Stand Test preparation sequence">
              {preparationSteps.map((step, index) => (
                <article key={step} className="step-five-prep-step">
                  <span>{index + 1}</span>
                  <strong>{step}</strong>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="step-five-safety-copy">
          <div>
            <StepIcon tone="info">i</StepIcon>
            <p>Make sure the chair is firmly placed against a wall.</p>
          </div>
          <div>
            <StepIcon tone="warning">!</StepIcon>
            <p>Stop immediately if you feel dizzy, have chest pain, or cannot catch your breath.</p>
          </div>
        </section>

        <section className="step-five-readiness-panel" aria-label="Starting position readiness">
          <StatusRow label="Camera position" status={readiness.cameraReady ? 'ready' : 'checking'} detail="Selected camera about 2 meters away at hip height." />
          <StatusRow label="Starting position" status={readiness.seatedCalibrationReady ? 'ready' : 'checking'} detail="Sit centered with both feet flat and hold still." />
          <StatusRow label="Chair placement" status="ready" detail="Chair placed firmly against a wall." />
        </section>

        <div className="step-five-actions">
          <VoiceButton
            label="Watch Demonstration"
            script={voiceScript}
            onReplay={() => setLastReplay(voiceScript)}
          />
          <PrimaryActionBar
            primaryLabel={readiness.ready ? `Starting in ${autoStartSeconds ?? ASSESSMENT_AUTO_START_COUNTDOWN_SECONDS}...` : 'Waiting for starting position'}
            primaryDisabled
            onPrimary={() => {}}
          />
        </div>
        {!readiness.ready ? (
          <p className="step-five-disabled-note" role="status">Sit centered, keep both feet visible, and hold still before starting.</p>
        ) : null}
        {lastReplay ? <span className="step-five-sr-status" role="status">{lastReplay}</span> : null}
      </main>
    </SessionShell>
  );
}

export function DisplayChairLiveScreen({ dashboard }) {
  const [lastReplay, setLastReplay] = useState('');
  const showBackWarning = useTimedBackGuard(true);
  const scenario = useMemo(() => chairLiveScenario(dashboard), [dashboard]);
  const qualityRows = useMemo(() => liveQualityRows(scenario, dashboard), [scenario, dashboard]);
  const connectionStatus = scenario.key === 'lost' ? 'lost' : hasCameraConnection(dashboard) ? 'connected' : 'waiting';
  const hasDominantAlert = Boolean(scenario.armFirst || scenario.armSecond || scenario.safetyStop);
  const alert = <ChairStandAlert scenario={scenario} dashboard={dashboard} dominant={hasDominantAlert} />;
  const showLiveActions = !(
    scenario.armFirst
    || scenario.armSecond
    || scenario.safetyStop
    || scenario.testComplete
    || scenario.key === 'half_rep'
    || scenario.key === 'calibration_failed'
  );

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
      calibrationReady: analysis?.calibrationStatus?.canStartAssessment === true,
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

  return (
    <SessionShell
      eyebrow="30-Second Chair Stand Test"
      title="30-Second Chair Stand Test"
      description="Stand fully, sit fully, and keep your arms crossed."
      connection={<ConnectionIndicator status={connectionStatus} label={scenario.key === 'lost' ? 'Camera connection lost' : dashboard?.cameraInputMode === 'LOCAL_WEBCAM' ? 'Laptop Camera' : 'Phone connection'} detail={scenario.movementLabel} />}
      progress={<SessionProgress current={8} total={9} label="Session progress" />}
      className="step-five-live-shell"
    >
      <main className="step-five-live" data-assessment-state={scenario.key} data-voice-script={scenario.voice}>
        {hasDominantAlert ? alert : null}
        <ChairPreview dashboard={dashboard} scenario={scenario} />

        <section className="step-five-live-center" aria-live="polite">
          <div className={`step-five-rep-display step-five-rep-display--${scenario.bannerTone}`}>
            <strong>
              <span>{scenario.reps}</span>
              <span>{scenario.reps === 1 ? 'repetition' : 'repetitions'}</span>
            </strong>
            <span>{scenario.remaining} seconds left</span>
          </div>
          <div className="step-five-current-cue">
            <p className="step-five-card-kicker">Current instruction</p>
            <h2>{scenario.instruction}</h2>
            <p>{scenario.cue}</p>
          </div>
          <ScenarioBanner scenario={scenario} />
          {!hasDominantAlert ? alert : null}
          {scenario.testComplete ? (
            <PrimaryActionBar
              primaryLabel="Continue to Analysis"
              onPrimary={() => goTo('/display/session/analyzing')}
            />
          ) : null}
          {scenario.key === 'calibration_failed' ? (
            <PrimaryActionBar
              primaryLabel={scenario.primaryLabel}
              onPrimary={() => goTo(scenario.primaryPath)}
            />
          ) : null}
          {showLiveActions ? (
            <div className="step-five-live-actions">
              <PrimaryActionBar
                primaryLabel="Hear Again"
                onPrimary={() => {
                  setLastReplay(scenario.voice);
                }}
              />
            </div>
          ) : null}
        </section>

        <aside className="step-five-live-side">
          <ChairDemonstration compact />
          <div className="step-five-posture-cue">
            <p className="step-five-card-kicker">Posture cue</p>
            <strong>{scenario.movementLabel}</strong>
            <span>{scenario.cue}</span>
          </div>
          <section className="step-five-quality-panel" aria-label="Camera quality state">
            <h2>Camera quality</h2>
            <div className="step-five-quality-list">
              {qualityRows.map((row) => <StatusRow key={row.label} {...row} />)}
            </div>
          </section>
          <div className="step-five-note">
            <StepIcon>i</StepIcon>
            <span>Live analysis only. Raw camera video is not saved.</span>
          </div>
        </aside>
        {lastReplay ? <span className="step-five-sr-status" role="status">{lastReplay}</span> : null}
      </main>
      {showBackWarning ? (
        <div className="foundation-back-warning" role="status">
          Use Pause, Hear Again, or Stop Session during a timed assessment.
        </div>
      ) : null}
    </SessionShell>
  );
}

export function DisplayChairResultScreen({ dashboard }) {
  const [lastReplay, setLastReplay] = useState('');
  const result = ChairResultState(dashboard);

  return (
    <SessionShell
      eyebrow="Chair Stand Test result"
      title={result.title}
      description={result.status}
      connection={<ConnectionIndicator status={result.tone === 'success' ? 'connected' : 'waiting'} label="Result saved" detail={repetitionLabel(result.reps)} />}
      progress={<SessionProgress current={9} total={9} label="Session progress" />}
      className="step-five-result-shell"
    >
      <main className="step-five-result" data-voice-script={result.voice}>
        <section className={`step-five-result-card step-five-result-card--${result.tone}`}>
          <StepIcon tone={result.tone}>{result.tone === 'success' ? 'OK' : '!'}</StepIcon>
          <div>
            <p className="step-five-card-kicker">Valid repetition count</p>
            <h2>{repetitionLabel(result.reps)}</h2>
            <strong>{result.status}</strong>
            <span>{result.detail}</span>
          </div>
        </section>

        <section className="step-five-next-panel">
          <h2>Next step</h2>
          <p>Steply will prepare the session summary using the existing scoring pipeline.</p>
          <div className="step-five-result-summary">
            <div>
              <span>Assessment</span>
              <strong>30-Second Chair Stand Test</strong>
            </div>
            <div>
              <span>Video storage</span>
              <strong>Raw camera video is not saved</strong>
            </div>
          </div>
        </section>

        <div className="step-five-actions">
          <VoiceButton script={result.voice} onReplay={() => setLastReplay(result.voice)} />
          <PrimaryActionBar
            primaryLabel="Continue to Results"
            onPrimary={() => goTo('/display/session/analyzing')}
          />
        </div>
        {lastReplay ? <span className="step-five-sr-status" role="status">{lastReplay}</span> : null}
      </main>
    </SessionShell>
  );
}
