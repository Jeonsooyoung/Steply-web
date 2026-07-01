const crypto = require('crypto');
const QRCode = require('qrcode');
const { saveSession, getSession, broadcast } = require('./sessionStore');
const { publicSession } = require('./sessionPresenter');


function normalizeProfile(profile) {
  const nowYear = new Date().getFullYear();
  const rawBirthYear = Number(profile.birthYear);
  const rawAge = Number(profile.age);
  const birthYear = Number.isFinite(rawBirthYear) && rawBirthYear >= 1900 && rawBirthYear <= nowYear
    ? Math.trunc(rawBirthYear)
    : Number.isFinite(rawAge) && rawAge > 0 && rawAge < 130
      ? nowYear - Math.trunc(rawAge)
      : null;

  const age = birthYear ? Math.max(0, nowYear - birthYear) : null;

  return {
    id: String(profile.id),
    displayName: profile.displayName || profile.name || 'Steply User',
    name: profile.name || profile.displayName || 'Steply User',
    birthYear,
    age,
    gender: profile.gender || null,
    heightCm: profile.heightCm || null,
    movementNotes: profile.movementNotes || null,
    safetyNote: profile.safetyNote || null,
    createdAt: profile.createdAt || null,
    updatedAt: profile.updatedAt || Date.now(),
  };
}

async function createSession(serverUrl, candidateServerUrls = [serverUrl]) {
  const sessionId = crypto.randomBytes(5).toString('hex');
  const normalizedCandidates = [...new Set(candidateServerUrls.filter(Boolean).map((url) => String(url).trim().replace(/\/$/, '')))];
  const qrPayload = JSON.stringify({
    type: 'steply-web-session',
    version: 2,
    sessionId,
    serverUrl,
    serverUrls: normalizedCandidates,
    fallbackPorts: [3000, 5173],
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
    profile: null,
    connectedAt: null,
    selectedTest: null,
    latestResult: null,
    finalResult: null,
  });

  return {
    session: publicSession(session),
    qrPayload,
    qrDataUrl,
    serverUrls: normalizedCandidates,
    dashboardUrl: `${serverUrl}/?sessionId=${sessionId}`,
    wsUrl: serverUrl.replace('http://', 'ws://').replace('https://', 'wss://') + `/ws?sessionId=${sessionId}&role=dashboard`,
  };
}

function connectProfile(sessionId, profile) {
  const session = getSession(sessionId);
  if (!session) return { error: 'Session not found', status: 404 };
  if (!profile || !profile.id) return { error: 'profile.id is required', status: 400 };

  session.profile = normalizeProfile(profile);
  session.connectedAt = Date.now();

  const view = publicSession(session);
  broadcast(sessionId, { type: 'session', session: view });
  return { session: view };
}

function selectTest(sessionId, selectedTest) {
  const session = getSession(sessionId);
  if (!session) return { error: 'Session not found', status: 404 };
  if (!selectedTest) return { error: 'selectedTest is required', status: 400 };

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

module.exports = {
  createSession,
  connectProfile,
  selectTest,
  getSessionStatus,
};
