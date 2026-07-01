import { recommendationExercises } from '../data/recommendationExercises';
import { recommendationTemplatesForLevel, testLabel } from '../pose/recommendationRules';
import { ExerciseCard, SteplyButton, SteplyCard } from './SteplyPrimitives';

function toExerciseCard(template, index) {
  return {
    number: index + 1,
    title: template.title,
    description: template.description,
    safety: template.safetyNote,
    minutes: Math.max(1, Math.round((template.durationSeconds || 60) / 60)),
    type: index === 0 ? 'A' : 'B',
  };
}

export function ExercisePanel({ finalResult, onRestart }) {
  const dynamicExercises = finalResult?.recommendations?.length
    ? finalResult.recommendations.map(toExerciseCard)
    : finalResult?.recommendationLevel
      ? recommendationTemplatesForLevel(finalResult.recommendationLevel, finalResult.testType).map(toExerciseCard)
      : recommendationExercises;
  const sourceTestLabel = finalResult?.testLabel || testLabel(finalResult?.testType);

  return (
    <div className="panel-grid panel-grid--exercise">
      <SteplyCard className="recommendation-header">
        <div>
          <div className="eyebrow">Exercise Recommendation</div>
          <h2>Recommended exercises</h2>
          <p>Safe practice movements are recommended based on the {sourceTestLabel} result analyzed on the PC.</p>
        </div>
        <div className="recommendation-time">about <strong>{dynamicExercises.length * 2}</strong> min</div>
      </SteplyCard>

      <div className="exercise-grid">
        {dynamicExercises.map((exercise) => (
          <ExerciseCard key={exercise.title} {...exercise} />
        ))}
      </div>

      <SteplyButton className="wide-cta" onClick={onRestart}>Start Another Movement Check</SteplyButton>
    </div>
  );
}
