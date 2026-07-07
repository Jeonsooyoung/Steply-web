import { useEffect, useMemo, useRef, useState } from 'react';
import { MetricCard, SteplyButton, SteplyCard, StatusPill, TimerCircle } from './SteplyPrimitives';
import { PoseOverlay } from './pose/PoseOverlay';
import { READY_HOLD_SECONDS, evaluateSetupReadiness } from '../pose/poseQuality';
import { recommendationLabel } from '../pose/recommendationRules';
import { roundMetric, statusFromScore } from '../utils/format';
import { movementTests } from '../data/movementTests';
import standingPostureGuide from '../assets/movement-guides/standing-posture-check.png';
import chairStandGuide from '../assets/movement-guides/chair-stand-check.png';
import tugWalkGuide from '../assets/movement-guides/tug-walk-check.png';
import standingReferenceOverlay from '../assets/movement-guides/standing-reference-overlay.png';

// false로 바꿀 경우 개발자 디버깅용 요소는 없어짐.
const SHOW_DEBUG_TOOLS = false;

const movementGuideContent = {
  standing_posture: {
    image: standingPostureGuide,
    alt: 'Standing posture alignment guide from front and side views',
    steps: [
      'Stand tall with your feet about shoulder-width apart.',
      'Keep your shoulders relaxed and face forward.',
      'Stay still while the camera checks your alignment.',
    ],
    tip: 'Show your full body from head to feet so the posture line can be measured clearly.',
    setup: {
      title: 'Front-facing setup',
      body: 'Stand facing the camera with your head, shoulders, hips, knees, and feet visible.',
      points: [
        'Keep your feet inside the camera frame.',
        'Leave some space above your head and below your feet.',
        'Hold still until the countdown starts.',
      ],
    },
  },
  chair_stand: {
    image: chairStandGuide,
    alt: 'Chair stand guide showing standing, sitting, and standing again',
    steps: [
      'Cross your arms over your chest before starting.',
      'Sit down and stand up without rushing.',
      'Keep your feet planted and your chest open.',
    ],
    tip: 'Do not lean too far back on the chair. Push the floor gently with your feet.',
    setup: {
      title: 'Side-view setup',
      body: 'Place the camera to the side so your sitting and standing movement is easy to see.',
      points: [
        'Show the chair, hips, knees, ankles, and feet.',
        'Sit near the front edge of the chair before starting.',
        'Keep only one person in the camera view.',
      ],
    },
  },
  tug: {
    image: tugWalkGuide,
    alt: 'Timed Up and Go walking guide showing chair, walking path, cone, and return distance',
    steps: [
      'Start seated, then stand up when the test begins.',
      'Walk around the marker at a steady pace.',
      'Return to the chair and sit down safely.',
    ],
    tip: 'Keep the walking path visible in the camera view, including the chair and marker.',
    setup: {
      title: 'Walking-path setup',
      body: 'Stand or sit where your full body and walking path can be seen clearly.',
      points: [
        'Make sure both feet are visible before the test starts.',
        'Keep the chair and turn marker inside the camera view.',
        'Use a bright space and keep the camera steady.',
      ],
    },
  },
};

function percent(value) {
  if (!Number.isFinite(value)) return '-';
  return `${Math.round(value * 100)}%`;
}

function phaseLabel(phase) {
  if (phase === 'standing') return 'Standing';
  if (phase === 'rising') return 'Rising';
  if (phase === 'seated') return 'Seated';
  if (phase === 'walking') return 'Walking';
  if (phase === 'unknown') return 'Searching';
  return 'Waiting';
}

function setupStatusLabel(setupCheck, isRunning, hasFrame) {
  if (isRunning) return 'Testing';
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
  if (testType === 'standing_posture' || testType === 'balance_hold') {
    return [
      { label: 'Only you in frame', passed: checks.singlePersonStable },
      { label: 'Face the camera', passed: checks.correctDirection },
      { label: 'Head-to-feet visible', passed: checks.fullBodyVisible },
      { label: 'Feet inside frame', passed: checks.lowerBodyVisible },
      { label: 'Good camera distance', passed: checks.properDistance },
      { label: 'Hold still clearly', passed: checks.goodVisibility && checks.stablePose },
    ];
  }

  if (testType === 'tug' || testType === 'tug_walk') {
    return [
      { label: 'Only you in frame', passed: checks.singlePersonStable },
      { label: 'Full body at start', passed: checks.fullBodyVisible },
      { label: 'Both feet visible', passed: checks.lowerBodyVisible },
      { label: 'Walking path framed', passed: checks.properDistance },
      { label: 'Bright steady camera', passed: checks.goodVisibility },
      { label: 'Ready start position', passed: checks.correctDirection },
    ];
  }

  return [
    { label: 'Only you in frame', passed: checks.singlePersonStable },
    { label: 'Side view visible', passed: checks.correctDirection },
    { label: 'Chair and body visible', passed: checks.fullBodyVisible },
    { label: 'Knees and ankles visible', passed: checks.lowerBodyVisible },
    { label: 'Good camera distance', passed: checks.properDistance },
    { label: 'Movement clearly detected', passed: checks.goodVisibility && checks.stablePose },
  ];
}

function userFriendlyStatus(state, remoteCameraFrame, frameLoadError) {
  if (frameLoadError) return 'The camera frame could not be loaded. Please reconnect the camera.';
  if (!remoteCameraFrame?.src) return 'Scan the QR code with the mobile app and start camera streaming.';
  if (state.warningMessage) return state.warningMessage;
  if (!state.isFullBodyVisible) return 'Move back until your full body is visible on the screen.';
  if (state.postureMessage) return state.postureMessage;
  return 'Good. Follow the screen and continue the test slowly.';
}

export function AnalysisPanel({
  remoteCameraFrame,
  remoteCameraStatus,
  selectedTest,
  onSelectTest,
  poseAnalysis,
}) {
  const [frameLoadError, setFrameLoadError] = useState('');
  const [readyHoldSeconds, setReadyHoldSeconds] = useState(0);
  const [qualityWarning, setQualityWarning] = useState('');
  const [setupImageFrame, setSetupImageFrame] = useState(null);
  const [showReferenceOverlay, setShowReferenceOverlay] = useState(true);
  const [referenceOverlayOpacity, setReferenceOverlayOpacity] = useState(0.38);
  const previousSetupSampleRef = useRef(null);
  const readyStartedAtRef = useRef(null);
  const autoStartRequestedRef = useRef(false);
  const badQualityStartedAtRef = useRef(null);
  const setupImageInputRef = useRef(null);

  const state = poseAnalysis?.analysisState || {};
  const result = poseAnalysis?.analysisResult || null;

  const displayFrame = setupImageFrame || remoteCameraFrame;
  const isSetupImageMode = Boolean(setupImageFrame?.src);
  const score = displayFrame?.src ? Math.round((state.confidence || 0) * 100) : 0;
  const status = state.warningMessage ? 'practice_needed' : statusFromScore(score || 72);
  const durationSeconds = state.durationSeconds || poseAnalysis?.durationSeconds || result?.durationSeconds || 30;

  const analysisElapsedSeconds = Number.isFinite(Number(state.elapsedSeconds))
    ? Math.floor(Number(state.elapsedSeconds))
    : 0;

  const [displayElapsedSeconds, setDisplayElapsedSeconds] = useState(0);
  const timerStartedAtRef = useRef(null);

  const primaryValue = state.primaryValue ?? state.repetitionCount ?? 0;
  const primaryLabel = state.primaryLabel || 'Chair Stands';

  useEffect(() => {
    if (!poseAnalysis?.isRunning) {
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
  }, [poseAnalysis?.isRunning, durationSeconds, analysisElapsedSeconds]);

  const elapsedSeconds = displayElapsedSeconds;

  const frameKb = remoteCameraFrame?.byteLength
    ? Math.round(remoteCameraFrame.byteLength / 1024)
    : '-';

  const receivedTime = remoteCameraFrame?.receivedAt
    ? new Date(remoteCameraFrame.receivedAt).toLocaleTimeString()
    : '-';

  const resultLevel = result?.recommendationLevel
    ? recommendationLabel(result.recommendationLevel)
    : '-';

  const cameraStatusText = isSetupImageMode
    ? 'Setup image preview'
    : frameLoadError || remoteCameraStatus || 'Waiting for phone camera';
  const friendlyStatus = userFriendlyStatus(state, displayFrame, frameLoadError);
  const startAnalysis = poseAnalysis?.startAnalysis;
  const setupCheck = useMemo(() => evaluateSetupReadiness({
    landmarks: poseAnalysis?.landmarks || [],
    testType: selectedTest,
    previousSample: previousSetupSampleRef.current,
    strictStability: !poseAnalysis?.isRunning,
  }), [poseAnalysis?.isRunning, poseAnalysis?.landmarks, selectedTest]);
  const setupStatus = isSetupImageMode
    ? 'Image check'
    : setupStatusLabel(setupCheck, poseAnalysis?.isRunning, Boolean(displayFrame?.src && !frameLoadError));
  const setupChecklist = setupChecklistItems(selectedTest, setupCheck.checks);
  const setupCountdown = setupCheck.isReady && !poseAnalysis?.isRunning && !isSetupImageMode
    ? Math.max(1, READY_HOLD_SECONDS - Math.floor(readyHoldSeconds))
    : null;
  const setupMessage = poseAnalysis?.isRunning
    ? (qualityWarning || friendlyStatus)
    : displayFrame?.src && !frameLoadError
      ? isSetupImageMode
        ? 'Setup image checked. Use a live camera stream to start the test.'
        : setupCheck.mainMessage
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
    autoStartRequestedRef.current = false;
    setReadyHoldSeconds(0);
    setQualityWarning('');
    badQualityStartedAtRef.current = null;
  }, [selectedTest, poseAnalysis?.analysisResult]);

  useEffect(() => {
    if (poseAnalysis?.isRunning || poseAnalysis?.analysisResult || !remoteCameraFrame?.src || isSetupImageMode || frameLoadError) {
      readyStartedAtRef.current = null;
      autoStartRequestedRef.current = false;
      setReadyHoldSeconds(0);
      return undefined;
    }

    if (!setupCheck.isReady) {
      readyStartedAtRef.current = null;
      autoStartRequestedRef.current = false;
      setReadyHoldSeconds(0);
      return undefined;
    }

    if (!readyStartedAtRef.current) readyStartedAtRef.current = performance.now();

    const tick = () => {
      const elapsed = (performance.now() - readyStartedAtRef.current) / 1000;
      setReadyHoldSeconds(Math.min(READY_HOLD_SECONDS, elapsed));
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
    poseAnalysis?.isRunning,
    remoteCameraFrame?.src,
    isSetupImageMode,
    startAnalysis,
    setupCheck.isReady,
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
    if (!poseAnalysis?.isRunning) {
      badQualityStartedAtRef.current = null;
      setQualityWarning('');
      return;
    }

    if (setupCheck.isReady) {
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
      const mainWarning = setupCheck.warnings[0] || 'Pose detection is unstable. Please adjust your position.';
      setQualityWarning(
        mainWarning.includes('full body')
          ? 'Pose detection is unstable. Please adjust your position.'
          : mainWarning
      );
    }
  }, [poseAnalysis?.isRunning, setupCheck.isReady, setupCheck.warnings]);

  const selectedTestInfo = movementTests.find((test) => test.id === selectedTest);
  const selectedTestTitle = selectedTestInfo?.title || selectedTest?.replaceAll('_', ' ') || 'Remote Camera';
  const selectedTestDuration = selectedTestInfo?.duration || `${durationSeconds} sec`;
  const movementGuide = movementGuideContent[selectedTest] || movementGuideContent.chair_stand;
  const canUseReferenceOverlay = selectedTest === 'standing_posture';
  return (
    <div className="analysis-layout analysis-layout--guided">
      <SteplyCard className="arena-card arena-card--guided">
        <div className="arena-card__topbar">
          <div>
            <div className="eyebrow">Movement Test</div>
            <h2>{selectedTestTitle}</h2>
          </div>
          <StatusPill status={status} />
        </div>

        <div className="analysis-test-tabs analysis-test-tabs--guided" aria-label="Movement test selection">
          {movementTests.map((test, index) => (
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

        <div className="analysis-guided-body">
          <SteplyCard className="movement-guide-card">
            <h3>{selectedTestTitle} Guide</h3>

            <div className="movement-guide-visual">
              <img
                className="movement-guide-image"
                src={movementGuide.image}
                alt={movementGuide.alt}
              />
            </div>

            <ul className="movement-guide-list">
              {movementGuide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>

            <div className="movement-guide-tip">
              <strong>Tip</strong>
              <p>{movementGuide.tip}</p>
            </div>

            <div className="movement-setup-guide">
              <strong>{movementGuide.setup.title}</strong>
              <p>{movementGuide.setup.body}</p>
              <ul>
                {movementGuide.setup.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </SteplyCard>

          <div className="analysis-main-zone">
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
                  <PoseOverlay landmarks={poseAnalysis?.landmarks || []} />
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
                <span className="guided-camera-icon">▮▶</span>
                <div>
                  <strong>{setupMessage}</strong>
                  <p>
                    {poseAnalysis?.isRunning
                      ? 'Keep moving clearly inside the camera view.'
                      : isSetupImageMode
                        ? 'This image is for setup validation only.'
                      : setupCheck.isReady
                        ? 'The test will start automatically after the countdown.'
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
            </div>

            <p className="coach-message coach-message--guided">
              {setupMessage}
            </p>

            <SteplyCard className="setup-guide-card">
              <div className="setup-guide-card__header">
                <div>
                  <div className="eyebrow">Setup Check</div>
                  <h3>{setupStatus}</h3>
                </div>
                <div className={setupCheck.isReady ? 'setup-countdown setup-countdown--ready' : 'setup-countdown'}>
                  {setupCountdown || Math.round(setupCheck.readyScore * 100)}
                  <span>{setupCountdown ? 'sec' : 'score'}</span>
                </div>
              </div>

              <ul className="setup-checklist">
                {setupChecklist.map((item) => (
                  <SetupChecklistItem key={item.label} label={item.label} passed={item.passed} />
                ))}
              </ul>

              {setupCheck.warnings[0] && !poseAnalysis?.isRunning ? (
                <p className="setup-warning">{setupCheck.warnings[0]}</p>
              ) : null}

              {qualityWarning ? (
                <p className="setup-warning setup-warning--active">{qualityWarning}</p>
              ) : null}

              <div className="setup-image-actions">
                <input
                  ref={setupImageInputRef}
                  type="file"
                  accept="image/*"
                  className="setup-image-input"
                  onChange={handleSetupImageChange}
                />
                <SteplyButton
                  type="button"
                  variant="secondary"
                  onClick={() => setupImageInputRef.current?.click()}
                >
                  Upload Setup Image
                </SteplyButton>
                <SteplyButton
                  type="button"
                  variant="ghost"
                  onClick={clearSetupImage}
                  disabled={!setupImageFrame}
                >
                  Clear Image
                </SteplyButton>
              </div>

              <div className="reference-overlay-controls">
                <label className="reference-overlay-toggle">
                  <input
                    type="checkbox"
                    checked={showReferenceOverlay}
                    disabled={!canUseReferenceOverlay}
                    onChange={(event) => setShowReferenceOverlay(event.target.checked)}
                  />
                  Standing reference overlay
                </label>
                <label className="reference-overlay-opacity">
                  Opacity
                  <input
                    type="range"
                    min="0.15"
                    max="0.7"
                    step="0.05"
                    value={referenceOverlayOpacity}
                    disabled={!canUseReferenceOverlay || !showReferenceOverlay}
                    onChange={(event) => setReferenceOverlayOpacity(Number(event.target.value))}
                  />
                </label>
              </div>
            </SteplyCard>

            <div className="analysis-controls analysis-controls--guided">
              <SteplyButton
                onClick={poseAnalysis?.startAnalysis}
                disabled={!remoteCameraFrame?.src || isSetupImageMode || poseAnalysis?.isRunning || !setupCheck.isReady}
              >
                {isSetupImageMode ? 'Live Camera Required' : setupCheck.isReady ? '▶ Start Analysis' : 'Waiting for Setup'}
              </SteplyButton>

              <SteplyButton
                variant="secondary"
                onClick={poseAnalysis?.finishAnalysis}
                disabled={!poseAnalysis?.isRunning}
              >
                Save Result
              </SteplyButton>

              <SteplyButton variant="ghost" onClick={poseAnalysis?.resetAnalysis}>
                Reset
              </SteplyButton>

              {SHOW_DEBUG_TOOLS ? (
                <>
                  <SteplyButton variant="ghost" onClick={poseAnalysis?.probeDebug}>
                    Debug Probe
                  </SteplyButton>

                  <SteplyButton
                    variant="secondary"
                    onClick={poseAnalysis?.addManualRepetition}
                    disabled={!poseAnalysis?.isRunning}
                  >
                    +1 Rep Adjust
                  </SteplyButton>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </SteplyCard>

      <aside className="analysis-side analysis-side--guided">
        <SteplyCard className="feedback-stack feedback-stack--analysis guided-status-card">
          <div className="eyebrow">Test Status</div>
          <h3>Current Test Status</h3>

          <div className="guided-status-row">
            <span>Elapsed Time</span>
            <strong>{elapsedSeconds} / {durationSeconds} sec</strong>
          </div>

          <div className="guided-status-row">
            <span>{primaryLabel}</span>
            <strong>{roundMetric(primaryValue, 0)}</strong>
          </div>
        </SteplyCard>

        <TimerCircle
          value={elapsedSeconds}
          max={durationSeconds}
          label="seconds"
          score={roundMetric(primaryValue, 0)}
        />

        <MetricCard
          value={roundMetric(primaryValue, 0)}
          label={primaryLabel}
          detail={`${elapsedSeconds} / ${durationSeconds} sec`}
          accent
        />

        {result ? (
          <SteplyCard className="feedback-stack feedback-stack--result-mini">
            <div className="eyebrow">Final Result</div>
            <h3>{resultLevel}</h3>
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
                  ? 'Arm support detected: official score is 0'
                  : 'No arm-support disqualification'}
              </li>
            </ul>
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
              <li>Worker: {poseAnalysis?.workerStatus || 'booting'}</li>
              <li>Frame size: {frameKb} KB</li>
              <li>Frame #{remoteCameraFrame?.sequence || '-'} · {receivedTime}</li>
              <li>{state.isArmUseSuspected ? 'Arm support suspected: yes' : 'Arm support suspected: no'}</li>
              <li>Trunk center: {percent(state.trunkLeanScore)}</li>
              <li>Left-right symmetry: {percent(state.symmetryScore)}</li>
              <li>Sway stability: {percent(state.stabilityScore)}</li>
              <li>
                AI movement state:{' '}
                {state.movementState
                  ? `${state.movementState.label} (${percent(state.movementState.confidence)})`
                  : '-'}
              </li>
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
