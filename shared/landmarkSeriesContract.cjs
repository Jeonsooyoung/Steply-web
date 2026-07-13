'use strict';

const stage2Config = require('./stage2Analysis.config.json');

const LANDMARK_SERIES_SCHEMA_VERSION = stage2Config.operational.landmarkSeries.schemaVersion;
const LANDMARK_SERIES_TARGET_FPS = stage2Config.operational.landmarkSeries.targetFps;
const LANDMARK_SERIES_MAXIMUM_SAMPLES = stage2Config.operational.landmarkSeries.maximumSamples;
const LANDMARK_COUNT = stage2Config.operational.landmarkSeries.landmarkCount;
const ASSESSMENT_TYPES = Object.freeze(['CHAIR_STAND_30S', 'FOUR_STAGE_BALANCE']);
const ATTEMPT_STATUSES = Object.freeze(['VALID', 'INVALID', 'TRACKING_FAILED', 'CANCELLED', 'FAILED']);

function fail(path, message) {
  const error = new Error(`${path} ${message}`);
  error.code = 'INVALID_LANDMARK_SERIES_CONTRACT';
  error.path = path;
  throw error;
}

function object(value, path, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  const actual = Object.keys(value);
  const unknown = actual.find((key) => !keys.includes(key));
  if (unknown) fail(`${path}.${unknown}`, 'is not allowed');
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(value, key)) fail(`${path}.${key}`, 'is required');
  return value;
}

function text(value, path) {
  if (typeof value !== 'string' || !value.trim()) fail(path, 'must be a non-empty string');
  return value;
}

function integer(value, path, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) fail(path, `must be an integer >= ${minimum}`);
  return value;
}

function finite(value, path, minimum = Number.NEGATIVE_INFINITY, maximum = Number.POSITIVE_INFINITY) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(path, `must be a finite number between ${minimum} and ${maximum}`);
  }
  return value;
}

function oneOf(value, allowed, path) {
  if (!allowed.includes(value)) fail(path, `must be one of ${allowed.join(', ')}`);
  return value;
}

function landmarks(value, path, normalized) {
  if (!Array.isArray(value) || value.length !== LANDMARK_COUNT) fail(path, `must contain exactly ${LANDMARK_COUNT} landmarks`);
  return value.map((item, index) => {
    const source = object(item, `${path}[${index}]`, ['index', 'x', 'y', 'z', 'visibility']);
    const landmarkIndex = integer(source.index, `${path}[${index}].index`);
    if (landmarkIndex !== index) fail(`${path}[${index}].index`, `must equal ordered index ${index}`);
    return {
      index: landmarkIndex,
      x: finite(source.x, `${path}[${index}].x`),
      y: finite(source.y, `${path}[${index}].y`),
      z: finite(source.z, `${path}[${index}].z`),
      visibility: finite(source.visibility, `${path}[${index}].visibility`, 0, 1),
    };
  });
}

function normalizeSample(value, path) {
  const source = object(value, path, ['sequence', 'timestampMs', 'normalizedLandmarks', 'worldLandmarks']);
  return {
    sequence: integer(source.sequence, `${path}.sequence`),
    timestampMs: finite(source.timestampMs, `${path}.timestampMs`, 0),
    normalizedLandmarks: landmarks(source.normalizedLandmarks, `${path}.normalizedLandmarks`, true),
    worldLandmarks: landmarks(source.worldLandmarks, `${path}.worldLandmarks`, false),
  };
}

function normalizeLandmarkSeries(value, path = 'series') {
  const source = object(value, path, [
    'schemaVersion', 'seriesId', 'profileId', 'assessmentSessionId', 'attemptId', 'analysisSessionId',
    'resultId', 'assessmentType', 'status', 'targetFps', 'startedAt', 'completedAt', 'samples',
  ]);
  if (!Array.isArray(source.samples) || source.samples.length > LANDMARK_SERIES_MAXIMUM_SAMPLES) {
    fail(`${path}.samples`, `must contain at most ${LANDMARK_SERIES_MAXIMUM_SAMPLES} samples`);
  }
  const samples = source.samples.map((sample, index) => normalizeSample(sample, `${path}.samples[${index}]`));
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index].sequence <= samples[index - 1].sequence) fail(`${path}.samples`, 'sequence must increase');
    if (samples[index].timestampMs <= samples[index - 1].timestampMs) fail(`${path}.samples`, 'timestampMs must increase');
  }
  const startedAt = integer(source.startedAt, `${path}.startedAt`);
  const completedAt = integer(source.completedAt, `${path}.completedAt`);
  if (completedAt < startedAt) fail(`${path}.completedAt`, 'must be >= startedAt');
  return {
    schemaVersion: oneOf(source.schemaVersion, [LANDMARK_SERIES_SCHEMA_VERSION], `${path}.schemaVersion`),
    seriesId: text(source.seriesId, `${path}.seriesId`),
    profileId: text(source.profileId, `${path}.profileId`),
    assessmentSessionId: text(source.assessmentSessionId, `${path}.assessmentSessionId`),
    attemptId: text(source.attemptId, `${path}.attemptId`),
    analysisSessionId: text(source.analysisSessionId, `${path}.analysisSessionId`),
    resultId: text(source.resultId, `${path}.resultId`),
    assessmentType: oneOf(source.assessmentType, ASSESSMENT_TYPES, `${path}.assessmentType`),
    status: oneOf(source.status, ATTEMPT_STATUSES, `${path}.status`),
    targetFps: oneOf(source.targetFps, [LANDMARK_SERIES_TARGET_FPS], `${path}.targetFps`),
    startedAt,
    completedAt,
    samples,
  };
}

function normalizeLandmarkSeriesFinalized(value, path = 'message') {
  const source = object(value, path, [
    'type', 'schemaVersion', 'messageId', 'profileId', 'assessmentSessionId', 'attemptId', 'resultId', 'series',
  ]);
  const series = normalizeLandmarkSeries(source.series, `${path}.series`);
  const normalized = {
    type: oneOf(source.type, ['landmark-series.finalized'], `${path}.type`),
    schemaVersion: oneOf(source.schemaVersion, [LANDMARK_SERIES_SCHEMA_VERSION], `${path}.schemaVersion`),
    messageId: text(source.messageId, `${path}.messageId`),
    profileId: text(source.profileId, `${path}.profileId`),
    assessmentSessionId: text(source.assessmentSessionId, `${path}.assessmentSessionId`),
    attemptId: text(source.attemptId, `${path}.attemptId`),
    resultId: text(source.resultId, `${path}.resultId`),
    series,
  };
  for (const key of ['profileId', 'assessmentSessionId', 'attemptId', 'resultId']) {
    if (normalized[key] !== series[key]) fail(`${path}.series.${key}`, `must match envelope ${key}`);
  }
  return normalized;
}

function normalizeLandmarkSeriesAck(value, path = 'ack') {
  const source = object(value, path, [
    'type', 'schemaVersion', 'messageId', 'profileId', 'assessmentSessionId', 'attemptId', 'seriesId', 'storedAt',
  ]);
  return {
    type: oneOf(source.type, ['landmark-series.ack'], `${path}.type`),
    schemaVersion: oneOf(source.schemaVersion, [LANDMARK_SERIES_SCHEMA_VERSION], `${path}.schemaVersion`),
    messageId: text(source.messageId, `${path}.messageId`),
    profileId: text(source.profileId, `${path}.profileId`),
    assessmentSessionId: text(source.assessmentSessionId, `${path}.assessmentSessionId`),
    attemptId: text(source.attemptId, `${path}.attemptId`),
    seriesId: text(source.seriesId, `${path}.seriesId`),
    storedAt: integer(source.storedAt, `${path}.storedAt`),
  };
}

module.exports = {
  LANDMARK_SERIES_SCHEMA_VERSION,
  LANDMARK_SERIES_TARGET_FPS,
  LANDMARK_SERIES_MAXIMUM_SAMPLES,
  LANDMARK_COUNT,
  normalizeLandmarkSeries,
  normalizeLandmarkSeriesFinalized,
  normalizeLandmarkSeriesAck,
};
