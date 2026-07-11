import {
  AssessmentResultTypes,
  legacyTestTypeFromAssessmentType,
} from '../shared/types/index.js';
import { validateAssessmentResult } from '../shared/validation/runtimeValidation.js';
import { canPersistAssessmentResult as canPersistLegacyAssessmentResult } from '../../pose/assessmentResultMetadata.js';

export function legacyPersistencePayloadFromStructuredResult(result = {}) {
  return {
    sessionId: result.sessionId,
    analysisSessionId: result.assessmentId,
    source: result.metadata?.source,
    assessmentType: legacyTestTypeFromAssessmentType(result.assessmentType) || result.assessmentType,
    isPersistable: result.metadata?.isPersistable,
    isClinicallyScorable: result.metadata?.isClinicallyScorable,
    status: result.status,
    resultType: AssessmentResultTypes.Final,
    analyzerFinalEvent: true,
    startedAt: result.timing?.startedAtMs,
    completedAt: result.timing?.completedAtMs,
    trackingQualitySummary: result.qualitySummary,
    structuredAssessmentResult: result,
  };
}

export function canPersistStructuredAssessmentResult(result, options = {}) {
  const validation = validateAssessmentResult(result);
  if (!validation.ok) {
    return { ok: false, reason: 'STRUCTURED_VALIDATION_FAILED', validation };
  }
  return canPersistLegacyAssessmentResult(legacyPersistencePayloadFromStructuredResult(result), options);
}

export function saveStructuredAssessmentResult(result, { saveLegacyResult, options = {} } = {}) {
  const persistence = canPersistStructuredAssessmentResult(result, options);
  if (!persistence.ok) return { error: 'Structured assessment result was not saved.', reason: persistence.reason, validation: persistence.validation };
  if (typeof saveLegacyResult !== 'function') return { result };
  return saveLegacyResult(legacyPersistencePayloadFromStructuredResult(result));
}

