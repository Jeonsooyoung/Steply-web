import { stage2Operational } from '../shared/config/stage2Analysis.config.js';

// This is the clinical neutral-standing calibration window, not a network/UI timeout.
export const ASSESSMENT_AUTO_START_COUNTDOWN_MS = stage2Operational.calibration.neutralStandingMs;
export const ASSESSMENT_AUTO_START_COUNTDOWN_SECONDS = Math.ceil(ASSESSMENT_AUTO_START_COUNTDOWN_MS / 1000);

export function assessmentAutoStartSecondsRemaining(
  elapsedMs,
  countdownMs = ASSESSMENT_AUTO_START_COUNTDOWN_MS,
) {
  const elapsed = Number.isFinite(Number(elapsedMs)) ? Math.max(0, Number(elapsedMs)) : 0;
  return Math.max(0, Math.ceil((countdownMs - elapsed) / 1000));
}

export function isStableAssessmentStartReady({
  cameraReady = false,
  cameraReadiness = null,
  landmarkCount = 0,
  calibrationReady = true,
} = {}) {
  return Boolean(
    cameraReady
    && calibrationReady
    && Number(landmarkCount) > 0
    && cameraReadiness?.isReady === true
    && cameraReadiness?.singlePersonDetected === true
    && cameraReadiness?.fullBodyVisible === true
    && cameraReadiness?.feetVisible === true
    && cameraReadiness?.trackingStable === true
    && cameraReadiness?.cameraStill === true
    && cameraReadiness?.brightnessOk === true
  );
}
