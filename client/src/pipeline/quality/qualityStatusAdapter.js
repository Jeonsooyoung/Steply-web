import {
  QualityReasonCodes,
  QualityStates,
  normalizeFrameId,
} from '../shared/types/index.js';
import { validateQualityStatus } from '../shared/validation/runtimeValidation.js';
import { evaluateFrameQuality as legacyEvaluateFrameQuality, QualityDecisionStates } from '../../pose/trackingQuality.js';

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value) {
  if (!finite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function reasonFromLegacyMessage(message, readiness = {}) {
  const text = String(message || '').toLowerCase();
  if (readiness.poseCount > 1 || text.includes('one person')) return { code: QualityReasonCodes.MultiplePeople, count: readiness.poseCount || 2 };
  if (text.includes('feet')) return { code: QualityReasonCodes.FeetNotVisible };
  if (text.includes('full body') || text.includes('frame')) return { code: QualityReasonCodes.BodyOutOfFrame };
  if (text.includes('light') || text.includes('brightness')) return { code: QualityReasonCodes.LowLight, brightness: readiness.brightness?.corrected ?? readiness.brightness?.raw ?? undefined };
  if (text.includes('confidence') || text.includes('tracking')) return { code: QualityReasonCodes.LowLandmarkConfidence, score: readiness.trackingQualityScore ?? readiness.trackingQuality?.trackingQualityScore ?? 0 };
  if (text.includes('person')) return { code: QualityReasonCodes.NoPerson };
  return { code: QualityReasonCodes.Unknown };
}

function reasonsFromReadiness(readiness = {}, decision = {}) {
  const reasons = [];
  if (readiness.poseCount === 0) reasons.push({ code: QualityReasonCodes.NoPerson });
  if (readiness.poseCount > 1) reasons.push({ code: QualityReasonCodes.MultiplePeople, count: readiness.poseCount });
  if (readiness.fullBodyVisible === false) reasons.push({ code: QualityReasonCodes.BodyOutOfFrame });
  if (readiness.feetVisible === false) reasons.push({ code: QualityReasonCodes.FeetNotVisible });
  if (readiness.trackingQualityScore !== undefined && readiness.trackingQualityScore < 0.6) {
    reasons.push({ code: QualityReasonCodes.LowLandmarkConfidence, score: clamp01(readiness.trackingQualityScore) });
  }
  if (readiness.message) reasons.push(reasonFromLegacyMessage(readiness.message, readiness));
  if (decision?.state === QualityDecisionStates.Invalid && !reasons.length) reasons.push({ code: QualityReasonCodes.TrackingLost });
  return reasons.filter((reason, index, list) => (
    list.findIndex((candidate) => candidate.code === reason.code) === index
  ));
}

function stateFromDecision(decision = {}, readiness = null) {
  if (decision.state === QualityDecisionStates.Pass) return QualityStates.Ready;
  if (decision.state === QualityDecisionStates.Pause) return QualityStates.Paused;
  if (decision.state === QualityDecisionStates.Block) return QualityStates.Blocked;
  if (decision.state === QualityDecisionStates.Invalid) return QualityStates.Invalid;
  if (!readiness) return QualityStates.NotReady;
  return readiness.ready ? QualityStates.Ready : QualityStates.NotReady;
}

export function legacyQualityDecisionToQualityStatus({
  sessionId,
  frameId,
  timestampMs,
  decision = null,
  readiness = null,
  poseFrame = null,
  currentFailureDurationMs = 0,
  accumulatedPauseDurationMs = 0,
} = {}) {
  const numericFrameId = normalizeFrameId(frameId);
  const resolvedDecision = decision || legacyEvaluateFrameQuality({ readiness, frameId, source: 'structured-adapter' });
  const state = stateFromDecision(resolvedDecision, readiness);
  const status = {
    sessionId: sessionId || poseFrame?.sessionId,
    frameId: numericFrameId ?? poseFrame?.frameId,
    timestampMs: timestampMs ?? poseFrame?.timestampMs,
    state,
    scores: {
      overall: clamp01(readiness?.trackingQualityScore ?? readiness?.trackingQuality?.trackingQualityScore ?? poseFrame?.confidence?.overall ?? 0),
      bodyVisibility: readiness?.trackingQuality?.fullBodyInFrameScore,
      lowerBodyVisibility: poseFrame?.confidence?.lowerBody,
      feetVisibility: poseFrame?.confidence?.feet,
      lighting: readiness?.brightness?.corrected ?? readiness?.brightness?.raw,
      tracking: readiness?.trackingQualityScore ?? readiness?.trackingQuality?.trackingQualityScore,
    },
    reasons: reasonsFromReadiness(readiness, resolvedDecision),
    userMessageKey: readiness?.messageKey || undefined,
    timing: {
      currentFailureDurationMs,
      accumulatedPauseDurationMs,
    },
    legacy: resolvedDecision,
  };
  const validation = validateQualityStatus(status, { poseFrame });
  return { value: status, validation };
}

export function evaluateFrameQuality(frame, context = {}) {
  if (context.legacyReadiness || context.qualityDecision) {
    return legacyQualityDecisionToQualityStatus({
      sessionId: frame?.sessionId,
      frameId: frame?.frameId,
      timestampMs: frame?.timestampMs,
      poseFrame: frame,
      readiness: context.legacyReadiness,
      decision: context.qualityDecision,
      currentFailureDurationMs: context.currentFailureDurationMs || 0,
      accumulatedPauseDurationMs: context.accumulatedPauseDurationMs || 0,
    });
  }

  const state = frame?.detectedPersonCount > 0 && (frame?.confidence?.overall || 0) >= 0.6
    ? QualityStates.Ready
    : QualityStates.NotReady;
  const reasons = state === QualityStates.Ready
    ? []
    : [{ code: frame?.detectedPersonCount > 0 ? QualityReasonCodes.LowLandmarkConfidence : QualityReasonCodes.NoPerson, score: frame?.confidence?.overall || 0 }];
  const status = {
    sessionId: frame?.sessionId,
    frameId: frame?.frameId,
    timestampMs: frame?.timestampMs,
    state,
    scores: {
      overall: frame?.confidence?.overall,
      lowerBodyVisibility: frame?.confidence?.lowerBody,
      feetVisibility: frame?.confidence?.feet,
      tracking: frame?.confidence?.overall,
    },
    reasons,
    timing: {
      currentFailureDurationMs: 0,
      accumulatedPauseDurationMs: 0,
    },
  };
  return { value: status, validation: validateQualityStatus(status, { poseFrame: frame }) };
}

