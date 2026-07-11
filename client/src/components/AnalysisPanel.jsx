import { useEffect, useMemo, useRef, useState } from 'react';
import { SteplyCard, TimerCircle } from './SteplyPrimitives';
import { PoseOverlay } from './pose/PoseOverlay';
import { READY_HOLD_SECONDS, evaluateSetupReadiness } from '../pose/poseQuality';
import { recommendationLabel } from '../pose/recommendationRules';
import { roundMetric } from '../utils/format';
import { movementTests } from '../data/movementTests';
import standingPostureGuide from '../assets/movement-guides/standing-posture-check.png';
import chairStandGuide from '../assets/movement-guides/chair-stand-check.png';
import standingReferenceOverlay from '../assets/movement-guides/standing-reference-overlay.png';

function poseDebugEnabled() {
  if (typeof window === 'undefined') return false;
  const search = new URLSearchParams(window.location.search);
  if (search.get('debugPose') === '1' || search.get('poseDebug') === '1') return true;
  try {
    return window.localStorage.getItem('steply.poseDebug') === 'true';
  } catch (_) {
    return false;
  }
}

const SHOW_DEBUG_TOOLS = poseDebugEnabled();

const selectableMovementTests = movementTests;

const movementGuideContent = {
  four_stage_balance: {
    image: standingPostureGuide,
    alt: '4-stage balance standing guide from front and side views',
    steps: [
      'Complete each stance for 10 seconds before moving to the next one.',
      'Keep your eyes open and do not move your feet during the timed hold.',
      'Keep support nearby for safety, but do not hold it during the timed hold.',
    ],
    tip: 'The test stops when a stage cannot be held for 10 seconds without foot movement or support.',
    setup: {
      title: 'Front-view setup',
      body: 'Place your phone about 1.5m away and make sure your full body is visible.',
      points: [
        'Keep your feet and ankles inside the bottom of the frame.',
        'Stand near a chair or wall if you need support.',
        'Use the large screen for simple step-by-step guidance.',
      ],
    },
  },
  standing_posture: {
    image: standingPostureGuide,
    alt: 'Standing posture alignment guide from front and side views',
    steps: [
      'Stand comfortably with your feet about shoulder-width apart.',
      'Relax your shoulders and look forward.',
      'Hold still gently while the camera checks the view.',
    ],
    tip: 'A full-body view helps the posture guide stay clear.',
    setup: {
      title: 'Front-view setup',
      body: 'Adjust the camera so your head, shoulders, hips, knees, and feet are visible.',
      points: [
        'Keep both feet inside the camera view.',
        'Leave a little space above your head and below your feet.',
        'Stand comfortably until the countdown begins.',
      ],
    },
  },
  chair_stand: {
    image: chairStandGuide,
    alt: 'Chair stand guide showing standing, sitting, and standing again',
    steps: [
      'Before starting, fold your arms comfortably across your chest.',
      'Stand and sit without rushing.',
      'Keep both feet flat and your chest comfortably open.',
    ],
    tip: 'Use the floor through both feet and avoid dropping quickly into the chair.',
    setup: {
      title: 'Side-view setup',
      body: 'Place the camera to the side so sitting and standing are easy to see.',
      points: [
        'Keep the chair, hips, knees, ankles, and feet visible.',
        'Sit comfortably near the front of the chair before starting.',
        'Only one person should be in the camera view.',
      ],
    },
  },
  timed_up_and_go: {
    image: chairStandGuide,
    alt: 'Timed Up and Go setup with chair and walking path',
    steps: [
      'Sit in a stable chair with a clear 3-meter path in front of you.',
      'On start, stand up, walk to the mark, turn slowly, walk back, and sit down.',
      'Keep a wall, rail, or helper nearby if you usually use support.',
    ],
    tip: 'Steply records the time and looks for walking, turning, and return-to-sit patterns.',
    setup: {
      title: 'Path setup',
      body: 'Place the phone where the chair and walking path are easy to see.',
      points: [
        'Clear the path before starting.',
        'Mark the turn point at 3 meters or 10 feet.',
        'Use your usual support if you need it.',
      ],
    },
  },
};

function percent(value) {
  if (!Number.isFinite(value)) return '-';
  return `${Math.round(value * 100)}%`;
}

function signedPercent(value) {
  if (!Number.isFinite(value)) return '-';
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function milliseconds(value) {
  if (!Number.isFinite(value)) return '-';
  return `${Math.round(value)} ms`;
}

function timeWithMilliseconds(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return '-';
  const date = new Date(value);
  return `${date.toLocaleTimeString()}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function phaseLabel(phase) {
  if (phase === 'standing') return 'Standing';
  if (phase === 'rising') return 'Rising';
  if (phase === 'lowering') return 'Lowering';
  if (phase === 'seated') return 'Seated';
  if (phase === 'walking') return 'Walking';
  if (phase === 'unknown') return 'Searching';
  return 'Waiting';
}

function currentBalanceProtocolStage(protocol) {
  if (!protocol?.stages?.length) return null;
  return protocol.stages.find((stage) => stage.id === protocol.currentStageId)
    || protocol.stages.find((stage) => stage.status === 'holding')
    || protocol.stages.find((stage) => stage.status === 'waiting')
    || protocol.stages.find((stage) => stage.status === 'failed')
    || protocol.stages.at(-1);
}

function balanceProtocolTitle(protocol, stage) {
  if (!protocol || !stage) return '4-Stage Balance';
  if (protocol.status === 'completed') return 'Test complete';
  if (protocol.status === 'stopped') return 'Stop';
  if (stage.status === 'holding') return 'Ready, begin';
  return `Stage ${stage.order}: ${stage.title}`;
}

function balanceProtocolBody(protocol, stage) {
  if (!protocol) return 'Follow each stance in order.';
  if (protocol.status === 'completed') return 'All four 10-second stages are complete.';
  if (protocol.status === 'stopped') return protocol.message || 'The test stopped at this stage.';
  return protocol.message || stage?.instruction || 'Hold the current stance for 10 seconds.';
}

function balanceStageSetupInstruction(stageId) {
  if (stageId === 'semi_tandem') return 'Place the instep of one foot next to the big toe of the other foot.';
  if (stageId === 'tandem') return 'Place one foot directly in front of the other, heel touching toe.';
  if (stageId === 'one_leg') return 'Stand on one foot. Keep your eyes open and do not use support.';
  return 'Stand with your feet side by side. Keep your eyes open.';
}

function fallbackBalanceProtocol(testInfo) {
  const stages = (testInfo?.stages || []).map((stage, index) => ({
    id: stage.id,
    title: stage.title,
    order: stage.sequence || index + 1,
    status: index === 0 ? 'waiting' : 'pending',
    targetHoldSeconds: stage.durationSeconds || stage.passThresholdSeconds || 10,
    holdSeconds: 0,
    remainingSeconds: stage.durationSeconds || stage.passThresholdSeconds || 10,
    instruction: balanceStageSetupInstruction(stage.id),
  }));
  const firstStage = stages[0] || null;
  return {
    status: 'waiting',
    currentStageId: firstStage?.id || 'side_by_side',
    currentStageIndex: 0,
    currentStageOrder: firstStage?.order || 1,
    currentStageTitle: firstStage?.title || 'Side-by-side Stand',
    targetHoldSeconds: firstStage?.targetHoldSeconds || 10,
    completedCount: 0,
    totalStages: stages.length || 4,
    stopOnFailedStage: true,
    shouldFinishSession: false,
    failureReason: null,
    message: firstStage?.instruction || 'Stand with your feet side by side. Keep your eyes open.',
    stages,
  };
}

function setupStatusLabel(setupCheck, isRunning, hasFrame) {
  if (isRunning) return 'Mission in progress';
  if (!hasFrame) return 'Waiting for camera';
  if (setupCheck.isReady) return 'Ready';
  return 'Adjust position';
}

function SetupChecklistItem({ label, passed }) {
  return (
    <li className={passed ? 'setup-checklist-item setup-checklist-item--passed' : 'setup-checklist-item'}>
      <span>{passed ? '✓' : '!'}</span>
      {label}
    </li>
  );
}

function setupChecklistItems(testType, checks) {
  if (testType === 'standing_posture' || testType === 'balance_hold' || testType === 'four_stage_balance') {
    return [
      { label: 'One person in view', passed: checks.singlePersonStable },
      { label: 'Facing the camera', passed: checks.correctDirection },
      { label: 'Full body visible', passed: checks.fullBodyVisible },
      { label: 'Both feet visible', passed: checks.feetVisible ?? checks.lowerBodyVisible },
      { label: 'Good camera distance', passed: checks.properDistance },
      { label: 'Clear, steady tracking', passed: checks.goodVisibility && checks.stablePose && checks.cameraStill },
    ];
  }

  return [
    { label: 'One person in view', passed: checks.singlePersonStable },
    { label: testType === 'timed_up_and_go' ? 'Path view ready' : 'Side view ready', passed: checks.correctDirection },
    { label: testType === 'timed_up_and_go' ? 'Chair and path visible' : 'Chair and body visible', passed: checks.fullBodyVisible },
    { label: 'Knees, ankles, and feet visible', passed: checks.feetVisible ?? checks.lowerBodyVisible },
    { label: 'Good camera distance', passed: checks.properDistance },
    { label: 'Movement tracking is clear', passed: checks.goodVisibility && checks.stablePose && checks.cameraStill },
  ];
}

function userFriendlyStatus(state, remoteCameraFrame, frameLoadError) {
  if (frameLoadError) return 'The camera view did not load. Check the phone connection and try again.';
  if (!remoteCameraFrame?.src) return 'Connect your phone camera, then stand where your full body is visible.';
  if (state.warningMessage) return state.warningMessage;
  if (!state.isFullBodyVisible) return 'Take one small step back so your full body is visible.';
  if (state.postureMessage) return state.postureMessage;
  return 'You’re doing well. Keep your eyes forward and move gently.';
}

function localizedSetupText(message) {
  if (!message) return message;
  const text = String(message);
  if (text.includes('Great. Hold still')) return 'Great. Hold still gently for three seconds.';
  if (text.includes('only one person')) return 'Keep only one person in the camera view.';
  if (text.includes('full body')) return 'Step back a little so your full body is visible.';
  if (text.includes('knees and ankles')) return 'Adjust the camera angle so your knees and ankles are visible.';
  if (text.includes('both feet')) return 'Tilt the camera down so both feet are visible.';
  if (text.includes('camera can see')) return 'Stand where the camera can see your whole body.';
  if (text.includes('Hold still gently')) return 'Hold still gently while the camera checks your position.';
  if (text.includes('brighter space') || text.includes('camera steady')) return 'Use a brighter space and keep the camera steady.';
  if (text.includes('Stand sideways')) return 'Turn sideways so sitting and standing are easy to see.';
  if (text.includes('Stand where')) return 'Stand where your full body is visible.';
  if (text.includes('camera frame')) return 'Fit your full body inside the camera frame.';
  return text;
}

export function AnalysisPanel({
  remoteCameraFrame,
  remoteCameraStatus,
  selectedTest,
  onSelectTest,
  poseAnalysis,
  missionPreviewActive = false,
  onPreviewMissionStart,
  onPreviewResult,
}) {
  const [frameLoadError, setFrameLoadError] = useState('');
  const [readyHoldSeconds, setReadyHoldSeconds] = useState(0);
  const [qualityWarning, setQualityWarning] = useState('');
  const [setupImageFrame, setSetupImageFrame] = useState(null);
  const [showReferenceOverlay, setShowReferenceOverlay] = useState(true);
  const [referenceOverlayOpacity, setReferenceOverlayOpacity] = useState(0.38);
  const [latestReadinessReset, setLatestReadinessReset] = useState(null);
  const previousSetupSampleRef = useRef(null);
  const readyStartedAtRef = useRef(null);
  const readyHoldSecondsRef = useRef(0);
  const autoStartRequestedRef = useRef(false);
  const badQualityStartedAtRef = useRef(null);
  const setupImageInputRef = useRef(null);

  const state = poseAnalysis?.analysisState || {};
  const result = poseAnalysis?.analysisResult || null;
  const isMissionRunning = Boolean(poseAnalysis?.isRunning || missionPreviewActive);

  const displayFrame = setupImageFrame || remoteCameraFrame;
  const isSetupImageMode = Boolean(setupImageFrame?.src);
  const trackingQualityScore = poseAnalysis?.trackingQuality?.trackingQualityScore
    ?? poseAnalysis?.cameraReadiness?.trackingQualityScore
    ?? state.trackingQualityScore
    ?? state.confidence
    ?? 0;
  const durationSeconds = state.durationSeconds || poseAnalysis?.durationSeconds || result?.durationSeconds || 30;

  const analysisElapsedSeconds = Number.isFinite(Number(state.elapsedSeconds))
    ? Math.floor(Number(state.elapsedSeconds))
    : 0;

  const [displayElapsedSeconds, setDisplayElapsedSeconds] = useState(0);
  const timerStartedAtRef = useRef(null);

  const selectedTestInfo = movementTests.find((test) => test.id === selectedTest);
  const primaryValue = state.primaryValue ?? state.repetitionCount ?? 0;
  const primaryLabel = selectedTest === 'four_stage_balance'
    ? 'Hold Time'
    : state.primaryLabel
    || selectedTestInfo?.primaryMetric?.label
    || 'Chair Stands';

  useEffect(() => {
    if (!isMissionRunning) {
      timerStartedAtRef.current = null;
      setDisplayElapsedSeconds(Math.min(durationSeconds, analysisElapsedSeconds));
      return undefined;
    }

    if (!timerStartedAtRef.current) {
      timerStartedAtRef.current = performance.now() - analysisElapsedSeconds * 1000;
    }

    const tick = () => {
      const nextElapsedSeconds = Math.floor(
        (performance.now() - timerStartedAtRef.current) / 1000
      );

      setDisplayElapsedSeconds(
        Math.min(durationSeconds, Math.max(0, nextElapsedSeconds))
      );
    };

    tick();

    const intervalId = window.setInterval(tick, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isMissionRunning, durationSeconds, analysisElapsedSeconds]);

  const elapsedSeconds = displayElapsedSeconds;

  const frameKb = remoteCameraFrame?.byteLength
    ? Math.round(remoteCameraFrame.byteLength / 1024)
    : '-';

  const receivedTime = remoteCameraFrame?.receivedAt
    ? new Date(remoteCameraFrame.receivedAt).toLocaleTimeString()
    : '-';
  const frameTiming = poseAnalysis?.frameTiming || null;
  const frameTimingText = frameTiming
    ? `${timeWithMilliseconds(frameTiming.receivedAt)} -> ${timeWithMilliseconds(frameTiming.analyzedAt)}`
    : '-';
  const brightnessCalibration = poseAnalysis?.brightnessCalibration || null;
  const brightnessStats = poseAnalysis?.brightnessStats || null;
  const brightnessCalibrationText = brightnessCalibration?.sampleCount
    ? `${percent(brightnessCalibration.averageBrightness)} -> ${percent(brightnessCalibration.calibratedAverageBrightness)} (${signedPercent(brightnessCalibration.correction)}, n=${brightnessCalibration.sampleCount})`
    : '-';
  const brightnessFrameText = brightnessStats && Number.isFinite(brightnessStats.raw)
    ? `${percent(brightnessStats.raw)} -> ${percent(brightnessStats.corrected)}`
    : '-';

  const resultLevel = result?.recommendationLevel
    ? recommendationLabel(result.recommendationLevel)
    : '-';
  const balanceProtocol = selectedTest === 'four_stage_balance'
    ? state.balanceProtocol || result?.balanceResult?.officialProtocol || result?.officialProtocol || fallbackBalanceProtocol(selectedTestInfo)
    : null;
  const balanceStage = currentBalanceProtocolStage(balanceProtocol);
  const balanceStageHold = Number(balanceStage?.holdSeconds) || 0;
  const balanceStageTarget = Number(balanceStage?.targetHoldSeconds || balanceProtocol?.targetHoldSeconds || 10);
  const balanceCompletedCount = Number(balanceProtocol?.completedCount) || 0;
  const balanceStageLabel = balanceStage
    ? `Stage ${balanceStage.order} / ${balanceProtocol?.totalStages || 4}`
    : 'Stage';
  const isBalanceProtocolActive = selectedTest === 'four_stage_balance' && Boolean(balanceProtocol);

  const cameraStatusText = isSetupImageMode
    ? 'Setup image preview'
    : frameLoadError || remoteCameraStatus || 'Waiting for phone camera';
  const friendlyStatus = missionPreviewActive
    ? state.postureMessage || 'Hold this position gently. You’re doing well. Keep your eyes forward.'
    : userFriendlyStatus(state, displayFrame, frameLoadError);
  const startAnalysis = poseAnalysis?.startAnalysis;
  const setupCheck = useMemo(() => {
    if (poseAnalysis?.cameraReadiness) return poseAnalysis.cameraReadiness;
    return evaluateSetupReadiness({
      landmarks: poseAnalysis?.landmarks || [],
      testType: selectedTest,
      previousSample: previousSetupSampleRef.current,
      strictStability: !isMissionRunning,
    });
  }, [isMissionRunning, poseAnalysis?.cameraReadiness, poseAnalysis?.landmarks, selectedTest]);
  const displaySetupCheck = missionPreviewActive
    ? {
      ...setupCheck,
      isReady: true,
      readyScore: 1,
      warnings: [],
      mainMessage: 'Hold this position gently. You’re doing well. Keep your eyes forward.',
      checks: Object.fromEntries(Object.keys(setupCheck.checks || {}).map((key) => [key, true])),
    }
    : setupCheck;
  const readinessDebug = displaySetupCheck.readinessDebug || {
    isReady: Boolean(displaySetupCheck.isReady),
    trackingQualityScore,
    failingReasons: displaySetupCheck.warnings || [],
    footLandmarkVisibility: {},
  };
  const footVisibility = readinessDebug.footLandmarkVisibility || {};
  const setupStatus = isSetupImageMode
    ? 'Image check'
    : setupStatusLabel(displaySetupCheck, isMissionRunning, Boolean((displayFrame?.src || missionPreviewActive) && !frameLoadError));
  const setupChecklist = setupChecklistItems(selectedTest, displaySetupCheck.checks);
  const setupCountdown = displaySetupCheck.isReady && !isMissionRunning && !isSetupImageMode
    ? Math.max(1, READY_HOLD_SECONDS - Math.floor(readyHoldSeconds))
    : null;
  const hasLiveCameraFrame = Boolean(remoteCameraFrame?.src && !frameLoadError && !isSetupImageMode);
  const canStartMission = Boolean(
    hasLiveCameraFrame
      && !isMissionRunning
      && !poseAnalysis?.analysisResult
      && startAnalysis
  );
  const setupMessage = isMissionRunning
    ? (qualityWarning || friendlyStatus)
    : displayFrame?.src && !frameLoadError
      ? isSetupImageMode
        ? 'Setup image checked. Start the real mission with the live camera.'
        : localizedSetupText(displaySetupCheck.mainMessage)
      : friendlyStatus;

  useEffect(() => {
    setFrameLoadError('');
  }, [remoteCameraFrame?.sequence, remoteCameraFrame?.src]);

  useEffect(() => () => {
    if (setupImageFrame?.src) URL.revokeObjectURL(setupImageFrame.src);
  }, [setupImageFrame?.src]);

  useEffect(() => {
    if (setupCheck.sample?.bodyBox) previousSetupSampleRef.current = setupCheck.sample;
  }, [setupCheck.sample]);

  useEffect(() => {
    readyStartedAtRef.current = null;
    readyHoldSecondsRef.current = 0;
    autoStartRequestedRef.current = false;
    setReadyHoldSeconds(0);
    setLatestReadinessReset(null);
    setQualityWarning('');
    badQualityStartedAtRef.current = null;
  }, [selectedTest, poseAnalysis?.analysisResult]);

  useEffect(() => {
    if (isMissionRunning || poseAnalysis?.analysisResult || !remoteCameraFrame?.src || isSetupImageMode || frameLoadError) {
      readyStartedAtRef.current = null;
      readyHoldSecondsRef.current = 0;
      autoStartRequestedRef.current = false;
      setReadyHoldSeconds(0);
      return undefined;
    }

    if (!displaySetupCheck.isReady) {
      const previousTimerValue = readyHoldSecondsRef.current;
      if (SHOW_DEBUG_TOOLS && previousTimerValue > 0) {
        setLatestReadinessReset({
          timestamp: Date.now(),
          previousTimerValue,
          failingReasons: readinessDebug.failingReasons || [],
          trackingQualityScore: readinessDebug.trackingQualityScore ?? trackingQualityScore,
          footLandmarkVisibility: { ...footVisibility },
        });
      }
      readyStartedAtRef.current = null;
      readyHoldSecondsRef.current = 0;
      autoStartRequestedRef.current = false;
      setReadyHoldSeconds(0);
      return undefined;
    }

    if (!readyStartedAtRef.current) readyStartedAtRef.current = performance.now();

    const tick = () => {
      const elapsed = (performance.now() - readyStartedAtRef.current) / 1000;
      const nextReadyHoldSeconds = Math.min(READY_HOLD_SECONDS, elapsed);
      readyHoldSecondsRef.current = nextReadyHoldSeconds;
      setReadyHoldSeconds(nextReadyHoldSeconds);
      if (elapsed >= READY_HOLD_SECONDS && !autoStartRequestedRef.current) {
        autoStartRequestedRef.current = true;
        startAnalysis?.();
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 100);
    return () => window.clearInterval(intervalId);
  }, [
    frameLoadError,
    poseAnalysis?.analysisResult,
    isMissionRunning,
    remoteCameraFrame?.src,
    isSetupImageMode,
    startAnalysis,
    displaySetupCheck.isReady,
    readinessDebug,
    footVisibility,
    trackingQualityScore,
  ]);

  const handleSetupImageChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (setupImageFrame?.src) URL.revokeObjectURL(setupImageFrame.src);
    const src = URL.createObjectURL(file);
    setFrameLoadError('');
    setSetupImageFrame({
      src,
      blob: file,
      receivedAt: Date.now(),
      sequence: `setup-${Date.now()}`,
    });
    poseAnalysis?.previewSetupFrame?.(file);
  };

  const clearSetupImage = () => {
    if (setupImageFrame?.src) URL.revokeObjectURL(setupImageFrame.src);
    setSetupImageFrame(null);
    setQualityWarning('');
  };

  useEffect(() => {
    if (missionPreviewActive) {
      badQualityStartedAtRef.current = null;
      setQualityWarning('');
      return;
    }

    if (!isMissionRunning) {
      badQualityStartedAtRef.current = null;
      setQualityWarning('');
      return;
    }

    const qualityScore = poseAnalysis?.trackingQuality?.trackingQualityScore
      ?? displaySetupCheck.trackingQualityScore
      ?? state.trackingQualityScore
      ?? state.confidence
      ?? 0;
    const trackingBlocked = qualityScore < 0.6 || state.trackingPaused;

    if (!trackingBlocked && displaySetupCheck.isReady) {
      badQualityStartedAtRef.current = null;
      setQualityWarning('');
      return;
    }

    if (!badQualityStartedAtRef.current) {
      badQualityStartedAtRef.current = performance.now();
      return;
    }

    const badQualitySeconds = (performance.now() - badQualityStartedAtRef.current) / 1000;
    if (badQualitySeconds >= 1.2) {
      const mainWarning = trackingBlocked
        ? "Let's adjust the camera and try again."
        : localizedSetupText(displaySetupCheck.warnings[0]) || 'Body tracking is a little unclear. Adjust your position and try again.';
      setQualityWarning(
        mainWarning.includes('full body')
          ? 'Body tracking is a little unclear. Adjust your position and try again.'
          : mainWarning
      );
    }
  }, [
    isMissionRunning,
    missionPreviewActive,
    displaySetupCheck.isReady,
    displaySetupCheck.trackingQualityScore,
    displaySetupCheck.warnings,
    poseAnalysis?.trackingQuality?.trackingQualityScore,
    state.confidence,
    state.trackingPaused,
    state.trackingQualityScore,
  ]);

  const selectedTestTitle = selectedTestInfo?.title || selectedTest?.replaceAll('_', ' ') || 'Remote Camera';
  const selectedTestDuration = selectedTestInfo?.duration || `${durationSeconds} sec`;
  const movementGuide = movementGuideContent[selectedTest] || movementGuideContent.chair_stand;
  const canUseReferenceOverlay = selectedTest === 'standing_posture' || selectedTest === 'four_stage_balance';
  const isSetupCountingDown = setupCountdown !== null;
  const timerGuidanceTitle = isBalanceProtocolActive
    ? balanceProtocolTitle(balanceProtocol, balanceStage)
    : isMissionRunning
      ? 'Keep steady'
      : isSetupCountingDown
        ? `Starting in ${setupCountdown} sec`
        : 'Full body in view';
  const timerGuidanceBody = isBalanceProtocolActive
    ? balanceProtocolBody(balanceProtocol, balanceStage)
    : isMissionRunning
      ? 'Eyes forward, move slowly'
      : isSetupCountingDown
        ? 'Hold your setup position'
        : 'Stand 1.5m from the phone';
  const timerDisplayValue = isBalanceProtocolActive
    ? Math.round(Math.min(balanceStageTarget, balanceStageHold))
    : isSetupCountingDown ? setupCountdown : elapsedSeconds;
  const timerDisplayMax = isBalanceProtocolActive
    ? balanceStageTarget
    : isSetupCountingDown ? READY_HOLD_SECONDS : durationSeconds;
  const timerDisplayLabel = isBalanceProtocolActive ? 'stage sec' : isSetupCountingDown ? 'setup' : 'sec';

  return (
    <div className="analysis-layout analysis-layout--guided distance-mode distance-mode--analysis">
      <aside className="mission-guide-column">
        <SteplyCard className="mission-goal-card">
          <div>
            <div className="eyebrow">Goal</div>
            <h2>{selectedTestTitle}</h2>
          </div>
        </SteplyCard>

        <div className="analysis-test-tabs analysis-test-tabs--guided" aria-label="Movement test selection">
          {selectableMovementTests.map((test, index) => (
            <button
              key={test.id}
              type="button"
              className={`analysis-test-tab ${selectedTest === test.id ? 'analysis-test-tab--active' : ''}`}
              onClick={() => onSelectTest?.(test.id)}
            >
              <strong>{index + 1}. {test.title}</strong>
              <span>{test.duration}</span>
            </button>
          ))}
        </div>

        <SteplyCard className="movement-guide-card">
          <h3>{isMissionRunning ? 'Follow the stance' : 'Guide image'}</h3>

          <div className="movement-guide-visual">
            <img
              className="movement-guide-image"
              src={movementGuide.image}
              alt={movementGuide.alt}
            />
          </div>
        </SteplyCard>

        <SteplyCard className="feedback-stack feedback-stack--analysis guided-status-card">
          <div className="eyebrow">Live Status</div>
          <h3>{isBalanceProtocolActive ? balanceStage?.title || '4-Stage Balance' : 'Large, simple numbers'}</h3>

          <div className="guided-status-row">
            <span>{isBalanceProtocolActive ? 'Stage' : 'Time'}</span>
            <strong>{isBalanceProtocolActive ? balanceStageLabel : `${elapsedSeconds} / ${durationSeconds}s`}</strong>
          </div>

          <div className="guided-status-row">
            <span>{isBalanceProtocolActive ? 'Hold' : primaryLabel}</span>
            <strong>
              {isBalanceProtocolActive
                ? `${roundMetric(balanceStageHold, 0)} / ${balanceStageTarget}s`
                : roundMetric(primaryValue, 0)}
            </strong>
          </div>
        </SteplyCard>
      </aside>

      <main className="analysis-main-zone analysis-main-zone--mission">
        <SteplyCard className="mission-camera-card">
          <div className="arena-stage arena-stage--camera arena-stage--guided">
            {displayFrame?.src ? (
              <div className="remote-camera-layer">
                <img
                  className="remote-camera-frame"
                  src={displayFrame.src}
                  alt={isSetupImageMode ? 'Uploaded setup preview' : 'Camera stream from the phone'}
                  onLoad={() => setFrameLoadError('')}
                  onError={() => setFrameLoadError('Frame received, but the browser could not decode the image.')}
                />
                {canUseReferenceOverlay && showReferenceOverlay ? (
                  <img
                    className="reference-pose-overlay"
                    src={standingReferenceOverlay}
                    alt="Standing posture reference overlay"
                    style={{ opacity: referenceOverlayOpacity }}
                  />
                ) : null}
                <PoseOverlay
                  landmarks={poseAnalysis?.landmarks || []}
                  rawLandmarks={SHOW_DEBUG_TOOLS ? poseAnalysis?.rawLandmarks || [] : []}
                  showRaw={SHOW_DEBUG_TOOLS}
                  frameSize={poseAnalysis?.frameSize}
                  fit="cover"
                />
              </div>
            ) : (
              <>
                <div className="stage-grid" aria-hidden="true" />
                <div className="coach-figure coach-figure--stage" aria-label="Movement guide figure">
                  <span className="coach-head" />
                  <span className="coach-body" />
                  <span className="coach-arm coach-arm--left" />
                  <span className="coach-arm coach-arm--right" />
                  <span className="coach-leg coach-leg--left" />
                  <span className="coach-leg coach-leg--right" />
                  <span className="chair-seat" />
                  <span className="chair-leg chair-leg--left" />
                  <span className="chair-leg chair-leg--right" />
                </div>
                <div className="stage-pulse" />
              </>
            )}

            <div className="guided-camera-focus" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>

            <div className="guided-camera-message">
              <span className="guided-camera-icon">▶</span>
              <div>
                <strong>{setupMessage}</strong>
                <p>
                  {isMissionRunning
                    ? isBalanceProtocolActive
                      ? balanceProtocolBody(balanceProtocol, balanceStage)
                      : 'Hold this position gently and keep your eyes forward.'
                    : isSetupImageMode
                      ? 'This image is only for checking setup.'
                    : displaySetupCheck.isReady
                      ? 'The mission can begin when you press Start Mission.'
                      : movementGuide.setup.body}
                </p>
              </div>
            </div>

            <div className="remote-camera-badge">
              <span
                className={
                  displayFrame?.src && !frameLoadError
                    ? 'remote-camera-dot remote-camera-dot--live'
                    : 'remote-camera-dot'
                }
              />
              {cameraStatusText}
            </div>

            {SHOW_DEBUG_TOOLS && !isMissionRunning ? (
              <div className="pose-debug-overlay">
                <strong>Readiness Debug</strong>
                <span>Ready: {readinessDebug.isReady ? 'yes' : 'no'}</span>
                <span>Timer: {readyHoldSeconds.toFixed(1)} / {READY_HOLD_SECONDS.toFixed(1)}s</span>
                <span>Quality: {percent(readinessDebug.trackingQualityScore)}</span>
                <span>Failing: {readinessDebug.failingReasons?.join(', ') || 'none'}</span>
                <span>
                  Latest reset: {latestReadinessReset
                    ? `${timeWithMilliseconds(latestReadinessReset.timestamp)} at ${latestReadinessReset.previousTimerValue.toFixed(1)}s`
                    : 'none'}
                </span>
                {latestReadinessReset ? (
                  <span>Reset reasons: {latestReadinessReset.failingReasons.join(', ') || 'unknown'}</span>
                ) : null}
                <div className="pose-debug-foot-grid">
                  <span>L ankle {percent(footVisibility.left_ankle)}</span>
                  <span>R ankle {percent(footVisibility.right_ankle)}</span>
                  <span>L heel {percent(footVisibility.left_heel)}</span>
                  <span>R heel {percent(footVisibility.right_heel)}</span>
                  <span>L toe {percent(footVisibility.left_foot_index)}</span>
                  <span>R toe {percent(footVisibility.right_foot_index)}</span>
                </div>
              </div>
            ) : null}
          </div>
        </SteplyCard>
      </main>

      <aside className="analysis-side analysis-side--guided">
        <TimerCircle
          value={timerDisplayValue}
          max={timerDisplayMax}
          label={timerDisplayLabel}
          score={roundMetric(primaryValue, 0)}
        />

        <SteplyCard className="timer-guidance-card">
          <div>
            <strong>{timerGuidanceTitle}</strong>
            <p>{timerGuidanceBody}</p>
          </div>
        </SteplyCard>

        {result ? (
          <SteplyCard className="feedback-stack feedback-stack--result-mini">
            <div className="eyebrow">Final Result</div>
            <h3>{resultLevel}</h3>
            {result.invalid || result.testFlags?.cameraSetupNeeded ? (
              <ul>
                <li>Camera check needed</li>
                <li>Tracking quality: {percent(result.trackingQualityScore ?? result.confidence)}</li>
                <li>No screening result was generated.</li>
              </ul>
            ) : result.testType === 'four_stage_balance' ? (
              <ul>
                <li>Stages completed: {result.balanceResult?.officialProtocol?.completedCount ?? 0} / 4</li>
                <li>Tandem hold: {roundMetric(result.balanceResult?.stageById?.tandem?.holdSeconds ?? result.primaryValue, 1)} sec</li>
                <li>
                  {result.balanceResult?.officialProtocol?.status === 'completed'
                    ? 'Official sequence completed'
                    : result.balanceResult?.officialProtocol?.message || 'Official stop rule applied'}
                </li>
              </ul>
            ) : result.testType === 'timed_up_and_go' ? (
              <ul>
                <li>TUG time: {roundMetric(result.primaryValue, 1)} sec</li>
                <li>Turn time: {result.tugResult?.turnDurationSec ? `${result.tugResult.turnDurationSec.toFixed(1)} sec` : '-'}</li>
                <li>{result.tugResult?.wallOrFurnitureSupportDetected ? 'Support was observed during walking' : 'No support use observed'}</li>
              </ul>
            ) : (
              <ul>
                <li>
                  {result.primaryLabel || 'Final reps'}:{' '}
                  {roundMetric(result.primaryValue ?? result.repetitionCount, 0)}
                </li>
                <li>
                  Average pace:{' '}
                  {result.averageRepSeconds ? `${result.averageRepSeconds.toFixed(1)} sec/rep` : '-'}
                </li>
                <li>
                  {result.armUseDisqualified
                    ? 'Arm support was used, so supported strengthening is recommended'
                    : 'No arm-support note'}
                </li>
              </ul>
            )}
          </SteplyCard>
        ) : null}

        {poseAnalysis?.error ? (
          <SteplyCard className="feedback-stack feedback-stack--warning">
            <div className="eyebrow">MediaPipe</div>
            <h3>Analysis Error</h3>
            <p>{poseAnalysis.error}</p>
          </SteplyCard>
        ) : null}

        {SHOW_DEBUG_TOOLS ? (
          <SteplyCard className="feedback-stack feedback-stack--analysis">
            <div className="eyebrow">Developer Details</div>
            <h3>Analysis Details</h3>
            <ul>
              <li>Phase: {phaseLabel(state.phase)}</li>
              <li>Pose confidence: {percent(state.confidence)}</li>
              <li>Tracking quality: {percent(trackingQualityScore)}</li>
              <li>Quality level: {poseAnalysis?.trackingQuality?.level || '-'}</li>
              <li>Full body: {displaySetupCheck.fullBodyVisible ? 'yes' : 'no'}</li>
              <li>Feet visible: {displaySetupCheck.feetVisible ? 'yes' : 'no'}</li>
              <li>Camera still: {displaySetupCheck.cameraStill ? 'yes' : 'no'}</li>
              <li>Worker: {poseAnalysis?.workerStatus || 'booting'}</li>
              <li>Frame size: {frameKb} KB</li>
              <li>Pose latency: {milliseconds(frameTiming?.latencyMs)} ({frameTiming?.source || '-'})</li>
              <li>Pose timing: {frameTimingText}</li>
              <li>Lighting calibration: {brightnessCalibrationText}</li>
              <li>Frame brightness: {brightnessFrameText}</li>
              <li>Frame #{remoteCameraFrame?.sequence || '-'} · {receivedTime}</li>
              <li>Smoothed/raw visible: {poseAnalysis?.smoothingStats?.smoothedVisibleCount ?? '-'} / {poseAnalysis?.smoothingStats?.rawVisibleCount ?? '-'}</li>
              <li>Interpolated: {poseAnalysis?.smoothingStats?.interpolatedCount ?? '-'} · outliers: {poseAnalysis?.smoothingStats?.rejectedOutlierCount ?? '-'}</li>
              <li>Paused: {state.trackingPaused ? 'yes' : 'no'}</li>
              <li>{state.isArmUseSuspected ? 'Arm support suspected: yes' : 'Arm support suspected: no'}</li>
              <li>Trunk center: {percent(state.trunkLeanScore)}</li>
              <li>Left-right symmetry: {percent(state.symmetryScore)}</li>
              <li>Sway stability: {percent(state.stabilityScore)}</li>
            </ul>
          </SteplyCard>
        ) : null}

        {SHOW_DEBUG_TOOLS && poseAnalysis?.debugLog?.length ? (
          <SteplyCard className="feedback-stack feedback-stack--analysis">
            <div className="eyebrow">Debug</div>
            <h3>MediaPipe Loader Trace</h3>
            <ul>
              {poseAnalysis.debugLog.slice(-8).map((entry) => (
                <li key={`${entry.at}-${entry.event}`}>
                  <strong>{entry.event}</strong>: {JSON.stringify(entry.details)}
                </li>
              ))}
            </ul>
          </SteplyCard>
        ) : null}
      </aside>
    </div>
  );
}
