import {
  ANALYZER_VERSION,
  AssessmentResultTypes as LegacyAssessmentResultTypes,
  AssessmentStatuses as LegacyAssessmentStatuses,
  ResultSources,
} from '../../../pose/assessmentResultMetadata.js';

export { ANALYZER_VERSION, ResultSources };

export const STRUCTURED_PIPELINE_SCHEMA_VERSION = 'steply_structured_pipeline.v2';

export const PipelineModes = {
  StructuredV2: 'STRUCTURED_V2',
};

export const AssessmentTypes = {
  ChairStand30s: 'CHAIR_STAND_30S',
  FourStageBalance: 'FOUR_STAGE_BALANCE',
};

export const LegacyTestTypes = {
  ChairStand: 'chair_stand',
  FourStageBalance: 'four_stage_balance',
  Balance: 'balance',
};

export const AssessmentTypeByLegacyTestType = {
  [LegacyTestTypes.ChairStand]: AssessmentTypes.ChairStand30s,
  CHAIR_STAND_30_SEC: AssessmentTypes.ChairStand30s,
  CHAIR_STAND_30S: AssessmentTypes.ChairStand30s,
  [LegacyTestTypes.FourStageBalance]: AssessmentTypes.FourStageBalance,
  [LegacyTestTypes.Balance]: AssessmentTypes.FourStageBalance,
  FOUR_STAGE_BALANCE: AssessmentTypes.FourStageBalance,
};

export const LegacyTestTypeByAssessmentType = {
  [AssessmentTypes.ChairStand30s]: LegacyTestTypes.ChairStand,
  [AssessmentTypes.FourStageBalance]: LegacyTestTypes.FourStageBalance,
};

export const AssessmentResultStatuses = {
  Valid: 'VALID',
  Invalid: 'INVALID',
  Incomplete: 'INCOMPLETE',
  Cancelled: 'CANCELLED',
  Failed: 'FAILED',
};

export const AssessmentResultStatusByLegacyStatus = {
  [LegacyAssessmentStatuses.Valid]: AssessmentResultStatuses.Valid,
  [LegacyAssessmentStatuses.Invalid]: AssessmentResultStatuses.Invalid,
  [LegacyAssessmentStatuses.Incomplete]: AssessmentResultStatuses.Incomplete,
  [LegacyAssessmentStatuses.Cancelled]: AssessmentResultStatuses.Cancelled,
  [LegacyAssessmentStatuses.TrackingFailed]: AssessmentResultStatuses.Invalid,
  SESSION_CANCELLED: AssessmentResultStatuses.Cancelled,
  TRACKING_FAILED: AssessmentResultStatuses.Invalid,
};

export const AssessmentResultTypes = {
  ...LegacyAssessmentResultTypes,
  StructuredAssessment: 'STRUCTURED_ASSESSMENT_RESULT',
};

export const QualityStates = {
  Ready: 'READY',
  NotReady: 'NOT_READY',
  Paused: 'PAUSED',
  Blocked: 'BLOCKED',
  Invalid: 'INVALID',
};

export const QualityReasonCodes = {
  NoPerson: 'NO_PERSON',
  MultiplePeople: 'MULTIPLE_PEOPLE',
  BodyOutOfFrame: 'BODY_OUT_OF_FRAME',
  FeetNotVisible: 'FEET_NOT_VISIBLE',
  LowLight: 'LOW_LIGHT',
  WrongCameraAngle: 'WRONG_CAMERA_ANGLE',
  LowLandmarkConfidence: 'LOW_LANDMARK_CONFIDENCE',
  TrackingLost: 'TRACKING_LOST',
  StaleFrame: 'STALE_FRAME',
  Unknown: 'UNKNOWN',
};

export const CoordinateAxisDirections = {
  DownPositive: 'DOWN_POSITIVE',
  UpPositive: 'UP_POSITIVE',
  Unknown: 'UNKNOWN',
};

export const VerticalMotionDirections = {
  StandingIncreases: 'STANDING_INCREASES',
  StandingDecreases: 'STANDING_DECREASES',
  Unknown: 'UNKNOWN',
};

export const CameraViews = {
  Front: 'FRONT',
  ObliqueLeft: 'OBLIQUE_LEFT',
  ObliqueRight: 'OBLIQUE_RIGHT',
  Side: 'SIDE',
  Unknown: 'UNKNOWN',
};

export const CalibrationStatuses = {
  NotStarted: 'NOT_STARTED',
  InProgress: 'IN_PROGRESS',
  Valid: 'VALID',
  Invalid: 'INVALID',
};

export const AssessmentEventTypes = {
  SessionStarted: 'SESSION_STARTED',
  PoseAcquired: 'POSE_ACQUIRED',
  PoseLost: 'POSE_LOST',
  QualityPaused: 'QUALITY_PAUSED',
  QualityResumed: 'QUALITY_RESUMED',
  CalibrationStarted: 'CALIBRATION_STARTED',
  CalibrationCompleted: 'CALIBRATION_COMPLETED',
  CalibrationFailed: 'CALIBRATION_FAILED',
  PositionConfirmed: 'POSITION_CONFIRMED',
  HoldStarted: 'HOLD_STARTED',
  HoldFailed: 'HOLD_FAILED',
  HoldCompleted: 'HOLD_COMPLETED',
  FootMoved: 'FOOT_MOVED',
  PositionLost: 'POSITION_LOST',
  LiftedFootTouchedDown: 'LIFTED_FOOT_TOUCHED_DOWN',
  SupportUsed: 'SUPPORT_USED',
  TrackingLost: 'TRACKING_LOST',
  SitConfirmed: 'SIT_CONFIRMED',
  RisingStarted: 'RISING_STARTED',
  StandConfirmed: 'STAND_CONFIRMED',
  DescendingStarted: 'DESCENDING_STARTED',
  RepCompleted: 'REP_COMPLETED',
  ArmUseSuspected: 'ARM_USE_SUSPECTED',
  ArmUseConfirmed: 'ARM_USE_CONFIRMED',
  AssessmentFinalizing: 'ASSESSMENT_FINALIZING',
  AssessmentCompleted: 'ASSESSMENT_COMPLETED',
  AssessmentIncomplete: 'ASSESSMENT_INCOMPLETE',
  AssessmentInvalid: 'ASSESSMENT_INVALID',
  ManualInterventionRecorded: 'MANUAL_INTERVENTION_RECORDED',
  SessionCancelled: 'SESSION_CANCELLED',
  AnalysisError: 'ANALYSIS_ERROR',
};

export const EvidenceKinds = {
  Angle: 'ANGLE',
  Duration: 'DURATION',
  Distance: 'DISTANCE',
  StateTransition: 'STATE_TRANSITION',
  Quality: 'QUALITY',
};

export const ChairStandMeasurementKind = 'CHAIR_STAND';

export const ArmUseStates = {
  NotDetected: 'NOT_DETECTED',
  Suspected: 'SUSPECTED',
  Confirmed: 'CONFIRMED',
  NotMeasurable: 'NOT_MEASURABLE',
};

export const ChairStandFinalStates = {
  Sit: 'SIT',
  Rising: 'RISING',
  Stand: 'STAND',
  Descending: 'DESCENDING',
  Unknown: 'UNKNOWN',
};

export const PartialRepetitionRuleStatuses = {
  Applied: 'APPLIED',
  NotApplicable: 'NOT_APPLICABLE',
  NotImplemented: 'NOT_IMPLEMENTED',
  NotMeasurable: 'NOT_MEASURABLE',
};

export const BalanceMeasurementKind = 'FOUR_STAGE_BALANCE';

export const BalanceStages = {
  SideBySide: 'SIDE_BY_SIDE',
  SemiTandem: 'SEMI_TANDEM',
  Tandem: 'TANDEM',
  OneLeg: 'ONE_LEG',
};

export const BalanceStageStatuses = {
  Passed: 'PASSED',
  Failed: 'FAILED',
  NotAttempted: 'NOT_ATTEMPTED',
  Invalid: 'INVALID',
  Ambiguous: 'AMBIGUOUS',
};

export const SecondaryObservationTypes = {
  LateRepetitionSlowdown: 'LATE_REPETITION_SLOWDOWN',
  TrunkLeanPattern: 'TRUNK_LEAN_PATTERN',
  LeftRightAsymmetry: 'LEFT_RIGHT_ASYMMETRY',
  MediolateralSwayPattern: 'MEDIOLATERAL_SWAY_PATTERN',
  AnteriorPosteriorSwayPattern: 'ANTERIOR_POSTERIOR_SWAY_PATTERN',
  FrequentPositionCorrection: 'FREQUENT_POSITION_CORRECTION',
  LowMeasurementConfidence: 'LOW_MEASUREMENT_CONFIDENCE',
};

export const FunctionalDomains = {
  LowerBodyFunction: 'LOWER_BODY_FUNCTION',
  BasicStaticBalance: 'BASIC_STATIC_BALANCE',
  NarrowBaseBalance: 'NARROW_BASE_BALANCE',
  SingleLegBalance: 'SINGLE_LEG_BALANCE',
  MovementEndurance: 'MOVEMENT_ENDURANCE',
  MovementControl: 'MOVEMENT_CONTROL',
  MeasurementQuality: 'MEASUREMENT_QUALITY',
};

export const FindingClassifications = {
  Primary: 'PRIMARY',
  Secondary: 'SECONDARY',
};

export const FindingSeverities = {
  Informational: 'INFORMATIONAL',
  Mild: 'MILD',
  Moderate: 'MODERATE',
  Significant: 'SIGNIFICANT',
};

export const SteadiRiskLevels = {
  Low: 'LOW',
  Moderate: 'MODERATE',
  High: 'HIGH',
  NotScorable: 'NOT_SCORABLE',
};

export const SupportRequirements = {
  None: 'NONE',
  StableSupport: 'STABLE_SUPPORT',
  CaregiverNearby: 'CAREGIVER_NEARBY',
  ProfessionalSupervision: 'PROFESSIONAL_SUPERVISION',
};

export const CameraVerificationModes = {
  Supported: 'SUPPORTED',
  Partial: 'PARTIAL',
  NotSupported: 'NOT_SUPPORTED',
};

export const SupervisionRequirements = {
  None: 'NONE',
  CaregiverRecommended: 'CAREGIVER_RECOMMENDED',
  ProfessionalReviewRequired: 'PROFESSIONAL_REVIEW_REQUIRED',
};

export const ExercisePlanStatuses = {
  Active: 'ACTIVE',
  PendingReview: 'PENDING_REVIEW',
  Blocked: 'BLOCKED',
  Expired: 'EXPIRED',
};

export const AgentActionTypes = {
  ReadProgressState: 'READ_PROGRESS_STATE',
  RequestAssessment: 'REQUEST_ASSESSMENT',
  ScheduleReassessment: 'SCHEDULE_REASSESSMENT',
  ShowCameraSetup: 'SHOW_CAMERA_SETUP',
  RequestCameraSetupTutorial: 'REQUEST_CAMERA_SETUP_TUTORIAL',
  CreateSessionPlan: 'CREATE_SESSION_PLAN',
  GetExercisePlan: 'GET_EXERCISE_PLAN',
  CheckProgressionEligibility: 'CHECK_PROGRESSION_ELIGIBILITY',
  SendReminder: 'SEND_REMINDER',
  ComposeWeeklyReport: 'COMPOSE_WEEKLY_REPORT',
  NotifyCaregiver: 'NOTIFY_CAREGIVER',
  RequestProfessionalReview: 'REQUEST_PROFESSIONAL_REVIEW',
  CreateProfessionalReviewRequest: 'CREATE_PROFESSIONAL_REVIEW_REQUEST',
  ProposeSessionSplit: 'PROPOSE_SESSION_SPLIT',
  RecordAgentDecision: 'RECORD_AGENT_DECISION',
  NoAction: 'NO_ACTION',
};

export const WorkerCommandTypes = {
  Init: 'INIT',
  StartSession: 'START_SESSION',
  ProcessPreviewFrame: 'PROCESS_PREVIEW_FRAME',
  ProcessFrame: 'PROCESS_FRAME',
  FinalizeSession: 'FINALIZE_SESSION',
  ResetSession: 'RESET_SESSION',
  CancelSession: 'CANCEL_SESSION',
  ManualRepetition: 'MANUAL_REPETITION',
  DebugProbe: 'DEBUG_PROBE',
};

export const WorkerResponseTypes = {
  Booted: 'booted',
  Ready: 'ready',
  SessionReady: 'SESSION_READY',
  FrameResult: 'FRAME_RESULT',
  FinalResult: 'FINAL_RESULT',
  SessionCancelled: 'SESSION_CANCELLED',
  AnalysisError: 'ANALYSIS_ERROR',
  FrameSkipped: 'frame-skipped',
  Debug: 'debug',
};

export function createTypedId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeFrameId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Math.max(0, Math.trunc(numeric));
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash;
  }
  return null;
}

export function assessmentTypeFromLegacyTestType(testType) {
  return AssessmentTypeByLegacyTestType[testType] || null;
}

export function legacyTestTypeFromAssessmentType(assessmentType) {
  return LegacyTestTypeByAssessmentType[assessmentType] || null;
}

export function normalizeAssessmentType(value) {
  if (Object.values(AssessmentTypes).includes(value)) return value;
  return assessmentTypeFromLegacyTestType(value);
}

export function normalizeAssessmentStatus(value) {
  if (Object.values(AssessmentResultStatuses).includes(value)) return value;
  return AssessmentResultStatusByLegacyStatus[value] || null;
}

export function isKnownAssessmentType(value) {
  return Object.values(AssessmentTypes).includes(value);
}

export function isPersistableSource(source) {
  return source === ResultSources.LivePose;
}
