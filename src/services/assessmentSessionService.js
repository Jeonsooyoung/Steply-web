const crypto = require('crypto');
const {
  ASSESSMENT_SESSION_SCHEMA_VERSION,
  LEGACY_ASSESSMENT_SESSION_SCHEMA_VERSION,
  AssessmentSessionEventTypes,
  FunctionalTestSlots,
  createAssessmentSession,
  reduceAssessmentSession,
  reductionOutcome,
  upcastAssessmentSessionV1,
} = require('../../shared/stage1Assessment.cjs');
const {
  Stage2ResultStatuses,
  canonicalHash,
  normalizeStage2Result,
} = require('../../shared/stage2Contract.cjs');
const {
  normalizeExerciseSessionResult,
  normalizeOtagoPrescriptionPlan,
} = require('../../shared/stage3Contract.cjs');
const { getSession, listSessions, broadcast } = require('./sessionStore');

function randomMessageId(prefix = 'assessment-session') {
  return `${prefix}:${crypto.randomBytes(8).toString('hex')}`;
}

function publicAssessmentSession(value) {
  return value || null;
}

function canonicalPrescription(value) {
  if (!value || typeof value !== 'object') return null;
  const allowedStatuses = ['NOT_GENERATED', 'BLOCKED', 'ACTIVE', 'PENDING_PROFESSIONAL_REVIEW'];
  if (!allowedStatuses.includes(value.status) || !Array.isArray(value.sessionResults)) return null;
  if (value.status === 'NOT_GENERATED') {
    return value.plan === null && value.sessionResults.length === 0
      ? { status: value.status, plan: null, sessionResults: [] }
      : null;
  }
  try {
    const plan = normalizeOtagoPrescriptionPlan(value.plan);
    if (plan.status !== value.status) return null;
    const sessionResults = value.sessionResults.map(normalizeExerciseSessionResult);
    if (new Set(sessionResults.map((item) => item.resultId)).size !== sessionResults.length) return null;
    if (new Set(sessionResults.map((item) => item.exerciseSessionId)).size !== sessionResults.length) return null;
    if (sessionResults.some((item) => item.planId !== plan.planId)) return null;
    return { status: value.status, plan, sessionResults };
  } catch (_) {
    return null;
  }
}

function createForConnection(connectionSessionId, profile = {}) {
  return createAssessmentSession({
    assessmentSessionId: `assessment-${crypto.randomBytes(10).toString('hex')}`,
    connectionSessionId,
    profileId: profile.id || profile.userId,
    profile,
  });
}

function canonicalSnapshot(snapshot, connectionSessionId) {
  if (!snapshot || ![ASSESSMENT_SESSION_SCHEMA_VERSION, LEGACY_ASSESSMENT_SESSION_SCHEMA_VERSION].includes(snapshot.schemaVersion)) return null;
  const canonical = upcastAssessmentSessionV1(snapshot, { canonicalHash });
  if (!canonical.assessmentSessionId || !canonical.profileId) return null;
  if (!canonical.screening?.responses || !canonical.screening?.fallHistory) return null;
  if (!canonical.profileSnapshot || !canonical.operationalContext) return null;
  if (!canonical.functionalTests?.FOUR_STAGE_BALANCE || !canonical.functionalTests?.CHAIR_STAND_30S) return null;
  const canonicalExercisePrescription = canonicalPrescription(canonical.exercisePrescription);
  if (!canonical.steadi || !canonicalExercisePrescription) return null;
  const {
    schemaVersion,
    assessmentSessionId,
    profileId,
    revision,
    status,
    screening,
    profileSnapshot,
    operationalContext,
    functionalTests,
    steadi,
    vulnerabilityAssessment,
    exercisePrescription,
    createdAt,
    updatedAt,
    completedAt,
  } = canonical;
  return {
    schemaVersion,
    assessmentSessionId,
    connectionSessionId,
    profileId,
    revision,
    status,
    screening,
    profileSnapshot,
    operationalContext,
    functionalTests,
    steadi,
    vulnerabilityAssessment,
    exercisePrescription: canonicalExercisePrescription,
    createdAt,
    updatedAt,
    completedAt,
  };
}

function broadcastUpdate(connectionSessionId, messageId, assessmentSession, baseRevision = Math.max(0, assessmentSession.revision - 1)) {
  broadcast(connectionSessionId, {
    type: 'assessment-session.updated',
    schemaVersion: ASSESSMENT_SESSION_SCHEMA_VERSION,
    messageId,
    assessmentSessionId: assessmentSession.assessmentSessionId,
    baseRevision,
    revision: assessmentSession.revision,
    session: assessmentSession,
  });
}

function connectionForAssessmentSession(assessmentSessionId) {
  return listSessions().find((connection) => connection.assessmentSession?.assessmentSessionId === assessmentSessionId) || null;
}

function getAssessmentSessionById(assessmentSessionId) {
  return connectionForAssessmentSession(assessmentSessionId)?.assessmentSession || null;
}

function replaceAssessmentSessionSnapshot(assessmentSessionId, envelope = {}) {
  const connection = connectionForAssessmentSession(assessmentSessionId);
  if (!connection) return { error: 'Assessment session not found', status: 404 };
  const updateMessageId = envelope.messageId;
  if (!updateMessageId) return { error: 'messageId is required', status: 400 };
  if (processedMessageSet(connection).has(updateMessageId)) {
    return { assessmentSession: connection.assessmentSession, applied: false, reason: 'DUPLICATE_MESSAGE', messageId: updateMessageId };
  }
  const baseRevision = envelope.baseRevision;
  if (!Number.isInteger(baseRevision) || baseRevision !== connection.assessmentSession.revision) {
    return { error: 'Assessment session revision conflict', status: 409, reason: 'REVISION_CONFLICT', assessmentSession: connection.assessmentSession };
  }
  const incoming = canonicalSnapshot(envelope.session, connection.id);
  if (!incoming || incoming.assessmentSessionId !== assessmentSessionId || incoming.revision <= baseRevision) {
    return { error: 'Invalid canonical assessment session snapshot', status: 422, reason: 'INVALID_ASSESSMENT_SESSION_SNAPSHOT' };
  }
  connection.assessmentSession = incoming;
  processedMessageSet(connection).add(updateMessageId);
  broadcastUpdate(connection.id, updateMessageId, incoming, baseRevision);
  return { assessmentSession: incoming, applied: true, reason: 'SNAPSHOT_REPLACED', messageId: updateMessageId };
}

function applyAssessmentSessionEvent(assessmentSessionId, envelope = {}) {
  const connection = connectionForAssessmentSession(assessmentSessionId);
  if (!connection) return { error: 'Assessment session not found', status: 404 };
  return updateAssessmentSession(connection.id, {
    ...(envelope.event || envelope),
    messageId: envelope.messageId || envelope.event?.messageId,
    expectedRevision: envelope.baseRevision ?? envelope.expectedRevision,
  });
}

function resumeAssessmentSession(connection, message = {}) {
  if (!connection) return { error: 'Connection session not found', status: 404 };
  const incoming = canonicalSnapshot(message.session, connection.id);
  const current = connection.assessmentSession;
  if (incoming && (!current || incoming.revision > current.revision)) {
    connection.assessmentSession = incoming;
    processedMessageSet(connection).add(message.messageId);
    return { action: 'UPDATED_FROM_MOBILE', assessmentSession: incoming };
  }
  if (!current) return { action: 'NO_SESSION', assessmentSession: null };
  const knownRevision = Number(message.knownRevision);
  return {
    action: Number.isInteger(knownRevision) && knownRevision === current.revision ? 'ACK' : 'SEND_SNAPSHOT',
    assessmentSession: current,
  };
}

function connectSnapshot(session, profile, snapshot = null) {
  const incoming = canonicalSnapshot(snapshot, session.id);
  session.assessmentSession = incoming || session.assessmentSession || createForConnection(session.id, profile);
  const event = {
    type: AssessmentSessionEventTypes.ProfileUpdated,
    messageId: randomMessageId('profile-connected'),
    profile,
    at: Date.now(),
  };
  session.assessmentSession = reduceAssessmentSession(session.assessmentSession, event);
  broadcastUpdate(session.id, event.messageId, session.assessmentSession);
  return session.assessmentSession;
}

function processedMessageSet(connection) {
  if (!connection.assessmentSessionMessageIds) connection.assessmentSessionMessageIds = new Set();
  return connection.assessmentSessionMessageIds;
}

function updateAssessmentSession(connectionSessionId, update = {}) {
  const connection = getSession(connectionSessionId);
  if (!connection) return { error: 'Session not found', status: 404 };
  if (!connection.assessmentSession) {
    if (!connection.profile?.id) return { error: 'Profile must be connected first', status: 409 };
    connection.assessmentSession = createForConnection(connectionSessionId, connection.profile);
  }
  const updateMessageId = update.messageId || randomMessageId('assessment-update');
  if (processedMessageSet(connection).has(updateMessageId)) {
    return { assessmentSession: connection.assessmentSession, applied: false, reason: 'DUPLICATE_MESSAGE', messageId: updateMessageId };
  }
  if (Number.isInteger(update.expectedRevision) && update.expectedRevision !== connection.assessmentSession.revision) {
    return {
      error: 'Assessment session revision conflict',
      status: 409,
      reason: 'REVISION_CONFLICT',
      assessmentSession: connection.assessmentSession,
    };
  }
  const event = {
    ...update,
    type: update.type || (update.screening
      ? AssessmentSessionEventTypes.ScreeningUpdated
      : update.operationalContext
        ? AssessmentSessionEventTypes.OperationalContextUpdated
        : AssessmentSessionEventTypes.ProfileUpdated),
    messageId: updateMessageId,
    at: update.at || Date.now(),
  };
  const previousRevision = connection.assessmentSession.revision;
  let next;
  try {
    next = reduceAssessmentSession(connection.assessmentSession, event);
  } catch (error) {
    return {
      error: error.message,
      status: 422,
      reason: error.code || 'INVALID_ASSESSMENT_SESSION_EVENT',
      assessmentSession: connection.assessmentSession,
    };
  }
  const reason = reductionOutcome(next);
  const applied = next.revision > previousRevision;
  connection.assessmentSession = next;
  if (applied) {
    processedMessageSet(connection).add(updateMessageId);
    broadcastUpdate(connectionSessionId, updateMessageId, next);
  }
  return { assessmentSession: next, applied, reason, messageId: updateMessageId };
}

function testSlotFromPayload(payload = {}) {
  const testType = payload.testType || payload.selectedTest || payload.assessmentType;
  if (['chair_stand', 'CHAIR_STAND_30S', 'CHAIR_STAND_30_SEC'].includes(testType)) return FunctionalTestSlots.ChairStand;
  if (['four_stage_balance', 'balance', 'FOUR_STAGE_BALANCE'].includes(testType)) return FunctionalTestSlots.FourStageBalance;
  return null;
}

function structuredResultFromPayload(payload = {}) {
  return payload.structuredAssessmentResult
    || payload.finalResponse?.result
    || payload.structuredPipeline?.assessmentResult
    || null;
}

function stage2ResultFromPayload(payload = {}) {
  const structured = structuredResultFromPayload(payload) || {};
  return payload.stage2Result
    || structured.stage2Result
    || structured.stage2
    || (structured.operationalConfigVersion ? structured : null);
}

function acceptedResultFromPayload(payload, slot, attemptId, resultKey) {
  const stage2 = stage2ResultFromPayload(payload);
  if (stage2) {
    return normalizeStage2Result(stage2, {
      assessmentType: slot,
      attemptId,
      analysisSessionId: payload.analysisSessionId || payload.metadata?.analysisSessionId || stage2.analysisSessionId,
      resultId: stage2.resultId || payload.resultId || resultKey,
    });
  }
  const structured = structuredResultFromPayload(payload) || {};
  const completedAt = Number(payload.completedAt ?? payload.endedAt ?? structured.timing?.completedAtMs ?? Date.now());
  const analysisSessionId = payload.analysisSessionId || payload.metadata?.analysisSessionId || structured.assessmentId || attemptId;
  const accepted = {
    resultSchemaVersion: 'legacy_assessment_result.v1',
    resultId: resultKey,
    attemptId,
    analysisSessionId,
    assessmentType: slot,
    status: 'VALID',
    source: 'LIVE_POSE',
    completedAt,
    legacyReadOnly: true,
  };
  if (slot === FunctionalTestSlots.ChairStand) {
    const measurement = structured.primaryMeasurements || {};
    const repetitions = Number(measurement.completedRepetitions ?? payload.repetitionCount ?? payload.primaryValue);
    accepted.completedRepetitions = Number.isFinite(repetitions) ? repetitions : null;
    accepted.armUseConfirmed = measurement.armUse === 'CONFIRMED'
      || payload.armUseConfirmed === true
      || payload.armUseDisqualified === true;
  } else {
    const stages = structured.primaryMeasurements?.stages || [];
    const tandem = stages.find((stage) => stage.stage === 'TANDEM') || {};
    const seconds = Number(tandem.holdDurationSeconds ?? payload.balanceResult?.stageById?.tandem?.holdSeconds ?? payload.primaryValue);
    accepted.tandemHoldSeconds = Number.isFinite(seconds) ? seconds : null;
  }
  return { ...accepted, resultHash: canonicalHash({ ...accepted, resultId: undefined }) };
}

function resultReceipts(assessmentSession) {
  const receipts = [];
  for (const slot of Object.values(assessmentSession.functionalTests || {})) {
    if (slot.acceptedResult) receipts.push(slot.acceptedResult);
    for (const attempt of slot.attempts || []) if (attempt.result) receipts.push(attempt.result);
  }
  return receipts;
}

function acceptFinalResult(connection, payload) {
  if (!connection.assessmentSession) {
    if (!connection.profile?.id) return { error: 'Profile must be connected first', status: 409, reason: 'PROFILE_NOT_CONNECTED' };
    connection.assessmentSession = createForConnection(connection.id, connection.profile);
  }
  const slot = testSlotFromPayload(payload);
  if (!slot) return { error: 'Unsupported assessment test type', status: 422, reason: 'UNKNOWN_TEST_SLOT' };
  const attemptId = payload.attemptId
    || payload.analysisSessionId
    || payload.metadata?.analysisSessionId
    || structuredResultFromPayload(payload)?.assessmentId;
  if (!attemptId) return { error: 'attemptId is required', status: 422, reason: 'MISSING_ATTEMPT_ID' };
  const defaultResultId = `${connection.assessmentSession.assessmentSessionId}:${slot}:${attemptId}`;
  let acceptedResult;
  try {
    acceptedResult = acceptedResultFromPayload(payload, slot, attemptId, defaultResultId);
  } catch (error) {
    return { error: error.message, status: 422, reason: error.code || 'INVALID_STAGE2_RESULT' };
  }
  const resultKey = acceptedResult.resultId;
  const receipts = resultReceipts(connection.assessmentSession);
  const sameId = receipts.find((result) => result.resultId === resultKey);
  if (sameId && sameId.resultHash !== acceptedResult.resultHash) {
    return { error: 'resultId is already bound to different content', status: 409, reason: 'RESULT_CONFLICT', existingResult: sameId };
  }
  const duplicateReceipt = sameId || receipts.find((result) => result.resultHash === acceptedResult.resultHash);
  if (duplicateReceipt) {
    return {
      assessmentSession: connection.assessmentSession,
      applied: false,
      duplicate: true,
      reason: 'DUPLICATE_TEST_RESULT',
      resultKey,
      existingResult: duplicateReceipt,
    };
  }
  const valid = acceptedResult.status === Stage2ResultStatuses.Valid;
  const current = connection.assessmentSession.functionalTests[slot].acceptedResult;
  if (valid && current && acceptedResult.completedAt <= current.completedAt) {
    return { error: 'Stale assessment attempt', status: 409, reason: 'STALE_TEST_ATTEMPT' };
  }
  const updateMessageId = payload.messageId || `assessment-result:${resultKey}`;
  const previousRevision = connection.assessmentSession.revision;
  let next;
  try {
    next = reduceAssessmentSession(connection.assessmentSession, {
      type: valid ? AssessmentSessionEventTypes.TestResultAccepted : AssessmentSessionEventTypes.TestResultInvalid,
      messageId: updateMessageId,
      slot,
      attemptId,
      ...(valid ? { acceptedResult } : { attemptResult: acceptedResult }),
      startedAt: payload.startedAt || structuredResultFromPayload(payload)?.timing?.startedAtMs || acceptedResult.completedAt,
      exercisePlan: payload.structuredPipeline?.exercisePlan || payload.recommendationPlan || null,
      at: Date.now(),
    });
  } catch (error) {
    return { error: error.message, status: 422, reason: error.code || 'INVALID_STAGE3_PRESCRIPTION' };
  }
  if (next.revision === previousRevision) {
    return { error: 'Assessment result was not accepted', status: 409, reason: reductionOutcome(next) };
  }
  connection.assessmentSession = next;
  processedMessageSet(connection).add(updateMessageId);
  broadcastUpdate(connection.id, updateMessageId, next);
  return {
    assessmentSession: next,
    applied: true,
    duplicate: false,
    invalidAttempt: !valid,
    excludeFromTrends: acceptedResult.quality?.excludeFromTrends === true,
    reason: valid ? 'TEST_RESULT_ACCEPTED' : 'INVALID_TEST_RESULT_RECORDED',
    resultKey,
    normalizedResult: acceptedResult,
  };
}

module.exports = {
  createForConnection,
  publicAssessmentSession,
  connectSnapshot,
  updateAssessmentSession,
  acceptFinalResult,
  getAssessmentSessionById,
  replaceAssessmentSessionSnapshot,
  applyAssessmentSessionEvent,
  resumeAssessmentSession,
};
