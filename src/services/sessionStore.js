const sessions = new Map();
const socketsBySession = new Map();

function saveSession(session) {
  sessions.set(session.id, session);
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function listSessions() {
  return [...sessions.values()];
}

function hasSession(sessionId) {
  return sessions.has(sessionId);
}

function getOrCreateSocketSet(sessionId) {
  if (!socketsBySession.has(sessionId)) socketsBySession.set(sessionId, new Set());
  return socketsBySession.get(sessionId);
}

function removeSocket(sessionId, socket) {
  const sockets = socketsBySession.get(sessionId);
  if (sockets) sockets.delete(socket);
}

function broadcast(sessionId, message) {
  const sockets = socketsBySession.get(sessionId);
  if (!sockets) return;

  const payload = JSON.stringify(message);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

function clearSessionPersonalData(sessionId, reason = 'session-cleanup') {
  const session = sessions.get(sessionId);
  if (!session) return null;

  session.profile = null;
  session.dataContract = null;
  session.connectedAt = null;
  session.selectedTest = null;
  session.latestResult = null;
  session.finalResult = null;
  session.assessmentSession = null;
  session.assessmentSessionMessageIds = new Set();
  session.assessmentResultKeys = new Map();
  session.careAgentProjection = null;
  session.careAgentProjectionMessageIds = new Set();
  session.pendingLandmarkSeriesById = new Map();
  session.landmarkSeriesMessageIds = new Map();
  session.landmarkSeriesAttemptIds = new Map();
  session.landmarkSeriesAckReceipts = new Map();
  const sockets = socketsBySession.get(sessionId);
  if (sockets) {
    for (const socket of sockets) {
      socket.pendingMobileFrameMeta = null;
      socket.frameSequence = 0;
    }
  }
  session.cleanedAt = Date.now();
  session.cleanupReason = reason;
  return session;
}

module.exports = {
  saveSession,
  getSession,
  listSessions,
  hasSession,
  getOrCreateSocketSet,
  removeSocket,
  broadcast,
  clearSessionPersonalData,
};
