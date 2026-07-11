import { journeySteps } from '../data/flowSteps';
import { StatusPill } from './SteplyPrimitives';

function isStepActive(step, activeStep) {
  if (step.active === true) return true;
  if (step.id === activeStep) return true;
  return Array.isArray(step.activeWhen) && step.activeWhen.includes(activeStep);
}

export function JourneyFlow({ activeStep, onStepChange, compact = false, steps = journeySteps }) {
  const isReadOnly = typeof onStepChange !== 'function';
  const flowSteps = steps.length ? steps : journeySteps;

  return (
    <nav className={compact ? 'journey-flow journey-flow--compact' : 'journey-flow'} aria-label="Steply flow">
      {flowSteps.map((step, index) => (
        <button
          key={step.id}
          type="button"
          className={`journey-step ${isStepActive(step, activeStep) ? 'journey-step--active' : ''}`}
          onClick={() => onStepChange?.(step.id)}
          disabled={isReadOnly}
        >
          <span className="journey-step__number">{step.number}</span>
          <span className="journey-step__body">
            <strong>{step.title}</strong>
            <small>{step.description}</small>
          </span>
          {index < flowSteps.length - 1 ? <span className="journey-step__line" /> : null}
        </button>
      ))}
      <StatusPill status="steady">Large-screen ready</StatusPill>
    </nav>
  );
}
