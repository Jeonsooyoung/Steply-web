import { useEffect, useRef, useState } from 'react';
import { LiveCamera, useEnsureLocalCamera } from '../shared/LiveCamera';
import { PageShell } from '../shared/ReferenceShell';
import { CheckList, Panel, ProgressRing, SectionTitle } from '../shared/components';
import { SteplyIcon } from '../shared/icons';
import { goTo } from '../shared/navigation';
import { balanceInstructions, balanceStages } from './assessmentData';

const BALANCE_STAGE_DURATION_MS = 10_000;

export function ReferenceBalanceTestScreen({ dashboard }) {
  useEnsureLocalCamera(dashboard, !dashboard?.isPhoneProfileLinked);
  const [paused, setPaused] = useState(false);
  const [stage, setStage] = useState(1);
  const [seconds, setSeconds] = useState(10);
  const stageDeadlineRef = useRef(Date.now() + BALANCE_STAGE_DURATION_MS);
  const pauseStartedAtRef = useRef(null);
  const transitioningRef = useRef(false);

  useEffect(() => {
    dashboard?.setActiveStep?.('ASSESSMENT');
    if (dashboard?.selectedTest !== 'four_stage_balance') dashboard?.handleSelectTest?.('four_stage_balance');
  }, [dashboard?.handleSelectTest, dashboard?.selectedTest, dashboard?.setActiveStep]);

  useEffect(() => {
    if (paused) {
      pauseStartedAtRef.current ??= Date.now();
      return undefined;
    }

    if (pauseStartedAtRef.current !== null) {
      stageDeadlineRef.current += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }

    function syncCountdown() {
      const remainingMs = stageDeadlineRef.current - Date.now();
      setSeconds(Math.max(0, Math.ceil(remainingMs / 1000)));
      if (remainingMs > 0 || transitioningRef.current) return;

      transitioningRef.current = true;
      if (stage < balanceStages.length) {
        stageDeadlineRef.current = Date.now() + BALANCE_STAGE_DURATION_MS;
        setStage((value) => value + 1);
        setSeconds(10);
        transitioningRef.current = false;
        return;
      }
      goTo('/display/results/summary');
    }

    syncCountdown();
    const timer = window.setInterval(syncCountdown, 250);
    return () => window.clearInterval(timer);
  }, [paused, stage]);

  function nextStage() {
    if (stage < balanceStages.length) {
      stageDeadlineRef.current = Date.now() + BALANCE_STAGE_DURATION_MS;
      transitioningRef.current = false;
      setStage((value) => value + 1);
      setSeconds(10);
      return;
    }
    goTo('/display/results/summary');
  }

  return (
    <PageShell active="Assessment" className="ref-balance-page">
      <main className="ref-balance-test">
        <div className="ref-balance-heading"><h1>4-Stage Balance Test</h1><div className="ref-stage-track">{balanceStages.map((label, index) => <div key={label} className={index + 1 <= stage ? 'active' : ''}><span>{index + 1}</span><small>{label}</small></div>)}</div></div>
        <div className="ref-balance-grid">
          <LiveCamera dashboard={dashboard} className="ref-balance-camera" label="Live balance test camera" />
          <aside className="ref-balance-guidance">
            <Panel><SectionTitle icon="clipboardList" tone="amber">Instructions</SectionTitle><CheckList items={balanceInstructions(stage)} /></Panel>
            <Panel className="ref-balance-timer"><SectionTitle icon="timer">Time remaining</SectionTitle><ProgressRing value={seconds} progress={(10 - seconds) * 10} large /></Panel>
          </aside>
          <Panel className="ref-stage-status">
            <SectionTitle icon="flag" tone="amber">Stage status</SectionTitle><p>Stage {stage} of 4</p><h2>{balanceStages[stage - 1]}</h2><b>{seconds === 0 ? 'Complete' : paused ? 'Paused' : 'In progress'}</b>
            <ol>{balanceStages.map((label, index) => <li key={label} className={index + 1 === stage ? 'active' : index + 1 < stage ? 'complete' : ''}><span>{index + 1}</span><p><strong>{label}</strong><small>{index + 1 === stage ? (paused ? 'Paused' : 'In progress') : index + 1 < stage ? 'Completed' : 'Pending'}</small></p></li>)}</ol>
          </Panel>
        </div>
        <footer className="ref-balance-actions"><button type="button" className="amber" onClick={() => setPaused((value) => !value)}><SteplyIcon name={paused ? 'play' : 'pause'} />{paused ? 'Resume' : 'Pause'}</button><button type="button" onClick={() => setPaused(true)}><SteplyIcon name="help" />Need help?</button><button type="button" className="solid" onClick={nextStage}>{stage === balanceStages.length ? 'View Results' : 'Next Stage'}<SteplyIcon name="arrowRight" /></button></footer>
      </main>
    </PageShell>
  );
}
