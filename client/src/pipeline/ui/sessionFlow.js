import {
  AssessmentStatuses,
  canGenerateExerciseRecommendation,
  canUseClinicalPipeline,
} from '../../pose/assessmentResultMetadata.js';

export const UserScreenIds = {
  Start: 'START',
  SafetyCheck: 'SAFETY_CHECK',
  CameraSetup: 'CAMERA_SETUP',
  Calibration: 'CALIBRATION',
  Assessment: 'ASSESSMENT',
  Result: 'RESULT',
  Exercise: 'EXERCISE',
  Completion: 'COMPLETION',
  Progress: 'PROGRESS',
};

export const UserScreenLabels = {
  [UserScreenIds.Start]: 'Start',
  [UserScreenIds.SafetyCheck]: 'Safety check',
  [UserScreenIds.CameraSetup]: 'Camera setup',
  [UserScreenIds.Calibration]: 'Calibration',
  [UserScreenIds.Assessment]: 'Assessment',
  [UserScreenIds.Result]: 'Result',
  [UserScreenIds.Exercise]: 'Exercise',
  [UserScreenIds.Completion]: 'Completion',
  [UserScreenIds.Progress]: 'Progress',
};

const LEGACY_ACTIVE_STEP_TO_SCREEN = {
  start: UserScreenIds.Start,
  analysis: UserScreenIds.Assessment,
  result: UserScreenIds.Result,
  exercise: UserScreenIds.Exercise,
  progress: UserScreenIds.Progress,
};

export function screenFromActiveStep(activeStep) {
  if (Object.values(UserScreenIds).includes(activeStep)) return activeStep;
  return LEGACY_ACTIVE_STEP_TO_SCREEN[activeStep] || UserScreenIds.Start;
}

export function activeStepFromScreen(screenId) {
  if (Object.values(UserScreenIds).includes(screenId)) return screenId;
  return UserScreenIds.Start;
}

export function hasClinicalResult(result = null) {
  return Boolean(result && canUseClinicalPipeline(result));
}

export function hasInvalidResult(result = null) {
  if (!result) return false;
  return result.invalid === true
    || result.status === AssessmentStatuses.Invalid
    || result.status === AssessmentStatuses.Incomplete
    || result.status === AssessmentStatuses.Cancelled
    || result.status === AssessmentStatuses.TrackingFailed;
}

export function canShowExerciseFromResult(result = null) {
  if (!result || !canGenerateExerciseRecommendation(result)) return false;
  const plan = result.structuredPipeline?.exercisePlan || result.recommendationPlan || null;
  const selected = plan?.selectedExercises || plan?.recommendedExercises || result.recommendedExercises || [];
  if (plan?.requiresProfessionalReview === true) return false;
  return Array.isArray(selected) && selected.length > 0;
}

export function sessionPlanMode(result = null) {
  return result?.carePipeline?.agent?.loop?.finalState?.currentSessionPlan?.mode
    || result?.agentDecision?.currentSessionPlan?.mode
    || result?.recommendationPlan?.sessionPlanMode
    || null;
}

export function buildUserSessionFlow({
  currentScreen = UserScreenIds.Start,
  finalResult = null,
  selectedTest = null,
} = {}) {
  const mode = sessionPlanMode(finalResult);
  const exerciseAllowed = canShowExerciseFromResult(finalResult);
  const resultAvailable = Boolean(finalResult);
  const professionalReview = finalResult?.structuredPipeline?.exercisePlan?.requiresProfessionalReview === true
    || finalResult?.recommendationPlan?.requiresProfessionalReview === true
    || mode === 'suspend_for_review';
  const setupFirst = mode === 'camera_setup_first';

  const steps = [
    {
      id: UserScreenIds.SafetyCheck,
      title: UserScreenLabels[UserScreenIds.SafetyCheck],
      description: 'Confirm you feel safe before moving.',
      required: true,
    },
    {
      id: UserScreenIds.CameraSetup,
      title: UserScreenLabels[UserScreenIds.CameraSetup],
      description: setupFirst ? 'Extended camera guidance is planned.' : 'Place the camera for a full-body view.',
      required: true,
    },
    {
      id: UserScreenIds.Calibration,
      title: UserScreenLabels[UserScreenIds.Calibration],
      description: selectedTest === 'chair_stand'
        ? 'Set sitting and standing references.'
        : 'Set standing and foot-placement references.',
      required: true,
    },
    {
      id: UserScreenIds.Assessment,
      title: UserScreenLabels[UserScreenIds.Assessment],
      description: 'Run the guided movement test.',
      required: true,
    },
  ];

  if (resultAvailable) {
    steps.push({
      id: UserScreenIds.Result,
      title: UserScreenLabels[UserScreenIds.Result],
      description: hasInvalidResult(finalResult)
        ? 'The measurement needs a retry.'
        : 'Review the structured test result.',
      required: true,
    });
  }

  if (resultAvailable && exerciseAllowed && !professionalReview) {
    steps.push({
      id: UserScreenIds.Exercise,
      title: UserScreenLabels[UserScreenIds.Exercise],
      description: mode === 'split_session'
        ? 'Follow the shorter planned routine.'
        : 'Use the deterministic exercise plan.',
      required: false,
    });
    steps.push({
      id: UserScreenIds.Completion,
      title: UserScreenLabels[UserScreenIds.Completion],
      description: 'Save completion and review progress.',
      required: false,
    });
  } else if (resultAvailable && professionalReview) {
    steps.push({
      id: UserScreenIds.Completion,
      title: UserScreenLabels[UserScreenIds.Completion],
      description: 'Professional review is recommended before continuing.',
      required: false,
    });
  }

  return {
    currentScreen,
    steps: steps.map((step, index) => ({
      ...step,
      number: index + 1,
      active: step.id === currentScreen
        || (
          currentScreen === UserScreenIds.Assessment
          && [UserScreenIds.SafetyCheck, UserScreenIds.CameraSetup, UserScreenIds.Calibration, UserScreenIds.Assessment].includes(step.id)
        ),
    })),
    exerciseAllowed,
    resultAvailable,
    professionalReview,
  };
}
