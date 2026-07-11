import { useEffect, useMemo, useState } from 'react';
import {
  AdherenceChart,
  AppHeader,
  AssessmentCard,
  CameraPreview,
  CameraQualityPanel,
  ConnectionIndicator,
  ConnectionLostDialog,
  CountdownTimer,
  EmergencyStopButton,
  ExerciseCard,
  ExerciseRestTimer,
  ExpertReferralPanel,
  FunctionalAreaCard,
  HoldTimer,
  InstructionPanel,
  InvalidAssessmentPanel,
  MetricCard,
  Navigation,
  PrimaryActionBar,
  RepCounter,
  ResultSummary,
  SafetyChecklist,
  SafetyStopPanel,
  SessionHeader,
  SessionProgress,
  TestResultCard,
  ThresholdLineChart,
  TodaySessionCard,
  TrendSummaryCard,
  VoiceReplayButton,
} from '../components/foundation/SteplyDesignSystem';
import {
  CameraConnectScreen,
  CameraDisconnectedScreen,
  CameraPermissionScreen,
  CameraPreviewScreen,
  CameraStreamingScreen,
  DisplayConnectScreen,
  DisplayHomeScreen,
  DisplayOnboardingScreen,
  DisplayProfileScreen,
  DisplaySessionPlanScreen,
} from './StepTwoScreens';
import {
  DisplayCalibrationScreen,
  DisplayCameraSetupScreen,
  DisplaySafetyScreen,
  DisplayScreeningScreen,
} from './StepThreeScreens';
import {
  DisplayBalanceInstructionScreen,
  DisplayBalanceLiveScreen,
  DisplayBalanceStageResultScreen,
} from './StepFourScreens';
import {
  DisplayChairInstructionScreen,
  DisplayChairLiveScreen,
  DisplayChairResultScreen,
} from './StepFiveScreens';
import {
  DisplayAnalyzingScreen,
  DisplayResultsDetailsScreen,
  DisplayResultsSummaryScreen,
} from './StepSixScreens';
import {
  DisplayExerciseCompleteScreen,
  DisplayExerciseLiveScreen,
  DisplayExercisePlanScreen,
  DisplayExercisePreviewScreen,
  DisplaySessionCompleteScreen,
} from './StepSevenScreens';
import {
  DisplayProgressScreen,
  DisplayReportsScreen,
  DisplaySettingsScreen,
} from './StepEightScreens';
import { DisplayErrorStateScreen } from './StepNineScreens';
import { displayNavigationItems } from './steplyRoutes';

const routeOrder = [
  '/display/connect',
  '/display/profile',
  '/display/onboarding',
  '/display/home',
  '/display/session/plan',
  '/display/session/screening',
  '/display/session/safety',
  '/display/session/camera-setup',
  '/display/session/calibration',
  '/display/assessment/balance/instruction',
  '/display/assessment/balance/live',
  '/display/assessment/balance/stage-result',
  '/display/assessment/chair/instruction',
  '/display/assessment/chair/live',
  '/display/assessment/chair/result',
  '/display/session/analyzing',
  '/display/results/summary',
  '/display/results/details',
  '/display/exercises/plan',
  '/display/exercises/balance-practice/preview',
  '/display/exercises/balance-practice/live',
  '/display/exercises/balance-practice/complete',
  '/display/session/complete',
  '/display/progress',
  '/display/reports',
  '/display/settings',
];

function formatDate(value, style = 'long') {
  const options = style === 'short'
    ? { month: 'short', day: 'numeric' }
    : { month: 'long', day: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat('en-US', options).format(value);
}

function fillPath(path, params = {}) {
  return path.replace(':exerciseId', params.exerciseId || 'balance-practice');
}

function nextPathFor(route) {
  const path = fillPath(route.path, route.params);
  const index = routeOrder.indexOf(path);
  if (index < 0 || index >= routeOrder.length - 1) return '/display/home';
  return routeOrder[index + 1];
}

function previousPathFor(route) {
  const path = fillPath(route.path, route.params);
  const index = routeOrder.indexOf(path);
  if (index <= 0) return '/display/home';
  return routeOrder[index - 1];
}

function goTo(path) {
  if (typeof window !== 'undefined') window.location.assign(path);
}

function connectionState(dashboard) {
  if (dashboard?.remoteCameraFrame?.src) {
    return {
      status: 'connected',
      label: 'Phone camera connected',
      detail: dashboard.remoteCameraStatus || 'Receiving live camera view',
    };
  }
  if (dashboard?.session?.profile) {
    return {
      status: 'connected',
      label: 'Profile linked',
      detail: 'Camera permission may still be needed',
    };
  }
  return {
    status: 'waiting',
    label: 'Phone camera waiting',
    detail: 'Connect the phone before a live assessment',
  };
}

function routeProgress(route) {
  if (route.progress) return route.progress;
  return { current: 1, total: 1 };
}

function qualityItems(route, dashboard) {
  const hasCamera = Boolean(dashboard?.remoteCameraFrame?.src);
  return [
    { label: hasCamera ? 'Camera connected' : 'Camera waiting', status: hasCamera ? 'good' : 'waiting' },
    { label: route.camera ? 'Full body view needed' : 'Camera not required', status: route.camera ? 'waiting' : 'good' },
    { label: 'Clear safety space', status: 'good' },
  ];
}

function safetyItems() {
  return [
    { label: 'Clear the floor around you', checked: true },
    { label: 'Keep a stable chair or wall nearby', checked: true },
    { label: 'Stop if you feel pain, dizzy, or unsafe', checked: true },
  ];
}

function useBackGuard(route) {
  const [warningVisible, setWarningVisible] = useState(false);

  useEffect(() => {
    if (!route?.timed || typeof window === 'undefined') return undefined;

    const state = { steplyActiveTimedAssessment: route.path };
    window.history.pushState(state, '', window.location.href);

    const handlePopState = () => {
      setWarningVisible(true);
      window.history.pushState(state, '', window.location.href);
      window.setTimeout(() => setWarningVisible(false), 3200);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [route]);

  return warningVisible;
}

function RouteCards({ route }) {
  if (!route.cards?.length) return null;
  return (
    <div className="foundation-card-grid foundation-card-grid--compact">
      {route.cards.map((item) => (
        <MetricCard key={item} label={item} value="Ready" detail="This item is part of the screen structure." status="info" />
      ))}
    </div>
  );
}

function DisplayOverview({ route, dashboard }) {
  const today = useMemo(() => formatDate(new Date()), []);
  const shortDate = useMemo(() => formatDate(new Date(), 'short'), []);
  const result = dashboard?.finalResult || {};

  if (route.id === 'display_results_summary') {
    return (
      <div className="foundation-section-grid">
        <ResultSummary
          title={result.fallRiskLevel || 'Summary ready'}
          message={result.seniorMessage || 'Review the details with a caregiver or healthcare professional if needed.'}
          status="warning"
        />
        <div className="foundation-card-grid">
          <FunctionalAreaCard title="Balance" status="Review" detail="Shown from the existing assessment result when available." />
          <FunctionalAreaCard title="Leg strength" status="Review" detail="Shown from the existing assessment result when available." />
        </div>
      </div>
    );
  }

  if (route.id === 'display_results_details') {
    return (
      <div className="foundation-section-grid">
        <div className="foundation-card-grid">
          <TestResultCard title="4-Stage Balance Test" value={result.primaryValue ?? 'Not measured yet'} detail="Value is supplied by the assessment pipeline." />
          <TestResultCard title="30-Second Chair Stand Test" value={result.count ?? 'Not measured yet'} detail="Value is supplied by the assessment pipeline." />
        </div>
        <ThresholdLineChart label="Example threshold display" value={7} threshold={10} max={15} />
        <InvalidAssessmentPanel />
      </div>
    );
  }

  if (route.id === 'display_exercises_plan') {
    return (
      <div className="foundation-card-grid">
        <ExerciseCard title="Sit to stand practice" description="Practice standing up and sitting down with control." minutes={5} />
        <ExerciseCard title="Sideways walking" description="Practice balance near a stable support." minutes={4} />
        <ExerciseCard title="Heel raises" description="Strengthen lower legs while holding support." minutes={3} />
      </div>
    );
  }

  if (route.id === 'display_progress') {
    return (
      <div className="foundation-section-grid">
        <TrendSummaryCard title="Recent progress" trend={`Updated ${shortDate}`} detail="Trends appear here when phone-provided history is available." />
        <AdherenceChart days={[
          { label: 'Mon', value: 40 },
          { label: 'Tue', value: 60 },
          { label: 'Wed', value: 30 },
          { label: 'Thu', value: 70 },
          { label: 'Fri', value: 50 },
        ]} />
      </div>
    );
  }

  if (route.id === 'display_reports') {
    return (
      <div className="foundation-section-grid">
        <ExpertReferralPanel />
        <div className="foundation-card-grid">
          <MetricCard label="Family report" value="Ready" detail="Short, reassuring summary." status="success" />
          <MetricCard label="Professional report" value="Ready" detail="Detailed values and next steps." status="info" />
        </div>
      </div>
    );
  }

  if (route.id === 'display_settings') {
    return (
      <div className="foundation-card-grid">
        <MetricCard label="Text size" value="Large" detail="Comfortable reading for older adults." status="success" />
        <MetricCard label="Contrast" value="Clear" detail="Status uses icons and words, not color alone." status="success" />
        <MetricCard label="Locale" value="en-US" detail="Dates and labels use natural English." status="success" />
      </div>
    );
  }

  return (
    <div className="foundation-section-grid">
      <TodaySessionCard
        title={route.title}
        date={today}
        description={route.description}
        actionLabel={route.primaryAction}
      />
      <RouteCards route={route} />
    </div>
  );
}

function DisplayRouteScreen({ route, dashboard }) {
  const connection = connectionState(dashboard);

  return (
    <div className="foundation-shell foundation-shell--display">
      <AppHeader
        title={route.title}
        eyebrow={route.eyebrow}
        description={route.description}
        connection={<ConnectionIndicator {...connection} />}
      />
      <Navigation items={displayNavigationItems} currentPath={fillPath(route.path, route.params)} />
      <main className="foundation-main">
        <InstructionPanel title={route.instruction} instruction={route.description} icon={route.icon} />
        <DisplayOverview route={route} dashboard={dashboard} />
        <PrimaryActionBar
          primaryLabel={route.primaryAction}
          secondaryLabel={route.secondaryAction}
          onPrimary={() => goTo(nextPathFor(route))}
          onSecondary={() => goTo(previousPathFor(route))}
        />
      </main>
    </div>
  );
}

function SessionRouteScreen({ route, dashboard }) {
  const connection = connectionState(dashboard);
  const progress = routeProgress(route);
  const showBackWarning = useBackGuard(route);
  const isChairLive = route.id === 'display_chair_live';
  const isExerciseLive = route.id === 'display_exercise_live';
  const isBalanceLive = route.id === 'display_balance_live';
  const activeCounter = isChairLive
    ? <RepCounter count={0} />
    : isExerciseLive
      ? <ExerciseRestTimer seconds={30} />
      : isBalanceLive
        ? <HoldTimer seconds={10} />
        : <CountdownTimer seconds={3} />;

  return (
    <div className={`foundation-shell foundation-session ${route.active ? 'foundation-session--active' : ''}`}>
      <SessionHeader
        title={route.title}
        eyebrow={route.eyebrow}
        instruction={route.description}
        progress={<SessionProgress current={progress.current} total={progress.total} />}
        connection={<ConnectionIndicator {...connection} />}
        emergencyAction={<EmergencyStopButton onClick={() => goTo('/display/session/complete')} />}
      />

      <main className="foundation-session-main">
        <section className="foundation-session-main__center">
          <InstructionPanel title={route.instruction} instruction={route.description} icon={route.icon} />
          {route.active ? activeCounter : null}
          {route.id === 'display_session_safety' ? <SafetyChecklist items={safetyItems()} /> : null}
          {route.id === 'display_session_analyzing' ? <CountdownTimer seconds={3} label="Preparing results" /> : null}
          {route.id === 'display_session_complete' ? <SafetyStopPanel message="The session can now return to the home screen." /> : null}
          {!route.active && route.id !== 'display_session_safety' && route.id !== 'display_session_complete' ? <RouteCards route={route} /> : null}
        </section>

        {route.camera || route.active ? (
          <aside className="foundation-session-main__camera">
            <CameraPreview frameSrc={dashboard?.remoteCameraFrame?.src} guide="Keep your full body inside the frame" />
            <CameraQualityPanel items={qualityItems(route, dashboard)} />
          </aside>
        ) : null}
      </main>

      <footer className="foundation-session-actions">
        {route.active ? (
          <>
            <VoiceReplayButton />
            <PrimaryActionBar
              primaryLabel="Pause"
              tertiaryLabel="End Assessment"
              onTertiary={() => goTo('/display/session/complete')}
            />
          </>
        ) : (
          <PrimaryActionBar
            primaryLabel={route.primaryAction}
            secondaryLabel={route.secondaryAction}
            tertiaryLabel="End Assessment"
            onPrimary={() => goTo(nextPathFor(route))}
            onSecondary={() => goTo(previousPathFor(route))}
            onTertiary={() => goTo('/display/session/complete')}
          />
        )}
      </footer>

      {showBackWarning ? (
        <div className="foundation-back-warning" role="status">
          Use Pause, Hear Again, or End Assessment during a timed assessment.
        </div>
      ) : null}
    </div>
  );
}

function CameraRouteScreen({ route, dashboard }) {
  const connection = connectionState(dashboard);

  if (route.id === 'camera_disconnected') {
    return (
      <div className="foundation-camera-shell">
        <ConnectionLostDialog
          onReconnect={() => goTo('/camera/connect')}
          onStop={() => goTo('/camera/stopped')}
        />
      </div>
    );
  }

  return (
    <div className="foundation-camera-shell">
      <header className="foundation-camera-header">
        <div className="foundation-brand-mark" aria-hidden="true">S</div>
        <div>
          <div className="foundation-eyebrow">{route.eyebrow}</div>
          <h1>{route.title}</h1>
        </div>
      </header>

      <main className="foundation-camera-main">
        <ConnectionIndicator {...connection} label={route.status} />
        {route.camera ? (
          <CameraPreview frameSrc={dashboard?.remoteCameraFrame?.src} label="Phone camera preview" guide="Keep the person centered" />
        ) : null}
        <InstructionPanel title={route.instruction} instruction={route.description} icon={route.icon} />
      </main>

      <PrimaryActionBar
        primaryLabel={route.primaryAction}
        secondaryLabel={route.secondaryAction}
        onPrimary={() => goTo(route.id === 'camera_streaming' ? '/camera/stopped' : '/camera/preview')}
        onSecondary={() => goTo('/camera/stopped')}
      />
    </div>
  );
}

export function FoundationRouteApp({ route, dashboard }) {
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = 'en-US';
      document.documentElement.setAttribute('data-steply-locale', 'en-US');
      document.title = route?.title ? `${route.title} | Steply` : 'Steply';
    }
  }, [route?.title]);

  if (route.id === 'display_error_state') {
    return <DisplayErrorStateScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_connect') {
    return <DisplayConnectScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_profile') {
    return <DisplayProfileScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_onboarding') {
    return <DisplayOnboardingScreen />;
  }

  if (route.id === 'display_home') {
    return <DisplayHomeScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_session_plan') {
    return <DisplaySessionPlanScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_session_screening') {
    return <DisplayScreeningScreen />;
  }

  if (route.id === 'display_session_safety') {
    return <DisplaySafetyScreen />;
  }

  if (route.id === 'display_session_camera_setup') {
    return <DisplayCameraSetupScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_session_calibration') {
    return <DisplayCalibrationScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_balance_instruction') {
    return <DisplayBalanceInstructionScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_balance_live') {
    return <DisplayBalanceLiveScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_balance_stage_result') {
    return <DisplayBalanceStageResultScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_chair_instruction') {
    return <DisplayChairInstructionScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_chair_live') {
    return <DisplayChairLiveScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_chair_result') {
    return <DisplayChairResultScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_session_analyzing') {
    return <DisplayAnalyzingScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_results_summary') {
    return <DisplayResultsSummaryScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_results_details') {
    return <DisplayResultsDetailsScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_exercises_plan') {
    return <DisplayExercisePlanScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_exercise_preview') {
    return <DisplayExercisePreviewScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_exercise_live') {
    return <DisplayExerciseLiveScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_exercise_complete') {
    return <DisplayExerciseCompleteScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_session_complete') {
    return <DisplaySessionCompleteScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_progress') {
    return <DisplayProgressScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_reports') {
    return <DisplayReportsScreen dashboard={dashboard} />;
  }

  if (route.id === 'display_settings') {
    return <DisplaySettingsScreen dashboard={dashboard} />;
  }

  if (route.id === 'camera_connect') {
    return <CameraConnectScreen />;
  }

  if (route.id === 'camera_permission') {
    return <CameraPermissionScreen />;
  }

  if (route.id === 'camera_preview') {
    return <CameraPreviewScreen dashboard={dashboard} />;
  }

  if (route.id === 'camera_streaming') {
    return <CameraStreamingScreen />;
  }

  if (route.id === 'camera_disconnected') {
    return <CameraDisconnectedScreen />;
  }

  if (route.namespace === 'camera') {
    return <CameraRouteScreen route={route} dashboard={dashboard} />;
  }

  if (route.session) {
    return <SessionRouteScreen route={route} dashboard={dashboard} />;
  }

  return <DisplayRouteScreen route={route} dashboard={dashboard} />;
}
