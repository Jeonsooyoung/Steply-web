const { readBodyJson, sendJson } = require('../utils/http');
const assessmentSessionService = require('../services/assessmentSessionService');
const { getSession } = require('../services/sessionStore');

function response(res, result) {
  if (result.error) {
    return sendJson(res, result.status, {
      error: result.error,
      reason: result.reason || null,
      assessmentSession: result.assessmentSession || null,
    });
  }
  return sendJson(res, 200, {
    ok: true,
    messageId: result.messageId || null,
    applied: result.applied !== false,
    reason: result.reason || null,
    assessmentSession: result.assessmentSession,
  });
}

async function createAssessmentSession(req, res) {
  const body = await readBodyJson(req);
  const connection = getSession(body.connectionSessionId);
  if (!connection) return sendJson(res, 404, { error: 'Connection session not found' });
  if (!connection.profile?.id) return sendJson(res, 409, { error: 'Profile must be connected first' });
  if (!connection.assessmentSession) {
    connection.assessmentSession = assessmentSessionService.createForConnection(connection.id, connection.profile);
  }
  return sendJson(res, 200, { ok: true, assessmentSession: connection.assessmentSession });
}

function getAssessmentSession(req, res, assessmentSessionId) {
  const session = assessmentSessionService.getAssessmentSessionById(assessmentSessionId);
  if (!session) return sendJson(res, 404, { error: 'Assessment session not found' });
  return sendJson(res, 200, { assessmentSession: session });
}

async function putSnapshot(req, res, assessmentSessionId) {
  const body = await readBodyJson(req);
  return response(res, assessmentSessionService.replaceAssessmentSessionSnapshot(assessmentSessionId, body));
}

async function postEvent(req, res, assessmentSessionId) {
  const body = await readBodyJson(req);
  return response(res, assessmentSessionService.applyAssessmentSessionEvent(assessmentSessionId, body));
}

module.exports = {
  createAssessmentSession,
  getAssessmentSession,
  putSnapshot,
  postEvent,
};

