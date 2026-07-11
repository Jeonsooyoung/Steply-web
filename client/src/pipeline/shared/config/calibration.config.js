export const CALIBRATION_CONFIG_VERSION = 'calibration_config.v1';

export const calibrationConfig = {
  version: CALIBRATION_CONFIG_VERSION,
  stableStandingHoldMs: 2_000,
  stableSittingHoldMs: 1_000,
  stableFootHoldMs: 1_000,
  maxStableCenterDisplacement: 0.025,
  maxStableHipDisplacement: 0.025,
  minOverallConfidence: 0.72,
  minFeetConfidence: 0.65,
  minHipSeparationBodyRatio: 0.12,
  minFoldedArmConfidence: 0.45,
  cameraViews: {
    chairStand: {
      preferredView: 'OBLIQUE_LEFT_OR_RIGHT',
      targetAngleDegrees: [30, 60],
    },
    fourStageBalance: {
      preferredView: 'OBLIQUE_LEFT_OR_RIGHT',
      targetAngleDegrees: [30, 45],
      requiresFootPlaneObservable: true,
    },
  },
  brightness: {
    sampleIntervalMs: 333,
    target: 0.5,
    minSamples: 4,
    sampleLimit: 24,
    maxCorrection: 0.18,
    hardLow: 0.12,
    hardHigh: 0.97,
  },
};
