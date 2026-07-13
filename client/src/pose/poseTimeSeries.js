import { MediaPipePoseNames } from './poseLandmarks';
import { derivePoseMetrics } from './poseKinematics';
import { stage2Operational } from '../pipeline/shared/config/stage2Analysis.config.js';

export const STEADI_LANDMARK_SERIES_FRAME_LIMIT = stage2Operational.landmarkSeries.maximumSamples;
export const STEADI_LANDMARK_SERIES_MAX_AGE_MS = stage2Operational.landmarkSeries.maximumAgeMs;

const SERIES_TYPE = 'steadi_landmark_timeseries';
const LANDMARK_MODEL = 'mediapipe_pose_33';

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function visibilityOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function normalizePoseLandmarks(landmarks = []) {
  const byName = new Map();
  for (const point of landmarks || []) {
    if (point?.name) byName.set(point.name, point);
  }

  return MediaPipePoseNames.map((name, index) => {
    const point = byName.get(name) || landmarks[index] || {};
    return {
      index,
      name,
      x: finiteOrNull(point.x),
      y: finiteOrNull(point.y),
      z: finiteOrNull(point.z),
      visibility: visibilityOrZero(point.visibility),
    };
  });
}

export function normalizeWorldPoseLandmarks(landmarks = []) {
  return MediaPipePoseNames.map((name, index) => {
    const point = landmarks[index] || {};
    return {
      index,
      name,
      x: finiteOrNull(point.xMeters ?? point.x),
      y: finiteOrNull(point.yMeters ?? point.y),
      z: finiteOrNull(point.zMeters ?? point.z),
      visibility: visibilityOrZero(point.visibility),
    };
  });
}

export function createPoseLandmarkFrame({
  sequence = 0,
  timestampMs,
  receivedAt = timestampMs,
  landmarks = [],
  worldLandmarks = [],
  retainedNormalizedLandmarks = landmarks,
  retainedWorldLandmarks = worldLandmarks,
  confidence = 0,
} = {}) {
  return {
    sequence,
    timestampMs,
    receivedAt,
    landmarks: normalizePoseLandmarks(landmarks),
    worldLandmarks: normalizeWorldPoseLandmarks(worldLandmarks),
    retainedNormalizedLandmarks: normalizePoseLandmarks(retainedNormalizedLandmarks),
    retainedWorldLandmarks: normalizeWorldPoseLandmarks(retainedWorldLandmarks),
    confidence: Number.isFinite(confidence) ? confidence : 0,
    landmarkModel: LANDMARK_MODEL,
  };
}

function frameRateFromFrames(frames = []) {
  if (frames.length < 2) return null;
  const first = frames[0];
  const latest = frames.at(-1);
  const durationMs = latest.timestampMs - first.timestampMs;
  return durationMs > 0 ? (frames.length - 1) * 1000 / durationMs : null;
}

export class PoseLandmarkSeries {
  constructor({
    maxFrames = STEADI_LANDMARK_SERIES_FRAME_LIMIT,
    maxAgeMs = STEADI_LANDMARK_SERIES_MAX_AGE_MS,
  } = {}) {
    this.maxFrames = maxFrames;
    this.maxAgeMs = maxAgeMs;
    this.frames = [];
  }

  reset() {
    this.frames = [];
  }

  push(frameInput = {}, { includeSeriesFrames = true } = {}) {
    const frame = createPoseLandmarkFrame(frameInput);
    this.frames.push(frame);
    this.prune(frame.timestampMs);

    const latestIndex = this.frames.length - 1;
    const previousFrame = latestIndex > 0 ? this.frames[latestIndex - 1] : null;
    const metrics = derivePoseMetrics({
      currentFrame: frame,
      previousFrame,
      frames: this.frames,
    });
    const annotatedFrame = {
      ...frame,
      metrics,
    };
    this.frames[latestIndex] = annotatedFrame;

    return {
      frame: annotatedFrame,
      metrics,
      series: this.snapshot({ includeFrames: includeSeriesFrames }),
    };
  }

  prune(latestTimestampMs) {
    while (this.frames.length > this.maxFrames) this.frames.shift();
    if (!Number.isFinite(latestTimestampMs)) return;
    while (
      this.frames.length > 1
      && latestTimestampMs - this.frames[0].timestampMs > this.maxAgeMs
    ) {
      this.frames.shift();
    }
  }

  getFrames() {
    return this.frames.slice();
  }

  getLatestFrame() {
    return this.frames.at(-1) || null;
  }

  getPreviousFrame() {
    return this.frames.length > 1 ? this.frames[this.frames.length - 2] : null;
  }

  getWindow(windowMs) {
    const latest = this.getLatestFrame();
    if (!latest || !Number.isFinite(windowMs)) return this.getFrames();
    return this.frames.filter((frame) => latest.timestampMs - frame.timestampMs <= windowMs);
  }

  snapshot({ includeFrames = true } = {}) {
    const firstFrame = this.frames[0] || null;
    const latestFrame = this.getLatestFrame();
    const durationMs = firstFrame && latestFrame
      ? latestFrame.timestampMs - firstFrame.timestampMs
      : 0;
    const snapshot = {
      type: SERIES_TYPE,
      landmarkModel: LANDMARK_MODEL,
      frameCount: this.frames.length,
      landmarkCount: MediaPipePoseNames.length,
      firstTimestampMs: firstFrame?.timestampMs || null,
      latestTimestampMs: latestFrame?.timestampMs || null,
      durationMs,
      frameRateFps: frameRateFromFrames(this.frames),
      latestFrame,
    };

    if (includeFrames) snapshot.frames = this.getFrames();
    return snapshot;
  }
}
