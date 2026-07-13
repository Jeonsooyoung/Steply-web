import {
  AssessmentTypes,
  CalibrationStatuses,
  CameraViews,
  CoordinateAxisDirections,
  VerticalMotionDirections,
  createTypedId,
} from '../shared/types/index.js';
import {
  validateCalibrationApplication,
  validateCalibrationProfile,
} from '../shared/validation/runtimeValidation.js';

export function createDefaultCoordinateOrientation({ mirrored = false } = {}) {
  return {
    imageYAxis: CoordinateAxisDirections.DownPositive,
    worldYAxis: CoordinateAxisDirections.Unknown,
    cameraMirrored: Boolean(mirrored),
    verticalMotionDirection: VerticalMotionDirections.Unknown,
  };
}

export function createCalibrationProfile({
  calibrationId = createTypedId('calibration'),
  sessionId,
  assessmentType = AssessmentTypes.ChairStand30s,
  coordinateOrientation = createDefaultCoordinateOrientation(),
  bodyScale = {},
  references = {},
  camera = {},
  confidence = {},
  status = CalibrationStatuses.NotStarted,
  failureReasons = [],
  createdAtMs = Date.now(),
  sampledDurationMs = 0,
} = {}) {
  const profile = {
    calibrationId,
    sessionId,
    assessmentType,
    coordinateOrientation,
    bodyScale,
    references,
    camera: {
      view: camera.view || CameraViews.Unknown,
      estimatedAngleDegrees: camera.estimatedAngleDegrees,
      mirrored: Boolean(camera.mirrored ?? coordinateOrientation.cameraMirrored),
    },
    confidence: {
      overall: confidence.overall ?? 0,
      standingReference: confidence.standingReference,
      sittingReference: confidence.sittingReference,
      footGeometry: confidence.footGeometry,
      foldedArms: confidence.foldedArms,
    },
    status,
    failureReasons,
    createdAtMs,
    sampledDurationMs,
  };
  return {
    value: profile,
    validation: validateCalibrationProfile(profile),
  };
}

export function createCalibrationApplicationContext({ sessionId, assessmentType } = {}) {
  return { sessionId, assessmentType };
}

export { validateCalibrationApplication, validateCalibrationProfile };
