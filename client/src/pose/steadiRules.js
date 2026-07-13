export const SteadiAssessmentRules = {
  ChairStandDurationSeconds: 30,
  BalanceHoldSeconds: 10,
  BalanceTandemRiskSignalSeconds: 10,
  ChairStandRuleSummary:
    'Counts complete stands during 30 seconds. If the user is more than halfway up at the end, it is credited as one rep.',
  ChairStandArmRule:
    'If arms are used during standing, the official Chair Stand score is treated as 0.',
  BalanceRuleSummary:
    'Hold balance for 10 seconds without moving feet or grabbing support.',
};

export const STEADI_FALL_RISK_SCHEMA_VERSION = 'steadi_fall_risk.v1';

export const SteadiRiskLevels = {
  Low: 'low_risk',
  Medium: 'medium_risk',
  High: 'high_risk',
};

export const SteadiRiskLabels = {
  [SteadiRiskLevels.Low]: 'Low',
  [SteadiRiskLevels.Medium]: 'Moderate',
  [SteadiRiskLevels.High]: 'Needs Review',
};

export const SteadiRiskSignalIds = {
  BalanceTandemUnder10Seconds: 'balance_tandem_under_10_seconds',
  ChairStandBelowAgeSexAverage: 'chair_stand_below_age_sex_average',
};

// Source: CDC STEADI 30-Second Chair Stand Test, below-average scores by age and sex.
export const SteadiChairStandBelowAverageTable = {
  male: [
    { min: 60, max: 64, belowAverageScore: 14 },
    { min: 65, max: 69, belowAverageScore: 12 },
    { min: 70, max: 74, belowAverageScore: 12 },
    { min: 75, max: 79, belowAverageScore: 11 },
    { min: 80, max: 84, belowAverageScore: 10 },
    { min: 85, max: 89, belowAverageScore: 8 },
    { min: 90, max: 94, belowAverageScore: 7 },
  ],
  female: [
    { min: 60, max: 64, belowAverageScore: 12 },
    { min: 65, max: 69, belowAverageScore: 11 },
    { min: 70, max: 74, belowAverageScore: 10 },
    { min: 75, max: 79, belowAverageScore: 10 },
    { min: 80, max: 84, belowAverageScore: 9 },
    { min: 85, max: 89, belowAverageScore: 8 },
    { min: 90, max: 94, belowAverageScore: 4 },
  ],
};

// Source: CDC STEADI 4-Stage Balance Test; tandem stance under 10 seconds is a fall-risk signal.
export const SteadiBalanceRiskCutoffs = {
  tandemHoldSeconds: 10,
};

const KOREAN_GENDER_MARKER_CODES = ['c5ec', 'b0a8'];

function koreanGenderMarker(index) {
  return String.fromCharCode(Number.parseInt(KOREAN_GENDER_MARKER_CODES[index], 16));
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeSteadiGender(gender) {
  if (!gender) return null;
  const normalized = String(gender).trim().toLowerCase();
  if (
    normalized === 'f'
    || normalized.startsWith('f')
    || normalized.includes('female')
    || normalized.includes('woman')
    || normalized.includes('women')
    || normalized.includes(koreanGenderMarker(0))
  ) {
    return 'female';
  }
  if (
    normalized === 'm'
    || normalized.startsWith('m')
    || normalized.includes('male')
    || normalized.includes('man')
    || normalized.includes('men')
    || normalized.includes(koreanGenderMarker(1))
  ) {
    return 'male';
  }
  return null;
}

export function ageYearsFromProfile(profile, referenceDate = new Date()) {
  if (!profile) return null;
  const directAge = finiteNumber(profile.ageYears);
  if (directAge !== null) return directAge;

  const birthYear = finiteNumber(profile.birthYear ?? profile.birth_year ?? profile.yearOfBirth);
  if (birthYear !== null && birthYear > 1900) {
    return Math.max(0, referenceDate.getFullYear() - birthYear);
  }

  const birthDateValue = profile.birthDate ?? profile.birth_date ?? profile.dateOfBirth;
  if (!birthDateValue) return null;
  const birthDate = new Date(birthDateValue);
  if (Number.isNaN(birthDate.getTime())) return null;
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const hasHadBirthday = referenceDate.getMonth() > birthDate.getMonth()
    || (referenceDate.getMonth() === birthDate.getMonth() && referenceDate.getDate() >= birthDate.getDate());
  if (!hasHadBirthday) age -= 1;
  return Math.max(0, age);
}

export function chairStandBelowAverageThreshold(ageYears, gender) {
  const age = finiteNumber(ageYears);
  const genderKey = normalizeSteadiGender(gender);
  if (age === null || !genderKey) return null;
  const table = SteadiChairStandBelowAverageTable[genderKey];
  if (!table) return null;
  return table.find((row) => age >= row.min && age <= row.max)?.belowAverageScore ?? null;
}

export function steadiRiskLevelFromSignalCount(riskSignalCount) {
  if (riskSignalCount >= 2) return SteadiRiskLevels.High;
  if (riskSignalCount === 1) return SteadiRiskLevels.Medium;
  return SteadiRiskLevels.Low;
}

export function tandemHoldSecondsFromBalanceResult(balanceInput) {
  const balanceResult = balanceInput?.balanceResult || balanceInput;
  const directHold = finiteNumber(balanceResult?.stageById?.tandem?.holdSeconds);
  if (directHold !== null) return directHold;

  const tandemStage = Array.isArray(balanceResult?.stages)
    ? balanceResult.stages.find((stage) => stage?.id === 'tandem')
    : null;
  const stageHold = finiteNumber(tandemStage?.holdSeconds);
  if (stageHold !== null) return stageHold;

  if ((balanceInput?.testType || balanceResult?.testType) === 'four_stage_balance') {
    return finiteNumber(balanceInput?.primaryValue ?? balanceInput?.repetitionCount);
  }
  return null;
}

export function chairStandRepetitionCountFromResult(chairStandInput) {
  const chairStandResult = chairStandInput?.chairStandResult || chairStandInput;
  return finiteNumber(chairStandResult?.repetitionCount ?? chairStandInput?.repetitionCount ?? chairStandInput?.primaryValue);
}

export function balanceRiskSignalFromResult(balanceInput) {
  const observedValue = tandemHoldSecondsFromBalanceResult(balanceInput);
  const cutoffSeconds = SteadiBalanceRiskCutoffs.tandemHoldSeconds;
  const available = observedValue !== null;
  return {
    id: SteadiRiskSignalIds.BalanceTandemUnder10Seconds,
    source: 'four_stage_balance',
    metric: 'tandemHoldSeconds',
    present: available ? observedValue < cutoffSeconds : null,
    available,
    observedValue,
    cutoffSeconds,
    operator: '<',
    missingInputs: available ? [] : ['balanceResult.stageById.tandem.holdSeconds'],
  };
}

export function chairStandRiskSignalFromResult(chairStandInput, { ageYears, gender, profile } = {}) {
  const observedValue = chairStandRepetitionCountFromResult(chairStandInput);
  const resolvedAgeYears = finiteNumber(ageYears) ?? ageYearsFromProfile(profile);
  const resolvedGender = normalizeSteadiGender(gender ?? profile?.sex);
  const cutoffRepetitions = chairStandBelowAverageThreshold(resolvedAgeYears, resolvedGender);
  const missingInputs = [];

  if (observedValue === null) missingInputs.push('chairStandResult.repetitionCount');
  if (resolvedAgeYears === null) missingInputs.push('ageYears');
  if (!resolvedGender) missingInputs.push('gender');
  if (resolvedAgeYears !== null && resolvedGender && cutoffRepetitions === null) {
    missingInputs.push('chairStandBelowAverageThreshold');
  }

  const available = observedValue !== null && cutoffRepetitions !== null;
  return {
    id: SteadiRiskSignalIds.ChairStandBelowAgeSexAverage,
    source: 'chair_stand',
    metric: 'repetitionCount',
    present: available ? observedValue < cutoffRepetitions : null,
    available,
    observedValue,
    cutoffRepetitions,
    operator: '<',
    ageYears: resolvedAgeYears,
    gender: resolvedGender,
    missingInputs,
  };
}

export function calculateSteadiFallRisk({
  balanceResult,
  chairStandResult,
  ageYears,
  gender,
  profile,
} = {}) {
  const resolvedAgeYears = finiteNumber(ageYears) ?? ageYearsFromProfile(profile);
  const resolvedGender = normalizeSteadiGender(gender ?? profile?.sex);
  const signals = {
    balanceTandem: balanceRiskSignalFromResult(balanceResult),
    chairStandBelowAverage: chairStandRiskSignalFromResult(chairStandResult, {
      ageYears: resolvedAgeYears,
      gender: resolvedGender,
    }),
  };
  const signalList = Object.values(signals);
  const riskSignalCount = signalList.filter((signal) => signal.present === true).length;
  const riskLevel = steadiRiskLevelFromSignalCount(riskSignalCount);
  const missingInputs = [...new Set(signalList.flatMap((signal) => signal.missingInputs || []))];

  return {
    schemaVersion: STEADI_FALL_RISK_SCHEMA_VERSION,
    risk: riskLevel,
    riskLevel,
    riskLabel: SteadiRiskLabels[riskLevel],
    riskSignalCount,
    maxRiskSignalCount: signalList.length,
    complete: signalList.every((signal) => signal.available),
    missingInputs,
    signals,
    inputs: {
      ageYears: resolvedAgeYears,
      gender: resolvedGender,
      tandemHoldCutoffSeconds: SteadiBalanceRiskCutoffs.tandemHoldSeconds,
      chairStandBelowAverageThreshold: signals.chairStandBelowAverage.cutoffRepetitions,
    },
  };
}

export const calculateSteadiRisk = calculateSteadiFallRisk;
