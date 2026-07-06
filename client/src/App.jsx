import { useSteplyDashboard } from './hooks/useSteplyDashboard';
import { useEffect, useState } from 'react';
import { SessionRail } from './components/SessionRail';
import { ProfileSidebar } from './components/ProfileSidebar';
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

function shouldShowAnalysisPanel(dashboard, hasStartedTest) {
  return hasStartedTest && (dashboard.activeStep === 'analysis' || Boolean(dashboard.remoteCameraFrame?.src));
}

function renderPanel(dashboard, { hasStartedTest, onStartTest }) {
  const isMobileConnected = Boolean(dashboard.session?.profile || dashboard.remoteCameraFrame?.src);

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

  if (shouldShowAnalysisPanel(dashboard, hasStartedTest)) {
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
      isMobileConnected={isMobileConnected}
      onStartAnalysis={onStartTest}
    />
  );
}

export default function App() {
  const dashboard = useSteplyDashboard();
  const [isQrModalOpen, setIsQrModalOpen] = useState(true);
  const [hasStartedTest, setHasStartedTest] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const isFocusMode = shouldShowAnalysisPanel(dashboard, hasStartedTest);
  const isMobileConnected = Boolean(dashboard.session?.profile || dashboard.remoteCameraFrame?.src);
  const shellClassName = isFocusMode
    ? 'steply-shell steply-shell--focus'
    : `steply-shell steply-shell--main steply-shell--with-sidebar ${isSidebarCollapsed ? 'steply-shell--sidebar-collapsed' : ''}`;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [dashboard.activeStep]);

  useEffect(() => {
    if (isMobileConnected) {
      setIsQrModalOpen(false);
    }
  }, [isMobileConnected]);

  useEffect(() => {
    setHasStartedTest(false);
  }, [dashboard.session?.id]);

  const handleStartTest = () => {
    setHasStartedTest(true);
    dashboard.setActiveStep('analysis');
  };

  return (
    <div className={shellClassName}>
      {!isFocusMode ? (
        <ProfileSidebar
          session={dashboard.session}
          remoteCameraStatus={dashboard.remoteCameraStatus}
          workerStatus={dashboard.poseAnalysis?.workerStatus}
          collapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed((current) => !current)}
        />
      ) : null}

      <main className={isFocusMode ? 'dashboard-main dashboard-main--focus' : 'dashboard-main'}>
        {!isFocusMode ? (
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
        ) : null}

        <div className="screen-stage" key={dashboard.activeStep}>
          {renderPanel(dashboard, { hasStartedTest, onStartTest: handleStartTest })}
        </div>
      </main>

      {!isFocusMode && isQrModalOpen ? (
        <div className="qr-link-modal" role="dialog" aria-modal="true" aria-labelledby="qr-link-modal-title">
          <div className="qr-link-modal__backdrop" />
          <div className="qr-link-modal__panel">
            <div className="qr-link-modal__header">
              <div>
                <div className="eyebrow">Start QR Link</div>
                <h2 id="qr-link-modal-title">Mobile QR Link</h2>
                <p>Scan the QR code with the mobile app to link the profile and camera stream.</p>
              </div>
            </div>

            <SessionRail
              className="session-rail--modal"
              compact
              sessionBundle={dashboard.sessionBundle}
              networkInfo={dashboard.networkInfo}
              onCreateSession={dashboard.handleCreateSession}
              onCopyPayload={dashboard.handleCopyPayload}
              onRefreshSession={dashboard.handleRefreshSession}
              busy={dashboard.busy}
              error={dashboard.error || dashboard.poseAnalysis?.error}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
