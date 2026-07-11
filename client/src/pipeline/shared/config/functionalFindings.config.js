export const FUNCTIONAL_FINDINGS_CONFIG_VERSION = 'functional_findings_config.v1';

export const functionalFindingsConfig = {
  version: FUNCTIONAL_FINDINGS_CONFIG_VERSION,
  cdc: {
    tandemHoldSeconds: 10,
  },
  confidence: {
    minimumAssessmentConfidence: 0.6,
    minimumSecondaryConfidence: 0.65,
  },
  secondaryObservation: {
    lateRepetitionSlowdownRatio: 1.18,
    trunkCompensationDegrees: 18,
    movementAsymmetryDegrees: 15,
    swayRangeFootLengths: 1.2,
    frequentCorrectionCount: 2,
  },
  messages: {
    CHAIR_STAND_BELOW_REFERENCE: 'You completed fewer chair stands than the reference for your age and sex.',
    ARM_SUPPORT_REQUIRED: 'You needed arm support during the test.',
    BASIC_BALANCE_DIFFICULTY: 'You had difficulty holding the side-by-side position for 10 seconds.',
    SEMI_TANDEM_HOLD_DIFFICULTY: 'You had difficulty holding the semi-tandem position for 10 seconds.',
    TANDEM_HOLD_DIFFICULTY: 'You had difficulty holding the tandem position for 10 seconds.',
    SINGLE_LEG_HOLD_DIFFICULTY: 'You had difficulty holding the one-leg position for 10 seconds.',
    LATE_REPETITION_SLOWDOWN: 'Your standing speed decreased during the later repetitions.',
    TRUNK_COMPENSATION_PATTERN: 'You leaned forward more during several repetitions.',
    MOVEMENT_ASYMMETRY_PATTERN: 'Your movement was different between the left and right sides.',
    MEDIOLATERAL_SWAY_PATTERN: 'You moved side to side more while holding the position.',
    ANTERIOR_POSTERIOR_SWAY_PATTERN: 'You moved forward and back more while holding the position.',
    FREQUENT_POSITION_CORRECTION: 'You adjusted your position several times during the test.',
    LOW_MEASUREMENT_CONFIDENCE: 'Some movement details were not measured clearly enough.',
  },
};
