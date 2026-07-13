import { stage2Operational } from './stage2Analysis.config.js';

export const CALIBRATION_CONFIG_VERSION = 'calibration_config.v2';

export const calibrationConfig = {
  version: CALIBRATION_CONFIG_VERSION,
  stableStandingHoldMs: stage2Operational.calibration.neutralStandingMs,
  stableSittingHoldMs: stage2Operational.calibration.sittingReferenceMs,
  stableFootHoldMs: stage2Operational.calibration.footReferenceMs,
  sampleRetentionMs: stage2Operational.calibration.sampleRetentionMs,
  maxStableCenterDisplacement: stage2Operational.calibration.maxStableCenterDisplacementMeters,
  maxStableHipDisplacement: stage2Operational.calibration.maxStableHipDisplacementMeters,
  minOverallConfidence: stage2Operational.calibration.minimumOverallConfidence,
  minFeetConfidence: stage2Operational.calibration.minimumFeetConfidence,
  minHipSeparationBodyRatio: stage2Operational.calibration.minimumHipSeparationBodyRatio,
  minFoldedArmConfidence: stage2Operational.calibration.minimumFoldedArmConfidence,
  minFootPlacementObservableScore: stage2Operational.calibration.minimumFootPlacementObservableScore,
  cameraViews: {
    chairStand: {
      preferredView: 'OBLIQUE_LEFT_OR_RIGHT',
      targetAngleDegrees: stage2Operational.calibration.chairCameraTargetDegrees,
    },
    fourStageBalance: {
      preferredView: 'OBLIQUE_LEFT_OR_RIGHT',
      targetAngleDegrees: stage2Operational.calibration.balanceCameraTargetDegrees,
      requiresFootPlaneObservable: true,
    },
  },
  brightness: {
    sampleIntervalMs: stage2Operational.calibration.brightnessSampleIntervalMs,
    target: stage2Operational.calibration.brightnessTargetNormalized,
    minSamples: stage2Operational.calibration.brightnessMinimumSamples,
    sampleLimit: stage2Operational.calibration.brightnessSampleLimit,
    maxCorrection: stage2Operational.calibration.brightnessMaximumCorrection,
    hardLow: stage2Operational.calibration.brightnessHardLowNormalized,
    hardHigh: stage2Operational.calibration.brightnessHardHighNormalized,
  },
};
