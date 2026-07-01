import { journeySteps } from '../data/flowSteps';
import { StatusPill } from './SteplyPrimitives';

export function JourneyFlow({ activeStep, onStepChange }) {
  return (
    <nav className="journey-flow" aria-label="Movement check flow">
      {journeySteps.map((step, index) => (
        <button
          key={step.id}
          type="button"
          className={`journey-step ${activeStep === step.id ? 'journey-step--active' : ''}`}
          onClick={() => onStepChange(step.id)}
        >
          <span className="journey-step__number">{step.number}</span>
          <span className="journey-step__body">
            <strong>{step.title}</strong>
            <small>{step.description}</small>
          </span>
          {index < journeySteps.length - 1 ? <span className="journey-step__line" /> : null}
        </button>
      ))}
      <StatusPill status="steady">Live ready</StatusPill>
    </nav>
  );
}
