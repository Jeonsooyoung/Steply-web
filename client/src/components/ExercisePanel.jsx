import { useEffect, useMemo, useState } from 'react';
import { canGenerateExerciseRecommendation } from '../pose/assessmentResultMetadata';
import { testLabel } from '../pipeline/ui/assessmentCopy.js';
import { SteplyButton, SteplyCard } from './SteplyPrimitives';

const guidanceByExerciseKey = {
  side_hip_strengthening: {
    steps: ['Hold a chair or wall.', 'Lift one leg out to the side.', 'Lower it slowly with control.'],
    watch: 'Keep your body tall and avoid leaning.',
  },
  sideways_walking: {
    steps: ['Stand beside a counter or rail.', 'Take small side steps.', 'Keep your feet from crossing.'],
    watch: 'Move slowly and keep one hand near support.',
  },
  knee_extension: {
    steps: ['Sit tall on a chair.', 'Straighten one knee.', 'Lower your foot slowly.'],
    watch: 'Keep your thigh supported by the chair.',
  },
  front_knee_strengthening: {
    steps: ['Sit tall on a chair.', 'Straighten one knee.', 'Lower your foot slowly.'],
    watch: 'Keep your thigh supported by the chair.',
  },
  back_knee_strengthening: {
    steps: ['Stand tall and hold support.', 'Bend one knee so your heel moves back.', 'Lower your foot slowly.'],
    watch: 'Keep the movement small and controlled.',
  },
  sit_to_stand_practice: {
    steps: ['Sit near the front of the chair.', 'Stand up tall.', 'Sit down slowly.'],
    watch: 'Use both feet evenly and keep support nearby.',
  },
  chair_stand: {
    steps: ['Sit near the front of the chair.', 'Stand up tall.', 'Sit down slowly.'],
    watch: 'Use both feet evenly and keep support nearby.',
  },
  elevated_sit_to_stand: {
    steps: ['Use a higher firm chair.', 'Stand up with support nearby.', 'Sit down with control.'],
    watch: 'Start easier and avoid a low chair today.',
  },
  partial_sit_to_stand: {
    steps: ['Start from a higher chair.', 'Rise only partway.', 'Sit back down slowly.'],
    watch: 'A smaller range is okay today.',
  },
  knee_alignment_sit_to_stand: {
    steps: ['Keep both feet flat.', 'Stand up slowly.', 'Keep knees pointing over toes.'],
    watch: 'Make the movement smaller if knees drift inward.',
  },
  mini_knee_bends: {
    steps: ['Hold support.', 'Bend the knees a little.', 'Stand tall again.'],
    watch: 'Keep the bend small and comfortable.',
  },
  knee_bends: {
    steps: ['Hold support.', 'Bend the knees a little.', 'Stand tall again.'],
    watch: 'Keep the bend small and comfortable.',
  },
  sit_to_stand_ladder: {
    steps: ['Do a short set.', 'Rest.', 'Repeat only if steady.'],
    watch: 'Rest before you feel tired.',
  },
  slow_sit_to_stand: {
    steps: ['Stand up.', 'Pause.', 'Sit down slowly and quietly.'],
    watch: 'The slow sitting part matters most.',
  },
  weight_shift_drill: {
    steps: ['Hold support.', 'Shift weight to one foot.', 'Come back to the middle.'],
    watch: 'Do not lift your feet.',
  },
  balance_retraining: {
    steps: ['Hold support.', 'Stand tall.', 'Shift gently and return to center.'],
    watch: 'Keep the movement small and controlled.',
  },
  tai_chi_weight_transfer: {
    steps: ['Keep support nearby.', 'Shift weight very slowly.', 'Return to center.'],
    watch: 'Use a small, smooth movement.',
  },
  supported_tandem_stand: {
    steps: ['Put one foot in front.', 'Keep support close.', 'Hold still.'],
    watch: 'Step out before you feel unsafe.',
  },
  tandem_stance: {
    steps: ['Put one foot in front.', 'Keep support close.', 'Hold still.'],
    watch: 'Step out before you feel unsafe.',
  },
  supported_one_leg_stand: {
    steps: ['Hold a chair.', 'Lift one foot a little.', 'Hold briefly, then lower.'],
    watch: 'Lower your foot early if needed.',
  },
  one_leg_stance: {
    steps: ['Hold a chair.', 'Lift one foot a little.', 'Hold briefly, then lower.'],
    watch: 'Lower your foot early if needed.',
  },
  heel_raises: {
    steps: ['Hold a chair.', 'Rise onto your toes.', 'Lower your heels slowly.'],
    watch: 'Keep both hands close to support.',
  },
  calf_raises: {
    steps: ['Hold a chair.', 'Rise onto your toes.', 'Lower your heels slowly.'],
    watch: 'Keep both hands close to support.',
  },
  toe_raises: {
    steps: ['Hold support.', 'Lift the front of both feet.', 'Lower slowly.'],
    watch: 'Keep your heels on the floor.',
  },
  heel_toe_walking: {
    steps: ['Use a clear path.', 'Step heel-to-toe.', 'Stop before you feel unsteady.'],
    watch: 'Use a rail, wall, or helper.',
  },
  supported_walking: {
    steps: ['Use a clear short path.', 'Walk slowly.', 'Turn carefully.'],
    watch: 'Keep support or a helper nearby.',
  },
  figure_8_walking: {
    steps: ['Place two clear markers.', 'Walk slowly around them.', 'Turn without rushing.'],
    watch: 'Use supervision if turning felt hard today.',
  },
  gentle_walking_plan: {
    steps: ['Walk a short clear path.', 'Keep a comfortable pace.', 'Stop and rest.'],
    watch: 'Do not rush.',
  },
  balanced_bilateral_practice: {
    steps: ['Move slowly.', 'Use both sides evenly.', 'Stop if one side feels different.'],
    watch: 'Keep the movement gentle.',
  },
};

function normalizedTitleKey(title = '') {
  return String(title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function exerciseKeyFor(template = {}) {
  return template.exerciseKey
    || normalizedTitleKey(template.exerciseId || '')
    || template.id
    || normalizedTitleKey(template.displayName || template.title || template.name);
}

function guidanceForExercise(template = {}) {
  const key = exerciseKeyFor(template);
  if (guidanceByExerciseKey[key]) return guidanceByExerciseKey[key];

  const text = `${template.exerciseId || ''} ${template.displayName || ''} ${template.title || ''} ${template.name || ''} ${template.description || ''}`.toLowerCase();
  if (text.includes('chair') || text.includes('sit')) return guidanceByExerciseKey.sit_to_stand_practice;
  if (text.includes('knee')) return guidanceByExerciseKey.knee_extension;
  if (text.includes('weight')) return guidanceByExerciseKey.weight_shift_drill;
  if (text.includes('walk')) return guidanceByExerciseKey.supported_walking;
  if (text.includes('one leg') || text.includes('one-leg')) return guidanceByExerciseKey.supported_one_leg_stand;
  if (text.includes('tandem') || text.includes('balance')) return guidanceByExerciseKey.supported_tandem_stand;

  return {
    steps: ['Move slowly.', 'Keep support close.', 'Stop if it feels unsafe.'],
    watch: 'Use this as gentle practice only.',
  };
}

const safetyMessageText = {
  'safety.caregiverNearbyRecommended': 'Please complete this exercise with a family member or trained staff nearby.',
  'safety.useSupportedSitToStandOnly': 'Use only the supported sit-to-stand version for now.',
  MODERATE_RISK_STABLE_SUPPORT_AND_CAREGIVER_RECOMMENDED: 'Please complete this exercise with a family member or trained staff nearby.',
  ARM_SUPPORT_REQUIRED_USE_SUPPORTED_SIT_TO_STAND_ONLY: 'Use only the supported sit-to-stand version for now.',
  HIGH_RISK_PROFESSIONAL_REVIEW_REQUIRED: 'A professional review is recommended before continuing.',
};

function safetyTextForExercise(template = {}) {
  const fromKeys = (template.safetyMessageKeys || [])
    .map((key) => safetyMessageText[key])
    .filter(Boolean);
  if (fromKeys.length) return fromKeys.join(' ');
  if (template.supportRequirement === 'STABLE_SUPPORT') return 'Use a stable chair, counter, or rail for support.';
  if (template.supervisionRequirement === 'CAREGIVER_RECOMMENDED') {
    return 'Please complete this exercise with a family member or trained staff nearby.';
  }
  if (template.supervisionRequirement === 'PROFESSIONAL_REVIEW_REQUIRED') {
    return 'A professional review is recommended before continuing.';
  }
  return template.safety || template.safetyNote || template.safetyInstruction || 'Stop if there is pain, dizziness, or discomfort.';
}

function planSafetyText(value) {
  return safetyMessageText[value] || value;
}

function exerciseId(template, index) {
  return `${exerciseKeyFor(template) || 'exercise'}-${index}`;
}

function exercisePlanFrom(result = {}) {
  return result.structuredPipeline?.exercisePlan
    || result.recommendationPlan
    || result.carePipeline?.agent?.loop?.finalState?.currentExercisePlan
    || null;
}

function selectedExercisesFrom(result = {}) {
  const plan = exercisePlanFrom(result);
  const selected = plan?.selectedExercises || plan?.recommendedExercises || [];
  return Array.isArray(selected) ? selected : [];
}

function hasProfessionalReviewGate(result = {}) {
  const plan = exercisePlanFrom(result);
  return Boolean(plan?.requiresProfessionalReview);
}

function repetitionsFromExercise(exercise) {
  const structuredReps = Number(exercise?.repetitions);
  if (Number.isFinite(structuredReps) && structuredReps > 0) return Math.round(structuredReps);
  const fromDefault = Number(exercise?.defaultReps);
  if (Number.isFinite(fromDefault) && fromDefault > 0) return Math.round(fromDefault);
  const fromType = Number.parseInt(exercise?.type, 10);
  if (Number.isFinite(fromType)) return fromType;
  const fromTitle = Number.parseInt(exercise?.title, 10);
  if (Number.isFinite(fromTitle)) return fromTitle;
  return 10;
}

function targetSummaryForExercise(exercise) {
  const holdSeconds = Number(exercise?.defaultHoldSec);
  if (Number.isFinite(holdSeconds) && holdSeconds > 0) {
    return {
      value: Math.round(holdSeconds),
      unit: 'sec hold',
      label: `${Math.round(holdSeconds)} sec hold`,
    };
  }

  const reps = repetitionsFromExercise(exercise);
  const sets = Number(exercise?.sets ?? exercise?.defaultSets);
  return {
    value: reps,
    unit: Number.isFinite(sets) && sets > 1 ? `${sets} sets` : 'reps',
    label: Number.isFinite(sets) && sets > 1 ? `${sets} sets x ${reps} reps` : `${reps} reps`,
  };
}

function minutesForExercise(template = {}) {
  const fromTemplate = Number(template.minutes);
  if (Number.isFinite(fromTemplate) && fromTemplate > 0) return Math.round(fromTemplate);
  const sets = Number(template.sets);
  return Math.max(1, Math.round((template.durationSeconds || (Number.isFinite(sets) ? sets * 60 : 60)) / 60));
}

function typeForExercise(template = {}) {
  if (template.level && template.category) return `${String(template.level).toLowerCase()} ${template.category}`;
  if (template.level) return String(template.level).toLowerCase();
  if (template.type) return template.type;
  if (Number(template.defaultHoldSec) > 0) return 'Hold';
  if (Number(template.defaultReps) > 0) return `${Math.round(Number(template.defaultReps))} reps`;
  return 'Guided';
}

function toExerciseCard(template, index) {
  const guidance = guidanceForExercise(template);
  const title = template.displayName || template.title || template.name || 'Gentle supported practice';
  return {
    ...template,
    id: exerciseId(template, index),
    number: index + 1,
    title,
    description: template.description
      || template.reasonMessages?.[0]
      || template.seniorInstruction
      || 'Practice this movement gently with support nearby.',
    safety: safetyTextForExercise(template),
    minutes: minutesForExercise(template),
    type: typeForExercise(template),
    guidance,
  };
}

export function ExercisePanel({
  finalResult,
  onViewProgress,
  onStop,
}) {
  const professionalReview = hasProfessionalReviewGate(finalResult || {});
  const sourceExercises = useMemo(
    () => (finalResult ? selectedExercisesFrom(finalResult) : []),
    [finalResult],
  );
  const canRecommend = canGenerateExerciseRecommendation(finalResult || {})
    && sourceExercises.length > 0
    && !professionalReview;
  const dynamicExercises = useMemo(
    () => (canRecommend ? sourceExercises.map(toExerciseCard) : []),
    [canRecommend, sourceExercises],
  );
  const visibleExercises = useMemo(() => dynamicExercises.slice(0, 3), [dynamicExercises]);
  const recommendationSignature = dynamicExercises
    .map((exercise) => `${exercise.title}:${exerciseKeyFor(exercise)}`)
    .join('|');
  const [activeExerciseId, setActiveExerciseId] = useState('');
  const activeExercise = dynamicExercises.find((exercise) => exercise.id === activeExerciseId)
    || visibleExercises[0]
    || null;
  const sourceTestLabel = finalResult?.testLabel || testLabel(finalResult?.testType);
  const activeTarget = targetSummaryForExercise(activeExercise);
  const safetyGateText = finalResult?.recommendationPlan?.gameDisabledReason
    || planSafetyText(finalResult?.recommendationPlan?.safetyNotices?.[0])
    || planSafetyText(finalResult?.structuredPipeline?.exercisePlan?.safetyNotices?.[0])
    || null;

  useEffect(() => {
    setActiveExerciseId((current) => {
      if (dynamicExercises.some((exercise) => exercise.id === current)) return current;
      return visibleExercises[0]?.id || '';
    });
  }, [recommendationSignature, dynamicExercises, visibleExercises]);

  if (!canRecommend) {
    return (
      <div className="exercise-recommendation-screen distance-mode distance-mode--exercise">
        <SteplyCard className="exercise-recommendation-hero">
          <div>
            <div className="eyebrow">Exercise Recommendation</div>
            <h2>{professionalReview ? 'Professional review recommended' : 'No exercise plan is available'}</h2>
            <p>
              {professionalReview
                ? 'A professional review is recommended before continuing.'
                : 'Complete a valid live measurement before starting an exercise plan.'}
            </p>
          </div>
          {onStop ? (
            <div className="exercise-recommendation-hero__actions">
              <SteplyButton className="screen-stop-button" variant="secondary" onClick={onStop}>Stop</SteplyButton>
            </div>
          ) : null}
        </SteplyCard>
        <SteplyCard className="feedback-stack feedback-stack--analysis guided-status-card">
          <div className="eyebrow">Plan Status</div>
          <h3>Exercise is paused</h3>
          <p>{professionalReview ? 'A professional review is recommended before continuing.' : 'No selected exercise was returned by the structured plan.'}</p>
        </SteplyCard>
      </div>
    );
  }

  return (
    <div className="exercise-recommendation-screen distance-mode distance-mode--exercise">
      <SteplyCard className="exercise-recommendation-hero">
        <div>
          <div className="eyebrow">Exercise Recommendation</div>
          <h2>{activeExercise?.title || sourceTestLabel || 'Recommended practice'}</h2>
          <p>{activeExercise?.description || 'Choose a recommended exercise and follow the safe practice notes.'}</p>
        </div>
        {onStop ? (
          <div className="exercise-recommendation-hero__actions">
            <SteplyButton className="screen-stop-button" variant="secondary" onClick={onStop}>Stop</SteplyButton>
          </div>
        ) : null}
      </SteplyCard>

      <div className="exercise-recommendation-options" aria-label="Exercise recommendations">
        {visibleExercises.map((exercise, index) => {
          const isActive = exercise.id === activeExercise?.id;
          return (
            <button
              key={exercise.id}
              type="button"
              className={`exercise-recommendation-option ${isActive ? 'exercise-recommendation-option--active' : ''}`}
              onClick={() => setActiveExerciseId(exercise.id)}
            >
              <strong>{index + 1}. {exercise.title}</strong>
              <span>{exercise.type}</span>
              <small>{exercise.description}</small>
            </button>
          );
        })}
      </div>

      <div className="exercise-recommendation-detail-grid">
        <SteplyCard className="movement-guide-card exercise-detail-card exercise-recommendation-detail-card">
          <div className="eyebrow">How To Practice</div>
          <h3>{activeExercise?.title || 'Choose an exercise'}</h3>
          <p>{activeExercise?.description || 'Select one recommended exercise to see the simple practice steps.'}</p>
          <div className="exercise-easy-steps" aria-label="Exercise instructions">
            {(activeExercise?.guidance?.steps || []).map((step, index) => (
              <div className="exercise-easy-step" key={`${activeExercise?.id || 'exercise'}-${step}`}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
          <div className="exercise-detail-target">
            <span>One set</span>
            <strong>{activeTarget.value}</strong>
            <span>{activeTarget.unit}</span>
          </div>
          {activeExercise?.guidance?.watch ? (
            <div className="exercise-detail-watch">{activeExercise.guidance.watch}</div>
          ) : null}
          {activeExercise?.safety ? (
            <div className="exercise-detail-safety">{activeExercise.safety}</div>
          ) : null}
        </SteplyCard>

        <SteplyCard className="feedback-stack feedback-stack--analysis guided-status-card exercise-recommendation-summary-card">
          <div className="eyebrow">Practice Plan</div>
          <h3>{sourceTestLabel ? `${sourceTestLabel} follow-up` : 'Today\'s follow-up'}</h3>
          <div className="guided-status-row">
            <span>Exercise</span>
            <strong>{activeExercise?.number || 1} / {visibleExercises.length || 1}</strong>
          </div>
          <div className="guided-status-row">
            <span>Target</span>
            <strong>{activeTarget.label}</strong>
          </div>
          <div className="guided-status-row">
            <span>Time</span>
            <strong>{activeExercise?.minutes || 1} min</strong>
          </div>
          <p>{safetyGateText || 'Keep support nearby and move at a comfortable pace.'}</p>
        </SteplyCard>
      </div>

      <div className="exercise-recommendation-actions">
        {onViewProgress ? (
          <SteplyButton onClick={onViewProgress}>
            View My Progress
          </SteplyButton>
        ) : null}
        {onStop ? (
          <SteplyButton className="screen-stop-button" variant="secondary" onClick={onStop}>
            Stop
          </SteplyButton>
        ) : null}
      </div>
    </div>
  );
}
