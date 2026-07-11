import {
  AssessmentEventTypes,
  EvidenceKinds,
  createTypedId,
} from '../shared/types/index.js';
import { validateAssessmentEvent } from '../shared/validation/runtimeValidation.js';

export function createAssessmentEvent({
  eventId = createTypedId('event'),
  sessionId,
  assessmentType,
  type = AssessmentEventTypes.PoseAcquired,
  timestampMs = Date.now(),
  frameId,
  confidence,
  evidence,
  reasonCode,
} = {}) {
  const event = {
    eventId,
    sessionId,
    assessmentType,
    type,
    timestampMs,
    ...(frameId !== undefined ? { frameId } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(evidence ? { evidence } : {}),
    ...(reasonCode ? { reasonCode } : {}),
  };
  return {
    value: event,
    validation: validateAssessmentEvent(event),
  };
}

export function createStateTransitionEvidence(from, to) {
  return { kind: EvidenceKinds.StateTransition, from, to };
}

export function createQualityEvidence(qualityStatus) {
  return {
    kind: EvidenceKinds.Quality,
    qualityState: qualityStatus?.state,
    reasons: qualityStatus?.reasons || [],
  };
}

export { AssessmentEventTypes, EvidenceKinds };

