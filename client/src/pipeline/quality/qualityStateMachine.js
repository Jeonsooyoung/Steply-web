import { qualityConfig } from '../shared/config/quality.config.js';
import {
  QualityReasonCodes,
  QualityStates,
} from '../shared/types/index.js';
import { validateQualityStatus } from '../shared/validation/runtimeValidation.js';

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function reasonKey(reason = {}) {
  return `${reason.code}:${reason.detail || reason.count || ''}`;
}

function uniqueReasons(reasons = []) {
  const seen = new Set();
  const out = [];
  for (const reason of reasons) {
    const key = reasonKey(reason);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(reason);
  }
  return out;
}

export function createQualityStateMachine({
  config = qualityConfig,
  sessionStartedAtMs = null,
} = {}) {
  let state = QualityStates.NotReady;
  let latestGoodAtMs = null;
  let lossStartedAtMs = null;
  let recoveryStartedAtMs = null;
  let accumulatedPauseDurationMs = 0;
  let pauseStartedAtMs = null;
  let latestGoodStatus = null;
  let startedAtMs = sessionStartedAtMs;

  function reset({ startedAt = null } = {}) {
    state = QualityStates.NotReady;
    latestGoodAtMs = null;
    lossStartedAtMs = null;
    recoveryStartedAtMs = null;
    accumulatedPauseDurationMs = 0;
    pauseStartedAtMs = null;
    latestGoodStatus = null;
    startedAtMs = startedAt;
  }

  function accumulatedPauseAt(timestampMs) {
    return accumulatedPauseDurationMs + (pauseStartedAtMs ? Math.max(0, timestampMs - pauseStartedAtMs) : 0);
  }

  function pauseRatioAt(timestampMs) {
    if (!finite(startedAtMs) || timestampMs <= startedAtMs) return 0;
    return accumulatedPauseAt(timestampMs) / (timestampMs - startedAtMs);
  }

  function enterPause(timestampMs) {
    if (!pauseStartedAtMs) pauseStartedAtMs = timestampMs;
  }

  function exitPause(timestampMs) {
    if (!pauseStartedAtMs) return;
    accumulatedPauseDurationMs += Math.max(0, timestampMs - pauseStartedAtMs);
    pauseStartedAtMs = null;
  }

  function update({ frame, metrics, timestampMs = frame?.timestampMs } = {}) {
    if (!finite(startedAtMs)) startedAtMs = timestampMs;
    const frameId = frame?.frameId;
    const sessionId = frame?.sessionId;
    const pass = Boolean(metrics?.pass);
    const reasons = uniqueReasons(metrics?.reasons || []);

    if (pass) {
      latestGoodAtMs = timestampMs;
      lossStartedAtMs = null;
      if (!recoveryStartedAtMs) recoveryStartedAtMs = timestampMs;
      const stableRecovered = timestampMs - recoveryStartedAtMs >= config.resumeStableMs;
      if (state === QualityStates.Paused && !stableRecovered) {
        state = QualityStates.Paused;
      } else {
        exitPause(timestampMs);
        state = QualityStates.Ready;
      }
    } else {
      recoveryStartedAtMs = null;
      if (!lossStartedAtMs) lossStartedAtMs = timestampMs;
      const lossDurationMs = timestampMs - lossStartedAtMs;
      if (lossDurationMs <= config.shortLossHoldMs && latestGoodStatus) {
        state = latestGoodStatus.state === QualityStates.Ready ? QualityStates.Ready : latestGoodStatus.state;
      } else if (
        lossDurationMs >= config.invalidAfterLossMs
        || pauseRatioAt(timestampMs) > config.maxAccumulatedPauseRatio
      ) {
        enterPause(timestampMs);
        state = QualityStates.Invalid;
      } else if (lossDurationMs >= config.pauseAfterLossMs) {
        enterPause(timestampMs);
        state = QualityStates.Paused;
      } else {
        state = QualityStates.NotReady;
      }
    }

    const currentFailureDurationMs = lossStartedAtMs ? Math.max(0, timestampMs - lossStartedAtMs) : 0;
    const status = {
      sessionId,
      frameId,
      timestampMs,
      state,
      scores: {
        overall: metrics?.scores?.overall,
        bodyVisibility: metrics?.scores?.bodyVisibility,
        lowerBodyVisibility: metrics?.scores?.lowerBodyVisibility,
        feetVisibility: metrics?.scores?.feetVisibility,
        orientation: metrics?.scores?.orientation,
        lighting: metrics?.scores?.lighting,
        tracking: metrics?.scores?.tracking,
      },
      reasons: state === QualityStates.Ready && pass ? [] : (reasons.length ? reasons : [{ code: QualityReasonCodes.TrackingLost }]),
      userMessageKey: reasons[0]?.code,
      timing: {
        currentFailureDurationMs,
        accumulatedPauseDurationMs: accumulatedPauseAt(timestampMs),
      },
      camera: metrics?.camera || null,
      footPlacementObservable: metrics?.footPlacementObservable ?? false,
    };
    const validation = validateQualityStatus(status, { poseFrame: frame });
    if (validation.ok && status.state === QualityStates.Ready) latestGoodStatus = status;
    return { value: status, validation };
  }

  function snapshot(timestampMs = Date.now()) {
    return {
      state,
      latestGoodAtMs,
      lossStartedAtMs,
      accumulatedPauseDurationMs: accumulatedPauseAt(timestampMs),
      pauseRatio: pauseRatioAt(timestampMs),
    };
  }

  return { reset, update, snapshot };
}

