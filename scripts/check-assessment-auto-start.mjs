import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.js'),
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true },
  logLevel: 'silent',
});

try {
  const {
    ASSESSMENT_AUTO_START_COUNTDOWN_MS,
    ASSESSMENT_AUTO_START_COUNTDOWN_SECONDS,
    assessmentAutoStartSecondsRemaining,
    isStableAssessmentStartReady,
  } = await server.ssrLoadModule('/client/src/pipeline/ui/assessmentAutoStart.js');
  const { stage2Operational } = await server.ssrLoadModule('/client/src/pipeline/shared/config/stage2Analysis.config.js');
  const { rebindValidPersonalCalibrationState } = await server.ssrLoadModule('/client/src/pipeline/calibration/personalCalibration.js');
  const { AssessmentTypes, CalibrationStatuses } = await server.ssrLoadModule('/client/src/pipeline/shared/types/index.js');

  assert.equal(ASSESSMENT_AUTO_START_COUNTDOWN_MS, 3000, '[AUTO-START-01] stable person countdown is exactly 3 seconds');
  assert.equal(ASSESSMENT_AUTO_START_COUNTDOWN_MS, stage2Operational.calibration.neutralStandingMs, '[AUTO-START-01] countdown uses the central clinical calibration threshold');
  assert.equal(ASSESSMENT_AUTO_START_COUNTDOWN_SECONDS, 3, '[AUTO-START-01] UI countdown derives seconds from central milliseconds');

  const readyCamera = {
    isReady: true,
    singlePersonDetected: true,
    fullBodyVisible: true,
    feetVisible: true,
    trackingStable: true,
    cameraStill: true,
    brightnessOk: true,
  };
  const readyInput = {
    cameraReady: true,
    cameraReadiness: readyCamera,
    landmarkCount: 33,
  };
  assert.equal(isStableAssessmentStartReady(readyInput), true, '[AUTO-START-02] one stable fully visible person can start');

  const rejectedCases = [
    ['camera stream missing', { cameraReady: false }],
    ['no pose landmarks', { landmarkCount: 0 }],
    ['worker readiness failed', { cameraReadiness: { ...readyCamera, isReady: false } }],
    ['multiple people', { cameraReadiness: { ...readyCamera, singlePersonDetected: false } }],
    ['body out of frame', { cameraReadiness: { ...readyCamera, fullBodyVisible: false } }],
    ['feet out of frame', { cameraReadiness: { ...readyCamera, feetVisible: false } }],
    ['person moving', { cameraReadiness: { ...readyCamera, trackingStable: false } }],
    ['camera moving', { cameraReadiness: { ...readyCamera, cameraStill: false } }],
    ['lighting invalid', { cameraReadiness: { ...readyCamera, brightnessOk: false } }],
    ['required calibration missing', { calibrationReady: false }],
  ];
  for (const [label, override] of rejectedCases) {
    assert.equal(
      isStableAssessmentStartReady({ ...readyInput, ...override }),
      false,
      `[AUTO-START-03] ${label} resets or blocks the countdown`,
    );
  }

  assert.deepEqual(
    [0, 999, 1000, 1999, 2000, 2999, 3000].map((elapsedMs) => assessmentAutoStartSecondsRemaining(elapsedMs)),
    [3, 3, 2, 2, 1, 1, 0],
    '[AUTO-START-04] countdown displays 3, 2, 1, then starts',
  );

  const setupSource = fs.readFileSync(path.join(root, 'client/src/routes/StepThreeScreens.jsx'), 'utf8');
  const balanceSource = fs.readFileSync(path.join(root, 'client/src/routes/StepFourScreens.jsx'), 'utf8');
  const chairSource = fs.readFileSync(path.join(root, 'client/src/routes/StepFiveScreens.jsx'), 'utf8');
  const countdownHookSource = fs.readFileSync(path.join(root, 'client/src/hooks/useStableAssessmentCountdown.js'), 'utf8');
  const workerSource = fs.readFileSync(path.join(root, 'client/src/pose/poseLandmarker.worker.js'), 'utf8');
  assert.match(setupSource, /: '\/display\/assessment\/balance\/live'/, '[AUTO-START-05] stable standing proceeds directly to the Balance live test');
  assert.match(setupSource, /step-three-auto-start-countdown/, '[AUTO-START-05] the camera screen shows a visible countdown');
  assert.match(balanceSource, /useStableAssessmentCountdown/, '[AUTO-START-06] Balance instruction fallback uses the same stable countdown');
  assert.match(chairSource, /calibrationStatus\?\.canStartAssessment === true/, '[AUTO-START-07] Chair Stand cannot start before seated calibration');
  assert.match(chairSource, /useStableAssessmentCountdown/, '[AUTO-START-07] Chair Stand uses the same central 3-second countdown');
  assert.match(countdownHookSource, /if \(!ready\)[\s\S]*setRemainingSeconds\(null\)/, '[AUTO-START-08] readiness loss resets the countdown');
  assert.match(countdownHookSource, /!completionReady \|\| remainingSeconds !== 0/, '[AUTO-START-08] navigation waits for both countdown and calibration completion');
  assert.match(workerSource, /preserveValidCalibration: true/, '[AUTO-START-09] live analysis preserves the just-validated preflight calibration');

  const previewCalibration = {
    sessionId: 'preview',
    assessmentType: AssessmentTypes.FourStageBalance,
    profile: {
      sessionId: 'preview',
      assessmentType: AssessmentTypes.FourStageBalance,
      status: CalibrationStatuses.Valid,
    },
  };
  const reboundCalibration = rebindValidPersonalCalibrationState(previewCalibration, {
    sessionId: 'analysis-1',
    assessmentType: AssessmentTypes.FourStageBalance,
  });
  assert.equal(reboundCalibration.sessionId, 'analysis-1', '[AUTO-START-09] valid calibration is rebound to the live analysis session');
  assert.equal(reboundCalibration.profile.sessionId, 'analysis-1', '[AUTO-START-09] preserved profile passes session ownership checks');
  assert.equal(previewCalibration.sessionId, 'preview', '[AUTO-START-09] calibration rebinding is immutable');
  assert.equal(rebindValidPersonalCalibrationState(previewCalibration, {
    sessionId: 'analysis-2',
    assessmentType: AssessmentTypes.ChairStand30s,
  }), null, '[AUTO-START-09] calibration cannot cross assessment types');

  console.log('Stable 3-second assessment auto-start checks passed.');
} finally {
  await server.close();
}
