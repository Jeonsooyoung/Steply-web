import recommendationTables from '../../../../shared/fuzzyTopsisRecommendationTables.json';

export const FUZZY_TOPSIS_RANKING_SCHEMA_VERSION = 'fuzzy_topsis_ranking.v1';
export const FUZZY_TOPSIS_ALGORITHM_VERSION = recommendationTables.algorithmVersion;
export const FUZZY_TOPSIS_EXERCISE_INFORMATION_TABLE = Object.freeze(recommendationTables.exerciseInformationTable);
export const FUZZY_TOPSIS_FUNCTION_EXERCISE_TABLE = Object.freeze(recommendationTables.functionExerciseConnectionTable);

const CRITERIA = Object.freeze(recommendationTables.criteria);
const INFO_BY_EXERCISE = new Map(FUZZY_TOPSIS_EXERCISE_INFORMATION_TABLE.map((item) => [item.exerciseId, item]));
const FUNCTION_BY_ID = new Map(FUZZY_TOPSIS_FUNCTION_EXERCISE_TABLE.map((item) => [item.functionId, item]));
const BALANCE_FUNCTION_IDS = Object.freeze(['V1', 'V2', 'V7', 'V8']);
const STRENGTH_FUNCTION_IDS = Object.freeze(['V3', 'V4', 'V5', 'V6']);
const ENDURANCE_FUNCTION_IDS = Object.freeze(['V3', 'V4', 'V6']);

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value) {
  if (!finite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value, digits = 4) {
  if (!finite(value)) return 0;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function average(values = []) {
  const valid = values.filter(finite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function activeAscending(value, threshold, highAt) {
  if (!finite(value)) return null;
  if (highAt <= threshold) return value >= threshold ? 1 : 0;
  return clamp01(0.4 + 0.6 * ((value - threshold) / (highAt - threshold)));
}

function activeDescending(value, threshold, severeAt = 0) {
  if (!finite(value)) return null;
  if (threshold <= severeAt) return value <= threshold ? 1 : 0;
  return clamp01(0.4 + 0.6 * ((threshold - value) / (threshold - severeAt)));
}

function evidenceFor(vulnerabilityAssessment, vulnerabilityId) {
  const matches = (vulnerabilityAssessment?.evidence || [])
    .filter((item) => item?.vulnerabilityId === vulnerabilityId)
    .map((item) => item.measurements || {});
  return Object.assign({}, ...matches);
}

function minimumFinite(values = []) {
  const valid = values.filter(finite);
  return valid.length ? Math.min(...valid) : null;
}

export function fuzzySeverityForVulnerability(vulnerabilityId, measurements = {}) {
  let values = [];
  switch (vulnerabilityId) {
    case 'V1':
      values = [
        activeDescending(measurements.tandemHoldSeconds, 10, 0),
        activeAscending(measurements.initialToStaticRatio, 1.5, 2.5),
      ];
      break;
    case 'V2':
      values = [
        activeDescending(minimumFinite([measurements.tandemHoldSeconds, measurements.semiTandemHoldSeconds]), 10, 0),
        activeAscending(measurements.mlToApRatio, 1.3, 2.2),
      ];
      break;
    case 'V3': {
      const cutoff = measurements.cdcCutoff;
      const completed = measurements.completedRepetitions;
      const gapRatio = finite(cutoff) && cutoff > 0 && finite(completed)
        ? clamp01((cutoff - completed) / cutoff)
        : null;
      values = [finite(gapRatio) ? 0.4 + 0.6 * gapRatio : null];
      break;
    }
    case 'V4':
      values = [activeAscending(measurements.lateSlowdownRatio, 0.20, 0.50)];
      break;
    case 'V5':
      values = [activeAscending(measurements.maxTrunkLeanDegrees, 30, 50)];
      break;
    case 'V6':
      values = [1];
      break;
    case 'V7':
      values = [activeDescending(minimumFinite([measurements.sideBySideHoldSeconds, measurements.semiTandemHoldSeconds]), 10, 0)];
      break;
    case 'V8':
      values = [activeDescending(measurements.oneLegHoldSeconds, 10, 0)];
      break;
    case 'V9':
      values = [
        activeAscending(measurements.asymmetryRatio, 0.15, 0.35),
        activeAscending(measurements.repeatCount, 3, 6),
      ];
      break;
    default:
      return 0;
  }
  return round(average(values) ?? 0.6);
}

function severityLabel(degree) {
  if (degree >= 0.75) return 'HIGH';
  if (degree >= 0.55) return 'MEDIUM';
  return 'LOW';
}

export function createFuzzyDeficitProfile(vulnerabilityAssessment = {}) {
  const activeIds = [...new Set(vulnerabilityAssessment.activeIds || [])].filter((id) => FUNCTION_BY_ID.has(id)).sort();
  return activeIds.map((vulnerabilityId) => {
    const measurements = evidenceFor(vulnerabilityAssessment, vulnerabilityId);
    const degree = fuzzySeverityForVulnerability(vulnerabilityId, measurements);
    return {
      vulnerabilityId,
      functionNameKo: FUNCTION_BY_ID.get(vulnerabilityId).functionNameKo,
      degree,
      fuzzyLevel: severityLabel(degree),
      measurements,
    };
  });
}

function normalizedSide(value) {
  const side = String(value || '').toUpperCase();
  return ['LEFT', 'RIGHT'].includes(side) ? side : 'UNDETERMINED';
}

function affectedSideFrom(vulnerabilityAssessment) {
  const measurements = evidenceFor(vulnerabilityAssessment, 'V9');
  const confidence = finite(measurements.sideConfidence) ? clamp01(measurements.sideConfidence) : 0;
  const side = normalizedSide(
    measurements.suspectedWeakerSide
      || measurements.slowerKneeExtensionSide
      || measurements.affectedSide,
  );
  return {
    side: confidence >= 0.67 ? side : 'UNDETERMINED',
    observedSide: side,
    confidence: round(confidence),
  };
}

function relevance(functionId, exerciseId) {
  return FUNCTION_BY_ID.get(functionId)?.links.find((link) => link.exerciseId === exerciseId)?.relevance || 0;
}

function degreeById(profile) {
  return new Map(profile.map((item) => [item.vulnerabilityId, item.degree]));
}

function maxDegree(degrees, ids) {
  return Math.max(0, ...ids.map((id) => degrees.get(id) || 0));
}

function deficitMatch(exerciseId, profile) {
  const denominator = profile.reduce((sum, item) => sum + item.degree, 0);
  if (!denominator) return 0;
  return clamp01(profile.reduce((sum, item) => (
    sum + item.degree * relevance(item.vulnerabilityId, exerciseId)
  ), 0) / denominator);
}

function sideMatch(exerciseInfo, profile, affectedSide) {
  const hasAsymmetry = profile.some((item) => item.vulnerabilityId === 'V9');
  if (!hasAsymmetry) return 0.75;
  const v9Relevance = relevance('V9', exerciseInfo.exerciseId);
  if (!v9Relevance) return 0.60;
  if (exerciseInfo.sideMode !== 'PER_SIDE') return 0.55 + 0.20 * v9Relevance;
  return affectedSide.side === 'UNDETERMINED' ? 0.72 : 1;
}

function exerciseDifficulty(exercise, exerciseInfo) {
  const value = exerciseInfo.difficultyByLevel?.[exercise.level];
  return finite(value) ? clamp01(value) : 0.5;
}

function safetyAndAbility({ exercise, exerciseInfo, degrees }) {
  const balanceDeficit = maxDegree(degrees, BALANCE_FUNCTION_IDS);
  const strengthDeficit = maxDegree(degrees, STRENGTH_FUNCTION_IDS);
  const balanceAbility = clamp01(1 - 0.70 * balanceDeficit);
  const strengthAbility = clamp01(1 - 0.60 * strengthDeficit);
  const supportMultiplier = recommendationTables.supportDemandMultiplier[exercise.supportRequirement] ?? 1;
  const adjustedBalanceDemand = exerciseInfo.balanceDemand * supportMultiplier;
  const balanceMargin = clamp01(1 - Math.max(0, adjustedBalanceDemand - balanceAbility));
  const strengthMargin = clamp01(1 - Math.max(0, exerciseInfo.strengthDemand - strengthAbility));
  const supportBonus = exercise.supportRequirement === 'NONE' ? 0 : 0.05;
  return {
    safetyMargin: clamp01(Math.min(balanceMargin, strengthMargin) + supportBonus),
    balanceAbility,
    strengthAbility,
    adjustedBalanceDemand,
  };
}

function fatigueFit(exerciseInfo, degrees) {
  const enduranceDeficit = maxDegree(degrees, ENDURANCE_FUNCTION_IDS);
  const burden = exerciseInfo.fatigueDemand * (0.60 + 0.40 * enduranceDeficit);
  return clamp01(1 - burden);
}

function progressionFit(exercise, exerciseInfo) {
  const levels = Object.keys(exerciseInfo.difficultyByLevel || {});
  const index = levels.indexOf(exercise.level);
  return index >= 0 && index < levels.length - 1 ? 0.90 : 0.60;
}

function fuzzyNumber(value) {
  const spread = recommendationTables.fuzzyRatingSpread;
  return [
    round(clamp01(value - spread)),
    round(clamp01(value)),
    round(clamp01(value + spread)),
  ];
}

function multiplyFuzzy(left, right) {
  return [round(left[0] * right[0]), round(left[1] * right[1]), round(left[2] * right[2])];
}

function vertexDistance(left, right) {
  return Math.sqrt(((left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2) / 3);
}

function fuzzyTopsisScore(crispCriteria) {
  let distanceToIdeal = 0;
  let distanceToAntiIdeal = 0;
  const fuzzyCriteria = {};
  for (const criterion of CRITERIA) {
    const rating = fuzzyNumber(crispCriteria[criterion.criterionId] || 0);
    const weighted = multiplyFuzzy(rating, criterion.fuzzyWeight);
    fuzzyCriteria[criterion.criterionId] = rating;
    distanceToIdeal += vertexDistance(weighted, criterion.fuzzyWeight);
    distanceToAntiIdeal += vertexDistance(weighted, [0, 0, 0]);
  }
  const denominator = distanceToIdeal + distanceToAntiIdeal;
  return {
    score: round(denominator ? distanceToAntiIdeal / denominator : 0),
    fuzzyCriteria,
    distanceToIdeal: round(distanceToIdeal),
    distanceToAntiIdeal: round(distanceToAntiIdeal),
  };
}

function targetSide(exerciseInfo, affectedSide) {
  if (exerciseInfo.sideMode === 'BILATERAL') return 'BILATERAL';
  return affectedSide.side;
}

function reasonCodes(exerciseId, profile, side) {
  const matched = profile
    .filter((item) => relevance(item.vulnerabilityId, exerciseId) > 0)
    .sort((left, right) => (
      right.degree * relevance(right.vulnerabilityId, exerciseId)
      - left.degree * relevance(left.vulnerabilityId, exerciseId)
    ));
  return [
    ...matched.map((item) => `MATCH_${item.vulnerabilityId}_${item.fuzzyLevel}`),
    side !== 'UNDETERMINED' ? `TARGET_SIDE_${side}` : null,
  ].filter(Boolean);
}

export function rankOtagoExercisesWithFuzzyTopsis({
  prescribedExercises = [],
  vulnerabilityAssessment = {},
  riskLevel = 'LOW',
} = {}) {
  const deficitProfile = createFuzzyDeficitProfile(vulnerabilityAssessment);
  const degrees = degreeById(deficitProfile);
  const affectedSide = affectedSideFrom(vulnerabilityAssessment);
  const targetDifficulty = recommendationTables.targetDifficultyByRisk[riskLevel] ?? 0.40;
  const scored = prescribedExercises.map((exercise) => {
    const exerciseInfo = INFO_BY_EXERCISE.get(exercise.exerciseId);
    if (!exerciseInfo) return null;
    const difficulty = exerciseDifficulty(exercise, exerciseInfo);
    const safety = safetyAndAbility({ exercise, exerciseInfo, degrees });
    const crispCriteria = {
      DEFICIT_MATCH: deficitMatch(exercise.exerciseId, deficitProfile),
      SIDE_MATCH: sideMatch(exerciseInfo, deficitProfile, affectedSide),
      DIFFICULTY_FIT: clamp01(1 - Math.abs(difficulty - targetDifficulty)),
      SAFETY_MARGIN: safety.safetyMargin,
      FATIGUE_FIT: fatigueFit(exerciseInfo, degrees),
      PROGRESSION_FIT: progressionFit(exercise, exerciseInfo),
    };
    const topsis = fuzzyTopsisScore(crispCriteria);
    const side = targetSide(exerciseInfo, affectedSide);
    return {
      exerciseId: exercise.exerciseId,
      variantId: exercise.variantId,
      score: topsis.score,
      targetSide: side,
      functionalRole: exerciseInfo.functionalRole,
      criteria: Object.fromEntries(Object.entries(crispCriteria).map(([key, value]) => [key, round(value)])),
      fuzzyCriteria: topsis.fuzzyCriteria,
      distanceToIdeal: topsis.distanceToIdeal,
      distanceToAntiIdeal: topsis.distanceToAntiIdeal,
      reasonVulnerabilityIds: exercise.reasonVulnerabilityIds || [],
      reasonCodes: reasonCodes(exercise.exerciseId, deficitProfile, side),
    };
  }).filter(Boolean).sort((left, right) => right.score - left.score || left.exerciseId.localeCompare(right.exerciseId));

  return {
    schemaVersion: FUZZY_TOPSIS_RANKING_SCHEMA_VERSION,
    algorithmVersion: FUZZY_TOPSIS_ALGORITHM_VERSION,
    safetyBoundary: 'STAGE3_ADMITTED_CANDIDATES_ONLY',
    riskLevel,
    affectedSide,
    deficitProfile,
    criteria: CRITERIA,
    items: scored.map((item, index) => ({ ...item, rank: index + 1 })),
  };
}
