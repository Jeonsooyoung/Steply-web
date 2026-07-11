import { useState } from 'react';
import {
  AppHeader,
  ConnectionIndicator,
  Navigation,
  PrimaryActionBar,
} from '../components/foundation/SteplyDesignSystem';
import { displayNavigationItems } from './steplyRoutes';

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

function titleCase(value = '') {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();
}

function currentErrorState() {
  if (typeof window === 'undefined') return 'invalid-assessment';
  const parts = window.location.pathname.split('/').filter(Boolean);
  const index = parts.indexOf('error');
  return parts[index + 1] || 'invalid-assessment';
}

function StepNineIcon({ tone = 'warning' }) {
  return <span className={`step-nine-icon step-nine-icon--${tone}`} aria-hidden="true" />;
}

function ErrorShell({ state, children }) {
  return (
    <div className="foundation-shell step-nine-shell">
      <AppHeader
        eyebrow="Session notice"
        title={state.title}
        description={state.message}
        connection={<ConnectionIndicator status={state.tone === 'danger' ? 'lost' : 'waiting'} label={state.statusLabel} detail={state.statusDetail} />}
      />
      <Navigation items={displayNavigationItems} currentPath="" />
      {children}
    </div>
  );
}

const exactCameraMessages = [
  'Step back until your full body is visible.',
  'Lower the camera slightly so both feet are visible.',
  'Move to a brighter area.',
  'Adjust the phone to match the guide.',
  'Only one person should remain in the assessment area.',
];

function invalidDetails() {
  const reason = queryValue('reason', 'Camera quality was too low.');
  const saved = queryValue('saved', 'no') === 'yes'
    ? 'A partial measurement was saved for review, but it is not used in trends.'
    : 'No result was saved for this measurement.';
  const correction = queryValue('correction', 'Adjust the camera so your full body and both feet are visible.');
  return { reason, saved, correction };
}

function errorContentFor(type) {
  if (type === 'camera-permission-denied') {
    return {
      title: 'Camera Access Is Required',
      message: 'Allow camera access before starting a camera-supported session.',
      statusLabel: 'Camera blocked',
      statusDetail: 'Permission is needed',
      tone: 'danger',
      voice: 'Camera access is required. Try again or open browser settings.',
      primaryLabel: 'Try Again',
      secondaryLabel: 'Open Browser Settings',
      primaryPath: '/camera/permission',
    };
  }

  if (type === 'phone-connection-lost') {
    return {
      title: 'Phone Connection Lost',
      message: 'The assessment has been paused.',
      statusLabel: 'Connection lost',
      statusDetail: 'Timer paused',
      tone: 'danger',
      voice: 'Phone connection lost. The assessment has been paused.',
      primaryLabel: 'Reconnect',
      secondaryLabel: 'End Session',
      primaryPath: '/display/connect?state=lost',
      secondaryPath: '/display/error/end-assessment-confirmation',
    };
  }

  if (type === 'safety-stop') {
    return {
      title: 'Please sit down safely.',
      message: 'Do not continue if you feel dizzy, have chest pain, or cannot catch your breath.',
      statusLabel: 'Session stopped',
      statusDetail: 'Safety first',
      tone: 'danger',
      voice: 'Please sit down safely. Do not continue if you feel dizzy, have chest pain, or cannot catch your breath.',
      primaryLabel: 'Contact Caregiver',
      secondaryLabel: 'End Session',
      primaryPath: '',
      secondaryPath: '/display/session/complete?status=symptom',
    };
  }

  if (type === 'professional-assessment-required') {
    return {
      title: 'Professional Assessment Recommended',
      message: 'A healthcare professional should review your results before you begin more challenging exercises.',
      statusLabel: 'Review needed',
      statusDetail: 'Advanced exercise blocked',
      tone: 'warning',
      voice: 'A healthcare professional should review your results before you begin more challenging exercises.',
      primaryLabel: 'View Professional Guidance',
      secondaryLabel: 'View Supported Exercises',
      primaryPath: '/display/reports?view=professional',
      secondaryPath: '/display/exercises/plan?restricted=1',
    };
  }

  if (type === 'end-assessment-confirmation') {
    return {
      title: 'End this assessment?',
      message: 'Current timers and live analysis will stop.',
      statusLabel: 'Confirmation needed',
      statusDetail: 'Choose how to continue',
      tone: 'warning',
      voice: 'End this assessment? Current timers and live analysis will stop.',
      primaryLabel: 'End Assessment',
      secondaryLabel: 'Return to Assessment',
      primaryPath: '/display/session/complete?status=partial',
      secondaryPath: '/display/home',
    };
  }

  return {
    title: "We Couldn't Complete This Measurement",
    message: 'Review the reason and adjust the setup before trying again.',
    statusLabel: 'Measurement not complete',
    statusDetail: 'Camera setup needed',
    tone: 'warning',
    voice: "We couldn't complete this measurement. Adjust the camera and try again.",
    primaryLabel: 'Adjust Camera and Try Again',
    secondaryLabel: 'End Assessment',
    primaryPath: '/display/session/camera-setup',
    secondaryPath: '/display/error/end-assessment-confirmation',
  };
}

export function DisplayErrorStateScreen() {
  const type = currentErrorState();
  const state = errorContentFor(type);
  const invalid = invalidDetails();
  const [status, setStatus] = useState('');

  function handlePrimary() {
    if (type === 'safety-stop') {
      setStatus('Caregiver contact request noted.');
      return;
    }
    if (state.primaryPath) goTo(state.primaryPath);
  }

  function handleSecondary() {
    if (type === 'camera-permission-denied') {
      setStatus('Open your browser camera settings and allow camera access for Steply.');
      return;
    }
    goTo(state.secondaryPath || '/display/session/complete?status=partial');
  }

  return (
    <ErrorShell state={state}>
      <main className={`step-nine-error step-nine-error--${state.tone}`} data-voice-script={state.voice}>
        <section className="step-nine-error-card" role={state.tone === 'danger' ? 'alert' : 'status'} aria-live={state.tone === 'danger' ? 'assertive' : 'polite'}>
          <StepNineIcon tone={state.tone} />
          <div>
            <p className="step-nine-kicker">{titleCase(type)}</p>
            <h2>{state.title}</h2>
            <p>{state.message}</p>
          </div>
        </section>

        {type === 'invalid-assessment' ? (
          <section className="step-nine-detail-grid" aria-label="Invalid assessment details">
            <article>
              <span>Reason</span>
              <strong>{invalid.reason}</strong>
            </article>
            <article>
              <span>Result saved</span>
              <strong>{invalid.saved}</strong>
            </article>
            <article>
              <span>Setup correction</span>
              <strong>{invalid.correction}</strong>
            </article>
          </section>
        ) : null}

        {type === 'camera-permission-denied' ? (
          <section className="step-nine-message-list" aria-label="Camera setup messages">
            {exactCameraMessages.map((message) => (
              <article key={message}>
                <StepNineIcon />
                <span>{message}</span>
              </article>
            ))}
          </section>
        ) : null}

        {type === 'professional-assessment-required' ? (
          <section className="step-nine-message-list" aria-label="Exercise restriction details">
            <article>
              <StepNineIcon tone="warning" />
              <span>Unsupported or advanced exercises are blocked until review.</span>
            </article>
            <article>
              <StepNineIcon tone="info" />
              <span>Supported guidance can still be reviewed safely.</span>
            </article>
          </section>
        ) : null}

        {status ? <p className="step-nine-status-message" role="status">{status}</p> : null}

        <PrimaryActionBar
          primaryLabel={state.primaryLabel}
          secondaryLabel={state.secondaryLabel}
          onPrimary={handlePrimary}
          onSecondary={handleSecondary}
        />
      </main>
    </ErrorShell>
  );
}
