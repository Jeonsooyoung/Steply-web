import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assessmentTestContract = require('../shared/assessmentTestTypes.json');
const sessionService = require('../src/services/sessionService');
const { requestHandler } = require('../src/routes/apiRouter');

assert.deepEqual(
  assessmentTestContract.allowedTestTypes,
  ['chair_stand', 'four_stage_balance'],
  '[S6-L02] the product contract contains the exact two supported assessment test types',
);
assert.deepEqual(
  [...sessionService.SUPPORTED_ASSESSMENT_TEST_TYPES],
  assessmentTestContract.allowedTestTypes,
  '[S6-L02] server service consumes the shared exact allowlist',
);

const removedPaths = [
  'client/src/components/AnalysisPanel.jsx',
  'client/src/components/ContextNav.jsx',
  'client/src/components/ExercisePanel.jsx',
  'client/src/components/JourneyFlow.jsx',
  'client/src/components/ResultPanel.jsx',
  'client/src/components/SessionRail.jsx',
  'client/src/components/StartPanel.jsx',
  'client/src/data/flowSteps.js',
  'client/src/data/movementTests.js',
  'client/src/pipeline/assessment/session/assessmentSession.js',
  'client/src/pipeline/progress/progressRepository.js',
  'client/src/pipeline/shared/config/persistence.config.js',
  'client/src/pipeline/shared/config/pipeline.config.js',
  'client/src/pipeline/shared/events/analysisLogger.js',
  'client/src/pipeline/ui/resultViewModel.js',
  'client/src/pose/analysisTimeouts.js',
  'client/src/pose/arExerciseEngine.js',
  'client/src/pose/assessmentRules.js',
  'client/src/pose/poseQuality.js',
  'client/src/pose/timedUpAndGoAnalyzer.js',
  'scripts/check-ar-games.mjs',
  'scripts/check-assessment-rules.mjs',
  'scripts/check-pose-quality.mjs',
];
for (const relativePath of removedPaths) {
  assert.equal(fs.existsSync(path.join(root, relativePath)), false, `[S6-L01] ${relativePath} remains deleted`);
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.(?:js|jsx|json)$/.test(entry.name) ? [absolute] : [];
  });
}

const productSource = sourceFiles(path.join(root, 'client/src'))
  .filter((file) => !file.includes(`${path.sep}vendor${path.sep}`))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
for (const forbidden of [
  'timed_up_and_go',
  'TimedUpAndGo',
  'finalResultPatch',
  '.observedState',
  'agent?.loop',
  'carePipeline?.stages',
  'decision?.escalation',
  'createDeterministicOtagoExercisePlan',
  'VULNERABILITY_PRESCRIPTION_MAP',
  'legacy_functional_finding_adapter',
]) {
  assert.equal(productSource.includes(forbidden), false, `[S6-L01] production source excludes ${forbidden}`);
}
assert.equal(
  JSON.stringify(require('../shared/stage2Analysis.config.json')).includes('TUG'),
  false,
  '[S6-L01] central Stage 2 config excludes TUG smoothing',
);

const bundle = await sessionService.createSession('https://127.0.0.1:3000', ['https://127.0.0.1:3000']);
assert.equal(sessionService.selectTest(bundle.session.id, 'chair_stand').session.selectedTest, 'chair_stand');
for (const unsupported of ['timed_up_and_go', 'balance', 'unknown']) {
  const rejected = sessionService.selectTest(bundle.session.id, unsupported);
  assert.equal(rejected.status, 422, `[S6-L02] service rejects ${unsupported}`);
  assert.equal(rejected.reason, 'UNSUPPORTED_ASSESSMENT_TEST_TYPE');
  assert.equal(sessionService.getSessionStatus(bundle.session.id).selectedTest, 'chair_stand', 'rejection cannot mutate selected test');
}

const httpServer = http.createServer(requestHandler);
await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
try {
  const response = await fetch(`http://127.0.0.1:${httpServer.address().port}/api/session/${bundle.session.id}/select-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectedTest: 'timed_up_and_go' }),
  });
  const body = await response.json();
  assert.equal(response.status, 422, '[S6-L02] HTTP API rejects unsupported assessment type');
  assert.equal(body.reason, 'UNSUPPORTED_ASSESSMENT_TEST_TYPE');
} finally {
  await new Promise((resolve) => httpServer.close(resolve));
}

const vite = await createViteServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'silent',
});
try {
  const testTypes = await vite.ssrLoadModule('/client/src/pipeline/shared/assessmentTestTypes.js');
  const analyzers = await vite.ssrLoadModule('/client/src/pose/movementAnalyzers.js');
  const api = await vite.ssrLoadModule('/client/src/api/steplyApi.js');
  assert.deepEqual(testTypes.SUPPORTED_ASSESSMENT_TEST_TYPES, assessmentTestContract.allowedTestTypes);
  assert.doesNotThrow(() => analyzers.createMovementAnalyzer('chair_stand'));
  assert.doesNotThrow(() => analyzers.createMovementAnalyzer('four_stage_balance'));
  assert.throws(() => analyzers.createMovementAnalyzer('timed_up_and_go'), /Unsupported assessment test type/);
  assert.throws(() => api.selectTest('session', 'unknown'), /Unsupported assessment test type/);
} finally {
  await vite.close();
}

const dashboardSource = fs.readFileSync(path.join(root, 'client/src/hooks/useSteplyDashboard.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'client/src/pose/poseLandmarker.worker.js'), 'utf8');
assert.match(dashboardSource, /isSupportedAssessmentTestType\(testId\)/, '[S6-L02] dashboard selection validates before mutation');
assert.match(workerSource, /assertSupportedAssessmentTestType/, '[S6-L02] worker validates every selected assessment type');

console.log('Stage 6 legacy cleanup and assessment allowlist checks passed.');
