const { PORT } = require('../config/env');
const { getLocalIps, getLocalInterfaces, getServerBaseUrl, getPreferredLocalIp, getCandidateServerUrls } = require('../utils/network');
const { sendJson } = require('../utils/http');

function getNetworkInfo(req, res) {
  const serverUrl = getServerBaseUrl(req);
  sendJson(res, 200, {
    port: PORT,
    localIps: getLocalIps(),
    localInterfaces: getLocalInterfaces(),
    preferredIp: getPreferredLocalIp(),
    serverUrl,
    candidateServerUrls: getCandidateServerUrls(req),
    dashboardUrl: `${serverUrl}/`,
  });
}

module.exports = {
  getNetworkInfo,
};
