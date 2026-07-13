import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const contract = require('../shared/stage3Contract.cjs');
const catalog = require('../shared/stage3ExerciseCatalog.json');

for (const file of [
  'stage3-exercise-prescription-v1.schema.json',
  'stage3-exercise-session-result-v1.schema.json',
  'stage3-progression-v1.schema.json',
  'assessment-session-v2.schema.json',
  'assessment-session.schema.json',
  'assessment-session-command-v2.schema.json',
  'assessment-session-update-v2.schema.json',
]) {
  assert.doesNotThrow(
    () => JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas', file), 'utf8')),
    `S3-CONTRACT-SCHEMA ${file} is valid JSON`,
  );
}

const byId = Object.fromEntries(catalog.exercises.map((item) => [item.exerciseId, item]));

function prescribed(exerciseId, level, reasons = [], overrides = {}) {
  const exercise = byId[exerciseId];
  const variant = exercise.variants.find((item) => item.level === level);
  assert.ok(variant, `fixture variant ${exerciseId}-${level}`);
  const balanceDefaults = exercise.category === 'BALANCE' ? catalog.balanceDefaults : {};
  const weight = variant.weight || balanceDefaults.weight || { type: 'NONE' };
  const tempo = variant.tempo || balanceDefaults.tempo || {};
  const rest = variant.rest || balanceDefaults.rest || { minimumSeconds: 0, maximumSeconds: null };
  const camera = variant.cameraVerification || balanceDefaults.cameraByExerciseId?.[exerciseId] || { mode: 'MANUAL_ONLY' };
  return {
    exerciseId,
    displayName: exercise.nameKo,
    category: exercise.category,
    level,
    variantId: variant.variantId,
    repetitions: variant.dosage.repetitions ?? null,
    sets: variant.dosage.sets ?? 1,
    repetitionsPerSide: variant.dosage.perSide ? variant.dosage.repetitions : null,
    steps: variant.dosage.steps ?? null,
    holdSeconds: variant.dosage.holdSeconds ?? null,
    supportRequirement: variant.supportRequirement,
    weightMode: weight.type,
    weightMinKg: weight.loadKg?.[0] ?? null,
    weightMaxKg: weight.loadKg?.[1] ?? null,
    tempoUpMinSeconds: tempo.concentricSeconds?.[0] ?? null,
    tempoUpMaxSeconds: tempo.concentricSeconds?.[1] ?? null,
    tempoDownMinSeconds: tempo.eccentricSeconds?.[0] ?? null,
    tempoDownMaxSeconds: tempo.eccentricSeconds?.[1] ?? null,
    breathingRule: variant.breathing || balanceDefaults.breathing || '숨을 참지 않고 자연스럽게 호흡',
    restMinSeconds: rest.minimumSeconds ?? null,
    restMaxSeconds: rest.maximumSeconds ?? null,
    cameraVerification: camera.mode,
    reasonVulnerabilityIds: reasons,
    weakSideExtraSets: reasons.includes('V9') && ['S1', 'S2', 'S3'].includes(exerciseId) ? 1 : 0,
    ...overrides,
  };
}

function walkingPlan() {
  return {
    exerciseId: 'WALK',
    category: 'WALKING',
    targetMinutes: 30,
    splitMinutes: [10, 10, 10],
    weeklyFrequency: 2,
    pace: 'USUAL',
    requiresStrengthAndBalance: true,
    cameraVerification: 'MANUAL_ONLY',
  };
}

const noApproval = { status: 'NOT_REQUIRED', approvalId: null, approvedByRole: null, approvedAt: null };
const pendingProfessional = { status: 'PENDING', approvalId: null, approvedByRole: null, approvedAt: null };
const approvedProfessional = {
  status: 'APPROVED',
  approvalId: 'professional-approval-1',
  approvedByRole: 'PROFESSIONAL',
  approvedAt: 1_700_000_030_000,
};

function plan(overrides = {}) {
  return {
    schemaVersion: 'otago_prescription.v1',
    catalogVersion: 'otago_catalog.v1',
    planId: 'plan-1',
    userId: 'user-1',
    riskLevel: 'LOW',
    status: 'ACTIVE',
    vulnerabilityIds: ['V1'],
    warmups: ['W1', 'W2', 'W3', 'W4', 'W5'].map((id) => prescribed(id, 'A')),
    selectedExercises: [prescribed('S4', 'C', ['V1']), prescribed('B5', 'A', ['V1'])],
    walkingPlan: walkingPlan(),
    professionalApproval: noApproval,
    supervisionRequirement: 'NONE',
    caregiverRecommendedDays: 0,
    requiresProfessionalReview: false,
    safetyNotices: [],
    progressionProposals: [],
    generatedByRuleVersion: 'fuzzy_topsis_otago_engine.v1',
    sourceAssessmentIds: ['assessment-1'],
    sourceResultIds: ['chair-result-1', 'balance-result-1'],
    decisionTrace: ['RISK_LOW', 'VULNERABILITY_V1', 'PRESCRIPTION_ACTIVE'],
    ...overrides,
  };
}

const normalized = contract.normalizeOtagoPrescriptionPlan(plan());
assert.equal(normalized.schemaVersion, 'otago_prescription.v1', 'S3-CONTRACT-PLAN canonical schema version');
assert.deepEqual(normalized.warmups.map((item) => item.exerciseId), ['W1', 'W2', 'W3', 'W4', 'W5']);
assert.deepEqual(normalized.selectedExercises.map((item) => item.exerciseId), ['S4', 'B5']);
assert.equal(normalized.walkingPlan.targetMinutes, 30);

const blocked = plan({
  status: 'BLOCKED',
  vulnerabilityIds: [],
  selectedExercises: [],
  walkingPlan: null,
  progressionProposals: [],
  decisionTrace: ['RISK_LOW', 'BLOCKED'],
});
const normalizedBlocked = contract.normalizeOtagoPrescriptionPlan(blocked);
assert.deepEqual(normalizedBlocked.warmups.map((item) => item.exerciseId), ['W1', 'W2', 'W3', 'W4', 'W5'], 'S3-STATE-BLOCKED canonical warmups are preserved');
assert.deepEqual(normalizedBlocked.selectedExercises, [], 'S3-STATE-BLOCKED selected exercise content is empty');
assert.throws(
  () => contract.normalizeOtagoPrescriptionPlan({
    ...blocked,
    vulnerabilityIds: ['V1'],
    selectedExercises: [prescribed('S4', 'C', ['V1'])],
  }),
  /BLOCKED preserves canonical warmups/,
  'S3-STATE-BLOCKED executable exercise content is rejected',
);

assert.throws(
  () => contract.normalizeOtagoPrescriptionPlan({ ...plan(), unknownField: true }),
  /unknownField is not allowed/,
  'S3-CONTRACT-STRICT unknown top-level plan fields are rejected',
);
const nestedUnknown = plan();
nestedUnknown.selectedExercises[0] = { ...nestedUnknown.selectedExercises[0], demoValue: 3 };
assert.throws(() => contract.normalizeOtagoPrescriptionPlan(nestedUnknown), /demoValue is not allowed/, 'S3-CONTRACT-STRICT unknown nested fields are rejected');
const invalidId = plan();
invalidId.selectedExercises[0] = { ...invalidId.selectedExercises[0], exerciseId: 'calf_raises' };
assert.throws(() => contract.normalizeOtagoPrescriptionPlan(invalidId), /exerciseId must be one of/, 'S3-CONTRACT-ID legacy/free-form IDs are rejected');
const duplicate = plan();
duplicate.selectedExercises.push({ ...duplicate.selectedExercises[0] });
assert.throws(() => contract.normalizeOtagoPrescriptionPlan(duplicate), /must contain unique values/, 'S3-CONTRACT-ID duplicate IDs are rejected');

const moderate = plan({
  riskLevel: 'MODERATE',
  vulnerabilityIds: ['V2', 'V3'],
  selectedExercises: [prescribed('S3', 'B', ['V2', 'V3']), prescribed('B4', 'A', ['V2'])],
  supervisionRequirement: 'CAREGIVER_RECOMMENDED',
  caregiverRecommendedDays: 14,
});
assert.equal(contract.normalizeOtagoPrescriptionPlan(moderate).selectedExercises[0].weightMinKg, 1, 'S3-CONTRACT-CAP MODERATE 1-2kg accepted');
assert.throws(
  () => contract.normalizeOtagoPrescriptionPlan({ ...moderate, selectedExercises: [prescribed('S3', 'C', ['V2', 'V3']), prescribed('B4', 'A', ['V2'])] }),
  /MODERATE S1-S3 must use 1-2 kg/,
  'S3-CONTRACT-CAP MODERATE fatigue weight is rejected',
);

const highPending = plan({
  riskLevel: 'HIGH',
  status: 'PENDING_PROFESSIONAL_REVIEW',
  vulnerabilityIds: ['V3', 'V7'],
  selectedExercises: [prescribed('S1', 'A', ['V3']), prescribed('S4', 'C', ['V7']), prescribed('B5', 'A', ['V7'])],
  walkingPlan: null,
  professionalApproval: pendingProfessional,
  supervisionRequirement: 'PROFESSIONAL_REVIEW_REQUIRED',
  caregiverRecommendedDays: 0,
  requiresProfessionalReview: true,
});
const pending = contract.normalizeOtagoPrescriptionPlan(highPending);
assert.equal(pending.selectedExercises.length, 3, 'S3-CONTRACT-HIGH Level A proposal content is retained while execution is blocked');
assert.equal(pending.status, 'PENDING_PROFESSIONAL_REVIEW');
const highApproved = contract.applyProfessionalApproval(highPending, approvedProfessional);
assert.equal(highApproved.status, 'ACTIVE', 'S3-CONTRACT-HIGH professional approval activates the same plan');
assert.deepEqual(highApproved.selectedExercises, pending.selectedExercises, 'S3-CONTRACT-HIGH approval does not change prescription content');
assert.throws(
  () => contract.normalizeOtagoPrescriptionPlan({ ...highPending, selectedExercises: [prescribed('B5', 'B', ['V7'])] }),
  /HIGH balance must remain Level A/,
  'S3-CONTRACT-HIGH unsupported level is rejected before and after approval',
);
assert.throws(
  () => contract.normalizeOtagoPrescriptionPlan({
    ...highPending,
    selectedExercises: [prescribed('S4', 'C', ['V7'], { supportRequirement: 'NONE' })],
  }),
  /supported Level C/,
  'S3-CAP-HIGH S4-S5 must retain stable support',
);
assert.throws(
  () => contract.normalizeOtagoPrescriptionPlan({ ...highApproved, walkingPlan: walkingPlan() }),
  /must be null for HIGH risk/,
  'S3-CAP-HIGH walking remains unavailable after professional approval',
);
assert.throws(
  () => contract.normalizeProfessionalApproval({ ...approvedProfessional, approvedByRole: 'CAREGIVER' }),
  /professional approvalId/,
  'S3-CONTRACT-HIGH approval must come from a professional',
);

function result(overrides = {}) {
  return {
    schemaVersion: 'exercise_session_result.v1',
    resultId: 'exercise-result-1',
    exerciseSessionId: 'exercise-session-1',
    planId: 'plan-1',
    exerciseId: 'B5',
    level: 'A',
    variantId: 'B5-A',
    status: 'COMPLETED',
    source: 'LIVE_POSE',
    startedAt: 1_700_000_000_000,
    completedAt: 1_700_000_010_000,
    prescribedDosage: { repetitions: null, sets: 1, repetitionsPerSide: null, steps: null, holdSeconds: 10 },
    completedDosage: { repetitions: null, sets: 1, repetitionsPerSide: null, steps: null, holdSeconds: 10 },
    formAccurate: true,
    lowerBodyRecoveryWithoutGripping: true,
    supportUsed: true,
    cameraVerification: 'FULL',
    safetyEvents: [],
    ...overrides,
  };
}

const normalizedResult = contract.normalizeExerciseSessionResult(result());
assert.equal(normalizedResult.exerciseId, 'B5', 'S3-CONTRACT-RESULT canonical result accepted');
assert.throws(() => contract.normalizeExerciseSessionResult({ ...result(), debugScore: 0.9 }), /debugScore is not allowed/, 'S3-CONTRACT-RESULT unknown field rejected');
assert.throws(() => contract.normalizeExerciseSessionResult({ ...result(), source: 'USER_CONFIRMED' }), /FULL camera verification requires LIVE_POSE/, 'S3-CONTRACT-RESULT source must match verification mode');
const manual = result({
  resultId: 'exercise-result-manual',
  exerciseSessionId: 'exercise-session-manual',
  exerciseId: 'B6',
  level: 'A',
  variantId: 'B6-A',
  source: 'USER_CONFIRMED',
  cameraVerification: 'MANUAL_ONLY',
  prescribedDosage: { repetitions: null, sets: 1, repetitionsPerSide: null, steps: 10, holdSeconds: null },
  completedDosage: { repetitions: null, sets: 1, repetitionsPerSide: null, steps: 10, holdSeconds: null },
});
assert.equal(contract.normalizeExerciseSessionResult(manual).source, 'USER_CONFIRMED');

const proposal = {
  proposalId: 'progression-1',
  exerciseId: 'B5',
  fromLevel: 'A',
  toLevel: 'B',
  fromVariantId: 'B5-A',
  toVariantId: 'B5-B',
  progressionType: 'ADVANCE_VARIANT',
  weightIncrementMinKg: null,
  weightIncrementMaxKg: null,
  status: 'PENDING_APPROVAL',
  qualifyingSessionIds: ['exercise-session-1', 'exercise-session-2'],
  approval: null,
};
assert.throws(
  () => contract.normalizeOtagoPrescriptionPlan({
    ...blocked,
    vulnerabilityIds: ['V1'],
    selectedExercises: [prescribed('B5', 'A', ['V1'])],
    progressionProposals: [proposal],
  }),
  /BLOCKED preserves canonical warmups/,
  'S3-STATE-BLOCKED progression content is rejected',
);
assert.throws(
  () => contract.normalizeOtagoPrescriptionPlan({ ...highPending, progressionProposals: [proposal] }),
  /must be empty for HIGH risk/,
  'S3-CAP-HIGH progression requires a separate professional reassessment contract',
);
assert.equal(contract.normalizeProgressionProposal(proposal).status, 'PENDING_APPROVAL');
assert.throws(
  () => contract.normalizeProgressionProposal({ ...proposal, qualifyingSessionIds: ['exercise-session-1', 'exercise-session-1'] }),
  /must contain unique values/,
  'S3-CONTRACT-PROGRESSION exactly two distinct sessions required',
);
assert.throws(
  () => contract.normalizeProgressionProposal({ ...proposal, status: 'APPROVED' }),
  /approval is required/,
  'S3-CONTRACT-PROGRESSION approval identity required before approved status',
);
const planWithProposal = plan({ progressionProposals: [proposal] });
const approvedProgressionPlan = contract.applyProgressionApproval(planWithProposal, 'progression-1', {
  actor: 'CAREGIVER_OR_RESPONSIBLE',
  approvedBy: 'caregiver-1',
  approvedAt: 1_700_000_020_000,
});
assert.equal(approvedProgressionPlan.progressionProposals[0].status, 'APPROVED', 'S3-CONTRACT-PROGRESSION authorized approval is explicit');
assert.equal(approvedProgressionPlan.selectedExercises.find((item) => item.exerciseId === 'B5').variantId, 'B5-A', 'S3-CONTRACT-PROGRESSION approval does not auto-apply level');

const commandSchema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/assessment-session-command-v2.schema.json'), 'utf8'));
const commandRefs = JSON.stringify(commandSchema.$defs);
for (const type of ['PROFESSIONAL_APPROVAL_RECORDED', 'PROGRESSION_PROPOSED', 'PROGRESSION_APPROVAL_RECORDED', 'EXERCISE_SESSION_RESULT_RECORDED']) {
  assert.match(commandRefs, new RegExp(type), `S3-CONTRACT-COMMAND ${type} is defined`);
}
const sessionSchema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/assessment-session-v2.schema.json'), 'utf8'));
assert.match(JSON.stringify(sessionSchema.$defs.exercisePrescription), /stage3-exercise-prescription-v1\.schema\.json/, 'S3-CONTRACT-SESSION prescription uses strict Stage 3 plan');
assert.match(JSON.stringify(sessionSchema.$defs.exercisePrescription), /sessionResults/, 'S3-CONTRACT-SESSION result history is persisted in the canonical snapshot');
const baseSessionSchema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/assessment-session.schema.json'), 'utf8'));
assert.match(JSON.stringify(baseSessionSchema.$defs.exercisePrescription), /stage3-exercise-prescription-v1\.schema\.json/, 'S3-CONTRACT-SESSION base contract also rejects arbitrary prescription objects');
assert.match(JSON.stringify(baseSessionSchema.$defs.exercisePrescription), /sessionResults/, 'S3-CONTRACT-SESSION base contract persists typed exercise results');

const prescriptionSchema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/stage3-exercise-prescription-v1.schema.json'), 'utf8'));
const progressionSchema = JSON.parse(fs.readFileSync(path.join(root, 'docs/schemas/stage3-progression-v1.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(progressionSchema);
const validatePrescriptionSchema = ajv.compile(prescriptionSchema);
const schemaResult = (value) => ({ valid: validatePrescriptionSchema(value), errors: validatePrescriptionSchema.errors });
for (const [requirementId, value] of [
  ['S3-SCHEMA-RUNTIME-LOW', plan()],
  ['S3-SCHEMA-RUNTIME-HIGH-PENDING', highPending],
  ['S3-SCHEMA-RUNTIME-HIGH-APPROVED', highApproved],
  ['S3-SCHEMA-RUNTIME-BLOCKED', blocked],
]) {
  const result = schemaResult(value);
  assert.equal(result.valid, true, `${requirementId} canonical fixture validates: ${JSON.stringify(result.errors)}`);
}
for (const [requirementId, value] of [
  ['S3-SCHEMA-REJECT-HIGH-WALK', { ...highApproved, walkingPlan: walkingPlan() }],
  ['S3-SCHEMA-REJECT-HIGH-S4-UNSUPPORTED', {
    ...highPending,
    selectedExercises: highPending.selectedExercises.map((exercise) => (
      exercise.exerciseId === 'S4' ? { ...exercise, supportRequirement: 'NONE' } : exercise
    )),
  }],
  ['S3-SCHEMA-REJECT-BLOCKED-CONTENT', { ...blocked, selectedExercises: [prescribed('S4', 'C', ['V1'])] }],
]) {
  assert.equal(schemaResult(value).valid, false, `${requirementId} invalid fixture is rejected by Draft 2020-12 validation`);
}
const highSchemaRule = prescriptionSchema.allOf.find((rule) => rule.if?.properties?.riskLevel?.const === 'HIGH' && rule.if.required?.length === 1);
assert.equal(highSchemaRule.then.properties.walkingPlan.type, 'null', 'S3-SCHEMA-CAP-HIGH walking is null before and after approval');
assert.equal(highSchemaRule.then.properties.progressionProposals.maxItems, 0, 'S3-SCHEMA-CAP-HIGH progression is excluded');
const highItemRules = highSchemaRule.then.properties.selectedExercises.items.allOf;
assert.equal(highItemRules[0].then.properties.level.const, 'A', 'S3-SCHEMA-CAP-HIGH balance is Level A');
assert.equal(highItemRules[2].then.properties.supportRequirement.const, 'STABLE_SUPPORT', 'S3-SCHEMA-CAP-HIGH S4-S5 preserve supported Level C');
const blockedSchemaRule = prescriptionSchema.allOf.find((rule) => rule.if?.properties?.status?.const === 'BLOCKED');
assert.equal(blockedSchemaRule.then.properties.selectedExercises.maxItems, 0, 'S3-SCHEMA-STATE-BLOCKED selected content is empty');
assert.equal(blockedSchemaRule.then.properties.walkingPlan.type, 'null', 'S3-SCHEMA-STATE-BLOCKED walking is null');
assert.equal(prescriptionSchema.properties.warmups.minItems, 5, 'S3-SCHEMA-STATE-BLOCKED canonical warmups remain required');

console.log('Stage 3 strict prescription, result, progression, and command contract checks passed.');
