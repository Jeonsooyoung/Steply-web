import { PoseLandmarks } from './poseLandmarks';
import {
  calculateBodyCenter,
  calculateBodyHeight,
  calculateBodyBox as calculateKinematicBodyBox,
  calculateBaseOfSupport,
  clamp,
  distance,
  landmarkMap,
  visibleLandmark,
  visibilityOf,
} from './poseKinematics';

export const TRACKING_QUALITY_ALLOW = 0.8;
export const TRACKING_QUALITY_MIN_RESULT = 0.6;

export const REQUIRED_TRACKING_LANDMARKS = [
  PoseLandmarks.Nose,
  PoseLandmarks.LeftShoulder,
  PoseLandmarks.RightShoulder,
  PoseLandmarks.LeftHip,
  PoseLandmarks.RightHip,
  PoseLandmarks.LeftKnee,
  PoseLandmarks.RightKnee,
  PoseLandmarks.LeftAnkle,
  PoseLandmarks.RightAnkle,
  PoseLandmarks.LeftHeel,
  PoseLandmarks.RightHeel,
  PoseLandmarks.LeftFootIndex,
  PoseLandmarks.RightFootIndex,
];

const LEFT_SIDE_TRACKING_LANDMARKS = [
  PoseLandmarks.LeftShoulder,
  PoseLandmarks.LeftHip,
  PoseLandmarks.LeftKnee,
  PoseLandmarks.LeftAnkle,
];

const RIGHT_SIDE_TRACKING_LANDMARKS = [
  PoseLandmarks.RightShoulder,
  PoseLandmarks.RightHip,
  PoseLandmarks.RightKnee,
  PoseLandmarks.RightAnkle,
];

const CORE_VISIBILITY_LANDMARKS = [
  PoseLandmarks.LeftShoulder,
  PoseLandmarks.RightShoulder,
  PoseLandmarks.LeftHip,
  PoseLandmarks.RightHip,
  PoseLandmarks.LeftKnee,
  PoseLandmarks.RightKnee,
  PoseLandmarks.LeftAnkle,
  PoseLandmarks.RightAnkle,
];

const FOOT_LANDMARKS = [
  PoseLandmarks.LeftAnkle,
  PoseLandmarks.RightAnkle,
  PoseLandmarks.LeftHeel,
  PoseLandmarks.RightHeel,
  PoseLandmarks.LeftFootIndex,
  PoseLandmarks.RightFootIndex,
];

const FRAME_MARGIN = 0.015;
const MIN_VISIBILITY = 0.55;
const MIN_BODY_HEIGHT = 0.38;
const MAX_BODY_HEIGHT = 0.9;
const MAX_CENTER_JUMP_RATIO = 0.11;
const MAX_SIZE_CHANGE_RATIO = 0.22;

function isChairStandTest(testType) {
  return testType === 'chair_stand';
}

// Tests where a single clearly tracked foot is enough for setup readiness.
// The 4-stage balance sequence includes semi-tandem, tandem, and one-leg
// stances where the feet overlap or one foot lifts, so requiring both feet
// to be independently visible blocks the ready-to-start check. One foot keeps
// the person in frame while letting the 3-second auto-start fire like the
// chair-stand test.
function usesLenientFootVisibility(testType) {
  return testType === 'chair_stand' || testType === 'four_stage_balance';
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function average(values = []) {
  const finiteValues = values.filter(finite);
  return finiteValues.length ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length : null;
}

function pointsFor(landmarks = []) {
  return landmarkMap(landmarks);
}

function pointInsideFrame(point, margin = FRAME_MARGIN) {
  return Boolean(
    point
      && finite(point.x)
      && finite(point.y)
      && point.x >= margin
      && point.x <= 1 - margin
      && point.y >= margin
      && point.y <= 1 - margin
  );
}

function visibleInFrame(points, name, minVisibility = MIN_VISIBILITY) {
  const point = points.get(name);
  return visibilityOf(point, 0) >= minVisibility && pointInsideFrame(point);
}

function visibilityScore(points, landmarkNames = CORE_VISIBILITY_LANDMARKS) {
  if (!landmarkNames.length) return 0;
  const scores = landmarkNames.map((name) => {
    const visibility = visibilityOf(points.get(name), 0);
    return clamp((visibility - 0.25) / 0.55, 0, 1);
  });
  return average(scores) ?? 0;
}

function inFrameScore(points, landmarkNames = REQUIRED_TRACKING_LANDMARKS) {
  if (!landmarkNames.length) return 0;
  const passed = landmarkNames.filter((name) => {
    const point = points.get(name);
    return visibilityOf(point, 0) >= 0.35 && pointInsideFrame(point);
  }).length;
  return passed / landmarkNames.length;
}

function sideFootVisible(points, side, minVisibility = MIN_VISIBILITY) {
  const ankle = side === 'left' ? PoseLandmarks.LeftAnkle : PoseLandmarks.RightAnkle;
  const heel = side === 'left' ? PoseLandmarks.LeftHeel : PoseLandmarks.RightHeel;
  const footIndex = side === 'left' ? PoseLandmarks.LeftFootIndex : PoseLandmarks.RightFootIndex;
  return visibleInFrame(points, ankle, minVisibility)
    && (visibleInFrame(points, heel, minVisibility) || visibleInFrame(points, footIndex, minVisibility));
}

function feetVisible(points, testType = 'chair_stand') {
  const leftFootVisible = sideFootVisible(points, 'left');
  const rightFootVisible = sideFootVisible(points, 'right');
  return usesLenientFootVisibility(testType)
    ? leftFootVisible || rightFootVisible
    : leftFootVisible && rightFootVisible;
}

function footLandmarkVisibility(points) {
  return Object.fromEntries(FOOT_LANDMARKS.map((name) => [
    name,
    visibilityOf(points.get(name), 0),
  ]));
}

function sideBodyVisible(points, landmarkNames, minVisibility = MIN_VISIBILITY) {
  return landmarkNames.every((name) => visibleInFrame(points, name, minVisibility));
}

function chairStandBodyVisible(points) {
  return sideBodyVisible(points, LEFT_SIDE_TRACKING_LANDMARKS)
    || sideBodyVisible(points, RIGHT_SIDE_TRACKING_LANDMARKS);
}

function requiredVisible(points, testType = 'chair_stand') {
  if (isChairStandTest(testType)) {
    return chairStandBodyVisible(points) && feetVisible(points, testType);
  }
  return CORE_VISIBILITY_LANDMARKS.every((name) => visibleInFrame(points, name))
    && feetVisible(points, testType);
}

function bodyDistanceScore(bodyBox) {
  if (!bodyBox) return 0;
  if (bodyBox.height < MIN_BODY_HEIGHT) return clamp(bodyBox.height / MIN_BODY_HEIGHT, 0, 1);
  if (bodyBox.height > MAX_BODY_HEIGHT) return clamp((1 - bodyBox.height) / (1 - MAX_BODY_HEIGHT), 0, 1);
  return 1;
}

function landmarkStabilityScore(landmarks = [], previousSample = null) {
  if (!previousSample?.landmarks?.length) return 0.72;
  const current = pointsFor(landmarks);
  const previous = pointsFor(previousSample.landmarks);
  const bodyHeight = Math.max(calculateBodyHeight(landmarks) || previousSample.bodyBox?.height || 0.4, 0.25);
  const displacements = CORE_VISIBILITY_LANDMARKS.map((name) => {
    const currentPoint = visibleLandmark(current, name, 0.35);
    const previousPoint = visibleLandmark(previous, name, 0.35);
    const pointDistance = distance(currentPoint, previousPoint, { includeZ: false });
    return finite(pointDistance) ? pointDistance / bodyHeight : null;
  }).filter(finite);
  if (!displacements.length) return 0.45;
  const meanDisplacement = average(displacements) ?? 0;
  return clamp(1 - meanDisplacement / 0.08, 0, 1);
}

function cameraStabilityScore(bodyBox, previousSample = null) {
  if (!bodyBox || !previousSample?.bodyBox || !previousSample?.center) return 0.74;
  const center = {
    x: bodyBox.minX + bodyBox.width / 2,
    y: bodyBox.minY + bodyBox.height / 2,
  };
  const centerJump = Math.hypot(center.x - previousSample.center.x, center.y - previousSample.center.y);
  const sizeChange = previousSample.bodyBox.height
    ? Math.abs(bodyBox.height - previousSample.bodyBox.height) / previousSample.bodyBox.height
    : 0;
  const centerScore = clamp(1 - centerJump / MAX_CENTER_JUMP_RATIO, 0, 1);
  const sizeScore = clamp(1 - sizeChange / MAX_SIZE_CHANGE_RATIO, 0, 1);
  return (centerScore * 0.65) + (sizeScore * 0.35);
}

function fullBodyInFrameScore(points, bodyBox) {
  return Math.min(inFrameScore(points), bodyDistanceScore(bodyBox));
}

function trackingVisibilityScore(points, testType) {
  if (isChairStandTest(testType)) {
    return Math.max(
      visibilityScore(points, LEFT_SIDE_TRACKING_LANDMARKS),
      visibilityScore(points, RIGHT_SIDE_TRACKING_LANDMARKS),
    );
  }
  return visibilityScore(points);
}

function trackingInFrameScore(points, bodyBox, testType) {
  if (isChairStandTest(testType)) {
    return Math.min(
      Math.max(
        inFrameScore(points, LEFT_SIDE_TRACKING_LANDMARKS),
        inFrameScore(points, RIGHT_SIDE_TRACKING_LANDMARKS),
      ),
      bodyDistanceScore(bodyBox),
    );
  }
  return fullBodyInFrameScore(points, bodyBox);
}

function singlePersonScore(poseCount) {
  if (!Number.isFinite(poseCount)) return 1;
  if (poseCount === 1) return 1;
  if (poseCount === 0) return 0;
  return 0;
}

function cameraMessage({ hasPose, singlePersonDetected, fullBodyVisible, properDistance, feetVisible: hasFeet, trackingStable, cameraStill, brightnessOk }) {
  if (!hasPose) return 'Stand where the camera can see you.';
  if (!singlePersonDetected) return 'Please make sure only one person is in the camera view.';
  if (!hasFeet) return 'Tilt the camera down so both feet are visible.';
  if (!fullBodyVisible || !properDistance) return 'Step back a little so your whole body is in the camera.';
  if (!brightnessOk) return 'Use a brighter space so the camera can see you clearly.';
  if (!trackingStable || !cameraStill) return 'Hold still gently while the camera checks your position.';
  return 'Great. Hold still gently for three seconds.';
}

export function calculateTrackingQuality({
  landmarks = [],
  previousSample = null,
  poseCount = null,
  brightness = null,
  testType = 'chair_stand',
} = {}) {
  const points = pointsFor(landmarks);
  const bodyBox = calculateKinematicBodyBox(landmarks, { minVisibility: 0.35 });
  const requiredLandmarkVisibilityScore = trackingVisibilityScore(points, testType);
  const fullBodyScore = trackingInFrameScore(points, bodyBox, testType);
  const stabilityScore = landmarkStabilityScore(landmarks, previousSample);
  const personScore = singlePersonScore(poseCount);
  const cameraScore = cameraStabilityScore(bodyBox, previousSample);
  const brightnessOk = !finite(brightness) || (brightness >= 0.16 && brightness <= 0.92);
  const brightnessPenalty = brightnessOk ? 1 : 0.82;
  const trackingQualityScore = clamp((
    0.35 * requiredLandmarkVisibilityScore
    + 0.25 * fullBodyScore
    + 0.2 * stabilityScore
    + 0.1 * personScore
    + 0.1 * cameraScore
  ) * brightnessPenalty, 0, 1);

  return {
    trackingQualityScore,
    requiredLandmarkVisibilityScore,
    fullBodyInFrameScore: fullBodyScore,
    landmarkStabilityScore: stabilityScore,
    singlePersonScore: personScore,
    cameraStabilityScore: cameraScore,
    level: trackingQualityScore >= TRACKING_QUALITY_ALLOW
      ? 'allow'
      : trackingQualityScore >= TRACKING_QUALITY_MIN_RESULT ? 'caution' : 'block',
    brightness,
    brightnessOk,
  };
}

export function evaluateCameraReadiness({
  landmarks = [],
  testType = 'chair_stand',
  previousSample = null,
  poseCount = null,
  brightness = null,
  strictStability = true,
} = {}) {
  const points = pointsFor(landmarks);
  const bodyBox = calculateKinematicBodyBox(landmarks, { minVisibility: 0.35 });
  const center = bodyBox
    ? {
      x: bodyBox.minX + bodyBox.width / 2,
      y: bodyBox.minY + bodyBox.height / 2,
    }
    : calculateBodyCenter(landmarks, { minVisibility: 0.35 });
  const hasPose = landmarks.some((point) => visibilityOf(point, 0) >= 0.35);
  const trackingQuality = calculateTrackingQuality({ landmarks, previousSample, poseCount, brightness, testType });
  const fullBodyVisible = requiredVisible(points, testType);
  const properDistance = bodyDistanceScore(bodyBox) >= 0.95;
  const hasFeet = feetVisible(points, testType);
  const singlePersonDetected = !Number.isFinite(poseCount) ? true : poseCount === 1;
  const trackingStable = strictStability
    ? trackingQuality.landmarkStabilityScore >= 0.62
    : trackingQuality.landmarkStabilityScore >= 0.45;
  const cameraStill = strictStability
    ? trackingQuality.cameraStabilityScore >= 0.62
    : trackingQuality.cameraStabilityScore >= 0.45;
  const brightnessOk = trackingQuality.brightnessOk;
  const isReady = Boolean(
    hasPose
      && fullBodyVisible
      && properDistance
      && hasFeet
      && singlePersonDetected
      && trackingStable
      && cameraStill
      && brightnessOk
      && trackingQuality.trackingQualityScore >= TRACKING_QUALITY_ALLOW
  );
  const baseOfSupport = calculateBaseOfSupport(landmarks, { minVisibility: 0.35 });
  const failingReasons = [];
  if (!hasPose) failingReasons.push('no_person');
  if (!singlePersonDetected) failingReasons.push('single_person_required');
  if (!fullBodyVisible) failingReasons.push('full_body_not_visible');
  if (!hasFeet) failingReasons.push('feet_not_visible');
  if (!properDistance) failingReasons.push('improper_distance');
  if (!trackingStable) failingReasons.push('tracking_unstable');
  if (!cameraStill) failingReasons.push('camera_moving');
  if (!brightnessOk) failingReasons.push('brightness_out_of_range');
  if (trackingQuality.trackingQualityScore < TRACKING_QUALITY_ALLOW) {
    failingReasons.push('tracking_quality_below_threshold');
  }
  const readinessDebug = {
    isReady,
    hasPerson: hasPose,
    singlePerson: singlePersonDetected,
    fullBodyVisible,
    feetVisible: hasFeet,
    properDistance,
    trackingStable,
    cameraStill,
    brightnessOk,
    trackingQualityScore: trackingQuality.trackingQualityScore,
    failingReasons,
    footLandmarkVisibility: footLandmarkVisibility(points),
  };
  const message = cameraMessage({
    hasPose,
    singlePersonDetected,
    fullBodyVisible,
    properDistance,
    feetVisible: hasFeet,
    trackingStable,
    cameraStill,
    brightnessOk,
  });
  const warnings = isReady ? [] : [message];

  return {
    isReady,
    fullBodyVisible,
    feetVisible: hasFeet,
    singlePersonDetected,
    trackingStable,
    brightnessOk,
    cameraStill,
    message,
    mainMessage: message,
    warnings,
    readyScore: trackingQuality.trackingQualityScore,
    trackingQualityScore: trackingQuality.trackingQualityScore,
    trackingQuality,
    readinessDebug,
    testType,
    checks: {
      singlePersonStable: singlePersonDetected && cameraStill,
      singlePersonDetected,
      fullBodyVisible,
      properDistance,
      lowerBodyVisible: hasFeet,
      feetVisible: hasFeet,
      stablePose: trackingStable,
      trackingStable,
      goodVisibility: trackingQuality.requiredLandmarkVisibilityScore >= 0.72,
      correctDirection: true,
      brightnessOk,
      cameraStill,
      trackingQualityGood: trackingQuality.trackingQualityScore >= TRACKING_QUALITY_ALLOW,
    },
    sample: {
      bodyBox,
      center,
      baseOfSupport,
      bodyHeight: calculateBodyHeight(landmarks),
      averageVisibility: average(landmarks.map((point) => visibilityOf(point, 0))) ?? 0,
      landmarks,
      trackingQualityScore: trackingQuality.trackingQualityScore,
    },
  };
}
