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
    AssessmentStatuses,
    ResultSources,
  } = await server.ssrLoadModule('/client/src/pose/assessmentResultMetadata.js');
  const { buildFinalAnalysisPayload } = await server.ssrLoadModule('/client/src/hooks/useSteplyDashboard.js');
  const {
    ArmUseStates,
    AssessmentEventTypes,
    AssessmentResultTypes,
    AssessmentResultStatuses,
    AssessmentTypes,
    ChairStandFinalStates,
    ChairStandMeasurementKind,
    EvidenceKinds,
    PartialRepetitionRuleStatuses,
    STRUCTURED_PIPELINE_SCHEMA_VERSION,
  } = await server.ssrLoadModule('/client/src/pipeline/shared/types/index.js');
  const {
    UserScreenIds,
    activeStepFromScreen,
    buildUserSessionFlow,
    canShowExerciseFromResult,
    screenFromActiveStep,
  } = await server.ssrLoadModule('/client/src/pipeline/ui/sessionFlow.js');
  const { createResultViewModel } = await server.ssrLoadModule('/client/src/pipeline/ui/resultViewModel.js');

  const session = {
    id: 'ui-session-1',
    profile: {
      id: 'profile-1',
      displayName: 'Ada',
      age: 76,
      gender: 'female',
      steadiStep1: {
        fallenPastYear: false,
        feelsUnsteady: false,
        worriesAboutFalling: false,
      },
    },
  };

  const validChairStand = {
    source: ResultSources.LivePose,
    status: AssessmentStatuses.Valid,
    resultType: 'FINAL_RESULT',
    analyzerFinalEvent: true,
    isPersistable: true,
    isClinicallyScorable: true,
    testType: 'chair_stand',
    assessmentType: 'chair_stand',
    analysisSessionId: 'analysis-valid-chair',
    repetitionCount: 4,
    primaryValue: 4,
    primaryLabel: 'Chair Stands',
    confidence: 0.94,
    trackingQualityScore: 0.94,
    trackingQualitySummary: {
      sampleCount: 90,
      acceptedFrameCount: 88,
      lowQualityFrameCount: 1,
      cautionFrameCount: 1,
      lowQualityRatio: 1 / 90,
      trackingQualityScore: 0.94,
      longestLowQualityStreak: 1,
    },
    startedAt: 1_000,
    completedAt: 31_000,
    durationSeconds: 30,
    finalPhase: 'seated',
  };
  validChairStand.structuredAssessmentResult = {
    resultId: 'result-valid-chair',
    assessmentId: validChairStand.analysisSessionId,
    sessionId: session.id,
    assessmentType: AssessmentTypes.ChairStand30s,
    status: AssessmentResultStatuses.Valid,
    resultType: AssessmentResultTypes.StructuredAssessment,
    metadata: {
      source: ResultSources.LivePose,
      isPersistable: true,
      isClinicallyScorable: true,
      analyzerVersion: 'structured-ui-check.v1',
      schemaVersion: STRUCTURED_PIPELINE_SCHEMA_VERSION,
      generatedAtMs: validChairStand.completedAt,
    },
    timing: {
      startedAtMs: validChairStand.startedAt,
      completedAtMs: validChairStand.completedAt,
      activeAnalysisDurationMs: 30_000,
      pausedDurationMs: 0,
    },
    primaryMeasurements: {
      kind: ChairStandMeasurementKind,
      durationSeconds: 30,
      completedRepetitions: validChairStand.repetitionCount,
      partialRepetitionCredit: 0,
      partialRepetitionRuleStatus: PartialRepetitionRuleStatuses.NotApplicable,
      armUse: ArmUseStates.NotDetected,
      finalState: ChairStandFinalStates.Sit,
    },
    secondaryObservations: [],
    qualitySummary: validChairStand.trackingQualitySummary,
    events: [{
      eventId: 'event-valid-chair-completed',
      sessionId: session.id,
      assessmentType: AssessmentTypes.ChairStand30s,
      type: AssessmentEventTypes.AssessmentCompleted,
      timestampMs: validChairStand.completedAt,
      confidence: validChairStand.confidence,
      evidence: {
        kind: EvidenceKinds.Duration,
        durationMs: 30_000,
        requiredDurationMs: 30_000,
      },
    }],
    confidence: validChairStand.confidence,
  };

  const validPayload = buildFinalAnalysisPayload({
    result: validChairStand,
    session,
    selectedTest: 'chair_stand',
    historyItems: [],
  });

  assert.equal(validPayload.source, ResultSources.LivePose, 'valid payload keeps live pose source');
  assert.ok(validPayload.structuredPipeline?.assessmentResult, 'valid payload has structured assessment result');
  assert.ok(validPayload.functionalFindings.length >= 1, 'valid payload has functional findings');
  assert.ok(validPayload.recommendationPlan.selectedExercises.length > 0, 'valid payload has selected structured exercises');
  assert.ok(validPayload.recommendationPlan.selectedExercises.length <= 3, 'exercise plan is capped to three exercises');
  assert.equal(canShowExerciseFromResult(validPayload), true, 'valid payload can show exercise screen');

  const validView = createResultViewModel(validPayload);
  assert.equal(validView.invalid, false, 'valid view model is not invalid');
  assert.match(validView.directResult.message, /full stands in 30 seconds/, 'direct result is user-readable');
  assert.ok(validView.findings.every((finding) => finding.classification), 'findings preserve primary/secondary classification');
  assert.ok(validView.exercises.every((exercise) => exercise.reason || exercise.support), 'exercise entries include reason or support text');
  assert.doesNotMatch(
    `${validView.findings.map((item) => item.title).join(' ')} ${validView.safetyNotice}`,
    /gluteus|proprioception|neurological|diagnos/i,
    'result copy does not diagnose muscles or disease',
  );

  const validFlow = buildUserSessionFlow({
    currentScreen: UserScreenIds.Result,
    finalResult: validPayload,
    selectedTest: 'chair_stand',
  });
  assert.deepEqual(
    validFlow.steps.map((step) => step.id),
    [
      UserScreenIds.SafetyCheck,
      UserScreenIds.CameraSetup,
      UserScreenIds.Calibration,
      UserScreenIds.Assessment,
      UserScreenIds.Result,
      UserScreenIds.Exercise,
      UserScreenIds.Completion,
    ],
    'valid result flow includes exercise and completion after required setup steps',
  );

  const invalidPayload = buildFinalAnalysisPayload({
    result: {
      ...validChairStand,
      status: AssessmentStatuses.Invalid,
      invalid: true,
      errorCode: 'TRACKING_FAILED',
      isPersistable: false,
      isClinicallyScorable: false,
      analyzerFinalEvent: false,
      repetitionCount: null,
      primaryValue: null,
    },
    session,
    selectedTest: 'chair_stand',
    historyItems: [],
  });
  const invalidView = createResultViewModel(invalidPayload);
  assert.equal(invalidView.invalid, true, 'invalid result is displayed as invalid');
  assert.equal(canShowExerciseFromResult(invalidPayload), false, 'invalid result cannot open exercise screen');
  assert.equal(invalidPayload.recommendationPlan.selectedExercises?.length || 0, 0, 'invalid result has no selected exercises');
  assert.equal(invalidPayload.recommendedExercises?.length || 0, 0, 'invalid result has no recommended exercise fallback');

  const invalidFlow = buildUserSessionFlow({
    currentScreen: UserScreenIds.Result,
    finalResult: invalidPayload,
    selectedTest: 'chair_stand',
  });
  assert.equal(invalidFlow.steps.some((step) => step.id === UserScreenIds.Exercise), false, 'invalid flow omits exercise screen');

  assert.equal(activeStepFromScreen(UserScreenIds.CameraSetup), UserScreenIds.CameraSetup, 'screen enum is preserved');
  assert.equal(screenFromActiveStep(UserScreenIds.CameraSetup), UserScreenIds.CameraSetup, 'screen enum round-trips');
  assert.equal(screenFromActiveStep('analysis'), UserScreenIds.Assessment, 'legacy active step still maps to assessment');

  console.log('Structured UI pipeline checks passed.');
} finally {
  await server.close();
}
