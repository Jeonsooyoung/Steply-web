const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT_DIR } = require('../config/env');

const TLS_DIR = path.join(ROOT_DIR, '.steply', 'tls');
const KEY_PATH = path.join(TLS_DIR, 'steply-local.key.pem');
const CERT_PATH = path.join(TLS_DIR, 'steply-local.cert.pem');
const CONFIG_PATH = path.join(TLS_DIR, 'openssl.cnf');
const META_PATH = path.join(TLS_DIR, 'metadata.json');
const CERT_DAYS = Number(process.env.STEPLY_TLS_CERT_DAYS || 30);

function getOpenSslCommand() {
  if (process.env.OPENSSL_BIN) return process.env.OPENSSL_BIN;

  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'usr', 'bin', 'openssl.exe'),
      path.join(process.env.ProgramW6432 || 'C:\\Program Files', 'Git', 'usr', 'bin', 'openssl.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'usr', 'bin', 'openssl.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'OpenSSL-Win64', 'bin', 'openssl.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'OpenSSL-Win32', 'bin', 'openssl.exe'),
    ];

    const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (found) return found;
  }

  return 'openssl';
}

function stripIpv6Brackets(value) {
  return String(value || '').replace(/^\[/, '').replace(/\]$/, '');
}

function hostnameFromUrl(value) {
  if (!value) return null;
  try {
    return stripIpv6Brackets(new URL(value).hostname);
  } catch (_) {
    return null;
  }
}

function splitHost(value) {
  const trimmed = stripIpv6Brackets(String(value || '').trim());
  if (!trimmed) return null;
  if (trimmed.includes('://')) return hostnameFromUrl(trimmed);
  if (trimmed.includes(':') && !trimmed.includes('::')) return trimmed.split(':')[0];
  return trimmed;
}

function isIpAddress(value) {
  return Boolean(value && (value.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(value)));
}

function collectCertificateHosts(extraHosts = []) {
  const hosts = new Set(['localhost', '127.0.0.1', '::1']);

  for (const values of Object.values(os.networkInterfaces())) {
    for (const item of values || []) {
      if ((item.family === 'IPv4' || item.family === 'IPv6') && !item.internal) {
        hosts.add(stripIpv6Brackets(item.address));
      }
    }
  }

  for (const value of [
    process.env.STEPLY_HOST,
    hostnameFromUrl(process.env.STEPLY_SERVER_URL),
    ...extraHosts,
  ]) {
    const host = splitHost(value);
    if (host) hosts.add(host);
  }

  const sortedHosts = [...hosts].sort();
  return {
    dnsNames: sortedHosts.filter((host) => !isIpAddress(host)),
    ipAddresses: sortedHosts.filter(isIpAddress),
  };
}

function opensslConfig({ dnsNames, ipAddresses }) {
  const lines = [
    '[req]',
    'distinguished_name=dn',
    'x509_extensions=v3_req',
    'prompt=no',
    '',
    '[dn]',
    'CN=Steply Local',
    '',
    '[v3_req]',
    'subjectAltName=@alt_names',
    'basicConstraints=CA:FALSE',
    'keyUsage=digitalSignature,keyEncipherment',
    'extendedKeyUsage=serverAuth',
    '',
    '[alt_names]',
  ];

  dnsNames.forEach((name, index) => lines.push(`DNS.${index + 1}=${name}`));
  ipAddresses.forEach((address, index) => lines.push(`IP.${index + 1}=${address}`));
  return `${lines.join('\n')}\n`;
}

function certificateSha256(certPem) {
  const cert = new crypto.X509Certificate(certPem);
  return crypto.createHash('sha256').update(cert.raw).digest('hex');
}

function readMetadata() {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeCertificate(hosts, hostsKey) {
  fs.mkdirSync(TLS_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, opensslConfig(hosts));

  execFileSync(getOpenSslCommand(), [
    'req',
    '-x509',
    '-nodes',
    '-newkey',
    'rsa:2048',
    '-keyout',
    KEY_PATH,
    '-out',
    CERT_PATH,
    '-days',
    String(CERT_DAYS),
    '-sha256',
    '-config',
    CONFIG_PATH,
  ], { stdio: 'ignore' });

  const cert = fs.readFileSync(CERT_PATH, 'utf8');
  const sha256 = certificateSha256(cert);
  fs.writeFileSync(META_PATH, JSON.stringify({
    hostsKey,
    sha256,
    generatedAt: new Date().toISOString(),
    expiresAfterDays: CERT_DAYS,
  }, null, 2));
}

function ensureTlsCertificate(extraHosts = []) {
  const hosts = collectCertificateHosts(extraHosts);
  const hostsKey = JSON.stringify(hosts);
  const metadata = readMetadata();

  if (
    !metadata ||
    metadata.hostsKey !== hostsKey ||
    !fs.existsSync(KEY_PATH) ||
    !fs.existsSync(CERT_PATH)
  ) {
    writeCertificate(hosts, hostsKey);
  }

  const key = fs.readFileSync(KEY_PATH);
  const cert = fs.readFileSync(CERT_PATH);

  return {
    key,
    cert,
    certSha256: certificateSha256(cert.toString('utf8')),
    hosts,
  };
}

module.exports = {
  ensureTlsCertificate,
};
