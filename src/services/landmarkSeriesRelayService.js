const { getSession } = require('./sessionStore');
const crypto = require('crypto');
const {
  normalizeLandmarkSeriesFinalized,
  normalizeLandmarkSeriesAck,
} = require('../../shared/landmarkSeriesContract.cjs');

function stores(session) {
  if (!session.pendingLandmarkSeriesById) session.pendingLandmarkSeriesById = new Map();
  if (!session.landmarkSeriesMessageIds) session.landmarkSeriesMessageIds = new Map();
  if (!session.landmarkSeriesAttemptIds) session.landmarkSeriesAttemptIds = new Map();
  if (!session.landmarkSeriesAckReceipts) session.landmarkSeriesAckReceipts = new Map();
  return {
    pending: session.pendingLandmarkSeriesById,
    messages: session.landmarkSeriesMessageIds,
    attempts: session.landmarkSeriesAttemptIds,
    receipts: session.landmarkSeriesAckReceipts,
  };
}

function linkedResult(session, envelope) {
  const assessment = session.assessmentSession;
  if (!assessment || assessment.assessmentSessionId !== envelope.assessmentSessionId) return false;
  const slots = Object.values(assessment.functionalTests || {});
  return slots.some((slot) => {
    const results = [slot?.acceptedResult, ...(slot?.attempts || []).map((attempt) => attempt?.result)].filter(Boolean);
    return results.some((result) => (
      result.resultId === envelope.resultId
      && result.attemptId === envelope.attemptId
      && result.analysisSessionId === envelope.series.analysisSessionId
      && result.assessmentType === envelope.series.assessmentType
      && result.status === envelope.series.status
    ));
  });
}

function envelopeHash(envelope) {
  return crypto.createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
}

function applyFinalized(connectionSessionId, value) {
  const session = getSession(connectionSessionId);
  if (!session) return { error: 'Connection session not found', status: 404, reason: 'SESSION_NOT_FOUND' };
  let envelope;
  try {
    envelope = normalizeLandmarkSeriesFinalized(value);
  } catch (error) {
    return { error: error.message, status: 422, reason: error.code || 'INVALID_LANDMARK_SERIES_CONTRACT' };
  }
  if (String(session.profile?.id || '') !== envelope.profileId) {
    return { error: 'Landmark series profile does not match connected profile', status: 403, reason: 'PROFILE_BINDING_MISMATCH' };
  }
  if (!linkedResult(session, envelope)) {
    return { error: 'Landmark series does not match a stored assessment attempt result', status: 409, reason: 'RESULT_LINKAGE_MISMATCH' };
  }
  const { pending, messages, attempts, receipts } = stores(session);
  const hash = envelopeHash(envelope);
  const known = messages.get(envelope.messageId);
  if (known) {
    if (known.seriesId !== envelope.series.seriesId || known.hash !== hash) {
      return { error: 'messageId already belongs to a different series', status: 409, reason: 'MESSAGE_ID_CONFLICT' };
    }
    return {
      duplicate: true,
      pending: pending.get(known.seriesId) || null,
      ack: receipts.get(known.seriesId)?.ack || null,
      envelope,
    };
  }
  const knownAttemptSeriesId = attempts.get(envelope.attemptId);
  if (knownAttemptSeriesId && knownAttemptSeriesId !== envelope.series.seriesId) {
    return { error: 'attemptId already belongs to a different landmark series', status: 409, reason: 'ATTEMPT_ID_CONFLICT' };
  }
  if (pending.has(envelope.series.seriesId) || receipts.has(envelope.series.seriesId)) {
    return { error: 'seriesId already exists with a different messageId', status: 409, reason: 'SERIES_ID_CONFLICT' };
  }
  pending.set(envelope.series.seriesId, envelope);
  messages.set(envelope.messageId, { seriesId: envelope.series.seriesId, hash });
  attempts.set(envelope.attemptId, envelope.series.seriesId);
  return { applied: true, duplicate: false, envelope };
}

function acknowledge(connectionSessionId, value) {
  const session = getSession(connectionSessionId);
  if (!session) return { error: 'Connection session not found', status: 404, reason: 'SESSION_NOT_FOUND' };
  let ack;
  try {
    ack = normalizeLandmarkSeriesAck(value);
  } catch (error) {
    return { error: error.message, status: 422, reason: error.code || 'INVALID_LANDMARK_SERIES_CONTRACT' };
  }
  if (String(session.profile?.id || '') !== ack.profileId) {
    return { error: 'Landmark series ack profile does not match connected profile', status: 403, reason: 'PROFILE_BINDING_MISMATCH' };
  }
  const { pending, receipts } = stores(session);
  if (receipts.has(ack.seriesId)) return { duplicate: true, ack: receipts.get(ack.seriesId).ack };
  const envelope = pending.get(ack.seriesId);
  if (!envelope) return { error: 'No pending landmark series matches this ack', status: 409, reason: 'PENDING_SERIES_NOT_FOUND' };
  if (
    envelope.messageId !== ack.messageId
    || envelope.assessmentSessionId !== ack.assessmentSessionId
    || envelope.attemptId !== ack.attemptId
  ) {
    return { error: 'Landmark series ack linkage mismatch', status: 409, reason: 'ACK_LINKAGE_MISMATCH' };
  }
  pending.delete(ack.seriesId);
  receipts.set(ack.seriesId, { ack, hash: envelopeHash(envelope) });
  return { applied: true, ack };
}

function pendingMessages(connectionSessionId) {
  const session = getSession(connectionSessionId);
  if (!session) return [];
  return [...stores(session).pending.values()];
}

module.exports = {
  applyFinalized,
  acknowledge,
  pendingMessages,
};
