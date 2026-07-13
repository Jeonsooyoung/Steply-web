import {
  CameraViews,
  CoordinateAxisDirections,
  VerticalMotionDirections,
} from '../shared/types/index.js';

export const LandmarkIndexes = {
  Nose: 0,
  LeftShoulder: 11,
  RightShoulder: 12,
  LeftElbow: 13,
  RightElbow: 14,
  LeftWrist: 15,
  RightWrist: 16,
  LeftHip: 23,
  RightHip: 24,
  LeftKnee: 25,
  RightKnee: 26,
  LeftAnkle: 27,
  RightAnkle: 28,
  LeftHeel: 29,
  RightHeel: 30,
  LeftFootIndex: 31,
  RightFootIndex: 32,
};

const LOWER_BODY_INDEXES = [
  LandmarkIndexes.LeftHip,
  LandmarkIndexes.RightHip,
  LandmarkIndexes.LeftKnee,
  LandmarkIndexes.RightKnee,
  LandmarkIndexes.LeftAnkle,
  LandmarkIndexes.RightAnkle,
  LandmarkIndexes.LeftHeel,
  LandmarkIndexes.RightHeel,
  LandmarkIndexes.LeftFootIndex,
  LandmarkIndexes.RightFootIndex,
];

const FOOT_INDEXES = [
  LandmarkIndexes.LeftAnkle,
  LandmarkIndexes.RightAnkle,
  LandmarkIndexes.LeftHeel,
  LandmarkIndexes.RightHeel,
  LandmarkIndexes.LeftFootIndex,
  LandmarkIndexes.RightFootIndex,
];

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

export function landmarkByIndex(frameOrLandmarks, index) {
  const landmarks = Array.isArray(frameOrLandmarks)
    ? frameOrLandmarks
    : frameOrLandmarks?.normalizedLandmarks || [];
  return landmarks.find((point) => point?.index === index) || null;
}

export function worldLandmarkByIndex(frameOrLandmarks, index) {
  const landmarks = Array.isArray(frameOrLandmarks)
    ? frameOrLandmarks
    : frameOrLandmarks?.worldLandmarks || [];
  const point = landmarks.find((candidate) => candidate?.index === index) || null;
  if (!point) return null;
  const normalized = Array.isArray(frameOrLandmarks)
    ? null
    : landmarkByIndex(frameOrLandmarks?.normalizedLandmarks || [], index);
  const x = finite(point.xMeters) ? point.xMeters : point.x;
  const y = finite(point.yMeters) ? point.yMeters : point.y;
  const z = finite(point.zMeters) ? point.zMeters : point.z;
  if (![x, y, z].every(finite)) return null;
  return {
    index,
    x,
    y,
    z,
    visibility: point.visibility ?? normalized?.visibility ?? 0,
  };
}

export function worldLandmarks(frame) {
  return (frame?.worldLandmarks || []).map((point) => worldLandmarkByIndex(frame, point.index)).filter(Boolean);
}

function visiblePoint(frameOrLandmarks, index, minVisibility = 0.35) {
  const point = landmarkByIndex(frameOrLandmarks, index);
  if (!point || !finite(point.x) || !finite(point.y)) return null;
  if ((point.visibility ?? 1) < minVisibility) return null;
  return point;
}

function midpoint(first, second) {
  if (!first || !second || !finite(first.x) || !finite(first.y) || !finite(second.x) || !finite(second.y)) return null;
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    z: average([first.z, second.z]),
    visibility: average([first.visibility ?? 1, second.visibility ?? 1]) ?? 0,
  };
}

export function worldMidpoint(frame, firstIndex, secondIndex, minVisibility = 0.35) {
  const first = worldLandmarkByIndex(frame, firstIndex);
  const second = worldLandmarkByIndex(frame, secondIndex);
  if (!first || !second || (first.visibility ?? 0) < minVisibility || (second.visibility ?? 0) < minVisibility) return null;
  return midpoint(first, second);
}

export function worldHipCenter(frame, minVisibility = 0.35) {
  return worldMidpoint(frame, LandmarkIndexes.LeftHip, LandmarkIndexes.RightHip, minVisibility);
}

export function worldShoulderCenter(frame, minVisibility = 0.35) {
  return worldMidpoint(frame, LandmarkIndexes.LeftShoulder, LandmarkIndexes.RightShoulder, minVisibility);
}

export function worldFootCenter(frame, side, minVisibility = 0.35) {
  const indexes = side === 'left'
    ? [LandmarkIndexes.LeftAnkle, LandmarkIndexes.LeftHeel, LandmarkIndexes.LeftFootIndex]
    : [LandmarkIndexes.RightAnkle, LandmarkIndexes.RightHeel, LandmarkIndexes.RightFootIndex];
  const points = indexes.map((index) => worldLandmarkByIndex(frame, index))
    .filter((point) => point && (point.visibility ?? 0) >= minVisibility);
  if (!points.length) return null;
  return {
    x: average(points.map((point) => point.x)),
    y: average(points.map((point) => point.y)),
    z: average(points.map((point) => point.z)),
    visibility: average(points.map((point) => point.visibility)) ?? 0,
  };
}

export function worldBodyScale(frame, minVisibility = 0.35) {
  const point = (index) => {
    const value = worldLandmarkByIndex(frame, index);
    return value && (value.visibility ?? 0) >= minVisibility ? value : null;
  };
  const spatial = (first, second) => first && second
    ? Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z)
    : null;
  const leftShoulder = point(LandmarkIndexes.LeftShoulder);
  const rightShoulder = point(LandmarkIndexes.RightShoulder);
  const leftHeel = point(LandmarkIndexes.LeftHeel);
  const rightHeel = point(LandmarkIndexes.RightHeel);
  const leftToe = point(LandmarkIndexes.LeftFootIndex);
  const rightToe = point(LandmarkIndexes.RightFootIndex);
  const footLengthLeft = spatial(leftHeel, leftToe);
  const footLengthRight = spatial(rightHeel, rightToe);
  return {
    shoulderWidth: spatial(leftShoulder, rightShoulder) ?? undefined,
    footLengthLeft: footLengthLeft ?? undefined,
    footLengthRight: footLengthRight ?? undefined,
    averageFootLength: average([footLengthLeft, footLengthRight]) ?? undefined,
  };
}

function distance(first, second) {
  if (!first || !second || !finite(first.x) || !finite(first.y) || !finite(second.x) || !finite(second.y)) return null;
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function hipCenter(frameOrLandmarks, minVisibility = 0.35) {
  return midpoint(
    visiblePoint(frameOrLandmarks, LandmarkIndexes.LeftHip, minVisibility),
    visiblePoint(frameOrLandmarks, LandmarkIndexes.RightHip, minVisibility),
  );
}

export function shoulderCenter(frameOrLandmarks, minVisibility = 0.35) {
  return midpoint(
    visiblePoint(frameOrLandmarks, LandmarkIndexes.LeftShoulder, minVisibility),
    visiblePoint(frameOrLandmarks, LandmarkIndexes.RightShoulder, minVisibility),
  );
}

export function footCenter(frameOrLandmarks, side, minVisibility = 0.35) {
  const ankle = visiblePoint(frameOrLandmarks, side === 'left' ? LandmarkIndexes.LeftAnkle : LandmarkIndexes.RightAnkle, minVisibility);
  const heel = visiblePoint(frameOrLandmarks, side === 'left' ? LandmarkIndexes.LeftHeel : LandmarkIndexes.RightHeel, minVisibility);
  const toe = visiblePoint(frameOrLandmarks, side === 'left' ? LandmarkIndexes.LeftFootIndex : LandmarkIndexes.RightFootIndex, minVisibility);
  const xs = [ankle?.x, heel?.x, toe?.x].filter(finite);
  const ys = [ankle?.y, heel?.y, toe?.y].filter(finite);
  const zs = [ankle?.z, heel?.z, toe?.z].filter(finite);
  if (!xs.length || !ys.length) return null;
  return {
    x: average(xs),
    y: average(ys),
    z: average(zs),
    visibility: average([ankle?.visibility, heel?.visibility, toe?.visibility].filter(finite)) ?? 0,
  };
}

export function bodyBox(frameOrLandmarks, minVisibility = 0.35) {
  const landmarks = Array.isArray(frameOrLandmarks)
    ? frameOrLandmarks
    : frameOrLandmarks?.normalizedLandmarks || [];
  const visible = landmarks.filter((point) => (
    finite(point?.x)
    && finite(point?.y)
    && (point.visibility ?? 1) >= minVisibility
  ));
  if (!visible.length) return null;
  const xs = visible.map((point) => point.x);
  const ys = visible.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

export function bodyCenter(frameOrLandmarks, minVisibility = 0.35) {
  const box = bodyBox(frameOrLandmarks, minVisibility);
  if (!box) return null;
  return { x: box.minX + box.width / 2, y: box.minY + box.height / 2 };
}

export function bodyScale(frameOrLandmarks) {
  const leftShoulder = visiblePoint(frameOrLandmarks, LandmarkIndexes.LeftShoulder);
  const rightShoulder = visiblePoint(frameOrLandmarks, LandmarkIndexes.RightShoulder);
  const leftHip = visiblePoint(frameOrLandmarks, LandmarkIndexes.LeftHip);
  const rightHip = visiblePoint(frameOrLandmarks, LandmarkIndexes.RightHip);
  const leftAnkle = visiblePoint(frameOrLandmarks, LandmarkIndexes.LeftAnkle);
  const rightAnkle = visiblePoint(frameOrLandmarks, LandmarkIndexes.RightAnkle);
  const leftHeel = visiblePoint(frameOrLandmarks, LandmarkIndexes.LeftHeel);
  const rightHeel = visiblePoint(frameOrLandmarks, LandmarkIndexes.RightHeel);
  const leftToe = visiblePoint(frameOrLandmarks, LandmarkIndexes.LeftFootIndex);
  const rightToe = visiblePoint(frameOrLandmarks, LandmarkIndexes.RightFootIndex);
  const shoulderWidth = distance(leftShoulder, rightShoulder);
  const torsoLength = distance(shoulderCenter(frameOrLandmarks), hipCenter(frameOrLandmarks));
  const legLength = average([distance(leftHip, leftAnkle), distance(rightHip, rightAnkle)]);
  const footLengthLeft = distance(leftHeel, leftToe);
  const footLengthRight = distance(rightHeel, rightToe);
  return {
    shoulderWidth: shoulderWidth ?? undefined,
    torsoLength: torsoLength ?? undefined,
    legLength: legLength ?? undefined,
    footLengthLeft: footLengthLeft ?? undefined,
    footLengthRight: footLengthRight ?? undefined,
    averageFootLength: average([footLengthLeft, footLengthRight]) ?? undefined,
  };
}

export function bodyInFrameScore(frameOrLandmarks, { margin = 0.015 } = {}) {
  const landmarks = Array.isArray(frameOrLandmarks)
    ? frameOrLandmarks
    : frameOrLandmarks?.normalizedLandmarks || [];
  const tracked = landmarks.filter((point) => (point.visibility ?? 1) >= 0.35 && finite(point.x) && finite(point.y));
  if (!tracked.length) return 0;
  const inside = tracked.filter((point) => (
    point.x >= margin
    && point.x <= 1 - margin
    && point.y >= margin
    && point.y <= 1 - margin
  ));
  return inside.length / tracked.length;
}

export function groupConfidence(frame, indexes) {
  const landmarks = frame?.normalizedLandmarks || [];
  const values = indexes.map((index) => landmarkByIndex(landmarks, index)?.visibility).filter(finite);
  return values.length ? clamp01(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

export function lowerBodyConfidence(frame) {
  return groupConfidence(frame, LOWER_BODY_INDEXES);
}

export function feetConfidence(frame) {
  return groupConfidence(frame, FOOT_INDEXES);
}

export function estimateCameraView(frame) {
  const scale = bodyScale(frame);
  const box = bodyBox(frame);
  const shoulderToHeightRatio = scale.shoulderWidth && box?.height ? scale.shoulderWidth / box.height : null;
  let view = CameraViews.Unknown;
  let score = 0;
  if (finite(shoulderToHeightRatio)) {
    if (shoulderToHeightRatio >= 0.24) {
      view = CameraViews.Front;
      score = 0.65;
    } else if (shoulderToHeightRatio >= 0.13) {
      view = frame?.image?.mirrored ? CameraViews.ObliqueRight : CameraViews.ObliqueLeft;
      score = 0.85;
    } else {
      view = CameraViews.Side;
      score = 0.55;
    }
  }
  const leftFoot = footCenter(frame, 'left');
  const rightFoot = footCenter(frame, 'right');
  const footPlaneObservableScore = footPlacementObservability(frame);
  return {
    view,
    score,
    estimatedAngleDegrees: view === CameraViews.Front ? 0 : view === CameraViews.Side ? 90 : 40,
    mirrored: Boolean(frame?.image?.mirrored),
    footPlaneObservableScore,
    footCenters: { left: leftFoot, right: rightFoot },
  };
}

export function footPlacementObservability(frame) {
  const leftHeel = visiblePoint(frame, LandmarkIndexes.LeftHeel, 0.35);
  const rightHeel = visiblePoint(frame, LandmarkIndexes.RightHeel, 0.35);
  const leftToe = visiblePoint(frame, LandmarkIndexes.LeftFootIndex, 0.35);
  const rightToe = visiblePoint(frame, LandmarkIndexes.RightFootIndex, 0.35);
  const leftLength = distance(leftHeel, leftToe);
  const rightLength = distance(rightHeel, rightToe);
  const averageFootLength = average([leftLength, rightLength]) ?? 0;
  const bothFeetVisible = Boolean(leftHeel && rightHeel && leftToe && rightToe);
  const verticalFootSpread = averageFootLength > 0
    ? average([Math.abs((leftHeel?.y ?? 0) - (leftToe?.y ?? 0)), Math.abs((rightHeel?.y ?? 0) - (rightToe?.y ?? 0))]) / averageFootLength
    : 0;
  return clamp01((bothFeetVisible ? 0.55 : 0) + clamp01(verticalFootSpread) * 0.45);
}

export function createCoordinateOrientation({
  frame,
  standingHipPosition,
  sittingHipPosition,
} = {}) {
  let verticalMotionDirection = VerticalMotionDirections.Unknown;
  if (finite(standingHipPosition) && finite(sittingHipPosition) && standingHipPosition !== sittingHipPosition) {
    verticalMotionDirection = standingHipPosition > sittingHipPosition
      ? VerticalMotionDirections.StandingIncreases
      : VerticalMotionDirections.StandingDecreases;
  }
  return {
    imageYAxis: CoordinateAxisDirections.DownPositive,
    worldYAxis: CoordinateAxisDirections.Unknown,
    cameraMirrored: Boolean(frame?.image?.mirrored),
    verticalMotionDirection,
  };
}

export function normalizeSittingToStandingProgress(frame, calibrationProfile, { clamp = false } = {}) {
  const hip = worldHipCenter(frame);
  const sitting = calibrationProfile?.references?.H_sit ?? calibrationProfile?.references?.sittingHipPosition;
  const standing = calibrationProfile?.references?.H_stand ?? calibrationProfile?.references?.standingHipPosition;
  if (!hip || !finite(sitting) || !finite(standing) || standing === sitting) {
    return {
      sittingToStandingProgress: undefined,
      unclampedProgress: undefined,
      clamped: false,
      outOfRange: false,
    };
  }
  const progress = (hip.y - sitting) / (standing - sitting);
  const clampedProgress = clamp ? clamp01(progress) : progress;
  return {
    sittingToStandingProgress: clampedProgress,
    unclampedProgress: progress,
    clamped: clamp,
    outOfRange: progress < 0 || progress > 1,
  };
}

export function foldedArmConfidence(frame) {
  const leftWrist = visiblePoint(frame, LandmarkIndexes.LeftWrist, 0.25);
  const rightWrist = visiblePoint(frame, LandmarkIndexes.RightWrist, 0.25);
  const leftShoulder = visiblePoint(frame, LandmarkIndexes.LeftShoulder, 0.25);
  const rightShoulder = visiblePoint(frame, LandmarkIndexes.RightShoulder, 0.25);
  const shoulderWidth = distance(leftShoulder, rightShoulder) || 0.2;
  if (!leftWrist || !rightWrist || !leftShoulder || !rightShoulder) return 0;
  const leftToRightShoulder = distance(leftWrist, rightShoulder);
  const rightToLeftShoulder = distance(rightWrist, leftShoulder);
  const crossedScore = 1 - Math.min(1, ((leftToRightShoulder || 1) + (rightToLeftShoulder || 1)) / (shoulderWidth * 4));
  return clamp01(crossedScore);
}
