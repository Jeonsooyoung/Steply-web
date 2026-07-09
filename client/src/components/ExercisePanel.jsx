import { useEffect, useMemo, useState } from 'react';
import { recommendationExercises } from '../data/recommendationExercises';
import { recommendationTemplatesForResult, testLabel } from '../pose/recommendationRules';
import { gameTypeForRecommendation } from '../pose/arExerciseEngine';
import { ArExerciseGame } from './ArExerciseGame';
import { PoseOverlay } from './pose/PoseOverlay';
import { SteplyButton, SteplyCard, TimerCircle } from './SteplyPrimitives';

const friendlyExerciseCopy = {
  side_hip_strengthening: {
    description: 'Hold a chair or wall and slowly lift one leg out to the side, then lower with control.',
    safety: 'Keep your body tall. If you feel unsteady, lower your foot and hold your support.',
    type: '10 reps',
  },
  knee_extension: {
    description: 'Sit tall, slowly straighten one knee, pause briefly, then lower your foot.',
    safety: 'Keep your thigh supported by the chair and stop if your knee hurts.',
    type: '10 reps',
  },
  chair_stand: {
    description: 'Stand from a stable chair and sit back down slowly with both feet on the floor.',
    safety: 'Place the chair near a wall and use support when needed.',
    type: '10 reps',
  },
  tandem_stance: {
    description: 'Place one foot in front of the other and hold the stance with support nearby.',
    safety: 'Keep a chair or wall within reach the whole time.',
    type: 'Hold',
  },
  tandem_walk: {
    description: 'Walk slowly heel-to-toe along a clear path while keeping support nearby.',
    safety: 'Use a rail, wall, or helper when needed.',
    type: 'Guided',
  },
  one_leg_stance: {
    description: 'Lift one foot slightly and hold a short, steady balance position.',
    safety: 'Lower your foot before you feel unsteady.',
    type: 'Hold',
  },
  heel_raises: {
    description: 'Hold a chair and rise gently onto your toes, then lower slowly.',
    safety: 'Keep both hands close to support.',
    type: '10 reps',
  },
  toe_raises: {
    description: 'Hold support and lift the front of both feet slightly, then lower with control.',
    safety: 'Keep your heels on the floor and use support the whole time.',
    type: '10 reps',
  },
  supported_tandem_stand: {
    description: 'Stand with one foot in front of the other while keeping support within reach.',
    safety: 'Use a chair, counter, or rail and step out before you feel uncomfortable.',
    type: 'Hold',
  },
  heel_toe_walking: {
    description: 'Walk slowly heel-to-toe along a clear path while keeping support nearby.',
    safety: 'Use a rail, wall, or helper when needed.',
    type: 'Guided',
  },
  sideways_walking: {
    description: 'Take small sideways steps along a counter or rail.',
    safety: 'Keep your feet from crossing and keep one hand near support.',
    type: 'Guided',
  },
  supported_one_leg_stand: {
    description: 'Hold a chair and lift one foot slightly for a short steady hold.',
    safety: 'Keep both hands close to support and lower the foot early if needed.',
    type: 'Hold',
  },
  sit_to_stand_practice: {
    description: 'Stand from a stable chair and sit back down at a calm pace.',
    safety: 'Place the chair against a wall and use support if needed.',
    type: '5 reps',
  },
  mini_knee_bends: {
    description: 'Hold support, bend the knees slightly, then stand tall again.',
    safety: 'Keep the bend small and keep your knees over your toes.',
    type: '8 reps',
  },
  sit_to_stand_ladder: {
    description: 'Do a short set, rest, then repeat only if the first set felt steady.',
    safety: 'Rest between sets and keep the chair stable.',
    type: 'Sets',
  },
  slow_sit_to_stand: {
    description: 'Stand up, pause, then sit down slowly and quietly.',
    safety: 'Keep the chair against a wall and use support when needed.',
    type: '5 reps',
  },
  supported_walking: {
    description: 'Walk a short clear path with a rail, wall, or helper nearby.',
    safety: 'Keep the path clear and turn slowly.',
    type: 'Guided',
  },
  figure_8_walking: {
    description: 'Walk slowly around two clear markers in a gentle figure-8 path.',
    safety: 'Use supervision if turning felt slow or uneven today.',
    type: 'Guided',
  },
  gentle_walking_plan: {
    description: 'Walk a short clear path at a comfortable pace.',
    safety: 'Keep support nearby and avoid rushing.',
    type: 'Plan',
  },
  balanced_bilateral_practice: {
    description: 'Practice a gentle movement evenly on both sides.',
    safety: 'Move slowly and repeat the check next session.',
    type: 'Gentle',
  },
};

function inferArMetadata(template = {}) {
  if (template.exerciseKey || template.arInputKey || template.gameType) return {};

  const searchable = `${template.title || ''} ${template.description || ''}`.toLowerCase();
  if (searchable.includes('side') || searchable.includes('hip')) {
    return {
      exerciseKey: 'side_hip_strengthening',
      arInputKey: 'side_leg_raise',
    };
  }
  if (searchable.includes('knee')) {
    return {
      exerciseKey: 'knee_extension',
      arInputKey: 'knee_extension',
    };
  }
  if (searchable.includes('chair') || searchable.includes('sit')) {
    return {
      exerciseKey: 'chair_stand',
      arInputKey: 'sit_to_stand',
    };
  }
  if (searchable.includes('one-leg') || searchable.includes('one leg')) {
    return {
      exerciseKey: 'one_leg_stance',
      arInputKey: 'one_leg_stance',
    };
  }
  if (searchable.includes('tandem')) {
    return {
      exerciseKey: 'tandem_stance',
      arInputKey: 'tandem_stance',
    };
  }

  return {
    exerciseKey: 'balance_retraining',
    arInputKey: 'balance_retraining',
  };
}

function exerciseId(template, index) {
  return `${template.exerciseKey || template.arInputKey || template.title}-${index}`;
}

function buildExerciseSourceList(recommendationTemplates) {
  const mergedTemplates = recommendationTemplates.length
    ? [...recommendationTemplates, ...recommendationExercises]
    : recommendationExercises;
  const seen = new Set();

  return mergedTemplates.filter((template) => {
    const key = template.exerciseKey || template.arInputKey || template.id || template.title;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toExerciseCard(template, index) {
  const arMetadata = inferArMetadata(template);
  const normalizedTemplate = {
    ...template,
    ...arMetadata,
  };
  const copy = friendlyExerciseCopy[template.exerciseKey] || friendlyExerciseCopy[template.id] || {};
  return {
    ...normalizedTemplate,
    id: exerciseId(normalizedTemplate, index),
    number: index + 1,
    title: template.title,
    description: copy.description || template.description,
    safety: copy.safety || template.safetyNote || template.safetyInstruction,
    minutes: Math.max(1, Math.round((template.durationSeconds || 60) / 60)),
    type: copy.type || 'Guided',
  };
}

function repetitionsFromExercise(exercise) {
  const fromType = Number.parseInt(exercise?.type, 10);
  if (Number.isFinite(fromType)) return fromType;
  const fromTitle = Number.parseInt(exercise?.title, 10);
  if (Number.isFinite(fromTitle)) return fromTitle;
  return 10;
}

function ExerciseCameraPreview({ remoteCameraFrame, poseAnalysis, countdownSeconds }) {
  return (
    <SteplyCard className="mission-camera-card exercise-launch-stage-card">
      <div className="arena-stage arena-stage--camera arena-stage--guided exercise-launch-stage">
        {remoteCameraFrame?.src ? (
          <div className="remote-camera-layer">
            <img
              className="remote-camera-frame"
              src={remoteCameraFrame.src}
              alt="Live camera feed before exercise starts"
            />
            <PoseOverlay
              landmarks={poseAnalysis?.landmarks || []}
              frameSize={poseAnalysis?.frameSize}
              fit="contain"
            />
          </div>
        ) : (
          <>
            <div className="stage-grid" aria-hidden="true" />
            <div className="exercise-launch-message">
              <div className="eyebrow">Camera Setup</div>
              <h3>Bring your body into view</h3>
              <p>The exercise will start after the countdown when the phone camera is ready.</p>
            </div>
          </>
        )}

        <div className="guided-camera-focus" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="exercise-countdown-overlay">
          <span>{countdownSeconds}</span>
          <strong>Starting soon</strong>
        </div>

        <div className="remote-camera-badge">
          <span className={remoteCameraFrame?.src ? 'remote-camera-dot remote-camera-dot--live' : 'remote-camera-dot'} />
          {remoteCameraFrame?.src ? 'Receiving live phone camera stream' : 'Waiting for live phone camera stream'}
        </div>
      </div>
    </SteplyCard>
  );
}

function ExerciseStartControl({ activeExercise, activeGameType, onStart }) {
  const disabled = !activeExercise || !activeGameType;
  return (
    <button
      type="button"
      className="exercise-start-control"
      onClick={onStart}
      disabled={disabled}
    >
      <span>{disabled ? 'Practice Only' : 'Start'}</span>
      <strong>{disabled ? 'No AR game' : 'Exercise'}</strong>
      <small>{disabled ? 'Select another exercise' : '5 sec countdown'}</small>
    </button>
  );
}

export function ExercisePanel({ finalResult, remoteCameraFrame, poseAnalysis, onRestart, onViewProgress }) {
  const recommendationTemplates = finalResult?.recommendations?.length
    ? finalResult.recommendations
    : finalResult?.recommendationLevel
      ? recommendationTemplatesForResult(finalResult)
      : [];
  const sourceExercises = useMemo(
    () => buildExerciseSourceList(recommendationTemplates),
    [recommendationTemplates],
  );
  const dynamicExercises = useMemo(
    () => sourceExercises.map(toExerciseCard),
    [sourceExercises],
  );
  const visibleExercises = useMemo(() => dynamicExercises.slice(0, 3), [dynamicExercises]);
  const recommendationSignature = dynamicExercises
    .map((exercise) => `${exercise.title}:${exercise.exerciseKey || ''}:${exercise.arInputKey || ''}`)
    .join('|');
  const [activeExerciseId, setActiveExerciseId] = useState('');
  const [panelMode, setPanelMode] = useState('recommendations');
  const [exercisePhase, setExercisePhase] = useState('idle');
  const [countdownSeconds, setCountdownSeconds] = useState(5);
  const activeExercise = dynamicExercises.find((exercise) => exercise.id === activeExerciseId)
    || visibleExercises[0]
    || null;
  const sourceTestLabel = finalResult?.testLabel || testLabel(finalResult?.testType);
  const activeGameType = activeExercise ? gameTypeForRecommendation(activeExercise) : null;
  const safetyGateText = finalResult?.recommendationPlan?.gameDisabledReason || null;
  const targetReps = repetitionsFromExercise(activeExercise);
  const activeExerciseIndex = Math.max(
    0,
    visibleExercises.findIndex((exercise) => exercise.id === activeExercise?.id),
  );

  useEffect(() => {
    setActiveExerciseId(visibleExercises[0]?.id || '');
    setPanelMode('recommendations');
    setExercisePhase('idle');
    setCountdownSeconds(5);
  }, [recommendationSignature]);

  useEffect(() => {
    setExercisePhase('idle');
    setCountdownSeconds(5);
  }, [activeExercise?.id]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [panelMode]);

  useEffect(() => {
    if (exercisePhase !== 'countdown') return undefined;

    const durationMs = 5000;
    const startedAt = performance.now();
    setCountdownSeconds(5);

    const tick = () => {
      const elapsedMs = performance.now() - startedAt;
      const remaining = Math.max(0, Math.ceil((durationMs - elapsedMs) / 1000));
      setCountdownSeconds(remaining);

      if (elapsedMs >= durationMs) {
        setExercisePhase('running');
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 100);
    return () => window.clearInterval(intervalId);
  }, [exercisePhase, activeExercise?.id]);

  const handleSelectExercise = (exerciseId) => {
    setActiveExerciseId(exerciseId);
    setExercisePhase('idle');
    setCountdownSeconds(5);
  };

  const handleOpenExercise = () => {
    setPanelMode('exercise');
    setExercisePhase('idle');
    setCountdownSeconds(5);
  };

  const handleChooseAnotherExercise = () => {
    setPanelMode('recommendations');
    setExercisePhase('idle');
    setCountdownSeconds(5);
  };

  if (panelMode === 'recommendations') {
    return (
      <div className="exercise-recommendation-screen distance-mode distance-mode--exercise">
        <SteplyCard className="exercise-recommendation-hero">
          <div>
            <div className="eyebrow">Exercise Recommendation</div>
            <h2>{sourceTestLabel}</h2>
          </div>
        </SteplyCard>

        <div className="exercise-recommendation-options" aria-label="Exercise recommendations">
          {visibleExercises.map((exercise, index) => {
            const isActive = exercise.id === activeExercise?.id;
            const isPlayable = exercise.gameAllowed !== false && Boolean(gameTypeForRecommendation(exercise));
            return (
              <button
                key={exercise.id}
                type="button"
                className={`exercise-recommendation-option ${isActive ? 'exercise-recommendation-option--active' : ''}`}
                onClick={() => handleSelectExercise(exercise.id)}
                disabled={!isPlayable}
              >
                <strong>{index + 1}. {exercise.title}</strong>
                <span>{exercise.type}</span>
              </button>
            );
          })}
        </div>

        <div className="exercise-recommendation-actions">
          <SteplyButton onClick={handleOpenExercise} disabled={!activeGameType}>
            Start Selected Exercise
          </SteplyButton>
        </div>
      </div>
    );
  }

  return (
    <div className="exercise-mission-layout analysis-layout analysis-layout--guided distance-mode distance-mode--exercise">
      <aside className="mission-guide-column exercise-guide-column">
        <SteplyCard className="movement-guide-card exercise-detail-card">
          <div className="eyebrow">Exercise Type</div>
          <h3>{activeExercise?.title || 'Choose an exercise'}</h3>
          <p>{activeExercise?.description || 'Select one recommended exercise to open the matching live camera game.'}</p>
          <div className="exercise-detail-target">
            <span>One set</span>
            <strong>{targetReps}</strong>
            <span>reps</span>
          </div>
          {activeExercise?.safety ? (
            <div className="exercise-detail-safety">{activeExercise.safety}</div>
          ) : null}
        </SteplyCard>

        <SteplyCard className="feedback-stack feedback-stack--analysis guided-status-card exercise-status-card">
          <div className="eyebrow">Live Status</div>
          <h3>Large, simple feedback</h3>
          <div className="guided-status-row">
            <span>Exercise</span>
            <strong>{activeExerciseIndex + 1} / {visibleExercises.length}</strong>
          </div>
          <div className="guided-status-row">
            <span>Set Goal</span>
            <strong>{targetReps} reps</strong>
          </div>
        </SteplyCard>
      </aside>

      <main className="analysis-main-zone analysis-main-zone--mission exercise-main-zone">
        {exercisePhase === 'running' && activeExercise && activeGameType ? (
          <ArExerciseGame
            key={activeExercise.id}
            recommendations={[activeExercise]}
            remoteCameraFrame={remoteCameraFrame}
            poseAnalysis={poseAnalysis}
          />
        ) : exercisePhase === 'countdown' ? (
          <ExerciseCameraPreview
            remoteCameraFrame={remoteCameraFrame}
            poseAnalysis={poseAnalysis}
            countdownSeconds={countdownSeconds}
          />
        ) : (
          <SteplyCard className="mission-camera-card exercise-launch-stage-card">
            <div className="arena-stage arena-stage--camera arena-stage--guided exercise-launch-stage">
              <div className="stage-grid" aria-hidden="true" />
              <div className="exercise-launch-message">
                <div className="eyebrow">Posture Setup</div>
                <h3>{activeExercise?.title || 'Ready posture'}</h3>
                <p>Press Start, then get your full body in view before the game begins.</p>
              </div>
              <div className="guided-camera-focus" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="remote-camera-badge">
                <span className={remoteCameraFrame?.src ? 'remote-camera-dot remote-camera-dot--live' : 'remote-camera-dot'} />
                {remoteCameraFrame?.src ? 'Receiving live phone camera stream' : 'Waiting for live phone camera stream'}
              </div>
            </div>
          </SteplyCard>
        )}
      </main>

      <aside className="analysis-side analysis-side--guided exercise-side-panel">
        {exercisePhase === 'idle' ? (
          <ExerciseStartControl
            activeExercise={activeExercise}
            activeGameType={activeGameType}
            onStart={() => setExercisePhase('countdown')}
          />
        ) : (
          <TimerCircle
            value={exercisePhase === 'countdown' ? countdownSeconds : targetReps}
            max={exercisePhase === 'countdown' ? 5 : targetReps}
            label={exercisePhase === 'countdown' ? 'start' : 'reps'}
            score={targetReps}
          />
        )}

        <div className="exercise-actions exercise-actions--guided">
          <SteplyButton onClick={onViewProgress}>View My Progress</SteplyButton>
          <SteplyButton variant="secondary" onClick={handleChooseAnotherExercise}>Choose Another Exercise</SteplyButton>
          <SteplyButton variant="secondary" onClick={onRestart}>Start Another Mission</SteplyButton>
        </div>

        {safetyGateText ? (
          <SteplyCard className="feedback-stack feedback-stack--warning exercise-safety-gate">
            <div className="eyebrow">Safety</div>
            <h3>Check setup first</h3>
            <p>{safetyGateText}</p>
          </SteplyCard>
        ) : null}
      </aside>
    </div>
  );
}
