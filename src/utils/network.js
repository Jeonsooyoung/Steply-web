const os = require('os');
const { PORT, CLIENT_PORT } = require('../config/env');

const VIRTUAL_INTERFACE_PATTERN = /virtual|vmware|virtualbox|vbox|hyper-v|vethernet|docker|wsl|loopback|npcap|bluetooth|tailscale|zerotier/i;
const WIFI_INTERFACE_PATTERN = /wi-?fi|wireless|wlan|\uBB34\uC120/i;
const ETHERNET_INTERFACE_PATTERN = /ethernet|\uC774\uB354\uB137|lan/i;

// Common host-only / VM / Docker ranges that should not be put in the QR payload.
// The actual phone must connect to the PC's real Wi-Fi/LAN address, not these adapters.
const HOST_ONLY_PREFIXES = [
  '192.168.56.', // VirtualBox Host-Only default
  '192.168.99.', // Docker Toolbox / VM default
  '172.17.',     // Docker bridge default
  '172.18.',
  '172.19.',
  '169.254.',    // link-local
];

function isPrivateIpv4(address) {
  if (!address) return false;
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function isLikelyHostOnlyAddress(address) {
  return HOST_ONLY_PREFIXES.some((prefix) => address.startsWith(prefix));
}

function getLocalInterfaces() {
  const nets = os.networkInterfaces();
  const interfaces = [];

  for (const [name, net] of Object.entries(nets)) {
    for (const item of net || []) {
      if (item.family !== 'IPv4' || item.internal) continue;

      const address = item.address;
      const lowerName = String(name || '').toLowerCase();
      const isVirtual = VIRTUAL_INTERFACE_PATTERN.test(lowerName) || isLikelyHostOnlyAddress(address);
      const isWifi = WIFI_INTERFACE_PATTERN.test(lowerName);
      const isEthernet = ETHERNET_INTERFACE_PATTERN.test(lowerName);
      const isPrivate = isPrivateIpv4(address);
      const isLinkLocal = address.startsWith('169.254.');

      let priority = 100;
      if (!isVirtual && isPrivate && isWifi) priority = 0;
      else if (!isVirtual && isPrivate && isEthernet) priority = 1;
      else if (!isVirtual && isPrivate) priority = 2;
      else if (!isVirtual && !isLinkLocal) priority = 3;
      else priority = 9;

      interfaces.push({
        name,
        address,
        cidr: item.cidr || null,
        isPrivate,
        isVirtual,
        isWifi,
        isEthernet,
        priority,
      });
    }
  }

  return interfaces.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    return `${a.name}-${a.address}`.localeCompare(`${b.name}-${b.address}`);
  });
}

function getLocalIps() {
  return getLocalInterfaces().map((item) => item.address);
}

function getPreferredLocalIp() {
  const forcedHost = process.env.STEPLY_HOST;
  if (forcedHost) return forcedHost.replace(/^https?:\/\//, '').replace(/:\d+$/, '');

  const usable = getLocalInterfaces().find((item) => !item.isVirtual && !item.address.startsWith('169.254.'));
  if (usable) return usable.address;

  const fallback = getLocalInterfaces()[0];
  return fallback ? fallback.address : null;
}

function getPublicProtocol() {
  if (process.env.STEPLY_SERVER_URL) {
    try {
      const parsed = new URL(process.env.STEPLY_SERVER_URL);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.protocol.replace(':', '');
      }
    } catch (_) {
      // Fall through to the explicit/default protocol below.
    }
  }

  if (process.env.STEPLY_SERVER_PROTOCOL === 'http' || process.env.STEPLY_SERVER_PROTOCOL === 'https') {
    return process.env.STEPLY_SERVER_PROTOCOL;
  }

  return process.env.STEPLY_INSECURE_HTTP === '1' ? 'http' : 'https';
}

function getServerBaseUrl(req) {
  if (process.env.STEPLY_SERVER_URL) return process.env.STEPLY_SERVER_URL.replace(/\/$/, '');

  const host = req.headers.host || `localhost:${PORT}`;
  const preferredIp = getPreferredLocalIp();
  const protocol = getPublicProtocol();

  if (preferredIp && (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('0.0.0.0'))) {
    return `${protocol}://${preferredIp}:${PORT}`;
  }

  return `${protocol}://${host}`;
}


function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function replacePort(baseUrl, port) {
  const value = normalizeBaseUrl(baseUrl);
  try {
    const parsed = new URL(value);
    parsed.port = String(port);
    return parsed.toString().replace(/\/$/, '');
  } catch (err) {
    return value.replace(/:\d+$/, `:${port}`);
  }
}

function uniqueUrls(urls) {
  return [...new Set(urls.map(normalizeBaseUrl).filter(Boolean))];
}

function getCandidateServerUrls(req) {
  const primary = getServerBaseUrl(req);
  const urls = [primary];
  const protocol = getPublicProtocol();
  const includeClientPort = CLIENT_PORT &&
    CLIENT_PORT !== PORT &&
    (protocol === 'http' || process.env.STEPLY_INCLUDE_CLIENT_PORT === '1');

  // Only include the Vite port when it is actually serving a compatible protocol.
  // In the secure mobile flow, phones connect directly to the HTTPS/WSS Node server.
  if (includeClientPort) {
    urls.push(replacePort(primary, CLIENT_PORT));
  }

  for (const ip of getLocalIps()) {
    urls.push(`${protocol}://${ip}:${PORT}`);
    if (includeClientPort) urls.push(`${protocol}://${ip}:${CLIENT_PORT}`);
  }

  return uniqueUrls(urls);
}

module.exports = {
  getLocalIps,
  getLocalInterfaces,
  getPreferredLocalIp,
  getPublicProtocol,
  getServerBaseUrl,
  getCandidateServerUrls,
};
