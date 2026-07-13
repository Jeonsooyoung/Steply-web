import { MediaPipePoseNames } from '../../pose/poseLandmarks.js';
import {
  normalizeFrameId,
} from '../shared/types/index.js';
import { validatePoseFrame } from '../shared/validation/runtimeValidation.js';

const LOWER_BODY_INDEXES = new Set([23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
const FEET_INDEXES = new Set([27, 28, 29, 30, 31, 32]);
const UPPER_BODY_INDEXES = new Set([0, 11, 12, 13, 14, 15, 16]);

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp01(value) {
  if (!finite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function landmarkIndex(point = {}, fallbackIndex) {
  if (Number.isInteger(point.index)) return point.index;
  if (point.name) {
    const index = MediaPipePoseNames.indexOf(point.name);
    if (index >= 0) return index;
  }
  return fallbackIndex;
}

function landmarkConfidence(point = {}) {
  if (finite(point.visibility)) return clamp01(point.visibility);
  if (finite(point.presence)) return clamp01(point.presence);
  return finite(point.x) && finite(point.y) ? 1 : 0;
}

function average(values = []) {
  const finiteValues = values.filter(finite);
  return finiteValues.length
    ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
    : 0;
}

export function toPoseLandmark(point = {}, fallbackIndex = 0) {
  const index = landmarkIndex(point, fallbackIndex);
  const x = finite(point.x) ? point.x : NaN;
  const y = finite(point.y) ? point.y : NaN;
  const z = finite(point.z) ? point.z : undefined;
  const visibility = finite(point.visibility) ? clamp01(point.visibility) : undefined;
  const presence = finite(point.presence) ? clamp01(point.presence) : undefined;
  return {
    index,
    x,
    y,
    ...(z !== undefined ? { z } : {}),
    ...(visibility !== undefined ? { visibility } : {}),
    ...(presence !== undefined ? { presence } : {}),
    isValid: Number.isInteger(index) && index >= 0 && index <= 32 && finite(x) && finite(y),
  };
}

export function toPoseWorldLandmark(point = {}, fallbackIndex = 0) {
  const index = landmarkIndex(point, fallbackIndex);
  const xMeters = finite(point.xMeters) ? point.xMeters : point.x;
  const yMeters = finite(point.yMeters) ? point.yMeters : point.y;
  const zMeters = finite(point.zMeters) ? point.zMeters : point.z;
  return {
    index,
    xMeters: finite(xMeters) ? xMeters : NaN,
    yMeters: finite(yMeters) ? yMeters : NaN,
    zMeters: finite(zMeters) ? zMeters : NaN,
    ...(finite(point.visibility) ? { visibility: clamp01(point.visibility) } : {}),
    isValid: Number.isInteger(index) && index >= 0 && index <= 32 && finite(xMeters) && finite(yMeters) && finite(zMeters),
  };
}

function confidenceForGroup(landmarks, indexSet) {
  return average(landmarks.filter((point) => indexSet.has(point.index)).map(landmarkConfidence));
}

export function confidenceFromLandmarks(landmarks = [], fallbackOverall = 0) {
  const normalized = landmarks.map((point, index) => (
    Number.isInteger(point?.index) ? point : toPoseLandmark(point, index)
  ));
  return {
    overall: clamp01(finite(fallbackOverall) ? fallbackOverall : average(normalized.map(landmarkConfidence))),
    lowerBody: clamp01(confidenceForGroup(normalized, LOWER_BODY_INDEXES)),
    feet: clamp01(confidenceForGroup(normalized, FEET_INDEXES)),
    upperBody: clamp01(confidenceForGroup(normalized, UPPER_BODY_INDEXES)),
  };
}

export function createPoseFrame({
  sessionId,
  frameId,
  timestampMs,
  image,
  normalizedLandmarks = [],
  worldLandmarks,
  confidence,
  detectedPersonCount = 0,
  receivedAtMs,
  completedAtMs,
  mirrored = false,
  secondaryPeople = [],
} = {}) {
  const numericFrameId = normalizeFrameId(frameId);
  const poseLandmarks = normalizedLandmarks.map(toPoseLandmark);
  const completed = finite(completedAtMs) ? completedAtMs : Date.now();
  const received = finite(receivedAtMs) ? receivedAtMs : timestampMs;
  const poseFrame = {
    sessionId,
    frameId: numericFrameId,
    timestampMs,
    image: {
      width: image?.width,
      height: image?.height,
      mirrored: Boolean(image?.mirrored ?? mirrored),
    },
    normalizedLandmarks: poseLandmarks,
    ...(worldLandmarks ? { worldLandmarks: worldLandmarks.map(toPoseWorldLandmark) } : {}),
    confidence: confidence || confidenceFromLandmarks(poseLandmarks),
    detectedPersonCount: Math.max(0, Math.trunc(detectedPersonCount || 0)),
    secondaryPeople: secondaryPeople.map((person) => ({
      normalizedLandmarks: (person.normalizedLandmarks || []).map(toPoseLandmark),
      worldLandmarks: (person.worldLandmarks || []).map(toPoseWorldLandmark),
    })),
    processing: {
      receivedAtMs: received,
      completedAtMs: completed,
      latencyMs: finite(received) && finite(completed) ? Math.max(0, completed - received) : NaN,
    },
  };
  return {
    value: poseFrame,
    validation: validatePoseFrame(poseFrame),
  };
}

export function poseFrameFromWorkerDetection({
  detected,
  image,
  normalizedLandmarks = detected?.landmarks || [],
  worldLandmarks = null,
  secondaryPeople = detected?.people?.slice(1) || [],
  completedAtMs = Date.now(),
  mirrored = false,
} = {}) {
  const landmarksForFrame = detected?.poseCount > 0 ? normalizedLandmarks : [];
  return createPoseFrame({
    sessionId: detected?.sessionId,
    frameId: detected?.frameId,
    timestampMs: detected?.timestampMs,
    image,
    normalizedLandmarks: landmarksForFrame,
    worldLandmarks,
    secondaryPeople,
    confidence: confidenceFromLandmarks(landmarksForFrame, detected?.confidence),
    detectedPersonCount: detected?.poseCount || 0,
    receivedAtMs: detected?.inputReceivedAt,
    completedAtMs,
    mirrored,
  });
}
