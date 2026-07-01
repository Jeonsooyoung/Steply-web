import { useEffect, useState } from 'react';
import { MetricCard, SteplyButton, SteplyCard, StatusPill, TimerCircle } from './SteplyPrimitives';
import { PoseOverlay } from './pose/PoseOverlay';
import { recommendationLabel } from '../pose/recommendationRules';
import { roundMetric, statusFromScore } from '../utils/format';
import { movementTests } from '../data/movementTests';

//false로 바꿀 경우 개발자 디버깅용 요소는 없어짐.
const SHOW_DEBUG_TOOLS = true;

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
  const primaryValue = state.primaryValue ?? state.repetitionCount ?? 0;
  const primaryLabel = state.primaryLabel || 'Chair Stands';

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

  useEffect(() => {
    setFrameLoadError('');
  }, [remoteCameraFrame?.sequence, remoteCameraFrame?.src]);

  return (
    <div className="analysis-layout">
      <SteplyCard className="arena-card">
        <div className="arena-card__topbar">
          <div>
            <div className="eyebrow">PC Background Pose Analysis</div>
            <h2>{selectedTest ? selectedTest.replaceAll('_', ' ') : 'Remote Camera'}</h2>
          </div>
          <StatusPill status={status} />
        </div>

        <div className="analysis-test-tabs" aria-label="Movement test selection">
          {movementTests.map((test) => (
            <button
              key={test.id}
              type="button"
              className={`analysis-test-tab ${selectedTest === test.id ? 'analysis-test-tab--active' : ''}`}
              onClick={() => onSelectTest?.(test.id)}
            >
              <strong>{test.title}</strong>
              <span>{test.duration}</span>
            </button>
          ))}
        </div>

        <div className="arena-stage arena-stage--camera">
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

        <p className="coach-message">
          {state.warningMessage || state.postureMessage || 'Scan the QR code with the mobile app, then start streaming.'}
        </p>

        <div className="analysis-controls">
          <SteplyButton
            onClick={poseAnalysis?.startAnalysis}
            disabled={!remoteCameraFrame?.src || poseAnalysis?.isRunning}
          >
            Start Analysis
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
      </SteplyCard>

      <aside className="analysis-side">
        <TimerCircle
          value={roundMetric(state.elapsedSeconds, 0)}
          max={durationSeconds}
          label="seconds"
          score={roundMetric(primaryValue, 0)}
        />

        <MetricCard
          value={roundMetric(primaryValue, 0)}
          label={primaryLabel}
          detail={`${roundMetric(state.elapsedSeconds, 0)} / ${durationSeconds} sec`}
          accent
        />

        <MetricCard
          value={phaseLabel(state.phase)}
          label="Phase"
          detail={state.isFullBodyVisible ? 'Full body visible' : 'Waiting for full body'}
          status={status}
        />

        <MetricCard
          value={percent(state.confidence)}
          label="Pose Confidence"
          detail={`Worker: ${poseAnalysis?.workerStatus || 'booting'}`}
        />

        {SHOW_DEBUG_TOOLS ? (
          <MetricCard
            value={frameKb}
            label="Frame KB"
            detail={`Frame #${remoteCameraFrame?.sequence || '-'} · ${receivedTime}`}
          />
        ) : null}

        <SteplyCard className="feedback-stack feedback-stack--analysis">
          <div className="eyebrow">Realtime Rules</div>
          <h3>Pose Analysis Status</h3>
          <ul>
            <li>{state.postureMessage || 'Waiting for analysis'}</li>
            <li>{state.isArmUseSuspected ? 'Arm support suspected: yes' : 'Arm support suspected: no'}</li>
            <li>Trunk center: {percent(state.trunkLeanScore)}</li>
            <li>Left-right symmetry: {percent(state.symmetryScore)}</li>
            <li>Sway stability: {percent(state.stabilityScore)}</li>
          </ul>
        </SteplyCard>

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