const sessions = new Map();
const socketsBySession = new Map();

function saveSession(session) {
  sessions.set(session.id, session);
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId);
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

module.exports = {
  saveSession,
  getSession,
  hasSession,
  getOrCreateSocketSet,
  removeSocket,
  broadcast,
};
