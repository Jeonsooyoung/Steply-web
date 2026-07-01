const crypto = require('crypto');
const { getSession, broadcast } = require('./sessionStore');
const { publicSession } = require('./sessionPresenter');
const { addHistoryItem } = require('../repositories/historyRepository');

function saveRealtimeResult(payload) {
  const session = getSession(payload.sessionId);
  if (!session) return { error: 'Session not found', status: 404 };

  const result = {
    ...payload,
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

  const finalResult = {
    ...payload,
    id: crypto.randomBytes(6).toString('hex'),
    receivedAt: Date.now(),
    profile: session.profile || null,
    selectedTest: session.selectedTest || payload.testType || null,
  };

  session.finalResult = finalResult;
  addHistoryItem(finalResult);

  broadcast(payload.sessionId, {
    type: 'final',
    result: finalResult,
    session: publicSession(session),
  });

  return { result: finalResult };
}

module.exports = {
  saveRealtimeResult,
  saveFinalResult,
};
