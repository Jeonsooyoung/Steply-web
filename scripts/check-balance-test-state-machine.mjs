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
    BalanceStages,
    CalibrationStatuses,
    CameraViews,
    CoordinateAxisDirections,
    QualityReasonCodes,
    QualityStates,
    VerticalMotionDirections,
  } = await server.ssrLoadModule('/client/src/pipeline/shared/types/index.js');
  const {
    BALANCE_STAGE_ORDER,
    BalanceFailureReasons,
    BalanceTestMachineStates,
    createBalanceTestStateMachine,
  } = await server.ssrLoadModule('/client/src/pipeline/assessment/balanceTest/balanceTestStateMachine.js');

  const FOOT_VECTOR = { x: 0, y: 0.08 };
  const FOOT_LENGTH = Math.hypot(FOOT_VECTOR.x, FOOT_VECTOR.y);

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

  function makeFoot(center, { confidence = 0.92 } = {}) {
    return {
      ankle: { x: center.x, y: center.y },
      heel: { x: center.x - FOOT_VECTOR.x / 2, y: center.y - FOOT_VECTOR.y / 2 },
      toe: { x: center.x + FOOT_VECTOR.x / 2, y: center.y + FOOT_VECTOR.y / 2 },
      confidence,
    };
  }

  function worldPoint(point) {
    return {
      ...point,
      x: point.x,
      y: point.y,
      z: point.y,
      xMeters: point.x,
      yMeters: point.y,
      zMeters: point.y,
    };
  }

  function stageFeet(stage, options = {}) {
    const {
      swapped = false,
      smallLift = false,
      touchedDown = false,
      moved = false,
      positionLost = false,
      occluded = false,
    } = options;
    const confidence = occluded ? 0.18 : 0.92;
    let leftCenter = { x: 0.481, y: 0.84 };
    let rightCenter = { x: 0.519, y: 0.84 };

    if (stage === BalanceStages.SemiTandem) {
      leftCenter = { x: 0.481, y: 0.80 };
      rightCenter = { x: 0.519, y: 0.84 };
    }
    if (stage === BalanceStages.Tandem) {
      leftCenter = swapped ? { x: 0.51, y: 0.88 } : { x: 0.5, y: 0.80 };
      rightCenter = swapped ? { x: 0.5, y: 0.80 } : { x: 0.51, y: 0.88 };
    }
    if (stage === BalanceStages.OneLeg) {
      leftCenter = { x: 0.481, y: touchedDown ? 0.84 : (smallLift ? 0.82 : 0.74) };
      rightCenter = { x: 0.519, y: 0.84 };
    }
    if (moved) {
      if (stage === BalanceStages.OneLeg) rightCenter = { x: rightCenter.x + 0.07, y: rightCenter.y };
      else leftCenter = { x: leftCenter.x + 0.07, y: leftCenter.y };
    }
    if (positionLost) leftCenter = { x: leftCenter.x, y: leftCenter.y + 0.02 };

    return {
      left: makeFoot(leftCenter, { confidence }),
      right: makeFoot(rightCenter, { confidence }),
    };
  }

  function calibrationProfile({
    sessionId = 'balance-session',
    cameraView = CameraViews.ObliqueLeft,
    footPlacementObservable = true,
  } = {}) {
    const baseline = stageFeet(BalanceStages.SideBySide);
    return {
      calibrationId: 'balance-calibration',
      sessionId,
      assessmentType: AssessmentTypes.FourStageBalance,
      status: CalibrationStatuses.Valid,
      createdAtMs: 0,
      coordinateOrientation: {
        imageYAxis: CoordinateAxisDirections.DownPositive,
        worldYAxis: CoordinateAxisDirections.Unknown,
        cameraMirrored: false,
        verticalMotionDirection: VerticalMotionDirections.Unknown,
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
        L_foot: FOOT_LENGTH,
        H_stand: 0.56,
        W_shoulder: 0.16,
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

  function poseFrame({
    sessionId = 'balance-session',
    frameId,
    timestampMs,
    stage,
      cameraView = CameraViews.ObliqueLeft,
      support = false,
      caregiver = false,
      pelvisOffsetMl = 0,
      pelvisOffsetAp = 0,
      ...options
  }) {
    const feet = stageFeet(stage, options);
    const landmarks = Array.from({ length: 33 }, (_, index) => landmark(index, 0.5, 0.5, { visibility: 0.45 }));
    landmarks[11] = landmark(11, 0.43, 0.36);
    landmarks[12] = landmark(12, 0.57, 0.36);
    landmarks[15] = landmark(15, support ? 0.86 : 0.43, support ? 0.5 : 0.52, { visibility: 0.92 });
    landmarks[16] = landmark(16, support ? 0.87 : 0.57, support ? 0.52 : 0.52, { visibility: 0.92 });
    landmarks[23] = landmark(23, 0.45 + pelvisOffsetMl, 0.56);
    landmarks[24] = landmark(24, 0.55 + pelvisOffsetMl, 0.56);
    landmarks[25] = landmark(25, 0.45, 0.7);
    landmarks[26] = landmark(26, 0.55, 0.7);
    landmarks[27] = landmark(27, feet.left.ankle.x, feet.left.ankle.y, { visibility: feet.left.confidence });
    landmarks[28] = landmark(28, feet.right.ankle.x, feet.right.ankle.y, { visibility: feet.right.confidence });
    landmarks[29] = landmark(29, feet.left.heel.x, feet.left.heel.y, { visibility: feet.left.confidence });
    landmarks[30] = landmark(30, feet.right.heel.x, feet.right.heel.y, { visibility: feet.right.confidence });
    landmarks[31] = landmark(31, feet.left.toe.x, feet.left.toe.y, { visibility: feet.left.confidence });
    landmarks[32] = landmark(32, feet.right.toe.x, feet.right.toe.y, { visibility: feet.right.confidence });
    const worldLandmarks = landmarks.map(worldPoint);
    worldLandmarks[23].zMeters += pelvisOffsetAp;
    worldLandmarks[24].zMeters += pelvisOffsetAp;
    const leftVertical = stage === BalanceStages.OneLeg
      ? (options.touchedDown ? 0.84 : options.smallLift ? 0.86 : 0.94)
      : 0.84;
    const rightVertical = 0.84;
    for (const index of [27, 29, 31]) {
      worldLandmarks[index].yMeters = leftVertical;
      if (stage === BalanceStages.OneLeg) worldLandmarks[index].zMeters = 0.84 + landmarks[index].y - feet.left.ankle.y;
    }
    for (const index of [28, 30, 32]) {
      worldLandmarks[index].yMeters = rightVertical;
      if (stage === BalanceStages.OneLeg) worldLandmarks[index].zMeters = 0.84 + landmarks[index].y - feet.right.ankle.y;
    }

    return {
      sessionId,
      frameId,
      timestampMs,
      image: { width: 640, height: 480, mirrored: false },
      normalizedLandmarks: landmarks,
      // S2-COORD-01/S2-BAL-01: ML=x, AP=z and V=y come from world landmarks.
      worldLandmarks,
      confidence: {
        overall: options.occluded ? 0.72 : 0.92,
        lowerBody: options.occluded ? 0.55 : 0.92,
        feet: options.occluded ? 0.18 : 0.92,
        upperBody: 0.92,
      },
      detectedPersonCount: 1,
      secondaryPeople: caregiver ? [{
        normalizedLandmarks: Array.from({ length: 33 }, (_, index) => landmark(index, 0.1, 0.1, { visibility: 0.45 })).map((point, index) => (
          index === 15 || index === 16 ? landmark(index, 0.5, 0.46) : point
        )),
        worldLandmarks: [],
      }] : [],
      processing: {
        receivedAtMs: timestampMs - 20,
        completedAtMs: timestampMs,
        latencyMs: 20,
      },
      cameraView,
    };
  }

  function qualityStatus(frame, {
    state = QualityStates.Ready,
    cameraView = CameraViews.ObliqueLeft,
    footPlacementObservable = true,
  } = {}) {
    const ready = state === QualityStates.Ready;
    return {
      sessionId: frame.sessionId,
      frameId: frame.frameId,
      timestampMs: frame.timestampMs,
      state,
      scores: {
        overall: ready ? 0.92 : 0.2,
        bodyVisibility: 0.95,
        lowerBodyVisibility: ready ? 0.92 : 0.2,
        feetVisibility: ready ? 0.92 : 0.2,
        orientation: footPlacementObservable ? 0.9 : 0.25,
        lighting: 0.9,
        tracking: ready ? 0.92 : 0.2,
      },
      reasons: ready ? [] : [{ code: QualityReasonCodes.TrackingLost }],
      timing: {
        currentFailureDurationMs: ready ? 0 : 1_000,
        accumulatedPauseDurationMs: ready ? 0 : 1_000,
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

  class Runner {
    constructor({
      profile = calibrationProfile(),
      supportRoi = null,
      sessionId = 'balance-session',
    } = {}) {
      this.sessionId = sessionId;
      this.profile = profile;
      this.machine = createBalanceTestStateMachine({
        sessionId,
        assessmentId: 'balance-assessment',
        startedAtMs: 0,
        supportRoi,
      });
      this.timestampMs = 0;
      this.frameId = 1;
      this.snapshot = this.machine.snapshot();
    }

    add(stage, {
      dtMs = 250,
      qualityState = QualityStates.Ready,
      cameraView = this.profile.camera.view,
      footPlacementObservable = true,
      ...options
    } = {}) {
      const frame = poseFrame({
        sessionId: this.sessionId,
        frameId: this.frameId,
        timestampMs: this.timestampMs,
        stage,
        cameraView,
        ...options,
      });
      this.snapshot = this.machine.addFrame({
        poseFrame: frame,
        calibrationProfile: this.profile,
        qualityStatus: qualityStatus(frame, {
          state: qualityState,
          cameraView,
          footPlacementObservable,
        }),
      });
      this.frameId += 1;
      this.timestampMs += dtMs;
      return this.snapshot;
    }

    hold(stage, durationMs, options = {}) {
      const dtMs = options.dtMs ?? 250;
      const count = Math.max(1, Math.ceil(durationMs / dtMs));
      for (let index = 0; index <= count; index += 1) {
        this.add(stage, { ...options, dtMs });
      }
      return this.snapshot;
    }

    passCurrentStage(stage = this.snapshot.stage) {
      this.hold(stage, 12_000);
      assert.equal(this.snapshot.state, BalanceTestMachineStates.Passed, `${stage} should pass (${this.snapshot.failureReason || 'no failure reason'})`);
      return this.snapshot;
    }

    advanceTo(stage) {
      while (this.snapshot.stage !== stage) {
        this.passCurrentStage(this.snapshot.stage);
        const advanced = this.machine.advanceToNextStage();
        assert.equal(advanced.ok, true, `advance to ${stage}`);
        this.snapshot = advanced.snapshot;
        this.timestampMs += 500;
      }
      return this;
    }
  }

  function wrongStageFor(stage) {
    if (stage === BalanceStages.SideBySide) return BalanceStages.SemiTandem;
    if (stage === BalanceStages.SemiTandem) return BalanceStages.SideBySide;
    if (stage === BalanceStages.Tandem) return BalanceStages.SemiTandem;
    return BalanceStages.OneLeg;
  }

  function eventTypes(snapshot) {
    return snapshot.allEvents.map((event) => event.type);
  }

  for (const stage of BALANCE_STAGE_ORDER) {
    const correct = new Runner().advanceTo(stage);
    correct.passCurrentStage(stage);
    assert.equal(correct.snapshot.state, BalanceTestMachineStates.Passed, `${stage}: correct pose passes`);
    assert.ok(eventTypes(correct.snapshot).includes(AssessmentEventTypes.PositionConfirmed), `${stage}: position confirmed event`);
    assert.ok(eventTypes(correct.snapshot).includes(AssessmentEventTypes.HoldStarted), `${stage}: hold started event`);
    assert.ok(eventTypes(correct.snapshot).includes(AssessmentEventTypes.HoldCompleted), `${stage}: hold completed event`);

    const wrong = new Runner().advanceTo(stage);
    wrong.hold(stage === BalanceStages.OneLeg ? stage : wrongStageFor(stage), 2_000, stage === BalanceStages.OneLeg ? { smallLift: true } : {});
    assert.notEqual(wrong.snapshot.state, BalanceTestMachineStates.Passed, `${stage}: similar wrong pose does not pass`);
    if (stage !== BalanceStages.OneLeg) assert.equal(wrong.snapshot.userMessage, 'Move your feet to match the guide.');

    const skim = new Runner().advanceTo(stage);
    const skimEventStart = skim.snapshot.allEvents.length;
    skim.hold(stage, 250);
    skim.hold(wrongStageFor(stage), 1_000, stage === BalanceStages.OneLeg ? { touchedDown: true } : {});
    assert.notEqual(skim.snapshot.state, BalanceTestMachineStates.Holding, `${stage}: passing through pose does not start hold`);
    const skimEvents = skim.snapshot.allEvents.slice(skimEventStart).map((event) => event.type);
    assert.ok(!skimEvents.includes(AssessmentEventTypes.HoldStarted), `${stage}: no hold started while skimming`);

    const moved = new Runner().advanceTo(stage);
    moved.hold(stage, 1_000);
    assert.equal(moved.snapshot.state, BalanceTestMachineStates.Holding, `${stage}: hold is active before foot movement`);
    moved.hold(stage, 1_000, { moved: true });
    assert.equal(moved.snapshot.state, BalanceTestMachineStates.Failed, `S2-BAL-F1 ${stage}: foot movement fails hold`);
    assert.equal(moved.snapshot.failureReason, BalanceFailureReasons.FootMoved);
    assert.ok(eventTypes(moved.snapshot).includes(AssessmentEventTypes.FootMoved), `${stage}: FOOT_MOVED event`);

    const lost = new Runner().advanceTo(stage);
    lost.hold(stage, 3_700);
    lost.hold(stage, 1_000, { qualityState: QualityStates.Paused });
    assert.equal(lost.snapshot.state, BalanceTestMachineStates.Paused, `${stage}: tracking loss pauses instead of failing`);
    assert.ok(eventTypes(lost.snapshot).includes(AssessmentEventTypes.TrackingLost), `${stage}: TRACKING_LOST event`);

    const recovered = new Runner().advanceTo(stage);
    recovered.hold(stage, 3_700);
    const beforePauseHoldElapsed = recovered.snapshot.holdElapsedMs;
    recovered.hold(stage, 1_000, { qualityState: QualityStates.Paused });
    recovered.hold(stage, 8_000);
    assert.equal(recovered.snapshot.state, BalanceTestMachineStates.Passed, `${stage}: tracking recovery resumes hold`);
    assert.ok(recovered.snapshot.holdElapsedMs >= 10_000, `${stage}: hold time uses timestamps after pause recovery`);
    assert.ok(recovered.snapshot.holdElapsedMs < beforePauseHoldElapsed + 10_000, `${stage}: paused time is excluded`);

    const support = new Runner({ supportRoi: { x: 0.8, y: 0.42, width: 0.16, height: 0.18 } }).advanceTo(stage);
    support.hold(stage, 1_000);
    support.hold(stage, 1_000, { support: true });
    assert.equal(support.snapshot.state, BalanceTestMachineStates.Failed, `S2-BAL-F4 ${stage}: ROI-based support use fails`);
    assert.equal(support.snapshot.failureReason, BalanceFailureReasons.SupportUsed);
    assert.ok(eventTypes(support.snapshot).includes(AssessmentEventTypes.SupportUsed), `${stage}: SUPPORT_USED event`);

    const noRoiSupport = new Runner().advanceTo(stage);
    noRoiSupport.hold(stage, 1_000);
    noRoiSupport.hold(stage, 1_000, { support: true });
    assert.notEqual(noRoiSupport.snapshot.failureReason, BalanceFailureReasons.SupportUsed, `${stage}: support detection is disabled without ROI`);

    const occluded = new Runner().advanceTo(stage);
    occluded.hold(stage, 2_000, { occluded: true });
    assert.notEqual(occluded.snapshot.state, BalanceTestMachineStates.Passed, `${stage}: occluded foot landmarks do not pass`);
    assert.ok(occluded.snapshot.userMessage, `${stage}: occluded feet produce corrective guidance`);

    const frontProfile = calibrationProfile({ cameraView: CameraViews.Front, footPlacementObservable: false });
    const front = new Runner({ profile: frontProfile }).advanceTo(stage);
    front.hold(stage, 2_000, {
      cameraView: CameraViews.Front,
      footPlacementObservable: false,
    });
    assert.notEqual(front.snapshot.state, BalanceTestMachineStates.Passed, `${stage}: ambiguous front view does not pass`);
    assert.ok(front.snapshot.userMessage, `${stage}: ambiguous front view produces corrective guidance`);
  }

  const tandemSwapped = new Runner().advanceTo(BalanceStages.Tandem);
  tandemSwapped.hold(BalanceStages.Tandem, 12_000, { swapped: true });
  assert.equal(tandemSwapped.snapshot.state, BalanceTestMachineStates.Passed, 'tandem accepts either foot in front');

  const oneLegSmallLift = new Runner().advanceTo(BalanceStages.OneLeg);
  oneLegSmallLift.hold(BalanceStages.OneLeg, 2_000, { smallLift: true });
  assert.notEqual(oneLegSmallLift.snapshot.state, BalanceTestMachineStates.Passed, 'one-leg with tiny lift does not pass');

  const oneLegTouchDown = new Runner().advanceTo(BalanceStages.OneLeg);
  oneLegTouchDown.hold(BalanceStages.OneLeg, 1_000);
  assert.equal(oneLegTouchDown.snapshot.state, BalanceTestMachineStates.Holding, 'one-leg hold starts before touchdown');
  oneLegTouchDown.hold(BalanceStages.OneLeg, 1_000, { touchedDown: true });
  assert.equal(oneLegTouchDown.snapshot.state, BalanceTestMachineStates.Failed, 'S2-BAL-F3 one-leg touchdown fails hold');
  assert.equal(oneLegTouchDown.snapshot.failureReason, BalanceFailureReasons.LiftedFootTouchedDown);
  assert.ok(eventTypes(oneLegTouchDown.snapshot).includes(AssessmentEventTypes.LiftedFootTouchedDown), 'touchdown event is logged');

  const onsetBoundary = new Runner();
  onsetBoundary.add(BalanceStages.SideBySide, { dtMs: 499 });
  onsetBoundary.add(BalanceStages.SideBySide, { dtMs: 1 });
  assert.notEqual(onsetBoundary.snapshot.state, BalanceTestMachineStates.Holding, 'S2-BAL-02 499ms does not confirm onset');
  onsetBoundary.add(BalanceStages.SideBySide);
  assert.equal(onsetBoundary.snapshot.state, BalanceTestMachineStates.Holding, 'S2-BAL-02 500ms confirms onset');

  const timeoutBoundary = new Runner();
  timeoutBoundary.add(BalanceStages.SemiTandem, { dtMs: 9_999 });
  timeoutBoundary.add(BalanceStages.SemiTandem, { dtMs: 1 });
  assert.notEqual(timeoutBoundary.snapshot.state, BalanceTestMachineStates.Failed, 'S2-BAL-02 9999ms does not time out');
  timeoutBoundary.add(BalanceStages.SemiTandem);
  assert.equal(timeoutBoundary.snapshot.failureReason, BalanceFailureReasons.UnableToAssumePosition, 'S2-BAL-02 10000ms records unable-to-assume');

  const f1Boundary = new Runner();
  f1Boundary.hold(BalanceStages.SideBySide, 750);
  f1Boundary.add(BalanceStages.SideBySide, { moved: true, dtMs: 199 });
  f1Boundary.add(BalanceStages.SideBySide, { moved: true, dtMs: 1 });
  assert.notEqual(f1Boundary.snapshot.state, BalanceTestMachineStates.Failed, 'S2-BAL-F1 199ms foot movement does not fail');
  f1Boundary.add(BalanceStages.SideBySide, { moved: true });
  assert.equal(f1Boundary.snapshot.failureReason, BalanceFailureReasons.FootMoved, 'S2-BAL-F1 200ms foot movement fails');

  const f2Boundary = new Runner();
  f2Boundary.hold(BalanceStages.SideBySide, 750);
  f2Boundary.add(BalanceStages.SideBySide, { positionLost: true, dtMs: 199 });
  f2Boundary.add(BalanceStages.SideBySide, { positionLost: true, dtMs: 1 });
  assert.notEqual(f2Boundary.snapshot.state, BalanceTestMachineStates.Failed, 'S2-BAL-F2 199ms position loss does not fail');
  f2Boundary.add(BalanceStages.SideBySide, { positionLost: true });
  assert.equal(f2Boundary.snapshot.failureReason, BalanceFailureReasons.PositionLost, 'S2-BAL-F2 200ms position loss fails');

  const f4Boundary = new Runner({ supportRoi: { x: 0.8, y: 0.42, width: 0.16, height: 0.18 } });
  f4Boundary.hold(BalanceStages.SideBySide, 750);
  f4Boundary.add(BalanceStages.SideBySide, { support: true, dtMs: 199 });
  f4Boundary.add(BalanceStages.SideBySide, { support: true, dtMs: 1 });
  assert.notEqual(f4Boundary.snapshot.state, BalanceTestMachineStates.Failed, 'S2-BAL-F4 199ms ROI contact does not fail');
  f4Boundary.add(BalanceStages.SideBySide, { support: true });
  assert.equal(f4Boundary.snapshot.failureReason, BalanceFailureReasons.SupportUsed, 'S2-BAL-F4 200ms ROI contact fails');

  const f5 = new Runner();
  f5.hold(BalanceStages.SideBySide, 750);
  f5.add(BalanceStages.SideBySide, { caregiver: true });
  assert.equal(f5.snapshot.failureReason, BalanceFailureReasons.CaregiverIntervention, 'S2-BAL-F5 second-person wrist in torso ROI fails');

  const sway = new Runner();
  sway.hold(BalanceStages.SideBySide, 750);
  for (let index = 0; index < 24; index += 1) {
    sway.add(BalanceStages.SideBySide, {
      pelvisOffsetMl: index % 2 ? 0.01 : -0.01,
      pelvisOffsetAp: index % 2 ? 0.004 : -0.004,
      dtMs: 250,
    });
  }
  assert.ok(sway.snapshot.swayMetrics.mlRms > 0, 'S2-BAL-SWAY preserves ML RMS');
  assert.ok(sway.snapshot.swayMetrics.apRms > 0, 'S2-BAL-SWAY preserves AP RMS');
  assert.ok(Number.isFinite(sway.snapshot.swayMetrics.ratios.mlToAp), 'S2-BAL-SWAY preserves ML/AP ratio');

  const sequence = new Runner();
  sequence.passCurrentStage(BalanceStages.SideBySide);
  assert.equal(sequence.machine.advanceToNextStage().ok, true, 'passed side-by-side can advance');
  sequence.snapshot = sequence.machine.snapshot();
  sequence.hold(BalanceStages.SideBySide, 2_000);
  assert.notEqual(sequence.machine.advanceToNextStage().ok, true, 'cannot advance when current stage has not passed');

  const full = new Runner();
  for (const stage of BALANCE_STAGE_ORDER) {
    full.passCurrentStage(stage);
    const advance = full.machine.advanceToNextStage();
    full.snapshot = advance.snapshot;
    full.timestampMs += 500;
  }
  assert.equal(full.snapshot.state, BalanceTestMachineStates.Completed, 'all stages complete only after one-leg pass and explicit advance');

  console.log('Balance Test state machine checks passed.');
} finally {
  await server.close();
}
