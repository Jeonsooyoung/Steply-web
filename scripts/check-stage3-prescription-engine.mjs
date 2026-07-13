import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const contract = require('../shared/stage3Contract.cjs');

const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'silent',
});

const MAPPING = Object.freeze({
  V1: ['S4', 'S5', 'B5', 'B6', 'B7'],
  V2: ['S3', 'B4', 'B5'],
  V3: ['S1', 'S2', 'S3', 'B1', 'B11'],
  V4: ['S1', 'S2', 'B11', 'B1'],
  V5: ['S2', 'S3', 'B1', 'B11'],
  V6: ['S1', 'B11'],
  V7: ['S4', 'S5', 'B5', 'B1'],
  V8: ['S3', 'S4', 'B7', 'B5'],
  V9: ['S1', 'S2', 'S3', 'B4', 'B11'],
});

function vulnerability(ids) {
  return {
    ruleVersion: 'stage2_vulnerability.v1',
    activeIds: ids,
    evidence: ids.map((vulnerabilityId, index) => ({
      vulnerabilityId,
      sourceResultId: index % 2 ? 'chair-result-1' : 'balance-result-1',
      measurements: { test: true },
    })),
  };
}

function planFor(engine, ids, {
  riskLevel = 'LOW',
  professionalApproval = null,
  sessionResults = [],
  currentPlan = null,
} = {}) {
  return engine.createFuzzyTopsisOtagoExercisePlan({
    userId: 'user-1',
    vulnerabilityAssessment: vulnerability(ids),
    riskLevel,
    professionalApproval,
    sessionResults,
    currentPlan,
    sourceAssessments: [
      { assessmentId: 'chair-assessment-1', resultId: 'chair-result-1', status: 'VALID' },
      { assessmentId: 'balance-assessment-1', resultId: 'balance-result-1', status: 'VALID' },
    ],
  }).value;
}

function ids(plan) {
  return plan.selectedExercises.map((exercise) => exercise.exerciseId);
}

function byId(plan, id) {
  return plan.selectedExercises.find((exercise) => exercise.exerciseId === id);
}

function sessionResult(exercise, index, overrides = {}) {
  const prescribedDosage = {
    repetitions: exercise.repetitions,
    sets: exercise.sets,
    repetitionsPerSide: exercise.repetitionsPerSide,
    steps: exercise.steps,
    holdSeconds: exercise.holdSeconds,
  };
  return {
    schemaVersion: 'exercise_session_result.v1',
    resultId: `result-${exercise.exerciseId}-${index}`,
    exerciseSessionId: `session-${exercise.exerciseId}-${index}`,
    planId: 'plan-progression',
    exerciseId: exercise.exerciseId,
    level: exercise.level,
    variantId: exercise.variantId,
    status: 'COMPLETED',
    source: exercise.cameraVerification === 'FULL' ? 'LIVE_POSE' : 'USER_CONFIRMED',
    startedAt: 1_700_000_000_000 + index * 100_000,
    completedAt: 1_700_000_010_000 + index * 100_000,
    prescribedDosage,
    completedDosage: { ...prescribedDosage },
    formAccurate: true,
    lowerBodyRecoveryWithoutGripping: true,
    supportUsed: false,
    cameraVerification: exercise.cameraVerification,
    safetyEvents: [],
    ...overrides,
  };
}

try {
  const engine = await server.ssrLoadModule('/client/src/pipeline/recommendation/otagoExerciseEngine.js');
  assert.equal(typeof engine.createFuzzyTopsisOtagoExercisePlan, 'function');
  assert.equal(engine.createDeterministicOtagoExercisePlan, undefined, 'legacy deterministic recommendation API is removed');
  assert.equal(typeof engine.evaluateExerciseProgression, 'function');
  assert.equal(typeof engine.applyExerciseProgressionApproval, 'function');

  for (const [vulnerabilityId, expectedIds] of Object.entries(MAPPING)) {
    const plan = planFor(engine, [vulnerabilityId]);
    assert.deepEqual(new Set(ids(plan)), new Set(expectedIds), `S3-MAP-${vulnerabilityId} exact §8.5 union`);
    assert.ok(plan.selectedExercises.every((exercise) => exercise.reasonVulnerabilityIds.includes(vulnerabilityId)), `S3-MAP-${vulnerabilityId} reason retained`);
    contract.normalizeOtagoPrescriptionPlan(plan);
  }

  const all = planFor(engine, Object.keys(MAPPING));
  const expectedUnion = [...new Set(Object.values(MAPPING).flat())];
  assert.deepEqual(new Set(ids(all)), new Set(expectedUnion), 'S3-UNION-01 all V mappings form a complete union');
  assert.ok(all.selectedExercises.length > 3, 'S3-UNION-01 selection is not capped at three');
  assert.ok(!all.safetyNotices.includes('SESSION_EXERCISE_LIMIT_REACHED'), 'S3-UNION-01 no arbitrary count-limit notice');
  assert.equal(new Set(ids(all)).size, ids(all).length, 'S3-UNION-01 deduplication preserves one item per ID');

  const noTarget = planFor(engine, []);
  assert.equal(noTarget.status, 'BLOCKED', 'S3-STATE-BLOCKED no V mapping does not invent a targeted exercise');
  assert.deepEqual(noTarget.warmups.map((exercise) => exercise.exerciseId), ['W1', 'W2', 'W3', 'W4', 'W5'], 'S3-STATE-BLOCKED canonical warmups remain available as non-targeted catalog content');
  assert.deepEqual(noTarget.selectedExercises, []);
  assert.equal(noTarget.walkingPlan, null);
  assert.deepEqual(noTarget.progressionProposals, [], 'S3-STATE-BLOCKED progression is not exposed');
  contract.normalizeOtagoPrescriptionPlan(noTarget);

  const low = planFor(engine, ['V3']);
  assert.equal(low.status, 'ACTIVE', 'S3-CAP-LOW targeted plan active');
  assert.ok(low.selectedExercises.filter((exercise) => exercise.category === 'BALANCE').every((exercise) => ['A', 'B'].includes(exercise.level)), 'S3-CAP-LOW balance never above B');
  for (const id of ['S1', 'S2', 'S3']) {
    assert.equal(byId(low, id).level, 'C', `S3-CAP-LOW ${id} fatigue-target level`);
    assert.equal(byId(low, id).weightMode, 'FATIGUE_TARGET');
  }
  assert.equal(low.supervisionRequirement, 'NONE');
  assert.equal(low.caregiverRecommendedDays, 0);
  assert.equal(low.walkingPlan.targetMinutes, 30);

  const moderate = planFor(engine, ['V2', 'V3'], { riskLevel: 'MODERATE' });
  assert.equal(moderate.status, 'ACTIVE');
  assert.ok(moderate.selectedExercises.filter((exercise) => exercise.category === 'BALANCE').every((exercise) => exercise.level === 'A'), 'S3-CAP-MODERATE balance fixed at A');
  for (const id of ['S1', 'S2', 'S3']) {
    assert.equal(byId(moderate, id).level, 'B', `S3-CAP-MODERATE ${id} level B 1-2kg start`);
    assert.equal(byId(moderate, id).weightMode, 'ANKLE_CUFF');
    assert.equal(byId(moderate, id).weightMinKg, 1);
    assert.equal(byId(moderate, id).weightMaxKg, 2);
  }
  assert.equal(moderate.supervisionRequirement, 'CAREGIVER_RECOMMENDED');
  assert.equal(moderate.caregiverRecommendedDays, 14);
  contract.normalizeOtagoPrescriptionPlan(moderate);

  const high = planFor(engine, ['V1', 'V3'], { riskLevel: 'HIGH' });
  assert.equal(high.status, 'PENDING_PROFESSIONAL_REVIEW', 'S3-CAP-HIGH execution blocked before professional approval');
  assert.equal(high.requiresProfessionalReview, true);
  assert.equal(high.professionalApproval.status, 'PENDING');
  assert.equal(high.walkingPlan, null);
  assert.ok(high.selectedExercises.filter((exercise) => exercise.category === 'BALANCE').every((exercise) => exercise.level === 'A'));
  for (const id of ['S1', 'S2', 'S3']) {
    assert.equal(byId(high, id).level, 'A');
    assert.equal(byId(high, id).weightMode, 'NONE');
  }
  for (const id of ['S4', 'S5']) {
    assert.equal(byId(high, id).level, 'C');
    assert.equal(byId(high, id).supportRequirement, 'STABLE_SUPPORT', `S3-CAP-HIGH ${id} preserves the Otago supported Level C exception`);
    assert.equal(byId(high, id).weightMode, 'NONE');
  }
  assert.deepEqual(high.progressionProposals, [], 'S3-CAP-HIGH pending review exposes no progression action');
  const approvedHigh = planFor(engine, ['V1', 'V3'], {
    riskLevel: 'HIGH',
    professionalApproval: {
      status: 'APPROVED',
      approvalId: 'professional-approval-1',
      approvedByRole: 'PROFESSIONAL',
      approvedAt: 1_700_000_000_000,
    },
  });
  assert.equal(approvedHigh.status, 'ACTIVE', 'S3-CAP-HIGH professional approval activates plan');
  assert.equal(approvedHigh.requiresProfessionalReview, false);
  assert.deepEqual(approvedHigh.selectedExercises, high.selectedExercises, 'S3-CAP-HIGH approval preserves Level A/no-weight content');
  assert.equal(approvedHigh.walkingPlan, null, 'S3-CAP-HIGH walking remains unavailable after approval');
  assert.deepEqual(approvedHigh.progressionProposals, [], 'S3-CAP-HIGH approval does not bypass professional reassessment for progression');
  contract.normalizeOtagoPrescriptionPlan(high);
  contract.normalizeOtagoPrescriptionPlan(approvedHigh);

  const v6 = planFor(engine, ['V3', 'V6']);
  assert.equal(byId(v6, 'S1').level, 'A', 'S3-MAP-V6 all items use their lowest safe level');
  assert.equal(byId(v6, 'B11').level, 'A');
  assert.ok(v6.safetyNotices.includes('V6_PROFESSIONAL_CONSULTATION_REQUIRED'));

  const v9Current = planFor(engine, ['V9'], {
    currentPlan: {
      selectedExercises: [
        { exerciseId: 'S1', variantId: 'S1-B' },
        { exerciseId: 'S2', variantId: 'S2-B' },
        { exerciseId: 'S3', variantId: 'S3-B' },
        { exerciseId: 'B4', variantId: 'B4-B' },
        { exerciseId: 'B11', variantId: 'B11-B' },
      ],
    },
  });
  for (const id of ['S1', 'S2', 'S3']) {
    assert.equal(byId(v9Current, id).variantId, `${id}-B`, `S3-MAP-V9 ${id} current conservative variant is retained`);
    assert.equal(byId(v9Current, id).weakSideExtraSets, 1, `S3-MAP-V9 ${id} weak side gets one extra set`);
  }
  assert.equal(byId(v9Current, 'B4').variantId, 'B4-B', 'S3-MAP-V9 current B4 level is retained within LOW cap');
  assert.equal(byId(v9Current, 'B11').variantId, 'B11-B', 'S3-MAP-V9 current B11 level is retained within LOW cap');
  contract.normalizeOtagoPrescriptionPlan(v9Current);

  const strengthExercise = byId(planFor(engine, ['V1']), 'S4');
  const strengthResults = [sessionResult(strengthExercise, 1), sessionResult(strengthExercise, 2)];
  const strengthProgression = engine.evaluateExerciseProgression({
    sessionResults: strengthResults,
    prescriptionExercise: strengthExercise,
    currentRiskLevel: 'LOW',
  });
  assert.equal(strengthProgression.decision, 'PROGRESSION_PROPOSED', 'S3-PROG-STRENGTH two exact distinct sessions propose progression');
  assert.equal(strengthProgression.proposal.fromVariantId, 'S4-C');
  assert.equal(strengthProgression.proposal.toVariantId, 'S4-D');
  assert.equal(strengthProgression.proposal.progressionType, 'REMOVE_SUPPORT');
  assert.equal(strengthProgression.proposal.weightIncrementMinKg, null);
  assert.equal(strengthProgression.proposal.weightIncrementMaxKg, null);
  assert.deepEqual(new Set(strengthProgression.proposal.qualifyingSessionIds), new Set(strengthResults.map((result) => result.exerciseSessionId)));
  contract.normalizeProgressionProposal(strengthProgression.proposal);

  const weightedStrength = byId(moderate, 'S1');
  const weightedResults = [sessionResult(weightedStrength, 1), sessionResult(weightedStrength, 2)].map((result) => ({
    ...result,
    completedDosage: { ...result.completedDosage, repetitionsPerSide: 10, sets: 2 },
  }));
  const weightProgression = engine.evaluateExerciseProgression({
    sessionResults: weightedResults,
    prescriptionExercise: weightedStrength,
    currentRiskLevel: 'MODERATE',
  });
  assert.equal(weightProgression.decision, 'PROGRESSION_PROPOSED', 'S3-PROG-WEIGHT S1-S3 require two sessions of 10x2');
  assert.equal(weightProgression.proposal.progressionType, 'INCREASE_WEIGHT');
  assert.equal(weightProgression.proposal.fromVariantId, weightedStrength.variantId);
  assert.equal(weightProgression.proposal.toVariantId, weightedStrength.variantId, 'S3-PROG-WEIGHT weight progression keeps the variant');
  assert.equal(weightProgression.proposal.weightIncrementMinKg, 0.5);
  assert.equal(weightProgression.proposal.weightIncrementMaxKg, 1);
  contract.normalizeProgressionProposal(weightProgression.proposal);

  const onlyOne = engine.evaluateExerciseProgression({
    sessionResults: [strengthResults[0]],
    prescriptionExercise: strengthExercise,
    currentRiskLevel: 'LOW',
  });
  assert.equal(onlyOne.decision, 'MAINTAIN', 'S3-PROG-BOUNDARY one session is insufficient');
  const duplicateSession = engine.evaluateExerciseProgression({
    sessionResults: [strengthResults[0], { ...strengthResults[1], exerciseSessionId: strengthResults[0].exerciseSessionId }],
    prescriptionExercise: strengthExercise,
    currentRiskLevel: 'LOW',
  });
  assert.equal(duplicateSession.decision, 'MAINTAIN', 'S3-PROG-BOUNDARY duplicate session ID cannot satisfy two sessions');
  const inaccurate = engine.evaluateExerciseProgression({
    sessionResults: [strengthResults[0], { ...strengthResults[1], formAccurate: false }],
    prescriptionExercise: strengthExercise,
    currentRiskLevel: 'LOW',
  });
  assert.equal(inaccurate.decision, 'MAINTAIN', 'S3-PROG-BOUNDARY both sessions must be accurate');
  const underDose = engine.evaluateExerciseProgression({
    sessionResults: [strengthResults[0], {
      ...strengthResults[1],
      completedDosage: { ...strengthResults[1].completedDosage, sets: strengthExercise.sets - 1 },
    }],
    prescriptionExercise: strengthExercise,
    currentRiskLevel: 'LOW',
  });
  assert.equal(underDose.decision, 'MAINTAIN', 'S3-PROG-BOUNDARY prescribed dose is exact and cannot be relaxed');

  const balanceExercise = byId(planFor(engine, ['V1']), 'B5');
  const balanceResults = [sessionResult(balanceExercise, 1), sessionResult(balanceExercise, 2)];
  const balanceProgression = engine.evaluateExerciseProgression({
    sessionResults: balanceResults,
    prescriptionExercise: balanceExercise,
    currentRiskLevel: 'LOW',
  });
  assert.equal(balanceProgression.decision, 'PROGRESSION_PROPOSED', 'S3-PROG-BALANCE lower-body recovery without gripping enables proposal');
  assert.equal(balanceProgression.proposal.progressionType, 'ADVANCE_VARIANT');
  const gripped = engine.evaluateExerciseProgression({
    sessionResults: [balanceResults[0], { ...balanceResults[1], supportUsed: true }],
    prescriptionExercise: balanceExercise,
    currentRiskLevel: 'LOW',
  });
  assert.equal(gripped.decision, 'MAINTAIN', 'S3-PROG-BALANCE gripping support blocks unsupported progression');

  const highProgressionBlocked = engine.evaluateExerciseProgression({
    sessionResults: balanceResults,
    prescriptionExercise: balanceExercise,
    currentRiskLevel: 'HIGH',
  });
  assert.equal(highProgressionBlocked.decision, 'PROFESSIONAL_REVIEW_REQUIRED', 'S3-PROG-HIGH reassessment required');

  const approvedProposal = engine.applyExerciseProgressionApproval({
    proposal: strengthProgression.proposal,
    approval: { actor: 'USER', approvedBy: 'user-1', approvedAt: 1_700_000_030_000 },
  });
  assert.equal(approvedProposal.status, 'APPROVED', 'S3-PROG-APPROVAL user approval is explicit');
  assert.equal(approvedProposal.fromVariantId, 'S4-C', 'S3-PROG-APPROVAL approval does not auto-apply progression');
  const caregiverApproval = engine.applyExerciseProgressionApproval({
    proposal: strengthProgression.proposal,
    approval: { actor: 'CAREGIVER_OR_RESPONSIBLE', approvedBy: 'caregiver-1', approvedAt: 1_700_000_030_000 },
  });
  assert.equal(caregiverApproval.approval.actor, 'CAREGIVER_OR_RESPONSIBLE', 'S3-PROG-APPROVAL responsible caregiver is allowed by §8.7');
  assert.throws(
    () => engine.applyExerciseProgressionApproval({ proposal: strengthProgression.proposal, approval: { actor: 'AGENT', approvedBy: 'agent', approvedAt: 1 } }),
    /USER or CAREGIVER_OR_RESPONSIBLE/,
    'S3-PROG-APPROVAL agent cannot approve clinical progression',
  );

  console.log('Stage 3 Fuzzy-TOPSIS prescription mapping, risk-cap, and progression checks passed.');
} finally {
  await server.close();
}
