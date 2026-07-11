import {
  BALANCE_STAGE_ORDER,
  BalanceTestMachineStates,
  createBalanceTestStateMachine,
} from '../pipeline/assessment/balanceTest/balanceTestStateMachine.js';
import {
  ChairStandMachineStates,
  createChairStandStateMachine,
} from '../pipeline/assessment/chairStand/chairStandStateMachine.js';
import { balanceConfig } from '../pipeline/shared/config/balance.config.js';
import { chairStandConfig } from '../pipeline/shared/config/chairStand.config.js';
import {
  ANALYZER_VERSION,
  ArmUseStates,
  AssessmentResultStatuses,
  AssessmentResultTypes,
  AssessmentTypes,
  BalanceMeasurementKind,
  BalanceStageStatuses,
  BalanceStages,
  ChairStandFinalStates,
  ChairStandMeasurementKind,
  PartialRepetitionRuleStatuses,
  ResultSources,
  STRUCTURED_PIPELINE_SCHEMA_VERSION,
  createTypedId,
} from '../pipeline/shared/types/index.js';
import { validateAssessmentResult } from '../pipeline/shared/validation/runtimeValidation.js';

const BALANCE_DURATION_SECONDS = 60;

const BALANCE_STAGE_TO_LEGACY_ID = {
  [BalanceStages.SideBySide]: 'side_by_side',
  [BalanceStages.SemiTandem]: 'semi_tandem',
  [BalanceStages.Tandem]: 'tandem',
  [BalanceStages.OneLeg]: 'one_leg',
};

const BALANCE_STAGE_LABELS = {
  [BalanceStages.SideBySide]: 'Side-by-side',
  [BalanceStages.SemiTandem]: 'Semi-tandem',
  [BalanceStages.Tandem]: 'Tandem',
  [BalanceStages.OneLeg]: 'One-leg',
};

const CHAIR_STATE_TO_PHASE = {
  [ChairStandMachineStates.WaitingForSit]: 'waiting',
  [ChairStandMachineStates.Sit]: 'seated',
  [ChairStandMachineStates.Rising]: 'rising',
  [ChairStandMachineStates.Stand]: 'standing',
  [ChairStandMachineStates.Descending]: 'lowering',
  [ChairStandMachineStates.Paused]: 'paused',
  [ChairStandMachineStates.Completed]: 'completed',
  [ChairStandMachineStates.Invalid]: 'invalid',
};

const CHAIR_STATE_TO_FINAL = {
  [ChairStandMachineStates.Sit]: ChairStandFinalStates.Sit,
  [ChairStandMachineStates.Rising]: ChairStandFinalStates.Rising,
  [ChairStandMachineStates.Stand]: ChairStandFinalStates.Stand,
  [ChairStandMachineStates.Descending]: ChairStandFinalStates.Descending,
  [ChairStandMachineStates.Completed]: ChairStandFinalStates.Unknown,
  [ChairStandMachineStates.Invalid]: ChairStandFinalStates.Unknown,
};

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, min, max) {
  if (!finite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function average(values = []) {
  const finiteValues = values.filter(finite);
  return finiteValues.length
    ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
    : null;
}

function elapsedSeconds(startedAt, nowMs, durationSeconds) {
  const start = finite(startedAt) ? startedAt : nowMs;
  return clamp(Math.floor(Math.max(nowMs - start, 0) / 1000), 0, durationSeconds);
}

function resultConfidence(snapshot, fallback = 0) {
  const featureConfidence = snapshot?.latestFeatures?.landmarkConfidence?.overall
    ?? snapshot?.latestFeatures?.footConfidence;
  return clamp(featureConfidence ?? fallback ?? 0, 0, 1);
}

function statusForStructuredResult({ forceInvalid = false, machineState = null } = {}) {
  if (forceInvalid) return AssessmentResultStatuses.Invalid;
  if (machineState === ChairStandMachineStates.Invalid || machineState === BalanceTestMachineStates.Invalid) {
    return AssessmentResultStatuses.Invalid;
  }
  return AssessmentResultStatuses.Valid;
}

function metadataForStructuredResult({ source, status, generatedAtMs }) {
  const liveValid = source === ResultSources.LivePose && status === AssessmentResultStatuses.Valid;
  return {
    source,
    isPersistable: liveValid,
    isClinicallyScorable: liveValid,
    analyzerVersion: ANALYZER_VERSION,
    schemaVersion: STRUCTURED_PIPELINE_SCHEMA_VERSION,
    generatedAtMs,
  };
}

function commonTiming({ startedAt, completedAt, pausedDurationMs = 0 }) {
  return {
    startedAtMs: finite(startedAt) ? startedAt : completedAt,
    completedAtMs: completedAt,
    activeAnalysisDurationMs: Math.max(0, completedAt - (finite(startedAt) ? startedAt : completedAt) - pausedDurationMs),
    pausedDurationMs,
  };
}

function normalizePartial(partial = {}) {
  const status = Object.values(PartialRepetitionRuleStatuses).includes(partial.partialRepetitionRuleStatus)
    ? partial.partialRepetitionRuleStatus
    : PartialRepetitionRuleStatuses.NotMeasurable;
  return {
    partialRepetitionCredit: finite(partial.partialRepetitionCredit) ? partial.partialRepetitionCredit : 0,
    partialRepetitionRuleStatus: status,
  };
}

function chairFinalState(snapshot) {
  if (snapshot?.latestFeatures?.hipProgress <= chairStandConfig.stateMachine.sitEnterProgressMax) {
    return ChairStandFinalStates.Sit;
  }
  if (snapshot?.latestFeatures?.hipProgress >= chairStandConfig.stateMachine.standProgressMin) {
    return ChairStandFinalStates.Stand;
  }
  return CHAIR_STATE_TO_FINAL[snapshot?.state] || ChairStandFinalStates.Unknown;
}

function buildChairStructuredResult({
  snapshot,
  sessionId,
  assessmentId,
  startedAt,
  completedAt,
  source,
  qualitySummary,
  forceInvalid = false,
  invalidReason = null,
}) {
  const status = statusForStructuredResult({ forceInvalid, machineState: snapshot?.state });
  const confidence = resultConfidence(snapshot, qualitySummary?.trackingQualityScore ?? 0);
  const partial = normalizePartial(snapshot?.partialRepetition);
  const result = {
    resultId: createTypedId('result'),
    assessmentId,
    sessionId,
    assessmentType: AssessmentTypes.ChairStand30s,
    status,
    resultType: AssessmentResultTypes.StructuredAssessment,
    metadata: metadataForStructuredResult({ source, status, generatedAtMs: completedAt }),
    timing: commonTiming({ startedAt, completedAt, pausedDurationMs: qualitySummary?.accumulatedPauseDurationMs || 0 }),
    primaryMeasurements: {
      kind: ChairStandMeasurementKind,
      durationSeconds: chairStandConfig.durationSeconds,
      completedRepetitions: snapshot?.repetitionCount ?? 0,
      ...partial,
      armUse: snapshot?.armUse || ArmUseStates.NotDetected,
      finalState: chairFinalState(snapshot),
    },
    secondaryObservations: snapshot?.secondaryObservations || [],
    qualitySummary: qualitySummary || { unavailable: true },
    events: snapshot?.allEvents || [],
    confidence,
    ...(invalidReason || snapshot?.invalidReason ? {
      error: {
        code: invalidReason || snapshot.invalidReason,
      },
    } : {}),
  };
  const validation = validateAssessmentResult(result);
  return { value: result, validation };
}

function chairMessageForState(snapshot = {}) {
  if (snapshot.userMessage) return snapshot.userMessage;
  if (snapshot.state === ChairStandMachineStates.WaitingForSit) return 'Sit fully on the chair before we start counting.';
  if (snapshot.state === ChairStandMachineStates.Sit) return 'Stand up fully, then sit back down with control.';
  if (snapshot.state === ChairStandMachineStates.Rising) return 'Stand all the way up.';
  if (snapshot.state === ChairStandMachineStates.Stand) return 'Good. Sit back down with control.';
  if (snapshot.state === ChairStandMachineStates.Descending) return 'Sit fully to complete the repetition.';
  if (snapshot.state === ChairStandMachineStates.Paused) return 'Tracking paused. Return to the marked position.';
  if (snapshot.state === ChairStandMachineStates.Invalid) return 'We could not measure this test reliably.';
  return 'Hold still while we set up the camera.';
}

function chairStateFromSnapshot({ snapshot, startedAt, nowMs, trackingQualityScore = 0 }) {
  const features = snapshot?.latestFeatures || {};
  const confidence = resultConfidence(snapshot, trackingQualityScore);
  const phase = CHAIR_STATE_TO_PHASE[snapshot?.state] || 'waiting';
  return {
    testType: 'chair_stand',
    repetitionCount: snapshot?.repetitionCount ?? 0,
    primaryValue: snapshot?.repetitionCount ?? 0,
    primaryLabel: 'Full stands',
    elapsedSeconds: elapsedSeconds(startedAt, nowMs, chairStandConfig.durationSeconds),
    durationSeconds: chairStandConfig.durationSeconds,
    confidence,
    isFullBodyVisible: Boolean(features.valid),
    warningMessage: chairMessageForState(snapshot),
    postureMessage: chairMessageForState(snapshot),
    isArmUseSuspected: snapshot?.armUse === ArmUseStates.Suspected || snapshot?.armUse === ArmUseStates.Confirmed,
    armUseDisqualified: snapshot?.armUse === ArmUseStates.Confirmed,
    isStandingOrRising: [
      ChairStandMachineStates.Rising,
      ChairStandMachineStates.Stand,
      ChairStandMachineStates.Descending,
    ].includes(snapshot?.state),
    phase,
    chairStandState: snapshot?.state,
    armState: snapshot?.armState,
    partialRepetition: snapshot?.partialRepetition,
    hipProgress: features.hipProgress,
    kneeAngles: features.kneeAngles,
    hipAngles: features.hipAngles,
    trunkAngle: features.trunkAngle,
    debugTimeline: snapshot?.debugTimeline || [],
    trackingPaused: snapshot?.state === ChairStandMachineStates.Paused,
    invalidReason: snapshot?.invalidReason || null,
  };
}

function balanceStageStatus(stage, snapshot) {
  if (stage.stage === snapshot?.stage && snapshot?.state === BalanceTestMachineStates.Holding) return 'holding';
  if (stage.stage === snapshot?.stage && snapshot?.state === BalanceTestMachineStates.PositionConfirmed) return 'holding';
  if (stage.status === BalanceStageStatuses.Passed) return 'completed';
  if (stage.status === BalanceStageStatuses.Failed) return 'failed';
  if (stage.status === BalanceStageStatuses.Invalid) return 'invalid';
  if (stage.status === BalanceStageStatuses.Ambiguous) return 'ambiguous';
  return 'pending';
}

function balanceProtocolFromSnapshot(snapshot = {}) {
  const state = snapshot.state;
  const currentStageId = BALANCE_STAGE_TO_LEGACY_ID[snapshot.stage] || 'side_by_side';
  const holdSeconds = (snapshot.holdElapsedMs || 0) / 1000;
  const stages = (snapshot.stages || []).map((stage, index) => {
    const current = stage.stage === snapshot.stage;
    const stageHoldSeconds = current && state === BalanceTestMachineStates.Holding
      ? holdSeconds
      : stage.holdDurationSeconds || 0;
    return {
      id: BALANCE_STAGE_TO_LEGACY_ID[stage.stage] || `stage_${index + 1}`,
      structuredStage: stage.stage,
      order: index + 1,
      name: BALANCE_STAGE_LABELS[stage.stage] || stage.stage,
      status: balanceStageStatus(stage, snapshot),
      holdSeconds: Number(stageHoldSeconds.toFixed(2)),
      holdDurationSeconds: stage.holdDurationSeconds || 0,
      remainingSeconds: Math.max(0, balanceConfig.targetHoldSeconds - stageHoldSeconds),
      confidence: stage.positionConfidence,
      positionConfidence: stage.positionConfidence,
      failureReason: stage.failureReason || null,
    };
  });
  const stopped = [
    BalanceTestMachineStates.Failed,
    BalanceTestMachineStates.Invalid,
  ].includes(state);
  const completed = state === BalanceTestMachineStates.Completed;
  return {
    status: completed ? 'completed' : stopped ? 'stopped' : state === BalanceTestMachineStates.Paused ? 'paused' : 'active',
    currentStageId,
    currentStageOrder: (snapshot.stageIndex ?? 0) + 1,
    currentStage: snapshot.stage,
    failureReason: snapshot.failureReason ? String(snapshot.failureReason).toLowerCase() : null,
    shouldFinishSession: completed || stopped,
    holdSeconds: Number(holdSeconds.toFixed(2)),
    targetHoldSeconds: balanceConfig.targetHoldSeconds,
    stages,
  };
}

function structuredBalanceStages(snapshot = {}) {
  return BALANCE_STAGE_ORDER.map((stageId) => {
    const stage = (snapshot.stages || []).find((item) => item.stage === stageId) || {};
    return {
      stage: stageId,
      status: stage.status || BalanceStageStatuses.NotAttempted,
      positionConfidence: clamp(stage.positionConfidence ?? 0, 0, 1),
      holdDurationSeconds: finite(stage.holdDurationSeconds) ? stage.holdDurationSeconds : 0,
      ...(stage.failureReason ? { failureReason: stage.failureReason } : {}),
    };
  });
}

function buildBalanceStructuredResult({
  snapshot,
  sessionId,
  assessmentId,
  startedAt,
  completedAt,
  source,
  qualitySummary,
  forceInvalid = false,
  invalidReason = null,
}) {
  const status = statusForStructuredResult({ forceInvalid, machineState: snapshot?.state });
  const confidence = resultConfidence(snapshot, qualitySummary?.trackingQualityScore ?? 0);
  const stages = structuredBalanceStages(snapshot);
  const attempted = stages.filter((stage) => stage.status !== BalanceStageStatuses.NotAttempted);
  const result = {
    resultId: createTypedId('result'),
    assessmentId,
    sessionId,
    assessmentType: AssessmentTypes.FourStageBalance,
    status,
    resultType: AssessmentResultTypes.StructuredAssessment,
    metadata: metadataForStructuredResult({ source, status, generatedAtMs: completedAt }),
    timing: commonTiming({ startedAt, completedAt, pausedDurationMs: qualitySummary?.accumulatedPauseDurationMs || 0 }),
    primaryMeasurements: {
      kind: BalanceMeasurementKind,
      stages,
      ...(attempted.length ? { lastAttemptedStage: attempted.at(-1).stage } : {}),
    },
    secondaryObservations: [],
    qualitySummary: qualitySummary || { unavailable: true },
    events: snapshot?.allEvents || [],
    confidence,
    ...(invalidReason || snapshot?.failureReason ? {
      error: {
        code: invalidReason || snapshot.failureReason,
      },
    } : {}),
  };
  const validation = validateAssessmentResult(result);
  return { value: result, validation };
}

function balanceStateFromSnapshot({ snapshot, startedAt, nowMs, trackingQualityScore = 0 }) {
  const protocol = balanceProtocolFromSnapshot(snapshot);
  const currentStage = protocol.stages.find((stage) => stage.id === protocol.currentStageId) || protocol.stages[0];
  const confidence = resultConfidence(snapshot, trackingQualityScore);
  const holdSeconds = currentStage?.holdSeconds ?? protocol.holdSeconds ?? 0;
  return {
    testType: 'four_stage_balance',
    repetitionCount: holdSeconds,
    primaryValue: holdSeconds,
    primaryLabel: 'Hold seconds',
    elapsedSeconds: elapsedSeconds(startedAt, nowMs, BALANCE_DURATION_SECONDS),
    durationSeconds: BALANCE_DURATION_SECONDS,
    confidence,
    isFullBodyVisible: Boolean(snapshot?.latestFeatures?.valid),
    warningMessage: snapshot?.userMessage || 'Move your feet to match the guide.',
    postureMessage: snapshot?.userMessage || 'Move your feet to match the guide.',
    isArmUseSuspected: snapshot?.failureReason === 'SUPPORT_USED',
    isStandingOrRising: true,
    phase: currentStage?.id || protocol.status,
    balanceProtocol: protocol,
    balanceResult: { officialProtocol: protocol, stages: protocol.stages },
    balanceState: snapshot?.state,
    balanceStage: snapshot?.stage,
    balancePositionScores: snapshot?.latestMatch?.scores || snapshot?.latestFeatures?.scores || null,
    debugTimeline: snapshot?.debugTimeline || [],
    trackingPaused: snapshot?.state === BalanceTestMachineStates.Paused,
    invalidReason: snapshot?.failureReason || null,
  };
}

class StructuredMovementAnalyzer {
  constructor(selectedTest = 'chair_stand') {
    this.selectedTest = selectedTest;
    this.reset();
  }

  startSession(userId = 'remote-user', startedAt = Date.now(), sessionId = `analysis-${startedAt}`) {
    this.userId = userId;
    this.startedAt = startedAt;
    this.sessionId = sessionId;
    this.assessmentId = sessionId;
    if (this.selectedTest === 'four_stage_balance') {
      this.machine = createBalanceTestStateMachine({
        sessionId,
        assessmentId: sessionId,
        startedAtMs: startedAt,
      });
    } else {
      this.machine = createChairStandStateMachine({
        sessionId,
        assessmentId: sessionId,
        startedAtMs: startedAt,
      });
    }
    this.latestSnapshot = this.machine.snapshot([]);
    this.latestState = this.stateFromSnapshot(startedAt);
    return this.latestState;
  }

  addFrame(input = {}) {
    if (!this.machine) return this.latestState;
    if (!input.poseFrame || !input.calibrationProfile || !input.qualityStatus) {
      return this.getCurrentState(input.poseFrame?.timestampMs || Date.now());
    }
    this.latestSnapshot = this.machine.addFrame(input);
    if (this.selectedTest === 'four_stage_balance' && this.latestSnapshot.state === BalanceTestMachineStates.Passed) {
      const advanced = this.machine.advanceToNextStage();
      this.latestSnapshot = advanced.snapshot;
    }
    this.latestState = this.stateFromSnapshot(input.poseFrame.timestampMs, input.qualityStatus?.scores?.overall);
    return this.latestState;
  }

  addManualRepetition() {
    return this.latestState;
  }

  getCurrentState(nowMs = Date.now()) {
    this.latestState = this.stateFromSnapshot(nowMs);
    return this.latestState;
  }

  finishSession(completedAt = Date.now(), {
    qualitySummary = null,
    forceInvalid = false,
    invalidReason = null,
    source = ResultSources.LivePose,
  } = {}) {
    if (this.machine) {
      this.latestSnapshot = this.machine.finish({ completedAt });
    }
    const structured = this.selectedTest === 'four_stage_balance'
      ? buildBalanceStructuredResult({
        snapshot: this.latestSnapshot,
        sessionId: this.sessionId,
        assessmentId: this.assessmentId,
        startedAt: this.startedAt,
        completedAt,
        source,
        qualitySummary,
        forceInvalid,
        invalidReason,
      })
      : buildChairStructuredResult({
        snapshot: this.latestSnapshot,
        sessionId: this.sessionId,
        assessmentId: this.assessmentId,
        startedAt: this.startedAt,
        completedAt,
        source,
        qualitySummary,
        forceInvalid,
        invalidReason,
      });
    const state = this.stateFromSnapshot(completedAt, structured.value.confidence);
    const result = this.selectedTest === 'four_stage_balance'
      ? this.balanceResultFromStructured({ structured, completedAt, state })
      : this.chairResultFromStructured({ structured, completedAt, state });
    return result;
  }

  reset() {
    this.userId = null;
    this.startedAt = null;
    this.sessionId = null;
    this.assessmentId = null;
    this.machine = null;
    this.latestSnapshot = null;
    this.latestState = this.defaultState();
  }

  defaultState() {
    if (this.selectedTest === 'four_stage_balance') {
      return {
        testType: 'four_stage_balance',
        repetitionCount: 0,
        primaryValue: 0,
        primaryLabel: 'Hold seconds',
        elapsedSeconds: 0,
        durationSeconds: BALANCE_DURATION_SECONDS,
        confidence: 0,
        isFullBodyVisible: false,
        warningMessage: 'Move your feet to match the guide.',
        postureMessage: 'Move your feet to match the guide.',
        isArmUseSuspected: false,
        isStandingOrRising: true,
        phase: 'side_by_side',
        balanceProtocol: balanceProtocolFromSnapshot({
          state: BalanceTestMachineStates.Setup,
          stage: BalanceStages.SideBySide,
          stageIndex: 0,
          stages: BALANCE_STAGE_ORDER.map((stage) => ({
            stage,
            status: BalanceStageStatuses.NotAttempted,
            positionConfidence: 0,
            holdDurationSeconds: 0,
          })),
          holdElapsedMs: 0,
        }),
      };
    }
    return {
      testType: 'chair_stand',
      repetitionCount: 0,
      primaryValue: 0,
      primaryLabel: 'Full stands',
      elapsedSeconds: 0,
      durationSeconds: chairStandConfig.durationSeconds,
      confidence: 0,
      isFullBodyVisible: false,
      warningMessage: 'Sit fully on the chair before we start counting.',
      postureMessage: 'Sit fully on the chair before we start counting.',
      isArmUseSuspected: false,
      isStandingOrRising: false,
      phase: 'waiting',
    };
  }

  stateFromSnapshot(nowMs = Date.now(), trackingQualityScore = 0) {
    if (!this.latestSnapshot) return this.defaultState();
    if (this.selectedTest === 'four_stage_balance') {
      return balanceStateFromSnapshot({
        snapshot: this.latestSnapshot,
        startedAt: this.startedAt,
        nowMs,
        trackingQualityScore,
      });
    }
    return chairStateFromSnapshot({
      snapshot: this.latestSnapshot,
      startedAt: this.startedAt,
      nowMs,
      trackingQualityScore,
    });
  }

  chairResultFromStructured({ structured, completedAt, state }) {
    const measurement = structured.value.primaryMeasurements;
    const repetitionCount = measurement.completedRepetitions;
    return {
      ...state,
      testType: 'chair_stand',
      primaryValue: repetitionCount,
      primaryLabel: 'Full stands',
      repetitionCount,
      countedRepetitionCount: repetitionCount,
      durationSeconds: measurement.durationSeconds,
      halfStandCredit: measurement.partialRepetitionCredit,
      finalHalfStandCreditStatus: measurement.partialRepetitionRuleStatus,
      partialRepetitionRuleStatus: measurement.partialRepetitionRuleStatus,
      confidence: structured.value.confidence,
      recommendationLevel: structured.value.status === AssessmentResultStatuses.Valid ? 'structured' : 'recheck',
      summaryMessage: structured.value.status === AssessmentResultStatuses.Valid
        ? `You completed ${repetitionCount} full stands in 30 seconds.`
        : 'We could not measure this test reliably.',
      seniorMessage: structured.value.status === AssessmentResultStatuses.Valid
        ? `You completed ${repetitionCount} full stands in 30 seconds.`
        : 'We could not measure this test reliably.',
      staffMessage: 'Chair Stand result generated by the structured state machine.',
      startedAt: this.startedAt,
      completedAt,
      structuredAssessmentResult: structured.value,
      structuredAssessmentValidation: structured.validation,
      stateMachineSnapshot: this.latestSnapshot,
      testFlags: {
        armUseSuspected: measurement.armUse === ArmUseStates.Suspected,
        armUseDisqualified: measurement.armUse === ArmUseStates.Confirmed,
        structuredPipeline: true,
      },
      invalid: structured.value.status !== AssessmentResultStatuses.Valid,
      invalidReason: structured.value.error?.code || null,
    };
  }

  balanceResultFromStructured({ structured, completedAt, state }) {
    const stages = structured.value.primaryMeasurements.stages;
    const tandem = stages.find((stage) => stage.stage === BalanceStages.Tandem);
    const primaryValue = tandem?.holdDurationSeconds ?? 0;
    const protocol = state.balanceProtocol;
    return {
      ...state,
      testType: 'four_stage_balance',
      primaryValue,
      primaryLabel: 'Tandem hold seconds',
      repetitionCount: primaryValue,
      durationSeconds: BALANCE_DURATION_SECONDS,
      confidence: structured.value.confidence,
      balanceResult: {
        officialProtocol: protocol,
        stages: protocol.stages,
        stageById: Object.fromEntries(protocol.stages.map((stage) => [stage.id, stage])),
      },
      officialProtocol: protocol,
      recommendationLevel: structured.value.status === AssessmentResultStatuses.Valid ? 'structured' : 'recheck',
      summaryMessage: structured.value.status === AssessmentResultStatuses.Valid
        ? `You held the tandem position for ${primaryValue.toFixed(1)} seconds.`
        : 'We could not measure this test reliably.',
      seniorMessage: structured.value.status === AssessmentResultStatuses.Valid
        ? `You held the tandem position for ${primaryValue.toFixed(1)} seconds.`
        : 'We could not measure this test reliably.',
      staffMessage: '4-Stage Balance result generated by the structured state machine.',
      startedAt: this.startedAt,
      completedAt,
      structuredAssessmentResult: structured.value,
      structuredAssessmentValidation: structured.validation,
      stateMachineSnapshot: this.latestSnapshot,
      testFlags: {
        structuredPipeline: true,
      },
      invalid: structured.value.status !== AssessmentResultStatuses.Valid,
      invalidReason: structured.value.error?.code || null,
    };
  }
}

export function createMovementAnalyzer(selectedTest) {
  return new StructuredMovementAnalyzer(selectedTest);
}
