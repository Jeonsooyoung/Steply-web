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
    AssessmentResultStatuses,
    ExercisePlanStatuses,
    FindingClassifications,
    FindingSeverities,
    FunctionalDomains,
    ResultSources,
    SteadiRiskLevels,
    SupervisionRequirements,
    SupportRequirements,
  } = await server.ssrLoadModule('/client/src/pipeline/shared/types/index.js');
  const { FunctionalFindingTypes } = await server.ssrLoadModule('/client/src/pipeline/findings/functionalFindings.js');
  const {
    ExerciseProgressionDecisions,
    OTAGO_EXERCISE_CATALOG,
    OtagoExerciseIds,
    createDeterministicOtagoExercisePlan,
    evaluateExerciseProgression,
  } = await server.ssrLoadModule('/client/src/pipeline/recommendation/otagoExerciseEngine.js');

  function finding(type, {
    id = `finding-${type}`,
    classification = FindingClassifications.Primary,
    domain = FunctionalDomains.MovementControl,
    confidence = 0.9,
  } = {}) {
    return {
      findingId: id,
      assessmentId: `assessment-${type}`,
      findingType: type,
      domain,
      classification,
      severity: classification === FindingClassifications.Primary ? FindingSeverities.Moderate : FindingSeverities.Informational,
      confidence,
      evidence: {
        assessmentType: 'TEST',
        sourceAssessmentIds: [`assessment-${type}`],
        measurementKeys: ['primaryMeasurements.value'],
        eventIds: [],
        observedValues: { value: 1 },
        comparisonReference: 'test reference',
      },
      userMessageKey: `finding.${type}`,
      recommendationTags: [type],
    };
  }

  function validAssessment(overrides = {}) {
    return {
      assessmentId: overrides.assessmentId || 'assessment-source',
      status: overrides.status || AssessmentResultStatuses.Valid,
      metadata: {
        source: ResultSources.LivePose,
        isClinicallyScorable: true,
        ...(overrides.metadata || {}),
      },
      ...overrides,
    };
  }

  function planFor(findings, {
    riskLevel = SteadiRiskLevels.Low,
    sourceAssessments = [],
    contraindicationTags = [],
  } = {}) {
    return createDeterministicOtagoExercisePlan({
      userId: 'user-1',
      findings,
      steadiScore: { riskLevel },
      sourceAssessments,
      contraindicationTags,
    });
  }

  function ids(plan) {
    return plan.value.selectedExercises.map((exercise) => exercise.exerciseId);
  }

  function byId(plan, exerciseId) {
    return plan.value.selectedExercises.find((exercise) => exercise.exerciseId === exerciseId);
  }

  function assertValid(plan, label) {
    assert.equal(plan.validation.ok, true, `${label}: ${JSON.stringify(plan.validation.failures)}`);
  }

  for (const exercise of OTAGO_EXERCISE_CATALOG) {
    for (const field of [
      'exerciseId',
      'displayName',
      'otagoSourceName',
      'category',
      'supportedFunctionalDomains',
      'availableLevels',
      'repetitions',
      'sets',
      'supportRequirement',
      'supervisionRequirement',
      'minimumRiskLevel',
      'maximumRiskLevel',
      'cameraVerifiable',
      'contraindicationTags',
      'progressionRule',
      'regressionRule',
      'instructionMessageKeys',
      'safetyMessageKeys',
    ]) {
      assert.ok(Object.hasOwn(exercise, field), `${exercise.exerciseId} includes ${field}`);
    }
  }

  const primaryCases = [
    {
      type: FunctionalFindingTypes.ChairStandBelowReference,
      expected: [OtagoExerciseIds.FrontKneeStrengthening, OtagoExerciseIds.KneeBends, OtagoExerciseIds.SitToStand],
    },
    {
      type: FunctionalFindingTypes.ArmSupportRequired,
      expected: [OtagoExerciseIds.SitToStand, OtagoExerciseIds.FrontKneeStrengthening],
    },
    {
      type: FunctionalFindingTypes.BasicBalanceDifficulty,
      expected: [OtagoExerciseIds.CalfRaises, OtagoExerciseIds.KneeBends, OtagoExerciseIds.ToeRaises],
    },
    {
      type: FunctionalFindingTypes.SemiTandemHoldDifficulty,
      expected: [OtagoExerciseIds.TandemStance, OtagoExerciseIds.CalfRaises, OtagoExerciseIds.ToeRaises],
    },
    {
      type: FunctionalFindingTypes.TandemHoldDifficulty,
      expected: [OtagoExerciseIds.TandemStance, OtagoExerciseIds.CalfRaises, OtagoExerciseIds.ToeRaises],
    },
    {
      type: FunctionalFindingTypes.SingleLegHoldDifficulty,
      expected: [OtagoExerciseIds.OneLegStand, OtagoExerciseIds.SideHipStrengthening, OtagoExerciseIds.CalfRaises],
    },
  ];

  for (const testCase of primaryCases) {
    const plan = planFor([finding(testCase.type)]);
    assertValid(plan, testCase.type);
    assert.deepEqual(ids(plan), testCase.expected, `${testCase.type} mapping`);
    for (const exercise of plan.value.selectedExercises) {
      assert.ok(exercise.reasonFindingIds.length > 0, `${exercise.exerciseId} has source finding`);
      assert.ok(exercise.reasonCodes.some((code) => code.includes(testCase.type)), `${exercise.exerciseId} has finding reason`);
    }
  }

  const lowNoBalance = planFor([finding(FunctionalFindingTypes.ChairStandBelowReference)], { riskLevel: SteadiRiskLevels.Low });
  assert.equal(byId(lowNoBalance, OtagoExerciseIds.SitToStand).level, 'standard', 'LOW can use standard sit-to-stand when no balance finding is present');

  const lowBalance = planFor([finding(FunctionalFindingTypes.TandemHoldDifficulty)], { riskLevel: SteadiRiskLevels.Low });
  assert.equal(byId(lowBalance, OtagoExerciseIds.TandemStance).supportRequirement, SupportRequirements.StableSupport, 'LOW with balance finding starts supported');

  const moderate = planFor([finding(FunctionalFindingTypes.TandemHoldDifficulty)], { riskLevel: SteadiRiskLevels.Moderate });
  assert.equal(moderate.value.supervisionRequirement, SupervisionRequirements.CaregiverRecommended, 'MODERATE recommends caregiver nearby');
  assert.equal(byId(moderate, OtagoExerciseIds.TandemStance).supportRequirement, SupportRequirements.StableSupport, 'MODERATE balance exercise uses stable support');
  assert.ok(byId(moderate, OtagoExerciseIds.TandemStance).reasonCodes.includes('RISK_CAP_MODERATE_APPLIED'), 'MODERATE risk cap reason is recorded');

  const high = planFor([finding(FunctionalFindingTypes.ChairStandBelowReference)], { riskLevel: SteadiRiskLevels.High });
  assertValid(high, 'HIGH blocked plan validation');
  assert.equal(high.value.selectedExercises.length, 0, 'HIGH risk has no automatic exercise start');
  assert.equal(high.value.requiresProfessionalReview, true, 'HIGH requires professional review');
  assert.equal(high.value.supervisionRequirement, SupervisionRequirements.ProfessionalReviewRequired);
  assert.equal(high.value.status, ExercisePlanStatuses.PendingReview);

  const arm = planFor([
    finding(FunctionalFindingTypes.ChairStandBelowReference),
    finding(FunctionalFindingTypes.ArmSupportRequired),
  ]);
  assert.equal(byId(arm, OtagoExerciseIds.SitToStand).level, 'supported_two_hand', 'ARM_SUPPORT_REQUIRED uses supported sit-to-stand only');
  assert.equal(byId(arm, OtagoExerciseIds.SitToStand).supportRequirement, SupportRequirements.StableSupport);
  assert.ok(arm.value.safetyNotices.includes('ARM_SUPPORT_REQUIRED_USE_SUPPORTED_SIT_TO_STAND_ONLY'), 'arm support safety notice');
  assert.ok(byId(arm, OtagoExerciseIds.SitToStand).excludedLevelReasons.includes('ARM_SUPPORT_REQUIRED_UNSUPPORTED_SIT_TO_STAND_EXCLUDED'));

  const invalid = planFor([finding(FunctionalFindingTypes.ChairStandBelowReference)], {
    sourceAssessments: [validAssessment({ status: AssessmentResultStatuses.Invalid })],
  });
  assert.equal(invalid.value.selectedExercises.length, 0, 'invalid source assessment blocks exercise selection');
  assert.equal(invalid.value.status, ExercisePlanStatuses.Blocked);
  assert.ok(invalid.value.decisionTrace.includes('INVALID_OR_NON_CLINICAL_ASSESSMENT'));

  const lowConfidence = planFor([
    finding(FunctionalFindingTypes.LowMeasurementConfidence, {
      classification: FindingClassifications.Secondary,
      confidence: 0.4,
    }),
  ]);
  assert.equal(lowConfidence.value.selectedExercises.length, 0, 'low confidence alone does not add exercise');
  assert.ok(lowConfidence.value.excludedExercises.every((exercise) => exercise.reasonCodes.includes('LOW_MEASUREMENT_CONFIDENCE_NO_SPECIFIC_EXERCISE')));

  const multi = planFor([
    finding(FunctionalFindingTypes.ChairStandBelowReference),
    finding(FunctionalFindingTypes.TandemHoldDifficulty),
    finding(FunctionalFindingTypes.SingleLegHoldDifficulty),
    finding(FunctionalFindingTypes.TrunkCompensationPattern, { classification: FindingClassifications.Secondary }),
  ]);
  assert.equal(multi.value.selectedExercises.length, 3, 'exercise count is capped at three');
  assert.equal(new Set(ids(multi)).size, ids(multi).length, 'duplicate exercises are removed');
  assert.ok(multi.value.excludedExercises.some((exercise) => exercise.reasonCodes.includes('SESSION_EXERCISE_LIMIT_REACHED')), 'excluded exercises explain session cap');

  const duplicate = planFor([
    finding(FunctionalFindingTypes.TandemHoldDifficulty),
    finding(FunctionalFindingTypes.SemiTandemHoldDifficulty),
  ]);
  assert.equal(ids(duplicate).filter((id) => id === OtagoExerciseIds.TandemStance).length, 1, 'same exercise from two findings appears once');
  assert.ok(byId(duplicate, OtagoExerciseIds.TandemStance).reasonFindingIds.length >= 2, 'deduped exercise keeps both finding reasons');

  const contraindicated = planFor([finding(FunctionalFindingTypes.ChairStandBelowReference)], {
    contraindicationTags: ['acute_knee_pain'],
  });
  assert.ok(!ids(contraindicated).includes(OtagoExerciseIds.FrontKneeStrengthening), 'contraindicated exercise excluded');
  assert.ok(contraindicated.value.excludedExercises.some((exercise) => exercise.reasonCodes.includes('CONTRAINDICATION_acute_knee_pain')), 'contraindication reason is recorded');

  const deterministicA = planFor([
    finding(FunctionalFindingTypes.ChairStandBelowReference),
    finding(FunctionalFindingTypes.TandemHoldDifficulty),
  ], { riskLevel: SteadiRiskLevels.Moderate });
  const deterministicB = planFor([
    finding(FunctionalFindingTypes.ChairStandBelowReference),
    finding(FunctionalFindingTypes.TandemHoldDifficulty),
  ], { riskLevel: SteadiRiskLevels.Moderate });
  assert.deepEqual(deterministicA.value, deterministicB.value, 'same input returns identical ExercisePlan');

  assert.equal(evaluateExerciseProgression({
    postureAccuracy: 0.92,
    requiredRepetitionsAchieved: true,
    consecutiveSuccessfulSessions: 2,
    safetyEvents: [],
    currentRiskLevel: SteadiRiskLevels.Low,
  }).decision, ExerciseProgressionDecisions.ProgressionEligible, 'progression eligible after two safe successful sessions');
  assert.equal(evaluateExerciseProgression({
    postureAccuracy: 0.7,
    requiredRepetitionsAchieved: true,
    consecutiveSuccessfulSessions: 1,
    safetyEvents: [],
    currentRiskLevel: SteadiRiskLevels.Low,
  }).decision, ExerciseProgressionDecisions.RegressionRequired, 'poor posture requires regression');
  assert.equal(evaluateExerciseProgression({
    postureAccuracy: 0.95,
    requiredRepetitionsAchieved: true,
    consecutiveSuccessfulSessions: 4,
    safetyEvents: [],
    currentRiskLevel: SteadiRiskLevels.High,
  }).decision, ExerciseProgressionDecisions.ProfessionalReviewRequired, 'HIGH risk cannot be progressed automatically');
  assert.equal(evaluateExerciseProgression({
    postureAccuracy: 0.85,
    requiredRepetitionsAchieved: true,
    consecutiveSuccessfulSessions: 1,
    safetyEvents: [],
    currentRiskLevel: SteadiRiskLevels.Moderate,
  }).decision, ExerciseProgressionDecisions.Maintain, 'maintain when progression criteria are not met');

  console.log('Deterministic Otago exercise engine checks passed.');
} finally {
  await server.close();
}
