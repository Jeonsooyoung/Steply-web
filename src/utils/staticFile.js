const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('../config/env');
const MIME = require('../config/mimeTypes');
const { sendText } = require('./http');

function sendStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  let filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendText(res, 403, 'Forbidden');

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const spaFallback = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(spaFallback)) filePath = spaFallback;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) return sendText(res, 404, 'Not found');

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(data);
  });
}

module.exports = {
  sendStatic,
};
