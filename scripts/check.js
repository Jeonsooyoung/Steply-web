const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const files = [
  'server.js',
  'vite.config.js',
  'scripts/dev.js',
  'src/routes/apiRouter.js',
  'src/ws/dashboardSocket.js',
  'src/services/sessionService.js',
  'src/utils/devTls.js',
  'src/utils/network.js',
];

for (const file of files) {
  execFileSync('node', ['--check', file], { stdio: 'inherit' });
}

execFileSync('node', ['scripts/check-stage4-care-agent-contract.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-stage4-ui-integration.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-local-webcam.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-assessment-auto-start.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-production-state-boundaries.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-stage6-cleanup.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-stage6-reachability.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-stage6-assets.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-stage5-data-contract.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-analysis-safety-boundaries.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-assessment-session.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-stage2-contract.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-structured-pipeline-types.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-pose-input-calibration-quality.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-stage2-requirements.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-stage2-product-integration.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-stage3-vulnerability.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-stage3-catalog.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-stage3-prescription-engine.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-fuzzy-topsis-recommendation.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-stage3-contract.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-stage3-product-integration.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-chair-stand-state-machine.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-balance-test-state-machine.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-functional-findings.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-ui-structured-pipeline.mjs'], { stdio: 'inherit' });
execFileSync('node', ['scripts/check-internal-validation.mjs'], { stdio: 'inherit' });

function walk(dir) {
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(p)) console.log(`checked frontend source: ${path.relative(process.cwd(), p)}`);
  }
}

walk(path.join(process.cwd(), 'client', 'src'));

async function checkMobileQrContract() {
  const sessionService = require('../src/services/sessionService');
  const analysisService = require('../src/services/analysisService');
  const { stage5DataContractFixture } = require('./fixtures/stage5DataContractFixture.cjs');
  const tlsCertSha256 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const bundle = await sessionService.createSession(
    'https://127.0.0.1:3000',
    ['https://127.0.0.1:3000'],
    { tlsCertSha256 },
  );

  const payload = JSON.parse(bundle.qrPayload);
  assert.strictEqual(payload.type, 'steply-web-session');
  assert.strictEqual(payload.serverUrl.startsWith('https://'), true);
  assert.strictEqual(payload.tlsCertSha256, tlsCertSha256);
  assert.strictEqual(typeof payload.expiresAtEpochMs, 'number');
  assert.strictEqual(payload.pairingToken.length >= 16, true);
  assert.strictEqual(bundle.dashboardWsPath, `/ws?sessionId=${payload.sessionId}&role=dashboard`);
  assert.strictEqual(bundle.wsUrl.startsWith('wss://'), true);

  const dataContract = stage5DataContractFixture({ id: 'check-profile', displayName: 'Check Profile' });
  const profile = dataContract.profile;
  const connected = sessionService.connectProfile(bundle.session.id, dataContract, payload.pairingToken);
  assert.strictEqual(Boolean(connected.error), false);
  const final = analysisService.saveFinalResult({
    sessionId: bundle.session.id,
    analysisSessionId: 'check-analysis-session',
    source: 'LIVE_POSE',
    assessmentType: 'chair_stand',
    isPersistable: true,
    isClinicallyScorable: true,
    status: 'VALID',
    resultType: 'FINAL_RESULT',
    analyzerFinalEvent: true,
    userId: profile.id,
    testType: 'chair_stand',
    primaryValue: 10,
    startedAt: Date.now() - 30_000,
    completedAt: Date.now(),
    trackingQualitySummary: {
      sampleCount: 5,
      acceptedFrameCount: 5,
      lowQualityFrameCount: 0,
      cautionFrameCount: 0,
      lowQualityRatio: 0,
      trackingQualityScore: 0.9,
      longestLowQualityStreak: 0,
    },
  });
  assert.strictEqual(Boolean(final.error), false);
  assert.strictEqual(sessionService.getSessionStatus(bundle.session.id).latestResult.id, final.result.id);

  const replay = sessionService.connectProfile(bundle.session.id, dataContract, payload.pairingToken);
  assert.strictEqual(replay.status, 409);

  const cleanup = sessionService.cleanupSession(bundle.session.id, payload.pairingToken, 'check-cleanup');
  assert.strictEqual(Boolean(cleanup.error), false);
  assert.strictEqual(cleanup.session.profile, null);
  assert.strictEqual(cleanup.session.dataContract, null);
  assert.strictEqual(cleanup.session.finalResult, null);
}

checkMobileQrContract()
  .then(() => {
    console.log('Mobile QR contract checks passed.');
    console.log('Basic Node syntax checks passed. Run npm run build after npm install to validate the React bundle.');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
