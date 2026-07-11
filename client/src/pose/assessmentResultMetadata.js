export const ResultSources = {
  LivePose: 'LIVE_POSE',
  Replay: 'REPLAY',
  Demo: 'DEMO',
  Fallback: 'FALLBACK',
  ManualTest: 'MANUAL_TEST',
};

export const AssessmentStatuses = {
  Valid: 'VALID',
  Incomplete: 'INCOMPLETE',
  Invalid: 'INVALID',
  Cancelled: 'SESSION_CANCELLED',
  TrackingFailed: 'TRACKING_FAILED',
};

export const AssessmentResultTypes = {
  Frame: 'FRAME_RESULT',
  Final: 'FINAL_RESULT',
};

export const ANALYZER_VERSION = 'steply-pose-worker.v1';

const NON_CLINICAL_SOURCES = new Set([
  ResultSources.Demo,
  ResultSources.Fallback,
  ResultSources.ManualTest,
]);

export function assessmentTypeForTestType(testType) {
  if (testType === 'chair_stand' || testType === 'CHAIR_STAND_30_SEC') return 'chair_stand';
  if (testType === 'four_stage_balance' || testType === 'FOUR_STAGE_BALANCE') return 'balance';
  return testType === 'balance' ? 'balance' : null;
}

export function sourceFromResult(result = {}) {
  return result.metadata?.source || result.source || null;
}

export function statusFromResult(result = {}) {
  if (result.status) return result.status;
  if (result.invalid) return AssessmentStatuses.Invalid;
  return AssessmentStatuses.Valid;
}

export function isNonClinicalResult(result = {}) {
  return NON_CLINICAL_SOURCES.has(sourceFromResult(result));
}

export function canUseClinicalPipeline(result = {}) {
  return (
    sourceFromResult(result) === ResultSources.LivePose
    && statusFromResult(result) === AssessmentStatuses.Valid
    && result.isClinicallyScorable !== false
  );
}

export function canGenerateExerciseRecommendation(result = {}) {
  return canUseClinicalPipeline(result);
}

export function canPersistAssessmentResult(result = {}, { activeAnalysisSessionId = null } = {}) {
  const source = sourceFromResult(result);
  const status = statusFromResult(result);
  const sessionId = result.sessionId || result.metadata?.sessionId;
  const assessmentType = result.assessmentType || result.metadata?.assessmentType;
  const analysisSessionId = result.analysisSessionId || result.metadata?.analysisSessionId;
  const startedAt = Number(result.startedAt ?? result.metadata?.startedAt);
  const completedAt = Number(result.completedAt ?? result.endedAt ?? result.metadata?.completedAt);

  if (result.resultType === AssessmentResultTypes.Frame) return { ok: false, reason: 'FRAME_RESULT' };
  if (source !== ResultSources.LivePose) return { ok: false, reason: 'NON_LIVE_RESULT' };
  if (result.isPersistable !== true) return { ok: false, reason: 'NOT_PERSISTABLE' };
  if (status !== AssessmentStatuses.Valid) return { ok: false, reason: 'NON_VALID_RESULT' };
  if (!sessionId) return { ok: false, reason: 'MISSING_SESSION_ID' };
  if (!assessmentType) return { ok: false, reason: 'MISSING_ASSESSMENT_TYPE' };
  if (activeAnalysisSessionId && analysisSessionId && activeAnalysisSessionId !== analysisSessionId) {
    return { ok: false, reason: 'STALE_ANALYSIS_SESSION' };
  }
  if (result.analyzerFinalEvent !== true) return { ok: false, reason: 'MISSING_ANALYZER_FINAL_EVENT' };
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    return { ok: false, reason: 'INVALID_TIMESTAMPS' };
  }
  if (!result.trackingQualitySummary) return { ok: false, reason: 'MISSING_QUALITY_SUMMARY' };
  return { ok: true, reason: 'OK' };
}

export function withAssessmentMetadata(result = {}, {
  source,
  sessionId,
  analysisSessionId = null,
  testType,
  assessmentType = assessmentTypeForTestType(testType || result.testType),
  isPersistable = source === ResultSources.LivePose,
  isClinicallyScorable = source === ResultSources.LivePose,
  status = statusFromResult(result),
  resultType = AssessmentResultTypes.Final,
  generatedAt = Date.now(),
  analyzerVersion = ANALYZER_VERSION,
  analyzerFinalEvent = resultType === AssessmentResultTypes.Final && source === ResultSources.LivePose,
} = {}) {
  if (!source) throw new Error('Assessment result source is required.');
  const metadata = {
    ...(result.metadata || {}),
    source,
    sessionId: sessionId || result.sessionId || result.metadata?.sessionId || '',
    analysisSessionId: analysisSessionId || result.analysisSessionId || result.metadata?.analysisSessionId || null,
    assessmentType: assessmentType || result.assessmentType || result.metadata?.assessmentType || null,
    isPersistable: Boolean(isPersistable),
    isClinicallyScorable: Boolean(isClinicallyScorable),
    generatedAt,
    analyzerVersion,
  };

  return {
    ...result,
    metadata,
    source: metadata.source,
    sessionId: metadata.sessionId,
    analysisSessionId: metadata.analysisSessionId,
    assessmentType: metadata.assessmentType,
    isPersistable: metadata.isPersistable,
    isClinicallyScorable: metadata.isClinicallyScorable,
    generatedAt: metadata.generatedAt,
    analyzerVersion: metadata.analyzerVersion,
    status,
    resultType,
    analyzerFinalEvent,
  };
}

export function createIncompleteAssessmentResult({
  sessionId,
  analysisSessionId,
  testType,
  assessmentType = assessmentTypeForTestType(testType),
  errorCode = 'ANALYZER_FINAL_TIMEOUT',
  startedAt = null,
  completedAt = Date.now(),
} = {}) {
  return withAssessmentMetadata({
    testType,
    primaryValue: null,
    repetitionCount: null,
    confidence: 0,
    trackingQualityScore: 0,
    trackingQualitySummary: null,
    errorCode,
    summaryMessage: 'We could not complete the measurement.',
    seniorMessage: 'Please check the camera connection and try again.',
    startedAt,
    completedAt,
  }, {
    source: ResultSources.Fallback,
    sessionId,
    analysisSessionId,
    testType,
    assessmentType,
    isPersistable: false,
    isClinicallyScorable: false,
    status: AssessmentStatuses.Incomplete,
    resultType: AssessmentResultTypes.Final,
    analyzerFinalEvent: false,
  });
}

