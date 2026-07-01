const http = require('http');
const { PORT } = require('./src/config/env');
const { getLocalIps } = require('./src/utils/network');
const { ensureDataFiles } = require('./src/repositories/historyRepository');
const { requestHandler } = require('./src/routes/apiRouter');
const { attachDashboardWebSocket } = require('./src/ws/dashboardSocket');

function startServer() {
  ensureDataFiles();

  const server = http.createServer(requestHandler);
  attachDashboardWebSocket(server);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\nSteply-Web dashboard running on http://localhost:${PORT}`);
    for (const ip of getLocalIps()) {
      console.log(`Dashboard: http://${ip}:${PORT}/`);
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
