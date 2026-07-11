import {
  AgentActionTypes,
  ArmUseStates,
  AssessmentEventTypes,
  AssessmentResultStatuses,
  AssessmentResultTypes,
  AssessmentTypes,
  BalanceMeasurementKind,
  BalanceStageStatuses,
  BalanceStages,
  CalibrationStatuses,
  CameraVerificationModes,
  CameraViews,
  ChairStandFinalStates,
  ChairStandMeasurementKind,
  CoordinateAxisDirections,
  EvidenceKinds,
  ExercisePlanStatuses,
  FindingClassifications,
  FindingSeverities,
  FunctionalDomains,
  PartialRepetitionRuleStatuses,
  QualityReasonCodes,
  QualityStates,
  ResultSources,
  SecondaryObservationTypes,
  SteadiRiskLevels,
  SupervisionRequirements,
  SupportRequirements,
  VerticalMotionDirections,
  WorkerCommandTypes,
  WorkerResponseTypes,
  isKnownAssessmentType,
} from '../types/index.js';

function failure(code, path, message, receivedValue) {
  return { code, path, message, receivedValue };
}

function context(value) {
  return { value, failures: [] };
}

function done(ctx) {
  return ctx.failures.length
    ? { ok: false, failures: ctx.failures }
    : { ok: true, value: ctx.value, failures: [] };
}

function add(ctx, code, path, message, receivedValue) {
  ctx.failures.push(failure(code, path, message, receivedValue));
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function booleanValue(value) {
  return typeof value === 'boolean';
}

function enumValues(enumObject) {
  return Object.values(enumObject);
}

function inEnum(value, enumObject) {
  return enumValues(enumObject).includes(value);
}

function requireString(ctx, value, path, code = 'MISSING_REQUIRED_STRING') {
  if (!nonEmptyString(value)) add(ctx, code, path, `${path} is required.`, value);
}

function requireFinite(ctx, value, path, code = 'INVALID_NUMBER') {
  if (!finiteNumber(value)) add(ctx, code, path, `${path} must be a finite number.`, value);
}

function requireBoolean(ctx, value, path, code = 'INVALID_BOOLEAN') {
  if (!booleanValue(value)) add(ctx, code, path, `${path} must be a boolean.`, value);
}

function requireScore(ctx, value, path, { optional = false } = {}) {
  if (value === undefined || value === null) {
    if (!optional) add(ctx, 'MISSING_SCORE', path, `${path} is required.`, value);
    return;
  }
  if (!finiteNumber(value) || value < 0 || value > 1) {
    add(ctx, 'SCORE_OUT_OF_RANGE', path, `${path} must be between 0 and 1.`, value);
  }
}

function requireEnum(ctx, value, enumObject, path, code = 'INVALID_ENUM') {
  if (!inEnum(value, enumObject)) {
    add(ctx, code, path, `${path} is not an allowed value.`, value);
  }
}

function requireArray(ctx, value, path) {
  if (!Array.isArray(value)) {
    add(ctx, 'INVALID_ARRAY', path, `${path} must be an array.`, value);
    return [];
  }
  return value;
}

function hasDuplicate(values = []) {
  return new Set(values).size !== values.length;
}

function resultSource(result = {}) {
  return result.metadata?.source || result.source || null;
}

function resultStatus(result = {}) {
  return result.status || null;
}

function resultPersistable(result = {}) {
  return result.metadata?.isPersistable ?? result.isPersistable;
}

function resultClinicallyScorable(result = {}) {
  return result.metadata?.isClinicallyScorable ?? result.isClinicallyScorable;
}

function validateLandmark(ctx, landmark, path, { world = false } = {}) {
  if (!landmark || typeof landmark !== 'object') {
    add(ctx, 'INVALID_LANDMARK', path, `${path} must be an object.`, landmark);
    return;
  }
  if (!Number.isInteger(landmark.index) || landmark.index < 0 || landmark.index > 32) {
    add(ctx, 'INVALID_LANDMARK_INDEX', `${path}.index`, 'Landmark index must be between 0 and 32.', landmark.index);
  }
  requireFinite(ctx, world ? landmark.xMeters : landmark.x, `${path}.${world ? 'xMeters' : 'x'}`);
  requireFinite(ctx, world ? landmark.yMeters : landmark.y, `${path}.${world ? 'yMeters' : 'y'}`);
  if (world || landmark.z !== undefined) {
    requireFinite(ctx, world ? landmark.zMeters : landmark.z, `${path}.${world ? 'zMeters' : 'z'}`);
  }
  requireBoolean(ctx, landmark.isValid, `${path}.isValid`);
  requireScore(ctx, landmark.visibility, `${path}.visibility`, { optional: true });
  if (!world) requireScore(ctx, landmark.presence, `${path}.presence`, { optional: true });
}

export function validatePoseFrame(frame) {
  const ctx = context(frame);
  if (!frame || typeof frame !== 'object') {
    add(ctx, 'INVALID_POSE_FRAME', '', 'PoseFrame must be an object.', frame);
    return done(ctx);
  }

  requireString(ctx, frame.sessionId, 'sessionId');
  if (!Number.isInteger(frame.frameId) || frame.frameId < 0) {
    add(ctx, 'INVALID_FRAME_ID', 'frameId', 'frameId must be a non-negative integer.', frame.frameId);
  }
  requireFinite(ctx, frame.timestampMs, 'timestampMs');
  requireFinite(ctx, frame.image?.width, 'image.width');
  requireFinite(ctx, frame.image?.height, 'image.height');
  if (finiteNumber(frame.image?.width) && frame.image.width <= 0) add(ctx, 'INVALID_IMAGE_SIZE', 'image.width', 'image.width must be greater than 0.', frame.image.width);
  if (finiteNumber(frame.image?.height) && frame.image.height <= 0) add(ctx, 'INVALID_IMAGE_SIZE', 'image.height', 'image.height must be greater than 0.', frame.image.height);
  requireBoolean(ctx, frame.image?.mirrored, 'image.mirrored');
  requireScore(ctx, frame.confidence?.overall, 'confidence.overall');
  requireScore(ctx, frame.confidence?.lowerBody, 'confidence.lowerBody');
  requireScore(ctx, frame.confidence?.feet, 'confidence.feet');
  requireScore(ctx, frame.confidence?.upperBody, 'confidence.upperBody');
  if (!Number.isInteger(frame.detectedPersonCount) || frame.detectedPersonCount < 0) {
    add(ctx, 'INVALID_PERSON_COUNT', 'detectedPersonCount', 'detectedPersonCount must be a non-negative integer.', frame.detectedPersonCount);
  }
  requireFinite(ctx, frame.processing?.receivedAtMs, 'processing.receivedAtMs');
  requireFinite(ctx, frame.processing?.completedAtMs, 'processing.completedAtMs');
  requireFinite(ctx, frame.processing?.latencyMs, 'processing.latencyMs');
  if (
    finiteNumber(frame.processing?.receivedAtMs)
    && finiteNumber(frame.processing?.completedAtMs)
    && frame.processing.completedAtMs < frame.processing.receivedAtMs
  ) {
    add(ctx, 'PROCESSING_TIMESTAMP_REVERSED', 'processing.completedAtMs', 'Processing completed before frame receipt.', frame.processing);
  }

  const landmarks = requireArray(ctx, frame.normalizedLandmarks, 'normalizedLandmarks');
  const indices = [];
  landmarks.forEach((landmark, index) => {
    indices.push(landmark?.index);
    validateLandmark(ctx, landmark, `normalizedLandmarks.${index}`);
  });
  if (hasDuplicate(indices)) add(ctx, 'DUPLICATE_LANDMARK_INDEX', 'normalizedLandmarks', 'Landmark indexes must be unique.', indices);

  if (frame.worldLandmarks !== undefined) {
    const worldLandmarks = requireArray(ctx, frame.worldLandmarks, 'worldLandmarks');
    const worldIndices = [];
    worldLandmarks.forEach((landmark, index) => {
      worldIndices.push(landmark?.index);
      validateLandmark(ctx, landmark, `worldLandmarks.${index}`, { world: true });
    });
    if (hasDuplicate(worldIndices)) add(ctx, 'DUPLICATE_LANDMARK_INDEX', 'worldLandmarks', 'World landmark indexes must be unique.', worldIndices);
  }

  return done(ctx);
}

export function validateCalibrationProfile(profile) {
  const ctx = context(profile);
  if (!profile || typeof profile !== 'object') {
    add(ctx, 'INVALID_CALIBRATION_PROFILE', '', 'CalibrationProfile must be an object.', profile);
    return done(ctx);
  }
  requireString(ctx, profile.calibrationId, 'calibrationId');
  requireString(ctx, profile.sessionId, 'sessionId');
  requireEnum(ctx, profile.assessmentType, AssessmentTypes, 'assessmentType');
  requireEnum(ctx, profile.status, CalibrationStatuses, 'status');
  requireFinite(ctx, profile.createdAtMs, 'createdAtMs');
  requireEnum(ctx, profile.coordinateOrientation?.imageYAxis, CoordinateAxisDirections, 'coordinateOrientation.imageYAxis');
  requireEnum(ctx, profile.coordinateOrientation?.worldYAxis, CoordinateAxisDirections, 'coordinateOrientation.worldYAxis');
  requireBoolean(ctx, profile.coordinateOrientation?.cameraMirrored, 'coordinateOrientation.cameraMirrored');
  requireEnum(ctx, profile.coordinateOrientation?.verticalMotionDirection, VerticalMotionDirections, 'coordinateOrientation.verticalMotionDirection');
  requireEnum(ctx, profile.camera?.view, CameraViews, 'camera.view');
  requireBoolean(ctx, profile.camera?.mirrored, 'camera.mirrored');
  requireScore(ctx, profile.confidence?.overall, 'confidence.overall');
  requireScore(ctx, profile.confidence?.standingReference, 'confidence.standingReference', { optional: true });
  requireScore(ctx, profile.confidence?.sittingReference, 'confidence.sittingReference', { optional: true });
  requireScore(ctx, profile.confidence?.footGeometry, 'confidence.footGeometry', { optional: true });
  requireScore(ctx, profile.confidence?.foldedArms, 'confidence.foldedArms', { optional: true });
  requireArray(ctx, profile.failureReasons || [], 'failureReasons');

  if (profile.status === CalibrationStatuses.Valid && profile.assessmentType === AssessmentTypes.ChairStand30s) {
    if (!finiteNumber(profile.references?.standingHipPosition)) {
      add(ctx, 'MISSING_CHAIR_STAND_REFERENCE', 'references.standingHipPosition', 'Valid Chair Stand calibration requires standing hip reference.', profile.references);
    }
    if (!finiteNumber(profile.references?.sittingHipPosition)) {
      add(ctx, 'MISSING_CHAIR_STAND_REFERENCE', 'references.sittingHipPosition', 'Valid Chair Stand calibration requires sitting hip reference.', profile.references);
    }
  }

  if (profile.status === CalibrationStatuses.Valid && profile.assessmentType === AssessmentTypes.FourStageBalance) {
    if (!profile.references?.neutralFootPosition) {
      add(ctx, 'MISSING_BALANCE_REFERENCE', 'references.neutralFootPosition', 'Valid balance calibration requires neutral foot reference.', profile.references);
    }
    if (!finiteNumber(profile.confidence?.footGeometry)) {
      add(ctx, 'MISSING_BALANCE_FOOT_GEOMETRY_CONFIDENCE', 'confidence.footGeometry', 'Valid balance calibration requires foot geometry confidence.', profile.confidence);
    }
  }

  return done(ctx);
}

export function validateCalibrationApplication(profile, { sessionId, assessmentType } = {}) {
  const validation = validateCalibrationProfile(profile);
  if (!validation.ok) return validation;
  const ctx = context(profile);
  if (sessionId && profile.sessionId !== sessionId) {
    add(ctx, 'CALIBRATION_SESSION_MISMATCH', 'sessionId', 'Calibration belongs to a different session.', profile.sessionId);
  }
  if (assessmentType && profile.assessmentType !== assessmentType) {
    add(ctx, 'CALIBRATION_ASSESSMENT_TYPE_MISMATCH', 'assessmentType', 'Calibration belongs to a different assessment type.', profile.assessmentType);
  }
  return done(ctx);
}

function validateQualityReason(ctx, reason, path) {
  if (!reason || typeof reason !== 'object') {
    add(ctx, 'INVALID_QUALITY_REASON', path, `${path} must be an object.`, reason);
    return;
  }
  requireEnum(ctx, reason.code, QualityReasonCodes, `${path}.code`);
  if (reason.code === QualityReasonCodes.MultiplePeople && (!Number.isInteger(reason.count) || reason.count < 2)) {
    add(ctx, 'INVALID_QUALITY_REASON_COUNT', `${path}.count`, 'MULTIPLE_PEOPLE reason requires count >= 2.', reason.count);
  }
  if (reason.brightness !== undefined) requireScore(ctx, reason.brightness, `${path}.brightness`);
  if (reason.score !== undefined) requireScore(ctx, reason.score, `${path}.score`);
}

export function validateQualityStatus(status, { poseFrame = null } = {}) {
  const ctx = context(status);
  if (!status || typeof status !== 'object') {
    add(ctx, 'INVALID_QUALITY_STATUS', '', 'QualityStatus must be an object.', status);
    return done(ctx);
  }
  requireString(ctx, status.sessionId, 'sessionId');
  if (!Number.isInteger(status.frameId) || status.frameId < 0) add(ctx, 'INVALID_FRAME_ID', 'frameId', 'frameId must be a non-negative integer.', status.frameId);
  requireFinite(ctx, status.timestampMs, 'timestampMs');
  requireEnum(ctx, status.state, QualityStates, 'state');
  for (const [key, value] of Object.entries(status.scores || {})) {
    requireScore(ctx, value, `scores.${key}`, { optional: true });
  }
  const reasons = requireArray(ctx, status.reasons, 'reasons');
  reasons.forEach((reason, index) => validateQualityReason(ctx, reason, `reasons.${index}`));
  if (status.state === QualityStates.Invalid && !reasons.length) {
    add(ctx, 'INVALID_QUALITY_REQUIRES_REASON', 'reasons', 'INVALID quality must include at least one reason.', reasons);
  }
  requireFinite(ctx, status.timing?.currentFailureDurationMs, 'timing.currentFailureDurationMs');
  requireFinite(ctx, status.timing?.accumulatedPauseDurationMs, 'timing.accumulatedPauseDurationMs');
  if (poseFrame) {
    if (status.sessionId !== poseFrame.sessionId) add(ctx, 'QUALITY_SESSION_MISMATCH', 'sessionId', 'Quality session must match PoseFrame session.', status.sessionId);
    if (status.frameId !== poseFrame.frameId) add(ctx, 'QUALITY_FRAME_MISMATCH', 'frameId', 'Quality frame must match PoseFrame frame.', status.frameId);
  }
  return done(ctx);
}

const EVENTS_REQUIRING_EVIDENCE = new Set([
  AssessmentEventTypes.PositionConfirmed,
  AssessmentEventTypes.HoldStarted,
  AssessmentEventTypes.HoldFailed,
  AssessmentEventTypes.HoldCompleted,
  AssessmentEventTypes.FootMoved,
  AssessmentEventTypes.PositionLost,
  AssessmentEventTypes.LiftedFootTouchedDown,
  AssessmentEventTypes.SupportUsed,
  AssessmentEventTypes.TrackingLost,
  AssessmentEventTypes.SitConfirmed,
  AssessmentEventTypes.RisingStarted,
  AssessmentEventTypes.StandConfirmed,
  AssessmentEventTypes.DescendingStarted,
  AssessmentEventTypes.RepCompleted,
  AssessmentEventTypes.ArmUseConfirmed,
  AssessmentEventTypes.AssessmentCompleted,
]);

function validateEvidence(ctx, evidence, path) {
  if (!evidence || typeof evidence !== 'object') {
    add(ctx, 'INVALID_EVIDENCE', path, `${path} must be an object.`, evidence);
    return;
  }
  requireEnum(ctx, evidence.kind, EvidenceKinds, `${path}.kind`);
  if (evidence.kind === EvidenceKinds.Angle) requireFinite(ctx, evidence.valueDegrees, `${path}.valueDegrees`);
  if (evidence.kind === EvidenceKinds.Duration) requireFinite(ctx, evidence.durationMs, `${path}.durationMs`);
  if (evidence.kind === EvidenceKinds.Distance) requireFinite(ctx, evidence.normalizedValue, `${path}.normalizedValue`);
  if (evidence.kind === EvidenceKinds.StateTransition) {
    requireString(ctx, evidence.from, `${path}.from`);
    requireString(ctx, evidence.to, `${path}.to`);
  }
  if (evidence.kind === EvidenceKinds.Quality) {
    requireEnum(ctx, evidence.qualityState, QualityStates, `${path}.qualityState`);
    requireArray(ctx, evidence.reasons || [], `${path}.reasons`);
  }
}

export function validateAssessmentEvent(event, { sessionId = null, previousTimestampMs = null } = {}) {
  const ctx = context(event);
  if (!event || typeof event !== 'object') {
    add(ctx, 'INVALID_ASSESSMENT_EVENT', '', 'AssessmentEvent must be an object.', event);
    return done(ctx);
  }
  requireString(ctx, event.eventId, 'eventId');
  requireString(ctx, event.sessionId, 'sessionId');
  requireEnum(ctx, event.assessmentType, AssessmentTypes, 'assessmentType');
  requireEnum(ctx, event.type, AssessmentEventTypes, 'type');
  requireFinite(ctx, event.timestampMs, 'timestampMs');
  if (event.frameId !== undefined && (!Number.isInteger(event.frameId) || event.frameId < 0)) add(ctx, 'INVALID_FRAME_ID', 'frameId', 'frameId must be a non-negative integer.', event.frameId);
  requireScore(ctx, event.confidence, 'confidence', { optional: true });
  if (sessionId && event.sessionId !== sessionId) add(ctx, 'EVENT_SESSION_MISMATCH', 'sessionId', 'Event belongs to a different session.', event.sessionId);
  if (finiteNumber(previousTimestampMs) && finiteNumber(event.timestampMs) && event.timestampMs < previousTimestampMs) {
    add(ctx, 'EVENT_TIMESTAMP_REVERSED', 'timestampMs', 'Event timestamp is earlier than the previous event.', event.timestampMs);
  }
  if (event.evidence !== undefined) validateEvidence(ctx, event.evidence, 'evidence');
  if (EVENTS_REQUIRING_EVIDENCE.has(event.type) && !event.evidence) {
    add(ctx, 'MISSING_EVENT_EVIDENCE', 'evidence', `${event.type} requires structured evidence.`, event);
  }
  return done(ctx);
}

function validateSecondaryObservation(ctx, observation, path) {
  if (!observation || typeof observation !== 'object') {
    add(ctx, 'INVALID_SECONDARY_OBSERVATION', path, `${path} must be an object.`, observation);
    return;
  }
  requireString(ctx, observation.observationId, `${path}.observationId`);
  requireEnum(ctx, observation.type, SecondaryObservationTypes, `${path}.type`);
  requireScore(ctx, observation.confidence, `${path}.confidence`);
  requireArray(ctx, observation.evidenceEventIds || [], `${path}.evidenceEventIds`);
  if (observation.affectsClinicalScore !== false) {
    add(ctx, 'SECONDARY_OBSERVATION_AFFECTS_SCORE', `${path}.affectsClinicalScore`, 'Secondary observations must not affect clinical score.', observation.affectsClinicalScore);
  }
}

function validateChairStandMeasurements(ctx, measurements, path) {
  requireFinite(ctx, measurements.durationSeconds, `${path}.durationSeconds`);
  requireFinite(ctx, measurements.completedRepetitions, `${path}.completedRepetitions`);
  requireFinite(ctx, measurements.partialRepetitionCredit, `${path}.partialRepetitionCredit`);
  requireEnum(ctx, measurements.armUse, ArmUseStates, `${path}.armUse`);
  requireEnum(ctx, measurements.finalState, ChairStandFinalStates, `${path}.finalState`);
  requireEnum(ctx, measurements.partialRepetitionRuleStatus, PartialRepetitionRuleStatuses, `${path}.partialRepetitionRuleStatus`);
  if (
    measurements.partialRepetitionRuleStatus === PartialRepetitionRuleStatuses.NotImplemented
    && measurements.partialRepetitionCredit !== 0
  ) {
    add(ctx, 'PARTIAL_REP_NOT_IMPLEMENTED_CREDIT', `${path}.partialRepetitionCredit`, 'NOT_IMPLEMENTED partial rep rule cannot award credit.', measurements.partialRepetitionCredit);
  }
}

function validateBalanceStage(ctx, stage, path) {
  requireEnum(ctx, stage.stage, BalanceStages, `${path}.stage`);
  requireEnum(ctx, stage.status, BalanceStageStatuses, `${path}.status`);
  requireScore(ctx, stage.positionConfidence, `${path}.positionConfidence`);
  requireFinite(ctx, stage.holdDurationSeconds, `${path}.holdDurationSeconds`);
}

function validateBalanceMeasurements(ctx, measurements, path) {
  const stages = requireArray(ctx, measurements.stages, `${path}.stages`);
  stages.forEach((stage, index) => validateBalanceStage(ctx, stage, `${path}.stages.${index}`));
  if (measurements.lastAttemptedStage !== undefined) requireEnum(ctx, measurements.lastAttemptedStage, BalanceStages, `${path}.lastAttemptedStage`);
}

export function validateAssessmentResult(result) {
  const ctx = context(result);
  if (!result || typeof result !== 'object') {
    add(ctx, 'INVALID_ASSESSMENT_RESULT', '', 'AssessmentResult must be an object.', result);
    return done(ctx);
  }

  requireString(ctx, result.resultId, 'resultId');
  requireString(ctx, result.assessmentId, 'assessmentId');
  requireString(ctx, result.sessionId, 'sessionId');
  requireEnum(ctx, result.assessmentType, AssessmentTypes, 'assessmentType');
  requireEnum(ctx, result.status, AssessmentResultStatuses, 'status');
  if (result.resultType === AssessmentResultTypes.Frame) {
    add(ctx, 'FRAME_RESULT_NOT_ASSESSMENT_RESULT', 'resultType', 'Frame results cannot be AssessmentResult objects.', result.resultType);
  }

  const source = resultSource(result);
  if (!source) add(ctx, 'MISSING_RESULT_SOURCE', 'metadata.source', 'AssessmentResult source is required.', result.metadata);
  else requireEnum(ctx, source, ResultSources, 'metadata.source');
  requireBoolean(ctx, result.metadata?.isPersistable, 'metadata.isPersistable');
  requireBoolean(ctx, result.metadata?.isClinicallyScorable, 'metadata.isClinicallyScorable');
  requireString(ctx, result.metadata?.analyzerVersion, 'metadata.analyzerVersion');
  requireString(ctx, result.metadata?.schemaVersion, 'metadata.schemaVersion');
  requireFinite(ctx, result.metadata?.generatedAtMs, 'metadata.generatedAtMs');

  if (source === ResultSources.Demo && resultPersistable(result) === true) {
    add(ctx, 'DEMO_RESULT_PERSISTABLE', 'metadata.isPersistable', 'DEMO results must not be persistable.', result.metadata);
  }
  if (source === ResultSources.Fallback && resultClinicallyScorable(result) === true) {
    add(ctx, 'FALLBACK_RESULT_CLINICALLY_SCORABLE', 'metadata.isClinicallyScorable', 'FALLBACK results must not be clinically scorable.', result.metadata);
  }
  if (source !== ResultSources.LivePose && resultPersistable(result) === true) {
    add(ctx, 'NON_LIVE_RESULT_PERSISTABLE', 'metadata.isPersistable', 'Only LIVE_POSE results can be persistable.', result.metadata);
  }
  if (result.status !== AssessmentResultStatuses.Valid && resultPersistable(result) === true) {
    add(ctx, 'NON_VALID_RESULT_PERSISTABLE', 'metadata.isPersistable', 'Only VALID results can be persistable.', result.status);
  }

  requireFinite(ctx, result.timing?.startedAtMs, 'timing.startedAtMs');
  requireFinite(ctx, result.timing?.completedAtMs, 'timing.completedAtMs');
  requireFinite(ctx, result.timing?.activeAnalysisDurationMs, 'timing.activeAnalysisDurationMs');
  requireFinite(ctx, result.timing?.pausedDurationMs, 'timing.pausedDurationMs');
  if (
    finiteNumber(result.timing?.startedAtMs)
    && finiteNumber(result.timing?.completedAtMs)
    && result.timing.completedAtMs < result.timing.startedAtMs
  ) {
    add(ctx, 'ASSESSMENT_TIMING_REVERSED', 'timing.completedAtMs', 'Assessment completed before it started.', result.timing);
  }

  if (!result.primaryMeasurements || typeof result.primaryMeasurements !== 'object') {
    add(ctx, 'MISSING_PRIMARY_MEASUREMENTS', 'primaryMeasurements', 'AssessmentResult requires primary measurements.', result.primaryMeasurements);
  } else if (result.assessmentType === AssessmentTypes.ChairStand30s) {
    if (result.primaryMeasurements.kind !== ChairStandMeasurementKind) {
      add(ctx, 'ASSESSMENT_MEASUREMENT_KIND_MISMATCH', 'primaryMeasurements.kind', 'Chair Stand result must use CHAIR_STAND measurements.', result.primaryMeasurements.kind);
    } else validateChairStandMeasurements(ctx, result.primaryMeasurements, 'primaryMeasurements');
  } else if (result.assessmentType === AssessmentTypes.FourStageBalance) {
    if (result.primaryMeasurements.kind !== BalanceMeasurementKind) {
      add(ctx, 'ASSESSMENT_MEASUREMENT_KIND_MISMATCH', 'primaryMeasurements.kind', 'Balance result must use FOUR_STAGE_BALANCE measurements.', result.primaryMeasurements.kind);
    } else validateBalanceMeasurements(ctx, result.primaryMeasurements, 'primaryMeasurements');
  }

  const observations = requireArray(ctx, result.secondaryObservations || [], 'secondaryObservations');
  observations.forEach((observation, index) => validateSecondaryObservation(ctx, observation, `secondaryObservations.${index}`));
  requireScore(ctx, result.confidence, 'confidence');
  if (!result.qualitySummary || typeof result.qualitySummary !== 'object') {
    add(ctx, 'MISSING_QUALITY_SUMMARY', 'qualitySummary', 'AssessmentResult requires quality summary.', result.qualitySummary);
  }

  const events = requireArray(ctx, result.events || [], 'events');
  let previousTimestampMs = null;
  for (const [index, event] of events.entries()) {
    const eventValidation = validateAssessmentEvent(event, { sessionId: result.sessionId, previousTimestampMs });
    if (!eventValidation.ok) {
      eventValidation.failures.forEach((item) => add(ctx, item.code, `events.${index}${item.path ? `.${item.path}` : ''}`, item.message, item.receivedValue));
    }
    if (finiteNumber(event?.timestampMs)) previousTimestampMs = event.timestampMs;
  }
  if (
    result.status === AssessmentResultStatuses.Valid
    && !events.some((event) => event.type === AssessmentEventTypes.AssessmentCompleted)
  ) {
    add(ctx, 'VALID_RESULT_MISSING_FINAL_EVENT', 'events', 'VALID AssessmentResult requires ASSESSMENT_COMPLETED event.', events);
  }

  return done(ctx);
}

export function validateSteadiScoreResult(score) {
  const ctx = context(score);
  if (!score || typeof score !== 'object') {
    add(ctx, 'INVALID_STEADI_SCORE_RESULT', '', 'SteadiScoreResult must be an object.', score);
    return done(ctx);
  }
  requireEnum(ctx, score.riskLevel, SteadiRiskLevels, 'riskLevel');
  if (![true, false, SteadiRiskLevels.NotScorable].includes(score.strengthProblem)) {
    add(ctx, 'INVALID_STEADI_STRENGTH_PROBLEM', 'strengthProblem', 'strengthProblem must be boolean or NOT_SCORABLE.', score.strengthProblem);
  }
  if (![true, false, SteadiRiskLevels.NotScorable].includes(score.balanceProblem)) {
    add(ctx, 'INVALID_STEADI_BALANCE_PROBLEM', 'balanceProblem', 'balanceProblem must be boolean or NOT_SCORABLE.', score.balanceProblem);
  }
  if (!score.inputs || typeof score.inputs !== 'object') add(ctx, 'INVALID_STEADI_INPUTS', 'inputs', 'inputs must be an object.', score.inputs);
  requireString(ctx, score.appliedRuleVersion, 'appliedRuleVersion');
  requireArray(ctx, score.reasonCodes || [], 'reasonCodes');
  return done(ctx);
}

export function validateFunctionalFinding(finding) {
  const ctx = context(finding);
  if (!finding || typeof finding !== 'object') {
    add(ctx, 'INVALID_FUNCTIONAL_FINDING', '', 'FunctionalFinding must be an object.', finding);
    return done(ctx);
  }
  requireString(ctx, finding.findingId, 'findingId');
  requireString(ctx, finding.assessmentId, 'assessmentId');
  requireString(ctx, finding.findingType, 'findingType');
  requireEnum(ctx, finding.domain, FunctionalDomains, 'domain');
  requireEnum(ctx, finding.classification, FindingClassifications, 'classification');
  requireEnum(ctx, finding.severity, FindingSeverities, 'severity');
  requireScore(ctx, finding.confidence, 'confidence');
  requireArray(ctx, finding.evidence?.measurementKeys || [], 'evidence.measurementKeys');
  requireArray(ctx, finding.evidence?.eventIds || [], 'evidence.eventIds');
  if (!finding.evidence?.observedValues || typeof finding.evidence.observedValues !== 'object') {
    add(ctx, 'INVALID_FINDING_EVIDENCE', 'evidence.observedValues', 'observedValues must be an object.', finding.evidence);
  }
  requireString(ctx, finding.userMessageKey, 'userMessageKey');
  requireArray(ctx, finding.recommendationTags || [], 'recommendationTags');
  return done(ctx);
}

export function validateExercisePlan(plan, { sourceAssessments = [] } = {}) {
  const ctx = context(plan);
  if (!plan || typeof plan !== 'object') {
    add(ctx, 'INVALID_EXERCISE_PLAN', '', 'ExercisePlan must be an object.', plan);
    return done(ctx);
  }
  requireString(ctx, plan.planId, 'planId');
  requireString(ctx, plan.userId, 'userId');
  requireEnum(ctx, plan.riskLevel, SteadiRiskLevels, 'riskLevel');
  requireEnum(ctx, plan.supervisionRequirement, SupervisionRequirements, 'supervisionRequirement');
  requireString(ctx, plan.generatedByRuleVersion, 'generatedByRuleVersion');
  requireEnum(ctx, plan.status, ExercisePlanStatuses, 'status');
  const sourceFindingIds = requireArray(ctx, plan.sourceFindingIds || [], 'sourceFindingIds');
  const sourceAssessmentIds = requireArray(ctx, plan.sourceAssessmentIds || [], 'sourceAssessmentIds');
  requireArray(ctx, plan.safetyNotices || [], 'safetyNotices');
  requireArray(ctx, plan.excludedExercises || [], 'excludedExercises');

  const exercises = requireArray(ctx, plan.selectedExercises || [], 'selectedExercises');
  const exerciseIds = [];
  exercises.forEach((exercise, index) => {
    const path = `selectedExercises.${index}`;
    requireString(ctx, exercise.exerciseId, `${path}.exerciseId`);
    exerciseIds.push(exercise.exerciseId);
    requireString(ctx, exercise.level, `${path}.level`);
    requireEnum(ctx, exercise.supportRequirement, SupportRequirements, `${path}.supportRequirement`);
    requireEnum(ctx, exercise.cameraVerification, CameraVerificationModes, `${path}.cameraVerification`);
    const reasonFindingIds = requireArray(ctx, exercise.reasonFindingIds || [], `${path}.reasonFindingIds`);
    requireArray(ctx, exercise.reasonCodes || [], `${path}.reasonCodes`);
    if (!reasonFindingIds.length) {
      add(ctx, 'EXERCISE_MISSING_SOURCE_FINDING', `${path}.reasonFindingIds`, 'Recommended exercise must cite at least one finding.', exercise);
    }
    for (const findingId of reasonFindingIds) {
      if (!sourceFindingIds.includes(findingId)) {
        add(ctx, 'EXERCISE_UNKNOWN_SOURCE_FINDING', `${path}.reasonFindingIds`, 'Exercise cites a finding outside sourceFindingIds.', findingId);
      }
    }
  });
  if (hasDuplicate(exerciseIds)) add(ctx, 'DUPLICATE_EXERCISE', 'selectedExercises', 'ExercisePlan must not contain duplicate exercises.', exerciseIds);
  if (plan.riskLevel === SteadiRiskLevels.High && plan.supervisionRequirement !== SupervisionRequirements.ProfessionalReviewRequired) {
    add(ctx, 'HIGH_RISK_REQUIRES_PROFESSIONAL_REVIEW', 'supervisionRequirement', 'HIGH risk plans require professional review.', plan.supervisionRequirement);
  }
  if (sourceAssessments.some((assessment) => resultSource(assessment) !== ResultSources.LivePose)) {
    add(ctx, 'NON_LIVE_ASSESSMENT_EXERCISE_PLAN', 'sourceAssessments', 'Demo/Fallback/Manual assessments cannot generate a real ExercisePlan.', sourceAssessments.map(resultSource));
  }
  if (sourceAssessments.length && sourceAssessmentIds.length) {
    for (const assessment of sourceAssessments) {
      if (!sourceAssessmentIds.includes(assessment.assessmentId)) {
        add(ctx, 'PLAN_SOURCE_ASSESSMENT_MISMATCH', 'sourceAssessmentIds', 'ExercisePlan omits one of its source assessments.', assessment.assessmentId);
      }
    }
  }
  return done(ctx);
}

export function validateAgentAction(action) {
  const ctx = context(action);
  if (!action || typeof action !== 'object') {
    add(ctx, 'INVALID_AGENT_ACTION', '', 'AgentAction must be an object.', action);
    return done(ctx);
  }
  requireEnum(ctx, action.type, AgentActionTypes, 'type');
  requireString(ctx, action.reasonCode, 'reasonCode');
  if (action.type === AgentActionTypes.RequestAssessment) requireEnum(ctx, action.assessmentType, AssessmentTypes, 'assessmentType');
  if (action.type === AgentActionTypes.ScheduleReassessment) requireFinite(ctx, action.scheduledAtMs, 'scheduledAtMs');
  return done(ctx);
}

export function validateWorkerCommand(command) {
  const ctx = context(command);
  if (!command || typeof command !== 'object') {
    add(ctx, 'INVALID_WORKER_COMMAND', '', 'WorkerCommand must be an object.', command);
    return done(ctx);
  }
  requireEnum(ctx, command.type, WorkerCommandTypes, 'type');
  if ([WorkerCommandTypes.StartSession, WorkerCommandTypes.ProcessFrame, WorkerCommandTypes.FinalizeSession, WorkerCommandTypes.ResetSession, WorkerCommandTypes.CancelSession].includes(command.type)) {
    requireString(ctx, command.sessionId, 'sessionId');
  }
  if (command.assessmentType !== undefined && !isKnownAssessmentType(command.assessmentType)) {
    add(ctx, 'INVALID_WORKER_ASSESSMENT_TYPE', 'assessmentType', 'WorkerCommand assessmentType is invalid.', command.assessmentType);
  }
  return done(ctx);
}

export function validateFrameAnalysisResult(result) {
  const ctx = context(result);
  if (!result || typeof result !== 'object') {
    add(ctx, 'INVALID_FRAME_ANALYSIS_RESULT', '', 'FrameAnalysisResult must be an object.', result);
    return done(ctx);
  }
  requireString(ctx, result.sessionId, 'sessionId');
  if (!Number.isInteger(result.frameId) || result.frameId < 0) add(ctx, 'INVALID_FRAME_ID', 'frameId', 'frameId must be a non-negative integer.', result.frameId);
  requireFinite(ctx, result.timestampMs, 'timestampMs');
  if (result.isFinal !== false) add(ctx, 'FRAME_RESULT_MARKED_FINAL', 'isFinal', 'FrameAnalysisResult must have isFinal=false.', result.isFinal);
  const poseValidation = validatePoseFrame(result.poseFrame);
  if (!poseValidation.ok) poseValidation.failures.forEach((item) => add(ctx, item.code, `poseFrame.${item.path || ''}`, item.message, item.receivedValue));
  const qualityValidation = validateQualityStatus(result.qualityStatus, { poseFrame: result.poseFrame });
  if (!qualityValidation.ok) qualityValidation.failures.forEach((item) => add(ctx, item.code, `qualityStatus.${item.path || ''}`, item.message, item.receivedValue));
  const events = requireArray(ctx, result.assessmentEvents || [], 'assessmentEvents');
  events.forEach((event, index) => {
    const eventValidation = validateAssessmentEvent(event, { sessionId: result.sessionId });
    if (!eventValidation.ok) eventValidation.failures.forEach((item) => add(ctx, item.code, `assessmentEvents.${index}.${item.path || ''}`, item.message, item.receivedValue));
  });
  return done(ctx);
}

export function validateFinalAssessmentResponse(response, {
  activeSessionId = null,
  expectedAssessmentType = null,
  cancelledSessionIds = [],
} = {}) {
  const ctx = context(response);
  if (!response || typeof response !== 'object') {
    add(ctx, 'INVALID_FINAL_ASSESSMENT_RESPONSE', '', 'FinalAssessmentResponse must be an object.', response);
    return done(ctx);
  }
  requireString(ctx, response.sessionId, 'sessionId');
  if (response.isFinal !== true) add(ctx, 'FINAL_RESPONSE_NOT_FINAL', 'isFinal', 'FinalAssessmentResponse must have isFinal=true.', response.isFinal);
  if (activeSessionId && response.sessionId !== activeSessionId) add(ctx, 'STALE_FINAL_RESPONSE', 'sessionId', 'Final response belongs to a stale session.', response.sessionId);
  if (cancelledSessionIds.includes(response.sessionId)) add(ctx, 'CANCELLED_SESSION_FINAL_RESPONSE', 'sessionId', 'Final response belongs to a cancelled session.', response.sessionId);
  const resultValidation = validateAssessmentResult(response.result);
  if (!resultValidation.ok) resultValidation.failures.forEach((item) => add(ctx, item.code, `result.${item.path || ''}`, item.message, item.receivedValue));
  if (response.result?.sessionId && response.sessionId !== response.result.sessionId) {
    add(ctx, 'FINAL_RESPONSE_RESULT_SESSION_MISMATCH', 'result.sessionId', 'Final response session must match AssessmentResult session.', response.result.sessionId);
  }
  if (expectedAssessmentType && response.result?.assessmentType !== expectedAssessmentType) {
    add(ctx, 'FINAL_RESPONSE_ASSESSMENT_TYPE_MISMATCH', 'result.assessmentType', 'Final response assessmentType does not match the active assessment.', response.result?.assessmentType);
  }
  return done(ctx);
}

export function validateWorkerResponse(response, options = {}) {
  const ctx = context(response);
  if (!response || typeof response !== 'object') {
    add(ctx, 'INVALID_WORKER_RESPONSE', '', 'WorkerResponse must be an object.', response);
    return done(ctx);
  }
  requireEnum(ctx, response.type, WorkerResponseTypes, 'type');
  const sessionScoped = [
    WorkerResponseTypes.SessionReady,
    WorkerResponseTypes.FrameResult,
    WorkerResponseTypes.FinalResult,
    WorkerResponseTypes.SessionCancelled,
    WorkerResponseTypes.AnalysisError,
  ];
  if (sessionScoped.includes(response.type)) requireString(ctx, response.sessionId || response.payload?.sessionId || response.result?.sessionId, 'sessionId');
  if (response.type === WorkerResponseTypes.FrameResult && response.resultType === AssessmentResultTypes.Final) {
    add(ctx, 'FRAME_RESPONSE_MARKED_FINAL', 'resultType', 'FRAME_RESULT response cannot carry FINAL_RESULT type.', response.resultType);
  }
  if (response.type === WorkerResponseTypes.FinalResult) {
    const finalResponse = response.finalResponse || (response.result ? { sessionId: response.sessionId, result: response.result, isFinal: true } : null);
    const validation = validateFinalAssessmentResponse(finalResponse, options);
    if (!validation.ok) validation.failures.forEach((item) => add(ctx, item.code, item.path, item.message, item.receivedValue));
  }
  return done(ctx);
}
