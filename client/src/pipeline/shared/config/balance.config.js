import { stage2Operational } from './stage2Analysis.config.js';

export const BALANCE_CONFIG_VERSION = 'balance_config.v2';

export const balanceConfig = {
  version: BALANCE_CONFIG_VERSION,
  legacyResultSchemaVersion: 'balance_result.v1',
  targetHoldSeconds: stage2Operational.balance.targetHoldMs / 1000,
  entryConfirmMs: stage2Operational.balance.onsetDwellMs,
  positionEntryTimeoutMs: stage2Operational.balance.positionEntryTimeoutMs,
  stageOrder: ['SIDE_BY_SIDE', 'SEMI_TANDEM', 'TANDEM', 'ONE_LEG'],
  camera: {
    minFootLandmarkConfidence: stage2Operational.balance.minimumFootLandmarkConfidence,
    minFootPlaneObservableScore: stage2Operational.balance.minimumFootPlaneObservableScore,
    minFootVectorVerticalComponent: stage2Operational.balance.minimumFootVectorApComponent,
    maxFootOcclusionCenterDistanceFootLengths: stage2Operational.balance.maximumFootOcclusionDistanceFootLengths,
    ambiguousUserMessage: 'Turn slightly so the camera can see both feet.',
    feetVisibleUserMessage: 'Keep both heels and toes visible.',
    positionGuideUserMessage: 'Move your feet to match the guide.',
    minimumObliqueAngleDegrees: stage2Operational.balance.minimumObliqueCameraAngleDegrees,
    observabilityFallbackScore: stage2Operational.balance.cameraObservabilityFallbackScore,
  },
  position: {
    confirmationDwellMs: stage2Operational.balance.onsetDwellMs,
    minimumTargetScore: stage2Operational.balance.minimumTargetScore,
    minimumScoreMargin: stage2Operational.balance.minimumScoreMargin,
    minimumFootConfidence: stage2Operational.balance.minimumFootLandmarkConfidence,
    sideBySide: {
      lateralMinFootLengths: stage2Operational.balance.lateralMinimumFootLengths,
      lateralMaxFootLengths: stage2Operational.balance.sideBySide.mlMax,
      anteriorPosteriorMaxFootLengths: stage2Operational.balance.sideBySide.apMax,
      parallelMin: stage2Operational.balance.sideBySideParallelMinimum,
    },
    semiTandem: {
      lateralMinFootLengths: stage2Operational.balance.lateralMinimumFootLengths,
      lateralMaxFootLengths: stage2Operational.balance.semiTandem.mlMax,
      anteriorPosteriorMinFootLengths: stage2Operational.balance.semiTandem.apMin,
      anteriorPosteriorMaxFootLengths: stage2Operational.balance.semiTandem.apMax,
      heelToeGapMinFootLengths: stage2Operational.balance.lateralMinimumFootLengths,
      heelToeGapMaxFootLengths: Number.POSITIVE_INFINITY,
      parallelMin: stage2Operational.balance.semiTandemParallelMinimum,
    },
    tandem: {
      lateralMaxFootLengths: stage2Operational.balance.tandem.mlMax,
      anteriorPosteriorMinFootLengths: stage2Operational.balance.tandem.apMin,
      anteriorPosteriorMaxFootLengths: stage2Operational.balance.tandem.apMax,
      heelToeGapMaxFootLengths: stage2Operational.balance.tandem.heelToeMax,
      parallelMin: stage2Operational.balance.tandemParallelMinimum,
    },
    oneLeg: {
      liftedFootMinHeightFootLengths: stage2Operational.balance.oneLeg.liftMin,
      supportFootMaxMovementFootLengths: stage2Operational.balance.supportFootMaximumMovementFootLengths,
      pelvisInFrameMargin: stage2Operational.balance.pelvisFrameMargin,
    },
  },
  hold: {
    targetHoldMs: stage2Operational.balance.targetHoldMs,
    footMoveDistanceFootLengths: stage2Operational.balance.footMoveDistance,
    footMoveDwellMs: stage2Operational.balance.failureDwellMs,
    positionLostDwellMs: stage2Operational.balance.failureDwellMs,
    liftedFootTouchDownDwellMs: stage2Operational.balance.touchdownDwellMs,
    liftedFootTouchDownThreshold: stage2Operational.balance.oneLeg.touchdownMax,
    jitterIgnoreDistanceFootLengths: stage2Operational.balance.jitterIgnoreDistanceFootLengths,
    cameraMotionFootShiftFootLengths: stage2Operational.balance.cameraMotionFootShiftFootLengths,
  },
  support: {
    enabledWithoutRoi: stage2Operational.balance.supportEnabledWithoutRoi,
    wristConfidenceMin: stage2Operational.balance.wristConfidenceMinimum,
    personLandmarkVisibilityMin: stage2Operational.balance.personLandmarkVisibilityMinimum,
    roiDwellMs: stage2Operational.balance.supportRoiDwellMs,
  },
  sway: {
    initialWindowMs: stage2Operational.balance.initialWindowMs,
    staticWindowStartMs: stage2Operational.balance.staticWindowStartMs,
  },
  geometry: {
    minimumVisibility: stage2Operational.balance.geometryMinimumVisibility,
    fallbackFootLengthMeters: stage2Operational.balance.fallbackFootLengthMeters,
    twoFootContactLiftFraction: stage2Operational.balance.twoFootContactLiftFraction,
  },
};
