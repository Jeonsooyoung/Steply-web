const { readBodyJson, sendJson } = require('../utils/http');
const careAgentProjectionService = require('../services/careAgentProjectionService');

function getProjection(req, res, connectionSessionId) {
  const result = careAgentProjectionService.getProjection(connectionSessionId);
  if (result.error) return sendJson(res, result.status, result);
  return sendJson(res, 200, { projection: result.projection });
}

async function putProjection(req, res, connectionSessionId) {
  const body = await readBodyJson(req);
  const result = careAgentProjectionService.applyProjectionUpdate(connectionSessionId, body);
  if (result.error) {
    return sendJson(res, result.status, {
      error: result.error,
      reason: result.reason || null,
      projection: result.projection || null,
    });
  }
  return sendJson(res, 200, {
    ok: true,
    messageId: result.messageId,
    applied: result.applied,
    reason: result.reason,
    projection: result.projection,
  });
}

module.exports = { getProjection, putProjection };
