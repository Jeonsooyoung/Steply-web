import { useEffect, useRef, useState } from 'react';
import { MetricCard, SteplyButton, SteplyCard, StatusPill, TimerCircle } from './SteplyPrimitives';
import { PoseOverlay } from './pose/PoseOverlay';
import { recommendationLabel } from '../pose/recommendationRules';
import { roundMetric, statusFromScore } from '../utils/format';
import { movementTests } from '../data/movementTests';
import standingPostureGuide from '../assets/movement-guides/standing-posture-check.png';
import chairStandGuide from '../assets/movement-guides/chair-stand-check.png';
import tugWalkGuide from '../assets/movement-guides/tug-walk-check.png';

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

  const state = poseAnalysis?.analysisState || {};
  const result = poseAnalysis?.analysisResult || null;

  const score = remoteCameraFrame?.src ? Math.round((state.confidence || 0) * 100) : 0;
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

  const cameraStatusText = frameLoadError || remoteCameraStatus || 'Waiting for phone camera';
  const friendlyStatus = userFriendlyStatus(state, remoteCameraFrame, frameLoadError);

  useEffect(() => {
    setFrameLoadError('');
  }, [remoteCameraFrame?.sequence, remoteCameraFrame?.src]);

  const selectedTestInfo = movementTests.find((test) => test.id === selectedTest);
  const selectedTestTitle = selectedTestInfo?.title || selectedTest?.replaceAll('_', ' ') || 'Remote Camera';
  const selectedTestDuration = selectedTestInfo?.duration || `${durationSeconds} sec`;
  const movementGuide = movementGuideContent[selectedTest] || movementGuideContent.chair_stand;
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
          </SteplyCard>

          <div className="analysis-main-zone">
            <div className="arena-stage arena-stage--camera arena-stage--guided">
              {remoteCameraFrame?.src ? (
                <div className="remote-camera-layer">
                  <img
                    className="remote-camera-frame"
                    src={remoteCameraFrame.src}
                    alt="Camera stream from the phone"
                    onLoad={() => setFrameLoadError('')}
                    onError={() => setFrameLoadError('Frame received, but the browser could not decode the image.')}
                  />
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
                  <strong>Adjust your position until your full body is visible.</strong>
                  <p>The test will start when the camera detects your body.</p>
                </div>
              </div>

              <div className="remote-camera-badge">
                <span
                  className={
                    remoteCameraFrame?.src && !frameLoadError
                      ? 'remote-camera-dot remote-camera-dot--live'
                      : 'remote-camera-dot'
                  }
                />
                {cameraStatusText}
              </div>
            </div>

            <p className="coach-message coach-message--guided">
              {friendlyStatus}
            </p>

            <div className="analysis-controls analysis-controls--guided">
              <SteplyButton
                onClick={poseAnalysis?.startAnalysis}
                disabled={!remoteCameraFrame?.src || poseAnalysis?.isRunning}
              >
                ▶ Start Analysis
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
