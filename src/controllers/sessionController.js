const { getServerBaseUrl, getCandidateServerUrls } = require('../utils/network');
const { readBodyJson, sendJson } = require('../utils/http');
const sessionService = require('../services/sessionService');

async function createSession(req, res) {
  const serverUrl = getServerBaseUrl(req);
  const data = await sessionService.createSession(serverUrl, getCandidateServerUrls(req));
  sendJson(res, 200, data);
}

async function connectSession(req, res, sessionId) {
  const body = await readBodyJson(req);
  const allowedKeys = new Set(['connectionSessionId', 'sessionId', 'pairingToken', 'dataContract', 'assessmentSession']);
  const unknownKey = Object.keys(body).find((key) => !allowedKeys.has(key));
  if (unknownKey) {
    return sendJson(res, 422, {
      error: `connect.${unknownKey} is not allowed`,
      reason: 'INVALID_STEPLY_DATA_CONTRACT',
    });
  }
  if (body.connectionSessionId && body.connectionSessionId !== sessionId) {
    return sendJson(res, 400, { error: 'connectionSessionId does not match URL.' });
  }
  if (body.sessionId && body.sessionId !== sessionId) {
    return sendJson(res, 400, { error: 'sessionId does not match URL.' });
  }
  const dataContract = body.dataContract;
  const pairingToken = body.pairingToken || req.headers['x-steply-pairing-token'] || '';
  const result = sessionService.connectProfile(
    sessionId,
    dataContract,
    pairingToken,
    body.assessmentSession || null,
  );

  if (result.error) return sendJson(res, result.status, { error: result.error, reason: result.reason });
  return sendJson(res, 200, { ok: true, session: result.session });
}

async function cleanupSession(req, res, sessionId) {
  const body = await readBodyJson(req);
  if (body.sessionId && body.sessionId !== sessionId) {
    return sendJson(res, 400, { error: 'sessionId does not match URL.' });
  }
  const pairingToken = body.pairingToken || req.headers['x-steply-pairing-token'] || '';
  const reason = body.reason || 'mobile-cleanup-request';
  const result = sessionService.cleanupSession(sessionId, pairingToken, reason);

  if (result.error) return sendJson(res, result.status, { error: result.error, reason: result.reason });
  return sendJson(res, 200, { ok: true, session: result.session });
}

async function selectTest(req, res, sessionId) {
  const body = await readBodyJson(req);
  const selectedTest = body.selectedTest || body.testType;
  const result = sessionService.selectTest(sessionId, selectedTest);

  if (result.error) return sendJson(res, result.status, { error: result.error, reason: result.reason });
  return sendJson(res, 200, { ok: true, session: result.session });
}

function getSessionStatus(req, res, sessionId) {
  const session = sessionService.getSessionStatus(sessionId);
  if (!session) return sendJson(res, 404, { error: 'Session not found' });
  return sendJson(res, 200, { session });
}

function getAssessmentSession(req, res, sessionId) {
  const session = sessionService.getSessionStatus(sessionId);
  if (!session) return sendJson(res, 404, { error: 'Session not found' });
  return sendJson(res, 200, { assessmentSession: session.assessmentSession || null });
}

async function updateAssessmentSession(req, res, sessionId) {
  const body = await readBodyJson(req);
  if (body.connectionSessionId && body.connectionSessionId !== sessionId) {
    return sendJson(res, 400, { error: 'connectionSessionId does not match URL.' });
  }
  const result = sessionService.updateAssessmentSession(sessionId, body);
  if (result.error) {
    return sendJson(res, result.status, {
      error: result.error,
      reason: result.reason,
      assessmentSession: result.assessmentSession || null,
    });
  }
  return sendJson(res, 200, {
    ok: true,
    messageId: result.messageId,
    applied: result.applied,
    reason: result.reason,
    assessmentSession: result.assessmentSession,
  });
}

module.exports = {
  createSession,
  connectSession,
  cleanupSession,
  selectTest,
  getSessionStatus,
  getAssessmentSession,
  updateAssessmentSession,
};
