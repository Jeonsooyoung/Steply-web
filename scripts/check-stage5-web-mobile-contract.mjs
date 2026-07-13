import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer as createViteServer } from 'vite';
import { WebSocket } from 'ws';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobileRoot = path.resolve(root, '../Steply-mobile');
const sessionService = require('../src/services/sessionService');
const analysisService = require('../src/services/analysisService');
const { requestHandler } = require('../src/routes/apiRouter');
const { attachDashboardWebSocket } = require('../src/ws/dashboardSocket');
const {
  pendingMessages: pendingLandmarkSeriesMessages,
} = require('../src/services/landmarkSeriesRelayService');
const {
  FunctionalTestSlots,
} = require('../shared/stage1Assessment.cjs');
const {
  STAGE2_OPERATIONAL_RULE_VERSION,
  normalizeStage2Result,
} = require('../shared/stage2Contract.cjs');
const {
  STEPLY_DATA_CONTRACT_SCHEMA_VERSION,
  normalizeSteplyDataContract,
} = require('../shared/steplyDataContract.cjs');
const {
  LANDMARK_SERIES_SCHEMA_VERSION,
  LANDMARK_SERIES_TARGET_FPS,
  normalizeLandmarkSeriesFinalized,
} = require('../shared/landmarkSeriesContract.cjs');

const VIDEO_MARKER = 'STEPLY_RAW_VIDEO_MUST_NOT_PERSIST_7fd8f8b5';
const SUPPORT_ROI = Object.freeze({ x: 0.78, y: 0.18, width: 0.18, height: 0.62 });

function stage5DataContract(now) {
  const recentAssessments = [{
    assessmentSessionId: 'stage5-prior-assessment',
    completedAt: now - 7 * 24 * 60 * 60 * 1_000,
    risk: 'MODERATE',
    vulnerabilityIds: ['V6', 'V7'],
    valid: true,
    chairStandRepetitions: 8,
    balanceSecondsByStage: {
      SIDE_BY_SIDE: 10,
      SEMI_TANDEM: 10,
      TANDEM: 6.5,
      ONE_LEG: 0,
    },
  }];
  return {
    schemaVersion: STEPLY_DATA_CONTRACT_SCHEMA_VERSION,
    profile: {
      id: 'stage5-profile',
      displayName: 'Stage 5 Contract',
      birthYear: new Date(now).getFullYear() - 70,
      sex: 'FEMALE',
    },
    recentAssessments,
    generatedAt: now,
  };
}

function quality(status, ratio = 0) {
  return {
    gates: ['G1', 'G2', 'G3', 'G4', 'G5'].map((gate) => ({
      gate,
      violationFrameCount: gate === 'G3' && ratio > 0 ? 19 : 0,
      violationDurationMs: gate === 'G3' && ratio > 0 ? 633 : 0,
      violationRatio: gate === 'G3' ? ratio : 0,
    })),
    g3ViolationRatio: ratio,
    invalidReasons: status === 'INVALID' ? ['G3_VIOLATION_RATIO_EXCEEDED'] : [],
    excludeFromTrends: status === 'INVALID',
  };
}

function calibration(type) {
  return {
    sampledDurationMs: 3_000,
    lFootM: 0.241,
    hStandM: 0.932,
    hSitM: type === FunctionalTestSlots.ChairStand ? 0.514 : null,
    wShoulderM: 0.418,
    dFoldM: type === FunctionalTestSlots.ChairStand ? 0.183 : null,
    supportRoiNormalized: type === FunctionalTestSlots.FourStageBalance ? SUPPORT_ROI : null,
  };
}

function vulnerability(resultId, activeIds, measurements) {
  return {
    ruleVersion: 'stage3_vulnerability.v1',
    activeIds,
    evidence: activeIds.map((vulnerabilityId) => ({
      vulnerabilityId,
      sourceResultId: resultId,
      measurements,
    })),
  };
}

function chairResult(completedAt) {
  const resultId = 'stage5-chair-valid';
  return normalizeStage2Result({
    resultId,
    attemptId: 'stage5-chair-attempt',
    analysisSessionId: 'stage5-chair-analysis',
    assessmentType: FunctionalTestSlots.ChairStand,
    status: 'VALID',
    source: 'LIVE_POSE',
    completedAt,
    operationalConfigVersion: STAGE2_OPERATIONAL_RULE_VERSION,
    calibration: calibration(FunctionalTestSlots.ChairStand),
    quality: quality('VALID'),
    vulnerabilityAssessment: vulnerability(resultId, ['V6'], {
      armUseOccurrenceCount: 2,
      officialScore: 0,
    }),
    chairStand: {
      observedRepetitions: 11,
      completedRepetitions: 9,
      cdcScoredRepetitions: 0,
      finalRepetitionCredit: 0,
      finalState: 'SIT',
      armUse: {
        occurrenceCount: 2,
        restartUsed: true,
        outcome: 'DISQUALIFIED',
      },
    },
  });
}

function balanceStages() {
  return [
    ['SIDE_BY_SIDE', 10.0, 'PASSED', null, null, 0.0101],
    ['SEMI_TANDEM', 10.0, 'PASSED', null, null, 0.0112],
    ['TANDEM', 7.25, 'FAILED', 'F2', 'POSITION_LOST', 0.012345],
    ['ONE_LEG', 0.0, 'NOT_ATTEMPTED', null, null, null],
  ].map(([stage, holdSeconds, status, failureCode, failureReason, mlRmsM], index) => ({
    stage,
    onsetLatencyMs: status === 'NOT_ATTEMPTED' ? null : 500 + index * 100,
    holdSeconds,
    status,
    failureCode,
    failureReason,
    sway: mlRmsM === null ? null : {
      mlRmsM,
      apRmsM: 0.006789 + index * 0.0001,
      initialRmsM: 0.0142 + index * 0.0001,
      staticRmsM: 0.0081 + index * 0.0001,
      initialToStaticRatio: 1.753086 + index * 0.01,
      mlToApRatio: 1.818383 + index * 0.01,
    },
  }));
}

function balanceResult({ completedAt, invalid = false, suffix = '' } = {}) {
  const resultId = invalid ? `stage5-balance-invalid${suffix}` : 'stage5-balance-valid';
  return normalizeStage2Result({
    resultId,
    attemptId: invalid ? `stage5-balance-invalid-attempt${suffix}` : 'stage5-balance-valid-attempt',
    analysisSessionId: invalid ? `stage5-balance-invalid-analysis${suffix}` : 'stage5-balance-valid-analysis',
    assessmentType: FunctionalTestSlots.FourStageBalance,
    status: invalid ? 'INVALID' : 'VALID',
    source: 'LIVE_POSE',
    completedAt,
    operationalConfigVersion: STAGE2_OPERATIONAL_RULE_VERSION,
    calibration: calibration(FunctionalTestSlots.FourStageBalance),
    quality: quality(invalid ? 'INVALID' : 'VALID', invalid ? 0.2001 : 0),
    vulnerabilityAssessment: invalid
      ? null
      : vulnerability(resultId, ['V7'], { tandemHoldSeconds: 7.25 }),
    balance: { stages: balanceStages() },
  });
}

function finalPayload(sessionId, result, exercisePlan = null) {
  return {
    sessionId,
    analysisSessionId: result.analysisSessionId,
    attemptId: result.attemptId,
    assessmentType: result.assessmentType,
    testType: result.assessmentType,
    source: 'LIVE_POSE',
    status: result.status,
    resultType: 'FINAL_RESULT',
    analyzerFinalEvent: true,
    isPersistable: result.status === 'VALID',
    isClinicallyScorable: result.status === 'VALID',
    startedAt: result.completedAt - 5_000,
    completedAt: result.completedAt,
    stage2Result: result,
    ...(exercisePlan ? { recommendationPlan: exercisePlan } : {}),
  };
}

function landmarkPoint(index, x = 0.5, y = 0.5) {
  return { index, x, y, z: index * 0.001, visibility: 0.95 };
}

function invalidG2LandmarkEnvelope(assessmentSessionId, result, { suffix = 'g2', status = result.status } = {}) {
  const normalizedLandmarks = Array.from({ length: 33 }, (_, index) => landmarkPoint(index));
  normalizedLandmarks[0] = landmarkPoint(0, -0.01, 0.48);
  normalizedLandmarks[1] = landmarkPoint(1, 1.01, 0.49);
  const worldLandmarks = Array.from({ length: 33 }, (_, index) => ({
    ...landmarkPoint(index, (index - 16) * 0.01, 0.7 - index * 0.005),
    z: -0.2 + index * 0.01,
  }));
  return {
    type: 'landmark-series.finalized',
    schemaVersion: LANDMARK_SERIES_SCHEMA_VERSION,
    messageId: `stage5-landmark-message-${suffix}`,
    profileId: 'stage5-profile',
    assessmentSessionId,
    attemptId: result.attemptId,
    resultId: result.resultId,
    series: {
      schemaVersion: LANDMARK_SERIES_SCHEMA_VERSION,
      seriesId: `stage5-landmark-series-${suffix}`,
      profileId: 'stage5-profile',
      assessmentSessionId,
      attemptId: result.attemptId,
      analysisSessionId: result.analysisSessionId,
      resultId: result.resultId,
      assessmentType: result.assessmentType,
      status,
      targetFps: LANDMARK_SERIES_TARGET_FPS,
      startedAt: result.completedAt - 1_000,
      completedAt: result.completedAt,
      samples: [{
        sequence: 0,
        timestampMs: 0,
        normalizedLandmarks,
        worldLandmarks,
      }],
    },
  };
}

function socketCollector(socket) {
  const messages = [];
  const binaries = [];
  const waiters = [];
  const binaryWaiters = [];
  const settle = () => {
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      const match = messages.slice(waiter.afterIndex).find(waiter.predicate);
      if (!match) continue;
      waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(match);
    }
  };
  socket.on('message', (data, isBinary) => {
    if (isBinary) {
      const binary = Buffer.from(data);
      binaries.push(binary);
      for (let index = binaryWaiters.length - 1; index >= 0; index -= 1) {
        const waiter = binaryWaiters[index];
        if (!waiter.predicate(binary)) continue;
        binaryWaiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(binary);
      }
      return;
    }
    messages.push(JSON.parse(data.toString()));
    settle();
  });
  return {
    messages,
    binaries,
    waitFor(predicate, timeoutMs = 5_000) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: null, afterIndex: 0 };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error('Timed out waiting for WebSocket contract message'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    waitForNext(predicate, timeoutMs = 5_000) {
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: null, afterIndex: messages.length };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error('Timed out waiting for next WebSocket contract message'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    waitForBinary(predicate, timeoutMs = 5_000) {
      const existing = binaries.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const index = binaryWaiters.indexOf(waiter);
          if (index >= 0) binaryWaiters.splice(index, 1);
          reject(new Error('Timed out waiting for WebSocket binary frame'));
        }, timeoutMs);
        binaryWaiters.push(waiter);
      });
    },
  };
}

async function waitUntil(predicate, timeoutMs = 5_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) throw new Error('Timed out waiting for production state');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function openCollectedSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const collector = socketCollector(socket);
    socket.once('open', () => resolve({ socket, collector }));
    socket.once('error', reject);
  });
}

function closeSocket(socket) {
  if (!socket || socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    socket.once('close', resolve);
    socket.close();
  });
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'steply-stage5-contract-'));
const contractPath = path.join(tempRoot, 'assessment-session.updated.json');
const landmarkContractPath = path.join(tempRoot, 'landmark-series.finalized.json');
const highPendingPrescriptionPath = path.join(tempRoot, 'otago-high-pending.json');
const highApprovedPrescriptionPath = path.join(tempRoot, 'otago-high-approved.json');
const blockedPrescriptionPath = path.join(tempRoot, 'otago-blocked.json');
const httpServer = http.createServer(requestHandler);
const webSocketServer = attachDashboardWebSocket(httpServer);
const vite = await createViteServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'silent',
});
let dashboardSocket;
let mobileSocket;

try {
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const wsBase = `ws://127.0.0.1:${address.port}`;
  assert.equal(
    fs.existsSync(path.join(root, 'src/repositories/historyRepository.js')),
    false,
    'Web has no process-wide assessment history cache module',
  );
  const removedHistoryRoute = await fetch(`${baseUrl}/api/history`);
  assert.equal(removedHistoryRoute.status, 404, 'deleted Web history route cannot expose persisted assessment data');
  const bundle = await sessionService.createSession(baseUrl, [baseUrl]);
  const qr = JSON.parse(bundle.qrPayload);
  dashboardSocket = await openSocket(`${wsBase}${bundle.dashboardWsPath}`);
  const dashboard = socketCollector(dashboardSocket);

  const rejectedLegacyProfile = sessionService.connectProfile(bundle.session.id, {
    id: 'stage5-profile',
    displayName: 'Stage 5 Contract',
    birthYear: new Date().getFullYear() - 70,
    gender: 'FEMALE',
  }, qr.pairingToken);
  assert.equal(rejectedLegacyProfile.status, 422, 'Stage 5 boundary rejects the legacy profile-only shape');

  const inputDataContract = stage5DataContract(Date.now());
  const rejectedProfileUpdatedAt = sessionService.connectProfile(
    bundle.session.id,
    {
      ...inputDataContract,
      profile: { ...inputDataContract.profile, updatedAt: Date.now() },
    },
    qr.pairingToken,
  );
  assert.equal(rejectedProfileUpdatedAt.status, 422, 'strict connect rejects unused profile.updatedAt');
  assert.equal(rejectedProfileUpdatedAt.reason, 'INVALID_STEPLY_DATA_CONTRACT');
  assert.equal(sessionService.getSessionStatus(bundle.session.id).profile, null, 'profile.updatedAt rejection cannot partially connect');

  const forbiddenConnectionFields = {
    weeklyReport: { generatedAt: Date.now(), recentAssessments: inputDataContract.recentAssessments },
    safetyEvents: [{ eventId: 'forbidden-safety', type: 'DIZZINESS', occurredAt: Date.now() }],
    fallReports: [{ eventId: 'forbidden-fall', occurredAt: Date.now(), injurious: false, unresolved: false }],
    agentRationale: [{ actionType: 'MAINTAIN', reasonCodes: ['FORBIDDEN'], executionStatus: 'SUCCEEDED', occurredAt: Date.now() }],
  };
  for (const [field, value] of Object.entries(forbiddenConnectionFields)) {
    const rejected = sessionService.connectProfile(
      bundle.session.id,
      { ...inputDataContract, [field]: value },
      qr.pairingToken,
    );
    assert.equal(rejected.status, 422, `strict connect rejects operational field ${field}`);
    assert.equal(rejected.reason, 'INVALID_STEPLY_DATA_CONTRACT');
    const rejectedState = sessionService.getSessionStatus(bundle.session.id);
    assert.equal(rejectedState.profile, null, `${field} rejection does not partially connect a profile`);
    assert.equal(rejectedState.dataContract, null, `${field} rejection does not persist payload data`);
  }
  const rejectedProfileTimestamp = sessionService.connectProfile(
    bundle.session.id,
    { ...inputDataContract, profile: { ...inputDataContract.profile, updatedAt: Date.now() } },
    qr.pairingToken,
  );
  assert.equal(rejectedProfileTimestamp.status, 422, 'strict connect rejects redundant profile.updatedAt');
  assert.equal(rejectedProfileTimestamp.reason, 'INVALID_STEPLY_DATA_CONTRACT');

  const expectedDataContract = normalizeSteplyDataContract(inputDataContract);
  const connected = sessionService.connectProfile(
    bundle.session.id,
    inputDataContract,
    qr.pairingToken,
  );
  assert.equal(Boolean(connected.error), false, 'production profile connection succeeds');
  assert.deepEqual(connected.session.dataContract, expectedDataContract, 'production connection preserves the strict Stage 5 data contract');
  assert.equal(connected.session.dataContract.recentAssessments.length, 1, 'connection retains only the bounded valid recent-assessment projection');
  for (const field of Object.keys(forbiddenConnectionFields)) {
    assert.equal(Object.hasOwn(connected.session.dataContract, field), false, `${field} is absent from the canonical connection contract`);
    assert.equal(JSON.stringify(connected.session).includes(`"${field}"`), false, `${field} is absent from the Web public session`);
  }
  assert.equal(connected.session.profile.sex, 'FEMALE');
  assert.equal(Object.hasOwn(connected.session.profile, 'gender'), false);
  assert.equal(Object.hasOwn(connected.session.profile, 'updatedAt'), false);

  mobileSocket = await openSocket(`${wsBase}/ws?sessionId=${bundle.session.id}&role=mobile`);
  const mobileFrame = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from(VIDEO_MARKER, 'utf8'),
    Buffer.from([0xff, 0xd9]),
  ]);
  mobileSocket.send(JSON.stringify({
    type: 'camera-frame-meta',
    mobileSequence: 1,
    capturedAtUptimeMs: 1_234,
    sentAtEpochMs: Date.now(),
    byteLength: mobileFrame.length,
  }));
  const liveFramePromise = dashboard.waitForBinary((value) => value.includes(Buffer.from(VIDEO_MARKER)));
  mobileSocket.send(mobileFrame);
  await liveFramePromise;
  assert.ok(dashboard.binaries.some((value) => value.includes(Buffer.from(VIDEO_MARKER))), 'privacy marker traverses only the live binary frame channel');

  let current = sessionService.getSessionStatus(bundle.session.id).assessmentSession;
  let update = sessionService.updateAssessmentSession(bundle.session.id, {
    type: 'SCREENING_UPDATED',
    messageId: 'stage5-screening',
    expectedRevision: current.revision,
    screening: {
      status: 'COMPLETED',
      responses: {
        fallenPastYear: false,
        feelsUnsteady: true,
        worriedAboutFalling: false,
      },
      fallHistory: {
        count: 'ZERO',
        injuriousFall: false,
      },
    },
  });
  assert.equal(Boolean(update.error), false);
  current = update.assessmentSession;
  update = sessionService.updateAssessmentSession(bundle.session.id, {
    type: 'OPERATIONAL_CONTEXT_UPDATED',
    messageId: 'stage5-operational-context',
    expectedRevision: current.revision,
    operationalContext: {
      operationalConfigVersion: STAGE2_OPERATIONAL_RULE_VERSION,
      supportRoiNormalized: SUPPORT_ROI,
    },
  });
  assert.equal(Boolean(update.error), false);

  const baseTime = Date.now();
  const invalidBalance = balanceResult({ completedAt: baseTime + 10_000, invalid: true });
  const invalidSaved = analysisService.saveFinalResult(finalPayload(bundle.session.id, invalidBalance));
  assert.equal(invalidSaved.invalidAttempt, true, 'production persistence retains the invalid attempt');
  assert.equal(invalidSaved.excludeFromTrends, true, 'production persistence marks the invalid attempt for trend exclusion');
  const secondInvalidBalance = balanceResult({
    completedAt: baseTime + 11_000,
    invalid: true,
    suffix: '-b',
  });
  const secondInvalidSaved = analysisService.saveFinalResult(finalPayload(bundle.session.id, secondInvalidBalance));
  assert.equal(secondInvalidSaved.invalidAttempt, true, 'a second distinct invalid attempt is retained independently');
  assert.equal(secondInvalidSaved.excludeFromTrends, true);

  await closeSocket(mobileSocket);
  mobileSocket = null;

  const landmarkInputs = [invalidBalance, secondInvalidBalance].map((result, index) => invalidG2LandmarkEnvelope(
    secondInvalidSaved.assessmentSession.assessmentSessionId,
    result,
    { suffix: `g2-${index + 1}` },
  ));
  const expectedLandmarkEnvelopes = landmarkInputs.map((value) => normalizeLandmarkSeriesFinalized(value));
  landmarkInputs.forEach((value) => dashboardSocket.send(JSON.stringify(value)));
  await waitUntil(() => pendingLandmarkSeriesMessages(bundle.session.id).length === 2);
  assert.deepEqual(
    pendingLandmarkSeriesMessages(bundle.session.id).map((value) => value.series.seriesId).sort(),
    expectedLandmarkEnvelopes.map((value) => value.series.seriesId).sort(),
    'disconnected Mobile leaves both distinct finalized series independently pending',
  );

  const duplicateAttempt = structuredClone(landmarkInputs[0]);
  duplicateAttempt.messageId = 'stage5-landmark-message-duplicate-attempt';
  duplicateAttempt.series.seriesId = 'stage5-landmark-series-duplicate-attempt';
  const duplicateAttemptError = dashboard.waitForNext((message) => (
    message.type === 'landmark-series.error'
      && message.messageId === duplicateAttempt.messageId
  ));
  dashboardSocket.send(JSON.stringify(duplicateAttempt));
  assert.equal((await duplicateAttemptError).reason, 'ATTEMPT_ID_CONFLICT', 'one finalized full series is allowed per assessment attempt');

  const statusMismatch = invalidG2LandmarkEnvelope(
    invalidSaved.assessmentSession.assessmentSessionId,
    invalidBalance,
    { suffix: 'status-mismatch', status: 'VALID' },
  );
  const statusMismatchError = dashboard.waitForNext((message) => (
    message.type === 'landmark-series.error'
      && message.messageId === statusMismatch.messageId
  ));
  dashboardSocket.send(JSON.stringify(statusMismatch));
  assert.equal((await statusMismatchError).reason, 'RESULT_LINKAGE_MISMATCH', 'attempt/result status mismatch is never queued');

  const reconnected = await openCollectedSocket(`${wsBase}/ws?sessionId=${bundle.session.id}&role=mobile`);
  mobileSocket = reconnected.socket;
  const replayMobile = reconnected.collector;
  const relayedLandmarks = await Promise.all(expectedLandmarkEnvelopes.map((expected) => (
    replayMobile.waitFor((message) => (
      message.type === 'landmark-series.finalized'
        && message.messageId === expected.messageId
    )).then((actual) => {
      assert.deepEqual(actual, expected, 'reconnect replays each exact canonical landmark-only envelope');
      return actual;
    })
  )));
  assert.equal(relayedLandmarks.length, 2);
  assert.equal(relayedLandmarks[0].series.samples[0].normalizedLandmarks[0].x, -0.01, 'G2 out-of-frame x below zero survives validation');
  assert.equal(relayedLandmarks[0].series.samples[0].normalizedLandmarks[1].x, 1.01, 'G2 out-of-frame x above one survives validation');
  fs.writeFileSync(landmarkContractPath, `${JSON.stringify(relayedLandmarks[0], null, 2)}\n`);

  const landmarkAcks = [];
  for (const relayedLandmark of relayedLandmarks) {
    const landmarkAck = {
      type: 'landmark-series.ack',
      schemaVersion: LANDMARK_SERIES_SCHEMA_VERSION,
      messageId: relayedLandmark.messageId,
      profileId: relayedLandmark.series.profileId,
      assessmentSessionId: relayedLandmark.series.assessmentSessionId,
      attemptId: relayedLandmark.series.attemptId,
      seriesId: relayedLandmark.series.seriesId,
      storedAt: Date.now(),
    };
    const dashboardAckPromise = dashboard.waitForNext((message) => (
      message.type === 'landmark-series.ack'
        && message.seriesId === relayedLandmark.series.seriesId
    ));
    mobileSocket.send(JSON.stringify(landmarkAck));
    assert.deepEqual(await dashboardAckPromise, landmarkAck, 'production relay records each Mobile persistence acknowledgement');
    landmarkAcks.push(landmarkAck);
  }
  assert.equal(pendingLandmarkSeriesMessages(bundle.session.id).length, 0, 'all independently acknowledged series leave the pending map');

  const replayCountBeforeExactRetry = replayMobile.messages.filter((message) => message.type === 'landmark-series.finalized').length;
  const cachedAckPromise = dashboard.waitForNext((message) => (
    message.type === 'landmark-series.ack'
      && message.seriesId === relayedLandmarks[0].series.seriesId
  ));
  dashboardSocket.send(JSON.stringify(landmarkInputs[0]));
  assert.deepEqual(await cachedAckPromise, landmarkAcks[0], 'exact finalized retry receives the stored acknowledgement');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(
    replayMobile.messages.filter((message) => message.type === 'landmark-series.finalized').length,
    replayCountBeforeExactRetry,
    'acknowledged exact retry is not delivered to Mobile again',
  );

  const conflictingDuplicate = structuredClone(landmarkInputs[0]);
  conflictingDuplicate.series.seriesId = 'stage5-landmark-series-conflict';
  const conflictErrorPromise = dashboard.waitForNext((message) => (
    message.type === 'landmark-series.error'
      && message.messageId === conflictingDuplicate.messageId
  ));
  dashboardSocket.send(JSON.stringify(conflictingDuplicate));
  assert.equal((await conflictErrorPromise).reason, 'MESSAGE_ID_CONFLICT', 'altered duplicate is rejected instead of overwriting an acknowledgement');

  const chair = chairResult(baseTime + 20_000);
  const chairSaved = analysisService.saveFinalResult(finalPayload(bundle.session.id, chair));
  assert.equal(Boolean(chairSaved.error), false);
  const balance = balanceResult({ completedAt: baseTime + 30_000 });
  const engine = await vite.ssrLoadModule('/client/src/pipeline/recommendation/otagoExerciseEngine.js');
  const aggregateVulnerability = {
    ruleVersion: 'stage3_vulnerability.v1',
    activeIds: ['V6', 'V7'],
    evidence: [
      ...chair.vulnerabilityAssessment.evidence,
      ...balance.vulnerabilityAssessment.evidence,
    ],
  };
  const assessmentSessionId = chairSaved.assessmentSession.assessmentSessionId;
  const plan = engine.createFuzzyTopsisOtagoExercisePlan({
    userId: 'stage5-profile',
    vulnerabilityAssessment: aggregateVulnerability,
    riskLevel: 'MODERATE',
    sourceAssessments: [
      { ...chair, assessmentId: assessmentSessionId },
      { ...balance, assessmentId: assessmentSessionId },
    ],
  }).value;
  const prescriptionSourceAssessments = [
    { ...chair, assessmentId: assessmentSessionId },
    { ...balance, assessmentId: assessmentSessionId },
  ];
  const highPrescriptionInput = {
    userId: 'stage5-profile',
    vulnerabilityAssessment: {
      ...aggregateVulnerability,
      activeIds: ['V1', 'V3'],
      evidence: [
        { vulnerabilityId: 'V1', sourceResultId: balance.resultId, measurements: { tandemHoldSeconds: 7.25, initialToStaticRatio: 1.75 } },
        { vulnerabilityId: 'V3', sourceResultId: chair.resultId, measurements: { completedRepetitions: 9, cdcCutoff: 12 } },
      ],
    },
    riskLevel: 'HIGH',
    sourceAssessments: prescriptionSourceAssessments,
  };
  const highPendingPrescription = engine.createFuzzyTopsisOtagoExercisePlan(highPrescriptionInput).value;
  const highApprovedPrescription = engine.createFuzzyTopsisOtagoExercisePlan({
    ...highPrescriptionInput,
    professionalApproval: {
      status: 'APPROVED',
      approvalId: 'stage5-professional-approval',
      approvedByRole: 'PROFESSIONAL',
      approvedAt: baseTime + 31_000,
    },
  }).value;
  const blockedPrescription = engine.createFuzzyTopsisOtagoExercisePlan({
    userId: 'stage5-profile',
    vulnerabilityAssessment: { ruleVersion: 'stage3_vulnerability.v1', activeIds: [], evidence: [] },
    riskLevel: 'LOW',
    sourceAssessments: prescriptionSourceAssessments,
  }).value;
  fs.writeFileSync(highPendingPrescriptionPath, `${JSON.stringify(highPendingPrescription, null, 2)}\n`);
  fs.writeFileSync(highApprovedPrescriptionPath, `${JSON.stringify(highApprovedPrescription, null, 2)}\n`);
  fs.writeFileSync(blockedPrescriptionPath, `${JSON.stringify(blockedPrescription, null, 2)}\n`);
  const balanceSaved = analysisService.saveFinalResult(finalPayload(bundle.session.id, balance, plan));
  assert.equal(balanceSaved.aggregateComplete, true, 'production services create a completed aggregate');

  const finalUpdate = await dashboard.waitFor((message) => (
    message.type === 'assessment-session.updated'
      && message.session?.status === 'COMPLETED'
  ));
  const serialized = JSON.stringify(finalUpdate);
  assert.equal(serialized.includes(VIDEO_MARKER), false, 'raw video bytes never enter the assessment JSON');
  assert.equal(serialized.includes('"frame"'), false, 'raw frame fields never enter the assessment JSON');
  assert.equal(finalUpdate.session.functionalTests.CHAIR_STAND_30S.acceptedResult.chairStand.cdcScoredRepetitions, 0);
  assert.equal(finalUpdate.session.functionalTests.CHAIR_STAND_30S.acceptedResult.chairStand.completedRepetitions, 9);
  assert.equal(finalUpdate.session.functionalTests.CHAIR_STAND_30S.acceptedResult.chairStand.observedRepetitions, 11);
  assert.equal(finalUpdate.session.functionalTests.FOUR_STAGE_BALANCE.acceptedResult.balance.stages[2].holdSeconds, 7.25);
  assert.ok(finalUpdate.session.exercisePrescription.plan.selectedExercises.length > 0);
  assert.deepEqual(finalUpdate.session.vulnerabilityAssessment.activeIds, ['V6', 'V7']);
  const invalidAttempt = finalUpdate.session.functionalTests.FOUR_STAGE_BALANCE.attempts
    .find((attempt) => attempt.result?.resultId === 'stage5-balance-invalid');
  assert.equal(invalidAttempt.result.quality.g3ViolationRatio, 0.2001);
  assert.equal(invalidAttempt.result.quality.excludeFromTrends, true);
  assert.equal(JSON.stringify(sessionService.getSessionStatus(bundle.session.id)).includes(VIDEO_MARKER), false, 'production session state never contains raw video bytes');

  fs.writeFileSync(contractPath, `${JSON.stringify(finalUpdate, null, 2)}\n`);

  const clearedMessage = dashboard.waitFor((message) => message.type === 'session-cleared');
  const cleanupResponse = await fetch(`${baseUrl}/api/session/${bundle.session.id}/cleanup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Steply-Pairing-Token': qr.pairingToken,
    },
    body: JSON.stringify({ sessionId: bundle.session.id, reason: 'stage5-contract-complete' }),
  });
  assert.equal(cleanupResponse.status, 200);
  await clearedMessage;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(dashboard.messages.filter((message) => message.type === 'session-cleared').length, 1, 'one explicit cleanup emits one clear event');
  const cleared = sessionService.getSessionStatus(bundle.session.id);
  assert.equal(cleared.profile, null);
  assert.equal(cleared.assessmentSession, null);
  assert.equal(cleared.finalResult, null);
  assert.equal(cleared.careAgentProjection, null);

  execFileSync(
    'bash',
    [
      path.join(mobileRoot, 'gradlew'),
      ':app:testDebugUnitTest',
      '--tests',
      'com.steply.app.sync.WebFinalJsonContractTest',
      '--rerun-tasks',
      '--no-daemon',
    ],
    {
      cwd: mobileRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        STEPLY_WEB_FINAL_JSON_PATH: contractPath,
        STEPLY_WEB_LANDMARK_JSON_PATH: landmarkContractPath,
        STEPLY_WEB_HIGH_PENDING_PRESCRIPTION_PATH: highPendingPrescriptionPath,
        STEPLY_WEB_HIGH_APPROVED_PRESCRIPTION_PATH: highApprovedPrescriptionPath,
        STEPLY_WEB_BLOCKED_PRESCRIPTION_PATH: blockedPrescriptionPath,
        STEPLY_VIDEO_MARKER: VIDEO_MARKER,
      },
    },
  );

  console.log('Stage 5 actual Web JSON -> Mobile strict codec/repository contract passed.');
} finally {
  await closeSocket(mobileSocket);
  await closeSocket(dashboardSocket);
  await new Promise((resolve) => webSocketServer.close(resolve));
  await new Promise((resolve) => httpServer.close(resolve));
  await vite.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
