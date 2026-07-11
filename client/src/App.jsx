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
import { SteplyButton, SteplyCard } from './components/SteplyPrimitives';
import { centerParticipants } from './data/serviceModels';
import { buildDemoHistoryItems } from './data/demoHistory';
import { SteplyV1TestTypes } from './data/movementTests';
import { FoundationRouteApp } from './routes/RouteScaffold';
import { isSteplyFoundationPath, matchSteplyRoute } from './routes/steplyRoutes';
import { canGenerateExerciseRecommendation } from './pose/assessmentResultMetadata';
import {
  UserScreenIds,
  activeStepFromScreen,
  buildUserSessionFlow,
  canShowExerciseFromResult,
  screenFromActiveStep,
} from './pipeline/ui/sessionFlow.js';
import './styles/app.css';

const LEGACY_SCREEN_ROUTES = {
  setup: '/display/session/camera-setup',
  mission: '/display/session/plan',
  result: '/display/results/summary',
  exercise: '/display/exercises/plan',
  progress: '/display/progress',
  care: '/display/reports',
  participant: '/display/reports?view=professional',
  family: '/display/reports',
  professional: '/display/reports?view=professional',
};

function routeWithParams(path, params) {
  const [pathname, routeSearch = ''] = path.split('?');
  const nextParams = new URLSearchParams(routeSearch);
  if (params.get('demoUi') === '1') nextParams.set('demoUi', '1');
  if (params.get('demoHistory') === '1' && pathname === '/display/progress') {
    nextParams.set('demoHistory', '1');
  }
  const requestedTest = params.get('test');
  if (requestedTest && (pathname.includes('assessment') || pathname.includes('camera-setup'))) {
    nextParams.set('test', requestedTest);
  }
  const search = nextParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}

function normalizeLegacyEntryLocation() {
  if (typeof window === 'undefined') return;

  const { pathname, search } = window.location;
  const normalizedPath = pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  const params = new URLSearchParams(search);
  const legacyScreen = params.get('screen');

  let targetPath = null;
  if (normalizedPath === '/' || normalizedPath === '/index.html') {
    targetPath = LEGACY_SCREEN_ROUTES[legacyScreen] || '/display/connect';
  } else if (normalizedPath === '/display') {
    targetPath = '/display/home';
  } else if (normalizedPath === '/camera') {
    targetPath = '/camera/connect';
  } else if (!isSteplyFoundationPath(normalizedPath)) {
    targetPath = '/display/home';
  }

  if (!targetPath) return;
  window.history.replaceState(window.history.state, '', routeWithParams(targetPath, params));
}

function screenConfigFromUrl() {
  if (typeof window === 'undefined') {
    return {
      screen: '',
      demoMode: false,
      context: 'home',
      activeStep: activeStepFromScreen(UserScreenIds.Start),
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
    activeStep: activeStepFromScreen(UserScreenIds.Start),
    reportMode: 'family',
    participantId: null,
    missionPreview: false,
    selectedTest: SteplyV1TestTypes.includes(requestedTest)
      ? requestedTest
      : null,
  };

  if (screen === 'setup') {
    config.activeStep = activeStepFromScreen(UserScreenIds.CameraSetup);
  } else if (screen === 'mission') {
    config.activeStep = activeStepFromScreen(UserScreenIds.Assessment);
  } else if (screen === 'result') {
    config.activeStep = activeStepFromScreen(UserScreenIds.Result);
  } else if (screen === 'exercise') {
    config.activeStep = activeStepFromScreen(UserScreenIds.Exercise);
  } else if (screen === 'progress') {
    config.activeStep = activeStepFromScreen(UserScreenIds.Progress);
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

function shouldShowExercisePanel(dashboard, finalResult) {
  return screenFromActiveStep(dashboard.activeStep) === UserScreenIds.Exercise
    && canGenerateExerciseRecommendation(finalResult || {})
    && canShowExerciseFromResult(finalResult);
}

function isAssessmentFlowScreen(screen) {
  return [
    UserScreenIds.CameraSetup,
    UserScreenIds.Calibration,
    UserScreenIds.Assessment,
  ].includes(screen);
}

function shouldShowAnalysisPanel(dashboard, hasStartedTest) {
  return hasStartedTest && isAssessmentFlowScreen(screenFromActiveStep(dashboard.activeStep));
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

function SafetyCheckPanel({ onContinue, onExit }) {
  return (
    <div className="panel-grid panel-grid--start safety-check-screen distance-mode distance-mode--analysis">
      <SteplyCard className="home-hero safety-check-card">
        <div className="home-hero__content">
          <div>
            <div className="eyebrow">Safety Check</div>
            <h1>Before you start</h1>
            <p>Use a stable chair or support nearby. Stop right away if you feel pain, chest discomfort, or strong dizziness.</p>
          </div>
          <div className="home-hero__actions">
            <SteplyButton onClick={onContinue}>I Feel Safe to Start</SteplyButton>
            <SteplyButton variant="secondary" onClick={onExit}>Exit</SteplyButton>
          </div>
        </div>
      </SteplyCard>

      <div className="home-pipeline safety-check-list">
        <SteplyCard className="home-pipeline-card">
          <strong>Support nearby</strong>
          <span>Keep a stable chair, counter, or wall within reach.</span>
        </SteplyCard>
        <SteplyCard className="home-pipeline-card">
          <strong>Clear space</strong>
          <span>Move loose rugs, cords, or obstacles away from your feet.</span>
        </SteplyCard>
        <SteplyCard className="home-pipeline-card">
          <strong>Stop anytime</strong>
          <span>The Stop button stays in the same place during the check.</span>
        </SteplyCard>
      </div>
    </div>
  );
}

export default function App() {
  normalizeLegacyEntryLocation();
  const initialConfigRef = useRef(screenConfigFromUrl());
  const initialConfig = initialConfigRef.current;
  const dashboard = useSteplyDashboard({ demoMode: initialConfig.demoMode });
  const foundationRoute = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const matchedRoute = matchSteplyRoute(window.location.pathname);
    if (matchedRoute) return matchedRoute;
    if (!isSteplyFoundationPath(window.location.pathname)) return null;
    const isCameraRoute = window.location.pathname.startsWith('/camera');
    return {
      id: isCameraRoute ? 'camera_not_found' : 'display_not_found',
      namespace: isCameraRoute ? 'camera' : 'display',
      path: window.location.pathname,
      title: 'Screen not found',
      eyebrow: 'Steply',
      instruction: 'This Steply screen is not available yet.',
      description: 'Return to the home screen and choose another step.',
      primaryAction: 'Return home',
      secondaryAction: 'Go back',
      icon: '!',
      status: 'Screen unavailable',
      cards: ['Route checked', 'No clinical logic changed'],
      params: {},
    };
  }, []);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [hasStartedTest, setHasStartedTest] = useState(
    screenFromActiveStep(initialConfig.activeStep) === UserScreenIds.SafetyCheck
      || isAssessmentFlowScreen(screenFromActiveStep(initialConfig.activeStep)),
  );
  const [activeContext, setActiveContext] = useState(initialConfig.context);
  const [reportMode, setReportMode] = useState(initialConfig.reportMode);
  const [participantId, setParticipantId] = useState(initialConfig.participantId);
  const [missionPreviewActive, setMissionPreviewActive] = useState(initialConfig.missionPreview);
  const previousSessionIdRef = useRef(dashboard.session?.id);
  const hasRequestedInitialQrRef = useRef(false);

  const displayPoseAnalysis = dashboard.poseAnalysis;
  const isMobileLinked = Boolean(dashboard.session?.profile);
  const isMobileConnected = Boolean(isMobileLinked || dashboard.remoteCameraFrame?.src);
  const shouldAutoCreateConnectQr = foundationRoute?.id === 'display_connect' && !initialConfig.demoMode && !isMobileLinked;
  const demoHistoryItems = useMemo(() => buildDemoHistoryItems(), []);
  const displayHistoryItems = initialConfig.demoMode && dashboard.historyItems.length === 0
    ? demoHistoryItems
    : dashboard.historyItems;
  const displayHistorySource = initialConfig.demoMode && dashboard.historyItems.length === 0
    ? { type: 'visual_review_fixture', label: 'UI-ready visual review data', persistent: false }
    : dashboard.historySource;
  const displayFinalResult = dashboard.finalResult || dashboard.poseAnalysis?.analysisResult || null;
  const currentScreen = screenFromActiveStep(dashboard.activeStep);
  const sessionFlow = useMemo(() => buildUserSessionFlow({
    currentScreen,
    finalResult: displayFinalResult,
    selectedTest: dashboard.selectedTest,
  }), [currentScreen, dashboard.selectedTest, displayFinalResult]);

  useEffect(() => {
    document.documentElement.lang = 'en-US';
    document.documentElement.setAttribute('data-steply-locale', 'en-US');
  }, []);

  useEffect(() => {
    dashboard.setActiveStep(initialConfig.activeStep);
    // Initial URL-driven visual states are applied once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [dashboard.activeStep, activeContext, reportMode, participantId]);

  useEffect(() => {
    if (!shouldAutoCreateConnectQr) return;
    if (dashboard.sessionBundle || dashboard.busy || hasRequestedInitialQrRef.current) return;
    hasRequestedInitialQrRef.current = true;
    dashboard.handleCreateSession();
  }, [dashboard.busy, dashboard.handleCreateSession, dashboard.sessionBundle, shouldAutoCreateConnectQr]);

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
    dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.SafetyCheck));
  };

  const handleNavigate = (view) => {
    if (view === 'home') {
      setActiveContext('home');
      setMissionPreviewActive(false);
      setHasStartedTest(false);
      dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.Start));
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
      dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.Exercise));
      return;
    }
    if (view === 'progress') {
      setActiveContext('home');
      setMissionPreviewActive(false);
      setHasStartedTest(false);
      dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.Progress));
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
      dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.Start));
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
  }, displayFinalResult);
  const activeView = activeContext === 'care'
    ? 'care'
    : activeContext === 'reports'
      ? 'reports'
      : currentScreen === UserScreenIds.Exercise
        ? 'exercise'
        : isExercisePanelVisible || currentScreen === UserScreenIds.SafetyCheck || isAssessmentFlowScreen(currentScreen)
          ? 'mission'
          : currentScreen === UserScreenIds.Progress || currentScreen === UserScreenIds.Completion
            ? 'progress'
            : 'home';
  const shouldShowJourneyFlow = activeContext !== 'home' || currentScreen !== UserScreenIds.Start;

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

    if (currentScreen === UserScreenIds.SafetyCheck) {
      return (
        <SafetyCheckPanel
          onContinue={() => {
            setHasStartedTest(true);
            dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.CameraSetup));
          }}
          onExit={() => {
            setHasStartedTest(false);
            dashboard.poseAnalysis?.resetAnalysis?.('safety_exit');
            dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.Start));
          }}
        />
      );
    }

    if (currentScreen === UserScreenIds.Progress || currentScreen === UserScreenIds.Completion) {
      return (
        <ProgressPanel
          historyItems={displayHistoryItems}
          historySource={displayHistorySource}
        />
      );
    }

    if (currentScreen === UserScreenIds.Result) {
      return (
        <ResultPanel
          finalResult={displayFinalResult}
          liveResult={dashboard.liveResult}
          onGoExercises={() => {
            dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.Exercise));
          }}
          onDemoFinal={dashboard.handleSaveFinal}
          onTryAgain={() => {
            dashboard.poseAnalysis?.resetAnalysis?.('try_again');
            setHasStartedTest(true);
            dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.SafetyCheck));
          }}
          onCameraSetup={() => {
            dashboard.poseAnalysis?.resetAnalysis?.('camera_setup');
            setHasStartedTest(true);
            dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.CameraSetup));
          }}
          onExitAssessment={() => {
            dashboard.poseAnalysis?.resetAnalysis?.('exit_assessment');
            setHasStartedTest(false);
            setMissionPreviewActive(false);
            dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.Start));
          }}
        />
      );
    }

    if (shouldShowExercisePanel(panelDashboard, displayFinalResult)) {
      return (
        <ExercisePanel
          finalResult={displayFinalResult}
          onViewProgress={() => dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.Completion))}
          onStop={() => dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.Result))}
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
          onStop={() => {
            dashboard.poseAnalysis?.resetAnalysis?.('stop_button');
            setHasStartedTest(false);
            setMissionPreviewActive(false);
            dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.Start));
          }}
          onRetry={() => {
            dashboard.poseAnalysis?.resetAnalysis?.('retry_button');
            setHasStartedTest(true);
            dashboard.setActiveStep(activeStepFromScreen(UserScreenIds.CameraSetup));
          }}
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

  if (foundationRoute) {
    return <FoundationRouteApp route={foundationRoute} dashboard={dashboard} />;
  }

  return <FoundationRouteApp route={matchSteplyRoute('/display/home')} dashboard={dashboard} />;
}
