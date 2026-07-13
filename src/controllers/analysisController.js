const { readBodyJson, sendJson } = require('../utils/http');
const analysisService = require('../services/analysisService');

async function realtimeAnalysis(req, res) {
  const body = await readBodyJson(req);
  const result = analysisService.saveRealtimeResult(body);

  if (result.error) return sendJson(res, result.status, { error: result.error, reason: result.reason });
  return sendJson(res, 200, { ok: true });
}

async function finalAnalysis(req, res) {
  const body = await readBodyJson(req);
  const result = analysisService.saveFinalResult(body);

  if (result.error) return sendJson(res, result.status, { error: result.error, reason: result.reason });
  return sendJson(res, 200, {
    ok: true,
    result: result.result,
    assessmentSession: result.assessmentSession || null,
    duplicate: Boolean(result.duplicate),
    invalidAttempt: Boolean(result.invalidAttempt),
    excludeFromTrends: Boolean(result.excludeFromTrends),
    resultKey: result.resultKey || null,
    aggregateComplete: Boolean(result.aggregateComplete),
  });
}

module.exports = {
  realtimeAnalysis,
  finalAnalysis,
};
