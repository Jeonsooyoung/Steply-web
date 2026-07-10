import { useEffect, useMemo, useRef, useState } from 'react';
import { useSteplyDashboard } from './hooks/useSteplyDashboard';
import { SessionRail } from './components/SessionRail';
import { StartPanel } from './components/StartPanel';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ResultPanel } from './components/ResultPanel';
import { ExercisePanel } from './components/ExercisePanel';
import { JourneyFlow } from './components/JourneyFlow';
import { ProgressPanel } from './components/ProgressPanel';
import { ContextNav } from './components/ContextNav';
import { CareDashboard } from './components/CareDashboard';
import { ReportsPanel } from './components/ReportsPanel';
import { buildDemoFinalResult, centerParticipants } from './data/serviceModels';
import { buildDemoHistoryItems } from './data/demoHistory';
import './styles/app.css';

function emergencyExerciseResult(dashboard) {
  const state = dashboard.poseAnalysis?.analysisState || {};
  const testType = dashboard.selectedTest || 'four_stage_balance';
  const primaryValue = state.primaryValue ?? state.repetitionCount ?? 0;
  const primaryLabel = state.primaryLabel || (testType === 'four_stage_balance' ? 'Hold Time' : 'Chair Stands');
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

function screenConfigFromUrl() {
  if (typeof window === 'undefined') {
    return {
      screen: '',
      demoMode: false,
      context: 'home',
      activeStep: 'start',
      reportMode: 'family',
      participantId: null,
      missionPreview: false,
      selectedTest: null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const screen = params.get('screen') || '';
  const demoMode = params.get('demoUi') === '1' || Boolean(screen);
  const requestedTest = params.get('test');

  const config = {
    screen,
    demoMode,
    context: 'home',
    activeStep: 'start',
    reportMode: 'family',
    participantId: null,
    missionPreview: false,
    selectedTest: ['four_stage_balance', 'chair_stand', 'timed_up_and_go'].includes(requestedTest)
      ? requestedTest
      : null,
  };

  if (screen === 'setup') {
    config.activeStep = 'analysis';
  } else if (screen === 'mission') {
    config.activeStep = 'analysis';
    config.missionPreview = true;
  } else if (screen === 'result') {
    config.activeStep = 'result';
  } else if (screen === 'exercise') {
    config.activeStep = 'exercise';
  } else if (screen === 'progress') {
    config.activeStep = 'progress';
  } else if (screen === 'care') {
    config.context = 'care';
  } else if (screen === 'participant') {
    config.context = 'care';
    config.participantId = centerParticipants[0]?.id || null;
  } else if (screen === 'family') {
    config.context = 'reports';
    config.reportMode = 'family';
  } else if (screen === 'professional') {
    config.context = 'reports';
    config.reportMode = 'professional';
  }

  return config;
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
  return hasStartedTest && dashboard.activeStep === 'analysis';
}

function previewStateForTest(selectedTest, elapsedSeconds) {
  if (selectedTest === 'chair_stand') {
    return {
      durationSeconds: 30,
      primaryLabel: 'Chair Stands',
      primaryValue: Math.min(12, Math.max(0, Math.floor((elapsedSeconds - 2) / 2))),
      phase: elapsedSeconds % 4 < 2 ? 'rising' : 'seated',
      postureMessage: 'Stand fully, then sit down with control.',
    };
  }
  if (selectedTest === 'timed_up_and_go') {
    return {
      durationSeconds: 45,
      primaryLabel: 'TUG Time',
      primaryValue: elapsedSeconds,
      phase: elapsedSeconds < 4 ? 'rising' : elapsedSeconds < 22 ? 'walking' : 'seated',
      postureMessage: 'Walk steadily, turn slowly, return, and sit.',
    };
  }
  return {
    durationSeconds: 40,
    primaryLabel: 'Hold Time',
    primaryValue: Math.min(10, elapsedSeconds),
    phase: 'standing',
    postureMessage: 'Hold this position gently.',
  };
}

function usePreviewPoseAnalysis(basePoseAnalysis, missionPreviewActive, selectedTest) {
  const [previewElapsed, setPreviewElapsed] = useState(12);

  useEffect(() => {
    if (!missionPreviewActive) {
      setPreviewElapsed(12);
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setPreviewElapsed((current) => (current >= 27 ? 12 : current + 1));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [missionPreviewActive]);

  return useMemo(() => {
    if (!missionPreviewActive) return basePoseAnalysis;
    const previewState = previewStateForTest(selectedTest, previewElapsed);

    return {
      ...basePoseAnalysis,
      isRunning: true,
      workerStatus: 'analyzing',
      durationSeconds: previewState.durationSeconds,
      analysisState: {
        ...(basePoseAnalysis?.analysisState || {}),
        durationSeconds: previewState.durationSeconds,
        elapsedSeconds: previewElapsed,
        primaryLabel: previewState.primaryLabel,
        primaryValue: previewState.primaryValue,
        confidence: 0.92,
        isFullBodyVisible: true,
        warningMessage: '',
        postureMessage: previewState.postureMessage,
        stabilityScore: 0.78,
        phase: previewState.phase,
      },
    };
  }, [basePoseAnalysis, missionPreviewActive, previewElapsed, selectedTest]);
}

function QrConnectionGate({ dashboard }) {
  const hasQrCode = Boolean(dashboard.sessionBundle?.qrDataUrl);
  const gateStatus = hasQrCode
    ? 'Waiting for mobile app link'
    : dashboard.busy
      ? 'Creating QR code'
      : 'Preparing QR link';

  return (
    <div className="steply-shell steply-shell--main service-shell service-shell--link-gate">
      <main className="dashboard-main service-main">
        <section className="qr-gate" aria-labelledby="qr-gate-title">
          <div className="qr-gate__intro">
            <div className="qr-gate__brand">
              <div className="brand-mark">S</div>
              <div>
                <strong>Steply</strong>
                <span>Mobile Link Required</span>
              </div>
            </div>
            <div className="qr-gate__status" aria-live="polite">
              <span className="status-dot status-dot--waiting" />
              {gateStatus}
            </div>
            <div>
              <div className="eyebrow">QR Connection</div>
              <h1 id="qr-gate-title">Connect the mobile app first.</h1>
              <p>
                Scan this QR code in Steply Mobile. The home screen opens automatically after the mobile profile is linked.
              </p>
            </div>
            <ol className="qr-gate__steps">
              <li>Open Steply Mobile.</li>
              <li>Scan the QR code on this screen.</li>
              <li>Choose a profile to link with this web session.</li>
            </ol>
          </div>

          <div className="qr-gate__panel">
            <SessionRail
              className="session-rail--gate"
              compact
              sessionBundle={dashboard.sessionBundle}
              networkInfo={dashboard.networkInfo}
              onCreateSession={dashboard.handleCreateSession}
              onCopyPayload={dashboard.handleCopyPayload}
              onRefreshSession={dashboard.handleRefreshSession}
              busy={dashboard.busy}
              error={dashboard.error || dashboard.poseAnalysis?.error}
            />
            <div className="qr-gate__network">
              <strong>Same network required</strong>
              <span>{dashboard.networkInfo?.dashboardUrl || 'Connect the PC and phone to the same Wi-Fi network.'}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const dashboard = useSteplyDashboard();
  const initialConfigRef = useRef(screenConfigFromUrl());
  const initialConfig = initialConfigRef.current;
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [hasStartedTest, setHasStartedTest] = useState(
    initialConfig.activeStep === 'analysis' || initialConfig.missionPreview,
  );
  const [activeContext, setActiveContext] = useState(initialConfig.context);
  const [reportMode, setReportMode] = useState(initialConfig.reportMode);
  const [participantId, setParticipantId] = useState(initialConfig.participantId);
  const [missionPreviewActive, setMissionPreviewActive] = useState(initialConfig.missionPreview);
  const previousSessionIdRef = useRef(dashboard.session?.id);
  const hasRequestedInitialQrRef = useRef(false);

  const displayPoseAnalysis = usePreviewPoseAnalysis(dashboard.poseAnalysis, missionPreviewActive, dashboard.selectedTest);
  const isMobileLinked = Boolean(dashboard.session?.profile);
  const isMobileConnected = Boolean(isMobileLinked || dashboard.remoteCameraFrame?.src);
  const shouldRequireQrLink = !initialConfig.demoMode && !isMobileLinked;
  const demoHistoryItems = useMemo(() => buildDemoHistoryItems(), []);
  const displayHistoryItems = initialConfig.demoMode && dashboard.historyItems.length === 0
    ? demoHistoryItems
    : dashboard.historyItems;
  const displayHistorySource = initialConfig.demoMode && dashboard.historyItems.length === 0
    ? { type: 'visual_review_fixture', label: 'UI-ready visual review data', persistent: false }
    : dashboard.historySource;
  const demoFinalResult = useMemo(
    () => buildDemoFinalResult(initialConfig.selectedTest || dashboard.selectedTest || 'four_stage_balance'),
    [dashboard.selectedTest, initialConfig.selectedTest],
  );
  const displayFinalResult = dashboard.finalResult || dashboard.poseAnalysis?.analysisResult || (
    initialConfig.demoMode ? demoFinalResult : null
  );

  useEffect(() => {
    dashboard.setActiveStep(initialConfig.activeStep);
    // Initial URL-driven visual states are applied once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [dashboard.activeStep, activeContext, reportMode, participantId]);

  useEffect(() => {
    if (!shouldRequireQrLink) return;
    if (dashboard.sessionBundle || dashboard.busy || hasRequestedInitialQrRef.current) return;
    hasRequestedInitialQrRef.current = true;
    dashboard.handleCreateSession();
  }, [dashboard.busy, dashboard.handleCreateSession, dashboard.sessionBundle, shouldRequireQrLink]);

  useEffect(() => {
    if (isMobileLinked) hasRequestedInitialQrRef.current = false;
  }, [isMobileLinked]);

  useEffect(() => {
    if (isMobileConnected) setIsQrModalOpen(false);
  }, [isMobileConnected]);

  useEffect(() => {
    if (previousSessionIdRef.current === dashboard.session?.id) return;
    previousSessionIdRef.current = dashboard.session?.id;
    setHasStartedTest(false);
    setMissionPreviewActive(false);
  }, [dashboard.session?.id]);

  const handleStartTest = () => {
    setActiveContext('home');
    setHasStartedTest(true);
    setMissionPreviewActive(false);
    dashboard.setActiveStep('analysis');
  };

  const handleNavigate = (view) => {
    if (view === 'home') {
      setActiveContext('home');
      setMissionPreviewActive(false);
      setHasStartedTest(false);
      dashboard.setActiveStep('start');
      return;
    }
    if (view === 'mission') {
      handleStartTest();
      return;
    }
    if (view === 'exercise') {
      setActiveContext('home');
      setMissionPreviewActive(false);
      setHasStartedTest(true);
      dashboard.setActiveStep('exercise');
      return;
    }
    if (view === 'progress') {
      setActiveContext('home');
      setMissionPreviewActive(false);
      setHasStartedTest(false);
      dashboard.setActiveStep('progress');
      return;
    }
    if (view === 'care') {
      setActiveContext('care');
      setParticipantId(null);
      return;
    }
    if (view === 'reports') {
      setActiveContext('reports');
      setReportMode('family');
    }
  };

  const handleContextChange = (context) => {
    setActiveContext(context);
    if (context === 'home') {
      dashboard.setActiveStep('start');
      setParticipantId(null);
      setMissionPreviewActive(false);
      setHasStartedTest(false);
    }
    if (context === 'care') {
      setParticipantId(null);
    }
    if (context === 'reports') {
      setReportMode('family');
    }
  };

  const isExercisePanelVisible = activeContext === 'home' && shouldShowExercisePanel({
    ...dashboard,
    poseAnalysis: displayPoseAnalysis,
  });
  const activeView = activeContext === 'care'
    ? 'care'
    : activeContext === 'reports'
      ? 'reports'
      : dashboard.activeStep === 'exercise'
        ? 'exercise'
        : isExercisePanelVisible || dashboard.activeStep === 'analysis'
          ? 'mission'
          : dashboard.activeStep === 'progress'
            ? 'progress'
            : 'home';
  const shouldShowJourneyFlow = activeContext !== 'home';

  const pageHeader = activeContext === 'home'
    ? {
      eyebrow: 'Steply Home',
      title: 'Today’s movement mission',
      description: 'Start with one large button. Steply will guide the check, exercise, and progress review step by step.',
    }
    : activeContext === 'care'
      ? {
        eyebrow: 'Steply Care',
        title: 'Senior center dashboard',
        description: 'Screen participants, manage today’s queue, and decide who needs follow-up.',
      }
      : {
        eyebrow: 'Steply Reports',
        title: 'Weekly movement reports',
        description: 'Review changes over time for family check-ins and rehabilitation guidance.',
      };

  const renderHomePanel = () => {
    const panelDashboard = {
      ...dashboard,
      poseAnalysis: displayPoseAnalysis,
    };

    if (dashboard.activeStep === 'progress') {
      return (
        <ProgressPanel
          historyItems={displayHistoryItems}
          historySource={displayHistorySource}
        />
      );
    }

    if (dashboard.activeStep === 'result') {
      return (
        <ResultPanel
          finalResult={displayFinalResult}
          liveResult={dashboard.liveResult}
          onGoExercises={() => {
            dashboard.setActiveStep('exercise');
          }}
          onDemoFinal={dashboard.handleSaveFinal}
        />
      );
    }

    if (shouldShowExercisePanel(panelDashboard)) {
      return (
        <ExercisePanel
          finalResult={displayFinalResult || emergencyExerciseResult(panelDashboard)}
          onViewProgress={() => dashboard.setActiveStep('progress')}
        />
      );
    }

    if (shouldShowAnalysisPanel(panelDashboard, hasStartedTest)) {
      return (
        <AnalysisPanel
          selectedTest={dashboard.selectedTest}
          remoteCameraFrame={dashboard.remoteCameraFrame}
          remoteCameraStatus={dashboard.remoteCameraStatus}
          onSelectTest={dashboard.handleSelectTest}
          poseAnalysis={displayPoseAnalysis}
          missionPreviewActive={missionPreviewActive}
          onPreviewMissionStart={initialConfig.demoMode ? () => setMissionPreviewActive(true) : null}
          onPreviewResult={initialConfig.demoMode ? () => {
            setMissionPreviewActive(false);
            dashboard.setActiveStep('result');
          } : null}
        />
      );
    }

    return (
      <StartPanel
        session={dashboard.session}
        isMobileConnected={isMobileConnected}
        onStartAnalysis={handleStartTest}
      />
    );
  };

  const renderActiveContext = () => {
    if (activeContext === 'care') {
      return <CareDashboard initialParticipantId={participantId} />;
    }
    if (activeContext === 'reports') {
      return <ReportsPanel initialMode={reportMode} />;
    }
    return renderHomePanel();
  };

  if (shouldRequireQrLink) {
    return <QrConnectionGate dashboard={dashboard} />;
  }

  return (
    <div className={`steply-shell steply-shell--main service-shell service-shell--${activeContext} service-shell--view-${activeView} ${isExercisePanelVisible ? 'service-shell--panel-exercise' : ''}`}>
      <main className="dashboard-main service-main">
        <header className="top-bar service-top-bar">
          <div>
            <div className="eyebrow">{pageHeader.eyebrow}</div>
            <h1>{pageHeader.title}</h1>
            <p>{pageHeader.description}</p>
          </div>
          <div className="top-bar__status" aria-label="service status">
            <span className={isMobileConnected ? 'status-dot' : 'status-dot status-dot--waiting'} />
            {isMobileConnected ? 'Phone camera linked' : 'Ready for phone camera'}
          </div>
        </header>

        {activeContext !== 'home' ? (
          <ContextNav
            activeContext={activeContext}
            activeView={activeView}
            onContextChange={handleContextChange}
            onNavigate={handleNavigate}
            onOpenCameraLink={() => setIsQrModalOpen(true)}
            isMobileConnected={isMobileConnected}
          />
        ) : null}

        {shouldShowJourneyFlow ? (
          <JourneyFlow activeStep={dashboard.activeStep} compact={activeContext === 'home'} />
        ) : null}

        <div className="screen-stage" key={`${activeContext}-${dashboard.activeStep}-${reportMode}-${participantId || 'dashboard'}`}>
          {renderActiveContext()}
        </div>
      </main>

      {isQrModalOpen ? (
        <div className="qr-link-modal" role="dialog" aria-modal="true" aria-labelledby="qr-link-modal-title">
          <button
            type="button"
            className="qr-link-modal__backdrop"
            aria-label="Close phone camera link"
            onClick={() => setIsQrModalOpen(false)}
          />
          <div className="qr-link-modal__panel">
            <div className="qr-link-modal__header">
              <div>
                <div className="eyebrow">Phone Camera</div>
                <h2 id="qr-link-modal-title">Connect the phone camera</h2>
                <p>Scan the QR code with the mobile app to link the profile and stream the camera to this screen.</p>
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
