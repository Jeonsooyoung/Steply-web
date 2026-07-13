const { WebSocketServer } = require('ws');

const DASHBOARD_ROLES = new Set(['dashboard', 'unknown']);
const { getSession, hasSession, getOrCreateSocketSet, removeSocket, broadcast } = require('../services/sessionStore');
const { publicSession } = require('../services/sessionPresenter');
const { cleanupSessionPersonalData } = require('../services/sessionService');
const { resumeAssessmentSession } = require('../services/assessmentSessionService');
const { ASSESSMENT_SESSION_SCHEMA_VERSION } = require('../../shared/stage1Assessment.cjs');
const { CARE_AGENT_STATE_SCHEMA_VERSION } = require('../../shared/stage4CareAgentContract.cjs');
const {
  applyProjectionUpdate,
  resumeProjection,
} = require('../services/careAgentProjectionService');
const {
  applyFinalized: applyLandmarkSeriesFinalized,
  acknowledge: acknowledgeLandmarkSeries,
  pendingMessages: pendingLandmarkSeriesMessages,
} = require('../services/landmarkSeriesRelayService');

const MAX_DASHBOARD_BUFFERED_BYTES = 250_000;

function canMobileStream(session) {
  if (!session) return false;
  // Pairing expiry protects the one-time profile connection. Once that token has
  // been consumed, the assessment session may legitimately outlive the QR TTL.
  return Boolean(session.connectedAt && session.pairingTokenConsumedAt);
}

function closeReasonText(reason) {
  if (!reason) return '';
  if (Buffer.isBuffer(reason)) return reason.toString('utf8');
  return String(reason);
}

function shouldCleanupMobileSessionOnClose(socket, code, reason) {
  if (socket.role !== 'mobile') return false;
  if (socket.keepSessionOnClose) return false;

  const reasonText = closeReasonText(reason);
  // A transport close is not the same as ending the user's session. Mobile
  // browsers and apps routinely reconnect when the screen or network changes.
  // Personal data is cleared only by the explicit cleanup endpoint.
  return code === 1000 && reasonText === 'mobile-session-ended';
}

function sendToRole(sessionId, role, payload) {
  const sockets = getOrCreateSocketSet(sessionId);
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  for (const peer of sockets) {
    if (peer.readyState !== peer.OPEN) continue;
    if (peer.role !== role) continue;
    peer.send(serialized);
  }
}

function attachDashboardWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');
    const role = url.searchParams.get('role') || 'unknown';

    if (!sessionId || !hasSession(sessionId)) {
      socket.send(JSON.stringify({ type: 'error', error: 'Unknown sessionId' }));
      socket.close();
      return;
    }

    const session = getSession(sessionId);
    if (role === 'mobile' && !canMobileStream(session)) {
      socket.send(JSON.stringify({
        type: 'error',
        error: 'Mobile camera WebSocket requires a completed QR profile connection.',
      }));
      socket.close();
      return;
    }

    socket.sessionId = sessionId;
    socket.role = role;
    getOrCreateSocketSet(sessionId).add(socket);

    socket.send(JSON.stringify({ type: 'session', session: publicSession(session) }));
    if (role === 'mobile') {
      for (const pending of pendingLandmarkSeriesMessages(sessionId)) socket.send(JSON.stringify(pending));
    }
    broadcast(sessionId, {
      type: 'remote-camera-status',
      role,
      status: role === 'mobile' ? 'mobile-connected' : 'dashboard-connected',
      message: role === 'mobile' ? 'Phone camera connected to the web session.' : 'Dashboard connected.',
      at: Date.now(),
    });

    socket.on('message', (raw, isBinary) => {
      if (isBinary) {
        if (socket.role !== 'mobile') return;
        if (!canMobileStream(getSession(sessionId))) {
          socket.close(1000, 'Session personal data was cleared');
          return;
        }
        const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        const mobileFrameMeta = socket.pendingMobileFrameMeta || {};
        socket.pendingMobileFrameMeta = null;
        const receivedAt = Date.now();
        socket.frameSequence = (socket.frameSequence || 0) + 1;
        const metadata = {
          type: 'remote-camera-frame-meta',
          mimeType: 'image/jpeg',
          byteLength: buffer.length,
          receivedAt,
          sequence: socket.frameSequence,
          mobileSequence: mobileFrameMeta.mobileSequence || null,
          mobileSentAt: mobileFrameMeta.sentAtEpochMs || null,
          capturedAtUptimeMs: mobileFrameMeta.capturedAtUptimeMs || null,
        };

        // Send metadata as JSON, then the JPEG as a binary WebSocket message.
        // This avoids huge base64 data URLs in JSON and keeps the dashboard updating
        // as a real stream instead of rendering a stale/broken image.
        const sockets = getOrCreateSocketSet(sessionId);
        const metadataPayload = JSON.stringify(metadata);
        for (const peer of sockets) {
          if (peer.readyState !== peer.OPEN) continue;
          if (!DASHBOARD_ROLES.has(peer.role)) continue;
          if (peer.bufferedAmount > MAX_DASHBOARD_BUFFERED_BYTES) continue;
          peer.send(metadataPayload);
          peer.send(buffer, { binary: true });
        }
        return;
      }

      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (_) {
        return;
      }

      if (msg.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', at: Date.now() }));
      }

      if (msg.type === 'assessment-session.resume' && socket.role === 'mobile') {
        const resumed = resumeAssessmentSession(getSession(sessionId), msg);
        const assessmentSession = resumed.assessmentSession;
        if (!assessmentSession) {
          socket.send(JSON.stringify({
            type: 'assessment-session.ack',
            schemaVersion: ASSESSMENT_SESSION_SCHEMA_VERSION,
            messageId: msg.messageId,
            assessmentSessionId: msg.assessmentSessionId,
            revision: 0,
          }));
          return;
        }
        if (resumed.action === 'ACK' || resumed.action === 'UPDATED_FROM_MOBILE') {
          socket.send(JSON.stringify({
            type: 'assessment-session.ack',
            schemaVersion: ASSESSMENT_SESSION_SCHEMA_VERSION,
            messageId: msg.messageId,
            assessmentSessionId: assessmentSession.assessmentSessionId,
            revision: assessmentSession.revision,
          }));
          return;
        }
        socket.send(JSON.stringify({
          type: 'assessment-session.updated',
          schemaVersion: ASSESSMENT_SESSION_SCHEMA_VERSION,
          messageId: msg.messageId,
          assessmentSessionId: assessmentSession.assessmentSessionId,
          baseRevision: Number.isInteger(Number(msg.knownRevision)) ? Number(msg.knownRevision) : 0,
          revision: assessmentSession.revision,
          session: assessmentSession,
        }));
        return;
      }

      if (msg.type === 'assessment-session.ack') return;

      if (msg.type === 'care-agent.resume' && socket.role === 'mobile') {
        const resumed = resumeProjection(sessionId, msg);
        if (resumed.error) {
          socket.send(JSON.stringify({ type: 'care-agent.error', reason: resumed.reason, error: resumed.error }));
          return;
        }
        if (resumed.action === 'SEND_PROJECTION') {
          socket.send(JSON.stringify({
            type: 'care-agent.projection',
            schemaVersion: CARE_AGENT_STATE_SCHEMA_VERSION,
            messageId: msg.messageId,
            profileId: msg.profileId,
            stateVersion: resumed.stateVersion,
            projection: resumed.projection,
          }));
          return;
        }
        socket.send(JSON.stringify({
          type: 'care-agent.ack',
          schemaVersion: CARE_AGENT_STATE_SCHEMA_VERSION,
          messageId: msg.messageId,
          profileId: msg.profileId,
          stateVersion: resumed.stateVersion,
        }));
        return;
      }

      if (msg.type === 'care-agent.updated' && socket.role === 'mobile') {
        const result = applyProjectionUpdate(sessionId, msg, { publish: false });
        if (result.error) {
          socket.send(JSON.stringify({
            type: 'care-agent.error',
            schemaVersion: CARE_AGENT_STATE_SCHEMA_VERSION,
            messageId: msg.messageId || null,
            reason: result.reason,
            error: result.error,
            projection: result.projection || null,
          }));
          return;
        }
        if (result.applied) sendToRole(sessionId, 'dashboard', result.update);
        socket.send(JSON.stringify({
          type: 'care-agent.ack',
          schemaVersion: CARE_AGENT_STATE_SCHEMA_VERSION,
          messageId: result.messageId,
          profileId: msg.profileId,
          stateVersion: result.projection.stateVersion,
        }));
        return;
      }

      if (msg.type === 'care-agent.ack') return;

      if (msg.type === 'landmark-series.finalized' && DASHBOARD_ROLES.has(socket.role)) {
        const result = applyLandmarkSeriesFinalized(sessionId, msg);
        if (result.error) {
          socket.send(JSON.stringify({
            type: 'landmark-series.error',
            messageId: msg.messageId || null,
            reason: result.reason,
            error: result.error,
          }));
          return;
        }
        if (result.ack) {
          socket.send(JSON.stringify(result.ack));
          return;
        }
        const pending = result.pending || result.envelope;
        if (pending) sendToRole(sessionId, 'mobile', pending);
        return;
      }

      if (msg.type === 'landmark-series.ack' && socket.role === 'mobile') {
        const result = acknowledgeLandmarkSeries(sessionId, msg);
        if (result.error) {
          socket.send(JSON.stringify({
            type: 'landmark-series.error',
            messageId: msg.messageId || null,
            reason: result.reason,
            error: result.error,
          }));
          return;
        }
        sendToRole(sessionId, 'dashboard', result.ack);
        return;
      }

      if (msg.type === 'camera-frame-meta' && socket.role === 'mobile') {
        socket.pendingMobileFrameMeta = {
          mobileSequence: Number.isFinite(Number(msg.mobileSequence)) ? Number(msg.mobileSequence) : null,
          capturedAtUptimeMs: Number.isFinite(Number(msg.capturedAtUptimeMs)) ? Number(msg.capturedAtUptimeMs) : null,
          sentAtEpochMs: Number.isFinite(Number(msg.sentAtEpochMs)) ? Number(msg.sentAtEpochMs) : null,
          byteLength: Number.isFinite(Number(msg.byteLength)) ? Number(msg.byteLength) : null,
        };
        return;
      }

      if (msg.type === 'remote-camera-frame-ack' && DASHBOARD_ROLES.has(socket.role)) {
        sendToRole(sessionId, 'mobile', {
          type: 'remote-camera-frame-ack',
          sequence: msg.sequence || null,
          mobileSequence: msg.mobileSequence || null,
          source: msg.source || 'pose-frame',
          receivedAt: msg.receivedAt || null,
          analyzedAt: msg.analyzedAt || Date.now(),
          at: Date.now(),
        });
        return;
      }

      if (msg.type === 'hello' && socket.role === 'mobile') {
        broadcast(sessionId, {
          type: 'remote-camera-status',
          role: 'mobile',
          status: 'stream-ready',
          message: 'Phone camera stream is ready.',
          at: Date.now(),
        });
      }

      if (msg.type === 'stopped' && socket.role === 'mobile') {
        socket.keepSessionOnClose = true;
        broadcast(sessionId, {
          type: 'remote-camera-status',
          role: 'mobile',
          status: 'stream-stopped',
          message: 'Phone camera stream stopped.',
          at: Date.now(),
        });
      }
    });

    socket.on('close', (code, reason) => {
      removeSocket(sessionId, socket);
      if (role === 'mobile') {
        if (shouldCleanupMobileSessionOnClose(socket, code, reason)) {
          cleanupSessionPersonalData(sessionId, 'mobile-websocket-closed');
        }
        broadcast(sessionId, {
          type: 'remote-camera-status',
          role: 'mobile',
          status: 'mobile-disconnected',
          message: 'Phone camera connection closed.',
          at: Date.now(),
        });
      }
    });
  });

  return wss;
}

module.exports = {
  attachDashboardWebSocket,
};
