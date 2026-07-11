import {
  AssessmentStatuses,
  ResultSources,
  sourceFromResult,
} from '../../pose/assessmentResultMetadata.js';

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function percent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not available';
  const normalized = number <= 1 ? number * 100 : number;
  return `${Math.round(normalized)}%`;
}

function round(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return digits > 0 ? number.toFixed(digits) : String(Math.round(number));
}

function exerciseName(exercise = {}) {
  return exercise.displayName || exercise.title || exercise.name || exercise.exerciseId || 'Recommended practice';
}

function exerciseReason(exercise = {}) {
  return exercise.reasonMessages?.[0]
    || exercise.reason
    || exercise.reasonCodes?.[0]
    || 'Selected from the structured exercise recommendation rules.';
}

function exerciseSupportText(exercise = {}) {
  if (exercise.supportRequirement === 'STABLE_SUPPORT') return 'Use a stable chair, counter, or rail for support.';
  if (exercise.supportRequirement === 'PROFESSIONAL_SUPERVISION') return 'Complete this only with professional supervision.';
  if (exercise.supportRequirement === 'CAREGIVER_NEARBY') {
    return 'Please complete this exercise with a family member or trained staff nearby.';
  }
  if (exercise.supervisionRequirement === 'CAREGIVER_RECOMMENDED') {
    return 'Please complete this exercise with a family member or trained staff nearby.';
  }
  return 'Move slowly and keep support nearby.';
}

const SAFETY_NOTICE_TEXT = {
  INVALID_ASSESSMENT_BLOCKED: 'We could not measure this test reliably. Please adjust the camera and try again.',
  HIGH_RISK_PROFESSIONAL_REVIEW_REQUIRED: 'A professional review is recommended before continuing.',
  RISK_NOT_SCORABLE_BLOCKED: 'A reliable risk level was not available, so exercise selection is paused.',
  MODERATE_RISK_STABLE_SUPPORT_AND_CAREGIVER_RECOMMENDED: 'Please complete this exercise with a family member or trained staff nearby.',
  ARM_SUPPORT_REQUIRED_USE_SUPPORTED_SIT_TO_STAND_ONLY: 'Use only the supported sit-to-stand version for now.',
  LOW_MEASUREMENT_CONFIDENCE_NO_SPECIFIC_EXERCISES: 'Measurement confidence was low, so no specific exercise was added.',
};

function safetyNoticeText(value) {
  return SAFETY_NOTICE_TEXT[value] || String(value || '');
}

function findingsFrom(result = {}) {
  return result.functionalFindings
    || result.structuredPipeline?.functionalFindings
    || result.carePipeline?.agent?.loop?.finalState?.activeFunctionalFindings
    || [];
}

function exercisePlanFrom(result = {}) {
  return result.structuredPipeline?.exercisePlan
    || result.recommendationPlan
    || result.carePipeline?.agent?.loop?.finalState?.currentExercisePlan
    || null;
}

function exercisesFrom(result = {}) {
  const plan = exercisePlanFrom(result);
  return plan?.selectedExercises
    || plan?.recommendedExercises
    || result.recommendedExercises
    || [];
}

function directResultText(result = {}) {
  const testType = result.testType || result.selectedTest;
  if (testType === 'chair_stand') {
    const reps = round(
      result.structuredPipeline?.assessmentResult?.primaryMeasurements?.completedRepetitions
        ?? result.primaryValue
        ?? result.repetitionCount
        ?? result.count,
    );
    return reps === null
      ? 'The chair stand count was not measured.'
      : `You completed ${reps} full stands in 30 seconds.`;
  }
  if (testType === 'four_stage_balance') {
    const structuredStages = result.structuredPipeline?.assessmentResult?.primaryMeasurements?.stages || [];
    const tandem = structuredStages.find((stage) => stage.stage === 'TANDEM');
    const hold = round(
      tandem?.holdDurationSeconds
        ?? result.balanceResult?.stageById?.tandem?.holdSeconds
        ?? result.primaryValue
        ?? result.count,
      1,
    );
    return hold === null
      ? 'The balance hold time was not measured.'
      : `You held the tandem position for ${hold} seconds.`;
  }
  const value = round(result.primaryValue ?? result.count, 1);
  return value === null ? 'No direct test result is available.' : `Measured result: ${value}.`;
}

function qualityItems(result = {}) {
  const status = result.status || (result.invalid ? AssessmentStatuses.Invalid : AssessmentStatuses.Valid);
  const source = sourceFromResult(result) || ResultSources.Fallback;
  const confidence = result.structuredPipeline?.assessmentResult?.confidence
    ?? result.confidence
    ?? result.trackingQualityScore
    ?? result.features?.confidence;
  const qualityScore = result.structuredPipeline?.assessmentResult?.qualitySummary?.trackingQualityScore
    ?? result.trackingQualitySummary?.trackingQualityScore
    ?? result.trackingQualityScore;
  return [
    { label: 'Result status', value: status },
    { label: 'Source', value: source === ResultSources.LivePose ? 'Live camera measurement' : 'Not a live clinical measurement' },
    { label: 'Pose confidence', value: percent(confidence) },
    { label: 'Tracking quality', value: percent(qualityScore) },
  ];
}

function safetyNotice(result = {}) {
  const plan = exercisePlanFrom(result);
  if (plan?.requiresProfessionalReview) return 'A professional review is recommended before continuing.';
  if (result.recommendationPlan?.safetyNotices?.length) {
    return result.recommendationPlan.safetyNotices.map(safetyNoticeText).join(' ');
  }
  if (plan?.safetyNotices?.length) return plan.safetyNotices.map(safetyNoticeText).join(' ');
  if (plan?.supervisionRequirement === 'CAREGIVER_RECOMMENDED') {
    return 'Please complete this exercise with a family member or trained staff nearby.';
  }
  if (result.invalid || result.status === AssessmentStatuses.Invalid || result.status === AssessmentStatuses.Incomplete) {
    return 'We could not measure this test reliably. Please adjust the camera and try again.';
  }
  return 'Keep support nearby and stop if you feel pain, chest discomfort, or strong dizziness.';
}

export function createResultViewModel(result = {}) {
  const plan = exercisePlanFrom(result);
  const findings = findingsFrom(result);
  const exercises = exercisesFrom(result);
  const invalid = result.invalid
    || result.status === AssessmentStatuses.Invalid
    || result.status === AssessmentStatuses.Incomplete
    || result.status === AssessmentStatuses.Cancelled
    || result.status === AssessmentStatuses.TrackingFailed;

  return {
    invalid,
    measurementQuality: qualityItems(result),
    directResult: {
      title: invalid ? 'Measurement unavailable' : 'Direct test result',
      message: invalid
        ? 'We could not measure this test reliably.'
        : directResultText(result),
    },
    findings: findings.map((finding) => ({
      id: finding.findingId || finding.findingType || finding.type,
      title: finding.userMessage || finding.message || finding.findingType || finding.type,
      classification: finding.classification || 'OBSERVATION',
      confidence: percent(finding.confidence),
      evidence: finding.evidence?.comparisonReference || '',
    })),
    exercises: exercises.map((exercise) => ({
      id: exercise.exerciseId || exercise.exerciseKey || exercise.id || exerciseName(exercise),
      title: exerciseName(exercise),
      level: exercise.level || exercise.type || 'guided',
      target: [
        finite(Number(exercise.sets)) ? `${exercise.sets} set${Number(exercise.sets) === 1 ? '' : 's'}` : null,
        finite(Number(exercise.repetitions)) ? `${exercise.repetitions} reps` : null,
      ].filter(Boolean).join(', ') || exercise.type || 'Guided practice',
      reason: exerciseReason(exercise),
      support: exerciseSupportText(exercise),
      safetyMessageKeys: exercise.safetyMessageKeys || [],
    })),
    reasonTrace: exercises.flatMap((exercise) => (
      exercise.reasonMessages?.length
        ? exercise.reasonMessages
        : [exerciseReason(exercise)]
    )),
    safetyNotice: safetyNotice(result),
    nextAction: result.agentDecision?.userMessage
      || result.agentDecision?.seniorMessage
      || result.carePipeline?.agent?.decision?.userMessage
      || result.recommendationPlan?.nextAction
      || 'Continue with the next planned step.',
    planStatus: plan?.status || null,
  };
}
