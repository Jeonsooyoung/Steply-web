import { balanceConfig } from '../../shared/config/balance.config.js';
import {
  AssessmentEventTypes,
  AssessmentTypes,
  BalanceStageStatuses,
  BalanceStages,
  EvidenceKinds,
  QualityStates,
} from '../../shared/types/index.js';
import { createAssessmentEvent } from '../events.js';
import {
  LandmarkIndexes,
  bodyScale,
  footCenter,
  landmarkByIndex,
  worldBodyScale,
  worldFootCenter,
  worldLandmarkByIndex,
} from '../../pose/coordinateMapping.js';

export const BalanceTestMachineStates = {
  Setup: 'SETUP',
  AcquiringPosition: 'ACQUIRING_POSITION',
  PositionConfirmed: 'POSITION_CONFIRMED',
  Holding: 'HOLDING',
  Passed: 'PASSED',
  Failed: 'FAILED',
  Paused: 'PAUSED',
  Invalid: 'INVALID',
  Completed: 'COMPLETED',
};

export const BalanceFailureReasons = {
  FootMoved: 'FOOT_MOVED',
  PositionLost: 'POSITION_LOST',
  LiftedFootTouchedDown: 'LIFTED_FOOT_TOUCHED_DOWN',
  SupportUsed: 'SUPPORT_USED',
  TrackingLost: 'TRACKING_LOST',
  CameraNotObservable: 'CAMERA_NOT_OBSERVABLE',
  UnableToAssumePosition: 'UNABLE_TO_ASSUME_POSITION',
  CaregiverIntervention: 'CAREGIVER_INTERVENTION',
};

export const BALANCE_STAGE_ORDER = [
  BalanceStages.SideBySide,
  BalanceStages.SemiTandem,
  BalanceStages.Tandem,
  BalanceStages.OneLeg,
];

const TERMINAL_STATES = new Set([
  BalanceTestMachineStates.Completed,
  BalanceTestMachineStates.Invalid,
]);

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value) {
  if (!finite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function average(values = []) {
  const finiteValues = values.filter(finite);
  return finiteValues.length ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length : null;
}

function point(frame, index) {
  return worldLandmarkByIndex(frame, index);
}

function normalizedPoint(frame, index) {
  return landmarkByIndex(frame?.normalizedLandmarks || [], index);
}

function visible(testPoint, minVisibility = balanceConfig.geometry.minimumVisibility) {
  return Boolean(testPoint && finite(testPoint.x) && finite(testPoint.y) && (testPoint.visibility ?? 0) >= minVisibility);
}

function distance(first, second) {
  if (!first || !second || !finite(first.x) || !finite(first.y) || !finite(second.x) || !finite(second.y)) return null;
  return Math.hypot(first.x - second.x, (first.z ?? 0) - (second.z ?? 0));
}

function vector(first, second) {
  if (!first || !second || !finite(first.x) || !finite(first.y) || !finite(second.x) || !finite(second.y)) return null;
  return { x: second.x - first.x, y: (second.z ?? 0) - (first.z ?? 0) };
}

function magnitude(item) {
  return item && finite(item.x) && finite(item.y) ? Math.hypot(item.x, item.y) : null;
}

function normalizedDot(first, second) {
  const firstMagnitude = magnitude(first);
  const secondMagnitude = magnitude(second);
  if (!firstMagnitude || !secondMagnitude) return null;
  return (first.x * second.x + first.y * second.y) / (firstMagnitude * secondMagnitude);
}

function scoreBetween(value, min, max) {
  if (!finite(value)) return 0;
  if (value >= min && value <= max) return 1;
  if (value < min) return clamp01(value / Math.max(min, 0.000001));
  return clamp01(1 - ((value - max) / Math.max(max, 0.000001)));
}

function scoreAtMost(value, max) {
  if (!finite(value)) return 0;
  if (value <= max) return 1;
  return clamp01(1 - ((value - max) / Math.max(max, 0.000001)));
}

function scoreAtLeast(value, min) {
  if (!finite(value)) return 0;
  return clamp01(value / Math.max(min, 0.000001));
}

function landmarkConfidence(points = []) {
  return average(points.map((item) => item?.visibility).filter(finite)) ?? 0;
}

function footLandmarks(frame, side) {
  const left = side === 'left';
  return {
    ankle: point(frame, left ? LandmarkIndexes.LeftAnkle : LandmarkIndexes.RightAnkle),
    heel: point(frame, left ? LandmarkIndexes.LeftHeel : LandmarkIndexes.RightHeel),
    toe: point(frame, left ? LandmarkIndexes.LeftFootIndex : LandmarkIndexes.RightFootIndex),
  };
}

function pelvisCenter(frame, minVisibility = balanceConfig.geometry.minimumVisibility) {
  const leftHip = point(frame, LandmarkIndexes.LeftHip);
  const rightHip = point(frame, LandmarkIndexes.RightHip);
  if (!visible(leftHip, minVisibility) || !visible(rightHip, minVisibility)) return null;
  return {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: average([leftHip.z, rightHip.z]),
    visibility: average([leftHip.visibility, rightHip.visibility]) ?? 0,
  };
}

function normalizedPelvisCenter(frame, minVisibility = balanceConfig.geometry.minimumVisibility) {
  const leftHip = normalizedPoint(frame, LandmarkIndexes.LeftHip);
  const rightHip = normalizedPoint(frame, LandmarkIndexes.RightHip);
  if (!visible(leftHip, minVisibility) || !visible(rightHip, minVisibility)) return null;
  return {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
  };
}

function inFrame(pointValue, margin = 0.04) {
  return Boolean(
    pointValue
      && finite(pointValue.x)
      && finite(pointValue.y)
      && pointValue.x >= margin
      && pointValue.x <= 1 - margin
      && pointValue.y >= margin
      && pointValue.y <= 1 - margin
  );
}

function footSnapshot(frame, side, minVisibility) {
  const landmarks = footLandmarks(frame, side);
  const center = worldFootCenter(frame, side, minVisibility);
  const heelToeVector = vector(landmarks.heel, landmarks.toe);
  return {
    side,
    ...landmarks,
    center,
    heelToeVector,
    confidence: landmarkConfidence([landmarks.ankle, landmarks.heel, landmarks.toe]),
    allVisible: visible(landmarks.ankle, minVisibility)
      && visible(landmarks.heel, minVisibility)
      && visible(landmarks.toe, minVisibility),
  };
}

function supportRoiContains(pointValue, roi) {
  if (!roi || !pointValue || !finite(pointValue.x) || !finite(pointValue.y)) return false;
  return pointValue.x >= roi.x
    && pointValue.x <= roi.x + roi.width
    && pointValue.y >= roi.y
    && pointValue.y <= roi.y + roi.height;
}

function supportObservation(frame, supportRoi, config) {
  if (!supportRoi && config.support.enabledWithoutRoi === false) {
    return {
      enabled: false,
      candidate: false,
      confidence: 0,
      sides: [],
    };
  }
  const leftWrist = normalizedPoint(frame, LandmarkIndexes.LeftWrist);
  const rightWrist = normalizedPoint(frame, LandmarkIndexes.RightWrist);
  const sides = [];
  if (visible(leftWrist, config.support.wristConfidenceMin) && supportRoiContains(leftWrist, supportRoi)) sides.push('left');
  if (visible(rightWrist, config.support.wristConfidenceMin) && supportRoiContains(rightWrist, supportRoi)) sides.push('right');
  return {
    enabled: true,
    candidate: sides.length > 0,
    confidence: landmarkConfidence([leftWrist, rightWrist]),
    sides,
  };
}

function caregiverInterventionObservation(frame, config) {
  const minVisibility = config.support.personLandmarkVisibilityMin;
  const leftShoulder = normalizedPoint(frame, LandmarkIndexes.LeftShoulder);
  const rightShoulder = normalizedPoint(frame, LandmarkIndexes.RightShoulder);
  const leftHip = normalizedPoint(frame, LandmarkIndexes.LeftHip);
  const rightHip = normalizedPoint(frame, LandmarkIndexes.RightHip);
  if (![leftShoulder, rightShoulder, leftHip, rightHip].every((item) => visible(item, minVisibility))) {
    return { candidate: false, personIndex: null, wristSide: null };
  }
  const roi = {
    minX: Math.min(leftShoulder.x, rightShoulder.x, leftHip.x, rightHip.x),
    maxX: Math.max(leftShoulder.x, rightShoulder.x, leftHip.x, rightHip.x),
    minY: Math.min(leftShoulder.y, rightShoulder.y),
    maxY: Math.max(leftHip.y, rightHip.y),
  };
  for (let personIndex = 0; personIndex < (frame?.secondaryPeople || []).length; personIndex += 1) {
    const landmarks = frame.secondaryPeople[personIndex].normalizedLandmarks || [];
    for (const [wristSide, index] of [['left', LandmarkIndexes.LeftWrist], ['right', LandmarkIndexes.RightWrist]]) {
      const wrist = landmarkByIndex(landmarks, index);
      if (visible(wrist, minVisibility) && wrist.x >= roi.minX && wrist.x <= roi.maxX && wrist.y >= roi.minY && wrist.y <= roi.maxY) {
        return { candidate: true, personIndex: personIndex + 2, wristSide, torsoRoi: roi };
      }
    }
  }
  return { candidate: false, personIndex: null, wristSide: null, torsoRoi: roi };
}

function footReferenceFromCalibration(calibrationProfile) {
  return calibrationProfile?.references?.neutralFootPosition || null;
}

function normalizedFootPositions(features) {
  return {
    left: features.left.center,
    right: features.right.center,
  };
}

function displacementFromBaseline(current, baseline, footLength) {
  if (!current || !baseline || !footLength) return null;
  return distance(current, baseline) / footLength;
}

function footLiftFromBaseline(currentFoot, baselineFoot, footLength) {
  if (!currentFoot || !baselineFoot || !footLength) return null;
  const heelDelta = finite(currentFoot.heel?.y) && finite(baselineFoot.heel?.y)
    ? Math.abs(currentFoot.heel.y - baselineFoot.heel.y)
    : null;
  const toeDelta = finite(currentFoot.toe?.y) && finite(baselineFoot.toe?.y)
    ? Math.abs(currentFoot.toe.y - baselineFoot.toe.y)
    : null;
  const centerDelta = finite(currentFoot.center?.y) && finite(baselineFoot.center?.y)
    ? Math.abs(currentFoot.center.y - baselineFoot.center.y)
    : null;
  return average([heelDelta, toeDelta, centerDelta]) / footLength;
}

function calibrationFootBaseline(calibrationProfile, fallbackFeatures) {
  const reference = footReferenceFromCalibration(calibrationProfile);
  if (reference?.left?.center && reference?.right?.center) {
    return reference;
  }
  if (reference?.left?.x !== undefined && reference?.right?.x !== undefined) {
    return {
      left: { center: reference.left },
      right: { center: reference.right },
    };
  }
  return {
    left: {
      center: fallbackFeatures?.left?.center,
      heel: fallbackFeatures?.left?.heel,
      toe: fallbackFeatures?.left?.toe,
    },
    right: {
      center: fallbackFeatures?.right?.center,
      heel: fallbackFeatures?.right?.heel,
      toe: fallbackFeatures?.right?.toe,
    },
  };
}

function calculateObservability({
  frame,
  left,
  right,
  footLength,
  qualityStatus,
  calibrationProfile,
  config,
}) {
  const min = config.camera.minFootLandmarkConfidence;
  const heelsVisible = visible(left.heel, min) && visible(right.heel, min);
  const toesVisible = visible(left.toe, min) && visible(right.toe, min);
  const anklesVisible = visible(left.ankle, min) && visible(right.ankle, min);
  const leftVectorVertical = magnitude(left.heelToeVector) ? Math.abs(left.heelToeVector.y) / magnitude(left.heelToeVector) : 0;
  const rightVectorVertical = magnitude(right.heelToeVector) ? Math.abs(right.heelToeVector.y) / magnitude(right.heelToeVector) : 0;
  const vectorObservability = average([leftVectorVertical, rightVectorVertical]) ?? 0;
  const footCenterDistance = left.center && right.center ? distance(left.center, right.center) / footLength : 0;
  const occlusionScore = footCenterDistance <= config.camera.maxFootOcclusionCenterDistanceFootLengths ? 0 : 1;
  const qualityObservable = qualityStatus?.footPlacementObservable === true
    || qualityStatus?.camera?.footPlaneObservableScore >= config.camera.minFootPlaneObservableScore;
  const calibrationAngle = calibrationProfile?.camera?.estimatedAngleDegrees;
  const cameraView = calibrationProfile?.camera?.view || qualityStatus?.camera?.view || 'UNKNOWN';
  const cameraAngleObservable = cameraView !== 'FRONT'
    && (!finite(calibrationAngle) || calibrationAngle >= config.camera.minimumObliqueAngleDegrees);
  const footPlaneScore = Math.min(
    vectorObservability / config.camera.minFootVectorVerticalComponent,
    qualityObservable || cameraAngleObservable ? 1 : config.camera.observabilityFallbackScore,
  );
  const footConfidence = average([left.confidence, right.confidence]) ?? 0;
  const allFootLandmarksVisible = heelsVisible && toesVisible && anklesVisible;
  const placementObservable = allFootLandmarksVisible
    && footConfidence >= config.camera.minFootLandmarkConfidence
    && footPlaneScore >= config.camera.minFootPlaneObservableScore
    && occlusionScore > 0;
  const reasons = [];
  if (!allFootLandmarksVisible || footConfidence < config.camera.minFootLandmarkConfidence) {
    reasons.push({
      code: 'FOOT_LANDMARKS_NOT_VISIBLE',
      userMessage: config.camera.feetVisibleUserMessage,
    });
  }
  if (allFootLandmarksVisible && footPlaneScore < config.camera.minFootPlaneObservableScore) {
    reasons.push({
      code: 'FOOT_PLANE_NOT_OBSERVABLE',
      userMessage: config.camera.ambiguousUserMessage,
    });
  }
  if (occlusionScore <= 0) {
    reasons.push({
      code: 'FEET_OCCLUDED',
      userMessage: config.camera.ambiguousUserMessage,
    });
  }
  return {
    heelsVisible,
    toesVisible,
    anklesVisible,
    footConfidence,
    vectorObservability,
    footPlaneScore: clamp01(footPlaneScore),
    occlusionScore,
    placementObservable,
    cameraView,
    cameraAngleObservable,
    reasons,
    userMessage: reasons[0]?.userMessage || null,
    frameMirrored: Boolean(frame?.image?.mirrored),
  };
}

function calculateBalanceFeatures({
  poseFrame,
  calibrationProfile,
  qualityStatus,
  supportRoi = null,
  config = balanceConfig,
} = {}) {
  const left = footSnapshot(poseFrame, 'left', config.camera.minFootLandmarkConfidence);
  const right = footSnapshot(poseFrame, 'right', config.camera.minFootLandmarkConfidence);
  const scale = worldBodyScale(poseFrame);
  const measuredFootLength = average([
    distance(left.heel, left.toe),
    distance(right.heel, right.toe),
  ]);
  const footLength = calibrationProfile?.bodyScale?.averageFootLength
    || measuredFootLength
    || scale.averageFootLength
    || config.geometry.fallbackFootLengthMeters;
  const leftRightCenterDistance = left.center && right.center ? distance(left.center, right.center) : null;
  const ankleDistance = visible(left.ankle, 0) && visible(right.ankle, 0) ? distance(left.ankle, right.ankle) : null;
  const anteriorPosteriorSeparation = visible(left.ankle, 0) && visible(right.ankle, 0)
    ? Math.abs(left.ankle.z - right.ankle.z) : null;
  const lateralSeparation = visible(left.ankle, 0) && visible(right.ankle, 0)
    ? Math.abs(left.ankle.x - right.ankle.x) : null;
  const heelToeGap = Math.min(
    distance(left.heel, right.toe) ?? Number.POSITIVE_INFINITY,
    distance(right.heel, left.toe) ?? Number.POSITIVE_INFINITY,
  );
  const parallelRaw = normalizedDot(left.heelToeVector, right.heelToeVector);
  const parallelScore = finite(parallelRaw) ? Math.abs(parallelRaw) : 0;
  const pelvis = pelvisCenter(poseFrame, config.geometry.minimumVisibility);
  const normalizedPelvis = normalizedPelvisCenter(poseFrame, config.geometry.minimumVisibility);
  const baseline = calibrationFootBaseline(calibrationProfile, { left, right });
  const leftLift = footLiftFromBaseline(left, baseline.left, footLength);
  const rightLift = footLiftFromBaseline(right, baseline.right, footLength);
  const leftBaselineMove = displacementFromBaseline(left.center, baseline.left?.center, footLength);
  const rightBaselineMove = displacementFromBaseline(right.center, baseline.right?.center, footLength);
  const support = supportObservation(poseFrame, supportRoi, config);
  const caregiverIntervention = caregiverInterventionObservation(poseFrame, config);
  const observability = calculateObservability({
    frame: poseFrame,
    left,
    right,
    footLength,
    qualityStatus,
    calibrationProfile,
    config,
  });
  const normalized = {
    ankleDistance: ankleDistance / footLength,
    footCenterDistance: leftRightCenterDistance / footLength,
    anteriorPosteriorSeparation: anteriorPosteriorSeparation / footLength,
    lateralSeparation: lateralSeparation / footLength,
    heelToToeGap: finite(heelToeGap) ? heelToeGap / footLength : null,
    leftLift,
    rightLift,
    leftBaselineMove,
    rightBaselineMove,
  };
  const footConfidence = observability.footConfidence;
  const ankleVerticalDifference = visible(left.ankle, 0) && visible(right.ankle, 0)
    ? (left.ankle.y - right.ankle.y) / footLength : 0;
  normalized.leftLift = ankleVerticalDifference;
  normalized.rightLift = -ankleVerticalDifference;
  const maxFootLift = Math.max(normalized.leftLift ?? 0, normalized.rightLift ?? 0);
  const minFootLift = Math.min(normalized.leftLift ?? 0, normalized.rightLift ?? 0);
  const footLiftDominance = maxFootLift - minFootLift;
  const twoFootContactScore = finite(footLiftDominance)
    ? scoreAtMost(
      footLiftDominance,
      config.position.oneLeg.liftedFootMinHeightFootLengths * config.geometry.twoFootContactLiftFraction,
    )
    : 1;
  const sideBySideScore = twoFootContactScore > 0
    && normalized.anteriorPosteriorSeparation <= config.position.sideBySide.anteriorPosteriorMaxFootLengths
    && normalized.lateralSeparation <= config.position.sideBySide.lateralMaxFootLengths ? 1 : 0;
  const semiTandemScore = twoFootContactScore > 0
    && normalized.anteriorPosteriorSeparation >= config.position.semiTandem.anteriorPosteriorMinFootLengths
    && normalized.anteriorPosteriorSeparation <= config.position.semiTandem.anteriorPosteriorMaxFootLengths
    && normalized.lateralSeparation <= config.position.semiTandem.lateralMaxFootLengths ? 1 : 0;
  const tandemScore = twoFootContactScore > 0
    && normalized.anteriorPosteriorSeparation >= config.position.tandem.anteriorPosteriorMinFootLengths
    && normalized.anteriorPosteriorSeparation <= config.position.tandem.anteriorPosteriorMaxFootLengths
    && normalized.lateralSeparation <= config.position.tandem.lateralMaxFootLengths
    && normalized.heelToToeGap <= config.position.tandem.heelToeGapMaxFootLengths ? 1 : 0;
  const leftSupportStable = scoreAtMost(
    normalized.leftBaselineMove,
    config.position.oneLeg.supportFootMaxMovementFootLengths,
  );
  const rightSupportStable = scoreAtMost(
    normalized.rightBaselineMove,
    config.position.oneLeg.supportFootMaxMovementFootLengths,
  );
  const oneLegLeftLiftedScore = Math.min(
    normalized.leftLift >= config.position.oneLeg.liftedFootMinHeightFootLengths ? 1 : 0,
    rightSupportStable >= 1 ? 1 : 0,
    inFrame(normalizedPelvis, config.position.oneLeg.pelvisInFrameMargin) ? 1 : 0,
  );
  const oneLegRightLiftedScore = Math.min(
    normalized.rightLift >= config.position.oneLeg.liftedFootMinHeightFootLengths ? 1 : 0,
    leftSupportStable >= 1 ? 1 : 0,
    inFrame(normalizedPelvis, config.position.oneLeg.pelvisInFrameMargin) ? 1 : 0,
  );
  const oneLegScore = Math.max(oneLegLeftLiftedScore, oneLegRightLiftedScore);
  const liftedFoot = oneLegLeftLiftedScore >= oneLegRightLiftedScore ? 'left' : 'right';
  const supportFoot = liftedFoot === 'left' ? 'right' : 'left';

  return {
    timestampMs: poseFrame?.timestampMs,
    frameId: poseFrame?.frameId,
    left,
    right,
    pelvis,
    normalizedPelvis,
    footLength,
    normalized,
    parallelScore,
    anteriorPosteriorOrder: finite(left.center?.y) && finite(right.center?.y)
      ? (left.center.y < right.center.y ? 'LEFT_AHEAD_IN_IMAGE' : 'RIGHT_AHEAD_IN_IMAGE')
      : 'UNKNOWN',
    footConfidence,
    observability,
    scores: {
      [BalanceStages.SideBySide]: sideBySideScore,
      [BalanceStages.SemiTandem]: semiTandemScore,
      [BalanceStages.Tandem]: tandemScore,
      [BalanceStages.OneLeg]: oneLegScore,
    },
    oneLeg: {
      liftedFoot,
      supportFoot,
      leftLift: normalized.leftLift,
      rightLift: normalized.rightLift,
      leftSupportStable,
      rightSupportStable,
    },
    support,
    caregiverIntervention,
    valid: qualityStatus?.state === QualityStates.Ready
      && observability.footConfidence >= config.position.minimumFootConfidence,
  };
}

function bestCompetingScore(scores, targetStage) {
  return Math.max(
    0,
    ...Object.entries(scores)
      .filter(([stage]) => stage !== targetStage)
      .map(([, score]) => score),
  );
}

function targetPositionMatched(features, targetStage, config) {
  const targetScore = features.scores[targetStage] ?? 0;
  const competitor = bestCompetingScore(features.scores, targetStage);
  const scoreMargin = targetScore - competitor;
  const matched = targetScore === 1
    && features.footConfidence >= config.position.minimumFootConfidence;
  return {
    matched,
    targetScore,
    competitor,
    scoreMargin,
    reasonCode: matched ? null : 'POSITION_SCORE_AMBIGUOUS',
    userMessage: matched ? null : config.camera.positionGuideUserMessage,
  };
}

function positionSnapshot(features) {
  return {
    footPositions: normalizedFootPositions(features),
    left: {
      center: features.left.center,
      ankle: features.left.ankle,
      heel: features.left.heel,
      toe: features.left.toe,
    },
    right: {
      center: features.right.center,
      ankle: features.right.ankle,
      heel: features.right.heel,
      toe: features.right.toe,
    },
    pelvis: features.pelvis,
    oneLeg: features.oneLeg,
    scores: features.scores,
  };
}

function createEvent({
  sessionId,
  type,
  timestampMs,
  frameId,
  confidence,
  reasonCode,
  evidence,
}) {
  const result = createAssessmentEvent({
    sessionId,
    assessmentType: AssessmentTypes.FourStageBalance,
    type,
    timestampMs,
    frameId,
    confidence,
    reasonCode,
    evidence,
  });
  return result.validation.ok ? result.value : null;
}

function pushEvent(events, event) {
  if (event) events.push(event);
}

function transitionEvidence(from, to) {
  return { kind: EvidenceKinds.StateTransition, from, to };
}

function distanceEvidence(value, required) {
  return {
    kind: EvidenceKinds.Distance,
    normalizedValue: finite(value) ? value : 0,
    requiredMax: required,
  };
}

function durationEvidence(durationMs, requiredDurationMs) {
  return {
    kind: EvidenceKinds.Duration,
    durationMs: finite(durationMs) ? durationMs : 0,
    requiredDurationMs,
  };
}

function stageStatus(stage, currentStage, status) {
  if (stage.stage === currentStage) return status;
  return stage.status;
}

function initialStages() {
  return BALANCE_STAGE_ORDER.map((stage) => ({
    stage,
    status: BalanceStageStatuses.NotAttempted,
    positionConfidence: 0,
    holdDurationSeconds: 0,
    onsetLatencyMs: null,
    sway: null,
  }));
}

function userMessageForState(state, latestMatch, config) {
  if (state === BalanceTestMachineStates.Holding) return 'Great. Hold this position for 10 seconds.';
  if (state === BalanceTestMachineStates.Paused) return 'Tracking paused. Return to the marked position.';
  return latestMatch?.userMessage || null;
}

export function createBalanceTestStateMachine({
  sessionId,
  assessmentId = sessionId,
  config = balanceConfig,
  supportRoi = null,
  startedAtMs = null,
} = {}) {
  let state = BalanceTestMachineStates.Setup;
  let previousNonPausedState = state;
  let currentStageIndex = 0;
  let stages = initialStages();
  let previousTimestampMs = null;
  let latestFeatures = null;
  let latestMatch = null;
  let positionCandidateSinceMs = null;
  let holdStartedAtMs = null;
  let holdBaseline = null;
  let holdPausedMs = 0;
  let pauseStartedAtMs = null;
  let footMoveSinceMs = null;
  let positionLostSinceMs = null;
  let supportSinceMs = null;
  let touchDownSinceMs = null;
  let events = [];
  let debugTimeline = [];
  let failureReason = null;
  let completedAtMs = null;
  let swayObservation = {
    pelvisPathLengthFootLengths: 0,
    lastPelvis: null,
    invalidatedByCameraMotion: false,
    pelvisSamples: [],
  };
  let acquisitionStartedAtMs = startedAtMs;

  function currentStage() {
    return BALANCE_STAGE_ORDER[currentStageIndex];
  }

  function setStageStatus(status, features, holdMs = 0) {
    stages = stages.map((stage) => (stage.stage === currentStage()
      ? {
        ...stage,
        status,
        positionConfidence: features?.scores?.[currentStage()] ?? stage.positionConfidence,
        holdDurationSeconds: holdMs / 1000,
        sway: finite(holdStartedAtMs) ? swayMetrics() : stage.sway,
        ...(failureReason ? { failureReason } : {}),
      }
      : stage));
  }

  function transition(to, features, type, reasonCode = null, evidence = null) {
    if (state === to && type !== AssessmentEventTypes.PositionConfirmed) return;
    const from = state;
    state = to;
    if (![BalanceTestMachineStates.Paused, BalanceTestMachineStates.Invalid].includes(to)) {
      previousNonPausedState = to;
    }
    pushEvent(events, createEvent({
      sessionId,
      type,
      timestampMs: features?.timestampMs ?? previousTimestampMs ?? startedAtMs ?? Date.now(),
      frameId: features?.frameId,
      confidence: features?.footConfidence,
      reasonCode,
      evidence: evidence || transitionEvidence(from, to),
    }));
  }

  function recordDebug(features, eventType = null) {
    debugTimeline.push({
      timestampMs: features?.timestampMs ?? previousTimestampMs,
      state,
      stage: currentStage(),
      scores: features?.scores,
      footConfidence: features?.footConfidence,
      observability: features?.observability,
      holdElapsedMs: holdElapsedAt(features?.timestampMs ?? previousTimestampMs),
      eventType,
    });
    if (debugTimeline.length > 600) debugTimeline = debugTimeline.slice(-500);
  }

  function holdElapsedAt(timestampMs) {
    if (!finite(holdStartedAtMs) || !finite(timestampMs)) return 0;
    return Math.max(0, timestampMs - holdStartedAtMs - holdPausedMs);
  }

  function pause(features, reasonCode = BalanceFailureReasons.TrackingLost) {
    if (state !== BalanceTestMachineStates.Paused) {
      pauseStartedAtMs = features.timestampMs;
      transition(BalanceTestMachineStates.Paused, features, AssessmentEventTypes.TrackingLost, reasonCode, {
        kind: EvidenceKinds.Quality,
        qualityState: QualityStates.Paused,
        reasons: [{ code: reasonCode }],
      });
    }
  }

  function resume(features) {
    if (state !== BalanceTestMachineStates.Paused) return;
    if (finite(pauseStartedAtMs)) {
      holdPausedMs += Math.max(0, features.timestampMs - pauseStartedAtMs);
    }
    pauseStartedAtMs = null;
    state = previousNonPausedState || BalanceTestMachineStates.AcquiringPosition;
    pushEvent(events, createEvent({
      sessionId,
      type: AssessmentEventTypes.QualityResumed,
      timestampMs: features.timestampMs,
      frameId: features.frameId,
      confidence: features.footConfidence,
      reasonCode: 'TRACKING_RECOVERED',
      evidence: transitionEvidence(BalanceTestMachineStates.Paused, state),
    }));
  }

  function fail(features, reasonCode, eventType, evidence) {
    failureReason = reasonCode;
    const elapsedMs = holdElapsedAt(features.timestampMs);
    setStageStatus(BalanceStageStatuses.Failed, features, elapsedMs);
    pushEvent(events, createEvent({
      sessionId,
      type: eventType,
      timestampMs: features.timestampMs,
      frameId: features.frameId,
      confidence: features.footConfidence,
      reasonCode,
      evidence,
    }));
    transition(BalanceTestMachineStates.Failed, features, AssessmentEventTypes.HoldFailed, reasonCode, durationEvidence(elapsedMs, config.hold.targetHoldMs));
  }

  function updateSway(features) {
    if (!features?.pelvis || !holdBaseline?.pelvis || state !== BalanceTestMachineStates.Holding) return;
    const leftShift = displacementFromBaseline(features.left.center, holdBaseline.left.center, features.footLength);
    const rightShift = displacementFromBaseline(features.right.center, holdBaseline.right.center, features.footLength);
    if (
      leftShift > config.hold.cameraMotionFootShiftFootLengths
      && rightShift > config.hold.cameraMotionFootShiftFootLengths
    ) {
      swayObservation.invalidatedByCameraMotion = true;
      return;
    }
    if (swayObservation.lastPelvis) {
      const pelvisDelta = distance(features.pelvis, swayObservation.lastPelvis) / features.footLength;
      if (finite(pelvisDelta)) swayObservation.pelvisPathLengthFootLengths += pelvisDelta;
    }
    swayObservation.lastPelvis = features.pelvis;
    swayObservation.pelvisSamples.push({
      timestampMs: features.timestampMs,
      ml: features.pelvis.x,
      ap: features.pelvis.z,
    });
  }

  function rms(values = []) {
    if (!values.length) return null;
    const mean = average(values);
    return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
  }

  function planarRms(samples = []) {
    if (!samples.length) return null;
    const meanMl = average(samples.map((sample) => sample.ml));
    const meanAp = average(samples.map((sample) => sample.ap));
    return Math.sqrt(average(samples.map((sample) => (
      (sample.ml - meanMl) ** 2 + (sample.ap - meanAp) ** 2
    ))));
  }

  function swayMetrics() {
    const samples = swayObservation.pelvisSamples || [];
    const initial = samples.filter((sample) => sample.timestampMs - holdStartedAtMs <= config.sway.initialWindowMs);
    const stationary = samples.filter((sample) => sample.timestampMs - holdStartedAtMs > config.sway.staticWindowStartMs);
    const mlRms = rms(samples.map((sample) => sample.ml));
    const apRms = rms(samples.map((sample) => sample.ap));
    const initialRms = planarRms(initial);
    const staticRms = planarRms(stationary);
    return {
      observationId: `sway-${assessmentId}-${currentStage()}`,
      type: 'MEDIOLATERAL_SWAY_PATTERN',
      confidence: latestFeatures?.footConfidence ?? 0,
      evidenceEventIds: [],
      affectsClinicalScore: false,
      mlRms,
      apRms,
      initialRms,
      staticRms,
      ratios: {
        initialToStatic: finite(initialRms) && staticRms > 0 ? initialRms / staticRms : null,
        mlToAp: finite(mlRms) && apRms > 0 ? mlRms / apRms : null,
      },
    };
  }

  function startHold(features) {
    holdStartedAtMs = features.timestampMs;
    holdPausedMs = 0;
    pauseStartedAtMs = null;
    footMoveSinceMs = null;
    positionLostSinceMs = null;
    supportSinceMs = null;
    touchDownSinceMs = null;
    holdBaseline = positionSnapshot(features);
    stages = stages.map((stage) => stage.stage === currentStage()
      ? { ...stage, onsetLatencyMs: Math.max(0, features.timestampMs - acquisitionStartedAtMs) }
      : stage);
    swayObservation = {
      pelvisPathLengthFootLengths: 0,
      lastPelvis: features.pelvis,
      invalidatedByCameraMotion: false,
      pelvisSamples: [],
    };
    transition(BalanceTestMachineStates.PositionConfirmed, features, AssessmentEventTypes.PositionConfirmed, currentStage(), {
      kind: EvidenceKinds.StateTransition,
      from: BalanceTestMachineStates.AcquiringPosition,
      to: BalanceTestMachineStates.PositionConfirmed,
    });
    transition(BalanceTestMachineStates.Holding, features, AssessmentEventTypes.HoldStarted, currentStage(), durationEvidence(0, config.hold.targetHoldMs));
  }

  function maybePass(features) {
    const elapsedMs = holdElapsedAt(features.timestampMs);
    if (elapsedMs < config.hold.targetHoldMs) return false;
    setStageStatus(BalanceStageStatuses.Passed, features, config.hold.targetHoldMs);
    transition(BalanceTestMachineStates.Passed, features, AssessmentEventTypes.HoldCompleted, currentStage(), durationEvidence(config.hold.targetHoldMs, config.hold.targetHoldMs));
    return true;
  }

  function holdingFailure(features, matched) {
    const current = { left: features.left.ankle, right: features.right.ankle };

    if (currentStage() === BalanceStages.OneLeg) {
      const liftedFoot = holdBaseline?.oneLeg?.liftedFoot;
      const currentLift = liftedFoot === 'left' ? features.oneLeg.leftLift : features.oneLeg.rightLift;
      if (currentLift < config.hold.liftedFootTouchDownThreshold) {
        touchDownSinceMs = touchDownSinceMs ?? features.timestampMs;
      } else {
        touchDownSinceMs = null;
      }
      if (touchDownSinceMs !== null && features.timestampMs - touchDownSinceMs >= config.hold.liftedFootTouchDownDwellMs) {
        return {
          eventType: AssessmentEventTypes.LiftedFootTouchedDown,
          reasonCode: BalanceFailureReasons.LiftedFootTouchedDown,
          evidence: distanceEvidence(currentLift, config.position.oneLeg.liftedFootMinHeightFootLengths),
        };
      }
    }

    if (features.caregiverIntervention?.candidate) {
      return {
        eventType: AssessmentEventTypes.SupportUsed,
        reasonCode: BalanceFailureReasons.CaregiverIntervention,
        evidence: { kind: EvidenceKinds.StateTransition, from: 'NO_INTERVENTION', to: 'SECOND_PERSON_WRIST_IN_TORSO_ROI' },
      };
    }

    const leftMove = displacementFromBaseline(current.left, holdBaseline?.left?.ankle, features.footLength);
    const rightMove = displacementFromBaseline(current.right, holdBaseline?.right?.ankle, features.footLength);
    const supportFoot = currentStage() === BalanceStages.OneLeg ? holdBaseline?.oneLeg?.supportFoot : null;
    const relevantMoves = supportFoot === 'left' ? [leftMove] : supportFoot === 'right' ? [rightMove] : [leftMove, rightMove];
    const maxMove = Math.max(0, ...relevantMoves.filter(finite));
    const simultaneousFootShift = leftMove > config.hold.cameraMotionFootShiftFootLengths
      && rightMove > config.hold.cameraMotionFootShiftFootLengths;
    if (
      maxMove > config.hold.footMoveDistanceFootLengths
      && maxMove > config.hold.jitterIgnoreDistanceFootLengths
      && !simultaneousFootShift
      && features.footConfidence >= config.position.minimumFootConfidence
    ) {
      footMoveSinceMs = footMoveSinceMs ?? features.timestampMs;
    } else {
      footMoveSinceMs = null;
    }
    if (footMoveSinceMs !== null && features.timestampMs - footMoveSinceMs >= config.hold.footMoveDwellMs) {
      return {
        eventType: AssessmentEventTypes.FootMoved,
        reasonCode: BalanceFailureReasons.FootMoved,
        evidence: distanceEvidence(maxMove, config.hold.footMoveDistanceFootLengths),
      };
    }

    if (!matched.matched) {
      positionLostSinceMs = positionLostSinceMs ?? features.timestampMs;
    } else {
      positionLostSinceMs = null;
    }
    if (positionLostSinceMs !== null && features.timestampMs - positionLostSinceMs >= config.hold.positionLostDwellMs) {
      return {
        eventType: AssessmentEventTypes.PositionLost,
        reasonCode: BalanceFailureReasons.PositionLost,
        evidence: {
          kind: EvidenceKinds.Distance,
          normalizedValue: matched.targetScore ?? 0,
          requiredMin: config.position.minimumTargetScore,
        },
      };
    }

    if (features.support.enabled && features.support.candidate) {
      supportSinceMs = supportSinceMs ?? features.timestampMs;
    } else {
      supportSinceMs = null;
    }
    if (supportSinceMs !== null && features.timestampMs - supportSinceMs >= config.support.roiDwellMs) {
      return {
        eventType: AssessmentEventTypes.SupportUsed,
        reasonCode: BalanceFailureReasons.SupportUsed,
        evidence: {
          kind: EvidenceKinds.StateTransition,
          from: 'NO_SUPPORT',
          to: 'SUPPORT_ROI_CONTACT',
        },
      };
    }
    return null;
  }

  function addFrame({ poseFrame, calibrationProfile, qualityStatus } = {}) {
    const frameEventsStartIndex = events.length;
    if (TERMINAL_STATES.has(state)) return snapshot([]);
    if (!poseFrame || !calibrationProfile || !qualityStatus) return snapshot([]);
    if (finite(previousTimestampMs) && poseFrame.timestampMs <= previousTimestampMs) {
      pushEvent(events, createEvent({
        sessionId,
        type: AssessmentEventTypes.AnalysisError,
        timestampMs: previousTimestampMs,
        frameId: poseFrame.frameId,
        confidence: 0,
        reasonCode: 'NON_MONOTONIC_TIMESTAMP',
      }));
      return snapshot(events.slice(frameEventsStartIndex));
    }

    const features = calculateBalanceFeatures({
      poseFrame,
      calibrationProfile,
      qualityStatus,
      supportRoi,
      config,
    });
    latestFeatures = features;
    previousTimestampMs = poseFrame.timestampMs;

    if (qualityStatus.state === QualityStates.Invalid) {
      failureReason = BalanceFailureReasons.TrackingLost;
      setStageStatus(BalanceStageStatuses.Invalid, features, holdElapsedAt(features.timestampMs));
      transition(BalanceTestMachineStates.Invalid, features, AssessmentEventTypes.AssessmentInvalid, failureReason, {
        kind: EvidenceKinds.Quality,
        qualityState: QualityStates.Invalid,
        reasons: qualityStatus.reasons || [],
      });
      recordDebug(features, AssessmentEventTypes.AssessmentInvalid);
      return snapshot(events.slice(frameEventsStartIndex));
    }

    if (qualityStatus.state !== QualityStates.Ready) {
      pause(features, BalanceFailureReasons.TrackingLost);
      recordDebug(features, AssessmentEventTypes.TrackingLost);
      return snapshot(events.slice(frameEventsStartIndex));
    }

    resume(features);

    if (state === BalanceTestMachineStates.Holding && !features.valid) {
      pause(features, BalanceFailureReasons.TrackingLost);
      recordDebug(features, AssessmentEventTypes.TrackingLost);
      return snapshot(events.slice(frameEventsStartIndex));
    }

    if (state === BalanceTestMachineStates.Setup) {
      acquisitionStartedAtMs = features.timestampMs;
      setStageStatus(BalanceStageStatuses.NotAttempted, features, 0);
      transition(BalanceTestMachineStates.AcquiringPosition, features, AssessmentEventTypes.PoseAcquired, 'SETUP_READY', transitionEvidence(BalanceTestMachineStates.Setup, BalanceTestMachineStates.AcquiringPosition));
    }

    const matched = targetPositionMatched(features, currentStage(), config);
    latestMatch = matched;
    updateSway(features);

    if (state === BalanceTestMachineStates.AcquiringPosition || state === BalanceTestMachineStates.PositionConfirmed) {
      if (features.timestampMs - acquisitionStartedAtMs >= config.positionEntryTimeoutMs) {
        fail(features, BalanceFailureReasons.UnableToAssumePosition, AssessmentEventTypes.HoldFailed, durationEvidence(features.timestampMs - acquisitionStartedAtMs, config.positionEntryTimeoutMs));
        recordDebug(features, AssessmentEventTypes.HoldFailed);
        return snapshot(events.slice(frameEventsStartIndex));
      }
      if (matched.matched) {
        positionCandidateSinceMs = positionCandidateSinceMs ?? features.timestampMs;
        if (features.timestampMs - positionCandidateSinceMs >= config.position.confirmationDwellMs) {
          startHold(features);
        }
      } else {
        positionCandidateSinceMs = null;
      }
    } else if (state === BalanceTestMachineStates.Holding) {
      const failure = holdingFailure(features, matched);
      if (failure) {
        fail(features, failure.reasonCode, failure.eventType, failure.evidence);
      } else {
        maybePass(features);
      }
    }

    recordDebug(features);
    return snapshot(events.slice(frameEventsStartIndex));
  }

  function advanceToNextStage() {
    if (state !== BalanceTestMachineStates.Passed) {
      return {
        ok: false,
        reasonCode: 'CURRENT_STAGE_NOT_PASSED',
        snapshot: snapshot([]),
      };
    }
    if (currentStageIndex >= BALANCE_STAGE_ORDER.length - 1) {
      completedAtMs = previousTimestampMs ?? Date.now();
      transition(BalanceTestMachineStates.Completed, latestFeatures, AssessmentEventTypes.AssessmentCompleted, 'ALL_STAGES_COMPLETED', durationEvidence(config.hold.targetHoldMs, config.hold.targetHoldMs));
      return { ok: true, completed: true, snapshot: snapshot([]) };
    }
    currentStageIndex += 1;
    state = BalanceTestMachineStates.Setup;
    previousNonPausedState = state;
    positionCandidateSinceMs = null;
    holdStartedAtMs = null;
    holdBaseline = null;
    holdPausedMs = 0;
    pauseStartedAtMs = null;
    footMoveSinceMs = null;
    positionLostSinceMs = null;
    supportSinceMs = null;
    touchDownSinceMs = null;
    failureReason = null;
    latestMatch = null;
    acquisitionStartedAtMs = previousTimestampMs;
    return { ok: true, completed: false, snapshot: snapshot([]) };
  }

  function finish({ completedAt = previousTimestampMs ?? Date.now() } = {}) {
    if (state === BalanceTestMachineStates.Failed) {
      completedAtMs = completedAt;
      pushEvent(events, createEvent({
        sessionId,
        type: AssessmentEventTypes.AssessmentCompleted,
        timestampMs: completedAt,
        frameId: latestFeatures?.frameId,
        confidence: latestFeatures?.footConfidence,
        reasonCode: failureReason || 'PROTOCOL_STOPPED',
        evidence: durationEvidence(holdElapsedAt(completedAt), config.hold.targetHoldMs),
      }));
    } else if (!TERMINAL_STATES.has(state)) {
      completedAtMs = completedAt;
      transition(BalanceTestMachineStates.Completed, latestFeatures, AssessmentEventTypes.AssessmentCompleted, 'FINISHED', durationEvidence(Math.max(0, completedAt - (startedAtMs ?? completedAt)), config.hold.targetHoldMs));
    }
    return snapshot([]);
  }

  function snapshot(frameEvents = []) {
    return {
      assessmentId,
      sessionId,
      state,
      stage: currentStage(),
      stageIndex: currentStageIndex,
      stages: stages.slice(),
      latestFeatures,
      latestMatch,
      holdStartedAtMs,
      holdElapsedMs: holdElapsedAt(previousTimestampMs),
      events: frameEvents,
      allEvents: events.slice(),
      failureReason,
      userMessage: userMessageForState(state, latestMatch, config),
      supportDetectionEnabled: Boolean(supportRoi),
      swayObservation: {
        ...swayObservation,
        affectsClinicalScore: false,
      },
      swayMetrics: swayMetrics(),
      completedAtMs,
      supportRoi,
      debugTimeline: debugTimeline.slice(),
    };
  }

  return {
    addFrame,
    advanceToNextStage,
    finish,
    snapshot,
    getState: () => state,
  };
}

export { calculateBalanceFeatures, targetPositionMatched };
