import { useMemo, useState } from 'react';
import {
  AppHeader,
  CameraPreview,
  ConnectionIndicator,
  EmergencyStopButton,
  PrimaryActionBar,
  SessionProgress,
} from '../components/foundation/SteplyDesignSystem';
import { OTAGO_EXERCISE_CATALOG } from '../pipeline/recommendation/otagoExerciseEngine.js';
import { navigateSpa } from './spaNavigation';

function goTo(path) {
  navigateSpa(path);
}

function currentExerciseId() {
  if (typeof window === 'undefined') return '';
  const parts = window.location.pathname.split('/').filter(Boolean);
  const index = parts.indexOf('exercises');
  return index >= 0 && parts[index + 1] ? decodeURIComponent(parts[index + 1]) : '';
}

function StepIcon({ tone = 'info' }) {
  return <span className={`step-seven-icon step-seven-icon--${tone}`} aria-hidden="true" />;
}

function VoiceButton({ script, label = 'Hear Again' }) {
  return (
    <button
      type="button"
      className="ds-button ds-button--secondary step-seven-voice-button"
      data-voice-script={script}
      aria-label={`${label}. ${script}`}
    >
      {label}
    </button>
  );
}

function SessionShell({
  eyebrow,
  title,
  description,
  connection,
  progress,
  children,
  className = '',
}) {
  return (
    <div className={`foundation-shell step-seven-shell ${className}`}>
      <AppHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        connection={connection}
        actions={<EmergencyStopButton label="Stop Session" onClick={() => goTo('/display/error/safety-stop')} />}
      />
      {progress}
      {children}
    </div>
  );
}

const CATALOG_BY_ID = Object.fromEntries(OTAGO_EXERCISE_CATALOG.flatMap((exercise) => [
  [exercise.exerciseId, exercise],
  [String(exercise.exerciseId).toLowerCase(), exercise],
]));

const exerciseDisplay = {
  front_knee_strengthening: {
    name: 'Front Knee Strengthening',
    purpose: 'Leg strength and knee control',
    starting: 'Sit tall or stand with a stable support surface within reach.',
    sequence: 'Straighten your knee slowly, pause, then lower with control.',
    cue: 'Straighten your knee slowly.',
    support: 'Hold a stable table or countertop if standing.',
    safety: 'Stop if knee pain appears.',
    demo: 'knee',
  },
  back_knee_strengthening: {
    name: 'Back Knee Strengthening',
    purpose: 'Leg strength and standing control',
    starting: 'Stand tall beside a stable support surface.',
    sequence: 'Bend one knee behind you, then lower the foot slowly.',
    cue: 'Move slowly and stay in control.',
    support: 'Hold a stable table or countertop.',
    safety: 'Keep your chest upright and avoid leaning forward.',
    demo: 'knee',
  },
  side_hip_strengthening: {
    name: 'Side Hip Strengthening',
    purpose: 'Side-to-side stability',
    starting: 'Stand tall beside a stable support surface.',
    sequence: 'Lift one leg gently to the side, pause, then lower with control.',
    cue: 'Keep both feet facing forward.',
    support: 'Hold a stable table or countertop.',
    safety: 'Keep your body upright and stop if hip pain appears.',
    demo: 'side',
  },
  calf_raises: {
    name: 'Calf Raises',
    purpose: 'Ankle balance control',
    starting: 'Stand with both feet facing forward and support nearby.',
    sequence: 'Rise slowly onto your toes, pause, then lower your heels.',
    cue: 'Hold the table lightly.',
    support: 'Hold a stable table or countertop.',
    safety: 'Lower your heels before you feel unsteady.',
    demo: 'ankle',
  },
  toe_raises: {
    name: 'Toe Raises',
    purpose: 'Ankle control and balance',
    starting: 'Stand tall with a stable support surface in front of you.',
    sequence: 'Lift your toes while keeping heels on the floor, then lower slowly.',
    cue: 'Keep your chest upright.',
    support: 'Hold a stable table or countertop.',
    safety: 'Use support and keep the movement small.',
    demo: 'ankle',
  },
  knee_bends: {
    name: 'Knee Bends',
    purpose: 'Leg strength and controlled lowering',
    starting: 'Stand tall with both hands near stable support.',
    sequence: 'Bend your knees a little, then stand tall again.',
    cue: 'Keep your chest upright.',
    support: 'Hold a stable table or countertop.',
    safety: 'Use a small range and stop if you feel knee pain.',
    demo: 'bend',
  },
  tandem_stance: {
    name: 'Tandem Stand',
    purpose: 'Balance and ankle control',
    starting: 'Stand with one foot directly in front of the other.',
    sequence: 'Hold the position while keeping support within reach.',
    cue: 'Hold the table lightly.',
    support: 'Hold a stable table or countertop.',
    safety: 'Step out of the position if you feel unsteady.',
    holdSeconds: 10,
    demo: 'balance',
  },
  tandem_stand: {
    name: 'Tandem Stand',
    purpose: 'Balance and ankle control',
    starting: 'Stand with one foot directly in front of the other.',
    sequence: 'Hold the position while keeping support within reach.',
    cue: 'Hold the table lightly.',
    support: 'Hold a stable table or countertop.',
    safety: 'Step out of the position if you feel unsteady.',
    holdSeconds: 10,
    demo: 'balance',
  },
  one_leg_stand: {
    name: 'One-Leg Stand',
    purpose: 'Single-leg stability',
    starting: 'Stand beside stable support with both feet on the floor.',
    sequence: 'Lift one foot a small distance, hold, then lower safely.',
    cue: 'Hold the table lightly.',
    support: 'Hold a stable table or countertop.',
    safety: 'Put your foot down before you feel unstable.',
    holdSeconds: 10,
    demo: 'balance',
  },
  one_leg_stance: {
    name: 'One-Leg Stand',
    purpose: 'Single-leg stability',
    starting: 'Stand beside stable support with both feet on the floor.',
    sequence: 'Lift one foot a small distance, hold, then lower safely.',
    cue: 'Hold the table lightly.',
    support: 'Hold a stable table or countertop.',
    safety: 'Put your foot down before you feel unstable.',
    holdSeconds: 10,
    demo: 'balance',
  },
  sit_to_stand: {
    name: 'Sit to Stand',
    purpose: 'Standing up from a chair',
    starting: 'Sit in the middle of a chair placed firmly against a wall.',
    sequence: 'Stand all the way up, then sit all the way down with control.',
    cue: 'Move slowly and stay in control.',
    support: 'Use the prescribed support level only.',
    safety: 'Keep the chair firmly against a wall.',
    demo: 'chair',
  },
  chair_stand: {
    name: 'Sit to Stand',
    purpose: 'Standing up from a chair',
    starting: 'Sit in the middle of a chair placed firmly against a wall.',
    sequence: 'Stand all the way up, then sit all the way down with control.',
    cue: 'Move slowly and stay in control.',
    support: 'Use the prescribed support level only.',
    safety: 'Keep the chair firmly against a wall.',
    demo: 'chair',
  },
  side_ways_walking: {
    name: 'Sideways Walking',
    purpose: 'Left and right movement control',
    starting: 'Stand near a clear wall or stable support surface.',
    sequence: 'Step sideways slowly along a clear path, then return.',
    cue: 'Move slowly and stay in control.',
    support: 'Use a hallway rail or caregiver support when needed.',
    safety: 'Keep the path clear and do not rush.',
    manual: true,
    demo: 'walk',
  },
  sideways_walking: {
    name: 'Sideways Walking',
    purpose: 'Left and right movement control',
    starting: 'Stand near a clear wall or stable support surface.',
    sequence: 'Step sideways slowly along a clear path, then return.',
    cue: 'Move slowly and stay in control.',
    support: 'Use a hallway rail or caregiver support when needed.',
    safety: 'Keep the path clear and do not rush.',
    manual: true,
    demo: 'walk',
  },
  tandem_walk: {
    name: 'Heel-to-Toe Walking',
    purpose: 'Narrow-base walking balance',
    starting: 'Stand near a clear wall or rail.',
    sequence: 'Walk slowly heel-to-toe along a clear path.',
    cue: 'Move slowly and stay in control.',
    support: 'Use a hallway rail or caregiver support when needed.',
    safety: 'This exercise should be done only where support is close.',
    manual: true,
    demo: 'walk',
  },
  balance_practice: {
    name: 'Tandem Stand',
    purpose: 'Balance and ankle control',
    starting: 'Stand with one foot directly in front of the other.',
    sequence: 'Hold the position while keeping support within reach.',
    cue: 'Hold the table lightly.',
    support: 'Hold a stable table or countertop.',
    safety: 'Step out of the position if you feel unsteady.',
    holdSeconds: 10,
    demo: 'balance',
  },
};

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function whole(value, fallback = 0) {
  const number = finite(value);
  return number === null ? fallback : Math.max(0, Math.round(number));
}

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function titleCase(value = '') {
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function safeExerciseName(exercise = {}) {
  const key = normalizeKey(exercise.exerciseId || exercise.exerciseKey || exercise.id || exercise.arInputKey || exercise.displayName);
  const mapped = exerciseDisplay[key];
  if (mapped?.name) return mapped.name;
  const raw = exercise.displayName || '';
  if (/^[A-Z]\d+$/i.test(String(raw).trim())) return 'Recommended Exercise';
  return titleCase(raw || 'Recommended Exercise');
}

function supportText(value) {
  const key = normalizeKey(value);
  if (!value || key === 'none') return 'No support required by the current plan';
  if (key.includes('professional')) return 'Professional review is required before starting';
  if (key.includes('caregiver')) return 'Have a caregiver nearby';
  if (key.includes('stable_support')) return 'Hold a stable table or countertop';
  if (key.includes('two_hand')) return 'Use both hands on a fixed stable support';
  if (key.includes('one_hand')) return 'Use one hand on a fixed stable support';
  if (key.includes('walking_aid')) return 'Use the prescribed walking aid';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function levelText(value) {
  const key = normalizeKey(value);
  if (['a', 'b', 'c', 'd'].includes(key)) return `Level ${key.toUpperCase()}`;
  if (key.includes('seated')) return 'Seated level';
  if (key.includes('two_hand')) return 'Two-hand supported level';
  if (key.includes('supported')) return 'Supported level';
  if (key.includes('standard')) return 'Standard level';
  if (key.includes('unsupported')) return 'Unsupported level';
  return 'Prescribed level';
}

function categoryPurpose(exercise = {}, meta = {}) {
  if (meta.purpose) return meta.purpose;
  const category = normalizeKey(exercise.category);
  if (category.includes('strength')) return 'Leg strength';
  if (category.includes('balance')) return 'Balance practice';
  return 'Movement practice';
}

function isWalkingExercise(exercise = {}, meta = {}) {
  const text = normalizeKey([
    exercise.exerciseId,
    exercise.exerciseKey,
    exercise.id,
    exercise.displayName,
    exercise.arInputKey,
    meta.name,
  ].filter(Boolean).join(' '));
  return meta.manual || text.includes('walking') || text.includes('walk');
}

function cameraSupported(exercise = {}, meta = {}) {
  const cameraMode = normalizeKey(exercise.cameraVerification || exercise.cameraFeedback || exercise.cameraMode);
  if (isWalkingExercise(exercise, meta)) return false;
  if (cameraMode.includes('not_supported') || cameraMode.includes('manual_only')) return false;
  if (exercise.cameraVerifiable === false) return false;
  return true;
}

function prescriptionLine(exercise = {}, meta = {}) {
  const reps = whole(exercise.repetitions ?? exercise.repetitionsPerSide ?? exercise.defaultReps ?? exercise.reps, 0);
  const steps = whole(exercise.steps, 0);
  const sets = whole(exercise.sets, 1) || 1;
  const duration = whole(exercise.durationSeconds ?? exercise.holdSeconds ?? meta.holdSeconds, 0);
  if (duration > 0 && reps <= 2) return `${duration} seconds, ${sets} ${sets === 1 ? 'set' : 'sets'}`;
  if (steps > 0) return `${steps} steps, ${sets} ${sets === 1 ? 'set' : 'sets'}`;
  if (exercise.repetitionsPerSide > 0) return `${reps} repetitions per side, ${sets} ${sets === 1 ? 'set' : 'sets'}`;
  if (reps > 0) return `${reps} ${reps === 1 ? 'repetition' : 'repetitions'}, ${sets} ${sets === 1 ? 'set' : 'sets'}`;
  if (duration > 0) return `${duration} seconds`;
  return 'Follow the prescribed amount';
}

function estimateMinutes(exercises = []) {
  if (!exercises.length) return 0;
  const seconds = exercises.reduce((total, item) => {
    const reps = whole(item.repetitions ?? item.defaultReps ?? item.reps, 0);
    const sets = whole(item.sets, 1) || 1;
    const duration = whole(item.durationSeconds ?? item.holdSeconds, 0);
    const perSet = duration || Math.max(45, reps * 8);
    return total + perSet * sets + Math.max(20, sets * 15);
  }, 0);
  return Math.max(3, Math.ceil(seconds / 60));
}

function resultFromDashboard(dashboard) {
  return dashboard?.finalResult || dashboard?.poseAnalysis?.finalResult || dashboard?.poseAnalysis?.analysisResult || null;
}

function planFromResult(result = {}) {
  return result?.recommendationPlan
    || result?.structuredPipeline?.exercisePlan
    || result?.carePipeline?.agent?.currentExercisePlan
    || {};
}

function selectedExercisesFromPlan(plan = {}) {
  const selected = plan.selectedExercises
    || plan.recommendedExercises
    || [];
  return Array.isArray(selected) ? selected : [];
}

function planContext(dashboard) {
  const result = resultFromDashboard(dashboard) || {};
  const resultPlan = planFromResult(result);
  const storedPlan = dashboard?.assessmentSession?.exercisePrescription?.plan
    || dashboard?.session?.assessmentSession?.exercisePrescription?.plan;
  const plan = Object.keys(resultPlan).length ? resultPlan : storedPlan || {};
  const selected = selectedExercisesFromPlan(plan);
  const exercises = selected.map((exercise, index) => normalizeExercise(exercise, index));
  const cameraCount = exercises.filter((exercise) => exercise.cameraSupported).length;
  const manualCount = exercises.length - cameraCount;
  const restricted = plan.requiresProfessionalReview
    || normalizeKey(plan.status).includes('pending_review')
    || normalizeKey(plan.status).includes('blocked');

  return {
    result,
    plan,
    exercises,
    cameraCount,
    manualCount,
    restricted,
    estimatedMinutes: estimateMinutes(exercises),
    supportSummary: !exercises.length
      ? 'No prescribed exercises'
      : exercises.some((exercise) => exercise.supportRequirement.includes('stable') || exercise.supportRequirement.includes('Hold'))
      ? 'Stable support surface needed'
      : 'Follow each exercise support note',
  };
}

function normalizeExercise(exercise = {}, index = 0) {
  const rawKey = normalizeKey(exercise.exerciseId || exercise.exerciseKey || exercise.id || exercise.arInputKey || exercise.displayName);
  const mappedKey = rawKey === 'balance_practice' ? 'tandem_stance' : rawKey;
  const catalog = CATALOG_BY_ID[mappedKey] || {};
  const meta = exerciseDisplay[mappedKey] || exerciseDisplay[rawKey] || {};
  const merged = {
    ...catalog,
    ...exercise,
    exerciseId: exercise.exerciseId || exercise.exerciseKey || exercise.id || mappedKey || `exercise-${index + 1}`,
  };
  const displayMeta = exerciseDisplay[normalizeKey(merged.exerciseId)] || meta;
  const camera = cameraSupported(merged, displayMeta);
  const reps = whole(merged.repetitions ?? merged.repetitionsPerSide ?? merged.steps ?? merged.defaultReps ?? merged.reps, 0);
  const sets = whole(merged.sets, 1) || 1;
  const duration = whole(merged.durationSeconds ?? merged.holdSeconds ?? displayMeta.holdSeconds, 0);
  const targetSideLabel = merged.targetSide === 'RIGHT'
    ? 'Right side priority'
    : merged.targetSide === 'LEFT'
      ? 'Left side priority'
      : merged.targetSide === 'BILATERAL' ? 'Both sides' : null;

  return {
    ...merged,
    hrefId: encodeURIComponent(merged.exerciseId || mappedKey || `exercise-${index + 1}`),
    displayName: safeExerciseName(merged),
    purpose: categoryPurpose(merged, displayMeta),
    starting: displayMeta.starting || 'Begin with stable support nearby.',
    sequence: displayMeta.sequence || merged.description || 'Move slowly and stay in control.',
    cue: displayMeta.cue || 'Move slowly and stay in control.',
    support: displayMeta.support || supportText(merged.supportRequirement),
    safety: merged.safetyInstruction || merged.safetyNote || displayMeta.safety || 'Stop if you feel pain, dizzy, or unsafe.',
    prescription: prescriptionLine({ ...merged, repetitions: reps, sets, durationSeconds: duration }, displayMeta),
    repetitions: reps,
    sets,
    durationSeconds: duration,
    levelLabel: levelText(merged.level),
    supportRequirement: supportText(merged.supportRequirement || displayMeta.support),
    cameraSupported: camera,
    feedbackLabel: camera ? 'Camera feedback available' : 'Self-reported completion',
    recommendationRank: whole(merged.recommendationRank, index + 1) || index + 1,
    recommendationScore: Number.isFinite(merged.recommendationScore) ? merged.recommendationScore : null,
    targetSide: merged.targetSide || 'UNSPECIFIED',
    targetSideLabel,
    functionalRole: merged.functionalRole || null,
    demo: displayMeta.demo || 'standing',
    reason: merged.reasonMessages?.[0]
      || merged.reason
      || (targetSideLabel && merged.reasonVulnerabilityIds?.includes('V9') ? `${targetSideLabel} based on the repeated movement asymmetry pattern.` : null)
      || (merged.reasonVulnerabilityIds?.length ? `Selected for ${merged.reasonVulnerabilityIds.join(', ')}.` : 'Selected from your Otago Exercise Programme plan.'),
    restSeconds: whole(merged.restMinSeconds ?? merged.restSeconds ?? merged.requiredRestSeconds, 30) || 30,
  };
}

function exerciseById(context, id) {
  const normalized = normalizeKey(id);
  return context.exercises.find((exercise) => normalizeKey(exercise.exerciseId) === normalized || normalizeKey(exercise.hrefId) === normalized)
    || null;
}

function ExerciseDemo({ exercise, large = false }) {
  return (
    <div className={`step-seven-demo step-seven-demo--${exercise.demo || 'standing'} ${large ? 'step-seven-demo--large' : ''}`} aria-label={`${exercise.displayName} demonstration`}>
      <div className="step-seven-demo__support" aria-hidden="true" />
      <div className="step-seven-demo__person" aria-hidden="true">
        <span />
        <i />
        <b />
      </div>
      <div className="step-seven-demo__floor" aria-hidden="true" />
      <strong>{exercise.displayName}</strong>
    </div>
  );
}

function SummaryMetric({ label, value }) {
  return (
    <article className="step-seven-summary-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PlanRestriction({ context }) {
  if (!context.restricted) return null;
  return (
    <section className="step-seven-restriction" role="status">
      <StepIcon tone="danger" />
      <div>
        <h2>Professional Assessment Recommended</h2>
        <p>A healthcare professional should review your results before you begin more challenging exercises.</p>
      </div>
    </section>
  );
}

function ExerciseNotReady({ context }) {
  return (
    <SessionShell
      eyebrow="Exercise not ready"
      title="No Prescribed Exercise Available"
      description="Steply does not create an exercise when the deterministic plan has no matching item."
      connection={<ConnectionIndicator status="waiting" label="Exercise unavailable" detail="Stored prescription required" />}
      progress={<SessionProgress current={10} total={12} label="Session progress" />}
    >
      <main className="step-seven-plan">
        <div className="step-seven-empty-plan">
          <h2>No matching exercise is available</h2>
          <p>{context.exercises.length ? 'Return to the prescribed exercise list and choose an available item.' : 'Complete a valid assessment before starting exercise.'}</p>
        </div>
        <PrimaryActionBar primaryLabel="Return to Exercise Plan" onPrimary={() => goTo('/display/exercises/plan')} />
      </main>
    </SessionShell>
  );
}

function ExercisePlanCard({ exercise, index }) {
  return (
    <article className="step-seven-plan-card">
      <ExerciseDemo exercise={exercise} />
      <div className="step-seven-plan-card__body">
        <span>Exercise {index + 1}</span>
        <h3>{exercise.displayName}</h3>
        <p>{exercise.purpose}</p>
        <dl>
          <div>
            <dt>Amount</dt>
            <dd>{exercise.prescription}</dd>
          </div>
          <div>
            <dt>Starting level</dt>
            <dd>{exercise.levelLabel}</dd>
          </div>
          <div>
            <dt>Support</dt>
            <dd>{exercise.supportRequirement}</dd>
          </div>
          <div>
            <dt>Feedback</dt>
            <dd>{exercise.feedbackLabel}</dd>
          </div>
        </dl>
        <button type="button" className="ds-button ds-button--secondary" onClick={() => goTo(`/display/exercises/${exercise.hrefId}/preview`)}>
          Preview Exercise
        </button>
      </div>
    </article>
  );
}

export function DisplayExercisePlanScreen({ dashboard }) {
  const context = useMemo(() => planContext(dashboard), [dashboard]);
  const startPath = context.exercises[0] ? `/display/exercises/${context.exercises[0].hrefId}/preview` : '/display/results/summary';

  return (
    <SessionShell
      eyebrow="Otago Exercise Programme"
      title="Today's Exercise Plan"
      description="Practice the recommended exercises at a safe, steady pace."
      connection={<ConnectionIndicator status={context.restricted ? 'waiting' : 'connected'} label={context.restricted ? 'Review needed' : 'Plan ready'} detail={context.restricted ? 'Exercise start is restricted' : `${context.exercises.length} prescribed exercises`} />}
      progress={<SessionProgress current={10} total={12} label="Session progress" />}
      className="step-seven-plan-shell"
    >
      <main className="step-seven-plan">
        <section className="step-seven-plan-summary" aria-label="Exercise plan summary">
          <SummaryMetric label="Exercises" value={String(context.exercises.length)} />
          <SummaryMetric label="Estimated duration" value={`${context.estimatedMinutes} minutes`} />
          <SummaryMetric label="Support" value={context.supportSummary} />
          <SummaryMetric label="Camera-supported" value={String(context.cameraCount)} />
          <SummaryMetric label="Self-reported" value={String(context.manualCount)} />
        </section>

        <PlanRestriction context={context} />

        <section className="step-seven-plan-grid" aria-label="Prescribed exercises">
          {context.exercises.length ? context.exercises.map((exercise, index) => (
            <ExercisePlanCard key={`${exercise.exerciseId}-${index}`} exercise={exercise} index={index} />
          )) : (
            <div className="step-seven-empty-plan">
              <h2>No exercises are available to start today</h2>
              <p>Review the results guidance before starting exercise.</p>
            </div>
          )}
        </section>

        <PrimaryActionBar
          primaryLabel="Start Exercise Session"
          secondaryLabel="Split Into Two Short Sessions"
          tertiaryLabel="View Today's Results"
          primaryDisabled={context.restricted || !context.exercises.length}
          onPrimary={() => goTo(startPath)}
          onSecondary={() => goTo('/display/exercises/plan')}
          onTertiary={() => goTo('/display/results/summary')}
        />
      </main>
    </SessionShell>
  );
}

export function DisplayExercisePreviewScreen({ dashboard }) {
  const context = useMemo(() => planContext(dashboard), [dashboard]);

  if (context.restricted) {
    return (
      <SessionShell
        eyebrow="Exercise restricted"
        title="Professional Guidance Needed"
        description="The current plan does not allow this exercise to start automatically."
        connection={<ConnectionIndicator status="waiting" label="Review needed" detail="Exercise start restricted" />}
        progress={<SessionProgress current={11} total={12} label="Exercise progress" />}
        className="step-seven-preview-shell"
      >
        <main className="step-seven-plan">
          <PlanRestriction context={context} />
          <PrimaryActionBar
            primaryLabel="View Professional Guidance"
            secondaryLabel="Return to Exercise Plan"
            onPrimary={() => goTo('/display/reports')}
            onSecondary={() => goTo('/display/exercises/plan')}
          />
        </main>
      </SessionShell>
    );
  }

  const exercise = exerciseById(context, currentExerciseId());
  if (!exercise) return <ExerciseNotReady context={context} />;
  const voice = `${exercise.displayName}. ${exercise.starting} ${exercise.sequence}`;

  return (
    <SessionShell
      eyebrow="Exercise preview"
      title={exercise.displayName}
      description="Watch the guidance before starting the exercise."
      connection={<ConnectionIndicator status="connected" label="Preview ready" detail={exercise.levelLabel} />}
      progress={<SessionProgress current={11} total={12} label="Exercise progress" />}
      className="step-seven-preview-shell"
    >
      <main className="step-seven-preview">
        <section className="step-seven-preview__demo">
          <ExerciseDemo exercise={exercise} large />
          <div className="step-seven-sequence">
            <h2>Starting position</h2>
            <p>{exercise.starting}</p>
            <h2>Movement sequence</h2>
            <p>{exercise.sequence}</p>
          </div>
        </section>

        <aside className="step-seven-preview__details">
          <p className="step-seven-kicker">Why it was recommended</p>
          <h2>{exercise.displayName}</h2>
          <p>{exercise.reason}</p>
          <dl className="step-seven-detail-list">
            <div>
              <dt>Purpose</dt>
              <dd>{exercise.purpose}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{exercise.prescription}</dd>
            </div>
            <div>
              <dt>Sets</dt>
              <dd>{exercise.sets}</dd>
            </div>
            <div>
              <dt>Support requirements</dt>
              <dd>{exercise.supportRequirement}</dd>
            </div>
            <div>
              <dt>Safety note</dt>
              <dd>{exercise.safety}</dd>
            </div>
          </dl>
          <div className="step-seven-preview__actions">
            <VoiceButton script={voice} label="Watch Again" />
            <PrimaryActionBar
              primaryLabel="Start Exercise"
              secondaryLabel="Return to Exercise Plan"
              onPrimary={() => goTo(`/display/exercises/${exercise.hrefId}/live`)}
              onSecondary={() => goTo('/display/exercises/plan')}
            />
          </div>
        </aside>
      </main>
    </SessionShell>
  );
}

function storedExerciseResult(dashboard, exercise) {
  const result = resultFromDashboard(dashboard) || {};
  const results = result.structuredPipeline?.exercisePlan?.sessionResults
    || result.exercisePrescription?.sessionResults
    || dashboard?.session?.assessmentSession?.exercisePrescription?.sessionResults
    || [];
  return results.find((entry) => normalizeKey(entry.exerciseId) === normalizeKey(exercise.exerciseId)) || null;
}

function exerciseSessionState(dashboard, exercise, paused) {
  const stored = storedExerciseResult(dashboard, exercise);
  const completedDosage = stored?.completedDosage || {};
  const count = whole(completedDosage.repetitions ?? completedDosage.repetitionsPerSide ?? completedDosage.steps, 0);
  const target = exercise.repetitions || exercise.durationSeconds || 1;
  const set = whole(completedDosage.sets, 1) || 1;
  const remaining = Math.max(0, target - count);
  return {
    count,
    target,
    set,
    remaining,
    paused,
    cue: paused ? 'Paused. Start again when you feel ready.' : exercise.cue,
    restSeconds: exercise.restSeconds,
    safetyEvents: stored?.safetyEvents || [],
    stored,
  };
}

function LiveMetric({ label, value }) {
  return (
    <article className="step-seven-live-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function RestScreen({ exercise, session, onContinue, onEnd }) {
  return (
    <main className="step-seven-rest">
      <section className="step-seven-rest-card">
        <StepIcon tone="success" />
        <p className="step-seven-kicker">Set Complete</p>
        <h2>Set Complete</h2>
        <div className="step-seven-rest-countdown" aria-label={`Rest for ${session.restSeconds} seconds`}>
          <strong>{session.restSeconds}</strong>
          <span>rest seconds</span>
        </div>
        <p>Rest for a moment.</p>
        <p>Breathe normally.</p>
        <p>Start when you feel ready.</p>
        <strong>Next set: {Math.min(exercise.sets, session.set + 1)} of {exercise.sets}</strong>
        <PrimaryActionBar
          primaryLabel="Start Next Set"
          secondaryLabel="End This Exercise"
          onPrimary={onContinue}
          onSecondary={onEnd}
        />
      </section>
    </main>
  );
}

function ManualExerciseScreen({ exercise, onComplete, onSkip, onSymptom }) {
  return (
    <main className="step-seven-manual">
      <section className="step-seven-manual__demo">
        <ExerciseDemo exercise={exercise} large />
      </section>
      <section className="step-seven-manual__content">
        <p className="step-seven-kicker">Self-reported exercise</p>
        <h2>{exercise.displayName}</h2>
        <p>This exercise is not counted automatically by the camera.</p>
        <dl className="step-seven-detail-list">
          <div>
            <dt>Instructions</dt>
            <dd>{exercise.sequence}</dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>{exercise.prescription}</dd>
          </div>
          <div>
            <dt>Safety guidance</dt>
            <dd>{exercise.safety}</dd>
          </div>
        </dl>
        <div className="step-seven-manual-timer" aria-label="Use the timer when appropriate">
          <strong>{exercise.durationSeconds || 45}</strong>
          <span>seconds</span>
        </div>
        <PrimaryActionBar
          primaryLabel="I Completed This Exercise"
          secondaryLabel="Skip This Exercise"
          tertiaryLabel="I Felt Discomfort"
          onPrimary={onComplete}
          onSecondary={onSkip}
          onTertiary={onSymptom}
        />
      </section>
    </main>
  );
}

function SymptomSafetyScreen({ exercise, safetyEvent }) {
  const message = safetyEvent
    ? `${titleCase(safetyEvent)} was recorded during this exercise.`
    : 'Discomfort was reported during this exercise.';
  return (
    <main className="step-seven-symptom">
      <section className="step-seven-symptom-card" role="alert">
        <StepIcon tone="danger" />
        <h2>Please sit down safely.</h2>
        <p>{message}</p>
        <p>Do not continue if you feel dizzy, have chest pain, or cannot catch your breath.</p>
        <p>Contact a healthcare professional if symptoms continue.</p>
        <p>Safety event recorded for today's session.</p>
        <PrimaryActionBar
          primaryLabel="End Session"
          secondaryLabel="Return Home"
          onPrimary={() => goTo('/display/session/complete')}
          onSecondary={() => goTo('/display/home')}
        />
      </section>
    </main>
  );
}

export function DisplayExerciseLiveScreen({ dashboard }) {
  const context = useMemo(() => planContext(dashboard), [dashboard]);
  const exercise = exerciseById(context, currentExerciseId());
  const [paused, setPaused] = useState(false);
  const [reportedSafetyEvent, setReportedSafetyEvent] = useState(null);

  if (context.restricted) {
    return (
      <SessionShell
        eyebrow="Exercise restricted"
        title="Professional Guidance Needed"
        description="The current plan does not allow this exercise to start automatically."
        connection={<ConnectionIndicator status="waiting" label="Review needed" detail="Exercise start restricted" />}
        progress={<SessionProgress current={11} total={12} label="Exercise progress" />}
        className="step-seven-live-shell"
      >
        <PlanRestriction context={context} />
      </SessionShell>
    );
  }

  if (!exercise) return <ExerciseNotReady context={context} />;

  const session = exerciseSessionState(dashboard, exercise, paused);
  const safetyEvent = reportedSafetyEvent || session.safetyEvents[0] || null;
  const resting = Boolean(session.stored && session.remaining <= 0 && session.set < exercise.sets);

  if (safetyEvent) {
    return (
      <SessionShell
        eyebrow="Safety"
        title="Stop Exercise"
        description="Safety guidance is shown before any further movement."
        connection={<ConnectionIndicator status="lost" label="Session stopped" detail={exercise.displayName} />}
        progress={<SessionProgress current={11} total={12} label="Exercise progress" />}
        className="step-seven-live-shell"
      >
        <SymptomSafetyScreen exercise={exercise} safetyEvent={safetyEvent} />
      </SessionShell>
    );
  }

  if (resting) {
    return (
      <SessionShell
        eyebrow="Rest"
        title="Set Complete"
        description="Rest before the next set."
        connection={<ConnectionIndicator status="connected" label="Rest period" detail={exercise.displayName} />}
        progress={<SessionProgress current={11} total={12} label="Exercise progress" />}
        className="step-seven-live-shell"
      >
        <RestScreen
          exercise={exercise}
          session={session}
          onContinue={() => goTo('/display/exercises/plan')}
          onEnd={() => goTo(`/display/exercises/${exercise.hrefId}/complete`)}
        />
      </SessionShell>
    );
  }

  if (!exercise.cameraSupported) {
    return (
      <SessionShell
        eyebrow="Guided exercise"
        title={exercise.displayName}
        description="Use manual controls for exercises that are not counted by the camera."
        connection={<ConnectionIndicator status="connected" label="Self-reported exercise" detail={exercise.prescription} />}
        progress={<SessionProgress current={11} total={12} label="Exercise progress" />}
        className="step-seven-live-shell"
      >
        <ManualExerciseScreen
          exercise={exercise}
          onComplete={() => goTo(`/display/exercises/${exercise.hrefId}/complete`)}
          onSkip={() => goTo('/display/exercises/plan')}
          onSymptom={() => setReportedSafetyEvent('DISCOMFORT')}
        />
      </SessionShell>
    );
  }

  const voice = session.cue;

  return (
    <SessionShell
      eyebrow="Guided exercise"
      title={exercise.displayName}
      description="Move slowly and keep support nearby."
      connection={<ConnectionIndicator status={session.paused ? 'waiting' : 'connected'} label={session.paused ? 'Paused' : 'Camera feedback active'} detail={exercise.feedbackLabel} />}
      progress={<SessionProgress current={11} total={12} label="Exercise progress" />}
      className="step-seven-live-shell"
    >
      <main className="step-seven-live">
        <section className="step-seven-live__demo">
          <ExerciseDemo exercise={exercise} large />
        </section>
        <section className="step-seven-live__camera">
          <CameraPreview
            frameSrc={dashboard?.activeCameraFrame?.src}
            mediaStream={dashboard?.activeCameraStream}
            label="Exercise camera preview"
            guide="Stay inside the marked exercise area"
            onFrameLoaded={dashboard?.handleCameraFrameLoaded}
            onFrameError={dashboard?.handleCameraFrameError}
          >
            <div className="step-seven-position-overlay" aria-hidden="true" />
          </CameraPreview>
        </section>
        <aside className="step-seven-live__status">
          <LiveMetric label="Repetition count" value={`${session.count} of ${session.target}`} />
          <LiveMetric label="Set count" value={`${session.set} of ${exercise.sets}`} />
          <LiveMetric label="Remaining exercises" value={String(Math.max(0, context.exercises.length - 1))} />
          <div className="step-seven-current-cue" data-voice-script={voice} aria-live="polite">
            <span>Current cue</span>
            <strong>{session.cue}</strong>
          </div>
          <div className="step-seven-rest-status">
            <span>Rest status</span>
            <strong>{session.remaining <= 0 ? 'Ready for rest' : 'Rest comes after this set'}</strong>
          </div>
        </aside>
      </main>
      <footer className="step-seven-live-actions">
        <VoiceButton script={voice} />
        <PrimaryActionBar
          primaryLabel={session.paused ? 'Resume' : 'Pause'}
          secondaryLabel="I Felt Discomfort"
          tertiaryLabel="End This Exercise"
          onPrimary={() => setPaused((value) => !value)}
          onSecondary={() => setReportedSafetyEvent('DISCOMFORT')}
          onTertiary={() => goTo(`/display/exercises/${exercise.hrefId}/complete`)}
        />
      </footer>
    </SessionShell>
  );
}

export function DisplayExerciseCompleteScreen({ dashboard }) {
  const context = useMemo(() => planContext(dashboard), [dashboard]);
  const exercise = exerciseById(context, currentExerciseId());
  const stored = exercise ? storedExerciseResult(dashboard, exercise) : null;
  const [selected, setSelected] = useState(stored?.safetyEvents?.length ? 'symptom' : '');
  const status = stored ? 'completed' : 'not_recorded';
  const symptomatic = selected === 'symptom';

  if (!exercise) return <ExerciseNotReady context={context} />;

  function select(value) {
    setSelected(value);
  }

  return (
    <SessionShell
      eyebrow="Post-exercise check"
      title={status === 'completed' ? 'Exercise Complete' : 'Exercise Completion Not Recorded'}
      description="Check how you felt before moving on."
      connection={<ConnectionIndicator status={symptomatic ? 'lost' : 'connected'} label={symptomatic ? 'Session stopped' : 'Exercise saved'} detail={exercise.displayName} />}
      progress={<SessionProgress current={12} total={12} label="Exercise progress" />}
      className="step-seven-complete-shell"
    >
      <main className="step-seven-exercise-complete">
        <section className="step-seven-check-card">
          <h2>How did you feel during this exercise?</h2>
          <div className="step-seven-symptom-options" role="group" aria-label="Exercise symptom check">
            <button type="button" className={selected === 'none' ? 'is-selected' : ''} onClick={() => select('none')}>
              No discomfort
            </button>
            <button type="button" className={selected === 'mild' ? 'is-selected' : ''} onClick={() => select('mild')}>
              Mild difficulty
            </button>
            <button type="button" className={selected === 'symptom' ? 'is-selected is-danger' : ''} onClick={() => select('symptom')}>
              Pain, dizziness, or shortness of breath
            </button>
          </div>
        </section>

        {symptomatic ? (
          <section className="step-seven-symptom-card" role="alert">
            <StepIcon tone="danger" />
            <h2>Please sit down safely.</h2>
            <p>Do not continue if you feel dizzy, have chest pain, or cannot catch your breath.</p>
            <p>Contact a healthcare professional if symptoms continue.</p>
            <p>Safety event recorded for today's session.</p>
          </section>
        ) : (
          <section className="step-seven-check-summary">
            <StepIcon tone="success" />
            <h2>{status === 'completed' ? 'Exercise result stored' : 'No stored exercise result is available'}</h2>
            <p>{selected === 'mild' ? 'Mild difficulty was recorded. Keep the next activity gentle.' : 'Take a moment before the next activity.'}</p>
          </section>
        )}

        <PrimaryActionBar
          primaryLabel={symptomatic ? 'End Session' : 'Continue'}
          secondaryLabel="Return to Exercise Plan"
          onPrimary={() => goTo(symptomatic ? '/display/error/safety-stop' : '/display/session/complete')}
          onSecondary={() => goTo('/display/exercises/plan')}
        />
      </main>
    </SessionShell>
  );
}

function formatScheduledDate(value) {
  const timestamp = finite(value);
  if (timestamp === null) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(new Date(timestamp));
}

export function DisplaySessionCompleteScreen({ dashboard }) {
  const context = useMemo(() => planContext(dashboard), [dashboard]);
  const assessment = dashboard?.assessmentSession || dashboard?.session?.assessmentSession || null;
  const assessmentSlots = assessment?.functionalTests || {};
  const assessmentsCompleted = Object.values(assessmentSlots).filter((slot) => slot?.status === 'COMPLETED').length;
  const exerciseResults = assessment?.exercisePrescription?.sessionResults || [];
  const completedExerciseIds = new Set(exerciseResults.map((result) => result.exerciseId).filter(Boolean));
  const exercisesCompleted = completedExerciseIds.size;
  const activeMs = exerciseResults.reduce((sum, result) => {
    const started = finite(result.startedAt);
    const completed = finite(result.completedAt);
    return started !== null && completed !== null && completed >= started ? sum + completed - started : sum;
  }, 0);
  const activeMinutes = activeMs > 0 ? Math.round(activeMs / 60000) : null;
  const partial = assessment?.status !== 'COMPLETED' || exercisesCompleted < context.exercises.length;
  const projection = dashboard?.session?.careAgentProjection || null;
  const nextSessionAt = projection?.currentSessionPlan?.scheduledAtMs || projection?.currentSessionPlan?.scheduledAt;

  return (
    <div className="foundation-shell step-seven-shell step-seven-session-complete-shell">
      <AppHeader
        eyebrow="Complete"
        title="Today's Session Is Complete"
        description={partial ? 'Your session ended early and the saved activity is shown below.' : "You completed today's plan."}
        connection={<ConnectionIndicator status={partial ? 'waiting' : 'connected'} label={partial ? 'Session ended' : 'Session complete'} detail="Summary ready" />}
      />
      <main className="step-seven-session-complete">
        <section className="step-seven-complete-hero">
          <StepIcon tone={partial ? 'warning' : 'success'} />
          <h2>{partial ? 'Today has been saved' : "You completed today's plan."}</h2>
          <p>Consistent practice helps you track changes over time.</p>
        </section>
        <section className="step-seven-complete-grid" aria-label="Session completion summary">
          <SummaryMetric label="Assessments completed" value={String(assessmentsCompleted)} />
          <SummaryMetric label="Exercises completed" value={`${exercisesCompleted} of ${context.exercises.length}`} />
          <SummaryMetric label="Total active time" value={activeMinutes === null ? 'No stored duration' : `${activeMinutes} minutes`} />
          <SummaryMetric label="Weekly completion count" value="View stored progress" />
          <SummaryMetric label="Next session date" value={formatScheduledDate(nextSessionAt)} />
          <SummaryMetric label="Next reassessment date" value={formatScheduledDate(projection?.nextReassessmentAt)} />
        </section>
        <PrimaryActionBar
          primaryLabel="Return Home"
          secondaryLabel="View Today's Results"
          tertiaryLabel="View Weekly Report"
          onPrimary={() => goTo('/display/home')}
          onSecondary={() => goTo('/display/results/summary')}
          onTertiary={() => goTo('/display/reports')}
        />
      </main>
    </div>
  );
}
