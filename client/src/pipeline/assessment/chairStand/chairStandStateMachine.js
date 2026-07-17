import { chairStandConfig } from '../../shared/config/chairStand.config.js';
import {
  ArmUseStates,
  AssessmentEventTypes,
  AssessmentTypes,
  EvidenceKinds,
  QualityStates,
} from '../../shared/types/index.js';
import { createAssessmentEvent } from '../events.js';
import {
  LandmarkIndexes,
  normalizeSittingToStandingProgress,
  worldHipCenter,
  worldLandmarkByIndex,
  worldShoulderCenter,
} from '../../pose/coordinateMapping.js';

export const ChairStandMachineStates = {
  WaitingForSit: 'WAITING_FOR_SIT',
  Sit: 'SIT',
  Rising: 'RISING',
  Stand: 'STAND',
  Descending: 'DESCENDING',
  Paused: 'PAUSED',
  Completed: 'COMPLETED',
  Invalid: 'INVALID',
  RestartRequired: 'RESTART_REQUIRED',
};

export const ChairStandArmStates = {
  Unknown: 'UNKNOWN',
  FoldedArmsConfirmed: 'FOLDED_ARMS_CONFIRMED',
  ArmUseSuspected: 'ARM_USE_SUSPECTED',
  ArmUseConfirmed: 'ARM_USE_CONFIRMED',
  NotMeasurable: 'NOT_MEASURABLE',
};

const TERMINAL_STATES = new Set([
  ChairStandMachineStates.Completed,
  ChairStandMachineStates.Invalid,
  ChairStandMachineStates.RestartRequired,
]);

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, min, max) {
  if (!finite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function average(values = []) {
  const finiteValues = values.filter(finite);
  return finiteValues.length ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length : null;
}

function point(frame, index) {
  return worldLandmarkByIndex(frame, index);
}

function normalizedPoint(frame, index) {
  const landmarks = frame?.normalizedLandmarks || frame?.landmarks || [];
  const value = landmarks[index];
  return value && finite(value.x) && finite(value.y) ? value : null;
}

function normalizedChairStandGeometry(frame) {
  const leftHip = normalizedPoint(frame, LandmarkIndexes.LeftHip);
  const rightHip = normalizedPoint(frame, LandmarkIndexes.RightHip);
  const leftShoulder = normalizedPoint(frame, LandmarkIndexes.LeftShoulder);
  const rightShoulder = normalizedPoint(frame, LandmarkIndexes.RightShoulder);
  const hips = [leftHip, rightHip].filter(Boolean);
  const shoulders = [leftShoulder, rightShoulder].filter(Boolean);
  const hipY = average(hips.map((item) => item.y));
  const shoulderY = average(shoulders.map((item) => item.y));
  return {
    hipY,
    torsoLength: finite(hipY) && finite(shoulderY) ? Math.abs(hipY - shoulderY) : null,
  };
}

function visible(point, minVisibility = chairStandConfig.geometry.minimumVisibility) {
  return Boolean(point && finite(point.x) && finite(point.y) && (point.visibility ?? 0) >= minVisibility);
}

function distance(first, second) {
  if (!visible(first, 0) || !visible(second, 0)) return null;
  return Math.hypot(first.x - second.x, first.y - second.y, (first.z ?? 0) - (second.z ?? 0));
}

function angleDegrees(first, center, third) {
  if (!visible(first, 0) || !visible(center, 0) || !visible(third, 0)) return null;
  const ax = first.x - center.x;
  const ay = first.y - center.y;
  const az = (first.z ?? 0) - (center.z ?? 0);
  const bx = third.x - center.x;
  const by = third.y - center.y;
  const bz = (third.z ?? 0) - (center.z ?? 0);
  const magnitude = Math.max(Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz), 0.000001);
  const cosine = clamp((ax * bx + ay * by + az * bz) / magnitude, -1, 1);
  return Math.acos(cosine) * 180 / Math.PI;
}

function trunkAngleDegrees(frame) {
  const shoulders = worldShoulderCenter(frame, chairStandConfig.geometry.minimumVisibility);
  const hips = worldHipCenter(frame, chairStandConfig.geometry.minimumVisibility);
  if (!shoulders || !hips) return null;
  const horizontal = Math.hypot(shoulders.x - hips.x, shoulders.z - hips.z);
  const vertical = Math.abs(shoulders.y - hips.y);
  return Math.abs(Math.atan2(horizontal, vertical || 0.000001) * 180 / Math.PI);
}

function sideJointAngles(frame, side) {
  const left = side === 'left';
  const shoulder = point(frame, left ? LandmarkIndexes.LeftShoulder : LandmarkIndexes.RightShoulder);
  const hip = point(frame, left ? LandmarkIndexes.LeftHip : LandmarkIndexes.RightHip);
  const knee = point(frame, left ? LandmarkIndexes.LeftKnee : LandmarkIndexes.RightKnee);
  const ankle = point(frame, left ? LandmarkIndexes.LeftAnkle : LandmarkIndexes.RightAnkle);
  return {
    knee: angleDegrees(hip, knee, ankle),
    hip: angleDegrees(shoulder, hip, knee),
  };
}

function sideNormalizedJointAngles(frame, side) {
  const left = side === 'left';
  const shoulder = normalizedPoint(frame, left ? LandmarkIndexes.LeftShoulder : LandmarkIndexes.RightShoulder);
  const hip = normalizedPoint(frame, left ? LandmarkIndexes.LeftHip : LandmarkIndexes.RightHip);
  const knee = normalizedPoint(frame, left ? LandmarkIndexes.LeftKnee : LandmarkIndexes.RightKnee);
  const ankle = normalizedPoint(frame, left ? LandmarkIndexes.LeftAnkle : LandmarkIndexes.RightAnkle);
  return {
    knee: angleDegrees(hip, knee, ankle),
    hip: angleDegrees(shoulder, hip, knee),
  };
}

function pointInChestRegion(testPoint, region, minVisibility) {
  if (!visible(testPoint, minVisibility) || !region) return false;
  return (
    testPoint.x >= region.minX
    && testPoint.x <= region.maxX
    && testPoint.y >= region.minY
    && testPoint.y <= region.maxY
  );
}

function pointInThighRegion(testPoint, region, minVisibility) {
  if (!visible(testPoint, minVisibility) || !region) return false;
  return (
    testPoint.x >= region.minX
    && testPoint.x <= region.maxX
    && testPoint.y >= region.minY
    && testPoint.y <= region.maxY
  );
}

function chestAndThighRegions(frame, armConfig) {
  const leftShoulder = point(frame, LandmarkIndexes.LeftShoulder);
  const rightShoulder = point(frame, LandmarkIndexes.RightShoulder);
  const leftHip = point(frame, LandmarkIndexes.LeftHip);
  const rightHip = point(frame, LandmarkIndexes.RightHip);
  const leftKnee = point(frame, LandmarkIndexes.LeftKnee);
  const rightKnee = point(frame, LandmarkIndexes.RightKnee);
  if (![leftShoulder, rightShoulder, leftHip, rightHip].every((item) => visible(item, chairStandConfig.geometry.armMinimumVisibility))) {
    return { chest: null, thigh: null };
  }
  const shoulderWidth = distance(leftShoulder, rightShoulder) || chairStandConfig.geometry.fallbackShoulderWidthMeters;
  const torsoLength = distance(
    worldShoulderCenter(frame, chairStandConfig.geometry.armMinimumVisibility),
    worldHipCenter(frame, chairStandConfig.geometry.armMinimumVisibility),
  ) || chairStandConfig.geometry.fallbackTorsoLengthMeters;
  const minX = Math.min(leftShoulder.x, rightShoulder.x) - shoulderWidth * armConfig.chestHorizontalMarginShoulderWidths;
  const maxX = Math.max(leftShoulder.x, rightShoulder.x) + shoulderWidth * armConfig.chestHorizontalMarginShoulderWidths;
  const minChestY = Math.min(leftShoulder.y, rightShoulder.y) - torsoLength * armConfig.chestVerticalMarginTorsoLengths;
  const maxChestY = Math.max(leftHip.y, rightHip.y) + torsoLength * armConfig.chestVerticalMarginTorsoLengths;
  const kneeY = average([leftKnee?.y, rightKnee?.y]) ?? (maxChestY + torsoLength);
  const minThighY = Math.min(leftHip.y, rightHip.y) - torsoLength * armConfig.thighRegionMarginTorsoLengths;
  const maxThighY = kneeY + torsoLength * armConfig.thighRegionMarginTorsoLengths;
  return {
    chest: {
      minX,
      maxX,
      minY: minChestY,
      maxY: maxChestY,
    },
    thigh: {
      minX,
      maxX,
      minY: minThighY,
      maxY: maxThighY,
    },
  };
}

function rawArmObservation(frame, config) {
  const armConfig = config.armUse;
  const { chest, thigh } = chestAndThighRegions(frame, armConfig);
  const min = armConfig.minArmLandmarkConfidence;
  const confirmedMin = armConfig.minConfirmedArmConfidence;
  const leftWrist = point(frame, LandmarkIndexes.LeftWrist);
  const rightWrist = point(frame, LandmarkIndexes.RightWrist);
  const leftElbow = point(frame, LandmarkIndexes.LeftElbow);
  const rightElbow = point(frame, LandmarkIndexes.RightElbow);
  const armPoints = [leftWrist, rightWrist, leftElbow, rightElbow];
  const visibleArmPoints = armPoints.filter((item) => visible(item, min));
  const chestPoints = armPoints.filter((item) => pointInChestRegion(item, chest, min));
  const supportPoints = [leftWrist, rightWrist].filter((item) => pointInThighRegion(item, thigh, confirmedMin));
  const wristConfidence = average([leftWrist?.visibility, rightWrist?.visibility].filter(finite)) ?? 0;
  const armConfidence = average(armPoints.map((item) => item?.visibility).filter(finite)) ?? 0;
  const dFold = config.calibrationProfile?.references?.D_fold;
  const crossDistances = [distance(leftWrist, point(frame, LandmarkIndexes.RightShoulder)), distance(rightWrist, point(frame, LandmarkIndexes.LeftShoulder))];
  const foldedCandidate = finite(dFold)
    ? crossDistances.every((value) => finite(value) && value <= armConfig.foldedDistanceMultiplier * dFold)
    : false;
  const hips = worldHipCenter(frame, confirmedMin);
  const wristBelowHip = Boolean(hips && [leftWrist, rightWrist].some((wrist) => visible(wrist, confirmedMin) && wrist.y < hips.y));
  const supportCandidate = (supportPoints.length >= 1 || wristBelowHip) && armConfidence >= confirmedMin;
  const armsMeasurable = [leftWrist, rightWrist].every((item) => visible(item, confirmedMin));
  const outsideChestCandidate = visibleArmPoints.length > 0 && chestPoints.length < 2;
  const notFoldedCandidate = armsMeasurable && !foldedCandidate;
  const lowConfidence = armConfidence > 0 && armConfidence < confirmedMin;
  return {
    foldedCandidate,
    supportCandidate,
    confirmedCandidate: supportCandidate || notFoldedCandidate,
    suspectedCandidate: !supportCandidate && !notFoldedCandidate && (outsideChestCandidate || lowConfidence),
    wristConfidence,
    armConfidence,
    chestPointCount: chestPoints.length,
    supportPointCount: supportPoints.length,
  };
}

function updateArmState(previous, observation, timestampMs, config) {
  const armConfig = config.armUse;
  const next = {
    state: previous?.state || ChairStandArmStates.Unknown,
    candidate: previous?.candidate || null,
    candidateSinceMs: previous?.candidateSinceMs ?? null,
    confirmedAtMs: previous?.confirmedAtMs ?? null,
    userMessage: previous?.userMessage || null,
  };
  let candidate = ChairStandArmStates.Unknown;
  if (observation.confirmedCandidate) candidate = ChairStandArmStates.ArmUseConfirmed;
  else if (observation.foldedCandidate) candidate = ChairStandArmStates.FoldedArmsConfirmed;
  else if (observation.suspectedCandidate) candidate = ChairStandArmStates.ArmUseSuspected;
  else if (observation.armConfidence <= 0) candidate = ChairStandArmStates.NotMeasurable;

  if (candidate !== next.candidate) {
    next.candidate = candidate;
    next.candidateSinceMs = timestampMs;
  }
  const dwellMs = Math.max(0, timestampMs - (next.candidateSinceMs ?? timestampMs));
  if (
    candidate === ChairStandArmStates.ArmUseConfirmed
    && dwellMs >= armConfig.confirmedDwellMs
  ) {
    next.state = ChairStandArmStates.ArmUseConfirmed;
    next.confirmedAtMs = next.confirmedAtMs || timestampMs;
    next.userMessage = 'We could not clearly see your arms. Please restart the test.';
  } else if (
    candidate === ChairStandArmStates.FoldedArmsConfirmed
    && dwellMs >= armConfig.foldedConfirmDwellMs
  ) {
    next.state = ChairStandArmStates.FoldedArmsConfirmed;
    next.userMessage = null;
  } else if (
    candidate === ChairStandArmStates.ArmUseSuspected
    && dwellMs >= armConfig.suspectedDwellMs
    && next.state !== ChairStandArmStates.ArmUseConfirmed
  ) {
    next.state = ChairStandArmStates.ArmUseSuspected;
    next.userMessage = 'Keep your arms crossed over your chest.';
  } else if (
    candidate === ChairStandArmStates.NotMeasurable
    && next.state !== ChairStandArmStates.ArmUseConfirmed
  ) {
    next.state = ChairStandArmStates.NotMeasurable;
    next.userMessage = 'Keep your arms crossed over your chest.';
  }
  return next;
}

export function calculateChairStandFeatures({
  poseFrame,
  calibrationProfile,
  qualityStatus,
  previousFeatures = null,
  previousArmState = null,
  config = chairStandConfig,
} = {}) {
  const progressResult = normalizeSittingToStandingProgress(poseFrame, calibrationProfile, { clamp: false });
  const timestampMs = poseFrame?.timestampMs;
  const leftAngles = sideJointAngles(poseFrame, 'left');
  const rightAngles = sideJointAngles(poseFrame, 'right');
  const leftNormalizedAngles = sideNormalizedJointAngles(poseFrame, 'left');
  const rightNormalizedAngles = sideNormalizedJointAngles(poseFrame, 'right');
  const averageKneeAngle = average([leftAngles.knee, rightAngles.knee]);
  const calibratedProgress = progressResult.sittingToStandingProgress;
  const angleProgress = finite(averageKneeAngle)
    ? clamp(
      (averageKneeAngle - config.stateMachine.sittingKneeAngleMaxDegrees)
        / Math.max(1, config.stateMachine.standingKneeAngleMinDegrees - config.stateMachine.sittingKneeAngleMaxDegrees),
      0,
      1,
    )
    : null;
  const hipProgress = finite(calibratedProgress) ? calibratedProgress : angleProgress;
  const normalizedGeometry = normalizedChairStandGeometry(poseFrame);
  const trunkAngle = trunkAngleDegrees(poseFrame);
  const dtSeconds = previousFeatures && finite(timestampMs) && finite(previousFeatures.timestampMs)
    ? (timestampMs - previousFeatures.timestampMs) / 1000
    : null;
  const verticalVelocity = dtSeconds && dtSeconds > 0 && finite(hipProgress) && finite(previousFeatures.hipProgress)
    ? (hipProgress - previousFeatures.hipProgress) / dtSeconds
    : 0;
  const armObservation = rawArmObservation(poseFrame, { ...config, calibrationProfile });
  const armState = updateArmState(previousArmState, armObservation, timestampMs, config);
  const landmarkConfidence = {
    overall: poseFrame?.confidence?.overall ?? 0,
    lowerBody: poseFrame?.confidence?.lowerBody ?? 0,
    feet: poseFrame?.confidence?.feet ?? 0,
    arms: armObservation.armConfidence,
  };
  const valid = (
    finite(hipProgress)
    && landmarkConfidence.overall >= config.stateMachine.minimumLandmarkConfidence
    && qualityStatus?.state === QualityStates.Ready
  );
  return {
    timestampMs,
    frameId: poseFrame?.frameId,
    hipProgress,
    unclampedHipProgress: finite(progressResult.unclampedProgress) ? progressResult.unclampedProgress : angleProgress,
    progressSource: finite(calibratedProgress) ? 'CALIBRATED_HIP' : 'KNEE_ANGLE_FALLBACK',
    normalizedHipY: normalizedGeometry.hipY,
    normalizedTorsoLength: normalizedGeometry.torsoLength,
    normalizedKneeAngles: { left: leftNormalizedAngles.knee, right: rightNormalizedAngles.knee },
    normalizedHipAngles: { left: leftNormalizedAngles.hip, right: rightNormalizedAngles.hip },
    kneeAngles: {
      left: leftAngles.knee,
      right: rightAngles.knee,
    },
    hipAngles: {
      left: leftAngles.hip,
      right: rightAngles.hip,
    },
    trunkAngle,
    verticalVelocity,
    rawVerticalVelocity: verticalVelocity,
    footStability: {
      stable: true,
      normalizedDisplacement: null,
    },
    armState,
    armObservation,
    landmarkConfidence,
    valid,
  };
}

function bothAnglesAtLeast(angles, threshold) {
  return finite(angles.left) && finite(angles.right) && angles.left >= threshold && angles.right >= threshold;
}

function bothAnglesAtMost(angles, threshold) {
  return finite(angles.left) && finite(angles.right) && angles.left <= threshold && angles.right <= threshold;
}

function anyAngleAtLeast(angles, threshold) {
  return [angles.left, angles.right].some((angle) => finite(angle) && angle >= threshold);
}

function anyAngleAtMost(angles, threshold) {
  return [angles.left, angles.right].some((angle) => finite(angle) && angle <= threshold);
}

function isSitPose(features, config) {
  return Boolean(
    features.valid
      && (
        anyAngleAtMost(features.rawKneeAngles, config.sittingKneeAngleMaxDegrees)
        || anyAngleAtMost(features.kneeAngles, config.sittingKneeAngleMaxDegrees)
      )
  );
}

function isStandPose(features, config) {
  return Boolean(
    features.valid
      && (
        anyAngleAtLeast(features.rawKneeAngles, config.standingKneeAngleMinDegrees)
        || anyAngleAtLeast(features.kneeAngles, config.standingKneeAngleMinDegrees)
      )
      && (
        anyAngleAtLeast(features.rawHipAngles, config.standingHipAngleMinDegrees)
        || anyAngleAtLeast(features.hipAngles, config.standingHipAngleMinDegrees)
      )
  );
}

function dwell(candidate, condition, timestampMs, dwellMs) {
  if (!condition) return { sinceMs: null, satisfied: false };
  const sinceMs = candidate?.sinceMs ?? timestampMs;
  return {
    sinceMs,
    satisfied: timestampMs - sinceMs >= dwellMs,
  };
}

function createTransitionEvent({
  sessionId,
  from,
  to,
  type,
  timestampMs,
  frameId,
  confidence,
  reasonCode,
}) {
  const event = createAssessmentEvent({
    sessionId,
    assessmentType: AssessmentTypes.ChairStand30s,
    type,
    timestampMs,
    frameId,
    confidence,
    reasonCode,
    evidence: {
      kind: EvidenceKinds.StateTransition,
      from,
      to,
    },
  });
  return event.validation.ok ? event.value : null;
}

function createRepEvent({
  sessionId,
  timestampMs,
  frameId,
  confidence,
  durationMs,
  repetitionIndex,
}) {
  const event = createAssessmentEvent({
    sessionId,
    assessmentType: AssessmentTypes.ChairStand30s,
    type: AssessmentEventTypes.RepCompleted,
    timestampMs,
    frameId,
    confidence,
    reasonCode: `REP_${repetitionIndex}`,
    evidence: {
      kind: EvidenceKinds.Duration,
      durationMs,
    },
  });
  return event.validation.ok ? event.value : null;
}

function pushEvent(events, event) {
  if (event) events.push(event);
}

function emptyObservationState() {
  return {
    repDurationsMs: [],
    maxTrunkAngleDegrees: 0,
    maxKneeAsymmetryDegrees: 0,
    incompleteRepetitionCount: 0,
    pauseCount: 0,
    maxAsymmetryRatio: 0,
    asymmetryRepeatCount: 0,
    suspectedWeakerSideCounts: { left: 0, right: 0 },
  };
}

export function suspectedWeakerSideFromVelocities(leftVelocity, rightVelocity) {
  if (!finite(leftVelocity) || !finite(rightVelocity)) return 'UNDETERMINED';
  const leftMagnitude = Math.abs(leftVelocity);
  const rightMagnitude = Math.abs(rightVelocity);
  if (Math.abs(leftMagnitude - rightMagnitude) < 0.000001) return 'UNDETERMINED';
  return leftMagnitude < rightMagnitude ? 'LEFT' : 'RIGHT';
}

function observationSnapshot(observations) {
  const firstThree = observations.repDurationsMs.slice(0, 3);
  const lastThree = observations.repDurationsMs.slice(-3);
  const firstHalfMean = average(firstThree);
  const secondHalfMean = average(lastThree);
  const leftSideCount = observations.suspectedWeakerSideCounts.left;
  const rightSideCount = observations.suspectedWeakerSideCounts.right;
  const sideVoteCount = leftSideCount + rightSideCount;
  const suspectedWeakerSide = leftSideCount === rightSideCount
    ? 'UNDETERMINED'
    : leftSideCount > rightSideCount ? 'LEFT' : 'RIGHT';
  return {
    repetitionDurationsSeconds: observations.repDurationsMs.map((duration) => duration / 1000),
    speedChangeRatio: firstHalfMean && secondHalfMean ? secondHalfMean / firstHalfMean : null,
    maxTrunkLeanDegrees: observations.maxTrunkAngleDegrees,
    maxLeftRightKneeAngleDifferenceDegrees: observations.maxKneeAsymmetryDegrees,
    incompleteRepetitionCount: observations.incompleteRepetitionCount,
    pauseCount: observations.pauseCount,
    asymmetryRatio: observations.maxAsymmetryRatio,
    asymmetryRepeatCount: observations.asymmetryRepeatCount,
    suspectedWeakerSide,
    sideConfidence: sideVoteCount ? Math.max(leftSideCount, rightSideCount) / sideVoteCount : 0,
    suspectedWeakerSideCounts: { ...observations.suspectedWeakerSideCounts },
  };
}

export function evaluatePartialRepetitionAtEnd({
  state,
  maxProgressSinceLastSit = 0,
  config = chairStandConfig.stateMachine,
} = {}) {
  const eligibleState = !config.partialRepetitionRequiresRisingState
    || state === ChairStandMachineStates.Rising;
  if (eligibleState && maxProgressSinceLastSit >= config.partialRepetitionCreditProgressMin) {
    return {
      partialRepetitionCredit: 1,
      partialRepetitionRuleStatus: 'APPLIED',
      reasonCode: 'PARTIAL_REPETITION_AT_TIME_LIMIT',
    };
  }
  return {
    partialRepetitionCredit: 0,
    partialRepetitionRuleStatus: 'NOT_APPLICABLE',
    reasonCode: 'NO_PARTIAL_REPETITION',
  };
}

export function createChairStandStateMachine({
  sessionId,
  assessmentId = sessionId,
  config = chairStandConfig,
  startedAtMs = null,
  durationSeconds = config.durationSeconds,
  armUseOccurrenceCount = 0,
  ignoreArmUse = false,
} = {}) {
  const transitionConfig = config.stateMachine;
  let state = ChairStandMachineStates.WaitingForSit;
  let previousNonPausedState = state;
  let previousFeatures = null;
  let previousTimestampMs = null;
  let armState = null;
  let repetitionCount = 0;
  let lastRepCompletedAtMs = null;
  let currentRepStartedAtMs = null;
  let cycleStartedFromSit = false;
  let cycleReachedStand = false;
  let currentCycleIncompleteRecorded = false;
  let currentCycleMaxAsymmetryRatio = 0;
  let currentCycleSuspectedWeakerSide = 'UNDETERMINED';
  let maxProgressSinceLastSit = 0;
  let sitCandidate = null;
  let standCandidate = null;
  let observations = emptyObservationState();
  let events = [];
  let debugTimeline = [];
  let invalidReason = null;
  let completedAtMs = null;
  let armUseCount = Math.max(0, armUseOccurrenceCount);
  let armUseCdcZero = false;
  let finalPartialRepetition = null;
  let kinematicHistory = [];
  let angularVelocityHistory = [];
  let seatedScreenHipY = null;

  function updateSeatedScreenReference(features) {
    if (!finite(features?.normalizedHipY)) return;
    seatedScreenHipY = finite(seatedScreenHipY)
      ? Math.max(seatedScreenHipY, features.normalizedHipY)
      : features.normalizedHipY;
  }

  function screenRiseDistance(features) {
    if (!finite(seatedScreenHipY) || !finite(features?.normalizedHipY)) return 0;
    return seatedScreenHipY - features.normalizedHipY;
  }

  function screenStanding(features) {
    const threshold = Math.max(0.055, (features?.normalizedTorsoLength || 0) * 0.28);
    return screenRiseDistance(features) >= threshold
      && anyAngleAtLeast(features?.normalizedKneeAngles || {}, transitionConfig.standingKneeAngleMinDegrees)
      && anyAngleAtLeast(features?.normalizedHipAngles || {}, transitionConfig.standingHipAngleMinDegrees);
  }

  function screenSeated(features) {
    const threshold = Math.max(0.025, (features?.normalizedTorsoLength || 0) * 0.14);
    return finite(seatedScreenHipY)
      && finite(features?.normalizedHipY)
      && screenRiseDistance(features) <= threshold;
  }

  function transition(to, features, eventType, reasonCode = null) {
    if (state === to) return;
    const from = state;
    state = to;
    if (![ChairStandMachineStates.Paused, ChairStandMachineStates.Invalid].includes(to)) {
      previousNonPausedState = to;
    }
    pushEvent(events, createTransitionEvent({
      sessionId,
      from,
      to,
      type: eventType,
      timestampMs: features.timestampMs,
      frameId: features.frameId,
      confidence: features.landmarkConfidence.overall,
      reasonCode,
    }));
  }

  function recordDebug(features, transitionEvent = null) {
    debugTimeline.push({
      timestampMs: features?.timestampMs ?? previousTimestampMs,
      state,
      hipProgress: features?.hipProgress,
      kneeAngles: features?.kneeAngles,
      hipAngles: features?.hipAngles,
      trunkAngle: features?.trunkAngle,
      armState: armState?.state || ChairStandArmStates.Unknown,
      repetitionCount,
      transitionEvent,
    });
    if (debugTimeline.length > 600) debugTimeline = debugTimeline.slice(-500);
  }

  function snapshot(frameEvents = []) {
    return {
      assessmentId,
      sessionId,
      state,
      repetitionCount,
      armUse: ignoreArmUse
        ? ArmUseStates.NotDetected
        : armState?.state === ChairStandArmStates.ArmUseConfirmed
        ? ArmUseStates.Confirmed
        : armState?.state === ChairStandArmStates.ArmUseSuspected
          ? ArmUseStates.Suspected
          : armState?.state === ChairStandArmStates.NotMeasurable
            ? ArmUseStates.NotMeasurable
            : ArmUseStates.NotDetected,
      armState: armState?.state || ChairStandArmStates.Unknown,
      userMessage: ignoreArmUse ? null : (armState?.userMessage || null),
      armChecksIgnored: ignoreArmUse,
      latestFeatures: previousFeatures,
      events: frameEvents,
      allEvents: events.slice(),
      secondaryObservations: observationSnapshot(observations),
      debugTimeline: debugTimeline.slice(),
      invalidReason,
      armUseOccurrenceCount: armUseCount,
      armUseRestartRequired: state === ChairStandMachineStates.RestartRequired,
      armUseCdcZero,
      completedAtMs,
      partialRepetition: finalPartialRepetition || evaluatePartialRepetitionAtEnd({
        state,
        maxProgressSinceLastSit,
        config: transitionConfig,
      }),
    };
  }

  function pause(features, reasonCode = 'QUALITY_PAUSED') {
    if (state !== ChairStandMachineStates.Paused) {
      observations.pauseCount += 1;
      sitCandidate = null;
      standCandidate = null;
      transition(ChairStandMachineStates.Paused, features, AssessmentEventTypes.QualityPaused, reasonCode);
    }
  }

  function markIncompleteAttempt() {
    if (!currentCycleIncompleteRecorded) {
      observations.incompleteRepetitionCount += 1;
      currentCycleIncompleteRecorded = true;
    }
  }

  function addFrame({ poseFrame, calibrationProfile, qualityStatus } = {}) {
    const frameEventsStartIndex = events.length;
    if (TERMINAL_STATES.has(state)) return snapshot([]);
    if (!poseFrame || !qualityStatus) return snapshot([]);
    if (finite(previousTimestampMs) && poseFrame.timestampMs <= previousTimestampMs) {
      pushEvent(events, createAssessmentEvent({
        sessionId,
        assessmentType: AssessmentTypes.ChairStand30s,
        type: AssessmentEventTypes.AnalysisError,
        timestampMs: previousTimestampMs,
        frameId: poseFrame.frameId,
        reasonCode: 'NON_MONOTONIC_TIMESTAMP',
      }).value);
      return snapshot(events.slice(frameEventsStartIndex));
    }

    const features = calculateChairStandFeatures({
      poseFrame,
      calibrationProfile,
      qualityStatus,
      previousFeatures,
      previousArmState: armState,
      config,
    });
    features.rawKneeAngles = { ...features.kneeAngles };
    features.rawHipAngles = { ...features.hipAngles };
    const kinematicSample = {
      timestampMs: features.timestampMs,
      hipProgress: features.hipProgress,
      kneeAngles: { ...features.kneeAngles },
      hipAngles: { ...features.hipAngles },
    };
    kinematicHistory.push(kinematicSample);
    if (kinematicHistory.length > transitionConfig.angleMovingAverageFrames) kinematicHistory.shift();
    const smoothSide = (key, side) => average(kinematicHistory.map((item) => item[key]?.[side]));
    features.kneeAngles = { left: smoothSide('kneeAngles', 'left'), right: smoothSide('kneeAngles', 'right') };
    features.hipAngles = { left: smoothSide('hipAngles', 'left'), right: smoothSide('hipAngles', 'right') };
    kinematicSample.smoothedKneeAngles = { ...features.kneeAngles };
    const central = kinematicHistory.length >= 3 ? kinematicHistory[kinematicHistory.length - 3] : null;
    if (central && features.timestampMs > central.timestampMs) {
      const centralDt = (features.timestampMs - central.timestampMs) / 1000;
      features.verticalVelocity = (features.hipProgress - central.hipProgress) / centralDt;
      angularVelocityHistory.push({
        left: (features.kneeAngles.left - central.smoothedKneeAngles.left) / centralDt,
        right: (features.kneeAngles.right - central.smoothedKneeAngles.right) / centralDt,
      });
      if (angularVelocityHistory.length > transitionConfig.angularVelocityMovingAverageFrames) angularVelocityHistory.shift();
      features.kneeAngularVelocities = {
        left: average(angularVelocityHistory.map((item) => item.left)),
        right: average(angularVelocityHistory.map((item) => item.right)),
      };
    }
    armState = features.armState;
    if (finite(features.trunkAngle)) {
      observations.maxTrunkAngleDegrees = Math.max(observations.maxTrunkAngleDegrees, features.trunkAngle);
    }
    const kneeAsymmetry = Math.abs((features.kneeAngles.left ?? 0) - (features.kneeAngles.right ?? 0));
    if (finite(kneeAsymmetry)) {
      observations.maxKneeAsymmetryDegrees = Math.max(observations.maxKneeAsymmetryDegrees, kneeAsymmetry);
      const asymmetryRatio = features.kneeAngularVelocities
        ? Math.abs(features.kneeAngularVelocities.left - features.kneeAngularVelocities.right)
          / Math.max(Math.abs(features.kneeAngularVelocities.left), Math.abs(features.kneeAngularVelocities.right), 0.000001)
        : 0;
      observations.maxAsymmetryRatio = Math.max(observations.maxAsymmetryRatio, asymmetryRatio);
      if (asymmetryRatio >= currentCycleMaxAsymmetryRatio && features.kneeAngularVelocities) {
        currentCycleSuspectedWeakerSide = suspectedWeakerSideFromVelocities(
          features.kneeAngularVelocities.left,
          features.kneeAngularVelocities.right,
        );
      }
      currentCycleMaxAsymmetryRatio = Math.max(currentCycleMaxAsymmetryRatio, asymmetryRatio);
    }

    if (qualityStatus.state === QualityStates.Invalid) {
      invalidReason = 'QUALITY_INVALID';
      transition(ChairStandMachineStates.Invalid, features, AssessmentEventTypes.AssessmentInvalid, invalidReason);
      previousTimestampMs = poseFrame.timestampMs;
      previousFeatures = features;
      recordDebug(features, AssessmentEventTypes.AssessmentInvalid);
      return snapshot(events.slice(frameEventsStartIndex));
    }

    if (qualityStatus.state !== QualityStates.Ready || !features.valid) {
      pause(features, qualityStatus.reasons?.[0]?.code || 'LOW_LANDMARK_CONFIDENCE');
      previousTimestampMs = poseFrame.timestampMs;
      previousFeatures = features;
      recordDebug(features, AssessmentEventTypes.QualityPaused);
      return snapshot(events.slice(frameEventsStartIndex));
    }

    if (state === ChairStandMachineStates.Paused) {
      state = previousNonPausedState || ChairStandMachineStates.WaitingForSit;
      pushEvent(events, createTransitionEvent({
        sessionId,
        from: ChairStandMachineStates.Paused,
        to: state,
        type: AssessmentEventTypes.QualityResumed,
        timestampMs: features.timestampMs,
        frameId: features.frameId,
        confidence: features.landmarkConfidence.overall,
      }));
    }

    if (!ignoreArmUse && armState?.state === ChairStandArmStates.ArmUseConfirmed) {
      armUseCount += 1;
      const restartAllowed = armUseCount <= config.armUse.maximumRestartCount;
      invalidReason = restartAllowed ? 'ARM_USE_RESTART_REQUIRED' : null;
      armUseCdcZero = !restartAllowed;
      pushEvent(events, createAssessmentEvent({
        sessionId,
        assessmentType: AssessmentTypes.ChairStand30s,
        type: AssessmentEventTypes.ArmUseConfirmed,
        timestampMs: features.timestampMs,
        frameId: features.frameId,
        confidence: features.armObservation.armConfidence,
        reasonCode: 'ARM_SUPPORT_USED',
        evidence: {
          kind: EvidenceKinds.StateTransition,
          from: 'FOLDED_ARMS',
          to: 'ARM_SUPPORT_USED',
        },
      }).value);
      transition(
        restartAllowed ? ChairStandMachineStates.RestartRequired : ChairStandMachineStates.Completed,
        features,
        restartAllowed ? AssessmentEventTypes.AssessmentIncomplete : AssessmentEventTypes.AssessmentCompleted,
        restartAllowed ? invalidReason : 'ARM_USE_SECOND_OCCURRENCE_CDC_ZERO',
      );
      if (!restartAllowed) completedAtMs = features.timestampMs;
      previousTimestampMs = poseFrame.timestampMs;
      previousFeatures = features;
      recordDebug(features, AssessmentEventTypes.ArmUseConfirmed);
      return snapshot(events.slice(frameEventsStartIndex));
    }

    if (!ignoreArmUse && armState?.state === ChairStandArmStates.ArmUseSuspected) {
      pushEvent(events, createAssessmentEvent({
        sessionId,
        assessmentType: AssessmentTypes.ChairStand30s,
        type: AssessmentEventTypes.ArmUseSuspected,
        timestampMs: features.timestampMs,
        frameId: features.frameId,
        confidence: features.armObservation.armConfidence,
        reasonCode: 'KEEP_ARMS_CROSSED',
      }).value);
    }

    const sitPose = isSitPose(features, transitionConfig);
    const standPose = isStandPose(features, transitionConfig);
    sitCandidate = dwell(sitCandidate, sitPose, features.timestampMs, transitionConfig.minimumSitDwellMs);
    standCandidate = dwell(standCandidate, standPose, features.timestampMs, transitionConfig.minimumStandDwellMs);
    maxProgressSinceLastSit = Math.max(maxProgressSinceLastSit, features.hipProgress ?? 0);

    if (state === ChairStandMachineStates.WaitingForSit) {
      // The test starts with the user seated. Capture the first reliable
      // on-screen hip height so live counting does not depend on MediaPipe's
      // noisier 3D joint angles or personal calibration.
      updateSeatedScreenReference(features);
      if (sitCandidate.satisfied || finite(seatedScreenHipY)) {
        cycleStartedFromSit = true;
        cycleReachedStand = false;
        currentCycleIncompleteRecorded = false;
        currentCycleMaxAsymmetryRatio = 0;
        currentCycleSuspectedWeakerSide = 'UNDETERMINED';
        maxProgressSinceLastSit = features.hipProgress ?? 0;
        transition(ChairStandMachineStates.Sit, features, AssessmentEventTypes.SitConfirmed);
      }
    } else if (state === ChairStandMachineStates.Sit) {
      updateSeatedScreenReference(features);
      // The live counter's shortest reliable path is a confirmed seated pose
      // followed by a confirmed standing pose. Do not require calibrated hip
      // progress or a separately observed RISING frame: fast movements and
      // sparse camera frames can legitimately jump straight from SIT to STAND.
      if (standCandidate.satisfied || screenStanding(features)) {
        sitCandidate = null;
        cycleReachedStand = true;
        repetitionCount += 1;
        const durationMs = finite(currentRepStartedAtMs) ? features.timestampMs - currentRepStartedAtMs : null;
        if (finite(durationMs) && durationMs > 0) observations.repDurationsMs.push(durationMs);
        lastRepCompletedAtMs = features.timestampMs;
        pushEvent(events, createRepEvent({
          sessionId,
          timestampMs: features.timestampMs,
          frameId: features.frameId,
          confidence: features.landmarkConfidence.overall,
          durationMs,
          repetitionIndex: repetitionCount,
        }));
        transition(ChairStandMachineStates.Stand, features, AssessmentEventTypes.StandConfirmed);
      } else if (
        cycleStartedFromSit
        && features.hipProgress >= transitionConfig.sitExitProgressMin
        && Math.max(features.verticalVelocity, features.rawVerticalVelocity) > transitionConfig.minimumRisingVelocityPerSecond
        && ([features.kneeAngles.left, features.kneeAngles.right, features.rawKneeAngles.left, features.rawKneeAngles.right]
          .some((angle) => angle > transitionConfig.sittingKneeExitDegrees))
      ) {
        currentRepStartedAtMs = features.timestampMs;
        transition(ChairStandMachineStates.Rising, features, AssessmentEventTypes.RisingStarted);
      }
    } else if (state === ChairStandMachineStates.Rising) {
      if (standCandidate.satisfied) {
        if (!cycleReachedStand) {
          sitCandidate = null;
          cycleReachedStand = true;
          repetitionCount += 1;
          const durationMs = finite(currentRepStartedAtMs) ? features.timestampMs - currentRepStartedAtMs : null;
          if (finite(durationMs) && durationMs > 0) observations.repDurationsMs.push(durationMs);
          lastRepCompletedAtMs = features.timestampMs;
          pushEvent(events, createRepEvent({
            sessionId,
            timestampMs: features.timestampMs,
            frameId: features.frameId,
            confidence: features.landmarkConfidence.overall,
            durationMs,
            repetitionIndex: repetitionCount,
          }));
        }
        transition(ChairStandMachineStates.Stand, features, AssessmentEventTypes.StandConfirmed);
      } else if (
        Math.min(features.verticalVelocity, features.rawVerticalVelocity) < transitionConfig.minimumDescendingVelocityPerSecond
        && ([features.kneeAngles.left, features.kneeAngles.right, features.rawKneeAngles.left, features.rawKneeAngles.right]
          .some((angle) => angle < transitionConfig.standingKneeExitDegrees))
      ) {
        markIncompleteAttempt();
        transition(ChairStandMachineStates.Descending, features, AssessmentEventTypes.DescendingStarted, 'DESCENDING_BEFORE_STAND');
      }
    } else if (state === ChairStandMachineStates.Stand) {
      // Re-arm immediately when the seated pose is visible. Requiring a
      // separately sampled descending frame can leave a low-frame-rate live
      // session stuck in STAND after the first repetition.
      if (
        screenSeated(features)
        || anyAngleAtMost(features.rawKneeAngles, transitionConfig.sittingKneeAngleMaxDegrees)
      ) {
        standCandidate = null;
        if (currentCycleMaxAsymmetryRatio >= transitionConfig.asymmetryRatio) {
          observations.asymmetryRepeatCount += 1;
          if (currentCycleSuspectedWeakerSide === 'LEFT') observations.suspectedWeakerSideCounts.left += 1;
          if (currentCycleSuspectedWeakerSide === 'RIGHT') observations.suspectedWeakerSideCounts.right += 1;
        }
        cycleStartedFromSit = true;
        cycleReachedStand = false;
        currentCycleIncompleteRecorded = false;
        currentCycleMaxAsymmetryRatio = 0;
        currentCycleSuspectedWeakerSide = 'UNDETERMINED';
        currentRepStartedAtMs = null;
        maxProgressSinceLastSit = features.hipProgress ?? 0;
        transition(ChairStandMachineStates.Sit, features, AssessmentEventTypes.SitConfirmed);
      } else if (
        Math.min(features.verticalVelocity, features.rawVerticalVelocity) < transitionConfig.minimumDescendingVelocityPerSecond
        && ([features.kneeAngles.left, features.kneeAngles.right, features.rawKneeAngles.left, features.rawKneeAngles.right]
          .some((angle) => angle < transitionConfig.standingKneeExitDegrees))
      ) {
        transition(ChairStandMachineStates.Descending, features, AssessmentEventTypes.DescendingStarted);
      }
    } else if (state === ChairStandMachineStates.Descending) {
      if (
        Math.max(features.verticalVelocity, features.rawVerticalVelocity) > transitionConfig.minimumRisingVelocityPerSecond
        && features.hipProgress > transitionConfig.sitExitProgressMin
      ) {
        transition(ChairStandMachineStates.Rising, features, AssessmentEventTypes.RisingStarted, 'ROSE_BEFORE_SITTING');
      } else if (sitCandidate.satisfied) {
        standCandidate = null;
        if (cycleStartedFromSit && cycleReachedStand) {
          if (currentCycleMaxAsymmetryRatio >= transitionConfig.asymmetryRatio) {
            observations.asymmetryRepeatCount += 1;
            if (currentCycleSuspectedWeakerSide === 'LEFT') observations.suspectedWeakerSideCounts.left += 1;
            if (currentCycleSuspectedWeakerSide === 'RIGHT') observations.suspectedWeakerSideCounts.right += 1;
          }
        } else if (cycleStartedFromSit && !cycleReachedStand) {
          markIncompleteAttempt();
        }
        cycleStartedFromSit = true;
        cycleReachedStand = false;
        currentCycleIncompleteRecorded = false;
        currentCycleMaxAsymmetryRatio = 0;
        currentCycleSuspectedWeakerSide = 'UNDETERMINED';
        currentRepStartedAtMs = null;
        maxProgressSinceLastSit = features.hipProgress ?? 0;
        transition(ChairStandMachineStates.Sit, features, AssessmentEventTypes.SitConfirmed);
      }
    }

    previousTimestampMs = poseFrame.timestampMs;
    previousFeatures = features;
    recordDebug(features);
    return snapshot(events.slice(frameEventsStartIndex));
  }

  function finish({ completedAt = previousTimestampMs ?? Date.now() } = {}) {
    if (!TERMINAL_STATES.has(state)) {
      finalPartialRepetition = evaluatePartialRepetitionAtEnd({
        state,
        maxProgressSinceLastSit,
        config: transitionConfig,
      });
      completedAtMs = completedAt;
      const terminalState = state === ChairStandMachineStates.Invalid
        ? ChairStandMachineStates.Invalid
        : ChairStandMachineStates.Completed;
      state = terminalState;
      pushEvent(events, createAssessmentEvent({
        sessionId,
        assessmentType: AssessmentTypes.ChairStand30s,
        type: terminalState === ChairStandMachineStates.Completed
          ? AssessmentEventTypes.AssessmentCompleted
          : AssessmentEventTypes.AssessmentInvalid,
        timestampMs: completedAt,
        confidence: previousFeatures?.landmarkConfidence?.overall ?? 0,
        reasonCode: terminalState,
        evidence: {
          kind: EvidenceKinds.Duration,
          durationMs: finite(startedAtMs) ? completedAt - startedAtMs : durationSeconds * 1000,
          requiredDurationMs: durationSeconds * 1000,
        },
      }).value);
    }
    return snapshot([]);
  }

  return {
    addFrame,
    finish,
    snapshot,
    getState: () => state,
  };
}
