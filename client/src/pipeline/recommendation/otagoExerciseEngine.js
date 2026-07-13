import stage3Catalog from '../../../../shared/stage3ExerciseCatalog.json';
import {
  FUZZY_TOPSIS_ALGORITHM_VERSION,
  FUZZY_TOPSIS_FUNCTION_EXERCISE_TABLE,
  rankOtagoExercisesWithFuzzyTopsis,
} from './fuzzyTopsisRecommender.js';

export const FUZZY_TOPSIS_OTAGO_ENGINE_VERSION = 'fuzzy_topsis_otago_engine.v1';
export const STAGE3_PRESCRIPTION_SCHEMA_VERSION = 'otago_prescription.v1';
export const STAGE3_PROGRESSION_SCHEMA_VERSION = 'stage3_progression_decision.v1';

export const ExerciseCategories = Object.freeze({
  Warmup: 'WARMUP',
  Strength: 'STRENGTH',
  Balance: 'BALANCE',
  Walking: 'WALKING',
});

export const ExerciseProgressionDecisions = Object.freeze({
  Maintain: 'MAINTAIN',
  ProgressionEligible: 'PROGRESSION_PROPOSED',
  ProgressionProposed: 'PROGRESSION_PROPOSED',
  RegressionRequired: 'REGRESSION_REQUIRED',
  ProfessionalReviewRequired: 'PROFESSIONAL_REVIEW_REQUIRED',
});

export const OtagoExerciseIds = Object.freeze({
  W1: 'W1', W2: 'W2', W3: 'W3', W4: 'W4', W5: 'W5',
  S1: 'S1', S2: 'S2', S3: 'S3', S4: 'S4', S5: 'S5',
  B1: 'B1', B2: 'B2', B3: 'B3', B4: 'B4', B5: 'B5', B6: 'B6',
  B7: 'B7', B8: 'B8', B9: 'B9', B10: 'B10', B11: 'B11', B12: 'B12',
  Walking: 'WALK',
  FrontKneeStrengthening: 'S1',
  BackKneeStrengthening: 'S2',
  SideHipStrengthening: 'S3',
  CalfRaises: 'S4',
  ToeRaises: 'S5',
  KneeBends: 'B1',
  TandemStance: 'B5',
  OneLegStand: 'B7',
  SitToStand: 'B11',
});

const LEVEL_RANK = Object.freeze({ A: 0, B: 1, C: 2, D: 3 });
const SUPPORT_RANK = Object.freeze({ TWO_HAND: 0, ONE_HAND: 1, WALKING_AID: 1, STABLE_SUPPORT: 1, NONE: 2 });
const CANONICAL_WARMUP_IDS = Object.freeze(['W1', 'W2', 'W3', 'W4', 'W5']);
const WEIGHTED_STRENGTH_IDS = Object.freeze(['S1', 'S2', 'S3']);
const SUPPORTED_BODYWEIGHT_STRENGTH_IDS = Object.freeze(['S4', 'S5']);
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function normalizedVariant(exercise, variant) {
  const balanceDefaults = stage3Catalog.balanceDefaults;
  return {
    ...variant,
    weight: variant.weight || balanceDefaults.weight,
    tempo: variant.tempo || balanceDefaults.tempo,
    breathing: variant.breathing || balanceDefaults.breathing,
    rest: variant.rest || balanceDefaults.rest,
    cameraVerification: variant.cameraVerification
      || balanceDefaults.cameraByExerciseId[exercise.exerciseId]
      || { mode: 'MANUAL_ONLY', autoCount: false },
  };
}

export const STAGE3_EXERCISE_CATALOG = deepFreeze(stage3Catalog.exercises.map((exercise) => {
  const variants = exercise.variants.map((variant) => normalizedVariant(exercise, variant));
  const first = variants[0];
  return {
    ...exercise,
    displayName: exercise.nameEn,
    otagoSourceName: exercise.nameEn,
    variants,
    availableLevels: variants.map((variant) => ({
      ...variant,
      repetitions: variant.dosage.repetitions ?? variant.dosage.steps ?? null,
      sets: variant.dosage.sets ?? 1,
      cameraVerification: variant.cameraVerification.mode,
    })),
    repetitions: first.dosage.repetitions ?? first.dosage.steps ?? null,
    sets: first.dosage.sets ?? 1,
    supportRequirement: first.supportRequirement,
    weight: first.weight.type,
    tempo: first.tempo,
    breathing: first.breathing,
    rest: first.rest,
    cameraVerification: first.cameraVerification.mode,
    cameraVerifiable: first.cameraVerification.mode === 'FULL',
  };
}));

export const OTAGO_EXERCISE_CATALOG = STAGE3_EXERCISE_CATALOG;
const CATALOG_BY_ID = new Map(STAGE3_EXERCISE_CATALOG.map((exercise) => [exercise.exerciseId, exercise]));
const FUNCTION_EXERCISE_LINKS_BY_ID = new Map(
  FUZZY_TOPSIS_FUNCTION_EXERCISE_TABLE.map((row) => [row.functionId, row.links]),
);

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function stableHash(value) {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function professionalApprovalValue(value, riskLevel) {
  if (riskLevel !== 'HIGH') return { status: 'NOT_REQUIRED', approvalId: null, approvedByRole: null, approvedAt: null };
  if (
    value?.status === 'APPROVED'
    && value.approvalId
    && value.approvedByRole === 'PROFESSIONAL'
    && Number.isFinite(value.approvedAt)
  ) return { status: 'APPROVED', approvalId: value.approvalId, approvedByRole: 'PROFESSIONAL', approvedAt: value.approvedAt };
  return { status: 'PENDING', approvalId: null, approvedByRole: null, approvedAt: null };
}

function canonicalVulnerabilityAssessment(vulnerabilityAssessment) {
  const source = vulnerabilityAssessment?.activeIds ? vulnerabilityAssessment : { activeIds: [], evidence: [] };
  const activeIds = unique(source?.activeIds || []).filter((id) => FUNCTION_EXERCISE_LINKS_BY_ID.has(id)).sort();
  return { ...source, activeIds, evidence: source?.evidence || [] };
}

function variantById(exercise, variantId) {
  return exercise?.variants.find((variant) => variant.variantId === variantId) || null;
}

function lowerVariant(first, second) {
  if (!first) return second;
  if (!second) return first;
  const firstLevel = LEVEL_RANK[first.level] ?? 99;
  const secondLevel = LEVEL_RANK[second.level] ?? 99;
  if (firstLevel !== secondLevel) return firstLevel < secondLevel ? first : second;
  return (SUPPORT_RANK[first.supportRequirement] ?? 99) <= (SUPPORT_RANK[second.supportRequirement] ?? 99) ? first : second;
}

function cappedVariant(exercise, requested, { riskLevel, forceLowest }) {
  if (forceLowest) return exercise.variants[0];
  if (exercise.category === ExerciseCategories.Balance) {
    const maxLevel = riskLevel === 'LOW' ? 'B' : 'A';
    const candidates = exercise.variants.filter((variant) => (LEVEL_RANK[variant.level] ?? 99) <= LEVEL_RANK[maxLevel]);
    return candidates.includes(requested) ? requested : candidates.at(-1) || exercise.variants[0];
  }
  if (exercise.category === ExerciseCategories.Strength && ['S1', 'S2', 'S3'].includes(exercise.exerciseId)) {
    const maxLevel = riskLevel === 'LOW' ? 'C' : riskLevel === 'MODERATE' ? 'B' : 'A';
    const candidates = exercise.variants.filter((variant) => (LEVEL_RANK[variant.level] ?? 99) <= LEVEL_RANK[maxLevel]);
    return candidates.includes(requested) ? requested : candidates.at(-1) || exercise.variants[0];
  }
  return requested;
}

function safetyAdmittedCandidatesFromFunctionTable(vulnerabilityAssessment, riskLevel, currentPlan = null) {
  const candidates = new Map();
  const forceLowest = vulnerabilityAssessment.activeIds.includes('V6');
  for (const vulnerabilityId of vulnerabilityAssessment.activeIds) {
    for (const mapping of FUNCTION_EXERCISE_LINKS_BY_ID.get(vulnerabilityId) || []) {
      const exercise = CATALOG_BY_ID.get(mapping.exerciseId);
      const currentExercise = vulnerabilityId === 'V9'
        ? currentPlan?.selectedExercises?.find((item) => item.exerciseId === mapping.exerciseId)
        : null;
      const requested = variantById(exercise, currentExercise?.variantId || mapping.variantId);
      if (!exercise || !requested) continue;
      const existing = candidates.get(exercise.exerciseId) || { exercise, requested: null, vulnerabilityIds: [], modifiers: [] };
      existing.requested = lowerVariant(existing.requested, requested);
      existing.vulnerabilityIds.push(vulnerabilityId);
      existing.modifiers.push(mapping);
      candidates.set(exercise.exerciseId, existing);
    }
  }
  return [...candidates.values()].map((candidate) => ({
    ...candidate,
    selected: cappedVariant(candidate.exercise, candidate.requested, { riskLevel, forceLowest }),
  }));
}

function supervisionFor({ riskLevel, vulnerabilityIds }) {
  if (riskLevel === 'HIGH') return 'PROFESSIONAL_REVIEW_REQUIRED';
  if (riskLevel === 'MODERATE' || vulnerabilityIds.includes('V7')) return 'CAREGIVER_RECOMMENDED';
  return 'NONE';
}

function flatPrescribedExercise(exercise, selected, {
  reasonVulnerabilityIds = [],
  weakSideExtraSets = 0,
  forceNoWeight = false,
} = {}) {
  const dosage = selected.dosage || {};
  const tempoUp = Array.isArray(selected.tempo?.concentricSeconds) ? selected.tempo.concentricSeconds : [null, null];
  const tempoDown = Array.isArray(selected.tempo?.eccentricSeconds) ? selected.tempo.eccentricSeconds : [null, null];
  const loadKg = Array.isArray(selected.weight?.loadKg) ? selected.weight.loadKg : [null, null];
  const perSide = dosage.perSide === true;
  return {
    exerciseId: exercise.exerciseId,
    displayName: exercise.nameEn,
    category: exercise.category,
    level: selected.level,
    variantId: selected.variantId,
    repetitions: perSide ? null : dosage.repetitions ?? null,
    sets: dosage.sets ?? 1,
    repetitionsPerSide: perSide ? dosage.repetitions ?? null : null,
    steps: dosage.steps ?? null,
    holdSeconds: dosage.holdSeconds ?? null,
    supportRequirement: selected.supportRequirement,
    weightMode: forceNoWeight ? 'NONE' : selected.weight.type,
    weightMinKg: forceNoWeight ? null : loadKg[0],
    weightMaxKg: forceNoWeight ? null : loadKg[1],
    tempoUpMinSeconds: tempoUp[0],
    tempoUpMaxSeconds: tempoUp[1],
    tempoDownMinSeconds: tempoDown[0],
    tempoDownMaxSeconds: tempoDown[1],
    breathingRule: selected.breathing,
    restMinSeconds: selected.rest.minimumSeconds,
    restMaxSeconds: selected.rest.maximumSeconds,
    cameraVerification: selected.cameraVerification.mode,
    reasonVulnerabilityIds: unique(reasonVulnerabilityIds).sort(),
    weakSideExtraSets,
  };
}

function selectedExercise(candidate, context) {
  const { exercise, selected, modifiers } = candidate;
  const vulnerabilityIds = unique(candidate.vulnerabilityIds).sort();
  return flatPrescribedExercise(exercise, selected, {
    reasonVulnerabilityIds: vulnerabilityIds,
    weakSideExtraSets: Math.max(0, ...modifiers.map((item) => item.weakSideAdditionalSets || 0)),
    forceNoWeight: context.riskLevel === 'HIGH',
  });
}

function sourceIds(vulnerabilityAssessment, explicit = []) {
  return {
    assessmentIds: unique(explicit.map((assessment) => assessment.assessmentId)),
    resultIds: unique([
      ...explicit.map((assessment) => assessment.resultId),
      ...(vulnerabilityAssessment.evidence || []).map((evidence) => evidence.sourceResultId),
    ]),
  };
}

function walkingPlan() {
  const exercise = CATALOG_BY_ID.get('WALK');
  const variant = exercise.variants[0];
  return {
    exerciseId: exercise.exerciseId,
    category: 'WALKING',
    targetMinutes: variant.dosage.maximumMinutes,
    splitMinutes: variant.dosage.splitMinutes,
    weeklyFrequency: stage3Catalog.program.walkingFrequencyPerWeek,
    pace: variant.dosage.pace,
    cameraVerification: variant.cameraVerification.mode,
    requiresStrengthAndBalance: true,
  };
}

function warmupExercises() {
  return CANONICAL_WARMUP_IDS.map((exerciseId) => {
    const exercise = CATALOG_BY_ID.get(exerciseId);
    return flatPrescribedExercise(exercise, exercise.variants[0]);
  });
}

function validatePlan(plan) {
  const failures = [];
  const ids = plan.selectedExercises.map((exercise) => exercise.exerciseId);
  if (new Set(ids).size !== ids.length) failures.push({ code: 'DUPLICATE_EXERCISE' });
  if (
    plan.warmups.length !== CANONICAL_WARMUP_IDS.length
    || plan.warmups.some((exercise, index) => exercise.exerciseId !== CANONICAL_WARMUP_IDS[index])
  ) failures.push({ code: 'CANONICAL_WARMUPS_REQUIRED' });
  if (
    plan.status === 'BLOCKED'
    && (plan.selectedExercises.length > 0 || plan.walkingPlan !== null || plan.progressionProposals.length > 0)
  ) failures.push({ code: 'BLOCKED_PLAN_EXPOSES_EXECUTABLE_CONTENT' });
  if (plan.riskLevel === 'HIGH') {
    if (plan.selectedExercises.some((exercise) => exercise.category === 'BALANCE' && exercise.level !== 'A')) failures.push({ code: 'HIGH_BALANCE_ABOVE_LEVEL_A' });
    if (plan.selectedExercises.some((exercise) => WEIGHTED_STRENGTH_IDS.includes(exercise.exerciseId) && (exercise.level !== 'A' || exercise.weightMode !== 'NONE'))) failures.push({ code: 'HIGH_WEIGHTED_STRENGTH_NOT_LEVEL_A_NO_WEIGHT' });
    if (plan.selectedExercises.some((exercise) => SUPPORTED_BODYWEIGHT_STRENGTH_IDS.includes(exercise.exerciseId) && (exercise.level !== 'C' || exercise.supportRequirement !== 'STABLE_SUPPORT' || exercise.weightMode !== 'NONE'))) failures.push({ code: 'HIGH_BODYWEIGHT_STRENGTH_NOT_SUPPORTED_LEVEL_C' });
    if (plan.walkingPlan !== null) failures.push({ code: 'HIGH_WALKING_PLAN_NOT_ALLOWED' });
    if (plan.progressionProposals.length > 0) failures.push({ code: 'HIGH_PROGRESSION_NOT_ALLOWED' });
    if (plan.professionalApproval.status !== 'APPROVED' && plan.status !== 'PENDING_PROFESSIONAL_REVIEW') failures.push({ code: 'HIGH_NOT_BLOCKED_PENDING_REVIEW' });
  }
  return { ok: failures.length === 0, failures };
}

export function createFuzzyTopsisOtagoExercisePlan({
  userId = 'anonymous-user',
  vulnerabilityAssessment = null,
  steadiScore = null,
  riskLevel = null,
  sourceAssessments = [],
  professionalApproval = null,
  sessionResults = [],
  currentPlan = null,
  currentExercisePlan = null,
  currentPrescription = null,
} = {}) {
  const resolvedRisk = riskLevel || steadiScore?.riskLevel || 'NOT_SCORABLE';
  const vulnerabilities = canonicalVulnerabilityAssessment(vulnerabilityAssessment);
  const requestedApproval = professionalApprovalValue(professionalApproval, resolvedRisk);
  const isHigh = resolvedRisk === 'HIGH';
  const invalidSource = sourceAssessments.some((assessment) => (
    (assessment.status && assessment.status !== 'VALID')
    || (assessment.metadata?.source && assessment.metadata.source !== 'LIVE_POSE')
    || assessment.metadata?.isClinicallyScorable === false
  ));
  const approval = isHigh && invalidSource
    ? { status: 'PENDING', approvalId: null, approvedByRole: null, approvedAt: null }
    : requestedApproval;
  const highApproved = isHigh && !invalidSource && approval.status === 'APPROVED';
  const supervisionRequirement = supervisionFor({ riskLevel: resolvedRisk, vulnerabilityIds: vulnerabilities.activeIds });
  const context = { riskLevel: resolvedRisk, supervisionRequirement };
  const previousPlan = currentPlan || currentExercisePlan || currentPrescription?.plan || currentPrescription || null;
  const admittedExercises = !invalidSource && ['LOW', 'MODERATE', 'HIGH'].includes(resolvedRisk)
    ? safetyAdmittedCandidatesFromFunctionTable(vulnerabilities, resolvedRisk, previousPlan).map((candidate) => selectedExercise(candidate, context))
    : [];
  const recommendationRanking = rankOtagoExercisesWithFuzzyTopsis({
    prescribedExercises: admittedExercises,
    vulnerabilityAssessment: vulnerabilities,
    riskLevel: resolvedRisk,
  });
  const exerciseById = new Map(admittedExercises.map((exercise) => [exercise.exerciseId, exercise]));
  const selectedExercises = recommendationRanking.items
    .map((ranking) => exerciseById.get(ranking.exerciseId))
    .filter(Boolean);
  const noPrescription = selectedExercises.length === 0;
  const status = isHigh
    ? highApproved ? 'ACTIVE' : 'PENDING_PROFESSIONAL_REVIEW'
    : invalidSource || resolvedRisk === 'NOT_SCORABLE' || noPrescription
      ? 'BLOCKED'
      : 'ACTIVE';
  const planId = `exercise-plan-${stableHash({
    userId,
    resolvedRisk,
    vulnerabilityIds: vulnerabilities.activeIds,
    selectedVariants: selectedExercises.map((exercise) => [exercise.exerciseId, exercise.variantId]),
  })}`;
  const ids = sourceIds(vulnerabilities, sourceAssessments);
  const progressionProposals = status === 'ACTIVE'
    ? selectedExercises.map((exercise) => evaluateExerciseProgression({
      sessionResults: sessionResults.filter((result) => result.planId === planId),
      prescriptionExercise: exercise,
      currentRiskLevel: resolvedRisk,
      planId,
    }).proposal).filter(Boolean)
    : [];
  const plan = {
    schemaVersion: STAGE3_PRESCRIPTION_SCHEMA_VERSION,
    catalogVersion: stage3Catalog.catalogVersion,
    planId,
    userId,
    riskLevel: resolvedRisk,
    status,
    vulnerabilityIds: vulnerabilities.activeIds,
    warmups: warmupExercises(),
    selectedExercises,
    walkingPlan: selectedExercises.length && !isHigh ? walkingPlan() : null,
    supervisionRequirement,
    caregiverRecommendedDays: resolvedRisk === 'MODERATE' || vulnerabilities.activeIds.includes('V7') ? 14 : 0,
    requiresProfessionalReview: isHigh && !highApproved,
    professionalApproval: approval,
    progressionProposals,
    safetyNotices: unique([
      isHigh ? 'HIGH_RISK_PROFESSIONAL_REVIEW_REQUIRED' : null,
      resolvedRisk === 'MODERATE' ? 'MODERATE_FIRST_TWO_WEEKS_CAREGIVER_RECOMMENDED' : null,
      vulnerabilities.activeIds.includes('V6') ? 'V6_PROFESSIONAL_CONSULTATION_REQUIRED' : null,
      vulnerabilities.activeIds.includes('V7') ? 'V7_SUPPORTED_SUPERVISED_PERFORMANCE_RECOMMENDED' : null,
      invalidSource ? 'INVALID_ASSESSMENT_BLOCKED' : null,
    ]),
    generatedByRuleVersion: FUZZY_TOPSIS_OTAGO_ENGINE_VERSION,
    sourceAssessmentIds: ids.assessmentIds,
    sourceResultIds: ids.resultIds,
    decisionTrace: unique([
      `RISK_${resolvedRisk}`,
      ...vulnerabilities.activeIds.map((id) => `VULNERABILITY_${id}`),
      selectedExercises.length ? `RANKED_${FUZZY_TOPSIS_ALGORITHM_VERSION}` : null,
      status === 'ACTIVE' ? 'PRESCRIPTION_ACTIVE' : status,
    ]),
  };
  const validation = validatePlan(plan);
  if (invalidSource) {
    validation.ok = false;
    validation.failures.push({
      code: sourceAssessments.some((assessment) => assessment.metadata?.source && assessment.metadata.source !== 'LIVE_POSE')
        ? 'NON_LIVE_ASSESSMENT_EXERCISE_PLAN'
        : 'INVALID_OR_NON_CLINICAL_ASSESSMENT',
    });
  }
  return { value: plan, validation, recommendationRanking };
}

function nextVariant(exercise, currentVariantId) {
  const index = exercise?.variants.findIndex((variant) => variant.variantId === currentVariantId) ?? -1;
  return index >= 0 ? exercise.variants[index + 1] || null : null;
}

function exactSessionCompletion(result, prescriptionExercise, completionMinimum = null, expectedPlanId = null) {
  const expected = {
    repetitions: prescriptionExercise.repetitions,
    sets: prescriptionExercise.sets,
    repetitionsPerSide: prescriptionExercise.repetitionsPerSide,
    steps: prescriptionExercise.steps,
    holdSeconds: prescriptionExercise.holdSeconds,
  };
  const requiredCompleted = completionMinimum || expected;
  const prescribed = result.prescribedDosage || {};
  const completed = result.completedDosage || {};
  const prescribedMatches = Object.entries(expected).every(([key, value]) => prescribed[key] === value);
  const completedMatches = completed.sets >= requiredCompleted.sets
    && (requiredCompleted.repetitions === null || completed.repetitions >= requiredCompleted.repetitions)
    && (requiredCompleted.repetitionsPerSide === null || completed.repetitionsPerSide >= requiredCompleted.repetitionsPerSide)
    && (requiredCompleted.steps === null || completed.steps >= requiredCompleted.steps)
    && (requiredCompleted.holdSeconds === null || completed.holdSeconds >= requiredCompleted.holdSeconds);
  const sourceMatches = prescriptionExercise.cameraVerification === 'FULL'
    ? result.source === 'LIVE_POSE' && result.cameraVerification === 'FULL'
    : result.source === 'USER_CONFIRMED' && result.cameraVerification === prescriptionExercise.cameraVerification;
  return result.status === 'COMPLETED'
    && result.planId
    && (!expectedPlanId || result.planId === expectedPlanId)
    && result.exerciseId === prescriptionExercise.exerciseId
    && result.variantId === prescriptionExercise.variantId
    && result.level === prescriptionExercise.level
    && prescribedMatches
    && completedMatches
    && sourceMatches
    && result.formAccurate === true
    && Array.isArray(result.safetyEvents)
    && result.safetyEvents.length === 0;
}

export function evaluateExerciseProgression({
  sessionResults = [],
  prescriptionExercise = null,
  currentRiskLevel = 'NOT_SCORABLE',
  professionalReassessmentApproved = false,
  planId = null,
} = {}) {
  const maintain = (reasonCodes) => ({ schemaVersion: STAGE3_PROGRESSION_SCHEMA_VERSION, decision: ExerciseProgressionDecisions.Maintain, proposal: null, reasonCodes });
  if (!prescriptionExercise) return maintain(['MISSING_PRESCRIBED_EXERCISE']);
  if (!['S1', 'S2', 'S3', 'S4', 'S5', 'B1', 'B5', 'B7', 'B11'].includes(prescriptionExercise.exerciseId)) {
    return maintain(['CAMERA_VERIFICATION_NOT_AVAILABLE_FOR_AUTOMATIC_PROGRESSION']);
  }
  const exercise = CATALOG_BY_ID.get(prescriptionExercise.exerciseId);
  const isWeightedStrength = ['S1', 'S2', 'S3'].includes(prescriptionExercise.exerciseId);
  const target = isWeightedStrength
    ? variantById(exercise, prescriptionExercise.variantId)
    : nextVariant(exercise, prescriptionExercise.variantId);
  if (!target) return maintain(['HIGHEST_CATALOG_VARIANT_REACHED']);
  if (currentRiskLevel === 'HIGH' && !professionalReassessmentApproved) {
    return { schemaVersion: STAGE3_PROGRESSION_SCHEMA_VERSION, decision: ExerciseProgressionDecisions.ProfessionalReviewRequired, proposal: null, reasonCodes: ['HIGH_REQUIRES_PROFESSIONAL_REASSESSMENT_FOR_PROGRESSION'] };
  }
  const relevant = [...sessionResults]
    .filter((result) => result.exerciseId === prescriptionExercise.exerciseId && result.variantId === prescriptionExercise.variantId)
    .sort((first, second) => Number(second.completedAt || 0) - Number(first.completedAt || 0));
  const distinct = [];
  const seen = new Set();
  for (const result of relevant) {
    if (!result.exerciseSessionId || seen.has(result.exerciseSessionId)) continue;
    seen.add(result.exerciseSessionId);
    distinct.push(result);
  }
  const qualifying = distinct.slice(0, 2);
  const qualificationDosage = isWeightedStrength ? {
    repetitions: null,
    sets: 2,
    repetitionsPerSide: 10,
    steps: null,
    holdSeconds: null,
  } : null;
  const qualifyingPlanId = planId || qualifying[0]?.planId || null;
  if (
    qualifying.length !== 2
    || qualifying.some((result) => result.planId !== qualifyingPlanId)
    || qualifying.some((result) => !exactSessionCompletion(result, prescriptionExercise, qualificationDosage, qualifyingPlanId))
  ) {
    return maintain(['TWO_CONSECUTIVE_EXACT_SESSIONS_NOT_COMPLETED']);
  }
  if (exercise.category === ExerciseCategories.Balance && target.supportRequirement === 'NONE') {
    const lowerBodyRecoveryConfirmed = qualifying.every((result) => result.lowerBodyRecoveryWithoutGripping === true && result.supportUsed === false);
    if (!lowerBodyRecoveryConfirmed) return maintain(['LOWER_BODY_RECOVERY_WITHOUT_GRIPPING_NOT_CONFIRMED']);
  }
  const qualifyingSessionIds = qualifying.map((result) => result.exerciseSessionId);
  const proposal = {
    proposalId: `progression-${stableHash({ planId: qualifying[0].planId, exerciseId: exercise.exerciseId, from: prescriptionExercise.variantId, to: target.variantId, qualifyingSessionIds })}`,
    exerciseId: exercise.exerciseId,
    fromLevel: prescriptionExercise.level,
    toLevel: target.level,
    fromVariantId: prescriptionExercise.variantId,
    toVariantId: target.variantId,
    progressionType: isWeightedStrength
      ? 'INCREASE_WEIGHT'
      : ['S4', 'S5'].includes(exercise.exerciseId)
        ? 'REMOVE_SUPPORT'
        : target.supportRequirement === prescriptionExercise.supportRequirement
          && (target.dosage?.sets ?? 1) > prescriptionExercise.sets
          ? 'INCREASE_SETS'
          : 'ADVANCE_VARIANT',
    weightIncrementMinKg: isWeightedStrength ? 0.5 : null,
    weightIncrementMaxKg: isWeightedStrength ? 1 : null,
    status: 'PENDING_APPROVAL',
    qualifyingSessionIds,
    approval: null,
  };
  return { schemaVersion: STAGE3_PROGRESSION_SCHEMA_VERSION, decision: ExerciseProgressionDecisions.ProgressionProposed, proposal, reasonCodes: ['TWO_CONSECUTIVE_EXACT_SESSIONS_COMPLETED', 'USER_OR_RESPONSIBLE_CAREGIVER_APPROVAL_REQUIRED'] };
}

export function applyExerciseProgressionApproval({ proposal, approval, apply = false } = {}) {
  if (!proposal || proposal.status !== 'PENDING_APPROVAL') throw new Error('A pending progression proposal is required');
  if (!['USER', 'CAREGIVER_OR_RESPONSIBLE'].includes(approval?.actor)) throw new Error('Progression approval actor must be USER or CAREGIVER_OR_RESPONSIBLE');
  if (!approval.approvedBy || !Number.isFinite(approval.approvedAt)) throw new Error('Progression approval requires approvedBy and approvedAt');
  return {
    ...proposal,
    status: apply ? 'APPLIED' : 'APPROVED',
    approval: {
      actor: approval.actor,
      approvedBy: approval.approvedBy,
      approvedAt: approval.approvedAt,
    },
  };
}
