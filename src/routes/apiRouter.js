const { sendJson } = require('../utils/http');
const { sendStatic } = require('../utils/staticFile');
const networkController = require('../controllers/networkController');
const sessionController = require('../controllers/sessionController');
const analysisController = require('../controllers/analysisController');
const historyController = require('../controllers/historyController');

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

    const connectMatch = pathname.match(/^\/api\/session\/([^/]+)\/connect$/);
    if (req.method === 'POST' && connectMatch) {
      return await sessionController.connectSession(req, res, connectMatch[1]);
    }

    const statusMatch = pathname.match(/^\/api\/session\/([^/]+)\/status$/);
    if (req.method === 'GET' && statusMatch) {
      return sessionController.getSessionStatus(req, res, statusMatch[1]);
    }

    const selectMatch = pathname.match(/^\/api\/session\/([^/]+)\/select-test$/);
    if (req.method === 'POST' && selectMatch) {
      return await sessionController.selectTest(req, res, selectMatch[1]);
    }

    if (req.method === 'POST' && pathname === '/api/analysis/realtime') {
      return await analysisController.realtimeAnalysis(req, res);
    }

    if (req.method === 'POST' && pathname === '/api/analysis/final') {
      return await analysisController.finalAnalysis(req, res);
    }

    if (req.method === 'GET' && pathname === '/api/history') {
      return historyController.getAllHistory(req, res);
    }

    const historyMatch = pathname.match(/^\/api\/history\/([^/]+)$/);
    if (req.method === 'GET' && historyMatch) {
      return historyController.getHistoryByUser(req, res, decodeURIComponent(historyMatch[1]));
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
