import { PageShell } from '../shared/ReferenceShell';
import { CheckList, Panel, ScreenHeading, SectionTitle } from '../shared/components';
import { SteplyIcon } from '../shared/icons';
import { goTo } from '../shared/navigation';
import { exerciseSafetyItems, recommendedExercises } from './exerciseData';

function ExerciseListItem({ exercise, index }) {
  return (
    <button type="button" onClick={() => goTo('/display/exercises/balance-practice/live')}>
      <span className="ref-exercise-list__number">{String(index + 1).padStart(2, '0')}</span>
      <div>
        <h3>{exercise.title}</h3>
        <p>{exercise.description}</p>
        <div className="ref-exercise-meta"><span><SteplyIcon name="timer" size={16} />{exercise.amount}</span><span><SteplyIcon name="repeat" size={16} />{exercise.sets}</span></div>
        <div className="ref-tags">{exercise.tags.map((tag) => <i key={tag}>{tag}</i>)}</div>
      </div>
      <b><SteplyIcon name="arrowRight" size={22} /></b>
    </button>
  );
}

export function ReferenceExercisePlanScreen() {
  return (
    <PageShell active="Exercise" className="ref-exercise-plan-page">
      <main className="ref-page ref-exercise-plan">
        <ScreenHeading title="Recommended Exercises" subtitle="These exercises are selected based on your assessment results to help improve your balance and confidence." />
        <div className="ref-exercise-plan__columns">
          <section>
            <div className="ref-plan-banner"><span><SteplyIcon name="award" size={27} /></span><div><h2>Level 1 Plan</h2><p>Build a strong foundation with safe, effective exercises.</p></div><b>Stage 1 of 4</b></div>
            <div className="ref-exercise-list">
              {recommendedExercises.map((exercise, index) => <ExerciseListItem key={exercise.title} exercise={exercise} index={index} />)}
            </div>
          </section>
          <aside className="ref-exercise-aside">
            <Panel className="ref-safety-card"><SectionTitle icon="shieldCheck">Exercise Safely</SectionTitle><CheckList items={exerciseSafetyItems} /></Panel>
            <button type="button" className="ref-solid-action" onClick={() => goTo('/display/exercises/balance-practice/live')}><span><SteplyIcon name="play" size={20} /></span><b>Start Exercise Session<small>Begin your recommended plan</small></b></button>
            <button type="button" className="ref-library-action"><span><SteplyIcon name="bookOpen" size={32} /></span><b>View Exercise Library<small>Explore all exercises</small></b></button>
            <Panel className="ref-tip-card"><h3><SteplyIcon name="lightbulb" size={19} />Tip</h3><p>Consistency is key! Aim to exercise regularly for the best results.</p></Panel>
          </aside>
        </div>
      </main>
    </PageShell>
  );
}
