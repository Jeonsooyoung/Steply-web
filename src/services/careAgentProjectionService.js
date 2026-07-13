const {
  CARE_AGENT_STATE_SCHEMA_VERSION,
  normalizeCareAgentUpdate,
} = require('../../shared/stage4CareAgentContract.cjs');
const { getSession, broadcast } = require('./sessionStore');

function messageIds(session) {
  if (!session.careAgentProjectionMessageIds) session.careAgentProjectionMessageIds = new Set();
  return session.careAgentProjectionMessageIds;
}

function publicProjection(session) {
  return session?.careAgentProjection || null;
}

function getProjection(connectionSessionId) {
  const session = getSession(connectionSessionId);
  if (!session) return { error: 'Connection session not found', status: 404 };
  return { projection: publicProjection(session) };
}

function applyProjectionUpdate(connectionSessionId, envelope, { publish = true } = {}) {
  const session = getSession(connectionSessionId);
  if (!session) return { error: 'Connection session not found', status: 404 };
  if (!session.profile?.id) return { error: 'Profile must be connected first', status: 409, reason: 'PROFILE_NOT_CONNECTED' };

  let update;
  try {
    update = normalizeCareAgentUpdate(envelope);
  } catch (error) {
    return { error: error.message, status: 422, reason: error.code || 'INVALID_CARE_AGENT_UPDATE' };
  }

  if (update.profileId !== String(session.profile.id)) {
    return { error: 'Care agent profile does not match the connected profile', status: 403, reason: 'PROFILE_BINDING_MISMATCH' };
  }

  const processed = messageIds(session);
  if (processed.has(update.messageId)) {
    return {
      projection: publicProjection(session),
      applied: false,
      reason: 'DUPLICATE_MESSAGE',
      messageId: update.messageId,
    };
  }

  const currentStateVersion = session.careAgentProjection?.stateVersion || 0;
  if (update.baseStateVersion !== currentStateVersion) {
    return {
      error: 'Care agent projection state version conflict',
      status: 409,
      reason: 'REVISION_CONFLICT',
      projection: publicProjection(session),
    };
  }

  session.careAgentProjection = update.projection;
  processed.add(update.messageId);
  if (publish) broadcast(connectionSessionId, update);
  return {
    projection: update.projection,
    applied: true,
    reason: 'PROJECTION_UPDATED',
    messageId: update.messageId,
    update,
  };
}

function resumeProjection(connectionSessionId, message = {}) {
  const session = getSession(connectionSessionId);
  if (!session) return { error: 'Connection session not found', status: 404 };
  if (!session.profile?.id) return { error: 'Profile must be connected first', status: 409, reason: 'PROFILE_NOT_CONNECTED' };
  if (message.schemaVersion !== CARE_AGENT_STATE_SCHEMA_VERSION || !message.messageId || !message.profileId) {
    return { error: 'Invalid care agent resume message', status: 422, reason: 'INVALID_CARE_AGENT_RESUME' };
  }
  if (String(message.profileId) !== String(session.profile.id)) {
    return { error: 'Care agent profile does not match the connected profile', status: 403, reason: 'PROFILE_BINDING_MISMATCH' };
  }
  const projection = publicProjection(session);
  const knownStateVersion = Number(message.knownStateVersion);
  return {
    action: projection && (!Number.isInteger(knownStateVersion) || knownStateVersion !== projection.stateVersion) ? 'SEND_PROJECTION' : 'ACK',
    projection,
    stateVersion: projection?.stateVersion || 0,
  };
}

module.exports = {
  applyProjectionUpdate,
  getProjection,
  publicProjection,
  resumeProjection,
};
