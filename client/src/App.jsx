import { useSteplyDashboard } from './hooks/useSteplyDashboard';
import { useEffect } from 'react';
import { SessionRail } from './components/SessionRail';
import { StartPanel } from './components/StartPanel';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ResultPanel } from './components/ResultPanel';
import { ExercisePanel } from './components/ExercisePanel';
import './styles/app.css';

function emergencyExerciseResult(dashboard) {
  const state = dashboard.poseAnalysis?.analysisState || {};
  const testType = dashboard.selectedTest || 'chair_stand';
  const primaryValue = state.primaryValue ?? state.repetitionCount ?? 0;
  const primaryLabel = state.primaryLabel || (testType === 'standing_posture' ? 'Posture Score' : testType === 'tug' ? 'TUG Seconds' : 'Chair Stands');
  const recommendationLevel = state.isFullBodyVisible ? 'practice_needed' : 'recheck';

  return {
    testType,
    primaryValue,
    primaryLabel,
    repetitionCount: primaryValue,
    durationSeconds: state.durationSeconds || dashboard.poseAnalysis?.durationSeconds || 30,
    confidence: state.confidence || 0,
    trunkLeanScore: state.trunkLeanScore || 0,
    symmetryScore: state.symmetryScore || 0,
    stabilityScore: state.stabilityScore || 0,
    recommendationLevel,
    summaryMessage: `${primaryLabel} ${primaryValue} measured.`,
    completedAt: Date.now(),
  };
}

function shouldShowExercisePanel(dashboard) {
  const state = dashboard.poseAnalysis?.analysisState || {};
  const durationSeconds = state.durationSeconds || dashboard.poseAnalysis?.durationSeconds || 30;
  const timedOut = durationSeconds > 0 && (state.elapsedSeconds || 0) >= durationSeconds;
  return dashboard.activeStep === 'exercise'
    || dashboard.poseAnalysis?.workerStatus === 'finished'
    || Boolean(dashboard.poseAnalysis?.analysisResult)
    || timedOut;
}

function renderPanel(dashboard) {
  if (shouldShowExercisePanel(dashboard)) {
    return (
      <ExercisePanel
        finalResult={dashboard.finalResult || dashboard.poseAnalysis?.analysisResult || emergencyExerciseResult(dashboard)}
        onRestart={() => {
          dashboard.poseAnalysis?.resetAnalysis?.();
          dashboard.setActiveStep('analysis');
        }}
      />
    );
  }

  if (dashboard.activeStep === 'result') {
    return (
      <ResultPanel
        finalResult={dashboard.finalResult}
        liveResult={dashboard.liveResult}
        onGoExercises={() => dashboard.setActiveStep('exercise')}
        onDemoFinal={dashboard.handleSaveFinal}
      />
    );
  }

  if (dashboard.activeStep === 'analysis' || dashboard.remoteCameraFrame?.src) {
    return (
      <AnalysisPanel
        selectedTest={dashboard.selectedTest}
        remoteCameraFrame={dashboard.remoteCameraFrame}
        remoteCameraStatus={dashboard.remoteCameraStatus}
        onSelectTest={dashboard.handleSelectTest}
        poseAnalysis={dashboard.poseAnalysis}
      />
    );
  }

  return (
    <StartPanel
      session={dashboard.session}
      onStartAnalysis={() => dashboard.session ? dashboard.setActiveStep('analysis') : dashboard.handleCreateSession()}
    />
  );
}

export default function App() {
  const dashboard = useSteplyDashboard();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [dashboard.activeStep]);

  return (
    <div className="steply-shell">
      <SessionRail
        sessionBundle={dashboard.sessionBundle}
        networkInfo={dashboard.networkInfo}
        onCreateSession={dashboard.handleCreateSession}
        onCopyPayload={dashboard.handleCopyPayload}
        onRefreshSession={dashboard.handleRefreshSession}
        busy={dashboard.busy}
        error={dashboard.error || dashboard.poseAnalysis?.error}
      />

      <main className="dashboard-main">
        <header className="top-bar">
          <div>
            <div className="eyebrow">Soft Wellness Companion</div>
            <h1>Steply PC Movement Coach</h1>
            <p>The phone streams camera frames, and the PC runs MediaPipe keypoint extraction and pose analysis in the background.</p>
          </div>
          <div className="top-bar__status" aria-label="local dashboard status">
            <span className="status-dot" />
            PC Pose Worker
          </div>
        </header>

        <div className="screen-stage" key={dashboard.activeStep}>
          {renderPanel(dashboard)}
        </div>
      </main>
    </div>
  );
}
