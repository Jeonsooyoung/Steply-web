import { functionalFindingsConfig } from '../shared/config/functionalFindings.config.js';
import {
  ArmUseStates,
  AssessmentResultStatuses,
  AssessmentTypes,
  BalanceStageStatuses,
  BalanceStages,
  FindingClassifications,
  FindingSeverities,
  FunctionalDomains,
  ResultSources,
  createTypedId,
} from '../shared/types/index.js';
import { validateFunctionalFinding } from '../shared/validation/runtimeValidation.js';
import {
  ageYearsFromProfile,
  chairStandBelowAverageThreshold,
  normalizeSteadiGender,
} from '../../pose/steadiRules.js';

export const FunctionalFindingTypes = {
  ChairStandBelowReference: 'CHAIR_STAND_BELOW_REFERENCE',
  ArmSupportRequired: 'ARM_SUPPORT_REQUIRED',
  BasicBalanceDifficulty: 'BASIC_BALANCE_DIFFICULTY',
  SemiTandemHoldDifficulty: 'SEMI_TANDEM_HOLD_DIFFICULTY',
  TandemHoldDifficulty: 'TANDEM_HOLD_DIFFICULTY',
  SingleLegHoldDifficulty: 'SINGLE_LEG_HOLD_DIFFICULTY',
  LateRepetitionSlowdown: 'LATE_REPETITION_SLOWDOWN',
  TrunkCompensationPattern: 'TRUNK_COMPENSATION_PATTERN',
  MovementAsymmetryPattern: 'MOVEMENT_ASYMMETRY_PATTERN',
  MediolateralSwayPattern: 'MEDIOLATERAL_SWAY_PATTERN',
  AnteriorPosteriorSwayPattern: 'ANTERIOR_POSTERIOR_SWAY_PATTERN',
  FrequentPositionCorrection: 'FREQUENT_POSITION_CORRECTION',
  LowMeasurementConfidence: 'LOW_MEASUREMENT_CONFIDENCE',
};

const PRIMARY_META = {
  [FunctionalFindingTypes.ChairStandBelowReference]: {
    domain: FunctionalDomains.MovementEndurance,
    severity: FindingSeverities.Moderate,
    recommendationTags: ['chair_stand_reference_below'],
  },
  [FunctionalFindingTypes.ArmSupportRequired]: {
    domain: FunctionalDomains.LowerBodyFunction,
    severity: FindingSeverities.Significant,
    recommendationTags: ['arm_support_required'],
  },
  [FunctionalFindingTypes.BasicBalanceDifficulty]: {
    domain: FunctionalDomains.BasicStaticBalance,
    severity: FindingSeverities.Significant,
    recommendationTags: ['basic_balance_difficulty'],
  },
  [FunctionalFindingTypes.SemiTandemHoldDifficulty]: {
    domain: FunctionalDomains.NarrowBaseBalance,
    severity: FindingSeverities.Moderate,
    recommendationTags: ['semi_tandem_hold_difficulty'],
  },
  [FunctionalFindingTypes.TandemHoldDifficulty]: {
    domain: FunctionalDomains.NarrowBaseBalance,
    severity: FindingSeverities.Moderate,
    recommendationTags: ['tandem_hold_difficulty'],
  },
  [FunctionalFindingTypes.SingleLegHoldDifficulty]: {
    domain: FunctionalDomains.SingleLegBalance,
    severity: FindingSeverities.Moderate,
    recommendationTags: ['single_leg_hold_difficulty'],
  },
};

const SECONDARY_META = {
  [FunctionalFindingTypes.LateRepetitionSlowdown]: {
    domain: FunctionalDomains.MovementEndurance,
    severity: FindingSeverities.Informational,
    recommendationTags: ['late_repetition_slowdown_observed'],
  },
  [FunctionalFindingTypes.TrunkCompensationPattern]: {
    domain: FunctionalDomains.MovementControl,
    severity: FindingSeverities.Informational,
    recommendationTags: ['trunk_compensation_observed'],
  },
  [FunctionalFindingTypes.MovementAsymmetryPattern]: {
    domain: FunctionalDomains.MovementControl,
    severity: FindingSeverities.Informational,
    recommendationTags: ['movement_asymmetry_observed'],
  },
  [FunctionalFindingTypes.MediolateralSwayPattern]: {
    domain: FunctionalDomains.MovementControl,
    severity: FindingSeverities.Informational,
    recommendationTags: ['mediolateral_sway_observed'],
  },
  [FunctionalFindingTypes.AnteriorPosteriorSwayPattern]: {
    domain: FunctionalDomains.MovementControl,
    severity: FindingSeverities.Informational,
    recommendationTags: ['anterior_posterior_sway_observed'],
  },
  [FunctionalFindingTypes.FrequentPositionCorrection]: {
    domain: FunctionalDomains.MovementControl,
    severity: FindingSeverities.Informational,
    recommendationTags: ['frequent_position_correction_observed'],
  },
  [FunctionalFindingTypes.LowMeasurementConfidence]: {
    domain: FunctionalDomains.MeasurementQuality,
    severity: FindingSeverities.Informational,
    recommendationTags: [],
  },
};

const BALANCE_STAGE_FINDING = {
  [BalanceStages.SideBySide]: FunctionalFindingTypes.BasicBalanceDifficulty,
  [BalanceStages.SemiTandem]: FunctionalFindingTypes.SemiTandemHoldDifficulty,
  [BalanceStages.Tandem]: FunctionalFindingTypes.TandemHoldDifficulty,
  [BalanceStages.OneLeg]: FunctionalFindingTypes.SingleLegHoldDifficulty,
};

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value) {
  if (!finite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function sourceFrom(result = {}) {
  return result.metadata?.source || result.source || null;
}

function clinicallyUsable(result = {}) {
  return (
    sourceFrom(result) === ResultSources.LivePose
    && result.status === AssessmentResultStatuses.Valid
    && result.metadata?.isClinicallyScorable !== false
  );
}

function resultConfidence(result = {}) {
  const quality = result.qualitySummary?.trackingQualityScore;
  return clamp01(Math.min(
    finite(result.confidence) ? result.confidence : 1,
    finite(quality) ? quality : 1,
  ));
}

function eventIds(result = {}, types = []) {
  const allowed = new Set(types);
  return (result.events || [])
    .filter((event) => !types.length || allowed.has(event.type))
    .map((event) => event.eventId)
    .filter(Boolean);
}

function chairRepetitions(result = {}) {
  const primary = result.primaryMeasurements || {};
  return finite(primary.completedRepetitions)
    ? primary.completedRepetitions + (finite(primary.partialRepetitionCredit) ? primary.partialRepetitionCredit : 0)
    : null;
}

function balanceStage(result = {}, stageId) {
  return (result.primaryMeasurements?.stages || []).find((stage) => stage.stage === stageId) || null;
}

function stageHoldSeconds(stage = {}) {
  return finite(stage?.holdDurationSeconds) ? stage.holdDurationSeconds : 0;
}

function findingMeta(type, classification) {
  return classification === FindingClassifications.Primary
    ? PRIMARY_META[type]
    : SECONDARY_META[type];
}

function createFinding({
  type,
  classification,
  assessment,
  measurementKeys,
  observedValues,
  comparisonReference,
  confidence,
  eventIds: evidenceEventIds = [],
  config,
}) {
  const meta = findingMeta(type, classification);
  const finding = {
    findingId: createTypedId('finding'),
    assessmentId: assessment.assessmentId,
    findingType: type,
    domain: meta.domain,
    classification,
    severity: meta.severity,
    confidence: clamp01(confidence),
    evidence: {
      assessmentType: assessment.assessmentType,
      sourceAssessmentIds: [assessment.assessmentId],
      measurementKeys,
      eventIds: evidenceEventIds,
      observedValues,
      comparisonReference,
    },
    userMessageKey: `finding.${type}`,
    userMessage: config.messages[type],
    recommendationTags: meta.recommendationTags,
  };
  return {
    value: finding,
    validation: validateFunctionalFinding(finding),
  };
}

function addFinding(list, args) {
  const item = createFinding(args);
  list.push(item);
}

function observationsObject(result = {}) {
  if (!Array.isArray(result.secondaryObservations)) return result.secondaryObservations || {};
  const out = {};
  for (const observation of result.secondaryObservations) {
    const type = observation.type || observation.observationType;
    if (type) out[type] = observation;
  }
  return out;
}

function observationConfidence(value, fallback = 1) {
  if (value && typeof value === 'object' && finite(value.confidence)) return value.confidence;
  return fallback;
}

function observationValue(value, keys = []) {
  if (!value || typeof value !== 'object') return finite(value) ? value : null;
  for (const key of keys) {
    if (finite(value[key])) return value[key];
  }
  if (finite(value.value)) return value.value;
  return null;
}

function hasLowAssessmentConfidence(result, config) {
  return resultConfidence(result) < config.confidence.minimumAssessmentConfidence;
}

function addLowMeasurementFinding(findings, assessment, config, reasonCode, observedValues = {}) {
  if (findings.some((item) => item.value.findingType === FunctionalFindingTypes.LowMeasurementConfidence && item.value.assessmentId === assessment.assessmentId)) {
    return;
  }
  addFinding(findings, {
    type: FunctionalFindingTypes.LowMeasurementConfidence,
    classification: FindingClassifications.Secondary,
    assessment,
    measurementKeys: ['confidence', 'qualitySummary.trackingQualityScore'],
    observedValues: {
      confidence: assessment.confidence,
      trackingQualityScore: assessment.qualitySummary?.trackingQualityScore,
      reasonCode,
      ...observedValues,
    },
    comparisonReference: `minimum confidence ${config.confidence.minimumAssessmentConfidence}`,
    confidence: Math.max(0.2, resultConfidence(assessment)),
    config,
  });
}

function addChairPrimaryFindings(findings, chair, { profile, ageYears, gender, config }) {
  if (!chair) return;
  const reps = chairRepetitions(chair);
  const resolvedAge = finite(ageYears) ? ageYears : ageYearsFromProfile(profile);
  const resolvedGender = normalizeSteadiGender(gender ?? profile?.sex);
  const cutoff = chairStandBelowAverageThreshold(resolvedAge, resolvedGender);
  if (finite(reps) && finite(cutoff) && reps < cutoff) {
    addFinding(findings, {
      type: FunctionalFindingTypes.ChairStandBelowReference,
      classification: FindingClassifications.Primary,
      assessment: chair,
      measurementKeys: ['primaryMeasurements.completedRepetitions', 'primaryMeasurements.partialRepetitionCredit'],
      observedValues: {
        completedRepetitions: chair.primaryMeasurements.completedRepetitions,
        partialRepetitionCredit: chair.primaryMeasurements.partialRepetitionCredit,
        scoredRepetitions: reps,
        ageYears: resolvedAge,
        gender: resolvedGender,
      },
      comparisonReference: `CDC STEADI below-average threshold: ${cutoff} chair stands`,
      confidence: resultConfidence(chair),
      eventIds: eventIds(chair),
      config,
    });
  }

  if (chair.primaryMeasurements?.armUse === ArmUseStates.Confirmed) {
    addFinding(findings, {
      type: FunctionalFindingTypes.ArmSupportRequired,
      classification: FindingClassifications.Primary,
      assessment: chair,
      measurementKeys: ['primaryMeasurements.armUse'],
      observedValues: {
        armUse: chair.primaryMeasurements.armUse,
      },
      comparisonReference: '30-second Chair Stand protocol requires arms crossed without support.',
      confidence: resultConfidence(chair),
      eventIds: eventIds(chair, ['ARM_USE_CONFIRMED']),
      config,
    });
  }
}

function addBalancePrimaryFindings(findings, balance, { config }) {
  if (!balance) return;
  for (const stageId of [BalanceStages.SideBySide, BalanceStages.SemiTandem, BalanceStages.Tandem, BalanceStages.OneLeg]) {
    const stage = balanceStage(balance, stageId);
    if (!stage) continue;
    const holdSeconds = stageHoldSeconds(stage);
    const failed = stage.status === BalanceStageStatuses.Failed
      || stage.status === BalanceStageStatuses.Invalid
      || (
        stage.status !== BalanceStageStatuses.NotAttempted
        && holdSeconds < config.cdc.tandemHoldSeconds
      );
    if (!failed) continue;
    const type = BALANCE_STAGE_FINDING[stageId];
    addFinding(findings, {
      type,
      classification: FindingClassifications.Primary,
      assessment: balance,
      measurementKeys: [`primaryMeasurements.stages.${stageId}.holdDurationSeconds`, `primaryMeasurements.stages.${stageId}.status`],
      observedValues: {
        stage: stageId,
        holdDurationSeconds: holdSeconds,
        status: stage.status,
        failureReason: stage.failureReason,
      },
      comparisonReference: `${config.cdc.tandemHoldSeconds} second hold target`,
      confidence: clamp01(stage.positionConfidence ?? resultConfidence(balance)),
      eventIds: eventIds(balance),
      config,
    });
    break;
  }

  const supportStage = (balance.primaryMeasurements?.stages || []).find((stage) => stage.failureReason === 'SUPPORT_USED');
  if (supportStage) {
    addFinding(findings, {
      type: FunctionalFindingTypes.ArmSupportRequired,
      classification: FindingClassifications.Primary,
      assessment: balance,
      measurementKeys: [`primaryMeasurements.stages.${supportStage.stage}.failureReason`],
      observedValues: {
        stage: supportStage.stage,
        failureReason: supportStage.failureReason,
      },
      comparisonReference: '4-Stage Balance Test hold requires no support use.',
      confidence: clamp01(supportStage.positionConfidence ?? resultConfidence(balance)),
      eventIds: eventIds(balance, ['SUPPORT_USED']),
      config,
    });
  }
}

function addSecondaryFindingWithConfidence(findings, {
  assessment,
  type,
  measurementKeys,
  observedValues,
  comparisonReference,
  confidence,
  config,
}) {
  if (confidence < config.confidence.minimumSecondaryConfidence) {
    addLowMeasurementFinding(findings, assessment, config, `LOW_CONFIDENCE_${type}`, observedValues);
    return;
  }
  addFinding(findings, {
    type,
    classification: FindingClassifications.Secondary,
    assessment,
    measurementKeys,
    observedValues,
    comparisonReference,
    confidence: Math.min(confidence, resultConfidence(assessment)),
    eventIds: eventIds(assessment),
    config,
  });
}

function addChairSecondaryFindings(findings, chair, { config }) {
  if (!chair) return;
  const observations = observationsObject(chair);
  if (hasLowAssessmentConfidence(chair, config)) {
    addLowMeasurementFinding(findings, chair, config, 'LOW_ASSESSMENT_CONFIDENCE');
    return;
  }
  if (observations.contradictorySpeedPattern === true) {
    addLowMeasurementFinding(findings, chair, config, 'CONFLICTING_SPEED_OBSERVATIONS', {
      speedChangeRatio: observations.speedChangeRatio,
    });
  } else if (finite(observations.speedChangeRatio) && observations.speedChangeRatio >= config.secondaryObservation.lateRepetitionSlowdownRatio) {
    addSecondaryFindingWithConfidence(findings, {
      assessment: chair,
      type: FunctionalFindingTypes.LateRepetitionSlowdown,
      measurementKeys: ['secondaryObservations.speedChangeRatio'],
      observedValues: { speedChangeRatio: observations.speedChangeRatio },
      comparisonReference: `late/early repetition duration ratio >= ${config.secondaryObservation.lateRepetitionSlowdownRatio}`,
      confidence: observations.speedChangeConfidence ?? resultConfidence(chair),
      config,
    });
  }

  if (finite(observations.maxTrunkLeanDegrees) && observations.maxTrunkLeanDegrees >= config.secondaryObservation.trunkCompensationDegrees) {
    addSecondaryFindingWithConfidence(findings, {
      assessment: chair,
      type: FunctionalFindingTypes.TrunkCompensationPattern,
      measurementKeys: ['secondaryObservations.maxTrunkLeanDegrees'],
      observedValues: { maxTrunkLeanDegrees: observations.maxTrunkLeanDegrees },
      comparisonReference: `trunk lean observation threshold ${config.secondaryObservation.trunkCompensationDegrees} degrees`,
      confidence: observations.trunkLeanConfidence ?? resultConfidence(chair),
      config,
    });
  }

  if (
    finite(observations.maxLeftRightKneeAngleDifferenceDegrees)
    && observations.maxLeftRightKneeAngleDifferenceDegrees >= config.secondaryObservation.movementAsymmetryDegrees
  ) {
    addSecondaryFindingWithConfidence(findings, {
      assessment: chair,
      type: FunctionalFindingTypes.MovementAsymmetryPattern,
      measurementKeys: ['secondaryObservations.maxLeftRightKneeAngleDifferenceDegrees'],
      observedValues: {
        maxLeftRightKneeAngleDifferenceDegrees: observations.maxLeftRightKneeAngleDifferenceDegrees,
      },
      comparisonReference: `left/right movement difference observation threshold ${config.secondaryObservation.movementAsymmetryDegrees} degrees`,
      confidence: observations.asymmetryConfidence ?? resultConfidence(chair),
      config,
    });
  }

  if (finite(observations.incompleteRepetitionCount) && observations.incompleteRepetitionCount >= config.secondaryObservation.frequentCorrectionCount) {
    addSecondaryFindingWithConfidence(findings, {
      assessment: chair,
      type: FunctionalFindingTypes.FrequentPositionCorrection,
      measurementKeys: ['secondaryObservations.incompleteRepetitionCount'],
      observedValues: { incompleteRepetitionCount: observations.incompleteRepetitionCount },
      comparisonReference: `incomplete repetitions >= ${config.secondaryObservation.frequentCorrectionCount}`,
      confidence: resultConfidence(chair),
      config,
    });
  }
}

function addBalanceSecondaryFindings(findings, balance, { config }) {
  if (!balance) return;
  const observations = observationsObject(balance);
  if (hasLowAssessmentConfidence(balance, config)) {
    addLowMeasurementFinding(findings, balance, config, 'LOW_ASSESSMENT_CONFIDENCE');
    return;
  }
  const sway = observations.swayObservation || observations;
  const mlRange = observationValue(sway.mediolateralRangeFootLengths ?? sway.mediolateralSwayFootLengths, ['rangeFootLengths', 'value']);
  const apRange = observationValue(sway.anteriorPosteriorRangeFootLengths ?? sway.anteriorPosteriorSwayFootLengths, ['rangeFootLengths', 'value']);
  const swayConfidence = observationConfidence(sway, resultConfidence(balance));
  if (finite(mlRange) && mlRange >= config.secondaryObservation.swayRangeFootLengths) {
    addSecondaryFindingWithConfidence(findings, {
      assessment: balance,
      type: FunctionalFindingTypes.MediolateralSwayPattern,
      measurementKeys: ['secondaryObservations.swayObservation.mediolateralRangeFootLengths'],
      observedValues: { mediolateralRangeFootLengths: mlRange },
      comparisonReference: `relative side-to-side movement >= ${config.secondaryObservation.swayRangeFootLengths} foot lengths`,
      confidence: swayConfidence,
      config,
    });
  }
  if (finite(apRange) && apRange >= config.secondaryObservation.swayRangeFootLengths) {
    addSecondaryFindingWithConfidence(findings, {
      assessment: balance,
      type: FunctionalFindingTypes.AnteriorPosteriorSwayPattern,
      measurementKeys: ['secondaryObservations.swayObservation.anteriorPosteriorRangeFootLengths'],
      observedValues: { anteriorPosteriorRangeFootLengths: apRange },
      comparisonReference: `relative forward/back movement >= ${config.secondaryObservation.swayRangeFootLengths} foot lengths`,
      confidence: swayConfidence,
      config,
    });
  }
  const correctionCount = finite(observations.positionCorrectionCount)
    ? observations.positionCorrectionCount
    : (balance.primaryMeasurements?.stages || []).filter((stage) => ['FOOT_MOVED', 'POSITION_LOST'].includes(stage.failureReason)).length;
  if (correctionCount >= config.secondaryObservation.frequentCorrectionCount) {
    addSecondaryFindingWithConfidence(findings, {
      assessment: balance,
      type: FunctionalFindingTypes.FrequentPositionCorrection,
      measurementKeys: ['secondaryObservations.positionCorrectionCount', 'primaryMeasurements.stages.failureReason'],
      observedValues: { positionCorrectionCount: correctionCount },
      comparisonReference: `position corrections >= ${config.secondaryObservation.frequentCorrectionCount}`,
      confidence: observations.positionCorrectionConfidence ?? resultConfidence(balance),
      config,
    });
  }
}

function validationFromFindings(items) {
  const failures = items.flatMap((item) => (item.validation.ok ? [] : item.validation.failures));
  return failures.length ? { ok: false, failures } : { ok: true, failures: [] };
}

export function createFunctionalFindings({
  assessmentResults = [],
  chairStandResult = null,
  balanceResult = null,
  profile = {},
  ageYears,
  gender,
  config = functionalFindingsConfig,
} = {}) {
  const chair = chairStandResult || assessmentResults.find((result) => result.assessmentType === AssessmentTypes.ChairStand30s) || null;
  const balance = balanceResult || assessmentResults.find((result) => result.assessmentType === AssessmentTypes.FourStageBalance) || null;
  const inputs = [chair, balance].filter(Boolean);
  const nonClinical = inputs.find((result) => !clinicallyUsable(result));
  if (nonClinical) {
    return {
      value: [],
      validation: {
        ok: false,
        failures: [{
          code: 'NON_CLINICAL_FINDING_INPUT',
          path: 'assessmentResults',
          message: 'Functional findings require valid LIVE_POSE assessments.',
          receivedValue: nonClinical.status || sourceFrom(nonClinical),
        }],
      },
      reasonCodes: ['NON_CLINICAL_FINDING_INPUT'],
    };
  }

  const findings = [];
  addChairPrimaryFindings(findings, chair, { profile, ageYears, gender, config });
  addBalancePrimaryFindings(findings, balance, { config });
  addChairSecondaryFindings(findings, chair, { config });
  addBalanceSecondaryFindings(findings, balance, { config });
  const value = findings.map((item) => item.value);
  return {
    value,
    validation: validationFromFindings(findings),
    reasonCodes: [],
  };
}
