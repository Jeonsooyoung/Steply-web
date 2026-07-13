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
const { stage5DataContractFixture } = require('./fixtures/stage5DataContractFixture.cjs');
const {
  canPersistAssessmentResult: canPersistOnServer,
} = require('../src/services/assessmentResultPersistence');
const DEFAULT_COMPLETED_AT = 1_750_000_030_000;

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
    startedAt: DEFAULT_COMPLETED_AT - 30_000,
    completedAt: DEFAULT_COMPLETED_AT,
    ...overrides,
  };
}

const bundle = await sessionService.createSession('https://127.0.0.1:3000', ['https://127.0.0.1:3000']);
const payload = JSON.parse(bundle.qrPayload);
sessionService.connectProfile(
  bundle.session.id,
  stage5DataContractFixture({ id: 'safety-profile', displayName: 'Safety Profile', birthYear: 1955 }),
  payload.pairingToken,
);
const screeningUpdate = sessionService.updateAssessmentSession(bundle.session.id, {
  type: 'SCREENING_UPDATED',
  messageId: 'screening-complete-1',
  screening: {
    status: 'COMPLETED',
    responses: {
      fallenPastYear: false,
      feelsUnsteady: true,
      worriedAboutFalling: false,
    },
    fallHistory: { count: 'ZERO', injuriousFall: false },
  },
});
assert.equal(screeningUpdate.applied, true);

const validSave = analysisService.saveFinalResult(liveFinal(bundle.session.id));
assert.equal(Boolean(validSave.error), false);
assert.equal(validSave.aggregateComplete, false, 'one test cannot complete the aggregate');
assert.equal(validSave.assessmentSession.steadi.status, 'NOT_SCORABLE');
assert.equal(validSave.assessmentSession.exercisePrescription.status, 'NOT_GENERATED');
assert.equal(sessionService.getSessionStatus(bundle.session.id).finalResult, null, 'one test is not exposed as product final');
assert.equal(sessionService.getSessionStatus(bundle.session.id).latestResult.resultKey, validSave.resultKey);

const duplicateChair = analysisService.saveFinalResult(liveFinal(bundle.session.id));
assert.equal(duplicateChair.duplicate, true, 'same analysis result is idempotent');
assert.equal(sessionService.getSessionStatus(bundle.session.id).latestResult.resultKey, validSave.resultKey, 'duplicate result does not replace latest result');

const prescriptionVite = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'silent',
});
const prescriptionEngine = await prescriptionVite.ssrLoadModule('/client/src/pipeline/recommendation/otagoExerciseEngine.js');
const fuzzyRecommendationPlan = prescriptionEngine.createFuzzyTopsisOtagoExercisePlan({
  userId: 'safety-profile',
  riskLevel: 'LOW',
  vulnerabilityAssessment: {
    ruleVersion: 'stage2_vulnerability.v1',
    activeIds: ['V1'],
    evidence: [{ vulnerabilityId: 'V1', sourceResultId: null, measurements: { testFixture: true } }],
  },
}).value;
await prescriptionVite.close();

const balanceCompletedAt = Date.now() + 1_000;
const balanceSave = analysisService.saveFinalResult(liveFinal(bundle.session.id, {
  analysisSessionId: 'analysis-live-balance-1',
  assessmentType: 'FOUR_STAGE_BALANCE',
  testType: 'four_stage_balance',
  primaryValue: 10,
  repetitionCount: undefined,
  startedAt: balanceCompletedAt - 40_000,
  completedAt: balanceCompletedAt,
  recommendationPlan: fuzzyRecommendationPlan,
}));
assert.equal(Boolean(balanceSave.error), false);
assert.equal(balanceSave.aggregateComplete, true, 'second valid test completes the aggregate');
assert.equal(balanceSave.assessmentSession.status, 'COMPLETED');
assert.equal(balanceSave.assessmentSession.steadi.riskLevel, 'LOW');
assert.equal(balanceSave.assessmentSession.exercisePrescription.status, 'ACTIVE');
assert.equal(sessionService.getSessionStatus(bundle.session.id).latestResult.resultKey, balanceSave.resultKey);

const duplicateBalance = analysisService.saveFinalResult(liveFinal(bundle.session.id, {
  analysisSessionId: 'analysis-live-balance-1',
  assessmentType: 'FOUR_STAGE_BALANCE',
  testType: 'four_stage_balance',
  primaryValue: 10,
  startedAt: balanceCompletedAt - 40_000,
  completedAt: balanceCompletedAt,
}));
assert.equal(duplicateBalance.duplicate, true);
assert.equal(sessionService.getSessionStatus(bundle.session.id).latestResult.resultKey, balanceSave.resultKey);

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
assert.equal(sessionService.getSessionStatus(bundle.session.id).latestResult.resultKey, balanceSave.resultKey);

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
    buildFinalAnalysisPayload,
  } = await vite.ssrLoadModule('/client/src/hooks/useSteplyDashboard.js');

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

  const demoResult = liveFinal('demo-session', {
    source: 'DEMO',
    isPersistable: false,
    isClinicallyScorable: false,
    recommendations: [],
    recommendationPlan: { recommendedExercises: [] },
    carePipeline: null,
  });
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
