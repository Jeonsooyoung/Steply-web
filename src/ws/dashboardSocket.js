const { WebSocketServer } = require('ws');

const DASHBOARD_ROLES = new Set(['dashboard', 'unknown']);
const { getSession, hasSession, getOrCreateSocketSet, removeSocket, broadcast } = require('../services/sessionStore');
const { publicSession } = require('../services/sessionPresenter');

function normalizeFrameDataUrl(frame, mimeType = 'image/jpeg') {
  if (typeof frame !== 'string') return '';
  const value = frame.trim();
  if (!value) return '';
  if (value.startsWith('data:')) return value;
  return `data:${mimeType || 'image/jpeg'};base64,${value}`;
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

    socket.sessionId = sessionId;
    socket.role = role;
    getOrCreateSocketSet(sessionId).add(socket);

    socket.send(JSON.stringify({ type: 'session', session: publicSession(getSession(sessionId)) }));
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
        const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        const receivedAt = Date.now();
        socket.frameSequence = (socket.frameSequence || 0) + 1;
        const metadata = {
          type: 'remote-camera-frame-meta',
          mimeType: 'image/jpeg',
          byteLength: buffer.length,
          receivedAt,
          sequence: socket.frameSequence,
        };

        // Send metadata as JSON, then the JPEG as a binary WebSocket message.
        // This avoids huge base64 data URLs in JSON and keeps the dashboard updating
        // as a real stream instead of rendering a stale/broken image.
        const sockets = getOrCreateSocketSet(sessionId);
        const metadataPayload = JSON.stringify(metadata);
        for (const peer of sockets) {
          if (peer.readyState !== peer.OPEN) continue;
          if (!DASHBOARD_ROLES.has(peer.role)) continue;
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
        broadcast(sessionId, {
          type: 'remote-camera-status',
          role: 'mobile',
          status: 'stream-stopped',
          message: 'Phone camera stream stopped.',
          at: Date.now(),
        });
      }
    });

    socket.on('close', () => {
      removeSocket(sessionId, socket);
      if (role === 'mobile') {
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
