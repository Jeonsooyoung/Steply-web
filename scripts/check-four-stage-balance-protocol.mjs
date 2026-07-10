import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const point = (name, x, y, z = null, visibility = 0.95) => ({ name, x, y, z, visibility });

function footPoints(side, x, y, z = null) {
  const prefix = side === 'left' ? 'left' : 'right';
  return [
    point(`${prefix}_ankle`, x, y, z),
    point(`${prefix}_heel`, x - (side === 'left' ? 0.006 : -0.006), y + 0.018, z),
    point(`${prefix}_foot_index`, x + (side === 'left' ? 0.012 : -0.012), y - 0.018, z),
  ];
}

function stageFeet(stageId) {
  if (stageId === 'semi_tandem') {
    return {
      left: { x: 0.48, y: 0.88 },
      right: { x: 0.52, y: 0.84 },
    };
  }
  if (stageId === 'tandem') {
    return {
      left: { x: 0.49, y: 0.90 },
      right: { x: 0.51, y: 0.82 },
    };
  }
  if (stageId === 'one_leg') {
    return {
      left: { x: 0.47, y: 0.88 },
      right: { x: 0.57, y: 0.74 },
    };
  }
  return {
    left: { x: 0.45, y: 0.88 },
    right: { x: 0.55, y: 0.88 },
  };
}

function balanceFrame(stageId, timestampMs, { armsDown = false, support = false, noisyFootDepth = false } = {}) {
  const feet = stageFeet(stageId);
  const leftWrist = support
    ? { x: 0.24, y: 0.58 }
    : armsDown ? { x: 0.42, y: 0.70 } : { x: 0.38, y: 0.50 };
  const rightWrist = support
    ? { x: 0.76, y: 0.58 }
    : armsDown ? { x: 0.58, y: 0.70 } : { x: 0.62, y: 0.50 };
  const landmarks = [
    point('nose', 0.5, 0.18),
    point('left_shoulder', 0.40, 0.32),
    point('right_shoulder', 0.60, 0.32),
    point('left_elbow', 0.36, 0.46),
    point('right_elbow', 0.64, 0.46),
    point('left_wrist', leftWrist.x, leftWrist.y),
    point('right_wrist', rightWrist.x, rightWrist.y),
    point('left_hip', 0.44, 0.54),
    point('right_hip', 0.56, 0.54),
    point('left_knee', feet.left.x, 0.70),
    point('right_knee', feet.right.x, 0.70),
    ...footPoints('left', feet.left.x, feet.left.y, noisyFootDepth ? -0.28 : null),
    ...footPoints('right', feet.right.x, feet.right.y, noisyFootDepth ? 0.28 : null),
  ];
  return {
    timestampMs,
    confidence: 0.95,
    landmarks,
  };
}

function addStageFrames(analyzer, stageId, startMs, durationMs, stepMs = 250, options = {}) {
  let timestampMs = startMs;
  const endMs = startMs + durationMs;
  while (timestampMs <= endMs) {
    analyzer.addFrame(balanceFrame(stageId, timestampMs, options));
    timestampMs += stepMs;
  }
  return timestampMs;
}

const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
});

try {
  const { FourStageBalanceAnalyzer } = await server.ssrLoadModule('/client/src/pose/fourStageBalanceAnalyzer.js');

  const completeAnalyzer = new FourStageBalanceAnalyzer({ durationSeconds: 60 });
  completeAnalyzer.startSession('protocol-complete', 1000);
  let timestampMs = 1000;
  for (const stageId of ['side_by_side', 'semi_tandem', 'tandem', 'one_leg']) {
    timestampMs = addStageFrames(completeAnalyzer, stageId, timestampMs, 11000);
  }
  const completeResult = completeAnalyzer.finishSession(timestampMs);
  assert.equal(completeResult.balanceResult.officialProtocol.status, 'completed');
  assert.equal(completeResult.balanceResult.officialProtocol.completedCount, 4);
  assert.equal(completeResult.balanceResult.stageById.side_by_side.status, 'completed');
  assert.equal(completeResult.balanceResult.stageById.semi_tandem.status, 'completed');
  assert.equal(completeResult.balanceResult.stageById.tandem.status, 'completed');
  assert.equal(completeResult.balanceResult.stageById.one_leg.status, 'completed');
  assert.equal(completeResult.primaryValue, 10);

  const stopAnalyzer = new FourStageBalanceAnalyzer({ durationSeconds: 60 });
  stopAnalyzer.startSession('protocol-stop', 1000);
  timestampMs = 1000;
  timestampMs = addStageFrames(stopAnalyzer, 'side_by_side', timestampMs, 11000);
  timestampMs = addStageFrames(stopAnalyzer, 'semi_tandem', timestampMs, 4000);
  timestampMs = addStageFrames(stopAnalyzer, 'side_by_side', timestampMs, 1500);
  timestampMs = addStageFrames(stopAnalyzer, 'tandem', timestampMs, 11000);
  const stopResult = stopAnalyzer.finishSession(timestampMs);
  assert.equal(stopResult.balanceResult.officialProtocol.status, 'stopped');
  assert.equal(stopResult.balanceResult.officialProtocol.failureReason, 'feet_moved');
  assert.equal(stopResult.balanceResult.stageById.side_by_side.status, 'completed');
  assert.equal(stopResult.balanceResult.stageById.semi_tandem.status, 'observed');
  assert.equal(stopResult.balanceResult.stageById.tandem.status, 'not_observed');
  assert.equal(stopResult.balanceResult.stageById.tandem.holdSeconds, 0);
  assert.equal(stopResult.primaryValue, 0);

  const armsDownAnalyzer = new FourStageBalanceAnalyzer({ durationSeconds: 60 });
  armsDownAnalyzer.startSession('protocol-arms-down', 1000);
  timestampMs = addStageFrames(armsDownAnalyzer, 'side_by_side', 1000, 11000, 250, { armsDown: true });
  const armsDownResult = armsDownAnalyzer.finishSession(timestampMs);
  assert.equal(armsDownResult.balanceResult.stageById.side_by_side.status, 'completed');
  assert.notEqual(armsDownResult.balanceResult.officialProtocol.failureReason, 'support_used');

  const noisyDepthAnalyzer = new FourStageBalanceAnalyzer({ durationSeconds: 60 });
  noisyDepthAnalyzer.startSession('protocol-noisy-depth', 1000);
  timestampMs = addStageFrames(noisyDepthAnalyzer, 'side_by_side', 1000, 11000, 250, { noisyFootDepth: true });
  const noisyDepthResult = noisyDepthAnalyzer.finishSession(timestampMs);
  assert.equal(noisyDepthResult.balanceResult.stageById.side_by_side.status, 'completed');
  assert.notEqual(noisyDepthResult.balanceResult.officialProtocol.failureReason, 'feet_moved');

  const supportAnalyzer = new FourStageBalanceAnalyzer({ durationSeconds: 60 });
  supportAnalyzer.startSession('protocol-support', 1000);
  timestampMs = 1000;
  timestampMs = addStageFrames(supportAnalyzer, 'side_by_side', timestampMs, 11000);
  timestampMs = addStageFrames(supportAnalyzer, 'semi_tandem', timestampMs, 1500);
  timestampMs = addStageFrames(supportAnalyzer, 'semi_tandem', timestampMs, 1500, 250, { support: true });
  const supportResult = supportAnalyzer.finishSession(timestampMs);
  assert.equal(supportResult.balanceResult.officialProtocol.status, 'stopped');
  assert.equal(supportResult.balanceResult.officialProtocol.failureReason, 'support_used');

  console.log('4-stage balance official protocol checks passed.');
} finally {
  await server.close();
}
