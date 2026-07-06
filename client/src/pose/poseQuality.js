import { PoseLandmarks } from './poseLandmarks';

export const READY_HOLD_SECONDS = 3;
export const MIN_REQUIRED_VISIBILITY = 0.55;
export const MIN_AVERAGE_VISIBILITY = 0.58;
export const MIN_BODY_HEIGHT = 0.38;
export const MAX_BODY_HEIGHT = 0.9;
export const MAX_CENTER_JUMP = 0.16;
export const MAX_BODY_SIZE_CHANGE = 0.28;

const COMMON_REQUIRED_LANDMARKS = [
  PoseLandmarks.LeftShoulder,
  PoseLandmarks.RightShoulder,
  PoseLandmarks.LeftHip,
  PoseLandmarks.RightHip,
  PoseLandmarks.LeftKnee,
  PoseLandmarks.RightKnee,
  PoseLandmarks.LeftAnkle,
  PoseLandmarks.RightAnkle,
];

const TUG_EXTRA_LANDMARKS = [
  PoseLandmarks.LeftHeel,
  PoseLandmarks.RightHeel,
  PoseLandmarks.LeftFootIndex,
  PoseLandmarks.RightFootIndex,
];

const LOWER_BODY_LANDMARKS = [
  PoseLandmarks.LeftKnee,
  PoseLandmarks.RightKnee,
  PoseLandmarks.LeftAnkle,
  PoseLandmarks.RightAnkle,
];

function landmarkMap(landmarks = []) {
  return new Map(landmarks.map((point) => [point.name, point]));
}

function visibilityOf(point, fallback = 0) {
  if (!point) return 0;
  if (Number.isFinite(point.visibility)) return point.visibility;
  return fallback;
}

function requiredLandmarksFor(testType) {
  if (testType === 'tug' || testType === 'tug_walk') {
    return [...COMMON_REQUIRED_LANDMARKS, ...TUG_EXTRA_LANDMARKS];
  }
  return COMMON_REQUIRED_LANDMARKS;
}

export function getVisibleLandmarks(landmarks = [], minVisibility = MIN_REQUIRED_VISIBILITY) {
  return landmarks.filter((point) => visibilityOf(point, 1) >= minVisibility);
}

export function calculateBodyBox(landmarks = []) {
  const visible = getVisibleLandmarks(landmarks, 0.35);
  if (!visible.length) return null;
  const xs = visible.map((point) => point.x).filter(Number.isFinite);
  const ys = visible.map((point) => point.y).filter(Number.isFinite);
  if (!xs.length || !ys.length) return null;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function calculateBodyCenter(bodyBox) {
  if (!bodyBox) return null;
  return {
    x: bodyBox.minX + bodyBox.width / 2,
    y: bodyBox.minY + bodyBox.height / 2,
  };
}

export function checkRequiredLandmarks(landmarks = [], testType = 'chair_stand') {
  const points = landmarkMap(landmarks);
  return requiredLandmarksFor(testType).every(
    (name) => visibilityOf(points.get(name)) >= MIN_REQUIRED_VISIBILITY
  );
}

export function checkLowerBodyVisible(landmarks = []) {
  const points = landmarkMap(landmarks);
  return LOWER_BODY_LANDMARKS.every(
    (name) => visibilityOf(points.get(name)) >= MIN_REQUIRED_VISIBILITY
  );
}

export function checkBodyDistance(bodyBox) {
  if (!bodyBox) {
    return { valid: false, message: 'Make sure your full body is visible.' };
  }
  if (bodyBox.height > MAX_BODY_HEIGHT) {
    return { valid: false, message: 'You are too close. Please step back.' };
  }
  if (bodyBox.height < MIN_BODY_HEIGHT) {
    return { valid: false, message: 'You are too far. Please move closer.' };
  }
  return { valid: true, message: '' };
}

export function checkAverageVisibility(landmarks = []) {
  const values = landmarks
    .map((point) => point.visibility)
    .filter(Number.isFinite);
  const averageVisibility = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : landmarks.length ? 1 : 0;
  return {
    valid: averageVisibility >= MIN_AVERAGE_VISIBILITY,
    averageVisibility,
  };
}

function checkStableTarget(bodyBox, previousSample, averageVisibility) {
  if (!bodyBox || !previousSample?.bodyBox || !previousSample?.center) return true;
  const center = calculateBodyCenter(bodyBox);
  const jump = center
    ? Math.hypot(center.x - previousSample.center.x, center.y - previousSample.center.y)
    : 0;
  const previousHeight = previousSample.bodyBox.height || 0;
  const sizeChange = previousHeight
    ? Math.abs(bodyBox.height - previousHeight) / previousHeight
    : 0;
  const visibilityDrop = Number.isFinite(previousSample.averageVisibility)
    ? previousSample.averageVisibility - averageVisibility
    : 0;
  return jump <= MAX_CENTER_JUMP && sizeChange <= MAX_BODY_SIZE_CHANGE && visibilityDrop <= 0.22;
}

function checkDirection(landmarks = [], testType = 'chair_stand') {
  const points = landmarkMap(landmarks);
  const leftShoulder = points.get(PoseLandmarks.LeftShoulder);
  const rightShoulder = points.get(PoseLandmarks.RightShoulder);
  const leftHip = points.get(PoseLandmarks.LeftHip);
  const rightHip = points.get(PoseLandmarks.RightHip);

  const shoulderWidth = leftShoulder && rightShoulder
    ? Math.abs(leftShoulder.x - rightShoulder.x)
    : 0;
  const hipWidth = leftHip && rightHip
    ? Math.abs(leftHip.x - rightHip.x)
    : 0;
  const bodyWidth = Math.max(shoulderWidth, hipWidth);

  if (testType === 'standing_posture' || testType === 'balance_hold') {
    return {
      valid: bodyWidth >= 0.12,
      message: 'Face the camera for this test.',
    };
  }

  if (testType === 'chair_stand') {
    // This is intentionally gentle: camera direction is hard to infer from 2D landmarks.
    return {
      valid: bodyWidth >= 0.06,
      message: 'Stand sideways so your sitting and standing movement is visible.',
    };
  }

  return {
    valid: true,
    message: 'Stand where your full body can be seen.',
  };
}

export function evaluateSetupReadiness({
  landmarks = [],
  testType = 'chair_stand',
  previousSample = null,
  strictStability = true,
} = {}) {
  const bodyBox = calculateBodyBox(landmarks);
  const bodyCenter = calculateBodyCenter(bodyBox);
  const requiredVisible = checkRequiredLandmarks(landmarks, testType);
  const distance = checkBodyDistance(bodyBox);
  const lowerBodyVisible = checkLowerBodyVisible(landmarks);
  const visibility = checkAverageVisibility(landmarks);
  const stableTarget = strictStability
    ? checkStableTarget(bodyBox, previousSample, visibility.averageVisibility)
    : true;
  const direction = checkDirection(landmarks, testType);

  const checks = {
    singlePersonStable: stableTarget,
    fullBodyVisible: requiredVisible,
    properDistance: distance.valid,
    lowerBodyVisible,
    stablePose: stableTarget,
    goodVisibility: visibility.valid,
    correctDirection: direction.valid,
  };

  const warnings = [];
  if (!stableTarget) warnings.push('Keep only one person in the camera view.');
  if (!requiredVisible) warnings.push('Make sure your full body is visible.');
  if (!distance.valid) warnings.push(distance.message);
  if (!lowerBodyVisible) warnings.push('Make sure your knees and ankles are visible.');
  if (!visibility.valid) {
    warnings.push('Pose detection is unstable. Use a brighter space and keep the camera steady.');
  }
  if (!direction.valid) warnings.push(direction.message);

  const passedCount = Object.values(checks).filter(Boolean).length;
  const readyScore = passedCount / Object.keys(checks).length;
  const isReady = warnings.length === 0;

  return {
    isReady,
    readyScore,
    mainMessage: isReady ? 'Great. Hold still for 3 seconds.' : warnings[0],
    warnings,
    checks,
    sample: {
      bodyBox,
      center: bodyCenter,
      averageVisibility: visibility.averageVisibility,
    },
  };
}
