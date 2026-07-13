import { qualityConfig } from '../shared/config/quality.config.js';
import {
  AssessmentTypes,
  QualityReasonCodes,
} from '../shared/types/index.js';
import {
  bodyInFrameScore,
  estimateCameraView,
  feetConfidence,
  lowerBodyConfidence,
} from '../pose/coordinateMapping.js';
import { LandmarkIndexes, worldLandmarkByIndex } from '../pose/coordinateMapping.js';

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value) {
  if (!finite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function lightingScore(brightness) {
  if (!finite(brightness)) return 0.6;
  if (brightness < qualityConfig.lowLightBrightness) return clamp01(brightness / qualityConfig.lowLightBrightness);
  if (brightness > qualityConfig.highLightBrightness) return clamp01((1 - brightness) / (1 - qualityConfig.highLightBrightness));
  return 1;
}

function cameraScoreForAssessment(camera, assessmentType) {
  if (assessmentType === AssessmentTypes.FourStageBalance) {
    return Math.min(camera.score, camera.footPlaneObservableScore);
  }
  if (assessmentType === AssessmentTypes.ChairStand30s) {
    return camera.view === 'OBLIQUE_LEFT' || camera.view === 'OBLIQUE_RIGHT' || camera.view === 'SIDE'
      ? Math.max(camera.score, qualityConfig.chairPreferredCameraScore)
      : Math.min(camera.score, qualityConfig.chairRejectedCameraScore);
  }
  return camera.score;
}

function footInFrameScore(frame) {
  const footIndexes = [27, 28, 29, 30, 31, 32];
  const landmarks = frame?.normalizedLandmarks || [];
  const footPoints = footIndexes
    .map((index) => landmarks.find((point) => point.index === index))
    .filter(Boolean);
  if (!footPoints.length) return 0;
  const inside = footPoints.filter((point) => (
    Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && point.x >= qualityConfig.footFrameMargin
    && point.x <= 1 - qualityConfig.footFrameMargin
    && point.y >= qualityConfig.footFrameMargin
    && point.y <= 1 - qualityConfig.footFrameMargin
    && (point.visibility ?? 1) >= qualityConfig.footFrameMinimumVisibility
  ));
  return inside.length / footIndexes.length;
}

export function evaluatePoseFrameQuality(frame, {
  assessmentType,
  brightness = null,
  config = qualityConfig,
  calibrationProfile = null,
} = {}) {
  const lowerBody = lowerBodyConfidence(frame);
  const feet = Math.min(feetConfidence(frame), footInFrameScore(frame));
  const bodyFrame = bodyInFrameScore(frame);
  const camera = estimateCameraView(frame);
  const lighting = lightingScore(brightness?.raw ?? brightness?.corrected ?? brightness);
  const cameraOrientation = cameraScoreForAssessment(camera, assessmentType);
  const overall = clamp01(frame?.confidence?.overall ?? 0);
  const reasons = [];
  const normalized = frame?.normalizedLandmarks || [];
  const core = normalized.filter((point) => point.index >= config.coreLandmarkStart && point.index <= config.coreLandmarkEnd);
  const g1Pass = core.length === config.coreLandmarkEnd - config.coreLandmarkStart + 1
    && core.every((point) => (point.visibility ?? 0) >= config.minVisibility);
  const g2Pass = core.length === config.coreLandmarkEnd - config.coreLandmarkStart + 1
    && core.every((point) => finite(point.x) && finite(point.y)
      && point.x >= config.frameMargin && point.x <= 1 - config.frameMargin
      && point.y >= config.frameMargin && point.y <= 1 - config.frameMargin);
  const leftShoulderWorld = worldLandmarkByIndex(frame, LandmarkIndexes.LeftShoulder);
  const rightShoulderWorld = worldLandmarkByIndex(frame, LandmarkIndexes.RightShoulder);
  const shoulderMl = leftShoulderWorld && rightShoulderWorld
    ? Math.abs(leftShoulderWorld.x - rightShoulderWorld.x) : null;
  const calibratedShoulder = calibrationProfile?.references?.W_shoulder
    ?? calibrationProfile?.bodyScale?.shoulderWidth;
  const g4Pass = !finite(calibratedShoulder) || (finite(shoulderMl) && shoulderMl >= config.frontalShoulderWidthRatio * calibratedShoulder);
  const brightnessValue = brightness?.raw ?? brightness?.corrected ?? brightness;
  const g5Pass = !finite(brightnessValue)
    || (brightnessValue >= config.lowLightBrightness && brightnessValue <= config.highLightBrightness);
  const gates = [
    { gate: 'G1', pass: g1Pass },
    { gate: 'G2', pass: g2Pass },
    { gate: 'G4', pass: g4Pass },
    { gate: 'G5', pass: g5Pass },
  ];

  if ((frame?.detectedPersonCount || 0) === 0) reasons.push({ code: QualityReasonCodes.NoPerson });
  if ((frame?.detectedPersonCount || 0) > 1 && assessmentType !== AssessmentTypes.FourStageBalance) {
    reasons.push({ code: QualityReasonCodes.MultiplePeople, count: frame.detectedPersonCount });
  }
  if (!g2Pass) reasons.push({ code: QualityReasonCodes.BodyOutOfFrame, gate: 'G2' });
  if (!g1Pass) reasons.push({ code: QualityReasonCodes.FeetNotVisible, gate: 'G1' });
  if (!g5Pass) reasons.push({ code: QualityReasonCodes.LowLight, gate: 'G5', brightness: brightnessValue });
  if (overall < config.minOverallConfidence || lowerBody < config.minLowerBodyConfidence) {
    reasons.push({ code: QualityReasonCodes.LowLandmarkConfidence, score: Math.min(overall, lowerBody) });
  }
  if (!g4Pass) reasons.push({ code: QualityReasonCodes.WrongCameraAngle, gate: 'G4' });
  if (
    assessmentType === AssessmentTypes.FourStageBalance
    && camera.footPlaneObservableScore < config.footPlacementObservableMinScore
  ) {
    reasons.push({
      code: QualityReasonCodes.WrongCameraAngle,
      detail: 'FOOT_PLACEMENT_NOT_OBSERVABLE',
    });
  }

  return {
    scores: {
      overall,
      bodyVisibility: bodyFrame,
      lowerBodyVisibility: lowerBody,
      feetVisibility: feet,
      orientation: cameraOrientation,
      lighting,
      tracking: overall,
    },
    camera,
    footPlacementObservable: camera.footPlaneObservableScore >= config.footPlacementObservableMinScore,
    reasons,
    gates,
    pass: reasons.length === 0,
  };
}
