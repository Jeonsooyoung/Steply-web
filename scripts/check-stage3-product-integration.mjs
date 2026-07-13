import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const stage1 = require('../shared/stage1Assessment.cjs');
const stage3 = require('../shared/stage3Contract.cjs');
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

function acceptedResult(type, completedAt) {
  const chair = type === stage1.FunctionalTestSlots.ChairStand;
  return {
    resultId: `${chair ? 'chair' : 'balance'}-result`,
    resultHash: `${chair ? 'chair' : 'balance'}-hash`,
    attemptId: `${chair ? 'chair' : 'balance'}-attempt`,
    analysisSessionId: `${chair ? 'chair' : 'balance'}-analysis`,
    assessmentType: type,
    status: 'VALID',
    source: 'LIVE_POSE',
    completedAt,
    ...(chair
      ? { completedRepetitions: 8, armUseConfirmed: false }
      : { tandemHoldSeconds: 5 }),
  };
}

function screening(fallCount) {
  return {
    fallenPastYear: fallCount !== stage1.FallCount.Zero,
    feelsUnsteady: true,
    worriedAboutFalling: false,
    fallCount,
    injuriousFall: false,
  };
}

function vulnerabilityAssessment() {
  return {
    ruleVersion: 'stage3_vulnerability.v1',
    activeIds: ['V3', 'V7'],
    evidence: [
      { vulnerabilityId: 'V3', sourceResultId: 'chair-result', measurements: { completedRepetitions: 8, cdcCutoff: 10 } },
      { vulnerabilityId: 'V7', sourceResultId: 'balance-result', measurements: { tandemHoldSeconds: 5 } },
    ],
  };
}

function resultForExercise(plan, exercise, index) {
  const prescribedDosage = {
    repetitions: exercise.repetitions,
    sets: exercise.sets,
    repetitionsPerSide: exercise.repetitionsPerSide,
    steps: exercise.steps,
    holdSeconds: exercise.holdSeconds,
  };
  return stage3.normalizeExerciseSessionResult({
    schemaVersion: stage3.EXERCISE_SESSION_RESULT_SCHEMA_VERSION,
    resultId: `exercise-result-${index}`,
    exerciseSessionId: `exercise-session-${index}`,
    planId: plan.planId,
    exerciseId: exercise.exerciseId,
    level: exercise.level,
    variantId: exercise.variantId,
    status: 'COMPLETED',
    source: exercise.cameraVerification === 'FULL' ? 'LIVE_POSE' : 'USER_CONFIRMED',
    startedAt: 100_000 + index * 20_000,
    completedAt: 110_000 + index * 20_000,
    prescribedDosage,
    completedDosage: { ...prescribedDosage, repetitions: 10, sets: 2 },
    formAccurate: true,
    lowerBodyRecoveryWithoutGripping: true,
    supportUsed: false,
    cameraVerification: exercise.cameraVerification,
    safetyEvents: [],
  });
}

try {
  const engine = await server.ssrLoadModule('/client/src/pipeline/recommendation/otagoExerciseEngine.js');

  function scoredSession({ riskLevel, fallCount, professionalApproval = null } = {}) {
    let session = stage1.createAssessmentSession({
      assessmentSessionId: `stage3-${riskLevel.toLowerCase()}`,
      connectionSessionId: `connection-${riskLevel.toLowerCase()}`,
      profile: { userId: `user-${riskLevel.toLowerCase()}`, ageYears: 70, sex: stage1.Sex.FEMALE },
      createdAt: 1_000,
    });
    session = stage1.reduceAssessmentSession(session, {
      type: stage1.AssessmentSessionEventTypes.ScreeningUpdated,
      messageId: `${riskLevel}-screening`,
      expectedRevision: 0,
      at: 1_100,
      screening: screening(fallCount),
    });
    const chair = acceptedResult(stage1.FunctionalTestSlots.ChairStand, 31_200);
    session = stage1.reduceAssessmentSession(session, {
      type: stage1.AssessmentSessionEventTypes.TestResultAccepted,
      messageId: `${riskLevel}-chair`,
      expectedRevision: 1,
      slot: stage1.FunctionalTestSlots.ChairStand,
      attemptId: chair.attemptId,
      acceptedResult: chair,
      startedAt: 1_200,
      at: chair.completedAt,
    });
    const balance = acceptedResult(stage1.FunctionalTestSlots.FourStageBalance, 72_000);
    const plan = engine.createFuzzyTopsisOtagoExercisePlan({
      userId: session.profileId,
      vulnerabilityAssessment: vulnerabilityAssessment(),
      riskLevel,
      sourceAssessments: [chair, balance],
      professionalApproval,
    }).value;
    stage3.normalizeOtagoPrescriptionPlan(plan);
    session = stage1.reduceAssessmentSession(session, {
      type: stage1.AssessmentSessionEventTypes.TestResultAccepted,
      messageId: `${riskLevel}-balance`,
      expectedRevision: 2,
      slot: stage1.FunctionalTestSlots.FourStageBalance,
      attemptId: balance.attemptId,
      acceptedResult: balance,
      exercisePlan: plan,
      startedAt: 32_000,
      at: balance.completedAt,
    });
    return session;
  }

  let moderate = scoredSession({ riskLevel: 'MODERATE', fallCount: stage1.FallCount.Zero });
  assert.equal(moderate.steadi.riskLevel, 'MODERATE', 'S3-INTEGRATION clinical scorer remains canonical');
  assert.equal(moderate.exercisePrescription.status, 'ACTIVE');
  assert.ok(moderate.exercisePrescription.plan.selectedExercises.length > 3, 'S3-COUNT-01 union is not capped at three');
  assert.deepEqual(moderate.exercisePrescription.plan.warmups.map((item) => item.exerciseId), ['W1', 'W2', 'W3', 'W4', 'W5']);

  const s4 = moderate.exercisePrescription.plan.selectedExercises.find((item) => item.exerciseId === 'S4');
  assert.ok(s4, 'S3-PROG product fixture contains S4');
  const firstResult = resultForExercise(moderate.exercisePrescription.plan, s4, 1);
  const secondResult = resultForExercise(moderate.exercisePrescription.plan, s4, 2);
  for (const [index, result] of [firstResult, secondResult].entries()) {
    moderate = stage1.reduceAssessmentSession(moderate, {
      type: stage1.AssessmentSessionEventTypes.ExerciseSessionResultRecorded,
      messageId: `exercise-result-message-${index + 1}`,
      expectedRevision: 3 + index,
      result,
      at: result.completedAt,
    });
  }
  assert.equal(moderate.exercisePrescription.sessionResults.length, 2, 'exercise session results persist in canonical state');
  const progression = engine.evaluateExerciseProgression({
    sessionResults: moderate.exercisePrescription.sessionResults,
    prescriptionExercise: s4,
    currentRiskLevel: 'MODERATE',
  });
  assert.equal(progression.decision, 'PROGRESSION_PROPOSED');
  moderate = stage1.reduceAssessmentSession(moderate, {
    type: stage1.AssessmentSessionEventTypes.ProgressionProposed,
    messageId: 'progression-proposed',
    expectedRevision: 5,
    proposal: progression.proposal,
    at: 160_000,
  });
  assert.equal(moderate.exercisePrescription.plan.progressionProposals[0].status, 'PENDING_APPROVAL');
  moderate = stage1.reduceAssessmentSession(moderate, {
    type: stage1.AssessmentSessionEventTypes.ProgressionApprovalRecorded,
    messageId: 'progression-approved',
    expectedRevision: 6,
    proposalId: progression.proposal.proposalId,
    approval: { actor: 'CAREGIVER_OR_RESPONSIBLE', approvedBy: 'caregiver-1', approvedAt: 170_000 },
    at: 170_000,
  });
  assert.equal(moderate.exercisePrescription.plan.progressionProposals[0].status, 'APPROVED');

  let high = scoredSession({ riskLevel: 'HIGH', fallCount: stage1.FallCount.TwoOrMore });
  assert.equal(high.steadi.riskLevel, 'HIGH');
  assert.equal(high.exercisePrescription.status, 'PENDING_PROFESSIONAL_REVIEW');
  const pendingSelection = structuredClone(high.exercisePrescription.plan.selectedExercises);
  const blockedAttempt = stage1.reduceAssessmentSession(high, {
    type: stage1.AssessmentSessionEventTypes.ExerciseSessionResultRecorded,
    messageId: 'high-blocked-exercise',
    expectedRevision: 3,
    result: resultForExercise(high.exercisePrescription.plan, pendingSelection[0], 9),
    at: 200_000,
  });
  assert.equal(blockedAttempt.revision, high.revision, 'HIGH cannot record exercise before professional approval');
  high = stage1.reduceAssessmentSession(high, {
    type: stage1.AssessmentSessionEventTypes.ProfessionalApprovalRecorded,
    messageId: 'high-professional-approval',
    expectedRevision: 3,
    professionalApproval: {
      status: 'APPROVED',
      approvalId: 'professional-approval-1',
      approvedByRole: 'PROFESSIONAL',
      approvedAt: 210_000,
    },
    at: 210_000,
  });
  assert.equal(high.exercisePrescription.status, 'ACTIVE');
  assert.deepEqual(high.exercisePrescription.plan.selectedExercises, pendingSelection, 'HIGH approval cannot replace the constrained proposal');
  assert.ok(high.exercisePrescription.plan.selectedExercises.filter((item) => item.category === 'BALANCE').every((item) => item.level === 'A'));
  assert.ok(high.exercisePrescription.plan.selectedExercises.every((item) => item.weightMode === 'NONE'));

  console.log('Stage 3 product integration checks passed.');
} finally {
  await server.close();
}
