import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { stage5DataContractFixture } = require('./fixtures/stage5DataContractFixture.cjs');
const {
  normalizeSteplyDataContract,
} = require('../shared/steplyDataContract.cjs');
const {
  LANDMARK_SERIES_MAXIMUM_SAMPLES,
  normalizeLandmarkSeriesFinalized,
} = require('../shared/landmarkSeriesContract.cjs');
const stage2Config = require('../shared/stage2Analysis.config.json').operational;
const sessionService = require('../src/services/sessionService');
const { saveSession, getSession } = require('../src/services/sessionStore');
const landmarkRelay = require('../src/services/landmarkSeriesRelayService');
const { requestHandler } = require('../src/routes/apiRouter');

function recent(id, completedAt, overrides = {}) {
  return {
    assessmentSessionId: id,
    completedAt,
    risk: 'LOW',
    vulnerabilityIds: ['V1'],
    valid: true,
    chairStandRepetitions: 12,
    balanceSecondsByStage: {
      SIDE_BY_SIDE: 10,
      SEMI_TANDEM: 9,
      TANDEM: 8,
      ONE_LEG: 4,
    },
    ...overrides,
  };
}

const now = Date.UTC(2026, 6, 13);
const recentAssessments = Array.from({ length: 5 }, (_, index) => recent(`assessment-${index}`, now + index));
const contract = stage5DataContractFixture({
  id: 'profile-stage5',
  birthYear: 1956,
  now,
  recentAssessments,
});

// S5-C01 / S5-C02 / S5-X01: strict canonical shared projection.
const normalized = normalizeSteplyDataContract(contract);
assert.equal(normalized.profile.displayName, 'Fixture Profile');
assert.equal(normalized.recentAssessments.length, 5);
assert.deepEqual(Object.keys(normalized), ['schemaVersion', 'profile', 'recentAssessments', 'generatedAt']);
assert.throws(
  () => normalizeSteplyDataContract({ ...contract, profile: { ...contract.profile, name: contract.profile.displayName } }),
  /profile\.name is not allowed/,
  '[S5-C02] legacy name is rejected',
);
assert.throws(
  () => normalizeSteplyDataContract({ ...contract, profile: { ...contract.profile, title: contract.profile.displayName } }),
  /profile\.title is not allowed/,
  '[S5-C02] legacy title is rejected',
);
assert.throws(
  () => normalizeSteplyDataContract({ ...contract, profile: { ...contract.profile, updatedAt: now } }),
  /profile\.updatedAt is not allowed/,
  '[S5-X01] redundant profile updatedAt is rejected because generatedAt owns projection freshness',
);
assert.throws(
  () => normalizeSteplyDataContract({ ...contract, recentAssessments: [...recentAssessments, recent('six', now + 6)] }),
  /at most 5/,
  '[S5-X01] PC projection cannot receive more than five assessments',
);
const invalidRecent = recent('invalid', now, { valid: false });
assert.throws(
  () => normalizeSteplyDataContract(stage5DataContractFixture({ now, recentAssessments: [invalidRecent] })),
  /invalid attempts remain on Mobile only/,
  '[S5-I01] invalid raw attempts cannot enter recent five',
);
assert.throws(
  () => normalizeSteplyDataContract({ ...contract, weeklyReport: { safetyEvents: [], fallReports: [], agentRationale: [] } }),
  /weeklyReport is not allowed/,
  '[S5-X01] Mobile-only weekly report data cannot cross the PC connection boundary',
);
assert.equal(
  sessionService.assessmentProfileFromDataContract(contract.profile, Date.UTC(2026, 0, 1)).ageYears,
  70,
  '[S5-C02] ageYears is derived from UTC connection year without an age wire alias',
);

const vite = await createViteServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'silent',
});
try {
  const { historyItemsFromDataContract, buildChallengeTrendSeries, HistoryChallengeTypes } = await vite.ssrLoadModule('/client/src/utils/historyTrends.js');
  const { PoseLandmarkSeries } = await vite.ssrLoadModule('/client/src/pose/poseTimeSeries.js');
  const projected = historyItemsFromDataContract(contract);
  const chair = buildChallengeTrendSeries(projected, HistoryChallengeTypes.ChairStand);
  const balance = buildChallengeTrendSeries(projected, HistoryChallengeTypes.FourStageBalance);
  assert.equal(chair.length, 5, '[S5-G01] exact canonical chair recent five are graphed');
  assert.equal(chair.at(-1).repetitions, 12, '[S5-G01] graph uses cdcScoredRepetitions projection');
  assert.deepEqual(balance.at(-1).balanceSecondsByStage, {
    SIDE_BY_SIDE: 10,
    SEMI_TANDEM: 9,
    TANDEM: 8,
    ONE_LEG: 4,
  }, '[S5-G01] all four exact posture seconds have independent series values');
  assert.equal(balance.at(-1).sideBySideSeconds, 10);
  assert.equal(balance.at(-1).semiTandemSeconds, 9);
  assert.equal(balance.at(-1).tandemSeconds, 8);
  assert.equal(balance.at(-1).oneLegSeconds, 4);
  const misleading = historyItemsFromDataContract({
    ...contract,
    recentAssessments: [{ ...recentAssessments[0], score: 99, qualityScore: 0.01 }],
  });
  assert.equal(
    buildChallengeTrendSeries(misleading, HistoryChallengeTypes.FourStageBalance)[0].tandemSeconds,
    8,
    '[S5-G02] generic score and quality score are not graph inputs',
  );
  const invalidProjection = historyItemsFromDataContract({
    ...contract,
    recentAssessments: [{ ...recentAssessments[0], valid: false }, recentAssessments[1]],
  });
  assert.equal(invalidProjection.length, 2, '[S5-I01] invalid summary is excluded before challenge projection');
  const retainedSeries = new PoseLandmarkSeries();
  const retained = retainedSeries.push({
    sequence: 1,
    timestampMs: 1_000,
    landmarks: points(),
    worldLandmarks: points(),
    retainedNormalizedLandmarks: points({ outside: true }),
    retainedWorldLandmarks: points(),
  }, { includeSeriesFrames: false }).frame;
  assert.equal(retained.landmarks[0].x, 0, '[S5-D04] analysis landmarks remain independently filterable');
  assert.equal(retained.retainedNormalizedLandmarks[0].x, -0.1, '[S5-D04] G2 out-of-frame raw coordinate remains in the retained series');
} finally {
  await vite.close();
}

// S5-X02: cleanup is profile/session isolated and clears every new memory field.
const firstBundle = await sessionService.createSession('https://127.0.0.1:3000');
const secondBundle = await sessionService.createSession('https://127.0.0.1:3000');
const firstQr = JSON.parse(firstBundle.qrPayload);
const secondQr = JSON.parse(secondBundle.qrPayload);
const firstContract = stage5DataContractFixture({ id: 'cleanup-first', now });
const secondContract = stage5DataContractFixture({ id: 'cleanup-second', now });
assert.equal(Boolean(sessionService.connectProfile(firstBundle.session.id, firstContract, firstQr.pairingToken).error), false);
assert.equal(Boolean(sessionService.connectProfile(secondBundle.session.id, secondContract, secondQr.pairingToken).error), false);
getSession(firstBundle.session.id).pendingLandmarkSeriesById.set('temporary', { private: true });
getSession(firstBundle.session.id).landmarkSeriesAttemptIds.set('attempt', 'series');
sessionService.cleanupSession(firstBundle.session.id, firstQr.pairingToken, 'stage5-test');
assert.equal(sessionService.getSessionStatus(firstBundle.session.id).profile, null);
assert.equal(sessionService.getSessionStatus(firstBundle.session.id).dataContract, null);
assert.equal(getSession(firstBundle.session.id).pendingLandmarkSeriesById.size, 0);
assert.equal(getSession(firstBundle.session.id).landmarkSeriesAttemptIds.size, 0);
assert.equal(sessionService.getSessionStatus(secondBundle.session.id).profile.id, 'cleanup-second');
assert.equal(sessionService.getSessionStatus(secondBundle.session.id).dataContract.profile.id, 'cleanup-second');

function points({ outside = false } = {}) {
  return Array.from({ length: 33 }, (_, index) => ({
    index,
    x: outside && index === 0 ? -0.1 : index / 32,
    y: outside && index === 1 ? 1.1 : index / 32,
    z: index / 100,
    visibility: 0.9,
  }));
}

function finalizedEnvelope() {
  const sample = {
    sequence: 1,
    timestampMs: 1_000,
    normalizedLandmarks: points({ outside: true }),
    worldLandmarks: points(),
  };
  return {
    type: 'landmark-series.finalized',
    schemaVersion: 'landmark_series.v1',
    messageId: 'landmark-message-1',
    profileId: 'landmark-profile',
    assessmentSessionId: 'landmark-assessment',
    attemptId: 'landmark-attempt',
    resultId: 'landmark-result',
    series: {
      schemaVersion: 'landmark_series.v1',
      seriesId: 'landmark-series-1',
      profileId: 'landmark-profile',
      assessmentSessionId: 'landmark-assessment',
      attemptId: 'landmark-attempt',
      analysisSessionId: 'landmark-analysis',
      resultId: 'landmark-result',
      assessmentType: 'CHAIR_STAND_30S',
      status: 'INVALID',
      targetFps: 30,
      startedAt: 500,
      completedAt: 1_500,
      samples: [sample],
    },
  };
}

// S5-D04: operational landmark payload has full normalized/world samples and no image bytes.
const balanceAttemptUpperBoundMs = stage2Config.calibration.neutralStandingMs
  + (4 * (stage2Config.balance.positionEntryTimeoutMs + stage2Config.balance.targetHoldMs));
assert.ok(
  stage2Config.landmarkSeries.maximumAgeMs >= balanceAttemptUpperBoundMs,
  '[S5-D04] system retention covers calibration plus every balance entry/hold upper bound',
);
assert.ok(
  LANDMARK_SERIES_MAXIMUM_SAMPLES >= Math.ceil(
    stage2Config.landmarkSeries.maximumAgeMs * stage2Config.landmarkSeries.targetFps / 1000,
  ),
  '[S5-D04] sample cap covers the configured 30fps retention window',
);
const envelope = normalizeLandmarkSeriesFinalized(finalizedEnvelope());
assert.equal(envelope.series.samples[0].normalizedLandmarks[0].x, -0.1, '[S5-D04] out-of-frame normalized coordinates are retained');
assert.throws(
  () => normalizeLandmarkSeriesFinalized({ ...finalizedEnvelope(), frame: 'raw-image-bytes' }),
  /frame is not allowed/,
  '[S5-D04] image bytes are rejected by strict wire contract',
);

saveSession({
  id: 'landmark-connection',
  profile: { id: 'landmark-profile' },
  assessmentSession: {
    assessmentSessionId: 'landmark-assessment',
    functionalTests: {
      CHAIR_STAND_30S: {
        acceptedResult: null,
        attempts: [{
          result: {
            resultId: 'landmark-result',
            attemptId: 'landmark-attempt',
            analysisSessionId: 'landmark-analysis',
            assessmentType: 'CHAIR_STAND_30S',
            status: 'INVALID',
          },
        }, {
          result: {
            resultId: 'landmark-result-2',
            attemptId: 'landmark-attempt-2',
            analysisSessionId: 'landmark-analysis-2',
            assessmentType: 'CHAIR_STAND_30S',
            status: 'INVALID',
          },
        }],
      },
    },
  },
});
const applied = landmarkRelay.applyFinalized('landmark-connection', finalizedEnvelope());
assert.equal(applied.applied, true, '[S5-D04] linked series is retained pending Mobile ack');
assert.equal(landmarkRelay.pendingMessages('landmark-connection').length, 1);
const secondEnvelope = finalizedEnvelope();
secondEnvelope.messageId = 'landmark-message-2';
secondEnvelope.attemptId = 'landmark-attempt-2';
secondEnvelope.resultId = 'landmark-result-2';
secondEnvelope.series.seriesId = 'landmark-series-2';
secondEnvelope.series.attemptId = 'landmark-attempt-2';
secondEnvelope.series.analysisSessionId = 'landmark-analysis-2';
secondEnvelope.series.resultId = 'landmark-result-2';
assert.equal(landmarkRelay.applyFinalized('landmark-connection', secondEnvelope).applied, true, '[S5-D04] each attempt has an independent pending Map entry');
assert.equal(landmarkRelay.pendingMessages('landmark-connection').length, 2, '[S5-D04] pending relay retains multiple attempts for reconnect replay');
assert.equal(landmarkRelay.applyFinalized('landmark-connection', finalizedEnvelope()).duplicate, true, '[S5-D04] exact retry is idempotent');
const duplicateAttempt = finalizedEnvelope();
duplicateAttempt.messageId = 'landmark-message-same-attempt';
duplicateAttempt.series.seriesId = 'landmark-series-same-attempt';
assert.equal(landmarkRelay.applyFinalized('landmark-connection', duplicateAttempt).reason, 'ATTEMPT_ID_CONFLICT', '[S5-D04] one attempt cannot create multiple full landmark series');
const altered = finalizedEnvelope();
altered.series.samples[0].worldLandmarks[0].x = 123;
assert.equal(landmarkRelay.applyFinalized('landmark-connection', altered).reason, 'MESSAGE_ID_CONFLICT', '[S5-D04] altered retry conflicts');
const statusAltered = finalizedEnvelope();
statusAltered.messageId = 'landmark-message-status';
statusAltered.series.seriesId = 'landmark-series-status';
statusAltered.series.status = 'VALID';
assert.equal(landmarkRelay.applyFinalized('landmark-connection', statusAltered).reason, 'RESULT_LINKAGE_MISMATCH', '[S5-D04] status must match stored result');
const ack = {
  type: 'landmark-series.ack',
  schemaVersion: 'landmark_series.v1',
  messageId: 'landmark-message-1',
  profileId: 'landmark-profile',
  assessmentSessionId: 'landmark-assessment',
  attemptId: 'landmark-attempt',
  seriesId: 'landmark-series-1',
  storedAt: 2_000,
};
assert.equal(landmarkRelay.acknowledge('landmark-connection', ack).applied, true);
assert.equal(landmarkRelay.pendingMessages('landmark-connection').length, 1, '[S5-D04] ack deletes only its matching series');
const secondAck = {
  ...ack,
  messageId: 'landmark-message-2',
  attemptId: 'landmark-attempt-2',
  seriesId: 'landmark-series-2',
  storedAt: 2_001,
};
assert.equal(landmarkRelay.acknowledge('landmark-connection', secondAck).applied, true);
assert.equal(landmarkRelay.pendingMessages('landmark-connection').length, 0, '[S5-D04] every sample series is deleted immediately after its matching ack');

// S5-D04 / S5-X02: production personal-data paths have no disk/video persistence API.
const staticSources = [
  'src/services/analysisService.js',
  'src/services/sessionService.js',
  'src/services/sessionStore.js',
  'src/services/landmarkSeriesRelayService.js',
  'src/ws/dashboardSocket.js',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
for (const forbidden of ['writeFile', 'appendFile', 'createWriteStream', 'HISTORY_PATH']) {
  assert.equal(staticSources.includes(forbidden), false, `[S5-D04] production personal data path excludes ${forbidden}`);
}
const dashboardSource = fs.readFileSync(path.join(root, 'client/src/hooks/useSteplyDashboard.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'client/src/pose/poseLandmarker.worker.js'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const stepEightSource = fs.readFileSync(path.join(root, 'client/src/routes/StepEightScreens.jsx'), 'utf8');
for (const forbidden of [
  'weeklySeriesFromHistory',
  'safetyEventsFromHistory',
  'fallSummary',
  'agentActions',
  'reportText',
  'steply-weekly-report.txt',
  'URL.createObjectURL',
  'Share With Caregiver',
  'Export Report',
  'No recent safety events recorded',
  'Not scheduled',
  'No weekly data',
  'profile.name',
  'profile.age',
  'profile.gender',
  'Voice Speed',
  'Voice Volume',
  'Captions',
  'Check Network',
  'onChange={() => {}}',
]) assert.equal(stepEightSource.includes(forbidden), false, `[S5-X01] Step Eight excludes unavailable or legacy PC state: ${forbidden}`);
assert.match(stepEightSource, /Care information is unavailable on this PC/, '[S5-X01] Progress marks Mobile-only care state unavailable');
assert.match(stepEightSource, /locally stored Room data/, '[S5-X01] reports stay authoritative on Mobile');
assert.match(stepEightSource, /give consent in the phone app/, '[S5-X01] report consent stays authoritative on Mobile');
assert.match(stepEightSource, /value="Stored on phone"/, '[S5-C02] caregiver state is not inferred from the strict profile projection');
const strictUiSources = [
  'client/src/routes/StepTwoScreens.jsx',
  'client/src/routes/StepThreeScreens.jsx',
  'client/src/routes/StepFourScreens.jsx',
  'client/src/routes/StepFiveScreens.jsx',
  'client/src/routes/StepSixScreens.jsx',
  'client/src/routes/StepSevenScreens.jsx',
  'client/src/routes/StepEightScreens.jsx',
  'client/src/hooks/useSteplyDashboard.js',
].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
assert.doesNotMatch(strictUiSources, /profile\??\.(?:name|gender|age)(?!Years)/, '[S5-C02] active UI excludes legacy profile aliases');
assert.doesNotMatch(
  strictUiSources,
  /(?:exercise|template)\??\.displayName\s*\|\|\s*(?:exercise|template)\??\.(?:title|name)/,
  '[S5-C02] exercise contract input never falls back from displayName to title/name',
);
const stepTwoSource = fs.readFileSync(path.join(root, 'client/src/routes/StepTwoScreens.jsx'), 'utf8');
assert.equal(stepTwoSource.includes('careAgentProjection'), false, '[S5-X01] Home does not consume Mobile-only care-agent state');
assert.equal(stepTwoSource.includes('Save and Continue'), false, '[S5-C02] Web does not present a cosmetic profile/consent save flow');
assert.match(stepTwoSource, /This PC cannot create a profile or record consent/, '[S5-C02] profile setup authority is explicit');
assert.match(dashboardSource, /sessionStorage\.removeItem\(ACTIVE_SESSION_STORAGE_KEY\)/, '[S5-X02] explicit cleanup removes browser session storage');
assert.match(dashboardSource, /URL\.revokeObjectURL/, '[S5-X02] browser frame blobs are revoked');
assert.match(dashboardSource, /pendingLandmarkSeriesRef = useRef\(new Map\(\)\)/, '[S5-D04] browser queues finalized attempts independently in a Map');
assert.match(dashboardSource, /pendingLandmarkSeriesRef\.current\.values\(\)/, '[S5-D04] reconnect flush replays every pending browser attempt');
assert.equal(staticSources.includes("msg.type === 'frame'"), false, '[S5-D04] legacy base64 frame JSON ingress is removed');
assert.equal(dashboardSource.includes("message.type === 'remote-camera-frame'"), false, '[S5-D04] legacy base64 frame JSON rendering is removed');
assert.ok(
  workerSource.indexOf('steadiLandmarkSeries.push({') < workerSource.indexOf('if (!shouldRunMovementAnalysisPipeline()) return;'),
  '[S5-D04] full landmark capture occurs before lower-frequency clinical analysis cadence',
);
assert.match(workerSource, /retainedNormalizedLandmarks: detected\.landmarks/, '[S5-D04] worker retains raw normalized values including G2 violations');
assert.match(workerSource, /retainedWorldLandmarks: detected\.rawWorldLandmarks/, '[S5-D04] worker retains the matching raw world series');
assert.match(serverSource, /cleanupAllSessionPersonalData/, '[S5-X02] process termination clears every in-memory session');
assert.match(serverSource, /process\.once\('SIGINT'/, '[S5-X02] SIGINT uses the cleanup path');
assert.match(serverSource, /process\.once\('SIGTERM'/, '[S5-X02] SIGTERM uses the cleanup path');

const apiServer = http.createServer(requestHandler);
await new Promise((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
try {
  const apiBaseUrl = `http://127.0.0.1:${apiServer.address().port}`;
  const response = await fetch(`${apiBaseUrl}/api/history`);
  assert.equal(response.status, 404, '[S5-X01] removed PC history API cannot fall through to the SPA');
  assert.deepEqual(await response.json(), { error: 'API endpoint not found' });
  const strictBundle = await sessionService.createSession(apiBaseUrl, [apiBaseUrl]);
  const strictQr = JSON.parse(strictBundle.qrPayload);
  for (const legacyKey of ['profile', 'name', 'title', 'weeklyReport', 'unknown']) {
    const rejected = await fetch(`${apiBaseUrl}/api/session/${strictBundle.session.id}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionSessionId: strictBundle.session.id,
        pairingToken: strictQr.pairingToken,
        dataContract: contract,
        [legacyKey]: legacyKey === 'profile'
          ? contract.profile
          : legacyKey === 'weeklyReport'
            ? { safetyEvents: [], fallReports: [], agentRationale: [] }
            : 'legacy-value',
      }),
    });
    assert.equal(rejected.status, 422, `[S5-C02] /connect rejects top-level ${legacyKey}`);
    assert.equal((await rejected.json()).reason, 'INVALID_STEPLY_DATA_CONTRACT');
  }
  const rejectedNestedWeeklyReport = await fetch(`${apiBaseUrl}/api/session/${strictBundle.session.id}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connectionSessionId: strictBundle.session.id,
      pairingToken: strictQr.pairingToken,
      dataContract: { ...contract, weeklyReport: { safetyEvents: [], fallReports: [], agentRationale: [] } },
    }),
  });
  assert.equal(rejectedNestedWeeklyReport.status, 422, '[S5-X01] /connect rejects dataContract.weeklyReport');
  assert.equal((await rejectedNestedWeeklyReport.json()).reason, 'INVALID_STEPLY_DATA_CONTRACT');
  const rejectedNestedUpdatedAt = await fetch(`${apiBaseUrl}/api/session/${strictBundle.session.id}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connectionSessionId: strictBundle.session.id,
      pairingToken: strictQr.pairingToken,
      dataContract: { ...contract, profile: { ...contract.profile, updatedAt: now } },
    }),
  });
  assert.equal(rejectedNestedUpdatedAt.status, 422, '[S5-X01] /connect rejects dataContract.profile.updatedAt');
  assert.equal((await rejectedNestedUpdatedAt.json()).reason, 'INVALID_STEPLY_DATA_CONTRACT');
  const accepted = await fetch(`${apiBaseUrl}/api/session/${strictBundle.session.id}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connectionSessionId: strictBundle.session.id,
      sessionId: strictBundle.session.id,
      pairingToken: strictQr.pairingToken,
      dataContract: contract,
      assessmentSession: null,
    }),
  });
  assert.equal(accepted.status, 200, '[S5-C01] /connect accepts only the versioned data contract shape');
} finally {
  await new Promise((resolve) => apiServer.close(resolve));
}

console.log('Stage 5 data, graph, cleanup, and landmark relay requirements passed.');
