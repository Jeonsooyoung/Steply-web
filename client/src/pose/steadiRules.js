export const SteadiAssessmentRules = {
  ChairStandDurationSeconds: 30,
  BalanceHoldSeconds: 10,
  TugRiskSeconds: 12,
  ChairStandRuleSummary:
    'Counts complete stands during 30 seconds. If the user is more than halfway up at the end, it is credited as one rep.',
  ChairStandArmRule:
    'If arms are used during standing, the official Chair Stand score is treated as 0.',
  BalanceRuleSummary:
    'Hold balance for 10 seconds without moving feet or grabbing support.',
  TugRuleSummary:
    'Measures standing up, walking 10 feet, turning, returning, and sitting; 12 seconds or more is considered a fall-risk signal.',
};

const menChairStandBelowAverage = [
  { min: 60, max: 64, belowAverageScore: 14 },
  { min: 65, max: 69, belowAverageScore: 12 },
  { min: 70, max: 74, belowAverageScore: 12 },
  { min: 75, max: 79, belowAverageScore: 11 },
  { min: 80, max: 84, belowAverageScore: 10 },
  { min: 85, max: 89, belowAverageScore: 8 },
  { min: 90, max: 94, belowAverageScore: 7 },
];

const womenChairStandBelowAverage = [
  { min: 60, max: 64, belowAverageScore: 12 },
  { min: 65, max: 69, belowAverageScore: 11 },
  { min: 70, max: 74, belowAverageScore: 10 },
  { min: 75, max: 79, belowAverageScore: 10 },
  { min: 80, max: 84, belowAverageScore: 9 },
  { min: 85, max: 89, belowAverageScore: 8 },
  { min: 90, max: 94, belowAverageScore: 4 },
];

export function chairStandBelowAverageThreshold(ageYears, gender) {
  if (!ageYears || !gender) return null;
  const g = String(gender).trim().toLowerCase();
  const table = g.startsWith('f') || g.includes('woman') || g.includes('female')
    ? womenChairStandBelowAverage
    : g.startsWith('m') || g.includes('man') || g.includes('male')
      ? menChairStandBelowAverage
      : null;
  if (!table) return null;
  return table.find((row) => ageYears >= row.min && ageYears <= row.max)?.belowAverageScore ?? null;
}
