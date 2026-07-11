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

try {
  const { PoseLandmarks, MediaPipePoseNames } = await server.ssrLoadModule('/client/src/pose/poseLandmarks.js');
  const { createPoseSmootherForTest } = await server.ssrLoadModule('/client/src/pose/poseSmoother.js');
  const { evaluateCameraReadiness } = await server.ssrLoadModule('/client/src/pose/trackingQuality.js');
  const { buildAssessmentResult } = await server.ssrLoadModule('/client/src/pose/assessmentRules.js');

  function basePose(overrides = {}) {
    const positions = {
      [PoseLandmarks.Nose]: { x: 0.5, y: 0.07 },
      [PoseLandmarks.LeftShoulder]: { x: 0.41, y: 0.24 },
      [PoseLandmarks.RightShoulder]: { x: 0.59, y: 0.24 },
      [PoseLandmarks.LeftHip]: { x: 0.45, y: 0.48 },
      [PoseLandmarks.RightHip]: { x: 0.55, y: 0.48 },
      [PoseLandmarks.LeftKnee]: { x: 0.45, y: 0.67 },
      [PoseLandmarks.RightKnee]: { x: 0.55, y: 0.67 },
      [PoseLandmarks.LeftAnkle]: { x: 0.45, y: 0.86 },
      [PoseLandmarks.RightAnkle]: { x: 0.55, y: 0.86 },
      [PoseLandmarks.LeftHeel]: { x: 0.44, y: 0.92 },
      [PoseLandmarks.RightHeel]: { x: 0.56, y: 0.92 },
      [PoseLandmarks.LeftFootIndex]: { x: 0.43, y: 0.95 },
      [PoseLandmarks.RightFootIndex]: { x: 0.57, y: 0.95 },
      ...overrides,
    };

    return MediaPipePoseNames.map((name, index) => {
      const point = positions[name] || { x: 0.5, y: 0.5, visibility: 0.25 };
      return {
        index,
        name,
        x: point.x,
        y: point.y,
        z: point.z ?? 0,
        visibility: point.visibility ?? (positions[name] ? 0.95 : 0.25),
      };
    });
  }

  function byName(landmarks, name) {
    return landmarks.find((point) => point.name === name);
  }

  const smoother = createPoseSmootherForTest('four_stage_balance');
  const first = smoother.smooth(basePose(), { timestampMs: 1_000 });
  assert.equal(first.smoothing.rejectedOutlierCount, 0);

  const outlierFrame = basePose({
    [PoseLandmarks.LeftKnee]: { x: 0.92, y: 0.67 },
  });
  const outlier = smoother.smooth(outlierFrame, { timestampMs: 1_066 });
  assert.ok(outlier.smoothing.rejectedOutlierCount >= 1);
  assert.ok(byName(outlier.landmarks, PoseLandmarks.LeftKnee).x < 0.6);

  const missingAnkleFrame = basePose({
    [PoseLandmarks.RightAnkle]: { x: 0.55, y: 0.86, visibility: 0.05 },
  });
  const interpolated = smoother.smooth(missingAnkleFrame, { timestampMs: 1_132 });
  assert.ok(interpolated.smoothing.interpolatedCount >= 1);
  assert.ok(byName(interpolated.landmarks, PoseLandmarks.RightAnkle).visibility > 0);

  const ready = evaluateCameraReadiness({
    landmarks: basePose(),
    testType: 'four_stage_balance',
    previousSample: null,
    poseCount: 1,
    brightness: 0.5,
  });
  assert.equal(ready.isReady, true);
  assert.ok(ready.trackingQualityScore >= 0.8);
  assert.equal(ready.readinessDebug.isReady, true);
  assert.equal(ready.readinessDebug.hasPerson, true);
  assert.equal(ready.readinessDebug.singlePerson, true);
  assert.deepEqual(ready.readinessDebug.failingReasons, []);
  assert.equal(ready.readinessDebug.footLandmarkVisibility.left_ankle, 0.95);

  const chairSideView = evaluateCameraReadiness({
    landmarks: basePose({
      [PoseLandmarks.RightShoulder]: { x: 0.59, y: 0.24, visibility: 0.05 },
      [PoseLandmarks.RightHip]: { x: 0.55, y: 0.48, visibility: 0.05 },
      [PoseLandmarks.RightKnee]: { x: 0.55, y: 0.67, visibility: 0.05 },
      [PoseLandmarks.RightAnkle]: { x: 0.55, y: 0.86, visibility: 0.05 },
      [PoseLandmarks.RightHeel]: { x: 0.56, y: 0.92, visibility: 0.05 },
      [PoseLandmarks.RightFootIndex]: { x: 0.57, y: 0.95, visibility: 0.05 },
    }),
    testType: 'chair_stand',
    previousSample: null,
    poseCount: 1,
    brightness: 0.5,
  });
  assert.equal(chairSideView.isReady, true);

  const balanceNeedsBothFeet = evaluateCameraReadiness({
    landmarks: basePose({
      [PoseLandmarks.RightShoulder]: { x: 0.59, y: 0.24, visibility: 0.05 },
      [PoseLandmarks.RightHip]: { x: 0.55, y: 0.48, visibility: 0.05 },
      [PoseLandmarks.RightKnee]: { x: 0.55, y: 0.67, visibility: 0.05 },
      [PoseLandmarks.RightAnkle]: { x: 0.55, y: 0.86, visibility: 0.05 },
      [PoseLandmarks.RightHeel]: { x: 0.56, y: 0.92, visibility: 0.05 },
      [PoseLandmarks.RightFootIndex]: { x: 0.57, y: 0.95, visibility: 0.05 },
    }),
    testType: 'four_stage_balance',
    previousSample: null,
    poseCount: 1,
    brightness: 0.5,
  });
  assert.equal(balanceNeedsBothFeet.isReady, false);

  const missingFeet = evaluateCameraReadiness({
    landmarks: basePose({
      [PoseLandmarks.LeftHeel]: { x: 0.44, y: 0.92, visibility: 0.05 },
      [PoseLandmarks.RightHeel]: { x: 0.56, y: 0.92, visibility: 0.05 },
      [PoseLandmarks.LeftFootIndex]: { x: 0.43, y: 0.95, visibility: 0.05 },
      [PoseLandmarks.RightFootIndex]: { x: 0.57, y: 0.95, visibility: 0.05 },
    }),
    previousSample: ready.sample,
    poseCount: 1,
    brightness: 0.5,
  });
  assert.equal(missingFeet.isReady, false);
  assert.equal(missingFeet.feetVisible, false);
  assert.match(missingFeet.message, /feet/i);
  assert.ok(missingFeet.readinessDebug.failingReasons.includes('feet_not_visible'));
  assert.equal(missingFeet.readinessDebug.footLandmarkVisibility.left_heel, 0.05);

  const lowQualityAssessment = buildAssessmentResult({
    result: {
      testType: 'chair_stand',
      invalid: true,
      invalidReason: 'camera_tracking_quality',
      confidence: 0.91,
      trackingQualityScore: 0.42,
      repetitionCount: 12,
      primaryValue: 12,
      chairStandResult: {
        schemaVersion: 'chair_stand_result.v1',
        testType: 'chair_stand',
        repetitionCount: 12,
        confidence: 0.91,
        aggregate: {
          extensionAngularVelocityDegPerSec: {
            knee: { meanOfRepMeans: 70 },
            hip: { meanOfRepMeans: 55 },
          },
          sittingSpeed: {},
          trunkForwardLean: {},
        },
      },
    },
    profile: { ageYears: 72, gender: 'female' },
  });
  assert.equal(lowQualityAssessment.fallRiskLevel, null);
  assert.equal(lowQualityAssessment.testFlags.cameraSetupNeeded, true);
  assert.equal(lowQualityAssessment.testFlags.clinicalResultAvailable, false);
  assert.equal(lowQualityAssessment.failedCriteria.length, 0);

  console.log('Pose quality checks passed.');
} finally {
  await server.close();
}
