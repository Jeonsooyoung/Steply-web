const http = require('http');
const https = require('https');
const { PORT } = require('./src/config/env');
const { getLocalIps, getPreferredLocalIp } = require('./src/utils/network');
const { ensureTlsCertificate } = require('./src/utils/devTls');
const { requestHandler } = require('./src/routes/apiRouter');
const { attachDashboardWebSocket } = require('./src/ws/dashboardSocket');
const { cleanupAllSessionPersonalData } = require('./src/services/sessionService');

function shouldUseHttps() {
  return process.env.STEPLY_INSECURE_HTTP !== '1';
}

function startServer() {
  const secure = shouldUseHttps();
  let tls = null;
  if (secure) {
    tls = ensureTlsCertificate([getPreferredLocalIp()].filter(Boolean));
    process.env.STEPLY_SERVER_PROTOCOL = 'https';
    process.env.STEPLY_TLS_CERT_SHA256 = tls.certSha256;
  } else {
    process.env.STEPLY_SERVER_PROTOCOL = 'http';
    delete process.env.STEPLY_TLS_CERT_SHA256;
  }

  const server = secure
    ? https.createServer({ key: tls.key, cert: tls.cert }, requestHandler)
    : http.createServer(requestHandler);
  attachDashboardWebSocket(server);

  if (require.main === module) {
    let terminating = false;
    const terminate = (signal) => {
      if (terminating) return;
      terminating = true;
      cleanupAllSessionPersonalData(`pc-${signal.toLowerCase()}`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1_000).unref();
    };
    process.once('SIGINT', () => terminate('SIGINT'));
    process.once('SIGTERM', () => terminate('SIGTERM'));
  }

  server.listen(PORT, '0.0.0.0', () => {
    const protocol = secure ? 'https' : 'http';
    console.log(`\nSteply-Web dashboard running on ${protocol}://localhost:${PORT}`);
    for (const ip of getLocalIps()) {
      console.log(`Dashboard: ${protocol}://${ip}:${PORT}/`);
    }
    if (tls?.certSha256) {
      console.log(`TLS certificate SHA-256: ${tls.certSha256}`);
    }
    console.log('\nUse the IP address above from the mobile app on the same Wi-Fi network.\n');
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer,
};
