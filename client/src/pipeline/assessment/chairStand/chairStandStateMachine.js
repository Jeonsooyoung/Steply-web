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
  bodyScale,
  footCenter,
  hipCenter,
  landmarkByIndex,
  normalizeSittingToStandingProgress,
  shoulderCenter,
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
  return landmarkByIndex(frame, index);
}

function visible(point, minVisibility = 0.25) {
  return Boolean(point && finite(point.x) && finite(point.y) && (point.visibility ?? 0) >= minVisibility);
}

function distance(first, second) {
  if (!visible(first, 0) || !visible(second, 0)) return null;
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function angleDegrees(first, center, third) {
  if (!visible(first, 0) || !visible(center, 0) || !visible(third, 0)) return null;
  const ax = first.x - center.x;
  const ay = first.y - center.y;
  const bx = third.x - center.x;
  const by = third.y - center.y;
  const magnitude = Math.max(Math.hypot(ax, ay) * Math.hypot(bx, by), 0.000001);
  const cosine = clamp((ax * bx + ay * by) / magnitude, -1, 1);
  return Math.acos(cosine) * 180 / Math.PI;
}

function trunkAngleDegrees(frame) {
  const shoulders = shoulderCenter(frame, 0.25);
  const hips = hipCenter(frame, 0.25);
  if (!shoulders || !hips) return null;
  const dx = shoulders.x - hips.x;
  const dy = shoulders.y - hips.y;
  return Math.abs(Math.atan2(dx, dy || 0.000001) * 180 / Math.PI);
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

function footStability(frame, previousFeatures, calibrationProfile, config) {
  const left = footCenter(frame, 'left', 0.25);
  const right = footCenter(frame, 'right', 0.25);
  const previousLeft = previousFeatures?.footCenters?.left;
  const previousRight = previousFeatures?.footCenters?.right;
  const scale = bodyScale(frame);
  const footLength = calibrationProfile?.bodyScale?.averageFootLength
    || scale.averageFootLength
    || 0.08;
  const leftDelta = distance(left, previousLeft);
  const rightDelta = distance(right, previousRight);
  const normalizedDisplacement = average([
    finite(leftDelta) ? leftDelta / footLength : null,
    finite(rightDelta) ? rightDelta / footLength : null,
  ]);
  const stable = !finite(normalizedDisplacement)
    || normalizedDisplacement <= config.footStabilityMaxDisplacementFootLengths;
  return {
    stable,
    normalizedDisplacement,
    left,
    right,
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
  if (![leftShoulder, rightShoulder, leftHip, rightHip].every((item) => visible(item, 0.2))) {
    return { chest: null, thigh: null };
  }
  const shoulderWidth = distance(leftShoulder, rightShoulder) || 0.2;
  const torsoLength = distance(shoulderCenter(frame, 0.2), hipCenter(frame, 0.2)) || 0.25;
  const minX = Math.min(leftShoulder.x, rightShoulder.x) - shoulderWidth * armConfig.chestHorizontalMarginShoulderWidths;
  const maxX = Math.max(leftShoulder.x, rightShoulder.x) + shoulderWidth * armConfig.chestHorizontalMarginShoulderWidths;
  const minChestY = Math.min(leftShoulder.y, rightShoulder.y) - torsoLength * armConfig.chestVerticalMarginTorsoLengths;
  const maxChestY = Math.max(leftHip.y, rightHip.y) + torsoLength * 0.2;
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
  const foldedCandidate = chestPoints.length >= 2;
  const supportCandidate = supportPoints.length >= 1 && armConfidence >= confirmedMin;
  const outsideChestCandidate = visibleArmPoints.length > 0 && chestPoints.length < 2;
  const lowConfidence = armConfidence > 0 && armConfidence < confirmedMin;
  return {
    foldedCandidate,
    supportCandidate,
    suspectedCandidate: !supportCandidate && (outsideChestCandidate || lowConfidence),
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
  if (observation.supportCandidate) candidate = ChairStandArmStates.ArmUseConfirmed;
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
  const trunkAngle = trunkAngleDegrees(poseFrame);
  const dtSeconds = previousFeatures && finite(timestampMs) && finite(previousFeatures.timestampMs)
    ? (timestampMs - previousFeatures.timestampMs) / 1000
    : null;
  const verticalVelocity = dtSeconds && dtSeconds > 0 && finite(progressResult.sittingToStandingProgress) && finite(previousFeatures.hipProgress)
    ? (progressResult.sittingToStandingProgress - previousFeatures.hipProgress) / dtSeconds
    : 0;
  const feet = footStability(poseFrame, previousFeatures, calibrationProfile, config.stateMachine);
  const armObservation = rawArmObservation(poseFrame, config);
  const armState = updateArmState(previousArmState, armObservation, timestampMs, config);
  const landmarkConfidence = {
    overall: poseFrame?.confidence?.overall ?? 0,
    lowerBody: poseFrame?.confidence?.lowerBody ?? 0,
    feet: poseFrame?.confidence?.feet ?? 0,
    arms: armObservation.armConfidence,
  };
  const valid = (
    finite(progressResult.sittingToStandingProgress)
    && landmarkConfidence.overall >= config.stateMachine.minimumLandmarkConfidence
    && qualityStatus?.state === QualityStates.Ready
  );
  return {
    timestampMs,
    frameId: poseFrame?.frameId,
    hipProgress: progressResult.sittingToStandingProgress,
    unclampedHipProgress: progressResult.unclampedProgress,
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
    footStability: {
      stable: feet.stable,
      normalizedDisplacement: feet.normalizedDisplacement,
    },
    footCenters: {
      left: feet.left,
      right: feet.right,
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

function isSitPose(features, config) {
  return Boolean(
    features.valid
      && features.hipProgress <= config.sitEnterProgressMax
      && bothAnglesAtMost(features.kneeAngles, config.sittingKneeAngleMaxDegrees)
      && bothAnglesAtMost(features.hipAngles, config.sittingHipAngleMaxDegrees)
  );
}

function isStandPose(features, config) {
  return Boolean(
    features.valid
      && features.hipProgress >= config.standProgressMin
      && bothAnglesAtLeast(features.kneeAngles, config.standingKneeAngleMinDegrees)
      && bothAnglesAtLeast(features.hipAngles, config.standingHipAngleMinDegrees)
      && features.footStability.stable
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
  };
}

function observationSnapshot(observations) {
  const firstHalf = observations.repDurationsMs.slice(0, Math.ceil(observations.repDurationsMs.length / 2));
  const secondHalf = observations.repDurationsMs.slice(Math.ceil(observations.repDurationsMs.length / 2));
  const firstHalfMean = average(firstHalf);
  const secondHalfMean = average(secondHalf);
  return {
    repetitionDurationsSeconds: observations.repDurationsMs.map((duration) => duration / 1000),
    speedChangeRatio: firstHalfMean && secondHalfMean ? secondHalfMean / firstHalfMean : null,
    maxTrunkLeanDegrees: observations.maxTrunkAngleDegrees,
    maxLeftRightKneeAngleDifferenceDegrees: observations.maxKneeAsymmetryDegrees,
    incompleteRepetitionCount: observations.incompleteRepetitionCount,
    pauseCount: observations.pauseCount,
  };
}

export function evaluatePartialRepetitionAtEnd({
  state,
  maxProgressSinceLastSit = 0,
  config = chairStandConfig.stateMachine,
} = {}) {
  const eligibleState = !config.partialRepetitionRequiresRisingState
    || [ChairStandMachineStates.Rising, ChairStandMachineStates.Descending].includes(state);
  if (eligibleState && maxProgressSinceLastSit >= config.partialRepetitionCreditProgressMin) {
    return {
      partialRepetitionCredit: 0.5,
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
  let maxProgressSinceLastSit = 0;
  let sitCandidate = null;
  let standCandidate = null;
  let observations = emptyObservationState();
  let events = [];
  let debugTimeline = [];
  let invalidReason = null;
  let completedAtMs = null;

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
      armUse: armState?.state === ChairStandArmStates.ArmUseConfirmed
        ? ArmUseStates.Confirmed
        : armState?.state === ChairStandArmStates.ArmUseSuspected
          ? ArmUseStates.Suspected
          : armState?.state === ChairStandArmStates.NotMeasurable
            ? ArmUseStates.NotMeasurable
            : ArmUseStates.NotDetected,
      armState: armState?.state || ChairStandArmStates.Unknown,
      userMessage: armState?.userMessage || null,
      latestFeatures: previousFeatures,
      events: frameEvents,
      allEvents: events.slice(),
      secondaryObservations: observationSnapshot(observations),
      debugTimeline: debugTimeline.slice(),
      invalidReason,
      completedAtMs,
      partialRepetition: evaluatePartialRepetitionAtEnd({
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
    if (!poseFrame || !calibrationProfile || !qualityStatus) return snapshot([]);
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
    armState = features.armState;
    if (finite(features.trunkAngle)) {
      observations.maxTrunkAngleDegrees = Math.max(observations.maxTrunkAngleDegrees, features.trunkAngle);
    }
    const kneeAsymmetry = Math.abs((features.kneeAngles.left ?? 0) - (features.kneeAngles.right ?? 0));
    if (finite(kneeAsymmetry)) {
      observations.maxKneeAsymmetryDegrees = Math.max(observations.maxKneeAsymmetryDegrees, kneeAsymmetry);
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

    if (armState?.state === ChairStandArmStates.ArmUseConfirmed) {
      invalidReason = 'ARM_USE_CONFIRMED';
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
      transition(ChairStandMachineStates.Invalid, features, AssessmentEventTypes.AssessmentInvalid, invalidReason);
      previousTimestampMs = poseFrame.timestampMs;
      previousFeatures = features;
      recordDebug(features, AssessmentEventTypes.ArmUseConfirmed);
      return snapshot(events.slice(frameEventsStartIndex));
    }

    if (armState?.state === ChairStandArmStates.ArmUseSuspected) {
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
      if (sitCandidate.satisfied) {
        cycleStartedFromSit = true;
        cycleReachedStand = false;
        currentCycleIncompleteRecorded = false;
        maxProgressSinceLastSit = features.hipProgress ?? 0;
        transition(ChairStandMachineStates.Sit, features, AssessmentEventTypes.SitConfirmed);
      }
    } else if (state === ChairStandMachineStates.Sit) {
      if (
        cycleStartedFromSit
        && features.hipProgress >= transitionConfig.sitExitProgressMin
        && features.verticalVelocity >= transitionConfig.minimumRisingVelocityPerSecond
      ) {
        currentRepStartedAtMs = features.timestampMs;
        transition(ChairStandMachineStates.Rising, features, AssessmentEventTypes.RisingStarted);
      }
    } else if (state === ChairStandMachineStates.Rising) {
      if (standCandidate.satisfied) {
        cycleReachedStand = true;
        transition(ChairStandMachineStates.Stand, features, AssessmentEventTypes.StandConfirmed);
      } else if (
        features.verticalVelocity <= transitionConfig.minimumDescendingVelocityPerSecond
        && features.hipProgress < transitionConfig.standExitProgressMax
      ) {
        markIncompleteAttempt();
        transition(ChairStandMachineStates.Descending, features, AssessmentEventTypes.DescendingStarted, 'DESCENDING_BEFORE_STAND');
      }
    } else if (state === ChairStandMachineStates.Stand) {
      if (
        features.verticalVelocity <= transitionConfig.minimumDescendingVelocityPerSecond
        && features.hipProgress < transitionConfig.standExitProgressMax
      ) {
        transition(ChairStandMachineStates.Descending, features, AssessmentEventTypes.DescendingStarted);
      }
    } else if (state === ChairStandMachineStates.Descending) {
      if (
        features.verticalVelocity >= transitionConfig.minimumRisingVelocityPerSecond
        && features.hipProgress > transitionConfig.sitExitProgressMin
      ) {
        transition(ChairStandMachineStates.Rising, features, AssessmentEventTypes.RisingStarted, 'ROSE_BEFORE_SITTING');
      } else if (sitCandidate.satisfied) {
        if (
          cycleStartedFromSit
          && cycleReachedStand
          && (!finite(lastRepCompletedAtMs) || features.timestampMs - lastRepCompletedAtMs >= transitionConfig.repRefractoryMs)
        ) {
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
        } else if (cycleStartedFromSit && !cycleReachedStand) {
          markIncompleteAttempt();
        }
        cycleStartedFromSit = true;
        cycleReachedStand = false;
        currentCycleIncompleteRecorded = false;
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
