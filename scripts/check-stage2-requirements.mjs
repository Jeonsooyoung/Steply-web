import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'silent',
});

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

try {
  const { stage2Operational } = await server.ssrLoadModule('/client/src/pipeline/shared/config/stage2Analysis.config.js');
  const { PoseSmoother, PoseSmoothingModes } = await server.ssrLoadModule('/client/src/pose/poseSmoother.js');
  const { MediaPipePoseNames } = await server.ssrLoadModule('/client/src/pose/poseLandmarks.js');
  const { worldLandmarkByIndex } = await server.ssrLoadModule('/client/src/pipeline/pose/coordinateMapping.js');
  const { evaluatePoseFrameQuality } = await server.ssrLoadModule('/client/src/pipeline/quality/frameQualityMetrics.js');
  const { createQualityStateMachine } = await server.ssrLoadModule('/client/src/pipeline/quality/qualityStateMachine.js');
  const { createPersonalCalibrationState, updatePersonalCalibration } = await server.ssrLoadModule('/client/src/pipeline/calibration/personalCalibration.js');
  const { AssessmentTypes, QualityStates } = await server.ssrLoadModule('/client/src/pipeline/shared/types/index.js');

  assert.equal(stage2Operational.signal.targetFps, 30, 'S2-SIGNAL-01 samples at 30fps');
  assert.equal(stage2Operational.signal.maxInterpolationFrames, 3, 'S2-SIGNAL-02 allows at most three missing frames');
  assert.deepEqual(stage2Operational.signal.oneEuro, {
    minCutoffHz: 1,
    beta: 0.007,
    derivativeCutoffHz: 1,
  }, 'S2-SIGNAL-03 One-Euro parameters are exact');
  assert.equal(stage2Operational.signal.angleMovingAverageFrames, 5, 'S2-SIGNAL-04 angle window is five frames');
  assert.equal(stage2Operational.signal.angularVelocityMovingAverageFrames, 5, 'S2-SIGNAL-04 angular-velocity window is five frames');
  assert.equal(stage2Operational.calibration.neutralStandingMs, 3_000, 'S2-CAL-01 neutral standing duration is 3000ms');
  assert.equal(stage2Operational.quality.invalidViolationRatioExclusive, 0.2, 'S2-Q-G3R invalid ratio is strict >20%');
  assert.deepEqual(stage2Operational.chairStand, {
    ...stage2Operational.chairStand,
    sitKneeEnterDegrees: 100,
    sitKneeExitDegrees: 105,
    standKneeEnterDegrees: 165,
    standKneeExitDegrees: 160,
    standHipEnterDegrees: 160,
    standHipHeightFraction: 0.95,
    halfRiseFraction: 0.5,
  }, 'S2-CHAIR-01/S2-CHAIR-03 central thresholds are exact');
  assert.equal(stage2Operational.balance.onsetDwellMs, 500, 'S2-BAL-02 onset is 500ms');
  assert.equal(stage2Operational.balance.positionEntryTimeoutMs, 10_000, 'S2-BAL-02 entry timeout is 10000ms');
  assert.equal(stage2Operational.balance.footMoveDistance, 0.3, 'S2-BAL-F1 distance is 0.30 L_foot');
  assert.equal(stage2Operational.balance.failureDwellMs, 200, 'S2-BAL-F1/S2-BAL-F2 dwell is 200ms');
  assert.equal(stage2Operational.balance.oneLeg.touchdownMax, 0.15, 'S2-BAL-F3 touchdown boundary is 0.15 L_foot');
  assert.equal(stage2Operational.balance.supportRoiDwellMs, 200, 'S2-BAL-F4 ROI dwell is 200ms');
  assert.equal(stage2Operational.multiPerson.maximumPoses, 2, 'S2-BAL-F5 requests a second pose');
  assert.equal(stage2Operational.balance.initialWindowMs, 4_000, 'S2-BAL-SWAY initial window is 0-4s');
  assert.equal(stage2Operational.balance.mlApRatio, 1.3, 'S2-BAL-SWAY ML/AP ratio threshold is 1.3');

  function landmark(index, overrides = {}) {
    return {
      index,
      name: MediaPipePoseNames[index],
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.95,
      presence: 0.95,
      ...overrides,
    };
  }

  function normalizedPose(overrides = {}) {
    return Array.from({ length: 33 }, (_, index) => landmark(index, overrides[index] || {}));
  }

  const coordinateFrame = {
    normalizedLandmarks: normalizedPose({ 25: { x: 0.91, y: 0.12 } }),
    worldLandmarks: normalizedPose({ 25: { x: -0.21, y: 0.33, z: 0.44 } }).map((point) => ({
      ...point,
      xMeters: point.x,
      yMeters: point.y,
      zMeters: point.z,
    })),
  };
  assert.deepEqual(
    (({ x, y, z }) => ({ x, y, z }))(worldLandmarkByIndex(coordinateFrame, 25)),
    { x: -0.21, y: 0.33, z: 0.44 },
    'S2-COORD-01 kinematics read world coordinates, not normalized coordinates',
  );

  const smoother = new PoseSmoother({ mode: PoseSmoothingModes.Chair });
  const visible = normalizedPose();
  smoother.smooth(visible, { timestampMs: 1_000 });
  for (let gap = 1; gap <= 3; gap += 1) {
    const missing = normalizedPose({ 27: { visibility: 0.499 } });
    const output = smoother.smooth(missing, { timestampMs: 1_000 + gap * (1000 / 30) });
    assert.equal(output.landmarks[27].interpolated, true, `S2-SIGNAL-02 gap ${gap} is interpolated`);
  }
  const fourth = smoother.smooth(normalizedPose({ 27: { visibility: 0.499 } }), { timestampMs: 1_000 + 4 * (1000 / 30) });
  assert.equal(fourth.landmarks[27].interpolated, undefined, 'S2-SIGNAL-02 fourth missing frame is rejected');
  assert.equal(fourth.landmarks[27].visibility, 0, 'S2-SIGNAL-02 rejected landmark has zero visibility');

  function poseFrame({ timestampMs = 1, normalized = normalizedPose(), world = null, brightness = 0.5 } = {}) {
    const worldLandmarks = (world || normalized).map((point) => ({
      ...point,
      xMeters: finite(point.xMeters) ? point.xMeters : point.x,
      yMeters: finite(point.yMeters) ? point.yMeters : point.y,
      zMeters: finite(point.zMeters) ? point.zMeters : point.z,
    }));
    return {
      sessionId: 'stage2-requirements',
      frameId: Math.max(1, Math.round(timestampMs)),
      timestampMs,
      image: { width: 640, height: 480, mirrored: false },
      normalizedLandmarks: normalized,
      worldLandmarks,
      confidence: { overall: 0.95, lowerBody: 0.95, feet: 0.95, upperBody: 0.95 },
      detectedPersonCount: 1,
      processing: { receivedAtMs: timestampMs, completedAtMs: timestampMs, latencyMs: 0 },
      brightness,
    };
  }

  const calibrationProfile = { references: { W_shoulder: 0.2 }, bodyScale: { shoulderWidth: 0.2 } };
  const gateFrame = poseFrame({
    normalized: normalizedPose({
      11: { x: 0.4 }, 12: { x: 0.6 },
      23: { x: 0.02, y: 0.02 }, 32: { x: 0.98, y: 0.98 },
    }),
    world: normalizedPose({ 11: { x: -0.07 }, 12: { x: 0.07 } }),
  });
  const gatePass = evaluatePoseFrameQuality(gateFrame, { assessmentType: AssessmentTypes.ChairStand30s, brightness: 40 / 255, calibrationProfile });
  assert.equal(gatePass.gates.find(({ gate }) => gate === 'G1').pass, true, 'S2-Q-G1 visibility 0.7 boundary passes');
  assert.equal(gatePass.gates.find(({ gate }) => gate === 'G2').pass, true, 'S2-Q-G2 frame 0.02/0.98 boundaries pass');
  assert.equal(gatePass.gates.find(({ gate }) => gate === 'G4').pass, true, 'S2-Q-G4 shoulder ratio 0.7 boundary passes');
  assert.equal(gatePass.gates.find(({ gate }) => gate === 'G5').pass, true, 'S2-Q-G5 brightness 40 boundary passes');

  const g1Fail = poseFrame({ normalized: normalizedPose({ 23: { visibility: 0.699 } }) });
  assert.equal(evaluatePoseFrameQuality(g1Fail, { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.5 }).gates.find(({ gate }) => gate === 'G1').pass, false, 'S2-Q-G1 visibility 0.699 fails');
  const g2Fail = poseFrame({ normalized: normalizedPose({ 23: { x: 0.019 } }) });
  assert.equal(evaluatePoseFrameQuality(g2Fail, { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.5 }).gates.find(({ gate }) => gate === 'G2').pass, false, 'S2-Q-G2 x=0.019 fails');
  const g4Fail = poseFrame({ world: normalizedPose({ 11: { x: -0.0699 }, 12: { x: 0.0699 } }) });
  assert.equal(evaluatePoseFrameQuality(g4Fail, { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.5, calibrationProfile }).gates.find(({ gate }) => gate === 'G4').pass, false, 'S2-Q-G4 ratio 0.699 fails');
  assert.equal(evaluatePoseFrameQuality(gateFrame, { assessmentType: AssessmentTypes.ChairStand30s, brightness: 221 / 255, calibrationProfile }).gates.find(({ gate }) => gate === 'G5').pass, false, 'S2-Q-G5 brightness 221 fails');

  const qualityMachine = createQualityStateMachine({ sessionStartedAtMs: 0 });
  const goodAt = (timestampMs) => {
    const frame = poseFrame({ timestampMs });
    return qualityMachine.update({ frame, metrics: evaluatePoseFrameQuality(frame, { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.5 }), timestampMs }).value;
  };
  const badAt = (timestampMs) => {
    const frame = poseFrame({ timestampMs, normalized: normalizedPose({ 23: { x: 0.019 } }) });
    return qualityMachine.update({ frame, metrics: evaluatePoseFrameQuality(frame, { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.5 }), timestampMs }).value;
  };
  goodAt(0);
  goodAt(10_000);
  badAt(10_000);
  assert.notEqual(badAt(10_499).state, QualityStates.Paused, 'S2-Q-G3 499ms does not pause');
  assert.equal(badAt(10_500).state, QualityStates.Paused, 'S2-Q-G3 500ms pauses');

  const ratioMachine = createQualityStateMachine({ sessionStartedAtMs: 0 });
  const ratioGood = poseFrame({ timestampMs: 8_000 });
  ratioMachine.update({ frame: poseFrame({ timestampMs: 0 }), metrics: evaluatePoseFrameQuality(poseFrame({ timestampMs: 0 }), { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.5 }), timestampMs: 0 });
  ratioMachine.update({ frame: ratioGood, metrics: evaluatePoseFrameQuality(ratioGood, { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.5 }), timestampMs: 8_000 });
  const ratioBad = (timestampMs) => {
    const frame = poseFrame({ timestampMs, normalized: normalizedPose({ 23: { x: 0.019 } }) });
    return ratioMachine.update({ frame, metrics: evaluatePoseFrameQuality(frame, { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.5 }), timestampMs }).value;
  };
  ratioBad(8_000);
  assert.notEqual(ratioBad(10_000).state, QualityStates.Invalid, 'S2-Q-G3R exactly 20% is not invalid');
  assert.equal(ratioBad(10_001).state, QualityStates.Invalid, 'S2-Q-G3R greater than 20% is invalid');

  function calibrationFrame(timestampMs) {
    const normalized = normalizedPose({
      11: { x: 0.4, y: 0.3 }, 12: { x: 0.6, y: 0.3 },
      23: { x: 0.45, y: 0.5 }, 24: { x: 0.55, y: 0.5 },
      27: { x: 0.48, y: 0.84 }, 28: { x: 0.52, y: 0.84 },
      29: { x: 0.48, y: 0.80 }, 30: { x: 0.52, y: 0.80 },
      31: { x: 0.48, y: 0.88 }, 32: { x: 0.52, y: 0.88 },
    });
    return poseFrame({ timestampMs, normalized });
  }
  const readyQuality = (frame) => ({
    sessionId: frame.sessionId, frameId: frame.frameId, timestampMs: frame.timestampMs,
    state: QualityStates.Ready,
    scores: { overall: 0.95, bodyVisibility: 1, lowerBodyVisibility: 0.95, feetVisibility: 0.95, orientation: 1, lighting: 1, tracking: 0.95 },
    reasons: [], timing: { currentFailureDurationMs: 0, accumulatedPauseDurationMs: 0 },
  });
  let calibration = createPersonalCalibrationState({ sessionId: 'stage2-requirements', assessmentType: AssessmentTypes.FourStageBalance, createdAtMs: 1 });
  for (const timestampMs of [1, 3_000]) {
    const frame = calibrationFrame(timestampMs);
    calibration = updatePersonalCalibration(calibration, { poseFrame: frame, qualityStatus: readyQuality(frame) }).state;
  }
  assert.equal(calibration.profile.status, 'IN_PROGRESS', 'S2-CAL-01 2999ms is not valid');
  const frame3000 = calibrationFrame(3_001);
  const calibrated = updatePersonalCalibration(calibration, { poseFrame: frame3000, qualityStatus: readyQuality(frame3000) });
  assert.equal(calibrated.profile.status, 'VALID', 'S2-CAL-01 3000ms is valid');
  for (const key of ['L_foot', 'H_stand', 'W_shoulder']) assert.ok(finite(calibrated.profile.references[key]), `S2-CAL-02 ${key} is preserved`);

  console.log('Stage 2 requirement checks passed.');
} finally {
  await server.close();
}
