export const DisplayRiskLevels = {
  Low: 'LOW',
  Moderate: 'MODERATE',
  High: 'HIGH',
  NeedsReview: 'NEEDS_REVIEW',
  NotScorable: 'NOT_SCORABLE',
};

export function testLabel(testType) {
  if (testType === 'four_stage_balance') return '4-Stage Balance Test';
  if (testType === 'chair_stand') return '30-Second Chair Stand Test';
  if (testType === 'standing_posture' || testType === 'balance_hold') return 'Standing Posture';
  return 'Movement Check';
}

export function recommendationLabel(level) {
  if (level === 'steady' || level === DisplayRiskLevels.Low || level === 'LOW') return 'Steady';
  if (level === 'practice_needed' || level === DisplayRiskLevels.Moderate || level === 'MODERATE') return 'Practice Recommended';
  if (level === 'measurement_only') return 'Measured';
  return 'Recheck Needed';
}

function percent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not available';
  return `${Math.round(number * 100)}%`;
}

export function resultFlagsFor(result = {}, testType = 'chair_stand') {
  const primaryValue = result.primaryValue ?? result.repetitionCount ?? result.count ?? null;
  const primaryLabel = result.primaryLabel || (testType === 'chair_stand' ? 'Chair stands' : 'Measured value');

  if (result.invalid || result.status === 'INVALID' || result.status === 'INCOMPLETE') {
    return [
      'We could not measure this test reliably.',
      'Please adjust the camera and try again.',
    ];
  }

  if (testType === 'four_stage_balance') {
    const stages = result.structuredPipeline?.assessmentResult?.primaryMeasurements?.stages
      || result.balanceResult?.stages
      || [];
    if (stages.length) {
      return stages.map((stage) => {
        const label = stage.stage || stage.title || stage.id || 'Stage';
        const hold = Number(stage.holdDurationSeconds ?? stage.holdSeconds ?? 0);
        return `${label}: ${Number.isFinite(hold) ? hold.toFixed(1) : '0.0'} seconds measured.`;
      });
    }
    return [
      primaryValue === null ? 'Balance hold time was not measured.' : `${primaryLabel}: ${primaryValue}`,
      '4-Stage Balance Test measurement captured.',
    ];
  }

  if (testType === 'chair_stand') {
    return [
      primaryValue === null ? 'Chair stand count was not measured.' : `${primaryLabel}: ${primaryValue}`,
      `Pose confidence ${percent(result.confidence ?? result.features?.confidence)}`,
      `Tracking quality ${percent(result.trackingQualityScore ?? result.trackingQualitySummary?.trackingQualityScore)}`,
    ];
  }

  return [
    primaryValue === null ? 'No direct test result is available.' : `${primaryLabel}: ${primaryValue}`,
  ];
}
