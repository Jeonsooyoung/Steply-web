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

try {
  const {
    AssessmentTypes,
    QualityReasonCodes,
    QualityStates,
    CalibrationStatuses,
  } = await server.ssrLoadModule('/client/src/pipeline/shared/types/index.js');
  const { createPoseFrameProcessor } = await server.ssrLoadModule('/client/src/pipeline/pose/frameProcessor.js');
  const { normalizeSittingToStandingProgress } = await server.ssrLoadModule('/client/src/pipeline/pose/coordinateMapping.js');
  const { evaluatePoseFrameQuality } = await server.ssrLoadModule('/client/src/pipeline/quality/frameQualityMetrics.js');
  const { createQualityStateMachine } = await server.ssrLoadModule('/client/src/pipeline/quality/qualityStateMachine.js');
  const {
    createPersonalCalibrationState,
    updatePersonalCalibration,
  } = await server.ssrLoadModule('/client/src/pipeline/calibration/personalCalibration.js');

  function landmark(index, x, y, overrides = {}) {
    return { index, x, y, z: 0, visibility: 0.92, isValid: true, ...overrides };
  }

  function mockFrame({
    sessionId = 'session-1',
    frameId = 1,
    timestampMs = 1_000,
    mirrored = false,
    hipY = 0.48,
    shoulderY = 0.24,
    footY = 0.88,
    footOutside = false,
    bodyOutside = false,
    confidence = 0.92,
    footConfidence = 0.92,
    centerX = 0.5,
  } = {}) {
    const yOffset = bodyOutside ? 0.7 : 0;
    const feetY = footOutside ? 1.08 : footY + yOffset;
    const landmarks = Array.from({ length: 33 }, (_, index) => landmark(index, centerX, 0.5 + yOffset, { visibility: 0.45 }));
    landmarks[11] = landmark(11, centerX - 0.08, shoulderY + yOffset, { visibility: confidence });
    landmarks[12] = landmark(12, centerX + 0.08, shoulderY + yOffset, { visibility: confidence });
    landmarks[15] = landmark(15, centerX + 0.07, shoulderY + 0.02 + yOffset, { visibility: confidence });
    landmarks[16] = landmark(16, centerX - 0.07, shoulderY + 0.02 + yOffset, { visibility: confidence });
    landmarks[23] = landmark(23, centerX - 0.05, hipY + yOffset, { visibility: confidence });
    landmarks[24] = landmark(24, centerX + 0.05, hipY + yOffset, { visibility: confidence });
    landmarks[25] = landmark(25, centerX - 0.05, hipY + 0.18 + yOffset, { visibility: confidence });
    landmarks[26] = landmark(26, centerX + 0.05, hipY + 0.18 + yOffset, { visibility: confidence });
    landmarks[27] = landmark(27, centerX - 0.06, feetY - 0.04, { visibility: footConfidence });
    landmarks[28] = landmark(28, centerX + 0.06, feetY - 0.04, { visibility: footConfidence });
    landmarks[29] = landmark(29, centerX - 0.07, feetY, { visibility: footConfidence });
    landmarks[30] = landmark(30, centerX + 0.07, feetY, { visibility: footConfidence });
    landmarks[31] = landmark(31, centerX - 0.04, feetY + 0.05, { visibility: footConfidence });
    landmarks[32] = landmark(32, centerX + 0.04, feetY + 0.05, { visibility: footConfidence });
    return {
      sessionId,
      frameId,
      timestampMs,
      image: { width: 640, height: 480, mirrored },
      normalizedLandmarks: landmarks,
      confidence: {
        overall: confidence,
        lowerBody: Math.min(confidence, footConfidence),
        feet: footConfidence,
        upperBody: confidence,
      },
      detectedPersonCount: 1,
      processing: {
        receivedAtMs: timestampMs - 20,
        completedAtMs: timestampMs,
        latencyMs: 20,
      },
    };
  }

  function readyQuality(frame) {
    return {
      sessionId: frame.sessionId,
      frameId: frame.frameId,
      timestampMs: frame.timestampMs,
      state: QualityStates.Ready,
      scores: {
        overall: 0.92,
        bodyVisibility: 1,
        lowerBodyVisibility: 0.92,
        feetVisibility: 0.92,
        orientation: 0.8,
        lighting: 1,
        tracking: 0.92,
      },
      reasons: [],
      timing: { currentFailureDurationMs: 0, accumulatedPauseDurationMs: 0 },
    };
  }

  const processor = createPoseFrameProcessor({ now: () => 1_000 });
  processor.reset({ sessionId: 'analysis-1' });
  assert.equal(processor.nextMediaPipeTimestamp(1_000), 1_000);
  assert.equal(processor.nextMediaPipeTimestamp(900), 1_001);
  assert.equal(processor.enqueue({ frameId: 'a', receivedAt: 990, sessionId: 'analysis-1' }, { active: true, sessionId: 'analysis-1' }).action, 'PROCESS_NOW');
  assert.equal(processor.enqueue({ frameId: 'a', receivedAt: 995, sessionId: 'analysis-1' }, { active: true, sessionId: 'analysis-1' }).reason, 'duplicate-frame');
  assert.equal(processor.enqueue({ frameId: 'b', receivedAt: 995, sessionId: 'analysis-1' }, { active: true, sessionId: 'analysis-1' }).action, 'QUEUE_LATEST');

  const mirroredFrame = mockFrame({ mirrored: true });
  let calibrationState = createPersonalCalibrationState({
    sessionId: mirroredFrame.sessionId,
    assessmentType: AssessmentTypes.ChairStand30s,
    createdAtMs: 1_000,
  });
  let calibration = updatePersonalCalibration(calibrationState, {
    poseFrame: mirroredFrame,
    qualityStatus: readyQuality(mirroredFrame),
  });
  calibration = updatePersonalCalibration(calibration.state, {
    poseFrame: mockFrame({ mirrored: true, frameId: 2, timestampMs: 3_100, hipY: 0.48 }),
    qualityStatus: readyQuality(mockFrame({ mirrored: true, frameId: 2, timestampMs: 3_100, hipY: 0.48 })),
  });
  calibration = updatePersonalCalibration(calibration.state, {
    poseFrame: mockFrame({ mirrored: true, frameId: 3, timestampMs: 4_200, hipY: 0.68 }),
    qualityStatus: readyQuality(mockFrame({ mirrored: true, frameId: 3, timestampMs: 4_200, hipY: 0.68 })),
    phaseHint: 'sitting',
  });
  calibration = updatePersonalCalibration(calibration.state, {
    poseFrame: mockFrame({ mirrored: true, frameId: 4, timestampMs: 5_400, hipY: 0.68 }),
    qualityStatus: readyQuality(mockFrame({ mirrored: true, frameId: 4, timestampMs: 5_400, hipY: 0.68 })),
    phaseHint: 'sitting',
  });
  assert.equal(calibration.profile.coordinateOrientation.cameraMirrored, true, 'mirrored camera is stored');
  assert.equal(calibration.profile.status, CalibrationStatuses.Valid, 'chair calibration becomes valid with standing, sitting, and folded arms');

  const downPositiveProfile = {
    references: { sittingHipPosition: 0.7, standingHipPosition: 0.4 },
  };
  const upPositiveProfile = {
    references: { sittingHipPosition: 0.3, standingHipPosition: 0.6 },
  };
  assert.equal(
    Math.round(normalizeSittingToStandingProgress(mockFrame({ hipY: 0.55 }), downPositiveProfile).sittingToStandingProgress * 10) / 10,
    0.5,
  );
  assert.equal(
    Math.round(normalizeSittingToStandingProgress(mockFrame({ hipY: 0.45 }), upPositiveProfile).sittingToStandingProgress * 10) / 10,
    0.5,
  );

  const qualityMachineShortLoss = createQualityStateMachine({ sessionStartedAtMs: 0 });
  const goodFrame = mockFrame({ timestampMs: 0, frameId: 10 });
  const goodMetrics = evaluatePoseFrameQuality(goodFrame, { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.6 });
  assert.equal(qualityMachineShortLoss.update({ frame: goodFrame, metrics: goodMetrics, timestampMs: 0 }).value.state, QualityStates.Ready);
  const lostFrameShort = mockFrame({ timestampMs: 200, frameId: 11, confidence: 0.1, footConfidence: 0.1 });
  const lostMetricsShort = evaluatePoseFrameQuality(lostFrameShort, { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.6 });
  assert.equal(qualityMachineShortLoss.update({ frame: lostFrameShort, metrics: lostMetricsShort, timestampMs: 200 }).value.state, QualityStates.Ready, '0.2s loss is held');

  const qualityMachineLongLoss = createQualityStateMachine({ sessionStartedAtMs: 0 });
  qualityMachineLongLoss.update({ frame: goodFrame, metrics: goodMetrics, timestampMs: 0 });
  const lostFrameLongA = mockFrame({ timestampMs: 100, frameId: 12, confidence: 0.1, footConfidence: 0.1 });
  qualityMachineLongLoss.update({ frame: lostFrameLongA, metrics: evaluatePoseFrameQuality(lostFrameLongA, { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.6 }), timestampMs: 100 });
  const lostFrameLongB = mockFrame({ timestampMs: 1_100, frameId: 13, confidence: 0.1, footConfidence: 0.1 });
  assert.equal(
    qualityMachineLongLoss.update({ frame: lostFrameLongB, metrics: evaluatePoseFrameQuality(lostFrameLongB, { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.6 }), timestampMs: 1_100 }).value.state,
    QualityStates.Paused,
    '1s landmark loss pauses tracking',
  );

  const footOutMetrics = evaluatePoseFrameQuality(mockFrame({ footOutside: true }), { assessmentType: AssessmentTypes.FourStageBalance, brightness: 0.6 });
  assert.ok(footOutMetrics.reasons.some((reason) => reason.code === QualityReasonCodes.FeetNotVisible), 'feet outside frame is rejected');
  const bodyOutMetrics = evaluatePoseFrameQuality(mockFrame({ bodyOutside: true }), { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.6 });
  assert.ok(bodyOutMetrics.reasons.some((reason) => reason.code === QualityReasonCodes.BodyOutOfFrame), 'body outside frame is rejected');
  const lowLightMetrics = evaluatePoseFrameQuality(mockFrame(), { assessmentType: AssessmentTypes.ChairStand30s, brightness: 0.05 });
  assert.ok(lowLightMetrics.reasons.some((reason) => reason.code === QualityReasonCodes.LowLight), 'low light is rejected');

  const movingState = createPersonalCalibrationState({
    sessionId: 'moving-session',
    assessmentType: AssessmentTypes.FourStageBalance,
    createdAtMs: 0,
  });
  let movingCalibration = updatePersonalCalibration(movingState, {
    poseFrame: mockFrame({ sessionId: 'moving-session', timestampMs: 0, centerX: 0.45 }),
    qualityStatus: readyQuality(mockFrame({ sessionId: 'moving-session', timestampMs: 0, centerX: 0.45 })),
  });
  movingCalibration = updatePersonalCalibration(movingCalibration.state, {
    poseFrame: mockFrame({ sessionId: 'moving-session', frameId: 2, timestampMs: 2_200, centerX: 0.62 }),
    qualityStatus: readyQuality(mockFrame({ sessionId: 'moving-session', frameId: 2, timestampMs: 2_200, centerX: 0.62 })),
  });
  assert.notEqual(movingCalibration.profile.status, CalibrationStatuses.Valid, 'moving during calibration prevents valid profile');

  const lowFootBalance = evaluatePoseFrameQuality(
    mockFrame({ footConfidence: 0.2 }),
    { assessmentType: AssessmentTypes.FourStageBalance, brightness: 0.6 },
  );
  assert.equal(lowFootBalance.footPlacementObservable, false, 'low foot confidence does not allow foot-plane inference');
  assert.ok(lowFootBalance.reasons.some((reason) => reason.code === QualityReasonCodes.FeetNotVisible), 'low foot confidence blocks balance input instead of classifying a stance');

  console.log('Pose input, quality, and calibration checks passed.');
} finally {
  await server.close();
}
