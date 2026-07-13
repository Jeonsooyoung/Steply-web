const crypto = require('crypto');
const QRCode = require('qrcode');
const { saveSession, getSession, listSessions, broadcast, clearSessionPersonalData } = require('./sessionStore');
const { publicSession } = require('./sessionPresenter');
const assessmentSessionService = require('./assessmentSessionService');
const { ASSESSMENT_SESSION_SCHEMA_VERSION } = require('../../shared/stage1Assessment.cjs');
const { normalizeSteplyDataContract } = require('../../shared/steplyDataContract.cjs');
const assessmentTestTypes = require('../../shared/assessmentTestTypes.json');

const DEFAULT_PAIRING_TTL_MS = 10 * 60 * 1000;
const PAIRING_TOKEN_BYTES = 16;
const SUPPORTED_ASSESSMENT_TEST_TYPES = new Set(assessmentTestTypes.allowedTestTypes);

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function tokensMatch(expectedHash, candidateToken) {
  if (!expectedHash || !candidateToken) return false;
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(sha256Hex(candidateToken), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function consumePairingToken(session, providedToken) {
  if (!session.pairingTokenHash) return { error: 'Pairing token is not configured for this session.', status: 401 };
  if (session.expiresAtEpochMs && session.expiresAtEpochMs <= Date.now()) {
    return { error: 'Pairing QR code has expired. Refresh the QR code and try again.', status: 410 };
  }
  if (session.pairingTokenConsumedAt) {
    return { error: 'Pairing token has already been used. Refresh the QR code and try again.', status: 409 };
  }
  if (!tokensMatch(session.pairingTokenHash, providedToken)) {
    return { error: 'Invalid or missing pairing token.', status: 401 };
  }

  session.pairingTokenConsumedAt = Date.now();
  return null;
}

function validatePairingToken(session, providedToken) {
  if (!session.pairingTokenHash) return { error: 'Pairing token is not configured for this session.', status: 401 };
  if (!tokensMatch(session.pairingTokenHash, providedToken)) {
    return { error: 'Invalid or missing pairing token.', status: 401 };
  }
  return null;
}

function cleanupSessionPersonalData(sessionId, reason = 'session-cleanup') {
  const session = getSession(sessionId);
  if (!session) return { error: 'Session not found', status: 404 };

  const cleanedSession = clearSessionPersonalData(sessionId, reason);
  const view = publicSession(cleanedSession);
  broadcast(sessionId, {
    type: 'session-cleared',
    reason,
    session: view,
    at: Date.now(),
  });
  broadcast(sessionId, {
    type: 'remote-camera-status',
    role: 'system',
    status: 'session-cleared',
    message: 'Phone ended the session. PC temporary personal data was cleared.',
    at: Date.now(),
  });
  return { session: view };
}

function cleanupSession(sessionId, pairingToken, reason = 'mobile-cleanup-request') {
  const session = getSession(sessionId);
  if (!session) return { error: 'Session not found', status: 404 };
  const tokenError = validatePairingToken(session, pairingToken);
  if (tokenError) return tokenError;
  return cleanupSessionPersonalData(sessionId, reason);
}

function cleanupAllSessionPersonalData(reason = 'pc-process-terminating') {
  return listSessions().map((session) => cleanupSessionPersonalData(session.id, reason));
}

function assessmentProfileFromDataContract(profile, referenceTimestampMs) {
  const referenceYearUtc = new Date(referenceTimestampMs).getUTCFullYear();
  return {
    id: profile.id,
    birthYear: profile.birthYear,
    ageYears: Math.max(0, referenceYearUtc - profile.birthYear),
    sex: profile.sex,
  };
}

async function createSession(serverUrl, candidateServerUrls = [serverUrl], options = {}) {
  const sessionId = crypto.randomBytes(5).toString('hex');
  const normalizedCandidates = [...new Set(candidateServerUrls.filter(Boolean).map((url) => String(url).trim().replace(/\/$/, '')))];
  const pairingToken = crypto.randomBytes(PAIRING_TOKEN_BYTES).toString('base64url');
  const ttlMs = Number(process.env.STEPLY_PAIRING_TTL_MS || DEFAULT_PAIRING_TTL_MS);
  const expiresAtEpochMs = Date.now() + ttlMs;
  const expiresAt = new Date(expiresAtEpochMs).toISOString();
  const tlsCertSha256 = options.tlsCertSha256 || process.env.STEPLY_TLS_CERT_SHA256 || null;
  const qrPayload = JSON.stringify({
    type: 'steply-web-session',
    version: 3,
    connectionSessionId: sessionId,
    sessionId,
    assessmentSessionSchemaVersion: ASSESSMENT_SESSION_SCHEMA_VERSION,
    serverUrl,
    serverUrls: normalizedCandidates,
    expiresAt,
    expiresAtEpochMs,
    pairingToken,
    ...(tlsCertSha256 ? { tlsCertSha256 } : {}),
  });

  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    width: 260,
    margin: 2,
    errorCorrectionLevel: 'M',
  });

  const session = saveSession({
    id: sessionId,
    createdAt: Date.now(),
    serverUrl,
    serverUrls: normalizedCandidates,
    qrPayload,
    expiresAt,
    expiresAtEpochMs,
    pairingTokenHash: sha256Hex(pairingToken),
    pairingTokenConsumedAt: null,
    tlsCertSha256,
    profile: null,
    dataContract: null,
    connectedAt: null,
    selectedTest: null,
    latestResult: null,
    finalResult: null,
    assessmentSession: null,
    assessmentSessionMessageIds: new Set(),
    assessmentResultKeys: new Map(),
    pendingLandmarkSeriesById: new Map(),
    landmarkSeriesMessageIds: new Map(),
    landmarkSeriesAttemptIds: new Map(),
    landmarkSeriesAckReceipts: new Map(),
  });

  return {
    session: publicSession(session),
    qrPayload,
    qrDataUrl,
    serverUrls: normalizedCandidates,
    expiresAt,
    expiresAtEpochMs,
    dashboardUrl: `${serverUrl}/?sessionId=${sessionId}`,
    dashboardWsPath: `/ws?sessionId=${sessionId}&role=dashboard`,
    wsUrl: serverUrl.replace('http://', 'ws://').replace('https://', 'wss://') + `/ws?sessionId=${sessionId}&role=dashboard`,
  };
}

function connectProfile(sessionId, dataContractValue, pairingToken, assessmentSessionSnapshot = null) {
  const session = getSession(sessionId);
  if (!session) return { error: 'Session not found', status: 404 };
  let dataContract;
  try {
    dataContract = normalizeSteplyDataContract(dataContractValue);
  } catch (error) {
    return { error: error.message, status: 422, reason: error.code || 'INVALID_STEPLY_DATA_CONTRACT' };
  }
  const tokenError = consumePairingToken(session, pairingToken);
  if (tokenError) return tokenError;

  session.dataContract = dataContract;
  session.profile = dataContract.profile;
  session.connectedAt = Date.now();
  assessmentSessionService.connectSnapshot(
    session,
    assessmentProfileFromDataContract(session.profile, session.createdAt),
    assessmentSessionSnapshot || null,
  );

  const view = publicSession(session);
  broadcast(sessionId, { type: 'session', session: view });
  return { session: view };
}

function selectTest(sessionId, selectedTest) {
  const session = getSession(sessionId);
  if (!session) return { error: 'Session not found', status: 404 };
  if (!selectedTest) return { error: 'selectedTest is required', status: 400 };
  if (!SUPPORTED_ASSESSMENT_TEST_TYPES.has(selectedTest)) {
    return {
      error: `Unsupported assessment test type: ${String(selectedTest)}`,
      reason: 'UNSUPPORTED_ASSESSMENT_TEST_TYPE',
      status: 422,
    };
  }

  session.selectedTest = selectedTest;

  const view = publicSession(session);
  broadcast(sessionId, { type: 'session', session: view });
  return { session: view };
}

function getSessionStatus(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;
  return publicSession(session);
}

function updateAssessmentSession(sessionId, update) {
  return assessmentSessionService.updateAssessmentSession(sessionId, update);
}

module.exports = {
  createSession,
  connectProfile,
  selectTest,
  getSessionStatus,
  updateAssessmentSession,
  cleanupSession,
  cleanupSessionPersonalData,
  cleanupAllSessionPersonalData,
  assessmentProfileFromDataContract,
  SUPPORTED_ASSESSMENT_TEST_TYPES,
};
