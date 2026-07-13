'use strict';

const catalogSource = require('./stage3ExerciseCatalog.json');

const OTAGO_PRESCRIPTION_SCHEMA_VERSION = 'otago_prescription.v1';
const OTAGO_CATALOG_VERSION = 'otago_catalog.v1';
const EXERCISE_SESSION_RESULT_SCHEMA_VERSION = 'exercise_session_result.v1';
const EXERCISE_IDS = Object.freeze([
  'W1', 'W2', 'W3', 'W4', 'W5',
  'S1', 'S2', 'S3', 'S4', 'S5',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12',
  'WALK',
]);
const VULNERABILITY_IDS = Object.freeze(['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9']);
const LEVELS = Object.freeze(['A', 'B', 'C', 'D']);
const CATEGORIES = Object.freeze(['WARMUP', 'STRENGTH', 'BALANCE', 'WALKING']);
const SUPPORT_REQUIREMENTS = Object.freeze(['NONE', 'STABLE_SUPPORT', 'ONE_HAND', 'TWO_HAND', 'WALKING_AID']);
const WEIGHT_MODES = Object.freeze(['NONE', 'ANKLE_CUFF', 'FATIGUE_TARGET']);
const CAMERA_VERIFICATION = Object.freeze(['FULL', 'PARTIAL', 'MANUAL_ONLY']);
const PLAN_STATUSES = Object.freeze(['BLOCKED', 'ACTIVE', 'PENDING_PROFESSIONAL_REVIEW']);
const RISK_LEVELS = Object.freeze(['LOW', 'MODERATE', 'HIGH']);
const SUPERVISION_REQUIREMENTS = Object.freeze(['NONE', 'CAREGIVER_RECOMMENDED', 'PROFESSIONAL_REVIEW_REQUIRED']);
const APPROVAL_STATUSES = Object.freeze(['NOT_REQUIRED', 'PENDING', 'APPROVED']);
const PROGRESSION_STATUSES = Object.freeze(['PENDING_APPROVAL', 'APPROVED', 'APPLIED']);
const PROGRESSION_TYPES = Object.freeze(['INCREASE_WEIGHT', 'REMOVE_SUPPORT', 'ADVANCE_VARIANT', 'INCREASE_SETS']);
const PROGRESSION_APPROVAL_ACTORS = Object.freeze(['USER', 'CAREGIVER_OR_RESPONSIBLE']);
const RESULT_STATUSES = Object.freeze(['COMPLETED', 'INCOMPLETE', 'STOPPED_SAFETY']);
const RESULT_SOURCES = Object.freeze(['LIVE_POSE', 'USER_CONFIRMED']);

const CATALOG_BY_ID = Object.fromEntries(catalogSource.exercises.map((exercise) => [exercise.exerciseId, exercise]));
const LEVEL_RANK = Object.freeze({ A: 0, B: 1, C: 2, D: 3 });

function fail(path, message) {
  const error = new Error(`${path} ${message}`);
  error.code = 'INVALID_STAGE3_CONTRACT';
  throw error;
}

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  return value;
}

function strictObject(value, path, allowedKeys) {
  const source = object(value, path);
  const unknown = Object.keys(source).filter((key) => !allowedKeys.includes(key));
  if (unknown.length) fail(`${path}.${unknown[0]}`, 'is not allowed');
  return source;
}

function required(source, key, path) {
  if (!Object.hasOwn(source, key)) fail(`${path}.${key}`, 'is required');
  return source[key];
}

function text(value, path, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value.trim()) fail(path, 'must be a non-empty string');
  return value.trim();
}

function number(value, path, { nullable = false, integer = false, minimum = 0 } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be a finite number');
  if (integer && !Number.isInteger(value)) fail(path, 'must be an integer');
  if (value < minimum) fail(path, `must be at least ${minimum}`);
  return value;
}

function boolean(value, path) {
  if (typeof value !== 'boolean') fail(path, 'must be a boolean');
  return value;
}

function enumValue(value, allowed, path) {
  if (!allowed.includes(value)) fail(path, `must be one of ${allowed.join(', ')}`);
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  return value;
}

function unique(values, path) {
  if (new Set(values).size !== values.length) fail(path, 'must contain unique values');
  return values;
}

function stringArray(value, path, { allowed = null, exactLength = null } = {}) {
  const values = array(value, path).map((item, index) => allowed
    ? enumValue(item, allowed, `${path}[${index}]`)
    : text(item, `${path}[${index}]`));
  if (exactLength !== null && values.length !== exactLength) fail(path, `must contain exactly ${exactLength} items`);
  return unique(values, path);
}

function categoryForExerciseId(exerciseId) {
  if (exerciseId.startsWith('W') && exerciseId !== 'WALK') return 'WARMUP';
  if (exerciseId.startsWith('S')) return 'STRENGTH';
  if (exerciseId.startsWith('B')) return 'BALANCE';
  return 'WALKING';
}

function normalizeProfessionalApproval(value, path = 'professionalApproval') {
  const source = strictObject(value, path, ['status', 'approvalId', 'approvedByRole', 'approvedAt']);
  const status = enumValue(required(source, 'status', path), APPROVAL_STATUSES, `${path}.status`);
  const normalized = {
    status,
    approvalId: text(required(source, 'approvalId', path), `${path}.approvalId`, { nullable: true }),
    approvedByRole: source.approvedByRole === null
      ? null
      : enumValue(required(source, 'approvedByRole', path), ['USER', 'CAREGIVER', 'PROFESSIONAL'], `${path}.approvedByRole`),
    approvedAt: number(required(source, 'approvedAt', path), `${path}.approvedAt`, { nullable: true, integer: true }),
  };
  if (status === 'APPROVED') {
    if (!normalized.approvalId || normalized.approvedByRole !== 'PROFESSIONAL' || normalized.approvedAt === null) {
      fail(path, 'APPROVED requires a professional approvalId and approvedAt');
    }
  } else if (normalized.approvalId !== null || normalized.approvedByRole !== null || normalized.approvedAt !== null) {
    fail(path, `${status} cannot carry approval identity or timestamp`);
  }
  return normalized;
}

function normalizeProgressionApproval(value, path = 'approval') {
  if (value === null) return null;
  const source = strictObject(value, path, ['actor', 'approvedBy', 'approvedAt']);
  return {
    actor: enumValue(required(source, 'actor', path), PROGRESSION_APPROVAL_ACTORS, `${path}.actor`),
    approvedBy: text(required(source, 'approvedBy', path), `${path}.approvedBy`),
    approvedAt: number(required(source, 'approvedAt', path), `${path}.approvedAt`, { integer: true }),
  };
}

function normalizeProgressionProposal(value, path = 'progressionProposal') {
  const source = strictObject(value, path, [
    'proposalId', 'exerciseId', 'fromLevel', 'toLevel', 'fromVariantId', 'toVariantId',
    'progressionType', 'weightIncrementMinKg', 'weightIncrementMaxKg', 'status', 'qualifyingSessionIds', 'approval',
  ]);
  const normalized = {
    proposalId: text(required(source, 'proposalId', path), `${path}.proposalId`),
    exerciseId: enumValue(required(source, 'exerciseId', path), EXERCISE_IDS, `${path}.exerciseId`),
    fromLevel: enumValue(required(source, 'fromLevel', path), LEVELS, `${path}.fromLevel`),
    toLevel: enumValue(required(source, 'toLevel', path), LEVELS, `${path}.toLevel`),
    fromVariantId: text(required(source, 'fromVariantId', path), `${path}.fromVariantId`),
    toVariantId: text(required(source, 'toVariantId', path), `${path}.toVariantId`),
    progressionType: enumValue(required(source, 'progressionType', path), PROGRESSION_TYPES, `${path}.progressionType`),
    weightIncrementMinKg: number(required(source, 'weightIncrementMinKg', path), `${path}.weightIncrementMinKg`, { nullable: true }),
    weightIncrementMaxKg: number(required(source, 'weightIncrementMaxKg', path), `${path}.weightIncrementMaxKg`, { nullable: true }),
    status: enumValue(required(source, 'status', path), PROGRESSION_STATUSES, `${path}.status`),
    qualifyingSessionIds: stringArray(required(source, 'qualifyingSessionIds', path), `${path}.qualifyingSessionIds`, { exactLength: 2 }),
    approval: normalizeProgressionApproval(required(source, 'approval', path), `${path}.approval`),
  };
  if (['WARMUP', 'WALKING'].includes(categoryForExerciseId(normalized.exerciseId))) fail(`${path}.exerciseId`, 'cannot progress warmup or walking entries');
  const sameVariant = normalized.fromLevel === normalized.toLevel && normalized.fromVariantId === normalized.toVariantId;
  if (normalized.progressionType === 'INCREASE_WEIGHT') {
    if (!['S1', 'S2', 'S3'].includes(normalized.exerciseId) || !sameVariant) fail(path, 'INCREASE_WEIGHT requires S1-S3 at the same level and variant');
    if (normalized.weightIncrementMinKg !== 0.5 || normalized.weightIncrementMaxKg !== 1) fail(path, 'INCREASE_WEIGHT must propose 0.5-1 kg');
  } else {
    if (sameVariant) fail(path, 'non-weight progression must change level or variant');
    if (normalized.weightIncrementMinKg !== null || normalized.weightIncrementMaxKg !== null) fail(path, 'only INCREASE_WEIGHT can carry a weight increment');
  }
  if (normalized.status === 'PENDING_APPROVAL' && normalized.approval !== null) fail(`${path}.approval`, 'must be null while pending');
  if (normalized.status !== 'PENDING_APPROVAL' && normalized.approval === null) fail(`${path}.approval`, 'is required after approval');
  return normalized;
}

function nullableDoseNumber(source, key, path, integer = false) {
  return number(required(source, key, path), `${path}.${key}`, { nullable: true, integer });
}

function normalizePrescribedExercise(value, path = 'prescribedExercise', { warmup = false } = {}) {
  const keys = [
    'exerciseId', 'displayName', 'category', 'level', 'variantId', 'repetitions', 'sets', 'repetitionsPerSide', 'steps',
    'holdSeconds', 'supportRequirement', 'weightMode', 'weightMinKg', 'weightMaxKg', 'tempoUpMinSeconds',
    'tempoUpMaxSeconds', 'tempoDownMinSeconds', 'tempoDownMaxSeconds', 'breathingRule', 'restMinSeconds',
    'restMaxSeconds', 'cameraVerification', 'reasonVulnerabilityIds', 'weakSideExtraSets',
  ];
  const source = strictObject(value, path, keys);
  const exerciseId = enumValue(required(source, 'exerciseId', path), EXERCISE_IDS, `${path}.exerciseId`);
  const category = enumValue(required(source, 'category', path), CATEGORIES, `${path}.category`);
  if (category !== categoryForExerciseId(exerciseId)) fail(`${path}.category`, `must be ${categoryForExerciseId(exerciseId)} for ${exerciseId}`);
  const normalized = {
    exerciseId,
    displayName: text(required(source, 'displayName', path), `${path}.displayName`),
    category,
    level: enumValue(required(source, 'level', path), LEVELS, `${path}.level`),
    variantId: text(required(source, 'variantId', path), `${path}.variantId`),
    repetitions: nullableDoseNumber(source, 'repetitions', path, true),
    sets: number(required(source, 'sets', path), `${path}.sets`, { integer: true, minimum: 1 }),
    repetitionsPerSide: nullableDoseNumber(source, 'repetitionsPerSide', path, true),
    steps: nullableDoseNumber(source, 'steps', path, true),
    holdSeconds: nullableDoseNumber(source, 'holdSeconds', path),
    supportRequirement: enumValue(required(source, 'supportRequirement', path), SUPPORT_REQUIREMENTS, `${path}.supportRequirement`),
    weightMode: enumValue(required(source, 'weightMode', path), WEIGHT_MODES, `${path}.weightMode`),
    weightMinKg: nullableDoseNumber(source, 'weightMinKg', path),
    weightMaxKg: nullableDoseNumber(source, 'weightMaxKg', path),
    tempoUpMinSeconds: nullableDoseNumber(source, 'tempoUpMinSeconds', path),
    tempoUpMaxSeconds: nullableDoseNumber(source, 'tempoUpMaxSeconds', path),
    tempoDownMinSeconds: nullableDoseNumber(source, 'tempoDownMinSeconds', path),
    tempoDownMaxSeconds: nullableDoseNumber(source, 'tempoDownMaxSeconds', path),
    breathingRule: text(required(source, 'breathingRule', path), `${path}.breathingRule`),
    restMinSeconds: nullableDoseNumber(source, 'restMinSeconds', path),
    restMaxSeconds: nullableDoseNumber(source, 'restMaxSeconds', path),
    cameraVerification: enumValue(required(source, 'cameraVerification', path), CAMERA_VERIFICATION, `${path}.cameraVerification`),
    reasonVulnerabilityIds: stringArray(required(source, 'reasonVulnerabilityIds', path), `${path}.reasonVulnerabilityIds`, { allowed: VULNERABILITY_IDS }),
    weakSideExtraSets: number(required(source, 'weakSideExtraSets', path), `${path}.weakSideExtraSets`, { integer: true }),
  };
  if (!CATALOG_BY_ID[exerciseId]) fail(`${path}.exerciseId`, 'is not present in the canonical catalog');
  if (!CATALOG_BY_ID[exerciseId].variants.some((variant) => variant.variantId === normalized.variantId && variant.level === normalized.level)) {
    fail(`${path}.variantId`, 'does not match a canonical catalog variant at this level');
  }
  if (normalized.weightMode === 'NONE' && (normalized.weightMinKg !== null || normalized.weightMaxKg !== null)) {
    fail(path, 'NONE weight cannot include kilograms');
  }
  if (normalized.weightMode === 'ANKLE_CUFF') {
    if (normalized.weightMinKg === null || normalized.weightMaxKg === null || normalized.weightMinKg > normalized.weightMaxKg) {
      fail(path, 'ANKLE_CUFF requires an ordered kilogram range');
    }
  }
  if (normalized.category === 'STRENGTH') {
    if (
      normalized.tempoUpMinSeconds !== 2 || normalized.tempoUpMaxSeconds !== 3
      || normalized.tempoDownMinSeconds !== 4 || normalized.tempoDownMaxSeconds !== 5
    ) fail(path, 'strength tempo must be 2-3 seconds up and 4-5 seconds down');
    if (normalized.restMinSeconds !== 60 || normalized.restMaxSeconds !== 120) fail(path, 'strength rest must be 60-120 seconds');
  }
  if (warmup) {
    if (normalized.category !== 'WARMUP' || normalized.reasonVulnerabilityIds.length) fail(path, 'warmups cannot carry vulnerability reasons');
  } else if (!normalized.reasonVulnerabilityIds.length) {
    fail(`${path}.reasonVulnerabilityIds`, 'must cite at least one V1-V9 reason');
  }
  if (normalized.reasonVulnerabilityIds.includes('V9') && ['S1', 'S2', 'S3'].includes(exerciseId)) {
    if (normalized.weakSideExtraSets !== 1) fail(`${path}.weakSideExtraSets`, 'must be 1 for V9 S1-S3 prescriptions');
  } else if (normalized.weakSideExtraSets !== 0) {
    fail(`${path}.weakSideExtraSets`, 'is only allowed for V9 S1-S3 prescriptions');
  }
  return normalized;
}

function normalizeWalkingPlan(value, path = 'walkingPlan') {
  if (value === null) return null;
  const source = strictObject(value, path, [
    'exerciseId', 'category', 'targetMinutes', 'splitMinutes', 'weeklyFrequency', 'pace',
    'requiresStrengthAndBalance', 'cameraVerification',
  ]);
  const normalized = {
    exerciseId: enumValue(required(source, 'exerciseId', path), ['WALK'], `${path}.exerciseId`),
    category: enumValue(required(source, 'category', path), ['WALKING'], `${path}.category`),
    targetMinutes: number(required(source, 'targetMinutes', path), `${path}.targetMinutes`, { integer: true }),
    splitMinutes: array(required(source, 'splitMinutes', path), `${path}.splitMinutes`).map((item, index) => number(item, `${path}.splitMinutes[${index}]`, { integer: true })),
    weeklyFrequency: number(required(source, 'weeklyFrequency', path), `${path}.weeklyFrequency`, { integer: true }),
    pace: enumValue(required(source, 'pace', path), ['USUAL'], `${path}.pace`),
    requiresStrengthAndBalance: boolean(required(source, 'requiresStrengthAndBalance', path), `${path}.requiresStrengthAndBalance`),
    cameraVerification: enumValue(required(source, 'cameraVerification', path), ['MANUAL_ONLY'], `${path}.cameraVerification`),
  };
  if (normalized.targetMinutes !== 30 || normalized.weeklyFrequency < 2 || normalized.splitMinutes.length !== 3 || normalized.splitMinutes.some((item) => item !== 10)) {
    fail(path, 'must preserve the 30 minute, 10x3 split, at-least-twice-weekly Otago walking plan');
  }
  if (!normalized.requiresStrengthAndBalance) fail(`${path}.requiresStrengthAndBalance`, 'must be true');
  return normalized;
}

function assertRiskCaps(plan) {
  const balance = plan.selectedExercises.filter((exercise) => exercise.category === 'BALANCE');
  const weightedStrength = plan.selectedExercises.filter((exercise) => ['S1', 'S2', 'S3'].includes(exercise.exerciseId));
  if (plan.riskLevel === 'LOW') {
    if (balance.some((exercise) => LEVEL_RANK[exercise.level] > LEVEL_RANK.B)) fail('selectedExercises', 'LOW balance cannot start above Level B');
    if (weightedStrength.some((exercise) => LEVEL_RANK[exercise.level] > LEVEL_RANK.C)) fail('selectedExercises', 'LOW S1-S3 cannot start above Level C');
  }
  if (plan.riskLevel === 'MODERATE') {
    if (balance.some((exercise) => exercise.level !== 'A')) fail('selectedExercises', 'MODERATE balance must start at Level A');
    for (const exercise of weightedStrength) {
      const v6Lowest = exercise.reasonVulnerabilityIds.includes('V6') && exercise.level === 'A' && exercise.weightMode === 'NONE';
      const moderateWeight = exercise.weightMode === 'ANKLE_CUFF' && exercise.weightMinKg === 1 && exercise.weightMaxKg === 2;
      if (!v6Lowest && !moderateWeight) fail('selectedExercises', 'MODERATE S1-S3 must use 1-2 kg unless V6 requires the lowest level');
    }
    if (plan.caregiverRecommendedDays !== 14 || plan.supervisionRequirement !== 'CAREGIVER_RECOMMENDED') {
      fail('caregiverRecommendedDays', 'MODERATE requires caregiver recommendation for the first 14 days');
    }
  }
  if (plan.riskLevel === 'HIGH') {
    if (balance.some((exercise) => exercise.level !== 'A')) fail('selectedExercises', 'HIGH balance must remain Level A');
    for (const exercise of weightedStrength) {
      if (exercise.level !== 'A' || exercise.weightMode !== 'NONE') fail('selectedExercises', 'HIGH S1-S3 must be Level A without ankle weight');
    }
    for (const exercise of plan.selectedExercises.filter((item) => ['S4', 'S5'].includes(item.exerciseId))) {
      if (exercise.level !== 'C' || exercise.supportRequirement !== 'STABLE_SUPPORT' || exercise.weightMode !== 'NONE') {
        fail('selectedExercises', 'HIGH S4-S5 must be supported Level C without weight');
      }
    }
    if (plan.walkingPlan !== null) fail('walkingPlan', 'must be null for HIGH risk');
    if (plan.progressionProposals.length) fail('progressionProposals', 'must be empty for HIGH risk without a separate professional reassessment contract');
    if (plan.supervisionRequirement !== 'PROFESSIONAL_REVIEW_REQUIRED') fail('supervisionRequirement', 'HIGH requires professional review');
    if (plan.professionalApproval.status === 'APPROVED') {
      if (plan.status !== 'ACTIVE' || plan.requiresProfessionalReview) fail('status', 'approved HIGH plan must be ACTIVE');
    } else if (plan.status !== 'PENDING_PROFESSIONAL_REVIEW' || !plan.requiresProfessionalReview) {
      fail('status', 'unapproved HIGH plan must remain pending and blocked from execution');
    }
  }
}

function normalizeOtagoPrescriptionPlan(value) {
  const path = 'exercisePrescription.plan';
  const source = strictObject(value, path, [
    'schemaVersion', 'catalogVersion', 'planId', 'userId', 'riskLevel', 'status', 'vulnerabilityIds', 'warmups',
    'selectedExercises', 'walkingPlan', 'professionalApproval', 'supervisionRequirement', 'caregiverRecommendedDays',
    'requiresProfessionalReview', 'safetyNotices', 'progressionProposals', 'generatedByRuleVersion',
    'sourceAssessmentIds', 'sourceResultIds', 'decisionTrace',
  ]);
  const warmups = array(required(source, 'warmups', path), `${path}.warmups`).map((item, index) => normalizePrescribedExercise(item, `${path}.warmups[${index}]`, { warmup: true }));
  if (warmups.length !== 5 || warmups.some((item, index) => item.exerciseId !== `W${index + 1}`)) fail(`${path}.warmups`, 'must contain W1 through W5 in order');
  const selectedExercises = array(required(source, 'selectedExercises', path), `${path}.selectedExercises`)
    .map((item, index) => normalizePrescribedExercise(item, `${path}.selectedExercises[${index}]`));
  unique(selectedExercises.map((exercise) => exercise.exerciseId), `${path}.selectedExercises`);
  if (selectedExercises.some((exercise) => ['WARMUP', 'WALKING'].includes(exercise.category))) fail(`${path}.selectedExercises`, 'can contain only strength and balance exercises');
  const plan = {
    schemaVersion: enumValue(required(source, 'schemaVersion', path), [OTAGO_PRESCRIPTION_SCHEMA_VERSION], `${path}.schemaVersion`),
    catalogVersion: enumValue(required(source, 'catalogVersion', path), [OTAGO_CATALOG_VERSION], `${path}.catalogVersion`),
    planId: text(required(source, 'planId', path), `${path}.planId`),
    userId: text(required(source, 'userId', path), `${path}.userId`),
    riskLevel: enumValue(required(source, 'riskLevel', path), RISK_LEVELS, `${path}.riskLevel`),
    status: enumValue(required(source, 'status', path), PLAN_STATUSES, `${path}.status`),
    vulnerabilityIds: stringArray(required(source, 'vulnerabilityIds', path), `${path}.vulnerabilityIds`, { allowed: VULNERABILITY_IDS }),
    warmups,
    selectedExercises,
    walkingPlan: normalizeWalkingPlan(required(source, 'walkingPlan', path), `${path}.walkingPlan`),
    professionalApproval: normalizeProfessionalApproval(required(source, 'professionalApproval', path), `${path}.professionalApproval`),
    supervisionRequirement: enumValue(required(source, 'supervisionRequirement', path), SUPERVISION_REQUIREMENTS, `${path}.supervisionRequirement`),
    caregiverRecommendedDays: number(required(source, 'caregiverRecommendedDays', path), `${path}.caregiverRecommendedDays`, { integer: true }),
    requiresProfessionalReview: boolean(required(source, 'requiresProfessionalReview', path), `${path}.requiresProfessionalReview`),
    safetyNotices: stringArray(required(source, 'safetyNotices', path), `${path}.safetyNotices`),
    progressionProposals: array(required(source, 'progressionProposals', path), `${path}.progressionProposals`)
      .map((proposal, index) => normalizeProgressionProposal(proposal, `${path}.progressionProposals[${index}]`)),
    generatedByRuleVersion: text(required(source, 'generatedByRuleVersion', path), `${path}.generatedByRuleVersion`),
    sourceAssessmentIds: stringArray(required(source, 'sourceAssessmentIds', path), `${path}.sourceAssessmentIds`),
    sourceResultIds: stringArray(required(source, 'sourceResultIds', path), `${path}.sourceResultIds`),
    decisionTrace: stringArray(required(source, 'decisionTrace', path), `${path}.decisionTrace`),
  };
  for (const exercise of selectedExercises) {
    if (exercise.reasonVulnerabilityIds.some((id) => !plan.vulnerabilityIds.includes(id))) {
      fail(`${path}.selectedExercises`, 'exercise reasonVulnerabilityIds must be included in plan vulnerabilityIds');
    }
  }
  for (const proposal of plan.progressionProposals) {
    const selected = selectedExercises.find((exercise) => exercise.exerciseId === proposal.exerciseId);
    if (!selected) fail(`${path}.progressionProposals`, 'proposal exercise must be present in selectedExercises');
    if (selected.level !== proposal.fromLevel || selected.variantId !== proposal.fromVariantId) {
      fail(`${path}.progressionProposals`, 'proposal from level/variant must match the current prescription');
    }
  }
  if (
    plan.status === 'BLOCKED'
    && (plan.selectedExercises.length || plan.walkingPlan !== null || plan.progressionProposals.length)
  ) {
    fail(`${path}.status`, 'BLOCKED preserves canonical warmups but cannot expose selected exercise, walking, or progression content');
  }
  if (plan.riskLevel !== 'HIGH') {
    if (plan.professionalApproval.status !== 'NOT_REQUIRED') fail(`${path}.professionalApproval`, 'must be NOT_REQUIRED outside HIGH');
    if (plan.requiresProfessionalReview) fail(`${path}.requiresProfessionalReview`, 'must be false outside HIGH');
    if (!plan.vulnerabilityIds.length) {
      if (plan.status !== 'BLOCKED' || plan.selectedExercises.length || plan.walkingPlan !== null) {
        fail(`${path}.status`, 'LOW/MODERATE without V1-V9 must be a BLOCKED targeted plan with no exercise or walking selection');
      }
    } else if (plan.status !== 'ACTIVE') {
      fail(`${path}.status`, 'LOW/MODERATE with V1-V9 must be ACTIVE');
    }
  }
  assertRiskCaps(plan);
  return plan;
}

function normalizeDosage(value, path, { minimumSets = 0 } = {}) {
  const source = strictObject(value, path, ['repetitions', 'sets', 'repetitionsPerSide', 'steps', 'holdSeconds']);
  return {
    repetitions: nullableDoseNumber(source, 'repetitions', path, true),
    sets: number(required(source, 'sets', path), `${path}.sets`, { integer: true, minimum: minimumSets }),
    repetitionsPerSide: nullableDoseNumber(source, 'repetitionsPerSide', path, true),
    steps: nullableDoseNumber(source, 'steps', path, true),
    holdSeconds: nullableDoseNumber(source, 'holdSeconds', path),
  };
}

function normalizeExerciseSessionResult(value) {
  const path = 'exerciseSessionResult';
  const source = strictObject(value, path, [
    'schemaVersion', 'resultId', 'exerciseSessionId', 'planId', 'exerciseId', 'level', 'variantId', 'status', 'source',
    'startedAt', 'completedAt', 'prescribedDosage', 'completedDosage', 'formAccurate',
    'lowerBodyRecoveryWithoutGripping', 'supportUsed', 'cameraVerification', 'safetyEvents',
  ]);
  const result = {
    schemaVersion: enumValue(required(source, 'schemaVersion', path), [EXERCISE_SESSION_RESULT_SCHEMA_VERSION], `${path}.schemaVersion`),
    resultId: text(required(source, 'resultId', path), `${path}.resultId`),
    exerciseSessionId: text(required(source, 'exerciseSessionId', path), `${path}.exerciseSessionId`),
    planId: text(required(source, 'planId', path), `${path}.planId`),
    exerciseId: enumValue(required(source, 'exerciseId', path), EXERCISE_IDS, `${path}.exerciseId`),
    level: enumValue(required(source, 'level', path), LEVELS, `${path}.level`),
    variantId: text(required(source, 'variantId', path), `${path}.variantId`),
    status: enumValue(required(source, 'status', path), RESULT_STATUSES, `${path}.status`),
    source: enumValue(required(source, 'source', path), RESULT_SOURCES, `${path}.source`),
    startedAt: number(required(source, 'startedAt', path), `${path}.startedAt`, { integer: true }),
    completedAt: number(required(source, 'completedAt', path), `${path}.completedAt`, { integer: true }),
    prescribedDosage: normalizeDosage(required(source, 'prescribedDosage', path), `${path}.prescribedDosage`, { minimumSets: 1 }),
    completedDosage: normalizeDosage(required(source, 'completedDosage', path), `${path}.completedDosage`),
    formAccurate: source.formAccurate === null ? null : boolean(required(source, 'formAccurate', path), `${path}.formAccurate`),
    lowerBodyRecoveryWithoutGripping: source.lowerBodyRecoveryWithoutGripping === null
      ? null
      : boolean(required(source, 'lowerBodyRecoveryWithoutGripping', path), `${path}.lowerBodyRecoveryWithoutGripping`),
    supportUsed: boolean(required(source, 'supportUsed', path), `${path}.supportUsed`),
    cameraVerification: enumValue(required(source, 'cameraVerification', path), CAMERA_VERIFICATION, `${path}.cameraVerification`),
    safetyEvents: stringArray(required(source, 'safetyEvents', path), `${path}.safetyEvents`),
  };
  if (result.completedAt < result.startedAt) fail(`${path}.completedAt`, 'cannot precede startedAt');
  if (!CATALOG_BY_ID[result.exerciseId]?.variants.some((variant) => variant.variantId === result.variantId && variant.level === result.level)) {
    fail(`${path}.variantId`, 'does not match the canonical exercise and level');
  }
  if (result.cameraVerification === 'FULL' && result.source !== 'LIVE_POSE') fail(`${path}.source`, 'FULL camera verification requires LIVE_POSE');
  if (result.cameraVerification !== 'FULL' && result.source !== 'USER_CONFIRMED') fail(`${path}.source`, 'partial/manual exercises require USER_CONFIRMED');
  return result;
}

function applyProfessionalApproval(planValue, approvalValue) {
  const plan = normalizeOtagoPrescriptionPlan(planValue);
  if (plan.riskLevel !== 'HIGH') fail('exercisePrescription.plan.riskLevel', 'professional approval applies only to HIGH plans');
  if (plan.status !== 'PENDING_PROFESSIONAL_REVIEW') fail('exercisePrescription.plan.status', 'must be pending review');
  const approval = normalizeProfessionalApproval(approvalValue);
  if (approval.status !== 'APPROVED') fail('professionalApproval.status', 'must be APPROVED');
  return normalizeOtagoPrescriptionPlan({
    ...plan,
    status: 'ACTIVE',
    requiresProfessionalReview: false,
    professionalApproval: approval,
  });
}

function applyProgressionApproval(planValue, proposalId, approvalValue) {
  const plan = normalizeOtagoPrescriptionPlan(planValue);
  const approval = normalizeProgressionApproval(approvalValue);
  if (!approval) fail('approval', 'is required');
  let found = false;
  const progressionProposals = plan.progressionProposals.map((proposal) => {
    if (proposal.proposalId !== proposalId) return proposal;
    found = true;
    if (proposal.status !== 'PENDING_APPROVAL') fail('progressionProposal.status', 'must be PENDING_APPROVAL');
    return { ...proposal, status: 'APPROVED', approval };
  });
  if (!found) fail('proposalId', 'does not identify a plan progression proposal');
  return normalizeOtagoPrescriptionPlan({ ...plan, progressionProposals });
}

module.exports = {
  OTAGO_PRESCRIPTION_SCHEMA_VERSION,
  OTAGO_CATALOG_VERSION,
  EXERCISE_SESSION_RESULT_SCHEMA_VERSION,
  EXERCISE_IDS,
  VULNERABILITY_IDS,
  LEVELS,
  CATEGORIES,
  SUPPORT_REQUIREMENTS,
  WEIGHT_MODES,
  CAMERA_VERIFICATION,
  normalizeOtagoPrescriptionPlan,
  normalizeExerciseSessionResult,
  normalizeProgressionProposal,
  normalizeProfessionalApproval,
  normalizeProgressionApproval,
  applyProfessionalApproval,
  applyProgressionApproval,
};
