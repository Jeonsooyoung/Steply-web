import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});

function balanceResult(tandemHoldSeconds) {
  return {
    schemaVersion: 'balance_result.v1',
    testType: 'four_stage_balance',
    stageById: {
      tandem: { id: 'tandem', holdSeconds: tandemHoldSeconds },
    },
    stages: [
      { id: 'tandem', holdSeconds: tandemHoldSeconds },
    ],
  };
}

function chairStandResult(repetitionCount) {
  return {
    schemaVersion: 'chair_stand_result.v1',
    testType: 'chair_stand',
    repetitionCount,
  };
}

try {
  const {
    SteadiRiskLevels,
    calculateSteadiFallRisk,
    chairStandBelowAverageThreshold,
  } = await server.ssrLoadModule('/client/src/pose/steadiRules.js');

  assert.equal(chairStandBelowAverageThreshold(70, 'female'), 10);

  const profile = { ageYears: 70, sex: 'FEMALE' };
  const cases = [
    {
      name: '0 risk signals',
      balanceHold: 10,
      chairReps: 10,
      expectedSignals: 0,
      expectedRisk: SteadiRiskLevels.Low,
    },
    {
      name: '1 risk signal: tandem under 10s',
      balanceHold: 9.9,
      chairReps: 10,
      expectedSignals: 1,
      expectedRisk: SteadiRiskLevels.Medium,
    },
    {
      name: '1 risk signal: chair stand below average',
      balanceHold: 10,
      chairReps: 9,
      expectedSignals: 1,
      expectedRisk: SteadiRiskLevels.Medium,
    },
    {
      name: '2 risk signals',
      balanceHold: 9.9,
      chairReps: 9,
      expectedSignals: 2,
      expectedRisk: SteadiRiskLevels.High,
    },
  ];

  for (const testCase of cases) {
    const result = calculateSteadiFallRisk({
      balanceResult: balanceResult(testCase.balanceHold),
      chairStandResult: chairStandResult(testCase.chairReps),
      profile,
    });
    assert.equal(result.complete, true, testCase.name);
    assert.equal(result.riskSignalCount, testCase.expectedSignals, testCase.name);
    assert.equal(result.riskLevel, testCase.expectedRisk, testCase.name);
    assert.equal(result.risk, testCase.expectedRisk, testCase.name);
    console.log(`${testCase.name}: ${result.riskLabel} (${result.riskLevel}), signals=${result.riskSignalCount}`);
  }
} finally {
  await server.close();
}
