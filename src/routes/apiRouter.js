const { sendJson } = require('../utils/http');
const { sendStatic } = require('../utils/staticFile');
const networkController = require('../controllers/networkController');
const sessionController = require('../controllers/sessionController');
const analysisController = require('../controllers/analysisController');
const assessmentSessionController = require('../controllers/assessmentSessionController');
const careAgentProjectionController = require('../controllers/careAgentProjectionController');

async function requestHandler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, service: 'steply-web', time: Date.now() });
    }

    if (req.method === 'GET' && pathname === '/api/network-info') {
      return networkController.getNetworkInfo(req, res);
    }

    if (req.method === 'POST' && pathname === '/api/session/create') {
      return await sessionController.createSession(req, res);
    }

    if (req.method === 'POST' && pathname === '/api/assessment-sessions') {
      return await assessmentSessionController.createAssessmentSession(req, res);
    }

    const canonicalAssessmentMatch = pathname.match(/^\/api\/assessment-sessions\/([^/]+)$/);
    if (req.method === 'GET' && canonicalAssessmentMatch) {
      return assessmentSessionController.getAssessmentSession(req, res, canonicalAssessmentMatch[1]);
    }

    const assessmentSnapshotMatch = pathname.match(/^\/api\/assessment-sessions\/([^/]+)\/snapshot$/);
    if (req.method === 'PUT' && assessmentSnapshotMatch) {
      return await assessmentSessionController.putSnapshot(req, res, assessmentSnapshotMatch[1]);
    }

    const assessmentEventMatch = pathname.match(/^\/api\/assessment-sessions\/([^/]+)\/events$/);
    if (req.method === 'POST' && assessmentEventMatch) {
      return await assessmentSessionController.postEvent(req, res, assessmentEventMatch[1]);
    }

    const connectMatch = pathname.match(/^\/api\/session\/([^/]+)\/connect$/);
    if (req.method === 'POST' && connectMatch) {
      return await sessionController.connectSession(req, res, connectMatch[1]);
    }

    const cleanupMatch = pathname.match(/^\/api\/session\/([^/]+)\/cleanup$/);
    if ((req.method === 'POST' || req.method === 'DELETE') && cleanupMatch) {
      return await sessionController.cleanupSession(req, res, cleanupMatch[1]);
    }

    const statusMatch = pathname.match(/^\/api\/session\/([^/]+)\/status$/);
    if (req.method === 'GET' && statusMatch) {
      return sessionController.getSessionStatus(req, res, statusMatch[1]);
    }

    const selectMatch = pathname.match(/^\/api\/session\/([^/]+)\/select-test$/);
    if (req.method === 'POST' && selectMatch) {
      return await sessionController.selectTest(req, res, selectMatch[1]);
    }

    const assessmentSessionMatch = pathname.match(/^\/api\/session\/([^/]+)\/assessment-session$/);
    if (req.method === 'GET' && assessmentSessionMatch) {
      return sessionController.getAssessmentSession(req, res, assessmentSessionMatch[1]);
    }
    if ((req.method === 'PUT' || req.method === 'PATCH') && assessmentSessionMatch) {
      return await sessionController.updateAssessmentSession(req, res, assessmentSessionMatch[1]);
    }

    const careAgentProjectionMatch = pathname.match(/^\/api\/session\/([^/]+)\/care-agent-projection$/);
    if (req.method === 'GET' && careAgentProjectionMatch) {
      return careAgentProjectionController.getProjection(req, res, careAgentProjectionMatch[1]);
    }
    if (req.method === 'PUT' && careAgentProjectionMatch) {
      return await careAgentProjectionController.putProjection(req, res, careAgentProjectionMatch[1]);
    }

    if (req.method === 'POST' && pathname === '/api/analysis/realtime') {
      return await analysisController.realtimeAnalysis(req, res);
    }

    if (req.method === 'POST' && pathname === '/api/analysis/final') {
      return await analysisController.finalAnalysis(req, res);
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'API endpoint not found' });
    }
    return sendStatic(req, res);
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: err.message || 'Internal server error' });
  }
}

module.exports = {
  requestHandler,
};
