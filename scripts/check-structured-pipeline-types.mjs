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
  const types = await server.ssrLoadModule('/client/src/pipeline/shared/types/index.js');
  const validation = await server.ssrLoadModule('/client/src/pipeline/shared/validation/runtimeValidation.js');
  const calibration = await server.ssrLoadModule('/client/src/pipeline/calibration/calibrationProfile.js');
  const functionalFindings = await server.ssrLoadModule('/client/src/pipeline/findings/functionalFindings.js');
  const otagoEngine = await server.ssrLoadModule('/client/src/pipeline/recommendation/otagoExerciseEngine.js');
  const progress = await server.ssrLoadModule('/client/src/pipeline/progress/progressRepository.js');
  const pipelineConfig = await server.ssrLoadModule('/client/src/pipeline/shared/config/pipeline.config.js');

  const {
    ArmUseStates,
    AssessmentEventTypes,
    AssessmentResultStatuses,
    AssessmentResultTypes,
    AssessmentTypes,
    BalanceStageStatuses,
    BalanceStages,
    CalibrationStatuses,
    ChairStandFinalStates,
    ChairStandMeasurementKind,
    EvidenceKinds,
    ExercisePlanStatuses,
    PartialRepetitionRuleStatuses,
    QualityReasonCodes,
    QualityStates,
    ResultSources,
    SteadiRiskLevels,
    SupervisionRequirements,
    SupportRequirements,
    CameraVerificationModes,
    PipelineModes,
  } = types;

  function validPoseFrame(overrides = {}) {
    return {
      sessionId: 'session-1',
      frameId: 1,
      timestampMs: 1_000,
      image: { width: 640, height: 480, mirrored: false },
      normalizedLandmarks: [
        { index: 23, x: 0.45, y: 0.5, z: 0, visibility: 0.9, isValid: true },
        { index: 24, x: 0.55, y: 0.5, z: 0, visibility: 0.9, isValid: true },
        { index: 27, x: 0.46, y: 0.9, z: 0, visibility: 0.9, isValid: true },
        { index: 28, x: 0.56, y: 0.9, z: 0, visibility: 0.9, isValid: true },
      ],
      confidence: { overall: 0.9, lowerBody: 0.9, feet: 0.9, upperBody: 0.8 },
      detectedPersonCount: 1,
      processing: { receivedAtMs: 900, completedAtMs: 950, latencyMs: 50 },
      ...overrides,
    };
  }

  function validQualityStatus(overrides = {}) {
    return {
      sessionId: 'session-1',
      frameId: 1,
      timestampMs: 1_000,
      state: QualityStates.Ready,
      scores: { overall: 0.9, tracking: 0.9 },
      reasons: [],
      timing: { currentFailureDurationMs: 0, accumulatedPauseDurationMs: 0 },
      ...overrides,
    };
  }

  function validEvent(overrides = {}) {
    return {
      eventId: 'event-1',
      sessionId: 'session-1',
      assessmentType: AssessmentTypes.ChairStand30s,
      type: AssessmentEventTypes.AssessmentCompleted,
      timestampMs: 31_000,
      confidence: 0.9,
      evidence: { kind: EvidenceKinds.Duration, durationMs: 30_000, requiredDurationMs: 30_000 },
      ...overrides,
    };
  }

  function validChairAssessment(overrides = {}) {
    return {
      resultId: 'chair-result',
      assessmentId: 'assessment-chair',
      sessionId: 'session-1',
      assessmentType: AssessmentTypes.ChairStand30s,
      status: AssessmentResultStatuses.Valid,
      resultType: 'STRUCTURED_ASSESSMENT_RESULT',
      metadata: {
        source: ResultSources.LivePose,
        isPersistable: true,
        isClinicallyScorable: true,
        analyzerVersion: 'test-analyzer',
        schemaVersion: 'test-schema',
        generatedAtMs: 31_100,
      },
      timing: {
        startedAtMs: 1_000,
        completedAtMs: 31_000,
        activeAnalysisDurationMs: 30_000,
        pausedDurationMs: 0,
      },
      primaryMeasurements: {
        kind: ChairStandMeasurementKind,
        durationSeconds: 30,
        completedRepetitions: 12,
        partialRepetitionCredit: 0,
        partialRepetitionRuleStatus: PartialRepetitionRuleStatuses.NotImplemented,
        armUse: ArmUseStates.NotDetected,
        finalState: ChairStandFinalStates.Stand,
      },
      secondaryObservations: [],
      qualitySummary: {
        sampleCount: 10,
        acceptedFrameCount: 10,
        lowQualityFrameCount: 0,
        cautionFrameCount: 0,
        lowQualityRatio: 0,
        trackingQualityScore: 0.9,
        longestLowQualityStreak: 0,
      },
      events: [validEvent()],
      confidence: 0.9,
      ...overrides,
    };
  }

  function validBalanceAssessment(overrides = {}) {
    return {
      ...validChairAssessment({
        resultId: 'balance-result',
        assessmentId: 'assessment-balance',
        assessmentType: AssessmentTypes.FourStageBalance,
        primaryMeasurements: {
          kind: 'FOUR_STAGE_BALANCE',
          stages: [
            { stage: BalanceStages.SideBySide, status: BalanceStageStatuses.Passed, positionConfidence: 0.9, holdDurationSeconds: 10 },
            { stage: BalanceStages.SemiTandem, status: BalanceStageStatuses.Passed, positionConfidence: 0.9, holdDurationSeconds: 10 },
            { stage: BalanceStages.Tandem, status: BalanceStageStatuses.Passed, positionConfidence: 0.9, holdDurationSeconds: 10 },
            { stage: BalanceStages.OneLeg, status: BalanceStageStatuses.Failed, positionConfidence: 0.8, holdDurationSeconds: 4 },
          ],
          lastAttemptedStage: BalanceStages.OneLeg,
        },
        events: [validEvent({ assessmentType: AssessmentTypes.FourStageBalance })],
      }),
      ...overrides,
    };
  }

  function assertOk(result, message) {
    assert.equal(result.ok, true, `${message}: ${JSON.stringify(result.failures)}`);
  }

  function assertFail(result, code, message) {
    assert.equal(result.ok, false, message);
    assert.ok(result.failures.some((failure) => failure.code === code), `${message}: expected ${code}, got ${JSON.stringify(result.failures)}`);
  }

  assertOk(validation.validatePoseFrame(validPoseFrame()), 'valid PoseFrame');
  assertFail(validation.validatePoseFrame(validPoseFrame({ normalizedLandmarks: [{ index: 99, x: 0, y: 0, isValid: true }] })), 'INVALID_LANDMARK_INDEX', 'bad landmark index rejected');
  assertFail(validation.validatePoseFrame(validPoseFrame({ normalizedLandmarks: [{ index: 0, x: NaN, y: 0, isValid: true }] })), 'INVALID_NUMBER', 'NaN coordinate rejected');
  assertFail(validation.validatePoseFrame(validPoseFrame({ confidence: { overall: 1.2, lowerBody: 0.9, feet: 0.9, upperBody: 0.9 } })), 'SCORE_OUT_OF_RANGE', 'confidence range rejected');
  assertFail(validation.validatePoseFrame(validPoseFrame({ image: { width: -1, height: 480, mirrored: false } })), 'INVALID_IMAGE_SIZE', 'negative image width rejected');
  assertFail(validation.validatePoseFrame(validPoseFrame({ sessionId: '' })), 'MISSING_REQUIRED_STRING', 'missing sessionId rejected');
  assertFail(validation.validatePoseFrame(validPoseFrame({ normalizedLandmarks: [{ index: 0, x: 0, y: 0, isValid: true }, { index: 0, x: 0, y: 0, isValid: true }] })), 'DUPLICATE_LANDMARK_INDEX', 'duplicate landmark rejected');
  assertFail(validation.validatePoseFrame(validPoseFrame({ processing: { receivedAtMs: 100, completedAtMs: 90, latencyMs: 0 } })), 'PROCESSING_TIMESTAMP_REVERSED', 'processing timestamp reversal rejected');

  const invalidChairCalibration = calibration.createCalibrationProfile({
    sessionId: 'session-1',
    assessmentType: AssessmentTypes.ChairStand30s,
    status: CalibrationStatuses.Valid,
    confidence: { overall: 0.9 },
  });
  assertFail(invalidChairCalibration.validation, 'MISSING_CHAIR_STAND_REFERENCE', 'chair calibration requires references');
  const invalidBalanceCalibration = calibration.createCalibrationProfile({
    sessionId: 'session-1',
    assessmentType: AssessmentTypes.FourStageBalance,
    status: CalibrationStatuses.Valid,
    references: { neutralFootPosition: { left: 0, right: 1 } },
    confidence: { overall: 0.9 },
  });
  assertFail(invalidBalanceCalibration.validation, 'MISSING_BALANCE_FOOT_GEOMETRY_CONFIDENCE', 'balance calibration requires foot confidence');
  const unknownOrientation = calibration.createCalibrationProfile({
    sessionId: 'session-1',
    assessmentType: AssessmentTypes.FourStageBalance,
    coordinateOrientation: calibration.createDefaultCoordinateOrientation({ mirrored: true }),
    status: CalibrationStatuses.InProgress,
    confidence: { overall: 0.5 },
  });
  assertOk(unknownOrientation.validation, 'UNKNOWN coordinate orientation is allowed');
  assertFail(validation.validateCalibrationApplication(unknownOrientation.value, { sessionId: 'session-2', assessmentType: AssessmentTypes.FourStageBalance }), 'CALIBRATION_SESSION_MISMATCH', 'calibration session reuse rejected');
  assertFail(validation.validateCalibrationApplication(unknownOrientation.value, { sessionId: 'session-1', assessmentType: AssessmentTypes.ChairStand30s }), 'CALIBRATION_ASSESSMENT_TYPE_MISMATCH', 'calibration assessment reuse rejected');

  assertOk(validation.validateQualityStatus(validQualityStatus(), { poseFrame: validPoseFrame() }), 'READY QualityStatus');
  assertFail(validation.validateQualityStatus(validQualityStatus({ state: QualityStates.Invalid, reasons: [] })), 'INVALID_QUALITY_REQUIRES_REASON', 'INVALID quality requires reason');
  assertFail(validation.validateQualityStatus(validQualityStatus({ scores: { overall: 2 } })), 'SCORE_OUT_OF_RANGE', 'quality score range rejected');
  assertFail(validation.validateQualityStatus(validQualityStatus({ sessionId: 'other' }), { poseFrame: validPoseFrame() }), 'QUALITY_SESSION_MISMATCH', 'quality session mismatch rejected');

  assertOk(validation.validateAssessmentEvent(validEvent()), 'valid AssessmentEvent');
  assertFail(validation.validateAssessmentEvent(validEvent({ timestampMs: 900 }), { previousTimestampMs: 1_000 }), 'EVENT_TIMESTAMP_REVERSED', 'reversed event timestamp rejected');
  assertFail(validation.validateAssessmentEvent(validEvent({ confidence: 2 })), 'SCORE_OUT_OF_RANGE', 'event confidence range rejected');
  assertFail(validation.validateAssessmentEvent(validEvent({ sessionId: 'other' }), { sessionId: 'session-1' }), 'EVENT_SESSION_MISMATCH', 'mixed session event rejected');
  assertFail(validation.validateAssessmentEvent(validEvent({ evidence: undefined })), 'MISSING_EVENT_EVIDENCE', 'major event without evidence rejected');

  assertOk(validation.validateAssessmentResult(validChairAssessment()), 'LIVE_POSE VALID AssessmentResult');
  assertFail(validation.validateAssessmentResult(validChairAssessment({ metadata: { ...validChairAssessment().metadata, source: ResultSources.Demo, isPersistable: true } })), 'DEMO_RESULT_PERSISTABLE', 'DEMO persistable rejected');
  assertFail(validation.validateAssessmentResult(validChairAssessment({ metadata: { ...validChairAssessment().metadata, source: ResultSources.Fallback, isPersistable: false, isClinicallyScorable: true } })), 'FALLBACK_RESULT_CLINICALLY_SCORABLE', 'Fallback clinically scorable rejected');
  assertFail(validation.validateAssessmentResult(validChairAssessment({ status: AssessmentResultStatuses.Invalid, metadata: { ...validChairAssessment().metadata, isPersistable: true } })), 'NON_VALID_RESULT_PERSISTABLE', 'Invalid persistable rejected');
  assertFail(validation.validateAssessmentResult(validChairAssessment({ timing: { ...validChairAssessment().timing, completedAtMs: 500 } })), 'ASSESSMENT_TIMING_REVERSED', 'timing reversal rejected');
  assertFail(validation.validateAssessmentResult(validChairAssessment({ primaryMeasurements: validBalanceAssessment().primaryMeasurements })), 'ASSESSMENT_MEASUREMENT_KIND_MISMATCH', 'mixed measurement kind rejected');
  assertFail(validation.validateAssessmentResult(validChairAssessment({ events: [validEvent({ sessionId: 'other' })] })), 'EVENT_SESSION_MISMATCH', 'mixed event session rejected');
  assertFail(validation.validateAssessmentResult(validChairAssessment({ events: [] })), 'VALID_RESULT_MISSING_FINAL_EVENT', 'valid result missing final event rejected');
  assertFail(validation.validateAssessmentResult(validChairAssessment({ metadata: { ...validChairAssessment().metadata, source: undefined } })), 'MISSING_RESULT_SOURCE', 'missing source rejected');
  assertOk(validation.validateAssessmentResult(validChairAssessment()), 'NOT_IMPLEMENTED partial rep with zero accepted');
  assertFail(validation.validateAssessmentResult(validChairAssessment({ primaryMeasurements: { ...validChairAssessment().primaryMeasurements, partialRepetitionCredit: 1 } })), 'PARTIAL_REP_NOT_IMPLEMENTED_CREDIT', 'NOT_IMPLEMENTED partial rep credit rejected');

  const steadi = {
    value: {
      riskLevel: SteadiRiskLevels.Moderate,
      strengthProblem: true,
      balanceProblem: false,
      inputs: {
        chairStandRepetitions: 7,
        tandemHoldSeconds: 10,
      },
      appliedRuleVersion: 'structured_check_fixture.v1',
      reasonCodes: ['CHAIR_STAND_BELOW_REFERENCE'],
    },
  };
  steadi.validation = validation.validateSteadiScoreResult(steadi.value);
  assertOk(steadi.validation, 'valid STEADI result');
  assert.notEqual(steadi.value.riskLevel, SteadiRiskLevels.NotScorable);
  assertOk(validation.validateSteadiScoreResult({
    riskLevel: SteadiRiskLevels.NotScorable,
    strengthProblem: SteadiRiskLevels.NotScorable,
    balanceProblem: SteadiRiskLevels.NotScorable,
    inputs: {},
    appliedRuleVersion: 'structured_check_fixture.v1',
    reasonCodes: ['NON_CLINICAL_ASSESSMENT'],
  }), 'NOT_SCORABLE STEADI result validates');

  const lowRepChairAssessment = validChairAssessment({
    primaryMeasurements: {
      ...validChairAssessment().primaryMeasurements,
      completedRepetitions: 7,
      finalState: ChairStandFinalStates.Sit,
    },
  });
  const findings = functionalFindings.createFunctionalFindings({
    chairStandResult: lowRepChairAssessment,
    balanceResult: validBalanceAssessment(),
    profile: { age: 70, gender: 'female' },
  });
  assertOk(findings.validation, 'functional findings mapper');
  const plan = otagoEngine.createDeterministicOtagoExercisePlan({
    userId: 'user-1',
    steadiScore: steadi.value,
    findings: findings.value,
    sourceAssessments: [lowRepChairAssessment, validBalanceAssessment()],
  });
  assertOk(plan.validation, 'valid ExercisePlan');
  assertFail(validation.validateExercisePlan({ ...plan.value, selectedExercises: [{ ...plan.value.selectedExercises[0], reasonFindingIds: [] }] }), 'EXERCISE_MISSING_SOURCE_FINDING', 'exercise without source finding rejected');
  const blockedDemoPlan = otagoEngine.createDeterministicOtagoExercisePlan({
    userId: 'user-1',
    steadiScore: steadi.value,
    findings: findings.value,
    sourceAssessments: [validChairAssessment({ metadata: { ...validChairAssessment().metadata, source: ResultSources.Demo, isPersistable: false, isClinicallyScorable: false } })],
  });
  assertFail(blockedDemoPlan.validation, 'NON_LIVE_ASSESSMENT_EXERCISE_PLAN', 'demo assessment plan generation rejected');
  assertFail(validation.validateExercisePlan({ ...plan.value, riskLevel: SteadiRiskLevels.High, supervisionRequirement: SupervisionRequirements.None }), 'HIGH_RISK_REQUIRES_PROFESSIONAL_REVIEW', 'high risk requires professional review');
  assertFail(validation.validateExercisePlan({ ...plan.value, selectedExercises: [plan.value.selectedExercises[0], plan.value.selectedExercises[0]] }), 'DUPLICATE_EXERCISE', 'duplicate exercise rejected');
  assertFail(validation.validateExercisePlan({ ...plan.value, selectedExercises: [{ ...plan.value.selectedExercises[0], supportRequirement: 'CHAIR' }] }), 'INVALID_ENUM', 'bad support requirement rejected');

  assert.equal(progress.canPersistStructuredAssessmentResult({ ...validChairAssessment(), resultType: AssessmentResultTypes.Frame }).ok, false);
  assert.equal(progress.canPersistStructuredAssessmentResult(validChairAssessment()).ok, true);
  assertFail(validation.validateFinalAssessmentResponse({ sessionId: 'old-session', result: validChairAssessment({ sessionId: 'old-session' }), isFinal: true }, { activeSessionId: 'new-session' }), 'STALE_FINAL_RESPONSE', 'stale final rejected');
  assertFail(validation.validateWorkerResponse({ type: 'FINAL_RESULT', result: validChairAssessment(), isFinal: true }), 'MISSING_REQUIRED_STRING', 'sessionless response rejected');
  assertFail(validation.validateFinalAssessmentResponse({ sessionId: 'session-1', result: validChairAssessment(), isFinal: true }, { expectedAssessmentType: AssessmentTypes.FourStageBalance }), 'FINAL_RESPONSE_ASSESSMENT_TYPE_MISMATCH', 'wrong assessmentType final rejected');
  assertFail(validation.validateFinalAssessmentResponse({ sessionId: 'session-1', result: validChairAssessment(), isFinal: true }, { cancelledSessionIds: ['session-1'] }), 'CANCELLED_SESSION_FINAL_RESPONSE', 'cancelled session final rejected');

  assert.equal(pipelineConfig.resolveAssessmentPipelineMode(), PipelineModes.StructuredV2);
  assert.equal(pipelineConfig.resolveAssessmentPipelineMode({ requestedMode: PipelineModes.StructuredV2, isDevelopment: false }), PipelineModes.StructuredV2);
  assert.equal(pipelineConfig.resolveAssessmentPipelineMode({ requestedMode: PipelineModes.StructuredV2, isDevelopment: true }), PipelineModes.StructuredV2);
  for (const mode of [PipelineModes.StructuredV2]) {
    assert.equal(progress.canPersistStructuredAssessmentResult(validChairAssessment(), { pipelineMode: mode }).ok, true);
    assert.equal(progress.canPersistStructuredAssessmentResult(validChairAssessment({ metadata: { ...validChairAssessment().metadata, source: ResultSources.Demo, isPersistable: false, isClinicallyScorable: false } }), { pipelineMode: mode }).ok, false);
  }
  const fallback = validChairAssessment({
    status: AssessmentResultStatuses.Incomplete,
    metadata: { ...validChairAssessment().metadata, source: ResultSources.Fallback, isPersistable: false, isClinicallyScorable: false },
    primaryMeasurements: { ...validChairAssessment().primaryMeasurements, completedRepetitions: 0 },
    events: [],
  });
  assert.equal(progress.canPersistStructuredAssessmentResult(fallback).ok, false);

  console.log('Structured pipeline type checks passed.');
} finally {
  await server.close();
}
