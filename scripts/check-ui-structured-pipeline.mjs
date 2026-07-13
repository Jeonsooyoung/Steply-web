import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  const routeFiles = fs.readdirSync(path.join(root, 'client/src/routes'))
    .filter((name) => name.endsWith('.jsx'));
  for (const fileName of routeFiles) {
    const source = fs.readFileSync(path.join(root, 'client/src/routes', fileName), 'utf8');
    assert.doesNotMatch(source, /window\.location\.assign|window\.location\.reload/, `${fileName} must use SPA navigation`);
  }
  const balanceRouteSource = fs.readFileSync(path.join(root, 'client/src/routes/StepFourScreens.jsx'), 'utf8');
  const chairRouteSource = fs.readFileSync(path.join(root, 'client/src/routes/StepFiveScreens.jsx'), 'utf8');
  const analysisHookSource = fs.readFileSync(path.join(root, 'client/src/hooks/useRemotePoseAnalysis.js'), 'utf8');
  const dashboardHookSource = fs.readFileSync(path.join(root, 'client/src/hooks/useSteplyDashboard.js'), 'utf8');
  const screeningRouteSource = fs.readFileSync(path.join(root, 'client/src/routes/StepThreeScreens.jsx'), 'utf8');
  assert.doesNotMatch(balanceRouteSource, /poseAnalysis\?\.finishAnalysis|finishAnalysis\?\./, 'Balance UI timer cannot finalize worker analysis');
  assert.doesNotMatch(chairRouteSource, /poseAnalysis\?\.finishAnalysis|finishAnalysis\?\./, 'Chair UI timer cannot finalize worker analysis');
  assert.doesNotMatch(analysisHookSource, /setInterval\([\s\S]*finishAnalysis/, 'hook wall clock cannot finalize analysis');
  assert.match(dashboardHookSource, /socketReconnectAttemptsRef/, 'dashboard socket uses bounded reconnect state');
  assert.doesNotMatch(dashboardHookSource, /onclose\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*resetAnalysis/s, 'transient socket close cannot reset assessment');
  assert.doesNotMatch(screeningRouteSource, /params\.get\(['"](?:fallen|fallCount|injured|unsteady|worried)['"]\)/, 'screening answers cannot live in URL query');

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
    BalanceMeasurementKind,
    BalanceStageStatuses,
    BalanceStages,
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

  const session = {
    id: 'ui-session-1',
    profile: {
      id: 'profile-1',
      displayName: 'Ada',
      birthYear: 1950,
      sex: 'FEMALE',
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

  const validBalanceAssessment = {
    resultId: 'result-valid-balance',
    assessmentId: 'analysis-valid-balance',
    sessionId: session.id,
    assessmentType: AssessmentTypes.FourStageBalance,
    status: AssessmentResultStatuses.Valid,
    resultType: AssessmentResultTypes.StructuredAssessment,
    metadata: {
      source: ResultSources.LivePose,
      isPersistable: true,
      isClinicallyScorable: true,
      analyzerVersion: 'structured-ui-check.v1',
      schemaVersion: STRUCTURED_PIPELINE_SCHEMA_VERSION,
      generatedAtMs: 40_000,
    },
    timing: {
      startedAtMs: 32_000,
      completedAtMs: 40_000,
      activeAnalysisDurationMs: 8_000,
      pausedDurationMs: 0,
    },
    primaryMeasurements: {
      kind: BalanceMeasurementKind,
      stages: [
        BalanceStages.SideBySide,
        BalanceStages.SemiTandem,
        BalanceStages.Tandem,
        BalanceStages.OneLeg,
      ].map((stage) => ({
        stage,
        status: BalanceStageStatuses.Passed,
        positionConfidence: 0.92,
        holdDurationSeconds: 10,
      })),
      lastAttemptedStage: BalanceStages.OneLeg,
    },
    secondaryObservations: [],
    qualitySummary: validChairStand.trackingQualitySummary,
    events: [{
      eventId: 'event-valid-balance-completed',
      sessionId: session.id,
      assessmentType: AssessmentTypes.FourStageBalance,
      type: AssessmentEventTypes.AssessmentCompleted,
      timestampMs: 40_000,
      confidence: 0.92,
      evidence: { kind: EvidenceKinds.Duration, durationMs: 8_000, requiredDurationMs: 8_000 },
    }],
    confidence: 0.92,
  };

  const chairOnlyPayload = buildFinalAnalysisPayload({
    result: validChairStand,
    session,
    selectedTest: 'chair_stand',
    historyItems: [],
  });
  assert.equal(chairOnlyPayload.structuredPipeline.aggregateReady, false, 'one functional test is not an aggregate');
  assert.equal(chairOnlyPayload.functionalFindings.length, 0, 'one functional test creates no aggregate findings');
  assert.equal(chairOnlyPayload.recommendedExercises.length, 0, 'one functional test creates no prescription');
  assert.equal(canShowExerciseFromResult(chairOnlyPayload), false, 'one functional test cannot show exercise screen');

  const aggregateSession = {
    ...session,
    assessmentSession: {
      assessmentSessionId: 'assessment-ui-1',
      profileSnapshot: { ageYears: 76, sex: 'FEMALE' },
      screening: {
        status: 'COMPLETED',
        responses: { fallenPastYear: false, feelsUnsteady: false, worriedAboutFalling: false },
        fallHistory: { count: 'ZERO', injuriousFall: false },
      },
      functionalTests: {
        FOUR_STAGE_BALANCE: {
          status: 'COMPLETED',
          acceptedResult: { payload: { structuredAssessmentResult: validBalanceAssessment } },
        },
        CHAIR_STAND_30S: { status: 'NOT_STARTED', acceptedResult: null },
      },
    },
  };

  const validPayload = buildFinalAnalysisPayload({
    result: validChairStand,
    session: aggregateSession,
    selectedTest: 'chair_stand',
    historyItems: [],
  });

  assert.equal(validPayload.source, ResultSources.LivePose, 'valid payload keeps live pose source');
  assert.ok(validPayload.structuredPipeline?.assessmentResult, 'valid payload has structured assessment result');
  assert.ok(validPayload.functionalFindings.length >= 1, 'valid payload has functional findings');
  assert.ok(validPayload.recommendationPlan.selectedExercises.length > 0, 'valid payload has selected structured exercises');
  assert.equal(
    new Set(validPayload.recommendationPlan.selectedExercises.map((exercise) => exercise.exerciseId)).size,
    validPayload.recommendationPlan.selectedExercises.length,
    'exercise plan keeps the complete deduplicated mapping without an arbitrary count cap',
  );
  assert.equal(canShowExerciseFromResult(validPayload), true, 'valid payload can show exercise screen');

  assert.equal(validPayload.status, AssessmentStatuses.Valid, 'valid canonical payload retains VALID status');
  assert.ok(validPayload.functionalFindings.every((finding) => finding.classification), 'findings preserve primary/secondary classification');
  assert.ok(validPayload.recommendedExercises.every((exercise) => exercise.reasonMessages?.length || exercise.supportRequirement), 'exercise entries include reason or support data');
  assert.doesNotMatch(
    JSON.stringify({ findings: validPayload.functionalFindings, plan: validPayload.recommendationPlan }),
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
  assert.equal(invalidPayload.invalid, true, 'invalid canonical payload remains invalid');
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
