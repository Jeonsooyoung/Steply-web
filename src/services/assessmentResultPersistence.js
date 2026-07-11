const crypto = require('crypto');

const ResultSources = {
  LivePose: 'LIVE_POSE',
  Replay: 'REPLAY',
  Demo: 'DEMO',
  Fallback: 'FALLBACK',
  ManualTest: 'MANUAL_TEST',
};

const AssessmentStatuses = {
  Valid: 'VALID',
  Incomplete: 'INCOMPLETE',
  Invalid: 'INVALID',
  Cancelled: 'SESSION_CANCELLED',
  TrackingFailed: 'TRACKING_FAILED',
};

const AssessmentResultTypes = {
  Frame: 'FRAME_RESULT',
  Final: 'FINAL_RESULT',
};

function sourceFrom(result = {}) {
  return result.metadata?.source || result.source || null;
}

function statusFrom(result = {}) {
  if (result.status) return result.status;
  if (result.invalid) return AssessmentStatuses.Invalid;
  return AssessmentStatuses.Valid;
}

function logSaveRejected(reason, result = {}) {
  console.warn(JSON.stringify({
    event: 'ASSESSMENT_SAVE_REJECTED',
    reason,
    sessionId: result.sessionId || result.metadata?.sessionId || null,
    analysisSessionId: result.analysisSessionId || result.metadata?.analysisSessionId || null,
    source: sourceFrom(result),
    status: statusFrom(result),
    resultType: result.resultType || null,
  }));
}

function canPersistAssessmentResult(result = {}, { session = null } = {}) {
  const source = sourceFrom(result);
  const status = statusFrom(result);
  const sessionId = result.sessionId || result.metadata?.sessionId;
  const assessmentType = result.assessmentType || result.metadata?.assessmentType;
  const analysisSessionId = result.analysisSessionId || result.metadata?.analysisSessionId;
  const sessionAnalysisId = session?.activeAnalysisSessionId || session?.analysisSessionId || null;
  const startedAt = Number(result.startedAt ?? result.metadata?.startedAt);
  const completedAt = Number(result.completedAt ?? result.endedAt ?? result.metadata?.completedAt);

  if (result.resultType === AssessmentResultTypes.Frame) return { ok: false, reason: 'FRAME_RESULT' };
  if (source !== ResultSources.LivePose) return { ok: false, reason: 'NON_LIVE_RESULT' };
  if (result.isPersistable !== true) return { ok: false, reason: 'NOT_PERSISTABLE' };
  if (status !== AssessmentStatuses.Valid) return { ok: false, reason: 'NON_VALID_RESULT' };
  if (!sessionId) return { ok: false, reason: 'MISSING_SESSION_ID' };
  if (session && session.id !== sessionId) return { ok: false, reason: 'SESSION_ID_MISMATCH' };
  if (!assessmentType) return { ok: false, reason: 'MISSING_ASSESSMENT_TYPE' };
  if (sessionAnalysisId && analysisSessionId && sessionAnalysisId !== analysisSessionId) {
    return { ok: false, reason: 'STALE_ANALYSIS_SESSION' };
  }
  if (result.analyzerFinalEvent !== true) return { ok: false, reason: 'MISSING_ANALYZER_FINAL_EVENT' };
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    return { ok: false, reason: 'INVALID_TIMESTAMPS' };
  }
  if (!result.trackingQualitySummary) return { ok: false, reason: 'MISSING_QUALITY_SUMMARY' };
  return { ok: true, reason: 'OK' };
}

function saveAssessmentResult(payload, {
  session,
  addHistoryItem,
  broadcast,
  publicSession,
} = {}) {
  const validation = canPersistAssessmentResult(payload, { session });
  if (!validation.ok) {
    logSaveRejected(validation.reason, payload);
    return {
      error: 'Assessment result was not saved.',
      status: 422,
      reason: validation.reason,
    };
  }

  const finalResult = {
    ...payload,
    id: crypto.randomBytes(6).toString('hex'),
    receivedAt: Date.now(),
    profile: session.profile || null,
    selectedTest: session.selectedTest || payload.testType || null,
  };

  session.finalResult = finalResult;
  if (typeof addHistoryItem === 'function') addHistoryItem(finalResult);

  if (typeof broadcast === 'function' && typeof publicSession === 'function') {
    broadcast(payload.sessionId, {
      type: 'final',
      result: finalResult,
      session: publicSession(session),
    });
  }

  return { result: finalResult };
}

module.exports = {
  ResultSources,
  AssessmentStatuses,
  AssessmentResultTypes,
  canPersistAssessmentResult,
  saveAssessmentResult,
};

