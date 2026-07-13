import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { createDefaultReplayFixtures } from './validation/landmarkReplayRunner.mjs';

const require = createRequire(import.meta.url);
const { normalizeStage2Result } = require('../shared/stage2Contract.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'silent',
});

const qualitySummary = {
  trackingQualityScore: 0.92,
  accumulatedPauseDurationMs: 0,
  gates: ['G1', 'G2', 'G3', 'G4', 'G5'].map((gate) => ({
    gate,
    violationFrameCount: 0,
    violationDurationMs: 0,
    violationRatio: 0,
  })),
  g3ViolationRatio: 0,
};

function readyCalibration(fixture) {
  fixture.calibrationProfile.sampledDurationMs = 3_000;
  if (fixture.assessmentType === 'FOUR_STAGE_BALANCE') {
    Object.assign(fixture.calibrationProfile.references, {
      L_foot: fixture.calibrationProfile.bodyScale.averageFootLength,
      H_stand: 0.44,
      W_shoulder: fixture.calibrationProfile.bodyScale.shoulderWidth,
    });
  }
  return fixture;
}

function runAnalyzer(createMovementAnalyzer, fixture, options = {}) {
  const test = fixture.assessmentType === 'CHAIR_STAND_30S' ? 'chair_stand' : 'four_stage_balance';
  const analyzer = createMovementAnalyzer(test, options);
  const sessionId = fixture.frames[0].poseFrame.sessionId;
  analyzer.startSession('integration-user', 0, sessionId);
  for (const entry of fixture.frames) {
    analyzer.addFrame({
      poseFrame: entry.poseFrame,
      calibrationProfile: fixture.calibrationProfile,
      qualityStatus: entry.qualityStatus,
    });
  }
  return analyzer.finishSession(fixture.frames.at(-1).poseFrame.timestampMs, { qualitySummary });
}

try {
  const { createMovementAnalyzer } = await server.ssrLoadModule('/client/src/pose/movementAnalyzers.js');
  const fixtures = createDefaultReplayFixtures().map(readyCalibration);

  const chair = runAnalyzer(
    createMovementAnalyzer,
    fixtures.find((fixture) => fixture.caseId === 'chair_normal_three_reps'),
    { profile: { ageYears: 70, sex: 'MALE' } },
  );
  const normalizedChair = normalizeStage2Result(chair.stage2Result);
  assert.equal(chair.structuredAssessmentValidation.ok, true, 'S2-CONTRACT-01 Chair producer result validates');
  assert.equal(normalizedChair.chairStand.completedRepetitions, 3, 'S2-CHAIR-02 producer preserves reps');
  assert.ok(normalizedChair.vulnerabilityAssessment.activeIds.includes('V3'), 'S2-VULN-01 producer applies CDC cutoff with profile');

  const firstArmFixture = fixtures.find((fixture) => fixture.caseId === 'chair_confirmed_arm_support_invalid');
  const firstArm = normalizeStage2Result(runAnalyzer(
    createMovementAnalyzer,
    firstArmFixture,
    { profile: { ageYears: 70, sex: 'MALE' } },
  ).stage2Result);
  assert.equal(firstArm.status, 'INVALID', 'S2-CHAIR-04 first arm use is a recorded restart attempt');
  assert.equal(firstArm.chairStand.armUse.outcome, 'RESTART_REQUIRED');

  const secondArm = normalizeStage2Result(runAnalyzer(
    createMovementAnalyzer,
    firstArmFixture,
    { armUseOccurrenceCount: 1, profile: { ageYears: 70, sex: 'MALE' } },
  ).stage2Result);
  assert.equal(secondArm.status, 'VALID', 'S2-CHAIR-04 second arm use is clinically scorable');
  assert.equal(secondArm.chairStand.cdcScoredRepetitions, 0);
  assert.ok(secondArm.vulnerabilityAssessment.activeIds.includes('V6'));

  const balance = runAnalyzer(
    createMovementAnalyzer,
    fixtures.find((fixture) => fixture.caseId === 'balance_one_leg_touchdown_fail'),
  );
  const normalizedBalance = normalizeStage2Result(balance.stage2Result);
  assert.equal(balance.structuredAssessmentValidation.ok, true, 'S2-CONTRACT-01 Balance producer result validates');
  assert.equal(normalizedBalance.balance.stages[3].failureCode, 'F3', 'S2-BAL-F3 producer maps touchdown');
  assert.equal(normalizedBalance.balance.stages[3].failureReason, 'LIFTED_FOOT_TOUCHED_DOWN');
  assert.notDeepEqual(
    normalizedBalance.balance.stages[0].sway,
    normalizedBalance.balance.stages[3].sway,
    'S2-BAL-SWAY stages retain separate sway objects',
  );

  console.log('Stage 2 product integration checks passed.');
} finally {
  await server.close();
}
