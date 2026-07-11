import {
  AssessmentResultStatuses,
  AssessmentTypes,
  BalanceStages,
  ResultSources,
  SteadiRiskLevels,
} from '../../shared/types/index.js';
import { validateSteadiScoreResult } from '../../shared/validation/runtimeValidation.js';
import {
  STEADI_FALL_RISK_SCHEMA_VERSION,
  ageYearsFromProfile,
  chairStandBelowAverageThreshold,
  normalizeSteadiGender,
} from '../../../pose/steadiRules.js';

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clinicallyScorable(result = {}) {
  return (
    result.status === AssessmentResultStatuses.Valid
    && result.metadata?.source === ResultSources.LivePose
    && result.metadata?.isClinicallyScorable === true
  );
}

function notScorableResult({ reasonCodes = ['NOT_SCORABLE_INPUT'], inputs = {} } = {}) {
  const value = {
    riskLevel: SteadiRiskLevels.NotScorable,
    strengthProblem: SteadiRiskLevels.NotScorable,
    balanceProblem: SteadiRiskLevels.NotScorable,
    inputs,
    appliedRuleVersion: STEADI_FALL_RISK_SCHEMA_VERSION,
    reasonCodes,
  };
  return {
    value,
    validation: validateSteadiScoreResult(value),
  };
}

function riskLevelFromSignals(signalCount) {
  if (signalCount >= 2) return SteadiRiskLevels.High;
  if (signalCount === 1) return SteadiRiskLevels.Moderate;
  return SteadiRiskLevels.Low;
}

function assessmentByType(results, assessmentType) {
  return results.find((result) => result?.assessmentType === assessmentType) || null;
}

function tandemHoldSeconds(result) {
  const stages = result?.primaryMeasurements?.stages;
  if (!Array.isArray(stages)) return null;
  const tandem = stages.find((stage) => stage?.stage === BalanceStages.Tandem);
  return finiteNumber(tandem?.holdDurationSeconds);
}

export function legacySteadiToSteadiScoreResult({
  assessmentResults = [],
  profile = {},
  referenceDate = new Date(),
} = {}) {
  const results = Array.isArray(assessmentResults) ? assessmentResults : [];
  const chair = assessmentByType(results, AssessmentTypes.ChairStand30s);
  const balance = assessmentByType(results, AssessmentTypes.FourStageBalance);
  const baseInputs = {
    assessmentCount: results.length,
    chairStandAssessmentId: chair?.assessmentId || null,
    balanceAssessmentId: balance?.assessmentId || null,
  };

  if (!chair || !balance) {
    return notScorableResult({ reasonCodes: ['MISSING_REQUIRED_ASSESSMENT'], inputs: baseInputs });
  }
  if (!clinicallyScorable(chair) || !clinicallyScorable(balance)) {
    return notScorableResult({ reasonCodes: ['NON_CLINICAL_ASSESSMENT_RESULT'], inputs: baseInputs });
  }

  const repetitions = finiteNumber(chair?.primaryMeasurements?.completedRepetitions);
  const tandemSeconds = tandemHoldSeconds(balance);
  const ageYears = ageYearsFromProfile(profile, referenceDate);
  const gender = normalizeSteadiGender(profile?.sex ?? profile?.gender);
  const chairThreshold = chairStandBelowAverageThreshold(ageYears, gender);
  const missingInputs = [];

  if (repetitions === null) missingInputs.push('chairStand.completedRepetitions');
  if (tandemSeconds === null) missingInputs.push('balance.tandemHoldSeconds');
  if (ageYears === null) missingInputs.push('profile.age');
  if (!gender) missingInputs.push('profile.sex');
  if (chairThreshold === null) missingInputs.push('chairStandBelowAverageThreshold');

  const inputs = {
    ...baseInputs,
    ageYears,
    gender,
    repetitions,
    chairThreshold,
    tandemSeconds,
    tandemReferenceSeconds: 10,
  };

  if (missingInputs.length > 0) {
    return notScorableResult({
      reasonCodes: ['MISSING_STEADI_SCORING_INPUT'],
      inputs: { ...inputs, missingInputs },
    });
  }

  const strengthProblem = repetitions < chairThreshold;
  const balanceProblem = tandemSeconds < 10;
  const signalCount = [strengthProblem, balanceProblem].filter(Boolean).length;
  const value = {
    riskLevel: riskLevelFromSignals(signalCount),
    strengthProblem,
    balanceProblem,
    inputs,
    appliedRuleVersion: STEADI_FALL_RISK_SCHEMA_VERSION,
    reasonCodes: [
      strengthProblem ? 'CHAIR_STAND_BELOW_REFERENCE' : 'CHAIR_STAND_AT_OR_ABOVE_REFERENCE',
      balanceProblem ? 'TANDEM_STAND_UNDER_10_SECONDS' : 'TANDEM_STAND_10_SECONDS',
    ],
  };

  return {
    value,
    validation: validateSteadiScoreResult(value),
  };
}
