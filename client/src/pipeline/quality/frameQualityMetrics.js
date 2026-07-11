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
  if (brightness > 0.92) return clamp01((1 - brightness) / 0.08);
  return 1;
}

function cameraScoreForAssessment(camera, assessmentType) {
  if (assessmentType === AssessmentTypes.FourStageBalance) {
    return Math.min(camera.score, camera.footPlaneObservableScore);
  }
  if (assessmentType === AssessmentTypes.ChairStand30s) {
    return camera.view === 'OBLIQUE_LEFT' || camera.view === 'OBLIQUE_RIGHT' || camera.view === 'SIDE'
      ? Math.max(camera.score, 0.65)
      : Math.min(camera.score, 0.45);
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
    && point.x >= 0.015
    && point.x <= 0.985
    && point.y >= 0.015
    && point.y <= 0.985
    && (point.visibility ?? 1) >= 0.35
  ));
  return inside.length / footIndexes.length;
}

export function evaluatePoseFrameQuality(frame, {
  assessmentType,
  brightness = null,
  config = qualityConfig,
} = {}) {
  const lowerBody = lowerBodyConfidence(frame);
  const feet = Math.min(feetConfidence(frame), footInFrameScore(frame));
  const bodyFrame = bodyInFrameScore(frame);
  const camera = estimateCameraView(frame);
  const lighting = lightingScore(brightness?.corrected ?? brightness?.raw ?? brightness);
  const cameraOrientation = cameraScoreForAssessment(camera, assessmentType);
  const overall = clamp01(frame?.confidence?.overall ?? 0);
  const reasons = [];

  if ((frame?.detectedPersonCount || 0) === 0) reasons.push({ code: QualityReasonCodes.NoPerson });
  if ((frame?.detectedPersonCount || 0) > 1) reasons.push({ code: QualityReasonCodes.MultiplePeople, count: frame.detectedPersonCount });
  if (bodyFrame < config.minBodyInFrameScore) reasons.push({ code: QualityReasonCodes.BodyOutOfFrame });
  if (feet < config.minFeetConfidence) reasons.push({ code: QualityReasonCodes.FeetNotVisible });
  if (lighting < config.minLightingScore) reasons.push({ code: QualityReasonCodes.LowLight, brightness: brightness?.corrected ?? brightness?.raw ?? brightness });
  if (overall < config.minOverallConfidence || lowerBody < config.minLowerBodyConfidence) {
    reasons.push({ code: QualityReasonCodes.LowLandmarkConfidence, score: Math.min(overall, lowerBody) });
  }
  if (cameraOrientation < config.minCameraOrientationScore) reasons.push({ code: QualityReasonCodes.WrongCameraAngle });
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
    pass: reasons.length === 0,
  };
}
