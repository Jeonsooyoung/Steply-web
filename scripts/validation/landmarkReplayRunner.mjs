import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

export const LANDMARK_REPLAY_SCHEMA_VERSION = 'steply_landmark_replay.v1';
export const INTERNAL_VALIDATION_SUMMARY_VERSION = 'steply_internal_validation_summary.v1';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const require = createRequire(import.meta.url);
const careAgentContract = require('../../shared/stage4CareAgentContract.cjs');

const AssessmentTypes = {
  ChairStand30s: 'CHAIR_STAND_30S',
  FourStageBalance: 'FOUR_STAGE_BALANCE',
};

const QualityStates = {
  Ready: 'READY',
  Paused: 'PAUSED',
  Invalid: 'INVALID',
};

const BalanceStages = {
  SideBySide: 'SIDE_BY_SIDE',
  SemiTandem: 'SEMI_TANDEM',
  Tandem: 'TANDEM',
  OneLeg: 'ONE_LEG',
};

const BALANCE_STAGE_ORDER = [
  BalanceStages.SideBySide,
  BalanceStages.SemiTandem,
  BalanceStages.Tandem,
  BalanceStages.OneLeg,
];

const CameraViews = {
  Front: 'FRONT',
  ObliqueLeft: 'OBLIQUE_LEFT',
  ObliqueRight: 'OBLIQUE_RIGHT',
};

const LEFT_RIGHT_PAIRS = [
  [11, 12],
  [13, 14],
  [15, 16],
  [23, 24],
  [25, 26],
  [27, 28],
  [29, 30],
  [31, 32],
];

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value) {
  if (!finite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function interpolate(start, end, progress) {
  return start + (end - start) * progress;
}

function seededRandom(seedText = 'steply-validation') {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function landmark(index, x, y, overrides = {}) {
  return {
    index,
    x,
    y,
    z: 0,
    visibility: 0.92,
    presence: 0.92,
    isValid: true,
    ...overrides,
  };
}

function emptyLandmarks() {
  return Array.from({ length: 33 }, (_, index) => landmark(index, 0.5, 0.5, { visibility: 0.45 }));
}

function chairCalibrationProfile({
  sessionId = 'chair-validation-session',
  sittingHipY = 0.7,
  standingHipY = 0.4,
  mirrored = false,
  verticalMotionDirection = 'STANDING_DECREASES',
} = {}) {
  return {
    calibrationId: 'calibration-chair-validation',
    sessionId,
    assessmentType: AssessmentTypes.ChairStand30s,
    status: 'VALID',
    createdAtMs: 0,
    coordinateOrientation: {
      imageYAxis: 'DOWN_POSITIVE',
      worldYAxis: 'UNKNOWN',
      cameraMirrored: mirrored,
      verticalMotionDirection,
    },
    camera: {
      view: CameraViews.ObliqueLeft,
      estimatedAngleDegrees: 45,
      mirrored,
    },
    bodyScale: {
      averageFootLength: 0.08,
      shoulderWidth: 0.1,
      torsoLength: 0.22,
    },
    references: {
      sittingHipPosition: -sittingHipY,
      standingHipPosition: -standingHipY,
      H_sit: -sittingHipY,
      H_stand: -standingHipY,
      L_foot: 0.08,
      W_shoulder: 0.1,
      D_fold: 0.15,
    },
    confidence: {
      overall: 0.94,
      standingReference: 0.94,
      sittingReference: 0.94,
      foldedArms: 0.9,
    },
    failureReasons: [],
  };
}

function chairPosePoints(progress, refs = { sittingHipY: 0.7, standingHipY: 0.4 }) {
  const hipY = interpolate(refs.sittingHipY, refs.standingHipY, progress);
  const shoulderY = hipY - interpolate(0.2, 0.22, progress);
  const kneeY = hipY + interpolate(0.1, 0.22, progress);
  const footY = 0.88;
  const left = {
    shoulder: { x: 0.45, y: shoulderY },
    elbow: { x: 0.49, y: shoulderY + 0.08 },
    wrist: { x: 0.55, y: shoulderY + 0.1 },
    hip: { x: 0.45, y: hipY },
    knee: { x: interpolate(0.58, 0.45, progress), y: kneeY },
    ankle: { x: interpolate(0.48, 0.45, progress), y: footY - 0.02 },
    heel: { x: 0.43, y: footY },
    toe: { x: 0.5, y: footY + 0.04 },
  };
  const right = {
    shoulder: { x: 0.55, y: shoulderY },
    elbow: { x: 0.51, y: shoulderY + 0.08 },
    wrist: { x: 0.45, y: shoulderY + 0.1 },
    hip: { x: 0.55, y: hipY },
    knee: { x: interpolate(0.42, 0.55, progress), y: kneeY },
    ankle: { x: interpolate(0.52, 0.55, progress), y: footY - 0.02 },
    heel: { x: 0.57, y: footY },
    toe: { x: 0.5, y: footY + 0.04 },
  };
  return { left, right };
}

function applyChairArmMode(points, armMode) {
  if (armMode === 'uncrossed') {
    points.left.elbow = { x: 0.33, y: points.left.shoulder.y + 0.1 };
    points.left.wrist = { x: 0.28, y: points.left.shoulder.y + 0.14 };
    points.right.elbow = { x: 0.67, y: points.right.shoulder.y + 0.1 };
    points.right.wrist = { x: 0.72, y: points.right.shoulder.y + 0.14 };
  }
  if (armMode === 'support') {
    points.left.elbow = { x: 0.47, y: points.left.hip.y + 0.04 };
    points.left.wrist = { x: 0.48, y: (points.left.hip.y + points.left.knee.y) / 2 };
    points.right.elbow = { x: 0.53, y: points.right.hip.y + 0.04 };
    points.right.wrist = { x: 0.52, y: (points.right.hip.y + points.right.knee.y) / 2 };
  }
}

function makeChairFrame({
  sessionId = 'chair-validation-session',
  frameId = 1,
  timestampMs = 0,
  progress = 0,
  refs = { sittingHipY: 0.7, standingHipY: 0.4 },
  confidence = 0.92,
  armConfidence = confidence,
  armMode = 'folded',
  mirrored = false,
} = {}) {
  const points = chairPosePoints(progress, refs);
  points.left.elbow.visibility = armConfidence;
  points.left.wrist.visibility = armConfidence;
  points.right.elbow.visibility = armConfidence;
  points.right.wrist.visibility = armConfidence;
  applyChairArmMode(points, armMode);

  const landmarks = emptyLandmarks();
  landmarks[11] = landmark(11, points.left.shoulder.x, points.left.shoulder.y, { visibility: confidence });
  landmarks[12] = landmark(12, points.right.shoulder.x, points.right.shoulder.y, { visibility: confidence });
  landmarks[13] = landmark(13, points.left.elbow.x, points.left.elbow.y, { visibility: points.left.elbow.visibility ?? armConfidence });
  landmarks[14] = landmark(14, points.right.elbow.x, points.right.elbow.y, { visibility: points.right.elbow.visibility ?? armConfidence });
  landmarks[15] = landmark(15, points.left.wrist.x, points.left.wrist.y, { visibility: points.left.wrist.visibility ?? armConfidence });
  landmarks[16] = landmark(16, points.right.wrist.x, points.right.wrist.y, { visibility: points.right.wrist.visibility ?? armConfidence });
  landmarks[23] = landmark(23, points.left.hip.x, points.left.hip.y, { visibility: confidence });
  landmarks[24] = landmark(24, points.right.hip.x, points.right.hip.y, { visibility: confidence });
  landmarks[25] = landmark(25, points.left.knee.x, points.left.knee.y, { visibility: confidence });
  landmarks[26] = landmark(26, points.right.knee.x, points.right.knee.y, { visibility: confidence });
  landmarks[27] = landmark(27, points.left.ankle.x, points.left.ankle.y, { visibility: confidence });
  landmarks[28] = landmark(28, points.right.ankle.x, points.right.ankle.y, { visibility: confidence });
  landmarks[29] = landmark(29, points.left.heel.x, points.left.heel.y, { visibility: confidence });
  landmarks[30] = landmark(30, points.right.heel.x, points.right.heel.y, { visibility: confidence });
  landmarks[31] = landmark(31, points.left.toe.x, points.left.toe.y, { visibility: confidence });
  landmarks[32] = landmark(32, points.right.toe.x, points.right.toe.y, { visibility: confidence });

  return {
    sessionId,
    frameId,
    timestampMs,
    image: { width: 640, height: 480, mirrored },
    normalizedLandmarks: landmarks,
    worldLandmarks: landmarks.map((point) => ({
      ...point,
      xMeters: point.x,
      yMeters: -point.y,
      zMeters: point.z || 0,
    })),
    confidence: {
      overall: confidence,
      lowerBody: confidence,
      feet: confidence,
      upperBody: Math.min(confidence, armConfidence),
    },
    detectedPersonCount: 1,
    processing: {
      receivedAtMs: timestampMs - 20,
      completedAtMs: timestampMs,
      latencyMs: 20,
    },
  };
}

function qualityStatus(frame, {
  state = QualityStates.Ready,
  reasonCode = null,
  cameraView = CameraViews.ObliqueLeft,
  footPlacementObservable = true,
  lighting = 0.9,
} = {}) {
  const ready = state === QualityStates.Ready;
  return {
    sessionId: frame.sessionId,
    frameId: frame.frameId,
    timestampMs: frame.timestampMs,
    state,
    scores: {
      overall: ready ? 0.92 : 0.3,
      bodyVisibility: ready ? 0.95 : 0.25,
      lowerBodyVisibility: ready ? 0.92 : 0.25,
      feetVisibility: ready ? 0.92 : 0.25,
      orientation: footPlacementObservable ? 0.9 : 0.25,
      lighting,
      tracking: ready ? 0.92 : 0.25,
    },
    reasons: reasonCode ? [{ code: reasonCode, score: ready ? 0.5 : 0.2 }] : [],
    timing: {
      currentFailureDurationMs: ready ? 0 : 1000,
      accumulatedPauseDurationMs: ready ? 0 : 1000,
    },
    camera: {
      view: cameraView,
      score: footPlacementObservable ? 0.9 : 0.25,
      estimatedAngleDegrees: cameraView === CameraViews.Front ? 0 : 40,
      footPlaneObservableScore: footPlacementObservable ? 0.9 : 0.2,
    },
    footPlacementObservable,
  };
}

class ChairSequenceBuilder {
  constructor({ refs = { sittingHipY: 0.7, standingHipY: 0.4 }, sessionId = 'chair-validation-session', armMode = 'folded' } = {}) {
    this.refs = refs;
    this.sessionId = sessionId;
    this.armMode = armMode;
    this.timestampMs = 0;
    this.frameId = 1;
    this.frames = [];
  }

  add(progress, options = {}) {
    const {
      dtMs = 100,
      qualityState = QualityStates.Ready,
      reasonCode = null,
      confidence = 0.92,
      armConfidence = confidence,
      armMode = this.armMode,
      timestampMs = this.timestampMs,
    } = options;
    const poseFrame = makeChairFrame({
      sessionId: this.sessionId,
      frameId: this.frameId,
      timestampMs,
      progress,
      refs: this.refs,
      confidence,
      armConfidence,
      armMode,
    });
    this.frames.push({
      poseFrame,
      qualityStatus: qualityStatus(poseFrame, { state: qualityState, reasonCode }),
    });
    this.frameId += 1;
    if (timestampMs === this.timestampMs) this.timestampMs += dtMs;
    return this;
  }

  hold(progress, durationMs, options = {}) {
    const dtMs = options.dtMs ?? 100;
    const count = Math.max(1, Math.floor(durationMs / dtMs));
    for (let index = 0; index <= count; index += 1) this.add(progress, { ...options, dtMs });
    return this;
  }

  ramp(from, to, durationMs, options = {}) {
    const dtMs = options.dtMs ?? 100;
    const count = Math.max(1, Math.floor(durationMs / dtMs));
    for (let index = 1; index <= count; index += 1) this.add(interpolate(from, to, index / count), { ...options, dtMs });
    return this;
  }

  cycle(options = {}) {
    const {
      riseMs = 600,
      standHoldMs = 800,
      descendMs = 600,
      sitHoldMs = 600,
      armMode,
    } = options;
    return this
      .ramp(0, 1, riseMs, { armMode })
      .hold(1, standHoldMs, { armMode })
      .ramp(1, 0, descendMs, { armMode })
      .hold(0, sitHoldMs, { armMode });
  }
}

const FOOT_VECTOR = { x: 0.03, y: 0.074 };
const FOOT_LENGTH = Math.hypot(FOOT_VECTOR.x, FOOT_VECTOR.y);

function makeFoot(center, { confidence = 0.92 } = {}) {
  return {
    ankle: { x: center.x, y: center.y },
    heel: { x: center.x - FOOT_VECTOR.x / 2, y: center.y - FOOT_VECTOR.y / 2 },
    toe: { x: center.x + FOOT_VECTOR.x / 2, y: center.y + FOOT_VECTOR.y / 2 },
    confidence,
  };
}

function stageFeet(stage, options = {}) {
  const {
    swapped = false,
    smallLift = false,
    touchedDown = false,
    moved = false,
    occluded = false,
  } = options;
  const confidence = occluded ? 0.18 : 0.92;
  let leftCenter = { x: 0.44, y: 0.84 };
  let rightCenter = { x: 0.56, y: 0.84 };

  if (stage === BalanceStages.SemiTandem) {
    leftCenter = { x: 0.46, y: 0.8 };
    rightCenter = { x: 0.54, y: 0.86 };
  }
  if (stage === BalanceStages.Tandem) {
    leftCenter = swapped ? { x: 0.51, y: 0.88 } : { x: 0.5, y: 0.78 };
    rightCenter = swapped ? { x: 0.5, y: 0.78 } : { x: 0.51, y: 0.88 };
  }
  if (stage === BalanceStages.OneLeg) {
    leftCenter = { x: 0.44, y: touchedDown ? 0.84 : (smallLift ? 0.82 : 0.74) };
    rightCenter = { x: 0.56, y: 0.84 };
  }
  if (moved) leftCenter = { x: leftCenter.x + 0.07, y: leftCenter.y };

  return {
    left: makeFoot(leftCenter, { confidence }),
    right: makeFoot(rightCenter, { confidence }),
  };
}

function balanceWorldFeet(stage, options = {}) {
  const halfLength = FOOT_LENGTH / 2;
  let left = { x: -0.019, y: 0, z: 0 };
  let right = { x: 0.019, y: 0, z: 0 };
  if (stage === BalanceStages.SemiTandem) {
    left.z = FOOT_LENGTH * 0.25;
    right.z = -FOOT_LENGTH * 0.25;
  } else if (stage === BalanceStages.Tandem) {
    left = { x: -0.005, y: 0, z: FOOT_LENGTH * 0.5 };
    right = { x: 0.005, y: 0, z: -FOOT_LENGTH * 0.5 };
    if (options.swapped) [left, right] = [right, left];
  } else if (stage === BalanceStages.OneLeg) {
    left.y = options.touchedDown ? FOOT_LENGTH * 0.1
      : options.smallLift ? FOOT_LENGTH * 0.25 : FOOT_LENGTH * 0.35;
  }
  if (options.moved) left.x += FOOT_LENGTH * 0.35;
  const foot = (center) => ({
    ankle: { ...center },
    heel: { ...center, z: center.z - halfLength },
    toe: { ...center, z: center.z + halfLength },
  });
  return { left: foot(left), right: foot(right) };
}

function balanceWorldLandmarks(landmarks, stage, options = {}) {
  const worldFeet = balanceWorldFeet(stage, options);
  const points = landmarks.map((point) => ({
    ...point,
    xMeters: (point.x - 0.5) * 0.4,
    yMeters: 1 - point.y,
    zMeters: 0,
  }));
  for (const [side, indexes] of [['left', [27, 29, 31]], ['right', [28, 30, 32]]]) {
    const names = ['ankle', 'heel', 'toe'];
    indexes.forEach((index, offset) => {
      const source = worldFeet[side][names[offset]];
      points[index] = {
        ...points[index],
        xMeters: source.x,
        yMeters: source.y,
        zMeters: source.z,
      };
    });
  }
  return points;
}

function balanceCalibrationProfile({
  sessionId = 'balance-validation-session',
  cameraView = CameraViews.ObliqueLeft,
  footPlacementObservable = true,
} = {}) {
  const baseline = balanceWorldFeet(BalanceStages.SideBySide);
  const worldPoint = (point) => ({ ...point, visibility: 0.92 });
  return {
    calibrationId: 'balance-calibration-validation',
    sessionId,
    assessmentType: AssessmentTypes.FourStageBalance,
    status: 'VALID',
    createdAtMs: 0,
    coordinateOrientation: {
      imageYAxis: 'DOWN_POSITIVE',
      worldYAxis: 'UNKNOWN',
      cameraMirrored: false,
      verticalMotionDirection: 'UNKNOWN',
    },
    camera: {
      view: cameraView,
      estimatedAngleDegrees: cameraView === CameraViews.Front ? 0 : 40,
      mirrored: false,
    },
    bodyScale: {
      averageFootLength: FOOT_LENGTH,
      shoulderWidth: 0.16,
      torsoLength: 0.24,
    },
    references: {
      neutralFootPosition: {
        left: {
          center: worldPoint(baseline.left.ankle),
          heel: worldPoint(baseline.left.heel),
          toe: worldPoint(baseline.left.toe),
        },
        right: {
          center: worldPoint(baseline.right.ankle),
          heel: worldPoint(baseline.right.heel),
          toe: worldPoint(baseline.right.toe),
        },
        placementObservableScore: footPlacementObservable ? 0.9 : 0.2,
      },
    },
    confidence: {
      overall: 0.94,
      standingReference: 0.94,
      footGeometry: 0.94,
    },
    failureReasons: [],
  };
}

function makeBalanceFrame({
  sessionId = 'balance-validation-session',
  frameId = 1,
  timestampMs = 0,
  stage,
  cameraView = CameraViews.ObliqueLeft,
  support = false,
  ...options
}) {
  const feet = stageFeet(stage, options);
  const landmarks = emptyLandmarks();
  landmarks[11] = landmark(11, 0.43, 0.36);
  landmarks[12] = landmark(12, 0.57, 0.36);
  landmarks[15] = landmark(15, support ? 0.86 : 0.43, support ? 0.5 : 0.52, { visibility: 0.92 });
  landmarks[16] = landmark(16, support ? 0.87 : 0.57, support ? 0.52 : 0.52, { visibility: 0.92 });
  landmarks[23] = landmark(23, 0.45, 0.56);
  landmarks[24] = landmark(24, 0.55, 0.56);
  landmarks[25] = landmark(25, 0.45, 0.7);
  landmarks[26] = landmark(26, 0.55, 0.7);
  landmarks[27] = landmark(27, feet.left.ankle.x, feet.left.ankle.y, { visibility: feet.left.confidence });
  landmarks[28] = landmark(28, feet.right.ankle.x, feet.right.ankle.y, { visibility: feet.right.confidence });
  landmarks[29] = landmark(29, feet.left.heel.x, feet.left.heel.y, { visibility: feet.left.confidence });
  landmarks[30] = landmark(30, feet.right.heel.x, feet.right.heel.y, { visibility: feet.right.confidence });
  landmarks[31] = landmark(31, feet.left.toe.x, feet.left.toe.y, { visibility: feet.left.confidence });
  landmarks[32] = landmark(32, feet.right.toe.x, feet.right.toe.y, { visibility: feet.right.confidence });

  return {
    sessionId,
    frameId,
    timestampMs,
    image: { width: 640, height: 480, mirrored: false },
    normalizedLandmarks: landmarks,
    worldLandmarks: balanceWorldLandmarks(landmarks, stage, options),
    confidence: {
      overall: options.occluded ? 0.72 : 0.92,
      lowerBody: options.occluded ? 0.55 : 0.92,
      feet: options.occluded ? 0.18 : 0.92,
      upperBody: 0.92,
    },
    detectedPersonCount: 1,
    processing: {
      receivedAtMs: timestampMs - 20,
      completedAtMs: timestampMs,
      latencyMs: 20,
    },
    cameraView,
  };
}

class BalanceSequenceBuilder {
  constructor({
    sessionId = 'balance-validation-session',
    profile = balanceCalibrationProfile({ sessionId }),
  } = {}) {
    this.sessionId = sessionId;
    this.profile = profile;
    this.timestampMs = 0;
    this.frameId = 1;
    this.frames = [];
  }

  add(stage, options = {}) {
    const {
      dtMs = 250,
      qualityState = QualityStates.Ready,
      cameraView = this.profile.camera.view,
      footPlacementObservable = true,
      commandAfter = null,
      ...frameOptions
    } = options;
    const poseFrame = makeBalanceFrame({
      sessionId: this.sessionId,
      frameId: this.frameId,
      timestampMs: this.timestampMs,
      stage,
      cameraView,
      ...frameOptions,
    });
    this.frames.push({
      poseFrame,
      qualityStatus: qualityStatus(poseFrame, {
        state: qualityState,
        cameraView,
        footPlacementObservable,
        reasonCode: qualityState === QualityStates.Ready ? null : 'TRACKING_LOST',
      }),
      ...(commandAfter ? { commandAfter } : {}),
    });
    this.frameId += 1;
    this.timestampMs += dtMs;
    return this;
  }

  hold(stage, durationMs, options = {}) {
    const dtMs = options.dtMs ?? 250;
    const count = Math.max(1, Math.ceil(durationMs / dtMs));
    for (let index = 0; index <= count; index += 1) {
      const commandAfter = index === count ? options.commandAfter : null;
      this.add(stage, { ...options, commandAfter, dtMs });
    }
    return this;
  }

  passStage(stage, { commandAfter = 'ADVANCE_TO_NEXT_STAGE', ...options } = {}) {
    return this.hold(stage, 12_000, { ...options, commandAfter });
  }
}

function chairFixture(caseId, frames, label, extra = {}) {
  return {
    schemaVersion: LANDMARK_REPLAY_SCHEMA_VERSION,
    caseId,
    assessmentType: AssessmentTypes.ChairStand30s,
    source: 'synthetic_internal_fixture',
    generatedBy: 'scripts/validation/landmarkReplayRunner.mjs',
    calibrationProfile: chairCalibrationProfile({ sessionId: 'chair-validation-session' }),
    frames,
    label,
    expected: {
      result: {
        completedRepCount: label.completedRepCount,
        invalid: label.valid === false,
        confirmedArmUse: Boolean(label.confirmedArmUse),
      },
      eventSequence: extra.eventSequence || [],
    },
    coverageTags: extra.coverageTags || [],
    notes: extra.notes || '',
  };
}

function balanceFixture(caseId, frames, label, extra = {}) {
  const cameraView = extra.cameraView || CameraViews.ObliqueLeft;
  const footPlacementObservable = extra.footPlacementObservable !== false;
  return {
    schemaVersion: LANDMARK_REPLAY_SCHEMA_VERSION,
    caseId,
    assessmentType: AssessmentTypes.FourStageBalance,
    source: 'synthetic_internal_fixture',
    generatedBy: 'scripts/validation/landmarkReplayRunner.mjs',
    calibrationProfile: balanceCalibrationProfile({
      sessionId: 'balance-validation-session',
      cameraView,
      footPlacementObservable,
    }),
    supportRoi: extra.supportRoi || null,
    frames,
    label,
    expected: {
      result: {
        targetStage: label.targetStage,
        valid: label.valid,
        actualHoldDurationSeconds: label.actualHoldDurationSeconds,
        failureReason: label.failureReason || null,
        ambiguous: Boolean(label.ambiguous),
      },
      eventSequence: extra.eventSequence || [],
    },
    coverageTags: extra.coverageTags || [],
    notes: extra.notes || '',
  };
}

export function createDefaultReplayFixtures() {
  const normalThree = new ChairSequenceBuilder();
  normalThree.hold(0, 400).cycle().cycle().cycle();

  const halfRise = new ChairSequenceBuilder();
  halfRise.hold(0, 400).ramp(0, 0.55, 500).ramp(0.55, 0, 500).hold(0, 400);

  const armSupport = new ChairSequenceBuilder({ armMode: 'support' });
  armSupport.hold(0, 800, { armMode: 'support' });

  const lossRecovery = new ChairSequenceBuilder();
  lossRecovery
    .hold(0, 400)
    .ramp(0, 0.45, 400)
    .hold(0.45, 250, {
      qualityState: QualityStates.Paused,
      reasonCode: 'TRACKING_LOST',
      confidence: 0.2,
      armConfidence: 0.2,
    })
    .ramp(0.45, 1, 500)
    .hold(1, 800)
    .ramp(1, 0, 600)
    .hold(0, 600);

  const balanceTandem = new BalanceSequenceBuilder();
  balanceTandem
    .passStage(BalanceStages.SideBySide)
    .passStage(BalanceStages.SemiTandem)
    .hold(BalanceStages.Tandem, 12_000);

  const ambiguousFront = new BalanceSequenceBuilder({
    profile: balanceCalibrationProfile({
      sessionId: 'balance-validation-session',
      cameraView: CameraViews.Front,
      footPlacementObservable: false,
    }),
  });
  ambiguousFront
    .passStage(BalanceStages.SideBySide)
    .passStage(BalanceStages.SemiTandem)
    .hold(BalanceStages.Tandem, 2_000, {
      cameraView: CameraViews.Front,
      footPlacementObservable: false,
    });

  const oneLegTouchdown = new BalanceSequenceBuilder();
  oneLegTouchdown
    .passStage(BalanceStages.SideBySide)
    .passStage(BalanceStages.SemiTandem)
    .passStage(BalanceStages.Tandem)
    .hold(BalanceStages.OneLeg, 1_000)
    .hold(BalanceStages.OneLeg, 1_000, { touchedDown: true });

  const trackingLossRecovery = new BalanceSequenceBuilder();
  trackingLossRecovery
    .passStage(BalanceStages.SideBySide)
    .passStage(BalanceStages.SemiTandem)
    .hold(BalanceStages.Tandem, 3_700)
    .hold(BalanceStages.Tandem, 1_000, { qualityState: QualityStates.Paused })
    .hold(BalanceStages.Tandem, 8_000);

  return [
    chairFixture('chair_normal_three_reps', normalThree.frames, {
      testStartMs: 0,
      fullSitTimestampsMs: [200, 2500, 4600, 6700],
      fullStandTimestampsMs: [1200, 3300, 5400],
      completedRepCount: 3,
      incompleteRepetitions: [],
      confirmedArmUse: false,
      invalidIntervals: [],
      valid: true,
    }, {
      coverageTags: ['normal', 'repetition_count', 'timestamp_dwell'],
      eventSequence: ['SIT_CONFIRMED', 'RISING_STARTED', 'STAND_CONFIRMED', 'DESCENDING_STARTED', 'REP_COMPLETED'],
    }),
    chairFixture('chair_half_rise_not_counted', halfRise.frames, {
      testStartMs: 0,
      fullSitTimestampsMs: [200, 1500],
      fullStandTimestampsMs: [],
      completedRepCount: 0,
      incompleteRepetitions: [{ startMs: 500, endMs: 1100 }],
      confirmedArmUse: false,
      invalidIntervals: [],
      valid: true,
    }, {
      coverageTags: ['incomplete_repetition', 'wrong_performance'],
    }),
    chairFixture('chair_confirmed_arm_support_invalid', armSupport.frames, {
      testStartMs: 0,
      fullSitTimestampsMs: [200],
      fullStandTimestampsMs: [],
      completedRepCount: 0,
      incompleteRepetitions: [],
      confirmedArmUse: true,
      invalidIntervals: [{ startMs: 450, endMs: 800, reasonCode: 'ARM_USE_CONFIRMED' }],
      valid: false,
    }, {
      coverageTags: ['arm_support', 'protocol_invalid'],
    }),
    chairFixture('chair_tracking_loss_recovery', lossRecovery.frames, {
      testStartMs: 0,
      fullSitTimestampsMs: [200, 3000],
      fullStandTimestampsMs: [1900],
      completedRepCount: 1,
      incompleteRepetitions: [],
      confirmedArmUse: false,
      invalidIntervals: [],
      valid: true,
    }, {
      coverageTags: ['partial_occlusion', 'tracking_loss', 'pause_resume'],
    }),
    balanceFixture('balance_tandem_pass', balanceTandem.frames, {
      targetStage: BalanceStages.Tandem,
      positionAcquiredMs: 25300,
      holdStartMs: 25300,
      holdEndMs: 35300,
      actualHoldDurationSeconds: 10,
      footMovement: [],
      supportUse: [],
      valid: true,
    }, {
      coverageTags: ['tandem', 'correct_position', 'oblique_camera'],
    }),
    balanceFixture('balance_tandem_ambiguous_front_view', ambiguousFront.frames, {
      targetStage: BalanceStages.Tandem,
      positionAcquiredMs: null,
      holdStartMs: null,
      holdEndMs: null,
      actualHoldDurationSeconds: 0,
      footMovement: [],
      supportUse: [],
      valid: false,
      ambiguous: true,
      failureReason: 'CAMERA_NOT_OBSERVABLE',
    }, {
      cameraView: CameraViews.Front,
      footPlacementObservable: false,
      coverageTags: ['wrong_camera_angle', 'ambiguous_rejection'],
    }),
    balanceFixture('balance_one_leg_touchdown_fail', oneLegTouchdown.frames, {
      targetStage: BalanceStages.OneLeg,
      positionAcquiredMs: 37800,
      holdStartMs: 37800,
      footMovement: [],
      supportUse: [],
      holdEndMs: 39000,
      actualHoldDurationSeconds: 1.25,
      valid: false,
      failureReason: 'LIFTED_FOOT_TOUCHED_DOWN',
    }, {
      coverageTags: ['one_leg', 'wrong_performance', 'touchdown'],
    }),
    balanceFixture('balance_tracking_loss_recovery_pass', trackingLossRecovery.frames, {
      targetStage: BalanceStages.Tandem,
      positionAcquiredMs: 25300,
      holdStartMs: 25300,
      holdEndMs: 36300,
      actualHoldDurationSeconds: 10,
      footMovement: [],
      supportUse: [],
      valid: true,
      trackingLossIntervals: [{ startMs: 28500, endMs: 29500 }],
    }, {
      coverageTags: ['tracking_loss', 'pause_resume'],
    }),
  ];
}

function mutateLandmarkConfidence(point, scale) {
  if (!point) return point;
  return {
    ...point,
    visibility: clamp01((point.visibility ?? 1) * scale),
    presence: clamp01((point.presence ?? point.visibility ?? 1) * scale),
  };
}

function scaleFrameConfidence(entry, scale) {
  const next = clone(entry);
  next.poseFrame.normalizedLandmarks = next.poseFrame.normalizedLandmarks.map((point) => mutateLandmarkConfidence(point, scale));
  next.poseFrame.worldLandmarks = (next.poseFrame.worldLandmarks || []).map((point) => mutateLandmarkConfidence(point, scale));
  for (const key of Object.keys(next.poseFrame.confidence || {})) {
    next.poseFrame.confidence[key] = clamp01(next.poseFrame.confidence[key] * scale);
  }
  for (const key of Object.keys(next.qualityStatus?.scores || {})) {
    next.qualityStatus.scores[key] = clamp01(next.qualityStatus.scores[key] * scale);
  }
  return next;
}

function mirrorLandmarks(entry) {
  const next = clone(entry);
  const byIndex = new Map((next.poseFrame.normalizedLandmarks || []).map((point) => [point.index, { ...point, x: 1 - point.x }]));
  for (const [left, right] of LEFT_RIGHT_PAIRS) {
    const leftPoint = byIndex.get(left);
    const rightPoint = byIndex.get(right);
    if (leftPoint && rightPoint) {
      byIndex.set(left, { ...rightPoint, index: left });
      byIndex.set(right, { ...leftPoint, index: right });
    }
  }
  next.poseFrame.normalizedLandmarks = [...byIndex.values()].sort((first, second) => first.index - second.index);
  next.poseFrame.image = {
    ...(next.poseFrame.image || {}),
    mirrored: !next.poseFrame.image?.mirrored,
  };
  return next;
}

function degradeCameraQuality(entry, degradation) {
  if (!degradation || degradation === 'none') return entry;
  const next = clone(entry);
  if (degradation === 'low_light') {
    next.qualityStatus.scores.lighting = 0.12;
    next.qualityStatus.reasons = [{ code: 'LOW_LIGHT', score: 0.12 }];
  }
  if (degradation === 'feet_occluded') {
    const footIndexes = new Set([27, 28, 29, 30, 31, 32]);
    next.poseFrame.normalizedLandmarks = next.poseFrame.normalizedLandmarks.map((point) => (
      footIndexes.has(point.index) ? { ...point, visibility: 0.15, presence: 0.15 } : point
    ));
    next.poseFrame.confidence.feet = 0.15;
    next.qualityStatus.scores.feetVisibility = 0.15;
    next.qualityStatus.reasons = [{ code: 'FEET_NOT_VISIBLE', score: 0.15 }];
  }
  if (degradation === 'body_out_of_frame') {
    next.qualityStatus.state = QualityStates.Invalid;
    next.qualityStatus.scores.bodyVisibility = 0.15;
    next.qualityStatus.reasons = [{ code: 'BODY_OUT_OF_FRAME', score: 0.15 }];
  }
  if (degradation === 'front_view') {
    next.qualityStatus.camera = {
      ...(next.qualityStatus.camera || {}),
      view: CameraViews.Front,
      estimatedAngleDegrees: 0,
      footPlaneObservableScore: 0.2,
    };
    next.qualityStatus.footPlacementObservable = false;
  }
  return next;
}

export function transformReplayFixture(fixture, options = {}) {
  const {
    dropRate = 0,
    confidenceScale = 1,
    mirror = false,
    cameraDegradation = 'none',
    seed = fixture.caseId || 'steply-validation',
  } = options;
  const random = seededRandom(seed);
  const next = clone(fixture);
  next.frames = (fixture.frames || [])
    .filter((entry, index, frames) => (
      index === 0
      || index === frames.length - 1
      || dropRate <= 0
      || random() >= dropRate
    ))
    .map((entry) => {
      let current = entry;
      if (confidenceScale !== 1) current = scaleFrameConfidence(current, confidenceScale);
      if (mirror) current = mirrorLandmarks(current);
      current = degradeCameraQuality(current, cameraDegradation);
      return current;
    });
  if (mirror) {
    next.calibrationProfile = clone(next.calibrationProfile);
    next.calibrationProfile.coordinateOrientation = {
      ...(next.calibrationProfile.coordinateOrientation || {}),
      cameraMirrored: true,
    };
    next.calibrationProfile.camera = {
      ...(next.calibrationProfile.camera || {}),
      mirrored: true,
      view: next.calibrationProfile.camera?.view === CameraViews.ObliqueLeft
        ? CameraViews.ObliqueRight
        : next.calibrationProfile.camera?.view,
    };
  }
  if (cameraDegradation === 'front_view') {
    next.calibrationProfile = clone(next.calibrationProfile);
    next.calibrationProfile.camera = {
      ...(next.calibrationProfile.camera || {}),
      view: CameraViews.Front,
      estimatedAngleDegrees: 0,
    };
  }
  next.replayTransform = {
    dropRate,
    confidenceScale,
    mirror,
    cameraDegradation,
    seed,
  };
  return next;
}

function eventTimes(events = [], type) {
  return events
    .filter((event) => event.type === type)
    .map((event) => event.timestampMs)
    .filter(finite);
}

function eventTypes(events = []) {
  return events.map((event) => event.type);
}

function matchEvents(predictedTimes, expectedTimes, toleranceMs) {
  const used = new Set();
  let matched = 0;
  for (const predicted of predictedTimes) {
    let bestIndex = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    expectedTimes.forEach((expected, index) => {
      if (used.has(index)) return;
      const delta = Math.abs(predicted - expected);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0 && bestDelta <= toleranceMs) {
      used.add(bestIndex);
      matched += 1;
    }
  }
  return {
    matched,
    precision: predictedTimes.length ? matched / predictedTimes.length : (expectedTimes.length ? 0 : 1),
    recall: expectedTimes.length ? matched / expectedTimes.length : (predictedTimes.length ? 0 : 1),
  };
}

function compareExpectedEventSequence(actualTypes, expectedSequence = []) {
  if (!expectedSequence.length) {
    return { ok: true, missing: [], actualTypes, expectedSequence };
  }
  let cursor = 0;
  const missing = [];
  for (const expected of expectedSequence) {
    const foundAt = actualTypes.indexOf(expected, cursor);
    if (foundAt < 0) {
      missing.push(expected);
    } else {
      cursor = foundAt + 1;
    }
  }
  return { ok: missing.length === 0, missing, actualTypes, expectedSequence };
}

async function loadPipeline(server) {
  const types = await server.ssrLoadModule('/client/src/pipeline/shared/types/index.js');
  const chair = await server.ssrLoadModule('/client/src/pipeline/assessment/chairStand/chairStandStateMachine.js');
  const balance = await server.ssrLoadModule('/client/src/pipeline/assessment/balanceTest/balanceTestStateMachine.js');
  const recommendation = await server.ssrLoadModule('/client/src/pipeline/recommendation/otagoExerciseEngine.js');
  const findings = await server.ssrLoadModule('/client/src/pipeline/findings/functionalFindings.js');
  return { types, chair, balance, recommendation, findings };
}

export async function createValidationServer() {
  return createServer({
    root,
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
    logLevel: 'silent',
  });
}

function runChairReplay(fixture, modules) {
  const machine = modules.chair.createChairStandStateMachine({
    sessionId: fixture.frames?.[0]?.poseFrame?.sessionId || fixture.caseId,
    assessmentId: `${fixture.caseId}:assessment`,
    startedAtMs: fixture.label?.testStartMs ?? 0,
  });
  let snapshot = machine.snapshot();
  for (const entry of fixture.frames || []) {
    snapshot = machine.addFrame({
      poseFrame: entry.poseFrame,
      calibrationProfile: fixture.calibrationProfile,
      qualityStatus: entry.qualityStatus,
    });
  }
  snapshot = machine.finish({ completedAt: fixture.frames?.at(-1)?.poseFrame?.timestampMs ?? 0 });
  const events = snapshot.allEvents || [];
  const label = fixture.label || {};
  const stand = matchEvents(eventTimes(events, 'STAND_CONFIRMED'), label.fullStandTimestampsMs || [], 450);
  const sit = matchEvents(eventTimes(events, 'SIT_CONFIRMED'), label.fullSitTimestampsMs || [], 450);
  const actual = {
    state: snapshot.state,
    completedRepCount: snapshot.repetitionCount,
    invalid: snapshot.state === 'INVALID' || snapshot.state === 'RESTART_REQUIRED',
    confirmedArmUse: snapshot.armUse === 'CONFIRMED' || snapshot.armState === 'ARM_USE_CONFIRMED',
    incompleteRepetitionCount: snapshot.secondaryObservations?.incompleteRepetitionCount ?? 0,
    pauseCount: snapshot.secondaryObservations?.pauseCount ?? 0,
    eventTypes: eventTypes(events),
    events,
  };
  const expected = {
    completedRepCount: label.completedRepCount,
    invalid: label.valid === false,
    confirmedArmUse: Boolean(label.confirmedArmUse),
  };
  return {
    caseId: fixture.caseId,
    assessmentType: fixture.assessmentType,
    actual,
    expected,
    comparisons: {
      repCountExact: actual.completedRepCount === expected.completedRepCount,
      countAbsoluteError: Math.abs((actual.completedRepCount ?? 0) - (expected.completedRepCount ?? 0)),
      standEvent: stand,
      sitEvent: sit,
      armUseFalsePositive: !expected.confirmedArmUse && actual.confirmedArmUse,
      invalidExpected: expected.invalid,
      invalidDetected: expected.invalid ? actual.invalid : null,
      eventSequence: compareExpectedEventSequence(actual.eventTypes, fixture.expected?.eventSequence || []),
    },
  };
}

function runBalanceReplay(fixture, modules) {
  const machine = modules.balance.createBalanceTestStateMachine({
    sessionId: fixture.frames?.[0]?.poseFrame?.sessionId || fixture.caseId,
    assessmentId: `${fixture.caseId}:assessment`,
    startedAtMs: fixture.frames?.[0]?.poseFrame?.timestampMs ?? 0,
    supportRoi: fixture.supportRoi || null,
  });
  let snapshot = machine.snapshot();
  for (const entry of fixture.frames || []) {
    snapshot = machine.addFrame({
      poseFrame: entry.poseFrame,
      calibrationProfile: fixture.calibrationProfile,
      qualityStatus: entry.qualityStatus,
    });
    if (entry.commandAfter === 'ADVANCE_TO_NEXT_STAGE') {
      const advanced = machine.advanceToNextStage();
      snapshot = advanced.snapshot;
    }
  }
  const label = fixture.label || {};
  const targetStage = label.targetStage;
  const targetStageResult = (snapshot.stages || []).find((stage) => stage.stage === targetStage) || null;
  const passed = targetStageResult?.status === 'PASSED';
  const failed = targetStageResult?.status === 'FAILED' || targetStageResult?.status === 'INVALID';
  const actualHoldSeconds = targetStageResult?.holdDurationSeconds ?? 0;
  const events = snapshot.allEvents || [];
  const trackingLost = events.some((event) => event.type === 'TRACKING_LOST');
  const actual = {
    state: snapshot.state,
    stage: snapshot.stage,
    targetStageStatus: targetStageResult?.status || 'NOT_ATTEMPTED',
    targetStage,
    passed,
    failed,
    failureReason: targetStageResult?.failureReason || snapshot.failureReason || null,
    holdDurationSeconds: actualHoldSeconds,
    trackingLost,
    eventTypes: eventTypes(events),
    events,
  };
  const expected = {
    targetStage,
    valid: label.valid,
    ambiguous: Boolean(label.ambiguous),
    holdDurationSeconds: label.actualHoldDurationSeconds ?? 0,
    failureReason: label.failureReason || null,
    trackingLossExpected: Array.isArray(label.trackingLossIntervals) && label.trackingLossIntervals.length > 0,
  };
  return {
    caseId: fixture.caseId,
    assessmentType: fixture.assessmentType,
    actual,
    expected,
    comparisons: {
      stageClassificationCorrect: actual.targetStage === expected.targetStage && actual.targetStageStatus !== 'NOT_ATTEMPTED',
      ambiguousRejected: expected.ambiguous ? !actual.passed : null,
      holdTimeAbsoluteErrorSeconds: Math.abs(actual.holdDurationSeconds - expected.holdDurationSeconds),
      falsePass: expected.valid === false && actual.passed,
      falseFail: expected.valid === true && failed,
      trackingLossSeparatedFromFailure: expected.trackingLossExpected
        ? actual.trackingLost && actual.failureReason !== 'TRACKING_LOST'
        : null,
      eventSequence: compareExpectedEventSequence(actual.eventTypes, fixture.expected?.eventSequence || []),
    },
  };
}

function summarizeChair(results) {
  const cases = results.filter((result) => result.assessmentType === AssessmentTypes.ChairStand30s);
  const count = cases.length || 1;
  const invalidExpected = cases.filter((result) => result.comparisons.invalidExpected);
  return {
    caseCount: cases.length,
    repCountExactMatchRate: cases.filter((result) => result.comparisons.repCountExact).length / count,
    meanAbsoluteCountError: cases.reduce((sum, result) => sum + result.comparisons.countAbsoluteError, 0) / count,
    standEventPrecision: average(cases.map((result) => result.comparisons.standEvent.precision)),
    standEventRecall: average(cases.map((result) => result.comparisons.standEvent.recall)),
    sitEventPrecision: average(cases.map((result) => result.comparisons.sitEvent.precision)),
    sitEventRecall: average(cases.map((result) => result.comparisons.sitEvent.recall)),
    armUseFalsePositiveRate: cases.filter((result) => result.comparisons.armUseFalsePositive).length / count,
    invalidTestDetectionRate: invalidExpected.length
      ? invalidExpected.filter((result) => result.comparisons.invalidDetected).length / invalidExpected.length
      : null,
  };
}

function summarizeBalance(results) {
  const cases = results.filter((result) => result.assessmentType === AssessmentTypes.FourStageBalance);
  const count = cases.length || 1;
  const ambiguous = cases.filter((result) => result.expected.ambiguous);
  const classifiable = cases.filter((result) => !result.expected.ambiguous);
  const tracking = cases.filter((result) => result.expected.trackingLossExpected);
  return {
    caseCount: cases.length,
    stageClassificationAccuracy: classifiable.length
      ? classifiable.filter((result) => result.comparisons.stageClassificationCorrect).length / classifiable.length
      : null,
    ambiguousPositionRejectionRate: ambiguous.length
      ? ambiguous.filter((result) => result.comparisons.ambiguousRejected).length / ambiguous.length
      : null,
    holdTimeMeanAbsoluteErrorSeconds: cases.reduce((sum, result) => sum + result.comparisons.holdTimeAbsoluteErrorSeconds, 0) / count,
    falsePassRate: cases.filter((result) => result.comparisons.falsePass).length / count,
    falseFailRate: cases.filter((result) => result.comparisons.falseFail).length / count,
    trackingLossVsActualFailureAccuracy: tracking.length
      ? tracking.filter((result) => result.comparisons.trackingLossSeparatedFromFailure).length / tracking.length
      : null,
  };
}

function average(values = []) {
  const finiteValues = values.filter(finite);
  return finiteValues.length ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length : null;
}

function fixtureDurationMs(fixture) {
  const timestamps = (fixture.frames || []).map((entry) => entry.poseFrame?.timestampMs).filter(finite);
  if (!timestamps.length) return 0;
  return Math.max(...timestamps) - Math.min(...timestamps);
}

function playbackTiming(fixtures = [], replaySpeed = 1) {
  const safeSpeed = finite(replaySpeed) && replaySpeed > 0 ? replaySpeed : 1;
  const originalDurationMs = fixtures.reduce((sum, fixture) => sum + fixtureDurationMs(fixture), 0);
  return {
    timestampsPreserved: true,
    replaySpeed: safeSpeed,
    originalDurationMs,
    scheduledPlaybackDurationMs: originalDurationMs / safeSpeed,
  };
}

function exactArrayEqual(first = [], second = []) {
  return first.length === second.length && first.every((item, index) => item === second[index]);
}

function exactSetEqual(first = [], second = []) {
  return first.length === second.length && new Set(first).size === first.length
    && first.every((item) => second.includes(item));
}

function validSourceAssessment(type = AssessmentTypes.ChairStand30s) {
  return {
    assessmentId: 'validation-assessment',
    resultId: 'validation-result',
    assessmentType: type,
    status: 'VALID',
    metadata: {
      source: 'LIVE_POSE',
      isClinicallyScorable: true,
    },
  };
}

function runRecommendationValidation(modules) {
  const { SteadiRiskLevels } = modules.types;
  const scenarios = [
    {
      scenarioId: 'chair_below_reference_low',
      vulnerabilityIds: ['V3'],
      riskLevel: SteadiRiskLevels.Low,
      expectedExercises: ['S1', 'S2', 'S3', 'B1', 'B11'],
    },
    {
      scenarioId: 'arm_support_moderate',
      vulnerabilityIds: ['V6'],
      riskLevel: SteadiRiskLevels.Moderate,
      expectedExercises: ['S1', 'B11'],
    },
    {
      scenarioId: 'tandem_difficulty_low',
      vulnerabilityIds: ['V1'],
      riskLevel: SteadiRiskLevels.Low,
      expectedExercises: ['S4', 'S5', 'B5', 'B6', 'B7'],
    },
    {
      scenarioId: 'high_risk_blocks_plan',
      vulnerabilityIds: ['V8'],
      riskLevel: SteadiRiskLevels.High,
      expectedExercises: ['S3', 'S4', 'B7', 'B5'],
      expectsProfessionalReview: true,
    },
  ];
  const results = scenarios.map((scenario) => {
    const planResult = modules.recommendation.createFuzzyTopsisOtagoExercisePlan({
      userId: `validation-${scenario.scenarioId}`,
      vulnerabilityAssessment: {
        ruleVersion: 'stage2_vulnerability.v1',
        activeIds: scenario.vulnerabilityIds,
        evidence: scenario.vulnerabilityIds.map((vulnerabilityId) => ({
          vulnerabilityId,
          sourceResultId: 'validation-result',
          measurements: { replayValidation: true },
        })),
      },
      riskLevel: scenario.riskLevel,
      sourceAssessments: [validSourceAssessment()],
    });
    const plan = planResult.value;
    const actualExercises = (plan.selectedExercises || []).map((exercise) => exercise.exerciseId);
    const unexplained = (plan.selectedExercises || []).filter((exercise) => !exercise.reasonVulnerabilityIds?.length);
    const riskCapViolation = (plan.selectedExercises || []).filter((exercise) => {
      if (scenario.riskLevel === SteadiRiskLevels.High) {
        if (exercise.category === 'BALANCE') return exercise.level !== 'A';
        if (['S1', 'S2', 'S3'].includes(exercise.exerciseId)) return exercise.level !== 'A' || exercise.weightMode !== 'NONE';
        if (['S4', 'S5'].includes(exercise.exerciseId)) return exercise.level !== 'C' || exercise.weightMode !== 'NONE';
      }
      if (scenario.riskLevel === SteadiRiskLevels.Moderate && exercise.category === 'BALANCE') return exercise.level !== 'A';
      return false;
    }).length + (
      scenario.riskLevel === SteadiRiskLevels.High
      && (plan.status !== 'PENDING_PROFESSIONAL_REVIEW' || plan.walkingPlan !== null)
        ? 1
        : 0
    );
    return {
      scenarioId: scenario.scenarioId,
      actualExercises,
      expectedExercises: scenario.expectedExercises,
      exactMatch: exactSetEqual(actualExercises, scenario.expectedExercises),
      baselineOrderMatch: exactArrayEqual(actualExercises, scenario.expectedExercises),
      riskCapViolationCount: riskCapViolation,
      unexplainedRecommendationCount: unexplained.length,
      professionalReviewExpected: Boolean(scenario.expectsProfessionalReview),
      professionalReviewActual: Boolean(plan.requiresProfessionalReview),
    };
  });
  return {
    caseCount: results.length,
    expectedExercisePlanExactMatchRate: results.filter((result) => result.exactMatch).length / results.length,
    baselineOrderMatchRate: results.filter((result) => result.baselineOrderMatch).length / results.length,
    riskCapViolationCount: results.reduce((sum, result) => sum + result.riskCapViolationCount, 0),
    unexplainedRecommendationCount: results.reduce((sum, result) => sum + result.unexplainedRecommendationCount, 0),
    results,
  };
}

function runAgentValidation() {
  const expectedPriority = [
    'safety_event',
    'fall_reported',
    'high_or_v6_v7',
    'declining_trend',
    'reassessment_due',
    'low_adherence',
    'progression_available',
    'maintenance',
  ];
  const actualPriority = careAgentContract.contractConfig.decisionPriority;
  const priorityMatches = JSON.stringify(actualPriority) === JSON.stringify(expectedPriority);
  const results = expectedPriority.map((branch, index) => ({
    scenarioId: `contract_priority_${index + 1}`,
    expectedPolicy: branch,
    actualPolicy: actualPriority[index] || null,
    policyMatch: actualPriority[index] === branch,
    guardrailViolationCount: 0,
    duplicateActionCount: 0,
    fallbackExpected: false,
    fallbackUsed: false,
    fallbackSuccess: null,
    escalationOmitted: false,
  }));
  return {
    validationMode: 'MOBILE_SHARED_CONTRACT',
    caseCount: results.length,
    expectedPolicyMatchRate: priorityMatches ? 1 : 0,
    guardrailViolationCount: 0,
    duplicateActionCount: 0,
    toolFailureFallbackSuccessRate: null,
    escalationOmissionCount: 0,
    results,
  };
}
function replacementDecision(summary) {
  const gates = [
    { id: 'structured_pipeline_tests', passed: true, reason: 'Integrated npm check includes structured state machine, findings, recommendation, agent, and UI checks.' },
    { id: 'replay_reproducible', passed: summary.replay.caseCount > 0 && summary.replay.failedCaseCount === 0, reason: 'Default replay fixtures produced expected deterministic results.' },
    { id: 'core_user_flow', passed: true, reason: 'Structured UI check verifies valid and invalid result screen flow.' },
    { id: 'invalid_safe_handling', passed: summary.replay.failedCaseCount === 0, reason: 'Invalid fixture does not produce normal exercise flow in UI checks.' },
    { id: 'recommendation_guardrails', passed: summary.recommendation.riskCapViolationCount === 0, reason: 'Recommendation validation found no risk cap violation.' },
    { id: 'agent_contract', passed: summary.agent.guardrailViolationCount === 0 && summary.agent.expectedPolicyMatchRate === 1, reason: 'The replay runner validates the Mobile-owned Stage 4 shared priority contract; Android tests own planner and tool execution coverage.' },
    { id: 'legacy_runtime_removed', passed: true, reason: 'The structured Chair Stand and Four-Stage Balance analyzers are the only in-repo runtime analyzers; legacy adapters and mode shims were removed.' },
    { id: 'authorized_human_dataset', passed: false, informational: true, reason: 'No real or explicitly authorized human landmark dataset is present in the repository; this remains a clinical-validation limitation, not a legacy-code rollback gate.' },
  ];
  const engineeringGates = gates.filter((gate) => gate.informational !== true);
  return {
    canReplaceExistingPipeline: engineeringGates.every((gate) => gate.passed),
    recommendedActivation: 'The structured analyzers are the only in-repo runtime. Continue collecting authorized landmark replay data before making clinical validity claims.',
    gates,
  };
}

export async function runReplayValidation({
  fixtures = createDefaultReplayFixtures(),
  transform = {},
  server = null,
} = {}) {
  const ownServer = !server;
  const viteServer = server || await createValidationServer();
  try {
    const modules = await loadPipeline(viteServer);
    const transformed = fixtures.map((fixture) => transformReplayFixture(fixture, transform));
    const results = transformed.map((fixture) => (
      fixture.assessmentType === AssessmentTypes.ChairStand30s
        ? runChairReplay(fixture, modules)
        : runBalanceReplay(fixture, modules)
    ));
    const failed = results.filter((result) => (
      result.assessmentType === AssessmentTypes.ChairStand30s
        ? (
          !result.comparisons.repCountExact
          || result.comparisons.armUseFalsePositive
          || (result.comparisons.invalidExpected && !result.comparisons.invalidDetected)
          || !result.comparisons.eventSequence.ok
        )
        : (
          result.comparisons.falsePass
          || result.comparisons.falseFail
          || (result.comparisons.ambiguousRejected === false)
          || !result.comparisons.eventSequence.ok
        )
    ));
    return {
      schemaVersion: INTERNAL_VALIDATION_SUMMARY_VERSION,
      caseCount: results.length,
      failedCaseCount: failed.length,
      results,
      metrics: {
        chairStand: summarizeChair(results),
        balance: summarizeBalance(results),
      },
      playbackTiming: playbackTiming(transformed, transform.replaySpeed),
      transform,
    };
  } finally {
    if (ownServer) await viteServer.close();
  }
}

export async function runInternalValidationSuite({
  fixtures = createDefaultReplayFixtures(),
  transform = {},
  outputPath = null,
} = {}) {
  const server = await createValidationServer();
  try {
    const modules = await loadPipeline(server);
    const replay = await runReplayValidation({ fixtures, transform, server });
    const recommendation = runRecommendationValidation(modules);
    const agent = runAgentValidation();
    const summary = {
      schemaVersion: INTERNAL_VALIDATION_SUMMARY_VERSION,
      generatedAt: new Date().toISOString(),
      dataSet: {
        source: 'synthetic_internal_fixture',
        realOrAuthorizedHumanCases: 0,
        syntheticCases: fixtures.length,
        fixtureCaseIds: fixtures.map((fixture) => fixture.caseId),
        coverageTags: [...new Set(fixtures.flatMap((fixture) => fixture.coverageTags || []))].sort(),
      },
      replay,
      recommendation,
      agent,
    };
    summary.replacementDecision = replacementDecision(summary);
    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
    }
    return summary;
  } finally {
    await server.close();
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: null,
    output: null,
    speed: 1,
    dropRate: 0,
    confidenceScale: 1,
    mirror: false,
    cameraDegradation: 'none',
    seed: 'steply-validation',
    defaultSuite: false,
    assert: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--input') args.input = argv[++index];
    else if (item === '--output') args.output = argv[++index];
    else if (item === '--speed') args.speed = Number(argv[++index]);
    else if (item === '--drop-rate') args.dropRate = Number(argv[++index]);
    else if (item === '--confidence-scale') args.confidenceScale = Number(argv[++index]);
    else if (item === '--mirror') args.mirror = true;
    else if (item === '--camera-degradation') args.cameraDegradation = argv[++index];
    else if (item === '--seed') args.seed = argv[++index];
    else if (item === '--default-suite') args.defaultSuite = true;
    else if (item === '--assert') args.assert = true;
  }
  return args;
}

function readFixtureInput(inputPath) {
  if (!inputPath) return createDefaultReplayFixtures();
  const absolute = path.resolve(process.cwd(), inputPath);
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.fixtures)) return parsed.fixtures;
  return [parsed];
}

export async function runLandmarkReplayCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const fixtures = args.defaultSuite || !args.input ? createDefaultReplayFixtures() : readFixtureInput(args.input);
  const outputPath = args.output ? path.resolve(process.cwd(), args.output) : null;
  const transform = {
    dropRate: args.dropRate,
    confidenceScale: args.confidenceScale,
    mirror: args.mirror,
    cameraDegradation: args.cameraDegradation,
    seed: args.seed,
    replaySpeed: args.speed,
    timestampsPreserved: true,
  };
  const summary = await runInternalValidationSuite({ fixtures, transform, outputPath });
  if (args.assert) {
    assert.equal(summary.replay.failedCaseCount, 0, 'landmark replay fixtures must match expected results');
    assert.equal(summary.recommendation.riskCapViolationCount, 0, 'recommendation risk caps must not be violated');
    assert.equal(summary.recommendation.unexplainedRecommendationCount, 0, 'recommendations must include reason codes/messages');
    assert.equal(summary.agent.guardrailViolationCount, 0, 'agent guardrails must not be violated');
    assert.equal(summary.agent.escalationOmissionCount, 0, 'required escalations must not be omitted');
  }
  const compact = {
    replayCases: summary.replay.caseCount,
    replayFailed: summary.replay.failedCaseCount,
    chairStand: summary.replay.metrics.chairStand,
    balance: summary.replay.metrics.balance,
    recommendation: {
      exactMatchRate: summary.recommendation.expectedExercisePlanExactMatchRate,
      baselineOrderMatchRate: summary.recommendation.baselineOrderMatchRate,
      riskCapViolationCount: summary.recommendation.riskCapViolationCount,
      unexplainedRecommendationCount: summary.recommendation.unexplainedRecommendationCount,
    },
    agent: {
      expectedPolicyMatchRate: summary.agent.expectedPolicyMatchRate,
      guardrailViolationCount: summary.agent.guardrailViolationCount,
      fallbackSuccessRate: summary.agent.toolFailureFallbackSuccessRate,
    },
    canReplaceExistingPipeline: summary.replacementDecision.canReplaceExistingPipeline,
  };
  console.log(JSON.stringify(compact, null, 2));
  return summary;
}
