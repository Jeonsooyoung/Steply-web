import {
  CameraVerificationModes,
  ExercisePlanStatuses,
  FindingClassifications,
  FunctionalDomains,
  ResultSources,
  SteadiRiskLevels,
  SupervisionRequirements,
  SupportRequirements,
} from '../shared/types/index.js';
import { validateExercisePlan } from '../shared/validation/runtimeValidation.js';
import { FunctionalFindingTypes } from '../findings/functionalFindings.js';

export const DETERMINISTIC_OTAGO_ENGINE_VERSION = 'deterministic_otago_engine.v1';

export const ExerciseCategories = {
  Strength: 'strength',
  Balance: 'balance',
};

export const ExerciseProgressionDecisions = {
  Maintain: 'MAINTAIN',
  ProgressionEligible: 'PROGRESSION_ELIGIBLE',
  RegressionRequired: 'REGRESSION_REQUIRED',
  ProfessionalReviewRequired: 'PROFESSIONAL_REVIEW_REQUIRED',
};

export const OtagoExerciseIds = {
  FrontKneeStrengthening: 'front_knee_strengthening',
  BackKneeStrengthening: 'back_knee_strengthening',
  SideHipStrengthening: 'side_hip_strengthening',
  CalfRaises: 'calf_raises',
  ToeRaises: 'toe_raises',
  KneeBends: 'knee_bends',
  TandemStance: 'tandem_stance',
  OneLegStand: 'one_leg_stand',
  SitToStand: 'sit_to_stand',
};

const ExerciseLevels = {
  Seated: 'seated',
  SupportedTwoHand: 'supported_two_hand',
  Supported: 'supported',
  Standard: 'standard',
  Unsupported: 'unsupported',
};

const LEVEL_RANK = {
  [ExerciseLevels.Seated]: 0,
  [ExerciseLevels.SupportedTwoHand]: 1,
  [ExerciseLevels.Supported]: 1,
  [ExerciseLevels.Standard]: 2,
  [ExerciseLevels.Unsupported]: 3,
};

const RISK_RANK = {
  [SteadiRiskLevels.Low]: 0,
  [SteadiRiskLevels.Moderate]: 1,
  [SteadiRiskLevels.High]: 2,
  [SteadiRiskLevels.NotScorable]: 3,
};

const DEFAULT_REPETITIONS = {
  [ExerciseLevels.Seated]: 6,
  [ExerciseLevels.SupportedTwoHand]: 5,
  [ExerciseLevels.Supported]: 6,
  [ExerciseLevels.Standard]: 8,
  [ExerciseLevels.Unsupported]: 8,
};

function level(level, supportRequirement, {
  repetitions = DEFAULT_REPETITIONS[level] ?? 6,
  sets = 1,
  cameraVerification = CameraVerificationModes.Partial,
  supervisionRequirement = SupervisionRequirements.None,
} = {}) {
  return {
    level,
    repetitions,
    sets,
    supportRequirement,
    supervisionRequirement,
    cameraVerification,
  };
}

export const OTAGO_EXERCISE_CATALOG = [
  {
    exerciseId: OtagoExerciseIds.FrontKneeStrengthening,
    displayName: 'Front knee strengthening',
    otagoSourceName: 'Front Knee Strengthening',
    category: ExerciseCategories.Strength,
    supportedFunctionalDomains: [FunctionalDomains.LowerBodyFunction, FunctionalDomains.MovementEndurance],
    availableLevels: [
      level(ExerciseLevels.Seated, SupportRequirements.StableSupport, { cameraVerification: CameraVerificationModes.Supported }),
      level(ExerciseLevels.Standard, SupportRequirements.None, { repetitions: 8, cameraVerification: CameraVerificationModes.Supported }),
    ],
    repetitions: 8,
    sets: 1,
    supportRequirement: SupportRequirements.None,
    supervisionRequirement: SupervisionRequirements.None,
    minimumRiskLevel: SteadiRiskLevels.Low,
    maximumRiskLevel: SteadiRiskLevels.Moderate,
    cameraVerifiable: true,
    contraindicationTags: ['acute_knee_pain'],
    progressionRule: 'Increase repetitions only after two safe sessions with good control.',
    regressionRule: 'Use seated repetitions or reduce range if knee pain, form loss, or fatigue appears.',
    instructionMessageKeys: ['exercise.frontKneeStrengthening.instructions'],
    safetyMessageKeys: ['exercise.frontKneeStrengthening.safety'],
  },
  {
    exerciseId: OtagoExerciseIds.BackKneeStrengthening,
    displayName: 'Back knee strengthening',
    otagoSourceName: 'Back Knee Strengthening',
    category: ExerciseCategories.Strength,
    supportedFunctionalDomains: [FunctionalDomains.LowerBodyFunction],
    availableLevels: [
      level(ExerciseLevels.Supported, SupportRequirements.StableSupport, { repetitions: 6 }),
      level(ExerciseLevels.Standard, SupportRequirements.StableSupport, { repetitions: 8 }),
    ],
    repetitions: 8,
    sets: 1,
    supportRequirement: SupportRequirements.StableSupport,
    supervisionRequirement: SupervisionRequirements.None,
    minimumRiskLevel: SteadiRiskLevels.Low,
    maximumRiskLevel: SteadiRiskLevels.Moderate,
    cameraVerifiable: true,
    contraindicationTags: ['acute_knee_pain'],
    progressionRule: 'Progress only when the standing leg remains steady and the motion is controlled.',
    regressionRule: 'Return to supported range or seated work if balance support is needed more often.',
    instructionMessageKeys: ['exercise.backKneeStrengthening.instructions'],
    safetyMessageKeys: ['exercise.backKneeStrengthening.safety'],
  },
  {
    exerciseId: OtagoExerciseIds.SideHipStrengthening,
    displayName: 'Side hip strengthening',
    otagoSourceName: 'Side Hip Strengthening',
    category: ExerciseCategories.Strength,
    supportedFunctionalDomains: [FunctionalDomains.SingleLegBalance, FunctionalDomains.MovementControl],
    availableLevels: [
      level(ExerciseLevels.Supported, SupportRequirements.StableSupport, { repetitions: 6 }),
      level(ExerciseLevels.Standard, SupportRequirements.StableSupport, { repetitions: 8 }),
    ],
    repetitions: 8,
    sets: 1,
    supportRequirement: SupportRequirements.StableSupport,
    supervisionRequirement: SupervisionRequirements.None,
    minimumRiskLevel: SteadiRiskLevels.Low,
    maximumRiskLevel: SteadiRiskLevels.Moderate,
    cameraVerifiable: true,
    contraindicationTags: ['hip_pain'],
    progressionRule: 'Add repetitions after repeated controlled sessions without trunk sway.',
    regressionRule: 'Use smaller side lifts or extra hand support when the pelvis shifts.',
    instructionMessageKeys: ['exercise.sideHipStrengthening.instructions'],
    safetyMessageKeys: ['exercise.sideHipStrengthening.safety'],
  },
  {
    exerciseId: OtagoExerciseIds.CalfRaises,
    displayName: 'Calf raises',
    otagoSourceName: 'Calf Raises',
    category: ExerciseCategories.Balance,
    supportedFunctionalDomains: [FunctionalDomains.BasicStaticBalance, FunctionalDomains.NarrowBaseBalance],
    availableLevels: [
      level(ExerciseLevels.Supported, SupportRequirements.StableSupport, { repetitions: 6 }),
      level(ExerciseLevels.Standard, SupportRequirements.StableSupport, { repetitions: 8 }),
      level(ExerciseLevels.Unsupported, SupportRequirements.None, { repetitions: 8 }),
    ],
    repetitions: 8,
    sets: 1,
    supportRequirement: SupportRequirements.StableSupport,
    supervisionRequirement: SupervisionRequirements.None,
    minimumRiskLevel: SteadiRiskLevels.Low,
    maximumRiskLevel: SteadiRiskLevels.Moderate,
    cameraVerifiable: true,
    contraindicationTags: ['severe_foot_pain'],
    progressionRule: 'Progress support level only after stable balance across two sessions.',
    regressionRule: 'Use both hands on support or reduce repetitions after sway or safety events.',
    instructionMessageKeys: ['exercise.calfRaises.instructions'],
    safetyMessageKeys: ['exercise.calfRaises.safety'],
  },
  {
    exerciseId: OtagoExerciseIds.ToeRaises,
    displayName: 'Toe raises',
    otagoSourceName: 'Toe Raises',
    category: ExerciseCategories.Balance,
    supportedFunctionalDomains: [FunctionalDomains.BasicStaticBalance, FunctionalDomains.NarrowBaseBalance],
    availableLevels: [
      level(ExerciseLevels.Supported, SupportRequirements.StableSupport, { repetitions: 6 }),
      level(ExerciseLevels.Standard, SupportRequirements.StableSupport, { repetitions: 8 }),
      level(ExerciseLevels.Unsupported, SupportRequirements.None, { repetitions: 8 }),
    ],
    repetitions: 8,
    sets: 1,
    supportRequirement: SupportRequirements.StableSupport,
    supervisionRequirement: SupervisionRequirements.None,
    minimumRiskLevel: SteadiRiskLevels.Low,
    maximumRiskLevel: SteadiRiskLevels.Moderate,
    cameraVerifiable: true,
    contraindicationTags: ['severe_foot_pain'],
    progressionRule: 'Progress support level only after stable balance across two sessions.',
    regressionRule: 'Use both hands on support or reduce repetitions after sway or safety events.',
    instructionMessageKeys: ['exercise.toeRaises.instructions'],
    safetyMessageKeys: ['exercise.toeRaises.safety'],
  },
  {
    exerciseId: OtagoExerciseIds.KneeBends,
    displayName: 'Knee bends',
    otagoSourceName: 'Knee Bends',
    category: ExerciseCategories.Strength,
    supportedFunctionalDomains: [FunctionalDomains.LowerBodyFunction, FunctionalDomains.MovementEndurance, FunctionalDomains.BasicStaticBalance],
    availableLevels: [
      level(ExerciseLevels.Supported, SupportRequirements.StableSupport, { repetitions: 5 }),
      level(ExerciseLevels.Standard, SupportRequirements.StableSupport, { repetitions: 8 }),
    ],
    repetitions: 8,
    sets: 1,
    supportRequirement: SupportRequirements.StableSupport,
    supervisionRequirement: SupervisionRequirements.None,
    minimumRiskLevel: SteadiRiskLevels.Low,
    maximumRiskLevel: SteadiRiskLevels.Moderate,
    cameraVerifiable: true,
    contraindicationTags: ['acute_knee_pain'],
    progressionRule: 'Increase depth or repetitions only after controlled, pain-free sessions.',
    regressionRule: 'Reduce range and use stable support if form changes or knee discomfort appears.',
    instructionMessageKeys: ['exercise.kneeBends.instructions'],
    safetyMessageKeys: ['exercise.kneeBends.safety'],
  },
  {
    exerciseId: OtagoExerciseIds.TandemStance,
    displayName: 'Tandem stance',
    otagoSourceName: 'Tandem Stance',
    category: ExerciseCategories.Balance,
    supportedFunctionalDomains: [FunctionalDomains.NarrowBaseBalance],
    availableLevels: [
      level(ExerciseLevels.Supported, SupportRequirements.StableSupport, { repetitions: 2, sets: 1, cameraVerification: CameraVerificationModes.Supported }),
      level(ExerciseLevels.Unsupported, SupportRequirements.None, { repetitions: 2, sets: 1, cameraVerification: CameraVerificationModes.Supported }),
    ],
    repetitions: 2,
    sets: 1,
    supportRequirement: SupportRequirements.StableSupport,
    supervisionRequirement: SupervisionRequirements.None,
    minimumRiskLevel: SteadiRiskLevels.Low,
    maximumRiskLevel: SteadiRiskLevels.Moderate,
    cameraVerifiable: true,
    contraindicationTags: ['dizziness_uncontrolled'],
    progressionRule: 'Reduce hand support only after two safe holds without foot movement.',
    regressionRule: 'Return to supported semi-tandem stance after foot movement, support use, or near loss of balance.',
    instructionMessageKeys: ['exercise.tandemStance.instructions'],
    safetyMessageKeys: ['exercise.tandemStance.safety'],
  },
  {
    exerciseId: OtagoExerciseIds.OneLegStand,
    displayName: 'One-leg stand',
    otagoSourceName: 'One-leg Stand',
    category: ExerciseCategories.Balance,
    supportedFunctionalDomains: [FunctionalDomains.SingleLegBalance],
    availableLevels: [
      level(ExerciseLevels.Supported, SupportRequirements.StableSupport, { repetitions: 2, sets: 1, cameraVerification: CameraVerificationModes.Supported }),
      level(ExerciseLevels.Unsupported, SupportRequirements.None, { repetitions: 2, sets: 1, cameraVerification: CameraVerificationModes.Supported }),
    ],
    repetitions: 2,
    sets: 1,
    supportRequirement: SupportRequirements.StableSupport,
    supervisionRequirement: SupervisionRequirements.None,
    minimumRiskLevel: SteadiRiskLevels.Low,
    maximumRiskLevel: SteadiRiskLevels.Moderate,
    cameraVerifiable: true,
    contraindicationTags: ['dizziness_uncontrolled'],
    progressionRule: 'Reduce support only after repeated safe holds with no touchdown or support event.',
    regressionRule: 'Use both hands on support or practice shorter holds after touchdown or support use.',
    instructionMessageKeys: ['exercise.oneLegStand.instructions'],
    safetyMessageKeys: ['exercise.oneLegStand.safety'],
  },
  {
    exerciseId: OtagoExerciseIds.SitToStand,
    displayName: 'Sit to stand',
    otagoSourceName: 'Sit to Stand',
    category: ExerciseCategories.Strength,
    supportedFunctionalDomains: [FunctionalDomains.LowerBodyFunction, FunctionalDomains.MovementEndurance, FunctionalDomains.MovementControl],
    availableLevels: [
      level(ExerciseLevels.SupportedTwoHand, SupportRequirements.StableSupport, { repetitions: 4, cameraVerification: CameraVerificationModes.Supported }),
      level(ExerciseLevels.Supported, SupportRequirements.StableSupport, { repetitions: 5, cameraVerification: CameraVerificationModes.Supported }),
      level(ExerciseLevels.Standard, SupportRequirements.None, { repetitions: 6, cameraVerification: CameraVerificationModes.Supported }),
    ],
    repetitions: 6,
    sets: 1,
    supportRequirement: SupportRequirements.None,
    supervisionRequirement: SupervisionRequirements.None,
    minimumRiskLevel: SteadiRiskLevels.Low,
    maximumRiskLevel: SteadiRiskLevels.Moderate,
    cameraVerifiable: true,
    contraindicationTags: ['unsafe_transfer', 'acute_knee_pain'],
    progressionRule: 'Progress repetitions only after safe, controlled chair stands without arm support when allowed.',
    regressionRule: 'Use two-hand support or fewer repetitions after fatigue, trunk compensation, or safety events.',
    instructionMessageKeys: ['exercise.sitToStand.instructions'],
    safetyMessageKeys: ['exercise.sitToStand.safety'],
  },
];

const CATALOG_BY_ID = Object.fromEntries(OTAGO_EXERCISE_CATALOG.map((exercise) => [exercise.exerciseId, exercise]));

const PRIMARY_MAPPING = {
  [FunctionalFindingTypes.ChairStandBelowReference]: [
    { exerciseId: OtagoExerciseIds.FrontKneeStrengthening, desiredLevel: ExerciseLevels.Standard, priority: 10 },
    { exerciseId: OtagoExerciseIds.KneeBends, desiredLevel: ExerciseLevels.Supported, priority: 20 },
    { exerciseId: OtagoExerciseIds.SitToStand, desiredLevel: ExerciseLevels.Standard, priority: 30 },
  ],
  [FunctionalFindingTypes.ArmSupportRequired]: [
    { exerciseId: OtagoExerciseIds.SitToStand, desiredLevel: ExerciseLevels.SupportedTwoHand, priority: 5 },
    { exerciseId: OtagoExerciseIds.FrontKneeStrengthening, desiredLevel: ExerciseLevels.Seated, priority: 15 },
  ],
  [FunctionalFindingTypes.BasicBalanceDifficulty]: [
    { exerciseId: OtagoExerciseIds.CalfRaises, desiredLevel: ExerciseLevels.Supported, priority: 5 },
    { exerciseId: OtagoExerciseIds.ToeRaises, desiredLevel: ExerciseLevels.Supported, priority: 15 },
    { exerciseId: OtagoExerciseIds.KneeBends, desiredLevel: ExerciseLevels.Supported, priority: 25 },
  ],
  [FunctionalFindingTypes.SemiTandemHoldDifficulty]: [
    { exerciseId: OtagoExerciseIds.TandemStance, desiredLevel: ExerciseLevels.Supported, priority: 5 },
    { exerciseId: OtagoExerciseIds.CalfRaises, desiredLevel: ExerciseLevels.Supported, priority: 15 },
    { exerciseId: OtagoExerciseIds.ToeRaises, desiredLevel: ExerciseLevels.Supported, priority: 25 },
  ],
  [FunctionalFindingTypes.TandemHoldDifficulty]: [
    { exerciseId: OtagoExerciseIds.TandemStance, desiredLevel: ExerciseLevels.Supported, priority: 5 },
    { exerciseId: OtagoExerciseIds.CalfRaises, desiredLevel: ExerciseLevels.Supported, priority: 15 },
    { exerciseId: OtagoExerciseIds.ToeRaises, desiredLevel: ExerciseLevels.Supported, priority: 25 },
  ],
  [FunctionalFindingTypes.SingleLegHoldDifficulty]: [
    { exerciseId: OtagoExerciseIds.OneLegStand, desiredLevel: ExerciseLevels.Supported, priority: 5 },
    { exerciseId: OtagoExerciseIds.SideHipStrengthening, desiredLevel: ExerciseLevels.Supported, priority: 15 },
    { exerciseId: OtagoExerciseIds.CalfRaises, desiredLevel: ExerciseLevels.Supported, priority: 25 },
  ],
};

const SECONDARY_MAPPING = {
  [FunctionalFindingTypes.LateRepetitionSlowdown]: [
    { exerciseId: OtagoExerciseIds.SitToStand, desiredLevel: ExerciseLevels.Supported, priority: 60, cueCode: 'CUE_SPLIT_SETS_AND_REST' },
  ],
  [FunctionalFindingTypes.TrunkCompensationPattern]: [
    { exerciseId: OtagoExerciseIds.SitToStand, desiredLevel: ExerciseLevels.Supported, priority: 65, cueCode: 'CUE_KEEP_TRUNK_CONTROLLED' },
  ],
  [FunctionalFindingTypes.MediolateralSwayPattern]: [
    { exerciseId: OtagoExerciseIds.CalfRaises, desiredLevel: ExerciseLevels.Supported, priority: 70, cueCode: 'CUE_USE_STABLE_SUPPORT_FOR_SWAY' },
  ],
  [FunctionalFindingTypes.AnteriorPosteriorSwayPattern]: [
    { exerciseId: OtagoExerciseIds.ToeRaises, desiredLevel: ExerciseLevels.Supported, priority: 70, cueCode: 'CUE_USE_STABLE_SUPPORT_FOR_SWAY' },
  ],
  [FunctionalFindingTypes.FrequentPositionCorrection]: [
    { exerciseId: OtagoExerciseIds.CalfRaises, desiredLevel: ExerciseLevels.Supported, priority: 75, cueCode: 'CUE_RESET_POSITION_BETWEEN_REPS' },
  ],
};

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
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

function sourceFrom(result = {}) {
  return result.metadata?.source || result.source || null;
}

function validSourceAssessment(result = {}) {
  return (
    sourceFrom(result) === ResultSources.LivePose
    && result.status === 'VALID'
    && result.metadata?.isClinicallyScorable !== false
  );
}

function riskLevelFrom({ steadiScore, riskLevel }) {
  return riskLevel || steadiScore?.riskLevel || SteadiRiskLevels.NotScorable;
}

function supervisionForRisk(riskLevel, requiresProfessionalReview = false) {
  if (requiresProfessionalReview || riskLevel === SteadiRiskLevels.High) return SupervisionRequirements.ProfessionalReviewRequired;
  if (riskLevel === SteadiRiskLevels.Moderate) return SupervisionRequirements.CaregiverRecommended;
  return SupervisionRequirements.None;
}

function compareRisk(value, min, max) {
  const rank = RISK_RANK[value] ?? RISK_RANK[SteadiRiskLevels.NotScorable];
  return rank >= (RISK_RANK[min] ?? 0) && rank <= (RISK_RANK[max] ?? 99);
}

function hasBalanceFinding(findings = []) {
  return findings.some((finding) => [
    FunctionalFindingTypes.BasicBalanceDifficulty,
    FunctionalFindingTypes.SemiTandemHoldDifficulty,
    FunctionalFindingTypes.TandemHoldDifficulty,
    FunctionalFindingTypes.SingleLegHoldDifficulty,
  ].includes(finding.findingType));
}

function levelByName(exercise, levelName) {
  return exercise.availableLevels.find((item) => item.level === levelName) || null;
}

function highestAllowedLevel(exercise, {
  desiredLevel,
  riskLevel,
  hasBalancePrimary,
  armSupportRequired,
}) {
  const desired = levelByName(exercise, desiredLevel) || exercise.availableLevels[0];
  const desiredRank = LEVEL_RANK[desired.level] ?? 0;
  const exclusionReasons = [];
  let maxRank = desiredRank;

  if (riskLevel === SteadiRiskLevels.Moderate) {
    maxRank = Math.min(maxRank, LEVEL_RANK[ExerciseLevels.Standard]);
    if (exercise.category === ExerciseCategories.Balance) {
      exclusionReasons.push('RISK_CAP_MODERATE_REQUIRES_SUPPORTED_BALANCE');
    }
  }

  if (riskLevel === SteadiRiskLevels.Low && hasBalancePrimary && exercise.category === ExerciseCategories.Balance) {
    maxRank = Math.min(maxRank, LEVEL_RANK[ExerciseLevels.Supported]);
    exclusionReasons.push('BALANCE_FINDING_REQUIRES_SUPPORTED_START');
  }

  if (armSupportRequired && exercise.exerciseId === OtagoExerciseIds.SitToStand) {
    maxRank = Math.min(maxRank, LEVEL_RANK[ExerciseLevels.SupportedTwoHand]);
    exclusionReasons.push('ARM_SUPPORT_REQUIRED_UNSUPPORTED_SIT_TO_STAND_EXCLUDED');
  }

  const candidates = exercise.availableLevels
    .filter((item) => (LEVEL_RANK[item.level] ?? 0) <= maxRank)
    .sort((first, second) => (LEVEL_RANK[second.level] ?? 0) - (LEVEL_RANK[first.level] ?? 0));
  return {
    level: candidates[0] || exercise.availableLevels[0],
    excludedLevelReasons: unique(exclusionReasons),
  };
}

function addCandidate(candidates, finding, mapping, classification) {
  const exercise = CATALOG_BY_ID[mapping.exerciseId];
  if (!exercise) return;
  const existing = candidates.get(mapping.exerciseId) || {
    exercise,
    sourceFindingIds: [],
    findingTypes: [],
    reasonCodes: [],
    cueCodes: [],
    priority: mapping.priority,
    desiredLevel: mapping.desiredLevel,
    classification,
  };
  existing.sourceFindingIds.push(finding.findingId);
  existing.findingTypes.push(finding.findingType);
  existing.reasonCodes.push(`SELECTED_FOR_${finding.findingType}`);
  if (mapping.cueCode) existing.cueCodes.push(mapping.cueCode);
  existing.priority = Math.min(existing.priority, mapping.priority);
  if ((LEVEL_RANK[mapping.desiredLevel] ?? 0) < (LEVEL_RANK[existing.desiredLevel] ?? 0)) {
    existing.desiredLevel = mapping.desiredLevel;
  }
  if (classification === FindingClassifications.Primary) existing.classification = classification;
  candidates.set(mapping.exerciseId, existing);
}

function candidateListFromFindings(findings = []) {
  const candidates = new Map();
  for (const finding of findings) {
    if (finding.findingType === FunctionalFindingTypes.LowMeasurementConfidence) continue;
    const primaryMappings = finding.classification === FindingClassifications.Primary
      ? PRIMARY_MAPPING[finding.findingType] || []
      : [];
    for (const mapping of primaryMappings) addCandidate(candidates, finding, mapping, FindingClassifications.Primary);
    const secondaryMappings = finding.classification === FindingClassifications.Secondary
      ? SECONDARY_MAPPING[finding.findingType] || []
      : [];
    for (const mapping of secondaryMappings) addCandidate(candidates, finding, mapping, FindingClassifications.Secondary);
  }
  return [...candidates.values()].sort((first, second) => first.priority - second.priority || first.exercise.exerciseId.localeCompare(second.exercise.exerciseId));
}

function exerciseCameraVerification(exercise, selectedLevel) {
  if (selectedLevel.cameraVerification) return selectedLevel.cameraVerification;
  return exercise.cameraVerifiable ? CameraVerificationModes.Partial : CameraVerificationModes.NotSupported;
}

function recommendationMessageFor(findingType) {
  const messages = {
    [FunctionalFindingTypes.ChairStandBelowReference]: 'Selected because the chair stand count was below the reference for age and sex.',
    [FunctionalFindingTypes.ArmSupportRequired]: 'Selected because arm support was observed during the test.',
    [FunctionalFindingTypes.BasicBalanceDifficulty]: 'Selected because the side-by-side balance hold was shorter than 10 seconds.',
    [FunctionalFindingTypes.SemiTandemHoldDifficulty]: 'Selected because the semi-tandem hold was shorter than 10 seconds.',
    [FunctionalFindingTypes.TandemHoldDifficulty]: 'Selected because the tandem hold was shorter than 10 seconds.',
    [FunctionalFindingTypes.SingleLegHoldDifficulty]: 'Selected because the one-leg hold was shorter than 10 seconds.',
    [FunctionalFindingTypes.LateRepetitionSlowdown]: 'Selected to start with lower repetitions and rest because later chair stand repetitions slowed.',
    [FunctionalFindingTypes.TrunkCompensationPattern]: 'Selected with a trunk-control cue because forward lean was observed.',
    [FunctionalFindingTypes.MediolateralSwayPattern]: 'Selected as supported balance practice because side-to-side movement was observed.',
    [FunctionalFindingTypes.AnteriorPosteriorSwayPattern]: 'Selected as supported balance practice because forward-back movement was observed.',
    [FunctionalFindingTypes.FrequentPositionCorrection]: 'Selected with reset cues because position corrections were observed.',
  };
  return messages[findingType] || 'Selected from the functional finding map.';
}

function createSelectedExercise(candidate, context) {
  const { exercise } = candidate;
  const levelResult = highestAllowedLevel(exercise, {
    desiredLevel: candidate.desiredLevel,
    riskLevel: context.riskLevel,
    hasBalancePrimary: context.hasBalancePrimary,
    armSupportRequired: context.armSupportRequired,
  });
  const selectedLevel = levelResult.level;
  const reasonCodes = unique([
    ...candidate.reasonCodes,
    ...candidate.cueCodes,
    ...levelResult.excludedLevelReasons,
    context.riskLevel === SteadiRiskLevels.Moderate ? 'RISK_CAP_MODERATE_APPLIED' : null,
    context.armSupportRequired ? 'ARM_SUPPORT_REQUIRED_SAFETY_RULE_APPLIED' : null,
  ]);
  const repetitions = candidate.cueCodes.includes('CUE_SPLIT_SETS_AND_REST')
    ? Math.max(3, Math.min(selectedLevel.repetitions, 5))
    : selectedLevel.repetitions;
  return {
    exerciseId: exercise.exerciseId,
    displayName: exercise.displayName,
    otagoSourceName: exercise.otagoSourceName,
    category: exercise.category,
    level: selectedLevel.level,
    repetitions,
    sets: selectedLevel.sets,
    supportRequirement: selectedLevel.supportRequirement,
    supervisionRequirement: context.planSupervision,
    cameraVerification: exerciseCameraVerification(exercise, selectedLevel),
    reasonFindingIds: unique(candidate.sourceFindingIds),
    reasonCodes,
    reasonMessages: unique(candidate.findingTypes.map(recommendationMessageFor)),
    riskCapApplied: context.riskLevel,
    excludedLevelReasons: levelResult.excludedLevelReasons,
    instructionMessageKeys: exercise.instructionMessageKeys,
    safetyMessageKeys: unique([
      ...exercise.safetyMessageKeys,
      context.riskLevel === SteadiRiskLevels.Moderate ? 'safety.caregiverNearbyRecommended' : null,
      context.armSupportRequired ? 'safety.useSupportedSitToStandOnly' : null,
    ]),
    progressionRule: exercise.progressionRule,
    regressionRule: exercise.regressionRule,
  };
}

function selectionOrder(candidates) {
  const balance = candidates.find((item) => item.exercise.category === ExerciseCategories.Balance);
  const strength = candidates.filter((item) => item.exercise.category === ExerciseCategories.Strength);
  const ordered = [];
  if (balance) ordered.push(balance);
  ordered.push(...strength);
  ordered.push(...candidates.filter((item) => !ordered.includes(item)));
  return ordered;
}

function exclusion(exercise, reasonCodes, reasonMessage, sourceFindingIds = []) {
  return {
    exerciseId: exercise.exerciseId,
    displayName: exercise.displayName,
    reasonCodes: unique(reasonCodes),
    reasonMessage,
    sourceFindingIds: unique(sourceFindingIds),
  };
}

function createPlanId({ userId, riskLevel, findings }) {
  return `exercise-plan-${stableHash({
    userId,
    riskLevel,
    findings: findings.map((finding) => ({
      findingId: finding.findingId,
      findingType: finding.findingType,
      classification: finding.classification,
    })).sort((first, second) => first.findingId.localeCompare(second.findingId)),
  })}`;
}

function sourceAssessmentIdsFrom(findings = [], sourceAssessments = []) {
  return unique([
    ...sourceAssessments.map((assessment) => assessment.assessmentId),
    ...findings.flatMap((finding) => finding.evidence?.sourceAssessmentIds || [finding.assessmentId]),
  ]);
}

function blockedPlan({
  userId,
  riskLevel,
  findings,
  sourceAssessments,
  reasonCodes,
  safetyNotices,
  requiresProfessionalReview = false,
}) {
  const sourceFindingIds = findings.map((finding) => finding.findingId);
  const planSupervision = supervisionForRisk(riskLevel, requiresProfessionalReview);
  const plan = {
    planId: createPlanId({ userId, riskLevel, findings }),
    userId,
    riskLevel,
    selectedExercises: [],
    excludedExercises: OTAGO_EXERCISE_CATALOG.map((exercise) => exclusion(
      exercise,
      reasonCodes,
      requiresProfessionalReview
        ? 'Exercise selection is blocked until professional review is complete.'
        : 'Exercise selection is blocked by the current safety gate.',
      sourceFindingIds,
    )),
    supervisionRequirement: planSupervision,
    requiresProfessionalReview,
    safetyNotices,
    generatedByRuleVersion: DETERMINISTIC_OTAGO_ENGINE_VERSION,
    sourceAssessmentIds: sourceAssessmentIdsFrom(findings, sourceAssessments),
    sourceFindingIds,
    status: requiresProfessionalReview ? ExercisePlanStatuses.PendingReview : ExercisePlanStatuses.Blocked,
    decisionTrace: reasonCodes,
  };
  return {
    value: plan,
    validation: validateExercisePlan(plan, { sourceAssessments }),
  };
}

export function createDeterministicOtagoExercisePlan({
  userId = 'anonymous-user',
  findings = [],
  steadiScore = null,
  riskLevel = null,
  sourceAssessments = [],
  contraindicationTags = [],
  maxExercises = 3,
} = {}) {
  const resolvedRisk = riskLevelFrom({ steadiScore, riskLevel });
  const sourceFindingIds = findings.map((finding) => finding.findingId);
  const lowConfidenceOnly = findings.length > 0 && findings.every((finding) => finding.findingType === FunctionalFindingTypes.LowMeasurementConfidence);
  const invalidAssessment = sourceAssessments.find((assessment) => !validSourceAssessment(assessment));

  if (invalidAssessment) {
    return blockedPlan({
      userId,
      riskLevel: resolvedRisk,
      findings,
      sourceAssessments,
      reasonCodes: ['INVALID_OR_NON_CLINICAL_ASSESSMENT'],
      safetyNotices: ['INVALID_ASSESSMENT_BLOCKED'],
    });
  }
  if (resolvedRisk === SteadiRiskLevels.High) {
    return blockedPlan({
      userId,
      riskLevel: resolvedRisk,
      findings,
      sourceAssessments,
      reasonCodes: ['HIGH_RISK_REQUIRES_PROFESSIONAL_REVIEW'],
      safetyNotices: ['HIGH_RISK_PROFESSIONAL_REVIEW_REQUIRED'],
      requiresProfessionalReview: true,
    });
  }
  if (resolvedRisk === SteadiRiskLevels.NotScorable) {
    return blockedPlan({
      userId,
      riskLevel: resolvedRisk,
      findings,
      sourceAssessments,
      reasonCodes: ['RISK_LEVEL_NOT_SCORABLE'],
      safetyNotices: ['RISK_NOT_SCORABLE_BLOCKED'],
    });
  }

  const hasBalancePrimary = hasBalanceFinding(findings);
  const armSupportRequired = findings.some((finding) => finding.findingType === FunctionalFindingTypes.ArmSupportRequired);
  const planSupervision = supervisionForRisk(resolvedRisk);
  const context = {
    riskLevel: resolvedRisk,
    hasBalancePrimary,
    armSupportRequired,
    planSupervision,
  };
  const candidates = candidateListFromFindings(findings);
  const selected = [];
  const excluded = [];
  const selectedIds = new Set();
  const contraindicationSet = new Set(contraindicationTags);

  for (const candidate of selectionOrder(candidates)) {
    const { exercise } = candidate;
    if (selectedIds.has(exercise.exerciseId)) {
      excluded.push(exclusion(exercise, ['DUPLICATE_EXERCISE_REMOVED'], 'Duplicate exercise removed from the session.', candidate.sourceFindingIds));
      continue;
    }
    if (!compareRisk(resolvedRisk, exercise.minimumRiskLevel, exercise.maximumRiskLevel)) {
      excluded.push(exclusion(exercise, ['RISK_LEVEL_OUTSIDE_EXERCISE_RANGE'], 'Exercise excluded by the current risk-level range.', candidate.sourceFindingIds));
      continue;
    }
    const contraindication = exercise.contraindicationTags.find((tag) => contraindicationSet.has(tag));
    if (contraindication) {
      excluded.push(exclusion(exercise, [`CONTRAINDICATION_${contraindication}`], 'Exercise excluded because a contraindication tag is present.', candidate.sourceFindingIds));
      continue;
    }
    if (selected.length >= maxExercises) {
      excluded.push(exclusion(exercise, ['SESSION_EXERCISE_LIMIT_REACHED'], `Only ${maxExercises} exercises are selected for one session.`, candidate.sourceFindingIds));
      continue;
    }
    const selectedExercise = createSelectedExercise(candidate, context);
    selected.push(selectedExercise);
    selectedIds.add(exercise.exerciseId);
  }

  for (const exercise of OTAGO_EXERCISE_CATALOG) {
    if (selectedIds.has(exercise.exerciseId)) continue;
    if (excluded.some((item) => item.exerciseId === exercise.exerciseId)) continue;
    excluded.push(exclusion(
      exercise,
      lowConfidenceOnly ? ['LOW_MEASUREMENT_CONFIDENCE_NO_SPECIFIC_EXERCISE'] : ['NOT_RELATED_TO_CURRENT_FINDINGS'],
      lowConfidenceOnly
        ? 'Low measurement confidence does not add a specific exercise.'
        : 'Exercise was not directly related to the current functional findings.',
      sourceFindingIds,
    ));
  }

  const safetyNotices = unique([
    resolvedRisk === SteadiRiskLevels.Moderate ? 'MODERATE_RISK_STABLE_SUPPORT_AND_CAREGIVER_RECOMMENDED' : null,
    armSupportRequired ? 'ARM_SUPPORT_REQUIRED_USE_SUPPORTED_SIT_TO_STAND_ONLY' : null,
    lowConfidenceOnly ? 'LOW_MEASUREMENT_CONFIDENCE_NO_SPECIFIC_EXERCISES' : null,
  ]);
  const plan = {
    planId: createPlanId({ userId, riskLevel: resolvedRisk, findings }),
    userId,
    riskLevel: resolvedRisk,
    selectedExercises: selected,
    excludedExercises: excluded,
    supervisionRequirement: planSupervision,
    requiresProfessionalReview: false,
    safetyNotices,
    generatedByRuleVersion: DETERMINISTIC_OTAGO_ENGINE_VERSION,
    sourceAssessmentIds: sourceAssessmentIdsFrom(findings, sourceAssessments),
    sourceFindingIds,
    status: selected.length ? ExercisePlanStatuses.Active : ExercisePlanStatuses.Blocked,
    decisionTrace: unique([
      'VALID_INPUTS_CONFIRMED',
      `RISK_LEVEL_${resolvedRisk}`,
      selected.length ? 'EXERCISES_SELECTED_FROM_FUNCTIONAL_FINDINGS' : 'NO_EXERCISES_SELECTED',
    ]),
  };
  return {
    value: plan,
    validation: validateExercisePlan(plan, { sourceAssessments }),
  };
}

export function evaluateExerciseProgression({
  recentSessionResult = {},
  postureAccuracy = recentSessionResult.postureAccuracy,
  requiredRepetitionsAchieved = recentSessionResult.requiredRepetitionsAchieved,
  consecutiveSuccessfulSessions = recentSessionResult.consecutiveSuccessfulSessions,
  safetyEvents = recentSessionResult.safetyEvents || [],
  currentRiskLevel,
} = {}) {
  if (currentRiskLevel === SteadiRiskLevels.High) {
    return {
      decision: ExerciseProgressionDecisions.ProfessionalReviewRequired,
      reasonCodes: ['HIGH_RISK_REQUIRES_PROFESSIONAL_REVIEW'],
    };
  }
  if (safetyEvents.length > 0) {
    return {
      decision: ExerciseProgressionDecisions.RegressionRequired,
      reasonCodes: ['SAFETY_EVENT_RECORDED'],
    };
  }
  if (postureAccuracy < 0.75 || requiredRepetitionsAchieved === false) {
    return {
      decision: ExerciseProgressionDecisions.RegressionRequired,
      reasonCodes: ['FORM_OR_REPETITION_TARGET_NOT_MET'],
    };
  }
  if (postureAccuracy >= 0.9 && requiredRepetitionsAchieved === true && consecutiveSuccessfulSessions >= 2) {
    return {
      decision: ExerciseProgressionDecisions.ProgressionEligible,
      reasonCodes: ['TWO_SAFE_SUCCESSFUL_SESSIONS'],
    };
  }
  return {
    decision: ExerciseProgressionDecisions.Maintain,
    reasonCodes: ['MAINTAIN_CURRENT_LEVEL'],
  };
}
