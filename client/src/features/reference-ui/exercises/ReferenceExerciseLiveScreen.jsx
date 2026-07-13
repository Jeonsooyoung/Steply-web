import { useEffect, useState } from 'react';
import { LiveCamera, useEnsureLocalCamera } from '../shared/LiveCamera';
import { PageShell } from '../shared/ReferenceShell';
import { CheckList, Panel, ProgressRing, SectionTitle } from '../shared/components';
import { SteplyIcon } from '../shared/icons';
import { goTo } from '../shared/navigation';
import { tandemInstructions, tandemSafetyReminders } from './exerciseData';

const TOTAL_SETS = 3;

export function ReferenceExerciseLiveScreen({ dashboard }) {
  useEnsureLocalCamera(dashboard, !dashboard?.isPhoneProfileLinked);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(18);
  const [set, setSet] = useState(1);

  useEffect(() => {
    if (paused || seconds <= 0) return undefined;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [paused, seconds]);

  function completeSet() {
    setPaused(false);
    if (set < TOTAL_SETS) {
      setSet((value) => value + 1);
      setSeconds(20);
      return;
    }
    goTo('/display/exercises/plan');
  }

  return (
    <PageShell active="Exercise" className="ref-exercise-live-page">
      <main className="ref-session-card">
        <header className="ref-session-card__header"><span className="ref-session-icon"><SteplyIcon name="personStanding" size={31} /></span><div><h1>Supported Tandem Stance (Level 1)</h1><p>Follow the guide below and move at your own pace.</p></div><b><SteplyIcon name="star" size={18} />Recommended for you</b></header>
        <div className="ref-exercise-live-grid">
          <Panel className="ref-how-card">
            <h2>How to do it</h2>
            <ol>{tandemInstructions.map((item, index) => <li key={item}><span>{index + 1}</span><p>{item}</p></li>)}</ol>
            <div className="ref-move-note"><SteplyIcon name="lightbulb" size={20} /><span>Move at your own pace.<br />It’s okay to take breaks.</span></div>
          </Panel>
          <LiveCamera dashboard={dashboard} className="ref-exercise-camera" label="Live exercise camera" />
          <aside className="ref-live-side">
            <Panel><SectionTitle icon="chartTrend">Your Progress</SectionTitle><div className="ref-set-progress"><span>Set<strong>{set} of {TOTAL_SETS}</strong></span><div>{Array.from({ length: TOTAL_SETS }, (_, index) => index + 1).map((item) => <i key={item} className={item === set ? 'active' : ''}>{item}</i>)}</div></div></Panel>
            <Panel><SectionTitle icon="timer">Time Remaining</SectionTitle><ProgressRing value={seconds} progress={(20 - seconds) / 20 * 100} /></Panel>
            <Panel><SectionTitle icon="shieldCheck">Safety Reminders</SectionTitle><CheckList items={tandemSafetyReminders} /></Panel>
          </aside>
        </div>
        <footer className="ref-session-actions">
          <button type="button" onClick={() => goTo('/display/exercises/plan')}><SteplyIcon name="arrowLeft" />Previous</button>
          <button type="button" className="amber" onClick={() => setPaused((value) => !value)}><SteplyIcon name={paused ? 'play' : 'pause'} />{paused ? 'Resume' : 'Pause'}</button>
          <button type="button" className="solid" onClick={completeSet}>{set === TOTAL_SETS ? 'Finish Exercise' : 'Complete Set'}<SteplyIcon name="arrowRight" /></button>
        </footer>
      </main>
    </PageShell>
  );
}
