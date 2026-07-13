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
    AssessmentEventTypes,
    AssessmentTypes,
    CalibrationStatuses,
    CameraViews,
    CoordinateAxisDirections,
    QualityReasonCodes,
    QualityStates,
    VerticalMotionDirections,
  } = await server.ssrLoadModule('/client/src/pipeline/shared/types/index.js');
  const {
    ChairStandArmStates,
    ChairStandMachineStates,
    createChairStandStateMachine,
    evaluatePartialRepetitionAtEnd,
    suspectedWeakerSideFromVelocities,
  } = await server.ssrLoadModule('/client/src/pipeline/assessment/chairStand/chairStandStateMachine.js');

  assert.equal(suspectedWeakerSideFromVelocities(12, 7), 'RIGHT', 'slower right knee-extension velocity is retained as right-side asymmetry evidence');
  assert.equal(suspectedWeakerSideFromVelocities(5, 11), 'LEFT', 'slower left knee-extension velocity is retained as left-side asymmetry evidence');
  assert.equal(suspectedWeakerSideFromVelocities(8, 8), 'UNDETERMINED', 'equal velocities do not invent a weaker side');

  const DEFAULT_REFS = {
    sittingHipY: 0.7,
    standingHipY: 0.4,
    worldYSign: -1,
    verticalMotionDirection: VerticalMotionDirections.StandingIncreases,
  };

  function finite(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function interpolate(start, end, progress) {
    return start + (end - start) * progress;
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

  function calibrationProfile({
    sessionId = 'chair-session',
    sittingHipY = DEFAULT_REFS.sittingHipY,
    standingHipY = DEFAULT_REFS.standingHipY,
    mirrored = false,
    worldYSign = DEFAULT_REFS.worldYSign,
    verticalMotionDirection = DEFAULT_REFS.verticalMotionDirection,
  } = {}) {
    return {
      calibrationId: 'calibration-chair',
      sessionId,
      assessmentType: AssessmentTypes.ChairStand30s,
      status: CalibrationStatuses.Valid,
      createdAtMs: 0,
      coordinateOrientation: {
        imageYAxis: CoordinateAxisDirections.DownPositive,
        worldYAxis: CoordinateAxisDirections.Unknown,
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
        sittingHipPosition: worldYSign * sittingHipY,
        standingHipPosition: worldYSign * standingHipY,
        H_sit: worldYSign * sittingHipY,
        H_stand: worldYSign * standingHipY,
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

  function posePoints(progress, refs = DEFAULT_REFS) {
    const hipY = interpolate(refs.sittingHipY, refs.standingHipY, progress);
    const shoulderY = hipY - interpolate(0.2, 0.22, progress);
    const kneeY = hipY + interpolate(0.1, 0.22, progress);
    const footY = 0.88;
    const left = {
      shoulder: { x: 0.45, y: shoulderY },
      elbow: { x: 0.49, y: shoulderY + 0.08 },
      wrist: { x: 0.55, y: shoulderY + 0.1 },
      hip: { x: 0.45, y: hipY },
      knee: {
        x: interpolate(0.58, 0.45, progress),
        y: kneeY,
      },
      ankle: {
        x: interpolate(0.48, 0.45, progress),
        y: footY - 0.02,
      },
      heel: { x: 0.43, y: footY },
      toe: { x: 0.5, y: footY + 0.04 },
    };
    const right = {
      shoulder: { x: 0.55, y: shoulderY },
      elbow: { x: 0.51, y: shoulderY + 0.08 },
      wrist: { x: 0.45, y: shoulderY + 0.1 },
      hip: { x: 0.55, y: hipY },
      knee: {
        x: interpolate(0.42, 0.55, progress),
        y: kneeY,
      },
      ankle: {
        x: interpolate(0.52, 0.55, progress),
        y: footY - 0.02,
      },
      heel: { x: 0.57, y: footY },
      toe: { x: 0.5, y: footY + 0.04 },
    };
    return { left, right };
  }

  function applyArmMode(points, armMode) {
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
    if (armMode === 'low-confidence') {
      points.left.elbow.visibility = 0.12;
      points.left.wrist.visibility = 0.12;
      points.right.elbow.visibility = 0.12;
      points.right.wrist.visibility = 0.12;
    }
  }

  function mockFrame({
    sessionId = 'chair-session',
    frameId = 1,
    timestampMs = 0,
    progress = 0,
    refs = DEFAULT_REFS,
    confidence = 0.92,
    armConfidence = confidence,
    armMode = 'folded',
    mirrored = false,
  } = {}) {
    const points = posePoints(progress, refs);
    for (const side of [points.left, points.right]) {
      side.elbow.visibility = armConfidence;
      side.wrist.visibility = armConfidence;
    }
    applyArmMode(points, armMode);

    const landmarks = Array.from({ length: 33 }, (_, index) => landmark(index, 0.5, 0.5, { visibility: 0.45 }));
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
      // S2-COORD-01: state-machine kinematics consume world landmarks. Keep a
      // separate array so normalized-only mutations cannot change angles.
      worldLandmarks: landmarks.map((point) => ({
        ...point,
        xMeters: point.x,
        yMeters: (refs.worldYSign ?? DEFAULT_REFS.worldYSign) * point.y,
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

  function qualityStatus(frame, { state = QualityStates.Ready, reasonCode = null } = {}) {
    const reasons = reasonCode ? [{ code: reasonCode, score: 0.2 }] : [];
    return {
      sessionId: frame.sessionId,
      frameId: frame.frameId,
      timestampMs: frame.timestampMs,
      state,
      scores: {
        overall: state === QualityStates.Ready ? 0.92 : 0.3,
        bodyVisibility: state === QualityStates.Ready ? 1 : 0.2,
        lowerBodyVisibility: state === QualityStates.Ready ? 0.92 : 0.2,
        feetVisibility: state === QualityStates.Ready ? 0.92 : 0.2,
        orientation: 0.85,
        lighting: 0.9,
        tracking: state === QualityStates.Ready ? 0.92 : 0.2,
      },
      reasons,
      timing: {
        currentFailureDurationMs: state === QualityStates.Ready ? 0 : 1_000,
        accumulatedPauseDurationMs: state === QualityStates.Ready ? 0 : 1_000,
      },
    };
  }

  class SequenceBuilder {
    constructor({ refs = DEFAULT_REFS, sessionId = 'chair-session', armMode = 'folded' } = {}) {
      this.refs = refs;
      this.sessionId = sessionId;
      this.armMode = armMode;
      this.timestampMs = 0;
      this.frameId = 1;
      this.frames = [];
    }

    add(progress, {
      dtMs = 100,
      qualityState = QualityStates.Ready,
      reasonCode = null,
      confidence = 0.92,
      armConfidence = confidence,
      armMode = this.armMode,
      timestampMs = this.timestampMs,
    } = {}) {
      const frame = mockFrame({
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
        poseFrame: frame,
        qualityStatus: qualityStatus(frame, { state: qualityState, reasonCode }),
      });
      this.frameId += 1;
      if (timestampMs === this.timestampMs) this.timestampMs += dtMs;
      return this;
    }

    hold(progress, durationMs, options = {}) {
      const dtMs = options.dtMs ?? 100;
      const count = Math.max(1, Math.floor(durationMs / dtMs));
      for (let index = 0; index <= count; index += 1) {
        this.add(progress, { ...options, dtMs });
      }
      return this;
    }

    ramp(from, to, durationMs, options = {}) {
      const dtMs = options.dtMs ?? 100;
      const count = Math.max(1, Math.floor(durationMs / dtMs));
      for (let index = 1; index <= count; index += 1) {
        this.add(interpolate(from, to, index / count), { ...options, dtMs });
      }
      return this;
    }

    duplicateLast({ reversed = false } = {}) {
      const last = this.frames[this.frames.length - 1];
      const duplicateTimestamp = reversed
        ? last.poseFrame.timestampMs - 50
        : last.poseFrame.timestampMs;
      const frame = {
        ...last.poseFrame,
        frameId: this.frameId,
        timestampMs: duplicateTimestamp,
      };
      this.frames.push({
        poseFrame: frame,
        qualityStatus: qualityStatus(frame),
      });
      this.frameId += 1;
      return this;
    }
  }

  function addNormalCycle(builder, {
    riseMs = 600,
    standHoldMs = 2_000,
    descendMs = 600,
    sitHoldMs = 2_000,
    armMode = undefined,
    dtMs = 100,
  } = {}) {
    builder
      .ramp(0, 1, riseMs, { armMode, dtMs })
      .hold(1, standHoldMs, { armMode, dtMs })
      .ramp(1, 0, descendMs, { armMode, dtMs })
      .hold(0, sitHoldMs, { armMode, dtMs });
    return builder;
  }

  function normalSequence(cycles = 1, options = {}) {
    const builder = new SequenceBuilder(options);
    builder.hold(0, 400, { armMode: options.armMode });
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      addNormalCycle(builder, options);
    }
    return builder.frames;
  }

  function runSequence(frames, {
    profile = calibrationProfile(),
    sessionId = 'chair-session',
    assessmentId = 'assessment-chair',
    armUseOccurrenceCount = 0,
  } = {}) {
    const machine = createChairStandStateMachine({
      sessionId,
      assessmentId,
      startedAtMs: 0,
      armUseOccurrenceCount,
    });
    let snapshot = machine.snapshot();
    for (const entry of frames) {
      snapshot = machine.addFrame({
        poseFrame: entry.poseFrame,
        calibrationProfile: profile,
        qualityStatus: entry.qualityStatus,
      });
    }
    return { machine, snapshot };
  }

  function latestEventTypes(snapshot) {
    return snapshot.allEvents.map((event) => event.type);
  }

  const normalThree = runSequence(normalSequence(3));
  assert.equal(normalThree.snapshot.repetitionCount, 3, 'normal three cycles count exactly three reps');
  assert.equal(normalThree.snapshot.state, ChairStandMachineStates.Sit, 'normal sequence ends in SIT');
  assert.ok(normalThree.snapshot.allEvents.every((event) => event && event.type), 'UI receives structured AssessmentEvent objects');

  const halfRiseBuilder = new SequenceBuilder();
  halfRiseBuilder.hold(0, 400).ramp(0, 0.55, 500).hold(0.55, 1_000).ramp(0.55, 0, 500).hold(0, 2_000);
  const halfRise = runSequence(halfRiseBuilder.frames);
  assert.equal(halfRise.snapshot.repetitionCount, 0, 'half rise is not counted');

  const longStandBuilder = new SequenceBuilder();
  longStandBuilder.hold(0, 400);
  addNormalCycle(longStandBuilder, { standHoldMs: 5_000 });
  const longStand = runSequence(longStandBuilder.frames);
  assert.equal(longStand.snapshot.repetitionCount, 1, 'long stand hold is still one cycle');

  const riseBeforeSitBuilder = new SequenceBuilder();
  riseBeforeSitBuilder
    .hold(0, 400)
    .ramp(0, 1, 600)
    .hold(1, 2_000)
    .ramp(1, 0.45, 400)
    .ramp(0.45, 1, 500)
    .hold(1, 2_000)
    .ramp(1, 0, 600)
    .hold(0, 2_000);
  const riseBeforeSit = runSequence(riseBeforeSitBuilder.frames);
  assert.equal(riseBeforeSit.snapshot.repetitionCount, 1, 'rising again before sitting does not double count the same cycle');

  const lossBuilder = new SequenceBuilder();
  lossBuilder
    .hold(0, 400)
    .ramp(0, 0.45, 400)
    .hold(0.45, 200, {
      qualityState: QualityStates.Paused,
      reasonCode: QualityReasonCodes.TrackingLost,
      confidence: 0.2,
      armConfidence: 0.2,
    })
    .ramp(0.45, 1, 500)
    .hold(1, 2_000)
    .ramp(1, 0, 600)
    .hold(0, 2_000);
  const temporaryLoss = runSequence(lossBuilder.frames);
  assert.equal(temporaryLoss.snapshot.repetitionCount, 1, 'temporary landmark loss pauses and resumes without losing the cycle');
  assert.equal(temporaryLoss.snapshot.secondaryObservations.pauseCount, 1, 'temporary landmark loss records one pause');
  assert.ok(latestEventTypes(temporaryLoss.snapshot).includes(AssessmentEventTypes.QualityPaused), 'pause event is structured');
  assert.ok(latestEventTypes(temporaryLoss.snapshot).includes(AssessmentEventTypes.QualityResumed), 'resume event is structured');

  const invalidBuilder = new SequenceBuilder();
  invalidBuilder
    .hold(0, 400)
    .add(0, {
      qualityState: QualityStates.Invalid,
      reasonCode: QualityReasonCodes.BodyOutOfFrame,
      confidence: 0.2,
      armConfidence: 0.2,
    });
  const invalid = runSequence(invalidBuilder.frames);
  assert.equal(invalid.snapshot.state, ChairStandMachineStates.Invalid, 'frame exit invalidates the trial');
  assert.equal(invalid.snapshot.invalidReason, 'QUALITY_INVALID');

  const uncrossed = runSequence(normalSequence(1, { armMode: 'uncrossed' }));
  assert.equal(uncrossed.snapshot.state, ChairStandMachineStates.RestartRequired, 'S2-CHAIR-04 arms unfolded for 300ms requires the one allowed restart');

  const supportBuilder = new SequenceBuilder({ armMode: 'support' });
  supportBuilder.hold(0, 700, { armMode: 'support' });
  const support = runSequence(supportBuilder.frames);
  assert.equal(support.snapshot.state, ChairStandMachineStates.RestartRequired, 'S2-CHAIR-04 first confirmed support requires restart');
  assert.equal(support.snapshot.invalidReason, 'ARM_USE_RESTART_REQUIRED');
  assert.equal(support.snapshot.userMessage, 'We could not clearly see your arms. Please restart the test.');

  const secondSupportBuilder = new SequenceBuilder({ armMode: 'support' });
  secondSupportBuilder.hold(0, 700, { armMode: 'support' });
  const secondSupport = runSequence(secondSupportBuilder.frames, { armUseOccurrenceCount: 1 });
  assert.equal(secondSupport.snapshot.armUseCdcZero, true, 'S2-CHAIR-04 second arm-use occurrence produces CDC score zero and V6 input');

  const lowArmConfidence = runSequence(normalSequence(1, { armMode: 'low-confidence' }));
  assert.equal(lowArmConfidence.snapshot.repetitionCount, 1, 'low arm confidence alone does not zero the test');
  assert.notEqual(lowArmConfidence.snapshot.state, ChairStandMachineStates.Invalid);

  const fast = runSequence(normalSequence(1, { riseMs: 300, descendMs: 300, dtMs: 33 }));
  assert.equal(fast.snapshot.repetitionCount, 1, 'fast complete movement is counted once');

  const slow = runSequence(normalSequence(1, { riseMs: 2_000, descendMs: 2_000 }));
  assert.equal(slow.snapshot.repetitionCount, 1, 'slow complete movement is counted once');

  assert.deepEqual(
    evaluatePartialRepetitionAtEnd({
      state: ChairStandMachineStates.Rising,
      maxProgressSinceLastSit: 0.55,
    }),
    {
      partialRepetitionCredit: 1,
      partialRepetitionRuleStatus: 'APPLIED',
      reasonCode: 'PARTIAL_REPETITION_AT_TIME_LIMIT',
    },
    'partial repetition rule is isolated and testable',
  );

  const partialBuilder = new SequenceBuilder();
  partialBuilder.hold(0, 400).ramp(0, 0.6, 800);
  const partial = runSequence(partialBuilder.frames);
  assert.equal(partial.snapshot.partialRepetition.partialRepetitionCredit, 1, 'S2-CHAIR-03 machine reports one full credit for a half rise at timeout');
  const partialFinal = partial.machine.finish({ completedAt: 30_000 });
  assert.equal(partialFinal.partialRepetition.partialRepetitionCredit, 1, 'S2-CHAIR-03 finalization preserves the half-rise credit');

  const duplicateBuilder = new SequenceBuilder();
  duplicateBuilder.hold(0, 400);
  addNormalCycle(duplicateBuilder);
  const duplicateFrames = [];
  for (const entry of duplicateBuilder.frames) {
    duplicateFrames.push(entry);
    duplicateFrames.push({
      poseFrame: {
        ...entry.poseFrame,
        frameId: entry.poseFrame.frameId + 10_000,
      },
      qualityStatus: {
        ...entry.qualityStatus,
        frameId: entry.qualityStatus.frameId + 10_000,
      },
    });
  }
  const baseOne = runSequence(duplicateBuilder.frames);
  const duplicated = runSequence(duplicateFrames);
  assert.equal(duplicated.snapshot.repetitionCount, baseOne.snapshot.repetitionCount, 'same timestamp duplicate frames do not change the result');
  assert.ok(latestEventTypes(duplicated.snapshot).includes(AssessmentEventTypes.AnalysisError), 'duplicate timestamp is recorded as analysis error');

  const reversedBuilder = new SequenceBuilder();
  reversedBuilder.hold(0, 400).duplicateLast({ reversed: true });
  addNormalCycle(reversedBuilder);
  const reversed = runSequence(reversedBuilder.frames);
  assert.equal(reversed.snapshot.repetitionCount, 1, 'reversed timestamp frame is ignored without double counting');
  assert.ok(latestEventTypes(reversed.snapshot).includes(AssessmentEventTypes.AnalysisError), 'reversed timestamp is recorded as analysis error');

  const invertedRefs = {
    sittingHipY: 0.7,
    standingHipY: 0.4,
    worldYSign: 1,
    verticalMotionDirection: VerticalMotionDirections.StandingDecreases,
  };
  const invertedProfile = calibrationProfile(invertedRefs);
  const inverted = runSequence(normalSequence(1, { refs: invertedRefs, armMode: 'low-confidence' }), { profile: invertedProfile });
  assert.equal(inverted.snapshot.repetitionCount, 1, 'opposite hip-y direction still counts through calibrated progress');

  const final = normalThree.machine.finish({ completedAt: 30_000 });
  assert.equal(final.state, ChairStandMachineStates.Completed, 'finish moves non-terminal state to COMPLETED');
  assert.equal(final.repetitionCount, 3);

  console.log('Chair Stand state machine checks passed.');
} finally {
  await server.close();
}
