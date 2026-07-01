import { chairStandBelowAverageThreshold } from './steadiRules';

export const RecommendationLevels = {
  Steady: 'steady',
  PracticeNeeded: 'practice_needed',
  Recheck: 'recheck',
};

export function calculateRecommendationLevel(repetitionCount) {
  if (repetitionCount >= 12) return RecommendationLevels.Steady;
  if (repetitionCount >= 8) return RecommendationLevels.PracticeNeeded;
  return RecommendationLevels.Recheck;
}

export function calculateRecommendationLevelWithProfile({ repetitionCount, ageYears, gender, armUseDisqualified = false }) {
  if (armUseDisqualified || repetitionCount <= 0) return RecommendationLevels.Recheck;
  const threshold = chairStandBelowAverageThreshold(ageYears, gender);
  if (!threshold) return calculateRecommendationLevel(repetitionCount);
  return repetitionCount < threshold ? RecommendationLevels.PracticeNeeded : RecommendationLevels.Steady;
}

export function recommendationLabel(level) {
  if (level === RecommendationLevels.Steady) return 'Steady';
  if (level === RecommendationLevels.PracticeNeeded) return 'Practice Recommended';
  return 'Recheck Needed';
}

export function testLabel(testType) {
  if (testType === 'standing_posture' || testType === 'balance_hold') return 'Standing Posture';
  if (testType === 'tug' || testType === 'tug_walk') return 'TUG';
  return '30 sec Chair Stand';
}

export function recommendationTemplatesForLevel(level, testType = 'chair_stand') {
  const stopIfUncomfortable = 'Stop immediately if there is pain, dizziness, or discomfort.';
  const useSupport = 'Use a stable chair or caregiver support if needed.';

  if (testType === 'standing_posture' || testType === 'balance_hold') {
    if (level === RecommendationLevels.Steady) {
      return [
        {
          title: 'Supported Balance Hold',
          description: 'Hold the back of a stable chair and stand comfortably for 20 seconds',
          safetyNote: `Sit and rest if you feel unstable. ${useSupport}`,
          durationSeconds: 20,
        },
        {
          title: 'Posture Reset Practice',
          description: 'Stand tall, gently center the trunk over the feet, and breathe slowly',
          safetyNote: stopIfUncomfortable,
          durationSeconds: 30,
        },
      ];
    }

    return [
      {
        title: 'Assisted Standing Hold',
        description: 'Stand comfortably for 10 seconds with a chair or caregiver support',
        safetyNote: useSupport,
        durationSeconds: 10,
      },
      {
        title: 'Gentle Weight Shift',
        description: 'Hold a chair and slowly shift weight left and right',
        safetyNote: stopIfUncomfortable,
        durationSeconds: 45,
      },
    ];
  }

  if (testType === 'tug' || testType === 'tug_walk') {
    if (level === RecommendationLevels.Steady) {
      return [
        {
          title: 'Controlled Turn Practice',
          description: 'Walk a short safe path, turn slowly, and return with steady steps',
          safetyNote: useSupport,
          durationSeconds: 45,
        },
        {
          title: 'Supported Balance Hold',
          description: 'Hold the back of a stable chair and stand comfortably for 20 seconds',
          safetyNote: `Sit and rest if you feel unstable. ${useSupport}`,
          durationSeconds: 20,
        },
      ];
    }

    return [
      {
        title: 'Sit-to-Stand With Support',
        description: 'Use a stable chair and slowly stand up, pause, then sit down',
        safetyNote: `Do not rush. ${useSupport}`,
        durationSeconds: 60,
      },
      {
        title: 'Short Walk and Turn Drill',
        description: 'With support nearby, practice a few slow steps and a careful turn',
        safetyNote: stopIfUncomfortable,
        durationSeconds: 45,
      },
    ];
  }

  if (level === RecommendationLevels.Steady) {
    return [
      {
        title: 'Supported Balance Hold',
        description: 'Hold the back of a stable chair and stand comfortably for 20 seconds',
        safetyNote: `Sit and rest if you feel unstable. ${useSupport}`,
        durationSeconds: 20,
      },
      {
        title: 'Gentle Chair Stand Practice',
        description: 'Slowly stand up from a chair and sit down 5 times',
        safetyNote: stopIfUncomfortable,
        durationSeconds: 60,
      },
    ];
  }

  if (level === RecommendationLevels.PracticeNeeded) {
    return [
      {
        title: 'Supported Chair Stand Practice',
        description: 'Hold a stable chair or support and slowly stand up and sit down 5 times',
        safetyNote: `Do not rush. Use a stable chair. ${useSupport}`,
        durationSeconds: 60,
      },
      {
        title: 'Gentle Weight Shift',
        description: 'Hold a chair and slowly shift weight left and right',
        safetyNote: stopIfUncomfortable,
        durationSeconds: 45,
      },
    ];
  }

  return [
    {
      title: 'Assisted Standing Hold',
      description: 'Stand comfortably for 10 seconds with a chair or caregiver support',
      safetyNote: useSupport,
      durationSeconds: 10,
    },
    {
      title: 'Seated Knee Extension',
      description: 'Sit on a chair, slowly straighten one knee, then lower it',
      safetyNote: stopIfUncomfortable,
      durationSeconds: 45,
    },
  ];
}

export function resultFlagsFor(result, testType = 'chair_stand') {
  const percent = (value) => `${Math.round((value || 0) * 100)}%`;
  const primaryValue = result.primaryValue ?? result.repetitionCount ?? 0;
  const primaryLabel = result.primaryLabel || 'Measured Value';

  if (testType === 'tug' || testType === 'tug_walk') {
    return [
      `${primaryLabel}: ${primaryValue}s`,
      result.riskSignal ? 'TUG fall-risk signal: 12 seconds or more' : 'TUG time stayed under the 12 second risk signal',
      `Walking stability ${percent(result.stabilityScore)}`,
      `Trunk center ${percent(result.trunkLeanScore)}`,
    ];
  }

  if (testType === 'standing_posture' || testType === 'balance_hold') {
    return [
      `${primaryLabel}: ${primaryValue}/100`,
      `Trunk center ${percent(result.trunkLeanScore)}`,
      `Foot-center balance ${percent(result.symmetryScore)}`,
      `Sway stability ${percent(result.stabilityScore)}`,
    ];
  }

  return [
    result.armUseDisqualified ? 'Arm support detected: official score is 0' : `${primaryLabel}: ${primaryValue}`,
    `Trunk center ${percent(result.trunkLeanScore)}`,
    `Left-right symmetry ${percent(result.symmetryScore)}`,
    `Sway stability ${percent(result.stabilityScore)}`,
  ];
}
