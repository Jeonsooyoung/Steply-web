import { PoseLandmarks } from './poseLandmarks';
import { RecommendationLevels } from './recommendationRules';
import {
  averageNumbers,
  calculateBodyCenter,
  calculateJointAngles,
  calculateTrunkLean,
  clamp,
  distance,
  landmarkMap,
  midpoint,
  visibleLandmark,
} from './poseKinematics';
import { normalizePoseLandmarks } from './poseTimeSeries';

export const FOUR_STAGE_BALANCE_TEST_TYPE = 'four_stage_balance';
export const BALANCE_RESULT_SCHEMA_VERSION = 'balance_result.v1';
export const FOUR_STAGE_BALANCE_STAGES = [
  { id: 'side_by_side', title: 'Side-by-side Stand', order: 1, targetHoldSeconds: 10 },
  { id: 'semi_tandem', title: 'Semi-tandem Stand', order: 2, targetHoldSeconds: 10 },
  { id: 'tandem', title: 'Tandem Stand', order: 3, targetHoldSeconds: 10 },
  { id: 'one_leg', title: 'One-leg Stand', order: 4, targetHoldSeconds: 10 },
];

export const DEFAULT_BALANCE_OPTIONS = {
  minVisibility: 0.45,
  dynamicAdjustmentSeconds: 3.5,
  entryConfirmMs: 650,
  exitConfirmMs: 700,
  minStanceConfidence: 0.35,
  footMovementExitThreshold: 0.16,
  footMovementExitConfirmFrames: 3,
  handSupportRatioThreshold: 0.12,
};

const LOWER_BODY_LANDMARKS = [
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

const FOOT_LANDMARKS = {
  left: [PoseLandmarks.LeftAnkle, PoseLandmarks.LeftHeel, PoseLandmarks.LeftFootIndex],
  right: [PoseLandmarks.RightAnkle, PoseLandmarks.RightHeel, PoseLandmarks.RightFootIndex],
};

const STAGE_INDEX = new Map(FOUR_STAGE_BALANCE_STAGES.map((stage, index) => [stage.id, index]));

/**
 * @typedef {'side_by_side'|'semi_tandem'|'tandem'|'one_leg'} BalanceStageId
 * @typedef {'not_observed'|'observed'|'completed'} BalanceStageStatus
 *
 * @typedef {Object} BalanceAxisMetric
 * @property {number|null} range Normalized axis range within the segment.
 * @property {number|null} standardDeviation Normalized axis standard deviation.
 * @property {number|null} meanAbsoluteVelocity Normalized units per second.
 * @property {number|null} pathLength Normalized cumulative axis path.
 *
 * @typedef {Object} BalanceWindowMetrics
 * @property {number} sampleCount
 * @property {number} durationSeconds
 * @property {{ mediolateral: BalanceAxisMetric, anteriorPosterior: BalanceAxisMetric, anteriorPosteriorAxis: 'z'|'y' }} sway
 * @property {Object} ankleAngleChange Degrees and deg/sec changes for left, right, and average ankle angles.
 * @property {Object} footMovement Normalized support-foot displacement and stance-exit observations.
 * @property {Object} handSupport Possible visible hand-support observations.
 *
 * @typedef {Object} BalanceStageResult
 * @property {BalanceStageId} id
 * @property {string} title
 * @property {number} order
 * @property {BalanceStageStatus} status
 * @property {number} targetHoldSeconds
 * @property {number} holdSeconds
 * @property {number|null} startedAtMs
 * @property {number|null} endedAtMs
 * @property {BalanceWindowMetrics} dynamicAdjustment
 * @property {BalanceWindowMetrics} staticHold
 * @property {BalanceWindowMetrics} totalHold
 *
 * @typedef {Object} BalanceResult
 * @property {'balance_result.v1'} schemaVersion
 * @property {'four_stage_balance'} testType
 * @property {number} dynamicAdjustmentSeconds
 * @property {number} frameCount
 * @property {number|null} frameRateFps
 * @property {number|null} startedAtMs
 * @property {number|null} completedAtMs
 * @property {BalanceStageResult[]} stages
 * @property {Object.<BalanceStageId, BalanceStageResult>} stageById
 * @property {Object} stateMachine
 * @property {number} confidence
 */

function mergeOptions(options = {}) {
  return { ...DEFAULT_BALANCE_OPTIONS, ...options };
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeTimestamp(frame, index) {
  if (finite(frame?.timestampMs)) return frame.timestampMs;
  if (finite(frame?.receivedAt)) return frame.receivedAt;
  return index * 100;
}

function normalizeFrame(frame, index) {
  return {
    ...frame,
    sequence: frame?.sequence ?? index + 1,
    timestampMs: safeTimestamp(frame, index),
    landmarks: normalizePoseLandmarks(frame?.landmarks || frame || []),
    confidence: finite(frame?.confidence) ? frame.confidence : 0,
  };
}

function framesFromSeries(seriesInput) {
  const frames = Array.isArray(seriesInput)
    ? seriesInput
    : seriesInput?.frames || seriesInput?.landmarkSeries?.frames || seriesInput?.balanceSeries?.frames || [];
  return frames
    .filter(Boolean)
    .map(normalizeFrame)
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

function bodyBox(landmarks, minVisibility) {
  const visible = landmarks.filter((point) => (
    finite(point.x)
    && finite(point.y)
    && (point.visibility ?? 0) >= minVisibility
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

function averagePoint(points) {
  const valid = points.filter((point) => point && finite(point.x) && finite(point.y));
  if (!valid.length) return null;
  return {
    x: averageNumbers(valid.map((point) => point.x)),
    y: averageNumbers(valid.map((point) => point.y)),
    z: averageNumbers(valid.map((point) => point.z).filter(finite)),
    visibility: averageNumbers(valid.map((point) => point.visibility).filter(finite)),
    sampleCount: valid.length,
  };
}

function footCenter(points, side, minVisibility) {
  const names = FOOT_LANDMARKS[side] || [];
  return averagePoint(names.map((name) => visibleLandmark(points, name, minVisibility)));
}

function scaleFor(points, box, minVisibility) {
  const leftShoulder = visibleLandmark(points, PoseLandmarks.LeftShoulder, minVisibility);
  const rightShoulder = visibleLandmark(points, PoseLandmarks.RightShoulder, minVisibility);
  const leftHip = visibleLandmark(points, PoseLandmarks.LeftHip, minVisibility);
  const rightHip = visibleLandmark(points, PoseLandmarks.RightHip, minVisibility);
  const shoulderWidth = distance(leftShoulder, rightShoulder) || 0;
  const hipWidth = distance(leftHip, rightHip) || 0;
  return {
    width: Math.max(shoulderWidth, hipWidth, 0.08),
    height: Math.max(box?.height || 0, 0.4),
  };
}

function lowerBodyVisible(points, minVisibility) {
  return LOWER_BODY_LANDMARKS.every((name) => visibleLandmark(points, name, minVisibility));
}

function stanceScores(features) {
  const {
    bothFeetVisible,
    lateralSeparationRatio,
    anteriorPosteriorSeparationRatio,
    verticalFootSeparationRatio,
    oneLegLiftConfidence,
  } = features;

  if (!bothFeetVisible) {
    return {
      side_by_side: 0,
      semi_tandem: 0,
      tandem: 0,
      one_leg: oneLegLiftConfidence,
    };
  }

  return {
    side_by_side: Math.min(
      clamp((lateralSeparationRatio - 0.18) / 0.24, 0, 1),
      clamp((0.24 - anteriorPosteriorSeparationRatio) / 0.2, 0, 1),
    ),
    semi_tandem: Math.min(
      clamp((anteriorPosteriorSeparationRatio - 0.08) / 0.18, 0, 1),
      clamp((lateralSeparationRatio - 0.10) / 0.22, 0, 1),
      clamp((0.52 - lateralSeparationRatio) / 0.28, 0, 1),
    ),
    tandem: Math.min(
      clamp((anteriorPosteriorSeparationRatio - 0.12) / 0.18, 0, 1),
      clamp((0.24 - lateralSeparationRatio) / 0.2, 0, 1),
    ),
    one_leg: Math.max(oneLegLiftConfidence, clamp((verticalFootSeparationRatio - 0.10) / 0.16, 0, 1)),
  };
}

function strongestStance(scores, minConfidence) {
  let best = null;
  let confidence = 0;
  for (const [id, score] of Object.entries(scores)) {
    if (score > confidence) {
      best = id;
      confidence = score;
    }
  }
  return confidence >= minConfidence ? { id: best, confidence } : { id: null, confidence };
}

function detectPossibleHandSupport(points, minVisibility, scale) {
  const leftWrist = visibleLandmark(points, PoseLandmarks.LeftWrist, minVisibility);
  const rightWrist = visibleLandmark(points, PoseLandmarks.RightWrist, minVisibility);
  const leftHip = visibleLandmark(points, PoseLandmarks.LeftHip, minVisibility);
  const rightHip = visibleLandmark(points, PoseLandmarks.RightHip, minVisibility);
  const leftShoulder = visibleLandmark(points, PoseLandmarks.LeftShoulder, minVisibility);
  const rightShoulder = visibleLandmark(points, PoseLandmarks.RightShoulder, minVisibility);
  const hipCenter = midpoint(leftHip, rightHip);
  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const shoulderWidth = Math.max(distance(leftShoulder, rightShoulder) || scale.width, 0.08);
  if (!hipCenter || !shoulderCenter) {
    return { possible: false, sides: [], score: 0 };
  }

  const sides = [];
  for (const [side, wrist] of [['left', leftWrist], ['right', rightWrist]]) {
    if (!wrist) continue;
    const belowHip = wrist.y >= hipCenter.y - scale.height * 0.03;
    const farLateral = Math.abs(wrist.x - shoulderCenter.x) >= shoulderWidth * 0.75;
    const veryLow = wrist.y >= hipCenter.y + scale.height * 0.12;
    if (belowHip && (farLateral || veryLow)) sides.push(side);
  }

  return {
    possible: sides.length > 0,
    sides,
    score: sides.length / 2,
  };
}

function extractFrameFeatures(frame, options) {
  const points = landmarkMap(frame.landmarks);
  const box = bodyBox(frame.landmarks, options.minVisibility);
  const scale = scaleFor(points, box, options.minVisibility);
  const leftFoot = footCenter(points, 'left', options.minVisibility);
  const rightFoot = footCenter(points, 'right', options.minVisibility);
  const bothFeetVisible = Boolean(leftFoot && rightFoot);
  const leftAnkle = visibleLandmark(points, PoseLandmarks.LeftAnkle, options.minVisibility);
  const rightAnkle = visibleLandmark(points, PoseLandmarks.RightAnkle, options.minVisibility);
  const jointAngles = frame.metrics?.jointAngles || calculateJointAngles(frame.landmarks, { minVisibility: options.minVisibility });
  const bodyCenter = frame.metrics?.bodyCenter || calculateBodyCenter(frame.landmarks, { minVisibility: options.minVisibility });
  const trunkLean = frame.metrics?.trunkLean || calculateTrunkLean(frame.landmarks, { minVisibility: options.minVisibility });

  const lateralSeparation = bothFeetVisible ? Math.abs(leftFoot.x - rightFoot.x) : null;
  const depthAvailable = bothFeetVisible && finite(leftFoot.z) && finite(rightFoot.z);
  const anteriorPosteriorSeparation = bothFeetVisible
    ? Math.abs((depthAvailable ? leftFoot.z - rightFoot.z : leftFoot.y - rightFoot.y))
    : null;
  const verticalFootSeparation = leftAnkle && rightAnkle ? Math.abs(leftAnkle.y - rightAnkle.y) : null;
  const leftRaised = leftAnkle && rightAnkle ? rightAnkle.y - leftAnkle.y : null;
  const rightRaised = leftAnkle && rightAnkle ? leftAnkle.y - rightAnkle.y : null;
  const oneLegLiftConfidence = Math.max(
    finite(leftRaised) ? clamp((leftRaised / scale.height - 0.08) / 0.12, 0, 1) : 0,
    finite(rightRaised) ? clamp((rightRaised / scale.height - 0.08) / 0.12, 0, 1) : 0,
  );

  const features = {
    frame,
    timestampMs: frame.timestampMs,
    confidence: frame.confidence,
    lowerBodyVisible: lowerBodyVisible(points, options.minVisibility),
    bodyCenter,
    trunkLean,
    jointAngles,
    footCenters: { left: leftFoot, right: rightFoot },
    bothFeetVisible,
    scale,
    bodyBox: box,
    anteriorPosteriorAxis: depthAvailable ? 'z' : 'y',
    lateralSeparationRatio: finite(lateralSeparation) ? lateralSeparation / scale.width : 0,
    anteriorPosteriorSeparationRatio: finite(anteriorPosteriorSeparation) ? anteriorPosteriorSeparation / scale.width : 0,
    verticalFootSeparationRatio: finite(verticalFootSeparation) ? verticalFootSeparation / scale.height : 0,
    oneLegLiftConfidence,
    possibleHandSupport: detectPossibleHandSupport(points, options.minVisibility, scale),
  };

  const scores = stanceScores(features);
  const stance = strongestStance(scores, options.minStanceConfidence);
  return {
    ...features,
    stanceScores: scores,
    detectedStance: stance.id,
    stanceConfidence: stance.confidence,
  };
}

function smoothStanceLabels(features, options) {
  const labels = Array(features.length).fill(null);
  let active = null;
  let pending = null;
  let pendingSinceMs = null;
  let pendingStartIndex = null;

  const confirmPending = (label, startIndex, currentIndex) => {
    active = label;
    for (let index = startIndex; index <= currentIndex; index += 1) labels[index] = label;
    pending = null;
    pendingSinceMs = null;
    pendingStartIndex = null;
  };

  for (let index = 0; index < features.length; index += 1) {
    const feature = features[index];
    const candidate = feature.detectedStance;
    const candidateIndex = STAGE_INDEX.has(candidate) ? STAGE_INDEX.get(candidate) : null;
    const activeIndex = STAGE_INDEX.has(active) ? STAGE_INDEX.get(active) : -1;
    const canEnterCandidate = candidate
      && candidateIndex !== null
      && candidateIndex >= activeIndex
      && feature.stanceConfidence >= options.minStanceConfidence;

    if (!active) {
      if (canEnterCandidate) {
        if (pending !== candidate) {
          pending = candidate;
          pendingSinceMs = feature.timestampMs;
          pendingStartIndex = index;
        }
        if (feature.timestampMs - pendingSinceMs >= options.entryConfirmMs) {
          confirmPending(candidate, pendingStartIndex, index);
        }
      } else {
        pending = null;
        pendingSinceMs = null;
        pendingStartIndex = null;
      }
      continue;
    }

    labels[index] = active;
    if (candidate === active && feature.stanceConfidence >= options.minStanceConfidence) {
      pending = null;
      pendingSinceMs = null;
      pendingStartIndex = null;
      continue;
    }

    const nextExpectedIndex = activeIndex + 1;
    const isNextStage = candidateIndex === nextExpectedIndex;
    const shouldSwitch = isNextStage && feature.stanceConfidence >= options.minStanceConfidence;
    const nextPending = shouldSwitch ? candidate : null;
    if (nextPending) {
      if (pending !== nextPending) {
        pending = nextPending;
        pendingSinceMs = feature.timestampMs;
        pendingStartIndex = index;
      }
      if (feature.timestampMs - pendingSinceMs >= options.entryConfirmMs) {
        confirmPending(nextPending, pendingStartIndex, index);
      }
      continue;
    }

    if (pending !== '__exit__') {
      pending = '__exit__';
      pendingSinceMs = feature.timestampMs;
      pendingStartIndex = index;
    }
    if (feature.timestampMs - pendingSinceMs >= options.exitConfirmMs) {
      active = null;
      pending = null;
      pendingSinceMs = null;
      pendingStartIndex = null;
    }
  }

  return labels;
}

function segmentsFromLabels(labels, features) {
  const segments = [];
  let current = null;
  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index];
    if (!label) {
      if (current) {
        current.endIndex = index - 1;
        segments.push(current);
        current = null;
      }
      continue;
    }
    if (!current || current.id !== label) {
      if (current) {
        current.endIndex = index - 1;
        segments.push(current);
      }
      current = { id: label, startIndex: index, endIndex: index };
    } else {
      current.endIndex = index;
    }
  }
  if (current) segments.push(current);
  return segments.map((segment) => ({
    ...segment,
    startedAtMs: features[segment.startIndex]?.timestampMs ?? null,
    endedAtMs: features[segment.endIndex]?.timestampMs ?? null,
  }));
}

function axisMetric(samples, valueFor) {
  const values = samples
    .map(valueFor)
    .filter(finite);
  if (values.length < 2) {
    return {
      range: null,
      standardDeviation: null,
      meanAbsoluteVelocity: null,
      pathLength: null,
    };
  }

  const mean = averageNumbers(values);
  const variance = averageNumbers(values.map((value) => (value - mean) ** 2));
  const velocities = [];
  let pathLength = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const current = valueFor(samples[index]);
    const previous = valueFor(samples[index - 1]);
    const deltaSeconds = (samples[index].timestampMs - samples[index - 1].timestampMs) / 1000;
    if (!finite(current) || !finite(previous)) continue;
    const delta = Math.abs(current - previous);
    pathLength += delta;
    if (deltaSeconds > 0) velocities.push(delta / deltaSeconds);
  }

  return {
    range: Math.max(...values) - Math.min(...values),
    standardDeviation: Math.sqrt(variance),
    meanAbsoluteVelocity: averageNumbers(velocities),
    pathLength,
  };
}

function angularMetric(samples, valueFor) {
  const angles = samples.map(valueFor).filter(finite);
  if (angles.length < 2) {
    return {
      rangeDegrees: null,
      netChangeDegrees: null,
      meanAbsoluteVelocityDegPerSec: null,
      maxAbsoluteVelocityDegPerSec: null,
    };
  }

  const velocities = [];
  for (let index = 1; index < samples.length; index += 1) {
    const current = valueFor(samples[index]);
    const previous = valueFor(samples[index - 1]);
    const deltaSeconds = (samples[index].timestampMs - samples[index - 1].timestampMs) / 1000;
    if (finite(current) && finite(previous) && deltaSeconds > 0) {
      velocities.push(Math.abs(current - previous) / deltaSeconds);
    }
  }

  return {
    rangeDegrees: Math.max(...angles) - Math.min(...angles),
    netChangeDegrees: angles.at(-1) - angles[0],
    meanAbsoluteVelocityDegPerSec: averageNumbers(velocities),
    maxAbsoluteVelocityDegPerSec: velocities.length ? Math.max(...velocities) : null,
  };
}

function footMovementMetric(samples, stageId, options) {
  const first = samples.find((sample) => sample.footCenters.left || sample.footCenters.right);
  if (!first) {
    return {
      sampleCount: 0,
      exitObserved: false,
      exitFrameCount: 0,
      firstExitAtMs: null,
      firstCandidateExitAtMs: null,
      firstExitAxis: null,
      maxDisplacementRatio: null,
      maxMediolateralDisplacementRatio: null,
      maxAnteriorPosteriorDisplacementRatio: null,
      confirmFrameThreshold: options.footMovementExitConfirmFrames,
      exitByAxis: {
        mediolateral: { observed: false, frameCount: 0, firstObservedAtMs: null },
        anteriorPosterior: { observed: false, frameCount: 0, firstObservedAtMs: null },
      },
      byFoot: {},
    };
  }

  const supportFootForOneLeg = (() => {
    if (stageId !== 'one_leg') return null;
    const visible = samples
      .map((sample) => sample.footCenters)
      .filter((feet) => feet.left && feet.right);
    if (!visible.length) return null;
    const leftLowerCount = visible.filter((feet) => feet.left.y > feet.right.y).length;
    return leftLowerCount >= visible.length / 2 ? 'left' : 'right';
  })();

  const feetToTrack = stageId === 'one_leg' && supportFootForOneLeg
    ? [supportFootForOneLeg]
    : ['left', 'right'];

  const byFoot = {};
  let maxDisplacementRatio = 0;
  let maxMediolateralDisplacementRatio = 0;
  let maxAnteriorPosteriorDisplacementRatio = 0;
  let firstExitAtMs = null;
  let firstExitAxis = null;
  let exitFrameCount = 0;
  const confirmFrames = Math.max(1, options.footMovementExitConfirmFrames || 1);
  const exitByAxis = {
    mediolateral: { observed: false, frameCount: 0, firstObservedAtMs: null },
    anteriorPosterior: { observed: false, frameCount: 0, firstObservedAtMs: null },
  };

  for (const foot of feetToTrack) {
    const baseline = first.footCenters[foot];
    if (!baseline) continue;
    const distances = [];
    const mediolateralDistances = [];
    const anteriorPosteriorDistances = [];
    for (const sample of samples) {
      const current = sample.footCenters[foot];
      if (!current) continue;
      const mlDelta = current.x - baseline.x;
      const apDelta = sample.anteriorPosteriorAxis === 'z' && finite(current.z) && finite(baseline.z)
        ? current.z - baseline.z
        : current.y - baseline.y;
      const mediolateralRatio = Math.abs(mlDelta) / sample.scale.width;
      const anteriorPosteriorRatio = Math.abs(apDelta) / sample.scale.width;
      const planar = Math.hypot(current.x - baseline.x, apDelta);
      const ratio = planar / sample.scale.width;
      distances.push(ratio);
      mediolateralDistances.push(mediolateralRatio);
      anteriorPosteriorDistances.push(anteriorPosteriorRatio);
      maxDisplacementRatio = Math.max(maxDisplacementRatio, ratio);
      maxMediolateralDisplacementRatio = Math.max(maxMediolateralDisplacementRatio, mediolateralRatio);
      maxAnteriorPosteriorDisplacementRatio = Math.max(maxAnteriorPosteriorDisplacementRatio, anteriorPosteriorRatio);
      if (mediolateralRatio >= options.footMovementExitThreshold) {
        exitByAxis.mediolateral.frameCount += 1;
        if (!exitByAxis.mediolateral.firstObservedAtMs) {
          exitByAxis.mediolateral.firstObservedAtMs = sample.timestampMs;
        }
      }
      if (anteriorPosteriorRatio >= options.footMovementExitThreshold) {
        exitByAxis.anteriorPosterior.frameCount += 1;
        if (!exitByAxis.anteriorPosterior.firstObservedAtMs) {
          exitByAxis.anteriorPosterior.firstObservedAtMs = sample.timestampMs;
        }
      }
      if (ratio >= options.footMovementExitThreshold) {
        exitFrameCount += 1;
        if (!firstExitAtMs) firstExitAtMs = sample.timestampMs;
        if (!firstExitAxis) {
          firstExitAxis = mediolateralRatio >= anteriorPosteriorRatio ? 'mediolateral' : 'anteriorPosterior';
        }
      }
    }
    byFoot[foot] = {
      tracked: true,
      maxDisplacementRatio: distances.length ? Math.max(...distances) : null,
      meanDisplacementRatio: averageNumbers(distances),
      maxMediolateralDisplacementRatio: mediolateralDistances.length ? Math.max(...mediolateralDistances) : null,
      meanMediolateralDisplacementRatio: averageNumbers(mediolateralDistances),
      maxAnteriorPosteriorDisplacementRatio: anteriorPosteriorDistances.length ? Math.max(...anteriorPosteriorDistances) : null,
      meanAnteriorPosteriorDisplacementRatio: averageNumbers(anteriorPosteriorDistances),
    };
  }

  exitByAxis.mediolateral.observed = exitByAxis.mediolateral.frameCount >= confirmFrames;
  exitByAxis.anteriorPosterior.observed = exitByAxis.anteriorPosterior.frameCount >= confirmFrames;
  const exitObserved = exitFrameCount >= confirmFrames;

  return {
    sampleCount: samples.length,
    supportFoot: supportFootForOneLeg,
    exitObserved,
    exitFrameCount,
    firstExitAtMs: exitObserved ? firstExitAtMs : null,
    firstCandidateExitAtMs: firstExitAtMs,
    firstExitAxis: exitObserved ? firstExitAxis : null,
    maxDisplacementRatio,
    maxMediolateralDisplacementRatio,
    maxAnteriorPosteriorDisplacementRatio,
    thresholdRatio: options.footMovementExitThreshold,
    confirmFrameThreshold: confirmFrames,
    exitByAxis,
    byFoot,
  };
}

function handSupportMetric(samples, options) {
  const supportSamples = samples.filter((sample) => sample.possibleHandSupport.possible);
  const frameRatio = samples.length ? supportSamples.length / samples.length : 0;
  return {
    possible: frameRatio >= options.handSupportRatioThreshold,
    frameCount: supportSamples.length,
    frameRatio,
    firstObservedAtMs: supportSamples[0]?.timestampMs ?? null,
    sides: [...new Set(supportSamples.flatMap((sample) => sample.possibleHandSupport.sides))],
  };
}

function windowMetrics(samples, stageId, options) {
  const validCenters = samples.filter((sample) => sample.bodyCenter);
  const zRatio = validCenters.length
    ? validCenters.filter((sample) => finite(sample.bodyCenter.z)).length / validCenters.length
    : 0;
  const anteriorPosteriorAxis = zRatio >= 0.6 ? 'z' : 'y';

  return {
    sampleCount: samples.length,
    durationSeconds: samples.length >= 2
      ? (samples.at(-1).timestampMs - samples[0].timestampMs) / 1000
      : 0,
    sway: {
      mediolateral: axisMetric(validCenters, (sample) => sample.bodyCenter.x / sample.scale.width),
      anteriorPosterior: axisMetric(validCenters, (sample) => {
        const value = anteriorPosteriorAxis === 'z' ? sample.bodyCenter.z : sample.bodyCenter.y;
        return finite(value) ? value / sample.scale.width : null;
      }),
      anteriorPosteriorAxis,
    },
    ankleAngleChange: {
      left: angularMetric(samples, (sample) => sample.jointAngles.ankles.left),
      right: angularMetric(samples, (sample) => sample.jointAngles.ankles.right),
      average: angularMetric(samples, (sample) => sample.jointAngles.ankles.average),
    },
    trunkLeanDegrees: angularMetric(samples, (sample) => sample.trunkLean?.angleDegrees),
    footMovement: footMovementMetric(samples, stageId, options),
    handSupport: handSupportMetric(samples, options),
  };
}

function emptyMetrics() {
  return {
    sampleCount: 0,
    durationSeconds: 0,
    sway: {
      mediolateral: axisMetric([], () => null),
      anteriorPosterior: axisMetric([], () => null),
      anteriorPosteriorAxis: 'z',
    },
    ankleAngleChange: {
      left: angularMetric([], () => null),
      right: angularMetric([], () => null),
      average: angularMetric([], () => null),
    },
    trunkLeanDegrees: angularMetric([], () => null),
    footMovement: {
      sampleCount: 0,
      exitObserved: false,
      exitFrameCount: 0,
      firstExitAtMs: null,
      firstCandidateExitAtMs: null,
      firstExitAxis: null,
      maxDisplacementRatio: null,
      maxMediolateralDisplacementRatio: null,
      maxAnteriorPosteriorDisplacementRatio: null,
      confirmFrameThreshold: DEFAULT_BALANCE_OPTIONS.footMovementExitConfirmFrames,
      exitByAxis: {
        mediolateral: { observed: false, frameCount: 0, firstObservedAtMs: null },
        anteriorPosterior: { observed: false, frameCount: 0, firstObservedAtMs: null },
      },
      byFoot: {},
    },
    handSupport: {
      possible: false,
      frameCount: 0,
      frameRatio: 0,
      firstObservedAtMs: null,
      sides: [],
    },
  };
}

function stageResult(stage, segment, features, options) {
  if (!segment) {
    return {
      ...stage,
      status: 'not_observed',
      holdSeconds: 0,
      startedAtMs: null,
      endedAtMs: null,
      dynamicAdjustment: emptyMetrics(),
      staticHold: emptyMetrics(),
      totalHold: emptyMetrics(),
    };
  }

  const samples = features.slice(segment.startIndex, segment.endIndex + 1);
  const startedAtMs = samples[0]?.timestampMs ?? null;
  const endedAtMs = samples.at(-1)?.timestampMs ?? null;
  const holdSeconds = startedAtMs !== null && endedAtMs !== null ? (endedAtMs - startedAtMs) / 1000 : 0;
  const dynamicEndMs = startedAtMs + options.dynamicAdjustmentSeconds * 1000;
  const dynamicSamples = samples.filter((sample) => sample.timestampMs <= dynamicEndMs);
  const staticSamples = samples.filter((sample) => sample.timestampMs > dynamicEndMs);

  return {
    ...stage,
    status: holdSeconds >= stage.targetHoldSeconds ? 'completed' : 'observed',
    holdSeconds,
    startedAtMs,
    endedAtMs,
    dynamicAdjustment: windowMetrics(dynamicSamples, stage.id, options),
    staticHold: windowMetrics(staticSamples, stage.id, options),
    totalHold: windowMetrics(samples, stage.id, options),
  };
}

function pickStageSegments(segments) {
  const picked = new Map();
  let searchStart = 0;
  for (const stage of FOUR_STAGE_BALANCE_STAGES) {
    const segment = segments.find((candidate) => (
      candidate.id === stage.id
      && candidate.startIndex >= searchStart
    ));
    if (segment) {
      picked.set(stage.id, segment);
      searchStart = segment.endIndex + 1;
    }
  }
  return picked;
}

function frameRate(frames) {
  if (frames.length < 2) return null;
  const durationMs = frames.at(-1).timestampMs - frames[0].timestampMs;
  return durationMs > 0 ? (frames.length - 1) * 1000 / durationMs : null;
}

/**
 * Converts a W1 landmark series into structured, interpretation-free 4-stage balance measurements.
 * @param {Object|Array} seriesInput PoseLandmarkSeries snapshot, `{ frames }`, or frame array.
 * @param {Partial<typeof DEFAULT_BALANCE_OPTIONS>} optionsInput
 * @returns {BalanceResult}
 */
export function analyzeFourStageBalanceSeries(seriesInput, optionsInput = {}) {
  const options = mergeOptions(optionsInput);
  const frames = framesFromSeries(seriesInput);
  const features = frames.map((frame) => extractFrameFeatures(frame, options));
  const labels = smoothStanceLabels(features, options);
  const segments = segmentsFromLabels(labels, features);
  const pickedSegments = pickStageSegments(segments);
  const stages = FOUR_STAGE_BALANCE_STAGES.map((stage) => stageResult(stage, pickedSegments.get(stage.id), features, options));
  const stageById = Object.fromEntries(stages.map((stage) => [stage.id, stage]));
  const confidence = averageNumbers(features.map((feature) => feature.confidence).filter(finite)) ?? 0;

  return {
    schemaVersion: BALANCE_RESULT_SCHEMA_VERSION,
    testType: FOUR_STAGE_BALANCE_TEST_TYPE,
    dynamicAdjustmentSeconds: options.dynamicAdjustmentSeconds,
    frameCount: frames.length,
    frameRateFps: frameRate(frames),
    startedAtMs: frames[0]?.timestampMs ?? null,
    completedAtMs: frames.at(-1)?.timestampMs ?? null,
    confidence,
    stages,
    stageById,
    stateMachine: {
      stageOrder: FOUR_STAGE_BALANCE_STAGES.map((stage) => stage.id),
      entryConfirmMs: options.entryConfirmMs,
      exitConfirmMs: options.exitConfirmMs,
      minStanceConfidence: options.minStanceConfidence,
      rawSegments: segments,
    },
  };
}

function currentStageFromResult(balanceResult) {
  return [...balanceResult.stages].reverse().find((stage) => stage.status !== 'not_observed')
    || balanceResult.stages[0];
}

export class FourStageBalanceAnalyzer {
  constructor({ durationSeconds = 40 } = {}) {
    this.durationSeconds = durationSeconds;
    this.reset();
  }

  startSession(userId = 'remote-user', startedAt = Date.now()) {
    this.reset();
    this.userId = userId;
    this.startedAt = startedAt;
  }

  addFrame(frame) {
    if (!this.startedAt) return this.latestState;
    this.frames.push(frame);
    this.balanceResult = analyzeFourStageBalanceSeries({ frames: this.frames });
    this.latestState = this.stateFromResult(frame.timestampMs);
    return this.latestState;
  }

  addManualRepetition() {
    return this.latestState;
  }

  getCurrentState(nowMs = Date.now()) {
    return { ...this.latestState, elapsedSeconds: this.elapsedSeconds(nowMs) };
  }

  finishSession(completedAt = Date.now()) {
    this.balanceResult = analyzeFourStageBalanceSeries({ frames: this.frames });
    const tandemHold = this.balanceResult.stageById.tandem?.holdSeconds ?? 0;
    const totalStaticSamples = this.balanceResult.stages.reduce(
      (sum, stage) => sum + stage.staticHold.sampleCount,
      0,
    );

    return {
      testType: FOUR_STAGE_BALANCE_TEST_TYPE,
      primaryValue: Number(tandemHold.toFixed(2)),
      primaryLabel: 'Tandem Hold Seconds',
      repetitionCount: Number(tandemHold.toFixed(2)),
      durationSeconds: this.durationSeconds,
      confidence: this.balanceResult.confidence,
      recommendationLevel: RecommendationLevels.MeasurementOnly,
      stabilityScore: totalStaticSamples ? this.balanceResult.confidence : 0,
      balanceResult: this.balanceResult,
      summaryMessage: '4-stage balance measurements captured without risk interpretation.',
      startedAt: this.startedAt,
      completedAt,
    };
  }

  reset() {
    this.userId = null;
    this.startedAt = null;
    this.frames = [];
    this.balanceResult = analyzeFourStageBalanceSeries({ frames: [] });
    this.latestState = this.stateFromResult(Date.now());
  }

  elapsedSeconds(nowMs) {
    const start = this.startedAt ?? nowMs;
    return clamp(Math.floor(Math.max(nowMs - start, 0) / 1000), 0, this.durationSeconds);
  }

  stateFromResult(nowMs) {
    const currentStage = currentStageFromResult(this.balanceResult);
    const completedCount = this.balanceResult.stages.filter((stage) => stage.status === 'completed').length;
    const currentHold = currentStage?.holdSeconds ?? 0;
    const hasVisiblePose = this.balanceResult.frameCount > 0 && this.balanceResult.confidence > 0;

    return {
      repetitionCount: Number(currentHold.toFixed(2)),
      primaryValue: Number(currentHold.toFixed(2)),
      primaryLabel: `${currentStage?.title || 'Balance'} Hold`,
      elapsedSeconds: this.elapsedSeconds(nowMs),
      durationSeconds: this.durationSeconds,
      confidence: this.balanceResult.confidence,
      isFullBodyVisible: hasVisiblePose,
      warningMessage: hasVisiblePose ? null : 'The camera has not found a full-body balance pose yet.',
      postureMessage: `${completedCount}/4 balance stages completed or observed.`,
      isArmUseSuspected: Boolean(currentStage?.totalHold.handSupport.possible),
      isStandingOrRising: hasVisiblePose,
      phase: currentStage?.id || 'waiting',
      balanceResult: this.balanceResult,
    };
  }
}

function fmt(value, digits = 2) {
  return finite(value) ? value.toFixed(digits) : '-';
}

function stageLogLine(stage) {
  const dynamicMl = stage.dynamicAdjustment.sway.mediolateral.standardDeviation;
  const dynamicAp = stage.dynamicAdjustment.sway.anteriorPosterior.standardDeviation;
  const staticMl = stage.staticHold.sway.mediolateral.standardDeviation;
  const staticAp = stage.staticHold.sway.anteriorPosterior.standardDeviation;
  const ankleRange = stage.totalHold.ankleAngleChange.average.rangeDegrees;
  const footMove = stage.totalHold.footMovement.maxDisplacementRatio;
  const handSupport = stage.totalHold.handSupport.frameRatio;
  return [
    `${stage.order}. ${stage.id}`,
    `hold=${fmt(stage.holdSeconds)}s`,
    `target=${stage.targetHoldSeconds}s`,
    `status=${stage.status}`,
    `dynamicMLsd=${fmt(dynamicMl, 4)}`,
    `dynamicAPsd=${fmt(dynamicAp, 4)}`,
    `staticMLsd=${fmt(staticMl, 4)}`,
    `staticAPsd=${fmt(staticAp, 4)}`,
    `ankleRange=${fmt(ankleRange)}deg`,
    `footMove=${fmt(footMove, 4)}`,
    `handSupportRatio=${fmt(handSupport, 3)}`,
  ].join(' | ');
}

export function formatBalanceResultLog(balanceResult) {
  return [
    `Balance result ${balanceResult.schemaVersion}`,
    `frames=${balanceResult.frameCount} fps=${fmt(balanceResult.frameRateFps)} confidence=${fmt(balanceResult.confidence, 3)}`,
    `dynamicAdjustmentSeconds=${balanceResult.dynamicAdjustmentSeconds}`,
    ...balanceResult.stages.map(stageLogLine),
  ].join('\n');
}
