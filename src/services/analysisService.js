const { getSession, broadcast } = require('./sessionStore');
const { publicSession } = require('./sessionPresenter');
const {
  AssessmentResultTypes,
  saveAssessmentResult,
} = require('./assessmentResultPersistence');

function saveRealtimeResult(payload) {
  const session = getSession(payload.sessionId);
  if (!session) return { error: 'Session not found', status: 404 };

  const result = {
    ...payload,
    resultType: payload.resultType || AssessmentResultTypes.Frame,
    receivedAt: Date.now(),
  };

  session.latestResult = result;
  broadcast(payload.sessionId, {
    type: 'realtime',
    result,
    session: publicSession(session),
  });

  return { result };
}

function saveFinalResult(payload) {
  const session = getSession(payload.sessionId);
  if (!session) return { error: 'Session not found', status: 404 };

  return saveAssessmentResult(payload, {
    session,
    broadcast,
    publicSession,
  });
}

module.exports = {
  saveRealtimeResult,
  saveFinalResult,
};
