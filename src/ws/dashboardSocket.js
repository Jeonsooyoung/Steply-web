const { WebSocketServer } = require('ws');

const DASHBOARD_ROLES = new Set(['dashboard', 'unknown']);
const { getSession, hasSession, getOrCreateSocketSet, removeSocket, broadcast } = require('../services/sessionStore');
const { publicSession } = require('../services/sessionPresenter');
const { cleanupSessionPersonalData } = require('../services/sessionService');

const MAX_DASHBOARD_BUFFERED_BYTES = 250_000;

function normalizeFrameDataUrl(frame, mimeType = 'image/jpeg') {
  if (typeof frame !== 'string') return '';
  const value = frame.trim();
  if (!value) return '';
  if (value.startsWith('data:')) return value;
  return `data:${mimeType || 'image/jpeg'};base64,${value}`;
}

function canMobileStream(session) {
  if (!session) return false;
  if (session.expiresAtEpochMs && session.expiresAtEpochMs <= Date.now()) return false;
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
  return !(code === 1000 && reasonText === 'Android camera stopped');
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

      if (msg.type === 'frame' && socket.role === 'mobile' && typeof msg.frame === 'string') {
        const receivedAt = Date.now();
        const mimeType = msg.mimeType || 'image/jpeg';
        const frame = normalizeFrameDataUrl(msg.frame, mimeType);
        if (!frame) return;
        socket.frameSequence = (socket.frameSequence || 0) + 1;
        broadcast(sessionId, {
          type: 'remote-camera-frame',
          frame,
          mimeType,
          byteLength: msg.byteLength || frame.length,
          sentAt: msg.sentAt || null,
          receivedAt,
          sequence: socket.frameSequence,
        });
        return;
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
