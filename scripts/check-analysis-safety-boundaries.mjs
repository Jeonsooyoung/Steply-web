import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const sessionService = require('../src/services/sessionService');
const analysisService = require('../src/services/analysisService');
const historyRepository = require('../src/repositories/historyRepository');
const {
  canPersistAssessmentResult: canPersistOnServer,
} = require('../src/services/assessmentResultPersistence');

function qualitySummary() {
  return {
    sampleCount: 5,
    acceptedFrameCount: 5,
    lowQualityFrameCount: 0,
    cautionFrameCount: 0,
    lowQualityRatio: 0,
    trackingQualityScore: 0.91,
    longestLowQualityStreak: 0,
  };
}

function liveFinal(sessionId, overrides = {}) {
  return {
    sessionId,
    analysisSessionId: 'analysis-live-1',
    source: 'LIVE_POSE',
    assessmentType: 'chair_stand',
    isPersistable: true,
    isClinicallyScorable: true,
    status: 'VALID',
    resultType: 'FINAL_RESULT',
    analyzerFinalEvent: true,
    userId: 'safety-profile',
    testType: 'chair_stand',
    primaryValue: 10,
    repetitionCount: 10,
    confidence: 0.91,
    trackingQualityScore: 0.91,
    trackingQualitySummary: qualitySummary(),
    startedAt: Date.now() - 30_000,
    completedAt: Date.now(),
    ...overrides,
  };
}

const bundle = await sessionService.createSession('https://127.0.0.1:3000', ['https://127.0.0.1:3000']);
const payload = JSON.parse(bundle.qrPayload);
sessionService.connectProfile(
  bundle.session.id,
  { id: 'safety-profile', displayName: 'Safety Profile' },
  payload.pairingToken,
);

const validSave = analysisService.saveFinalResult(liveFinal(bundle.session.id));
assert.equal(Boolean(validSave.error), false);
assert.equal(historyRepository.readHistory().items.length, 1);

const rejectedCases = [
  ['DEMO result rejected', liveFinal(bundle.session.id, { source: 'DEMO', isPersistable: false, isClinicallyScorable: false })],
  ['FALLBACK result rejected', liveFinal(bundle.session.id, { source: 'FALLBACK', isPersistable: false, isClinicallyScorable: false })],
  ['FRAME_RESULT rejected', liveFinal(bundle.session.id, { resultType: 'FRAME_RESULT' })],
  ['INCOMPLETE result rejected', liveFinal(bundle.session.id, { status: 'INCOMPLETE', isPersistable: false })],
  ['missing sessionId rejected', liveFinal('', {})],
];

for (const [label, result] of rejectedCases) {
  const saved = analysisService.saveFinalResult(result);
  assert.equal(Boolean(saved.error), true, label);
}
assert.equal(historyRepository.readHistory().items.length, 1);

const staleSessionCheck = canPersistOnServer(liveFinal(bundle.session.id, { analysisSessionId: 'old-analysis' }), {
  session: { id: bundle.session.id, activeAnalysisSessionId: 'new-analysis' },
});
assert.equal(staleSessionCheck.ok, false);
assert.equal(staleSessionCheck.reason, 'STALE_ANALYSIS_SESSION');

const vite = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});

try {
  const {
    canPersistAssessmentResult,
  } = await vite.ssrLoadModule('/client/src/pose/assessmentResultMetadata.js');
  const {
    evaluateFrameQuality,
  } = await vite.ssrLoadModule('/client/src/pose/trackingQuality.js');
  const {
    evaluateSetupReadiness,
  } = await vite.ssrLoadModule('/client/src/pose/poseQuality.js');
  const {
    buildFinalAnalysisPayload,
  } = await vite.ssrLoadModule('/client/src/hooks/useSteplyDashboard.js');
  const {
    buildDemoFinalResult,
  } = await vite.ssrLoadModule('/client/src/data/serviceModels.js');

  assert.equal(canPersistAssessmentResult(liveFinal(bundle.session.id)).ok, true);
  assert.equal(canPersistAssessmentResult(liveFinal(bundle.session.id, { source: 'DEMO', isPersistable: false })).ok, false);
  assert.equal(canPersistAssessmentResult(liveFinal(bundle.session.id, { resultType: 'FRAME_RESULT' })).reason, 'FRAME_RESULT');
  assert.equal(canPersistAssessmentResult(liveFinal(bundle.session.id, { status: 'INCOMPLETE' })).reason, 'NON_VALID_RESULT');
  assert.equal(
    canPersistAssessmentResult(liveFinal(bundle.session.id, { analysisSessionId: 'old' }), { activeAnalysisSessionId: 'new' }).reason,
    'STALE_ANALYSIS_SESSION',
  );

  const disagreement = evaluateFrameQuality({
    frameId: 'quality-disagreement',
    readiness: {
      fullBodyVisible: true,
      feetVisible: true,
      singlePersonDetected: true,
      brightnessOk: false,
      trackingQualityScore: 0.5,
      trackingQuality: { trackingQualityScore: 0.5, brightness: 0.1 },
    },
  });
  assert.equal(disagreement.disagreement, true);
  assert.equal(disagreement.legacy.generalGateResult, 'BLOCK');
  assert.equal(disagreement.legacy.movementGateResult, 'PASS');

  const setup = evaluateSetupReadiness({ landmarks: [], poseCount: 0, testType: 'chair_stand' });
  assert.equal(Boolean(setup.qualityDecision), true);

  const demoResult = buildDemoFinalResult('chair_stand');
  const demoPayload = buildFinalAnalysisPayload({
    result: demoResult,
    session: { id: 'demo-session', profile: { id: 'demo-profile' } },
    selectedTest: 'chair_stand',
    historyItems: [],
  });
  assert.equal(demoPayload.source, 'DEMO');
  assert.equal(demoPayload.isPersistable, false);
  assert.equal(demoPayload.carePipeline, null);
  assert.equal(demoPayload.recommendations.length, 0);
  assert.equal(demoPayload.recommendationPlan.recommendedExercises.length, 0);
  assert.equal(canPersistAssessmentResult(demoPayload).ok, false);

  console.log('Analysis safety boundary checks passed.');
} finally {
  await vite.close();
}

