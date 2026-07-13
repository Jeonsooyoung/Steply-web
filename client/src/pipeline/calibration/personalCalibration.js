import { calibrationConfig } from '../shared/config/calibration.config.js';
import {
  AssessmentTypes,
  CalibrationStatuses,
  CameraViews,
  createTypedId,
} from '../shared/types/index.js';
import { createCalibrationProfile } from './calibrationProfile.js';
import {
  bodyCenter,
  bodyScale,
  createCoordinateOrientation,
  estimateCameraView,
  feetConfidence,
  foldedArmConfidence,
  footCenter,
  footPlacementObservability,
  hipCenter,
  normalizeSittingToStandingProgress,
  shoulderCenter,
  worldBodyScale,
  worldFootCenter,
  worldHipCenter,
  worldLandmarkByIndex,
  worldShoulderCenter,
  LandmarkIndexes,
} from '../pose/coordinateMapping.js';

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function average(values = []) {
  const finiteValues = values.filter(finite);
  return finiteValues.length ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length : null;
}

function distance(first, second) {
  if (!first || !second || !finite(first.x) || !finite(first.y) || !finite(second.x) || !finite(second.y)) return null;
  const dz = finite(first.z) && finite(second.z) ? first.z - second.z : 0;
  return Math.hypot(first.x - second.x, first.y - second.y, dz);
}

function sampleFromFrame(frame, qualityStatus) {
  const hip = worldHipCenter(frame);
  const shoulders = worldShoulderCenter(frame);
  const center = hip && shoulders ? {
    x: (hip.x + shoulders.x) / 2,
    y: (hip.y + shoulders.y) / 2,
    z: (hip.z + shoulders.z) / 2,
  } : null;
  const scale = worldBodyScale(frame);
  const camera = estimateCameraView(frame);
  const leftWrist = worldLandmarkByIndex(frame, LandmarkIndexes.LeftWrist);
  const rightWrist = worldLandmarkByIndex(frame, LandmarkIndexes.RightWrist);
  const leftShoulder = worldLandmarkByIndex(frame, LandmarkIndexes.LeftShoulder);
  const rightShoulder = worldLandmarkByIndex(frame, LandmarkIndexes.RightShoulder);
  const foldDistances = [distance(leftWrist, rightShoulder), distance(rightWrist, leftShoulder)].filter(finite);
  return {
    timestampMs: frame.timestampMs,
    hip,
    shoulders,
    center,
    scale,
    feet: {
      left: worldFootCenter(frame, 'left'),
      right: worldFootCenter(frame, 'right'),
      confidence: feetConfidence(frame),
      placementObservable: footPlacementObservability(frame),
    },
    camera,
    confidence: Math.min(
      frame.confidence?.overall ?? 0,
      qualityStatus?.scores?.overall ?? frame.confidence?.overall ?? 0,
    ),
    foldedArmConfidence: foldedArmConfidence(frame),
    foldDistance: average(foldDistances),
  };
}

function stableWindow(samples = [], holdMs, config = calibrationConfig) {
  if (samples.length < 2) return { stable: false, confidence: 0 };
  const first = samples[0];
  const latest = samples.at(-1);
  if (!finite(first?.timestampMs) || !finite(latest?.timestampMs) || latest.timestampMs - first.timestampMs < holdMs) {
    return { stable: false, confidence: 0 };
  }
  const centers = samples.map((sample) => sample.center).filter(Boolean);
  const hips = samples.map((sample) => sample.hip).filter(Boolean);
  const centerSpread = centers.length > 1
    ? Math.max(...centers.map((point) => distance(point, centers[0]) || 0))
    : 0;
  const hipSpread = hips.length > 1
    ? Math.max(...hips.map((point) => distance(point, hips[0]) || 0))
    : 0;
  const confidence = average(samples.map((sample) => sample.confidence)) ?? 0;
  const stable = (
    centerSpread <= config.maxStableCenterDisplacement
    && hipSpread <= config.maxStableHipDisplacement
    && confidence >= config.minOverallConfidence
  );
  return {
    stable,
    confidence,
    centerSpread,
    hipSpread,
    durationMs: latest.timestampMs - first.timestampMs,
  };
}

function pruneSamples(samples, latestTimestampMs, windowMs = calibrationConfig.sampleRetentionMs) {
  return samples.filter((sample) => latestTimestampMs - sample.timestampMs <= windowMs);
}

function meanHipY(samples = []) {
  return average(samples.map((sample) => sample.hip?.y));
}

function averageScale(samples = []) {
  return {
    shoulderWidth: average(samples.map((sample) => sample.scale.shoulderWidth)) ?? undefined,
    torsoLength: average(samples.map((sample) => sample.scale.torsoLength)) ?? undefined,
    legLength: average(samples.map((sample) => sample.scale.legLength)) ?? undefined,
    footLengthLeft: average(samples.map((sample) => sample.scale.footLengthLeft)) ?? undefined,
    footLengthRight: average(samples.map((sample) => sample.scale.footLengthRight)) ?? undefined,
    averageFootLength: average(samples.map((sample) => sample.scale.averageFootLength)) ?? undefined,
  };
}

function meanFoldDistance(samples = []) {
  return average(samples.map((sample) => sample.foldDistance));
}

function cameraViewFromSamples(samples = []) {
  const latest = samples.at(-1);
  return latest?.camera || {
    view: CameraViews.Unknown,
    score: 0,
    estimatedAngleDegrees: undefined,
    mirrored: false,
    footPlaneObservableScore: 0,
  };
}

function footReferenceFromSamples(samples = []) {
  const latest = samples.at(-1);
  if (!latest) return null;
  return {
    left: latest.feet.left,
    right: latest.feet.right,
    placementObservableScore: latest.feet.placementObservable,
  };
}

function canUseAsSittingSample(sample, state, config = calibrationConfig) {
  if (!state.standingSamples.length || !sample?.hip) return false;
  const standingHip = meanHipY(state.standingSamples);
  const torso = average(state.standingSamples.map((item) => item.scale.torsoLength)) || 0.25;
  return finite(standingHip)
    && Math.abs(sample.hip.y - standingHip) >= torso * config.minHipSeparationBodyRatio;
}

function requiredReferencesReady(state, assessmentType, config = calibrationConfig) {
  const standingStable = state.standingStable?.stable;
  if (!standingStable) return false;
  if (assessmentType === AssessmentTypes.ChairStand30s) {
    return Boolean(
      state.sittingStable?.stable
      && state.foldedArmConfidence >= config.minFoldedArmConfidence
    );
  }
  if (assessmentType === AssessmentTypes.FourStageBalance) {
    return Boolean(
      state.balanceFootStable?.stable
      && state.footGeometryConfidence >= config.minFeetConfidence
      && state.footPlacementObservableScore >= config.minFootPlacementObservableScore
    );
  }
  return standingStable;
}

function failureReasonsFor(state, assessmentType) {
  const reasons = [];
  if (!state.standingStable?.stable) reasons.push({ code: 'STANDING_REFERENCE_NOT_STABLE' });
  if (assessmentType === AssessmentTypes.ChairStand30s) {
    if (!state.sittingStable?.stable) reasons.push({ code: 'SITTING_REFERENCE_NOT_STABLE' });
    if (state.foldedArmConfidence < calibrationConfig.minFoldedArmConfidence) reasons.push({ code: 'FOLDED_ARM_REFERENCE_NOT_READY' });
  }
  if (assessmentType === AssessmentTypes.FourStageBalance) {
    if (!state.balanceFootStable?.stable) reasons.push({ code: 'BALANCE_FOOT_BASELINE_NOT_STABLE' });
    if (state.footGeometryConfidence < calibrationConfig.minFeetConfidence) reasons.push({ code: 'FOOT_LANDMARK_CONFIDENCE_LOW' });
    if (state.footPlacementObservableScore < calibrationConfig.minFootPlacementObservableScore) reasons.push({ code: 'FOOT_PLACEMENT_NOT_OBSERVABLE' });
  }
  return reasons;
}

export function createPersonalCalibrationState({
  sessionId,
  assessmentType,
  calibrationId = createTypedId('calibration'),
  createdAtMs = Date.now(),
} = {}) {
  return {
    calibrationId,
    sessionId,
    assessmentType,
    createdAtMs,
    standingSamples: [],
    sittingSamples: [],
    balanceFootSamples: [],
    standingStable: null,
    sittingStable: null,
    balanceFootStable: null,
    foldedArmConfidence: 0,
    footGeometryConfidence: 0,
    footPlacementObservableScore: 0,
    profile: null,
  };
}

export function rebindValidPersonalCalibrationState(state, {
  sessionId,
  assessmentType,
} = {}) {
  if (
    !state
    || !sessionId
    || !assessmentType
    || state.assessmentType !== assessmentType
    || state.profile?.assessmentType !== assessmentType
    || state.profile?.status !== CalibrationStatuses.Valid
  ) return null;

  return {
    ...state,
    sessionId,
    profile: {
      ...state.profile,
      sessionId,
    },
  };
}

export function updatePersonalCalibration(state, {
  poseFrame,
  qualityStatus,
  phaseHint = null,
  config = calibrationConfig,
} = {}) {
  const next = state || createPersonalCalibrationState({
    sessionId: poseFrame?.sessionId,
    assessmentType: AssessmentTypes.ChairStand30s,
  });
  if (!poseFrame) return { state: next, profile: next.profile, canStartAssessment: false };
  const sample = sampleFromFrame(poseFrame, qualityStatus);
  const qualityReady = qualityStatus?.state === 'READY';
  const usable = qualityReady && sample.confidence >= config.minOverallConfidence;

  if (usable) {
    const sittingLike = phaseHint === 'sitting' || canUseAsSittingSample(sample, next, config);
    if (sittingLike && next.assessmentType === AssessmentTypes.ChairStand30s) {
      next.sittingSamples = pruneSamples([...next.sittingSamples, sample], poseFrame.timestampMs);
    } else {
      next.standingSamples = pruneSamples([...next.standingSamples, sample], poseFrame.timestampMs);
      if (next.assessmentType === AssessmentTypes.FourStageBalance) {
        next.balanceFootSamples = pruneSamples([...next.balanceFootSamples, sample], poseFrame.timestampMs);
      }
    }
  }

  next.standingStable = stableWindow(next.standingSamples, config.stableStandingHoldMs, config);
  next.sittingStable = stableWindow(next.sittingSamples, config.stableSittingHoldMs, config);
  next.balanceFootStable = stableWindow(next.balanceFootSamples, config.stableFootHoldMs, config);
  next.foldedArmConfidence = Math.max(next.foldedArmConfidence, sample.foldedArmConfidence || 0);
  next.footGeometryConfidence = Math.max(next.footGeometryConfidence, sample.feet.confidence || 0);
  next.footPlacementObservableScore = Math.max(next.footPlacementObservableScore, sample.feet.placementObservable || 0);

  const standingHipPosition = next.standingStable?.stable ? meanHipY(next.standingSamples) : undefined;
  const sittingHipPosition = next.sittingStable?.stable ? meanHipY(next.sittingSamples) : undefined;
  const camera = cameraViewFromSamples(next.standingSamples.length ? next.standingSamples : [sample]);
  const profileResult = createCalibrationProfile({
    calibrationId: next.calibrationId,
    sessionId: next.sessionId || poseFrame.sessionId,
    assessmentType: next.assessmentType,
    coordinateOrientation: createCoordinateOrientation({
      frame: poseFrame,
      standingHipPosition,
      sittingHipPosition,
    }),
    bodyScale: averageScale(next.standingSamples.length ? next.standingSamples : [sample]),
    references: {
      standingHipPosition,
      sittingHipPosition,
      H_stand: standingHipPosition,
      H_sit: sittingHipPosition,
      L_foot: averageScale(next.standingSamples.length ? next.standingSamples : [sample]).averageFootLength,
      W_shoulder: averageScale(next.standingSamples.length ? next.standingSamples : [sample]).shoulderWidth,
      D_fold: meanFoldDistance(next.sittingSamples.length ? next.sittingSamples : next.standingSamples),
      foldedArmReference: next.assessmentType === AssessmentTypes.ChairStand30s ? {
        confidence: next.foldedArmConfidence,
        distanceMeters: meanFoldDistance(next.sittingSamples.length ? next.sittingSamples : next.standingSamples),
      } : undefined,
      neutralFootPosition: next.assessmentType === AssessmentTypes.FourStageBalance
        ? footReferenceFromSamples(next.balanceFootSamples)
        : undefined,
    },
    camera: {
      view: camera.view || CameraViews.Unknown,
      estimatedAngleDegrees: camera.estimatedAngleDegrees,
      mirrored: Boolean(poseFrame.image?.mirrored),
    },
    confidence: {
      overall: Math.min(
        1,
        average([
          next.standingStable?.confidence || 0,
          next.assessmentType === AssessmentTypes.ChairStand30s ? next.sittingStable?.confidence || 0 : next.balanceFootStable?.confidence || 0,
          next.assessmentType === AssessmentTypes.ChairStand30s ? next.foldedArmConfidence : next.footGeometryConfidence,
        ]) || 0,
      ),
      standingReference: next.standingStable?.confidence,
      sittingReference: next.sittingStable?.confidence,
      footGeometry: next.assessmentType === AssessmentTypes.FourStageBalance ? next.footGeometryConfidence : undefined,
      foldedArms: next.assessmentType === AssessmentTypes.ChairStand30s ? next.foldedArmConfidence : undefined,
    },
    status: requiredReferencesReady(next, next.assessmentType, config)
      ? CalibrationStatuses.Valid
      : CalibrationStatuses.InProgress,
    failureReasons: failureReasonsFor(next, next.assessmentType),
    createdAtMs: next.createdAtMs,
    sampledDurationMs: next.standingStable?.durationMs || 0,
  });
  next.profile = profileResult.value;

  return {
    state: next,
    profile: next.profile,
    validation: profileResult.validation,
    canStartAssessment: profileResult.validation.ok && next.profile.status === CalibrationStatuses.Valid,
    progress: {
      standingStable: Boolean(next.standingStable?.stable),
      sittingStable: Boolean(next.sittingStable?.stable),
      balanceFootStable: Boolean(next.balanceFootStable?.stable),
      foldedArmConfidence: next.foldedArmConfidence,
      footGeometryConfidence: next.footGeometryConfidence,
      footPlacementObservableScore: next.footPlacementObservableScore,
      failureReasons: next.profile.failureReasons,
      sampledDurationMs: next.profile.sampledDurationMs,
    },
  };
}

export function bodyProgressFromCalibration(poseFrame, calibrationProfile) {
  return normalizeSittingToStandingProgress(poseFrame, calibrationProfile, { clamp: false });
}

export function createManualInterventionEvent({
  sessionId,
  assessmentType,
  timestampMs = Date.now(),
  reasonCode = 'MANUAL_INTERVENTION',
} = {}) {
  return {
    eventId: createTypedId('event'),
    sessionId,
    assessmentType,
    type: 'MANUAL_INTERVENTION_RECORDED',
    timestampMs,
    reasonCode,
  };
}
