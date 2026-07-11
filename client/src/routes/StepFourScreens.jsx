import { useEffect, useMemo, useState } from 'react';
import {
  AppHeader,
  CameraPreview,
  ConnectionIndicator,
  EmergencyStopButton,
  PrimaryActionBar,
  SessionProgress,
} from '../components/foundation/SteplyDesignSystem';

function queryParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function queryValue(name, fallback = '') {
  return queryParams().get(name) || fallback;
}

function goTo(path) {
  if (typeof window !== 'undefined') window.location.assign(path);
}

function routeWithParams(path, updates = {}) {
  const params = queryParams();
  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  });
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function useTimedBackGuard(active = true) {
  const [warningVisible, setWarningVisible] = useState(false);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return undefined;
    const state = { steplyActiveTimedAssessment: window.location.pathname };
    window.history.pushState(state, '', window.location.href);

    const handlePopState = () => {
      setWarningVisible(true);
      window.history.pushState(state, '', window.location.href);
      window.setTimeout(() => setWarningVisible(false), 3200);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [active]);

  return warningVisible;
}

function StepIcon({ children = 'i', tone = 'info' }) {
  return <span className={`step-four-icon step-four-icon--${tone}`} aria-hidden="true">{children}</span>;
}

function VoiceButton({ label = 'Hear Again', script, onReplay }) {
  return (
    <button
      type="button"
      className="ds-button ds-button--secondary step-four-voice-button"
      data-voice-script={script}
      aria-label={`${label}. ${script}`}
      onClick={onReplay}
    >
      {label}
    </button>
  );
}

function StatusRow({ label, status = 'checking', detail }) {
  const tone = status === 'ready' ? 'success' : status === 'adjust' ? 'warning' : status === 'lost' ? 'danger' : 'info';
  const value = status === 'ready' ? 'Ready' : status === 'adjust' ? 'Adjust Needed' : status === 'lost' ? 'Paused' : 'Checking';
  return (
    <div className={`step-four-status-row step-four-status-row--${tone}`}>
      <StepIcon tone={tone}>{tone === 'success' ? 'OK' : tone === 'danger' ? '!' : 'i'}</StepIcon>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function SessionShell({
  eyebrow,
  title,
  description,
  connection,
  progress,
  children,
  className = '',
}) {
  return (
    <div className={`foundation-shell step-four-shell ${className}`}>
      <AppHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        connection={connection}
        actions={<EmergencyStopButton label="Stop Session" onClick={() => goTo('/display/session/complete')} />}
      />
      {progress}
      {children}
    </div>
  );
}

const balanceStages = [
  {
    id: 'side_by_side',
    order: 1,
    name: 'Feet Side by Side',
    shortName: 'Side by side',
    setup: 'Stand with your feet side by side.',
    voiceSetup: 'Stand with your feet side by side. Keep a stable support within reach.',
  },
  {
    id: 'semi_tandem',
    order: 2,
    name: 'Semi-Tandem Stand',
    shortName: 'Semi-tandem',
    setup: 'Place the instep of one foot beside the big toe of your other foot.',
    voiceSetup: 'Place one foot halfway in front of the other. Keep a stable support within reach.',
  },
  {
    id: 'tandem',
    order: 3,
    name: 'Tandem Stand',
    shortName: 'Tandem',
    setup: 'Place your heel directly in front of the toes of your other foot.',
    voiceSetup: 'Place your heel directly in front of the toes of your other foot.',
  },
  {
    id: 'one_leg',
    order: 4,
    name: 'One-Leg Stand',
    shortName: 'One leg',
    setup: 'Stand on one foot while keeping support within reach.',
    voiceSetup: 'Stand on one foot. Keep support within reach, but do not hold it during the timed hold.',
  },
];

const stageById = new Map(balanceStages.map((stage) => [stage.id, stage]));

function balanceProtocolFromDashboard(dashboard) {
  const state = dashboard?.poseAnalysis?.analysisState;
  const result = dashboard?.finalResult || {};
  return state?.balanceProtocol
    || state?.balanceResult?.officialProtocol
    || result?.balanceResult?.officialProtocol
    || result?.officialProtocol
    || null;
}

function boundedStageNumber(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(4, Math.max(1, Math.round(numeric)));
}

function stageFromOrder(order) {
  return balanceStages[boundedStageNumber(order) - 1] || balanceStages[0];
}

function activeStageForDashboard(dashboard) {
  const requestedId = queryValue('stageId', '');
  if (stageById.has(requestedId)) return stageById.get(requestedId);

  const requestedStage = queryValue('stage', '');
  if (requestedStage) return stageFromOrder(requestedStage);

  const protocol = balanceProtocolFromDashboard(dashboard);
  if (stageById.has(protocol?.currentStageId)) return stageById.get(protocol.currentStageId);
  if (protocol?.currentStageOrder) return stageFromOrder(protocol.currentStageOrder);
  return balanceStages[0];
}

function currentProtocolStage(protocol, stage) {
  if (!protocol?.stages?.length) return null;
  return protocol.stages.find((item) => item.id === stage.id)
    || protocol.stages.find((item) => item.id === protocol.currentStageId)
    || null;
}

function formatSeconds(value, digits = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0.0';
  return numeric.toFixed(digits);
}

function cameraCorrectionMessage(quality) {
  if (quality === 'feet') return 'Both feet need to remain visible.';
  if (quality === 'area') return 'Step back into the guide area.';
  if (quality === 'face' || quality === 'angle') return 'Adjust the phone to match the guide.';
  if (quality === 'dark' || quality === 'lighting') return 'Move to a brighter area.';
  if (quality === 'person') return 'Only one person should remain in the assessment area.';
  if (quality === 'body') return 'Step back until your full body is visible.';
  return 'Both feet need to remain visible.';
}

function liveStateForDashboard(dashboard, stage) {
  const protocol = balanceProtocolFromDashboard(dashboard);
  const protocolStage = currentProtocolStage(protocol, stage);
  const requestedState = queryValue('state', '');
  const requestedQuality = queryValue('quality', '');
  const connectionLost = queryValue('connection', '') === 'lost' || requestedState === 'lost';

  if (connectionLost) {
    return {
      key: 'lost',
      timerMode: 'paused',
      timerValue: formatSeconds(queryValue('time', protocolStage?.holdSeconds || 0)),
      timerUnit: 'seconds held',
      instruction: 'The phone connection was lost. The timer is paused.',
      detection: 'Connection paused',
      banner: 'Phone Connection Lost. The assessment has been paused.',
      bannerTone: 'danger',
      voice: 'Phone Connection Lost. The assessment has been paused.',
      isPaused: true,
    };
  }

  if (requestedState) {
    const holdTime = queryValue('time', protocolStage?.holdSeconds || (requestedState === 'success' ? 10 : 6.4));
    if (requestedState === 'detected') {
      return {
        key: 'detected',
        timerMode: 'countdown',
        timerValue: '10',
        timerUnit: 'seconds left',
        instruction: 'Good. Hold this position.',
        detection: 'Position detected',
        banner: 'Good. Hold this position.',
        bannerTone: 'success',
        voice: 'Good. Hold this position. The timer is starting.',
      };
    }
    if (requestedState === 'holding') {
      const remaining = queryValue('remaining', queryValue('time', protocolStage?.remainingSeconds || 7));
      const voice = Number(remaining) <= 3
        ? 'Three seconds left.'
        : 'Keep looking forward.';
      return {
        key: 'holding',
        timerMode: 'countdown',
        timerValue: formatSeconds(remaining, Number(remaining) % 1 === 0 ? 0 : 1),
        timerUnit: 'seconds left',
        instruction: 'Hold steady and look forward.',
        detection: 'Holding',
        banner: Number(remaining) <= 3 ? 'Three seconds left.' : 'Keep looking forward.',
        bannerTone: 'info',
        voice,
      };
    }
    if (requestedState === 'camera') {
      const message = cameraCorrectionMessage(requestedQuality);
      return {
        key: 'camera',
        timerMode: 'paused',
        timerValue: formatSeconds(queryValue('time', protocolStage?.holdSeconds || 4.8)),
        timerUnit: 'seconds held',
        instruction: message,
        detection: 'Camera check paused',
        banner: message,
        bannerTone: 'warning',
        voice: `${message} The timer is paused.`,
        isPaused: true,
      };
    }
    if (requestedState === 'feet') {
      return {
        key: 'feet',
        timerMode: 'stopped',
        timerValue: formatSeconds(holdTime),
        timerUnit: 'seconds held',
        instruction: `The position ended at ${formatSeconds(holdTime)} seconds.`,
        detection: 'Position ended',
        banner: `The position ended at ${formatSeconds(holdTime)} seconds.`,
        bannerTone: 'warning',
        voice: `The position ended at ${formatSeconds(holdTime)} seconds. We saved your hold time.`,
      };
    }
    if (requestedState === 'support') {
      return {
        key: 'support',
        timerMode: 'stopped',
        timerValue: formatSeconds(holdTime),
        timerUnit: 'seconds held',
        instruction: 'Support was used, so the timer has stopped.',
        detection: 'Timer stopped',
        banner: 'Support was used, so the timer has stopped.',
        bannerTone: 'warning',
        voice: 'Support was used, so the timer has stopped. We saved your hold time.',
      };
    }
    if (requestedState === 'success') {
      return {
        key: 'success',
        timerMode: 'complete',
        timerValue: '10',
        timerUnit: 'seconds held',
        instruction: 'You held the position for 10 seconds.',
        detection: 'Stage complete',
        banner: 'You held the position for 10 seconds.',
        bannerTone: 'success',
        voice: 'You held the position for 10 seconds. This stage is complete.',
      };
    }
    if (requestedState === 'paused') {
      return {
        key: 'paused',
        timerMode: 'paused',
        timerValue: formatSeconds(queryValue('time', protocolStage?.holdSeconds || 3.2)),
        timerUnit: 'seconds held',
        instruction: 'The Balance Test is paused.',
        detection: 'Paused',
        banner: 'The Balance Test is paused.',
        bannerTone: 'info',
        voice: 'The Balance Test is paused. Resume when you are ready.',
        isPaused: true,
      };
    }
  }

  if (protocol?.status === 'completed') {
    return {
      key: 'success',
      timerMode: 'complete',
      timerValue: '10',
      timerUnit: 'seconds held',
      instruction: 'You held the position for 10 seconds.',
      detection: 'Stage complete',
      banner: 'You held the position for 10 seconds.',
      bannerTone: 'success',
      voice: 'You held the position for 10 seconds. This stage is complete.',
    };
  }

  if (protocol?.status === 'stopped') {
    const holdTime = protocolStage?.holdSeconds || 0;
    if (protocol.failureReason === 'support_used') {
      return {
        key: 'support',
        timerMode: 'stopped',
        timerValue: formatSeconds(holdTime),
        timerUnit: 'seconds held',
        instruction: 'Support was used, so the timer has stopped.',
        detection: 'Timer stopped',
        banner: 'Support was used, so the timer has stopped.',
        bannerTone: 'warning',
        voice: 'Support was used, so the timer has stopped. We saved your hold time.',
      };
    }
    if (protocol.failureReason === 'tracking_lost') {
      const message = 'Both feet need to remain visible.';
      return {
        key: 'camera',
        timerMode: 'paused',
        timerValue: formatSeconds(holdTime),
        timerUnit: 'seconds held',
        instruction: message,
        detection: 'Camera check paused',
        banner: message,
        bannerTone: 'warning',
        voice: `${message} The timer is paused.`,
        isPaused: true,
      };
    }
    return {
      key: 'feet',
      timerMode: 'stopped',
      timerValue: formatSeconds(holdTime),
      timerUnit: 'seconds held',
      instruction: `The position ended at ${formatSeconds(holdTime)} seconds.`,
      detection: 'Position ended',
      banner: `The position ended at ${formatSeconds(holdTime)} seconds.`,
      bannerTone: 'warning',
      voice: `The position ended at ${formatSeconds(holdTime)} seconds. We saved your hold time.`,
    };
  }

  if (protocolStage?.status === 'holding') {
    const remaining = protocolStage.remainingSeconds ?? Math.max(0, 10 - (protocolStage.holdSeconds || 0));
    return {
      key: Number(protocolStage.holdSeconds) > 0 ? 'holding' : 'detected',
      timerMode: 'countdown',
      timerValue: formatSeconds(remaining, Number(remaining) % 1 === 0 ? 0 : 1),
      timerUnit: 'seconds left',
      instruction: Number(protocolStage.holdSeconds) > 0 ? 'Hold steady and look forward.' : 'Good. Hold this position.',
      detection: Number(protocolStage.holdSeconds) > 0 ? 'Holding' : 'Position detected',
      banner: Number(remaining) <= 3 ? 'Three seconds left.' : 'Good. Hold this position.',
      bannerTone: Number(protocolStage.holdSeconds) > 0 ? 'info' : 'success',
      voice: Number(remaining) <= 3 ? 'Three seconds left.' : 'Keep looking forward.',
    };
  }

  return {
    key: 'positioning',
    timerMode: 'waiting',
    timerValue: '10',
    timerUnit: 'seconds to hold',
    instruction: stage.setup,
    detection: 'Position not ready',
    banner: stage.setup,
    bannerTone: 'info',
    voice: stage.voiceSetup,
  };
}

function liveQualityRows(liveState, dashboard) {
  const connected = Boolean(dashboard?.remoteCameraFrame?.src || dashboard?.session?.profile);
  const urlState = queryValue('state', '');
  const quality = queryValue('quality', '');

  if (liveState.key === 'lost') {
    return [
      { label: 'Phone Connected', status: 'lost', detail: 'Reconnect before continuing.' },
      { label: 'Full Body Visible', status: 'checking' },
      { label: 'Feet Visible', status: 'checking' },
      { label: 'Lighting', status: 'checking' },
    ];
  }

  if (urlState === 'camera') {
    return [
      { label: 'Phone Connected', status: 'ready' },
      { label: 'Full Body Visible', status: quality === 'body' || quality === 'area' ? 'adjust' : 'ready' },
      { label: 'Feet Visible', status: quality === 'feet' ? 'adjust' : 'ready' },
      { label: 'Camera Angle', status: quality === 'face' || quality === 'angle' ? 'adjust' : 'ready' },
      { label: 'Lighting', status: quality === 'dark' || quality === 'lighting' ? 'adjust' : 'ready' },
    ];
  }

  if (queryValue('quality', '') === 'checking') {
    return [
      { label: 'Phone Connected', status: connected ? 'ready' : 'checking' },
      { label: 'Full Body Visible', status: 'checking' },
      { label: 'Feet Visible', status: 'checking' },
      { label: 'Lighting', status: 'checking' },
    ];
  }

  return [
    { label: 'Phone Connected', status: connected ? 'ready' : 'checking' },
    { label: 'Full Body Visible', status: 'ready' },
    { label: 'Feet Visible', status: 'ready' },
    { label: 'Lighting', status: 'ready' },
  ];
}

function BalanceFootGuide({ stage, large = false }) {
  return (
    <div
      className={`step-four-foot-guide step-four-foot-guide--${stage.id} ${large ? 'step-four-foot-guide--large' : ''}`}
      aria-label={`${stage.name} foot placement guide`}
      role="img"
    >
      <span className="step-four-foot-guide__support">Stable support</span>
      <span className="step-four-foot-guide__foot step-four-foot-guide__foot--left" />
      <span className="step-four-foot-guide__foot step-four-foot-guide__foot--right" />
      <span className="step-four-foot-guide__centerline" />
    </div>
  );
}

function BalanceDemo({ stage }) {
  return (
    <section className="step-four-demo" aria-labelledby="balance-demo-title">
      <div className="step-four-demo__visual">
        <span className="step-four-demo__support" aria-hidden="true" />
        <span className="step-four-demo__person" aria-hidden="true" />
        <BalanceFootGuide stage={stage} large />
      </div>
      <div>
        <h2 id="balance-demo-title">{stage.name}</h2>
        <p>Stable support surface nearby</p>
        <strong>Safety reminder</strong>
        <span>Stop if you feel dizzy, have chest pain, or feel unsafe.</span>
      </div>
    </section>
  );
}

function PositionCard({ stage, active }) {
  return (
    <article
      className={active ? 'step-four-position-card step-four-position-card--active' : 'step-four-position-card'}
      aria-label={`Stage ${stage.order} of 4, ${stage.name}${active ? ', upcoming position' : ''}`}
    >
      <span>Stage {stage.order}</span>
      <h2>{stage.name}</h2>
      <BalanceFootGuide stage={stage} />
      {active ? <strong>Upcoming position</strong> : <small>Later in the test</small>}
    </article>
  );
}

export function DisplayBalanceInstructionScreen({ dashboard }) {
  const [lastReplay, setLastReplay] = useState('');
  const activeStage = activeStageForDashboard(dashboard);
  const voiceScript = `${activeStage.voiceSetup} The timer begins only when the correct position is detected.`;

  return (
    <SessionShell
      eyebrow="CDC STEADI"
      title="4-Stage Balance Test"
      description="You will try four standing positions. Hold each position for up to 10 seconds."
      connection={<ConnectionIndicator status="connected" label="Balance Test ready" detail={`Next position: ${activeStage.name}`} />}
      progress={<SessionProgress current={6} total={9} label="Session progress" />}
      className="step-four-instruction-shell"
    >
      <main className="step-four-instruction">
        <section className="step-four-intro">
          <BalanceDemo stage={activeStage} />
          <div className="step-four-instruction-list" data-voice-script={voiceScript}>
            <div>
              <StepIcon>i</StepIcon>
              <span>Keep a stable table or countertop within reach.</span>
            </div>
            <div>
              <StepIcon>i</StepIcon>
              <span>The timer begins only when the correct position is detected.</span>
            </div>
            <div>
              <StepIcon>i</StepIcon>
              <span>The timer stops if you move your feet or use support.</span>
            </div>
          </div>
        </section>

        <section className="step-four-position-grid" aria-label="Balance Test positions">
          {balanceStages.map((stage) => (
            <PositionCard key={stage.id} stage={stage} active={stage.id === activeStage.id} />
          ))}
        </section>

        <div className="step-four-actions">
          <VoiceButton
            label="Watch Again"
            script={voiceScript}
            onReplay={() => setLastReplay(voiceScript)}
          />
          <PrimaryActionBar
            primaryLabel="Start Balance Test"
            onPrimary={() => goTo(`/display/assessment/balance/live?stage=${activeStage.order}&state=positioning`)}
          />
        </div>
        {lastReplay ? <span className="step-four-sr-status" role="status">{lastReplay}</span> : null}
      </main>
    </SessionShell>
  );
}

function LivePreview({ dashboard, stage, liveState, qualityRows }) {
  return (
    <section className="step-four-live-preview">
      <CameraPreview frameSrc={dashboard?.remoteCameraFrame?.src} label="Balance Test preview" guide="Stay inside the guide">
        <div className="step-four-balance-overlay" aria-hidden="true">
          <span className="step-four-balance-overlay__body">Position guide</span>
          <span className="step-four-balance-overlay__foot step-four-balance-overlay__foot--left">Foot</span>
          <span className="step-four-balance-overlay__foot step-four-balance-overlay__foot--right">Foot</span>
          <span className="step-four-balance-overlay__safe">Safe movement area</span>
        </div>
      </CameraPreview>
      <div className="step-four-live-preview__below">
        <BalanceFootGuide stage={stage} />
        <div className="step-four-camera-status">
          <h2>Camera quality</h2>
          <div className="step-four-quality-list">
            {qualityRows.map((row) => <StatusRow key={row.label} {...row} />)}
          </div>
          <div className={`step-four-state-banner step-four-state-banner--${liveState.bannerTone}`} role="status">
            <StepIcon tone={liveState.bannerTone === 'danger' ? 'danger' : liveState.bannerTone === 'warning' ? 'warning' : liveState.bannerTone === 'success' ? 'success' : 'info'}>
              {liveState.bannerTone === 'success' ? 'OK' : liveState.bannerTone === 'danger' ? '!' : 'i'}
            </StepIcon>
            <span>{liveState.banner}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function LiveTimer({ liveState }) {
  return (
    <div className={`step-four-timer step-four-timer--${liveState.timerMode}`} aria-label={`${liveState.timerValue} ${liveState.timerUnit}`}>
      <strong>{liveState.timerValue}</strong>
      <span>{liveState.timerUnit}</span>
    </div>
  );
}

export function DisplayBalanceLiveScreen({ dashboard }) {
  const [lastReplay, setLastReplay] = useState('');
  const showBackWarning = useTimedBackGuard(true);
  const stage = activeStageForDashboard(dashboard);
  const liveState = useMemo(() => liveStateForDashboard(dashboard, stage), [dashboard, stage]);
  const qualityRows = useMemo(() => liveQualityRows(liveState, dashboard), [dashboard, liveState]);
  const connectionStatus = liveState.key === 'lost' ? 'lost' : 'connected';
  const pausePath = liveState.isPaused
    ? routeWithParams('/display/assessment/balance/live', { stage: stage.order, state: 'holding', remaining: queryValue('remaining', '7') })
    : routeWithParams('/display/assessment/balance/live', { stage: stage.order, state: 'paused' });

  return (
    <SessionShell
      eyebrow="4-Stage Balance Test"
      title={`Stage ${stage.order} of 4`}
      description={stage.name}
      connection={<ConnectionIndicator status={connectionStatus} label={liveState.key === 'lost' ? 'Phone connection lost' : 'Phone Connected'} detail={liveState.detection} />}
      progress={<SessionProgress current={7} total={9} label="Session progress" />}
      className="step-four-live-shell"
    >
      <main className="step-four-live" data-assessment-state={liveState.key}>
        <LivePreview dashboard={dashboard} stage={stage} liveState={liveState} qualityRows={qualityRows} />

        <aside className="step-four-live-panel" data-voice-script={liveState.voice}>
          <div className="step-four-stage-kicker">
            <span>Stage {stage.order} of 4</span>
            <strong>{stage.name}</strong>
          </div>
          <LiveTimer liveState={liveState} />
          <div className="step-four-live-actions">
            <PrimaryActionBar
              primaryLabel={liveState.isPaused ? 'Resume' : 'Pause'}
              secondaryLabel="Hear Again"
              onPrimary={() => goTo(pausePath)}
              onSecondary={() => {
                setLastReplay(liveState.voice);
              }}
            />
          </div>
          <div className="step-four-current-instruction">
            <StepIcon tone={liveState.bannerTone === 'success' ? 'success' : liveState.bannerTone === 'warning' ? 'warning' : liveState.bannerTone === 'danger' ? 'danger' : 'info'}>
              {liveState.bannerTone === 'success' ? 'OK' : liveState.bannerTone === 'danger' ? '!' : 'i'}
            </StepIcon>
            <div>
              <h2>Current instruction</h2>
              <p>{liveState.instruction}</p>
            </div>
          </div>
          <div className="step-four-detection-state">
            <span>Position detection</span>
            <strong>{liveState.detection}</strong>
          </div>
          <div className="step-four-note">
            <StepIcon>i</StepIcon>
            <span>Live analysis only. Raw camera video is not saved.</span>
          </div>
        </aside>
      </main>

      {lastReplay ? <span className="step-four-sr-status" role="status">{lastReplay}</span> : null}
      {showBackWarning ? (
        <div className="foundation-back-warning" role="status">
          Use Pause, Hear Again, or Stop Session during a timed assessment.
        </div>
      ) : null}
    </SessionShell>
  );
}

function resultStateForDashboard(dashboard, stage) {
  const protocol = balanceProtocolFromDashboard(dashboard);
  const protocolStage = currentProtocolStage(protocol, stage);
  const result = queryValue('result', '');
  const requestedStop = queryValue('stop', '') === '1' || queryValue('complete', '') === '1';
  const holdTime = Number(queryValue('time', protocolStage?.holdSeconds || (result === 'success' ? 10 : 6.4)));
  const completed = result === 'success' || protocolStage?.status === 'completed' || holdTime >= 10;
  const shouldFinish = requestedStop
    || stage.order >= 4
    || result === 'ended'
    || result === 'support'
    || protocol?.status === 'completed'
    || protocol?.status === 'stopped'
    || protocol?.shouldFinishSession;

  return {
    holdTime: Number.isFinite(holdTime) ? holdTime : 0,
    completed,
    shouldFinish,
    statusLabel: completed ? 'Completed' : 'Ended early',
    nextStage: stageFromOrder(stage.order + 1),
  };
}

export function DisplayBalanceStageResultScreen({ dashboard }) {
  const [lastReplay, setLastReplay] = useState('');
  const stage = activeStageForDashboard(dashboard);
  const resultState = resultStateForDashboard(dashboard, stage);
  const voiceScript = resultState.shouldFinish
    ? 'The Balance Test is complete. We have saved the time for each position.'
    : `${stage.name} is complete. Continue to the next position when you are ready.`;

  return (
    <SessionShell
      eyebrow="Stage result"
      title={resultState.shouldFinish ? 'The Balance Test is complete.' : `${stage.name} Result`}
      description={resultState.shouldFinish ? 'We have saved the time for each position.' : 'Review this stage before moving to the next position.'}
      connection={<ConnectionIndicator status="connected" label="Result saved" detail={`${formatSeconds(resultState.holdTime)} seconds`} />}
      progress={<SessionProgress current={8} total={9} label="Session progress" />}
      className="step-four-result-shell"
    >
      <main className="step-four-result" data-voice-script={voiceScript}>
        <section className="step-four-result-card">
          <StepIcon tone={resultState.completed ? 'success' : 'warning'}>{resultState.completed ? 'OK' : 'i'}</StepIcon>
          <div>
            <p className="step-four-card-kicker">{stage.name}</p>
            <h2>{formatSeconds(resultState.holdTime)} seconds</h2>
            <strong>{resultState.statusLabel}</strong>
          </div>
        </section>

        {resultState.shouldFinish ? (
          <section className="step-four-complete-card">
            <h2>The Balance Test is complete.</h2>
            <p>We have saved the time for each position.</p>
            <div className="step-four-result-summary">
              {balanceStages.map((item) => (
                <div key={item.id}>
                  <span>{item.name}</span>
                  <strong>{item.id === stage.id ? `${formatSeconds(resultState.holdTime)} sec` : 'Saved'}</strong>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="step-four-next-card">
            <div>
              <p className="step-four-card-kicker">Next position</p>
              <h2>{resultState.nextStage.name}</h2>
              <span>{resultState.nextStage.setup}</span>
            </div>
            <BalanceFootGuide stage={resultState.nextStage} large />
          </section>
        )}

        <div className="step-four-actions">
          <VoiceButton script={voiceScript} onReplay={() => setLastReplay(voiceScript)} />
          <PrimaryActionBar
            primaryLabel={resultState.shouldFinish ? 'Continue to Chair Stand Test' : 'Continue to Next Position'}
            onPrimary={() => {
              if (resultState.shouldFinish) {
                goTo('/display/assessment/chair/instruction');
              } else {
                goTo(`/display/assessment/balance/live?stage=${resultState.nextStage.order}&state=positioning`);
              }
            }}
          />
        </div>
        {lastReplay ? <span className="step-four-sr-status" role="status">{lastReplay}</span> : null}
      </main>
    </SessionShell>
  );
}
