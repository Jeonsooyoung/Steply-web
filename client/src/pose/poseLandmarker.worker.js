import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { MediaPipePoseNames } from './poseLandmarks';
import { createMovementAnalyzer } from './movementAnalyzers';
import { PoseLandmarkSeries, normalizePoseLandmarks } from './poseTimeSeries';
import { createPoseSmootherForTest } from './poseSmoother';
import {
  evaluateCameraReadiness,
  evaluateFrameQuality,
} from './trackingQuality';
import {
  AssessmentResultTypes,
  AssessmentStatuses,
  ResultSources,
  assessmentTypeForTestType,
  withAssessmentMetadata,
} from './assessmentResultMetadata';
import { poseFrameFromWorkerDetection } from '../pipeline/pose/poseFrameAdapter.js';
import { createPoseFrameProcessor } from '../pipeline/pose/frameProcessor.js';
import {
  evaluateFrameQuality as evaluateStructuredFrameQuality,
  legacyQualityDecisionToQualityStatus,
} from '../pipeline/quality/qualityStatusAdapter.js';
import { evaluatePoseFrameQuality } from '../pipeline/quality/frameQualityMetrics.js';
import { createQualityStateMachine } from '../pipeline/quality/qualityStateMachine.js';
import {
  bodyProgressFromCalibration,
  createPersonalCalibrationState,
  rebindValidPersonalCalibrationState,
  updatePersonalCalibration,
} from '../pipeline/calibration/personalCalibration.js';
import {
  AssessmentEventTypes as StructuredAssessmentEventTypes,
  QualityStates as StructuredQualityStates,
  assessmentTypeFromLegacyTestType,
} from '../pipeline/shared/types/index.js';
import {
  validateAssessmentResult,
  validateFinalAssessmentResponse,
  validateFrameAnalysisResult,
} from '../pipeline/shared/validation/runtimeValidation.js';
import { createAssessmentEvent } from '../pipeline/assessment/events.js';
import { poseConfig } from '../pipeline/shared/config/pose.config.js';
import { stage2Operational } from '../pipeline/shared/config/stage2Analysis.config.js';
import {
  AssessmentTestTypes,
  assertSupportedAssessmentTestType,
} from '../pipeline/shared/assessmentTestTypes.js';
import wasmModuleLoaderUrl from '../vendor/mediapipe/wasm/vision_wasm_module_internal.js?url';
import wasmModuleBinaryUrl from '../vendor/mediapipe/wasm/vision_wasm_module_internal.wasm?url';

const DEFAULT_MODEL_PATH = '/models/pose_landmarker_lite.task';
const MODEL_PATHS_BY_QUALITY = {
  accurate: ['/models/pose_landmarker_heavy.task', '/models/pose_landmarker_full.task', DEFAULT_MODEL_PATH],
  balanced: ['/models/pose_landmarker_full.task', DEFAULT_MODEL_PATH],
  fast: [DEFAULT_MODEL_PATH],
};
const DEFAULT_WASM_PATH = '/wasm';
const MIN_FRAME_INTERVAL_MS = stage2Operational.signal.frameIntervalMs;
const MAX_INPUT_FRAME_AGE_MS = stage2Operational.signal.maxInputFrameAgeMs;
const BRIGHTNESS_SAMPLE_INTERVAL_MS = stage2Operational.calibration.brightnessSampleIntervalMs;
const BRIGHTNESS_CALIBRATION_TARGET = stage2Operational.calibration.brightnessTargetNormalized;
const BRIGHTNESS_CALIBRATION_MIN_SAMPLES = stage2Operational.calibration.brightnessMinimumSamples;
const BRIGHTNESS_CALIBRATION_SAMPLE_LIMIT = stage2Operational.calibration.brightnessSampleLimit;
const BRIGHTNESS_CALIBRATION_MAX_CORRECTION = stage2Operational.calibration.brightnessMaximumCorrection;
const BRIGHTNESS_CORRECTION_HARD_LOW = stage2Operational.calibration.brightnessHardLowNormalized;
const BRIGHTNESS_CORRECTION_HARD_HIGH = stage2Operational.calibration.brightnessHardHighNormalized;
const PREVIEW_QUALITY_INTERVAL_MS = stage2Operational.signal.previewQualityIntervalMs;
const ANALYSIS_QUALITY_INTERVAL_MS = stage2Operational.signal.analysisQualityIntervalMs;
const CHAIR_STAND_MOVEMENT_INTERVAL_MS = MIN_FRAME_INTERVAL_MS;
const MIN_POSE_CONFIDENCE = stage2Operational.signal.minimumPoseConfidence;
const PROCESSING_TELEMETRY_SAMPLE_LIMIT = stage2Operational.signal.processingTelemetrySampleLimit;
const PROCESSING_TELEMETRY_REPORT_INTERVAL = stage2Operational.signal.processingTelemetryReportInterval;

let landmarker = null;
let selectedTest = AssessmentTestTypes.ChairStand;
let analyzer = createMovementAnalyzer(selectedTest);
let steadiLandmarkSeries = new PoseLandmarkSeries();
let poseSmoother = createPoseSmootherForTest(selectedTest);
let worldPoseSmoother = createPoseSmootherForTest(selectedTest);
let initialized = false;
let initializing = null;
let session = null;
let latestFrameAt = 0;
let latestAnalyzeAt = 0;
let latestMediaPipeTimestampMs = 0;
let frameSequence = 0;
let isAnalyzingFrame = false;
let processedFrameWallTimes = [];
let inferenceDurationsMs = [];
let latestQualitySample = null;
let sessionQuality = null;
let latestBrightnessSample = null;
let latestBrightnessSampleAt = 0;
let brightnessCalibrationSamples = [];
let brightnessCalibration = null;
let latestPreviewQualityAt = 0;
let latestAnalysisQualityAt = 0;
let latestMovementAnalysisAt = 0;
let latestAnalysisQualityPayload = null;
let brightnessCanvas = null;
let brightnessContext = null;
let pendingPreviewFrame = null;
let pendingAnalysisFrame = null;
let framePumpScheduled = false;
let seenFrameIds = new Set();
let frameQueueStats = null;
let structuredFrameProcessor = createPoseFrameProcessor({
  config: poseConfig.processing,
  maxInputFrameAgeMs: MAX_INPUT_FRAME_AGE_MS,
  minFrameIntervalMs: MIN_FRAME_INTERVAL_MS,
});
let structuredQualityStateMachine = createQualityStateMachine();
let structuredCalibrationState = null;
const armUseOccurrencesByAssessmentSession = new Map();

function normalizeBasePath(path) {
  return String(path || '').replace(/\/$/, '');
}

function debug(event, details = {}) {
  postMessage({
    type: 'debug',
    sessionId: session?.id || null,
    event,
    details,
    at: Date.now(),
  });
}

function monotonicNowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return Math.round((performance.timeOrigin || 0) + performance.now());
  }
  return Date.now();
}

function structuredAssessmentType() {
  return assessmentTypeFromLegacyTestType(selectedTest);
}

function resetStructuredSessionState({
  sessionId = null,
  startedAt = null,
  preserveValidCalibration = false,
} = {}) {
  structuredFrameProcessor.reset({ sessionId });
  structuredQualityStateMachine.reset({ startedAt });
  const assessmentType = structuredAssessmentType();
  const preservedCalibration = preserveValidCalibration
    ? rebindValidPersonalCalibrationState(structuredCalibrationState, {
      sessionId,
      assessmentType,
    })
    : null;
  structuredCalibrationState = preservedCalibration || createPersonalCalibrationState({
    sessionId: sessionId || 'preview',
    assessmentType,
    createdAtMs: startedAt || Date.now(),
  });
}

function resetFrameQueueStats() {
  seenFrameIds = new Set();
  frameQueueStats = {
    receivedFrameCount: 0,
    processedFrameCount: 0,
    droppedFrameCount: 0,
    duplicateFrameCount: 0,
    staleSessionFrameCount: 0,
    totalProcessingLatencyMs: 0,
  };
  structuredFrameProcessor.reset({ sessionId: session?.id || null });
}

function frameQueueTelemetry() {
  const processed = frameQueueStats?.processedFrameCount || 0;
  const structuredQueue = structuredFrameProcessor.snapshot();
  return {
    receivedFrameCount: frameQueueStats?.receivedFrameCount || 0,
    processedFrameCount: processed,
    droppedFrameCount: frameQueueStats?.droppedFrameCount || 0,
    duplicateFrameCount: frameQueueStats?.duplicateFrameCount || 0,
    staleSessionFrameCount: frameQueueStats?.staleSessionFrameCount || 0,
    averageProcessingLatency: processed
      ? frameQueueStats.totalProcessingLatencyMs / processed
      : null,
    structuredQueue,
  };
}

function noteFrameProcessed(detected, analyzedAt = Date.now()) {
  if (!frameQueueStats) resetFrameQueueStats();
  frameQueueStats.processedFrameCount += 1;
  frameQueueStats.totalProcessingLatencyMs += Math.max(0, analyzedAt - (detected?.inputReceivedAt || analyzedAt));
  structuredFrameProcessor.markProcessed({
    receivedAtMs: detected?.inputReceivedAt,
    completedAtMs: analyzedAt,
  });
}

function frameIdFromMessage(message = {}) {
  return String(
    message.frameId
      || message.cameraFrameSequence
      || message.sequence
      || message.mobileSequence
      || message.receivedAt
      || '',
  );
}

function isAnalysisFrameMessage(message = {}) {
  return message.type === 'frame' || message.type === 'PROCESS_FRAME';
}

function isPreviewFrameMessage(message = {}) {
  return message.type === 'preview-frame' || message.type === 'PROCESS_PREVIEW_FRAME';
}

function messageSessionId(message = {}) {
  return message.sessionId || message.analysisSessionId || null;
}

function isMessageForActiveSession(message = {}) {
  if (!session?.active) return true;
  const incomingSessionId = messageSessionId(message);
  return Boolean(incomingSessionId && incomingSessionId === session.id);
}

function defaultWasmPath() {
  return DEFAULT_WASM_PATH;
}

function modelQuality(config = {}) {
  const requested = String(config.modelQuality || config.quality || 'balanced').toLowerCase();
  return MODEL_PATHS_BY_QUALITY[requested] ? requested : 'balanced';
}

function modelAssetCandidates(config = {}) {
  if (config.modelAssetPath) return [config.modelAssetPath];
  return MODEL_PATHS_BY_QUALITY[modelQuality(config)] || MODEL_PATHS_BY_QUALITY.balanced;
}

async function probeAsset(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    return {
      url,
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length'),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      error: error.message || 'fetch failed',
    };
  }
}

async function probeWasmBasePath(basePath) {
  const normalized = normalizeBasePath(basePath);
  const [moduleLoader, moduleWasm, classicLoader, classicWasm] = await Promise.all([
    probeAsset(`${normalized}/vision_wasm_module_internal.js`),
    probeAsset(`${normalized}/vision_wasm_module_internal.wasm`),
    probeAsset(`${normalized}/vision_wasm_internal.js`),
    probeAsset(`${normalized}/vision_wasm_internal.wasm`),
  ]);

  debug('wasm-assets-probed', {
    basePath: normalized,
    moduleLoader,
    moduleWasm,
    classicLoader,
    classicWasm,
  });
}

async function resolveVisionFileset(config = {}) {
  const basePath = normalizeBasePath(config.wasmPath || defaultWasmPath());
  const useBundledWasm = !config.wasmPath;
  debug('fileset-resolve-start', {
    workerLocation: self.location.href,
    basePath,
    useBundledWasm,
    useModule: true,
  });
  if (!useBundledWasm) await probeWasmBasePath(basePath);
  const fileset = useBundledWasm
    ? {
        wasmLoaderPath: wasmModuleLoaderUrl,
        wasmBinaryPath: wasmModuleBinaryUrl,
      }
    : await FilesetResolver.forVisionTasks(basePath, true);
  debug('fileset-resolve-complete', {
    wasmLoaderPath: fileset.wasmLoaderPath,
    wasmBinaryPath: fileset.wasmBinaryPath,
    assetLoaderPath: fileset.assetLoaderPath || null,
    assetBinaryPath: fileset.assetBinaryPath || null,
  });
  const module = await import(/* @vite-ignore */ fileset.wasmLoaderPath.toString());
  self.ModuleFactory = module.default || globalThis.ModuleFactory;
  debug('module-factory-loaded', {
    loaderPath: fileset.wasmLoaderPath,
    hasDefaultExport: typeof module.default === 'function',
    hasSelfModuleFactory: typeof self.ModuleFactory === 'function',
    hasGlobalModuleFactory: typeof globalThis.ModuleFactory === 'function',
  });
  return {
    ...fileset,
    // tasks-vision checks self.ModuleFactory even when no loader path is given.
    // We pre-load the ES module above to avoid Vite/public script loading issues.
    wasmLoaderPath: '',
  };
}

async function usableModelCandidates(config = {}) {
  const candidates = modelAssetCandidates(config);
  const probed = [];
  for (const modelAssetPath of candidates) {
    const probe = await probeAsset(modelAssetPath);
    probed.push(probe);
  }
  debug('pose-model-assets-probed', {
    requestedQuality: modelQuality(config),
    candidates: probed,
  });
  const available = probed
    .filter((probe) => probe.ok && !String(probe.contentType || '').includes('text/html'))
    .map((probe) => probe.url);
  return [...new Set([...available, ...candidates])];
}

async function initLandmarker(config = {}) {
  if (initialized && landmarker) return;
  if (initializing) return initializing;

  initializing = (async () => {
    const preferredDelegates = config.delegate
      ? [config.delegate]
      : ['GPU', 'CPU'];
    const modelCandidates = await usableModelCandidates(config);
    debug('landmarker-init-start', {
      requestedQuality: modelQuality(config),
      modelCandidates,
      delegates: preferredDelegates,
      thresholds: {
        minPoseDetectionConfidence: config.minPoseDetectionConfidence || MIN_POSE_CONFIDENCE,
        minPosePresenceConfidence: config.minPosePresenceConfidence || MIN_POSE_CONFIDENCE,
        minTrackingConfidence: config.minTrackingConfidence || MIN_POSE_CONFIDENCE,
      },
    });
    const vision = await resolveVisionFileset(config);
    let lastError = null;
    for (const modelAssetPath of modelCandidates) {
      for (const delegate of preferredDelegates) {
        try {
          debug('landmarker-delegate-attempt', { delegate, modelAssetPath });
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath,
              delegate,
            },
            runningMode: 'VIDEO',
            numPoses: stage2Operational.multiPerson.maximumPoses,
            minPoseDetectionConfidence: config.minPoseDetectionConfidence || MIN_POSE_CONFIDENCE,
            minPosePresenceConfidence: config.minPosePresenceConfidence || MIN_POSE_CONFIDENCE,
            minTrackingConfidence: config.minTrackingConfidence || MIN_POSE_CONFIDENCE,
          });
          debug('landmarker-delegate-ready', { delegate, modelAssetPath, runningMode: 'VIDEO' });
          break;
        } catch (error) {
          lastError = error;
          debug('landmarker-delegate-failed', {
            delegate,
            modelAssetPath,
            message: error.message || 'Delegate initialization failed.',
            stack: error.stack || null,
          });
        }
      }
      if (landmarker) break;
    }

    if (!landmarker) throw lastError || new Error('PoseLandmarker initialization failed.');
    initialized = true;
    debug('landmarker-init-complete');
    postMessage({ type: 'ready', at: Date.now() });
  })();

  try {
    await initializing;
  } catch (error) {
    debug('landmarker-init-failed', {
      message: error.message || 'PoseLandmarker initialization failed.',
      stack: error.stack || null,
    });
    throw error;
  } finally {
    initializing = null;
  }
}

function closeLandmarker() {
  try {
    landmarker?.close?.();
  } catch (_) {
    // Ignore close failures; the next init creates a fresh MediaPipe graph.
  }
  landmarker = null;
  initialized = false;
  initializing = null;
}

function nextMediaPipeTimestampMs(candidateTimestampMs) {
  const candidate = Number.isFinite(candidateTimestampMs) ? candidateTimestampMs : monotonicNowMs();
  latestMediaPipeTimestampMs = structuredFrameProcessor.nextMediaPipeTimestamp(candidate);
  return latestMediaPipeTimestampMs;
}

function normalizeLandmarks(rawLandmarks = []) {
  return normalizePoseLandmarks(rawLandmarks.map((landmark, index) => ({
    name: MediaPipePoseNames[index] || `landmark_${index}`,
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    visibility: Number.isFinite(landmark.visibility) ? landmark.visibility : 0,
  })));
}

function resetProcessingTelemetry() {
  processedFrameWallTimes = [];
  inferenceDurationsMs = [];
}

function resetBrightnessSampling() {
  latestBrightnessSample = null;
  latestBrightnessSampleAt = 0;
}

function resetPipelineCadence() {
  latestPreviewQualityAt = 0;
  latestAnalysisQualityAt = 0;
  latestMovementAnalysisAt = 0;
}

function resetCachedAnalysisQuality() {
  latestAnalysisQualityPayload = null;
}

function shouldRunPreviewQualityPipeline(now = Date.now()) {
  if (!latestPreviewQualityAt || now - latestPreviewQualityAt >= PREVIEW_QUALITY_INTERVAL_MS) {
    latestPreviewQualityAt = now;
    return true;
  }
  return false;
}

function shouldRunAnalysisQualityPipeline(now = Date.now()) {
  if (frameSequence === 0 || !latestAnalysisQualityAt || now - latestAnalysisQualityAt >= ANALYSIS_QUALITY_INTERVAL_MS) {
    latestAnalysisQualityAt = now;
    return true;
  }
  return false;
}

function movementAnalysisIntervalMs() {
  return selectedTest === 'chair_stand'
    ? CHAIR_STAND_MOVEMENT_INTERVAL_MS
    : ANALYSIS_QUALITY_INTERVAL_MS;
}

function usesFastRawAnalysis() {
  return false;
}

function shouldRunMovementAnalysisPipeline(now = Date.now()) {
  if (frameSequence === 0 || !latestMovementAnalysisAt || now - latestMovementAnalysisAt >= movementAnalysisIntervalMs()) {
    latestMovementAnalysisAt = now;
    return true;
  }
  return false;
}

function average(values = []) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function finiteNumber(value) {
  return Number.isFinite(Number(value));
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clampValue(value, 0, 1);
}

function lightingLevelForBrightness(brightness) {
  if (!finiteNumber(brightness)) return 'unknown';
  if (brightness < stage2Operational.quality.lightingTooDarkMax) return 'too_dark';
  if (brightness < stage2Operational.quality.lightingDimMax) return 'dim';
  if (brightness > stage2Operational.quality.lightingTooBrightMin) return 'too_bright';
  if (brightness > stage2Operational.quality.lightingBrightMin) return 'bright';
  return 'ok';
}

function buildBrightnessCalibration(updatedAt = Date.now()) {
  const averageBrightness = average(brightnessCalibrationSamples);
  if (!finiteNumber(averageBrightness)) return null;
  const sampleCount = brightnessCalibrationSamples.length;
  const correctionReady = sampleCount >= BRIGHTNESS_CALIBRATION_MIN_SAMPLES;
  const correction = correctionReady
    ? clampValue(
      BRIGHTNESS_CALIBRATION_TARGET - averageBrightness,
      -BRIGHTNESS_CALIBRATION_MAX_CORRECTION,
      BRIGHTNESS_CALIBRATION_MAX_CORRECTION,
    )
    : 0;

  return {
    sampleCount,
    correctionReady,
    averageBrightness,
    targetBrightness: BRIGHTNESS_CALIBRATION_TARGET,
    correction,
    calibratedAverageBrightness: clamp01(averageBrightness + correction),
    lightingLevel: lightingLevelForBrightness(averageBrightness),
    lightingOk: averageBrightness >= 0.16 && averageBrightness <= 0.92,
    updatedAt,
  };
}

function recordBrightnessCalibrationSample(brightness, sampledAt = Date.now()) {
  if (!finiteNumber(brightness)) return brightnessCalibration;
  brightnessCalibrationSamples.push(brightness);
  while (brightnessCalibrationSamples.length > BRIGHTNESS_CALIBRATION_SAMPLE_LIMIT) {
    brightnessCalibrationSamples.shift();
  }
  brightnessCalibration = buildBrightnessCalibration(sampledAt);
  return brightnessCalibration;
}

function resetBrightnessCalibration() {
  brightnessCalibrationSamples = [];
  brightnessCalibration = null;
}

function brightnessQualityContext(sample, { updateCalibration = false } = {}) {
  const rawBrightness = finiteNumber(sample?.value) ? Number(sample.value) : null;
  const sampledAt = sample?.sampledAt || Date.now();
  const calibration = updateCalibration && sample?.fresh
    ? recordBrightnessCalibrationSample(rawBrightness, sampledAt)
    : brightnessCalibration;
  const canApplyCorrection = (
    finiteNumber(rawBrightness)
    && calibration?.correctionReady
    && rawBrightness >= BRIGHTNESS_CORRECTION_HARD_LOW
    && rawBrightness <= BRIGHTNESS_CORRECTION_HARD_HIGH
  );
  const appliedCorrection = canApplyCorrection ? calibration.correction : 0;
  const correctedBrightness = finiteNumber(rawBrightness)
    ? clamp01(rawBrightness + appliedCorrection)
    : rawBrightness;

  return {
    brightnessForQuality: correctedBrightness,
    brightness: {
      raw: rawBrightness,
      corrected: correctedBrightness,
      correction: appliedCorrection,
      correctionApplied: Boolean(canApplyCorrection && Math.abs(appliedCorrection) > 0.001),
      sampledAt,
      calibrationSampleCount: calibration?.sampleCount || 0,
    },
    brightnessCalibration: calibration,
  };
}

function recordProcessingTelemetry({ analyzedAt, inferenceDurationMs }) {
  processedFrameWallTimes.push(analyzedAt);
  inferenceDurationsMs.push(inferenceDurationMs);
  while (processedFrameWallTimes.length > PROCESSING_TELEMETRY_SAMPLE_LIMIT) processedFrameWallTimes.shift();
  while (inferenceDurationsMs.length > PROCESSING_TELEMETRY_SAMPLE_LIMIT) inferenceDurationsMs.shift();

  const firstWallTime = processedFrameWallTimes[0];
  const latestWallTime = processedFrameWallTimes.at(-1);
  const observedDurationMs = latestWallTime - firstWallTime;
  const processedFps = observedDurationMs > 0
    ? (processedFrameWallTimes.length - 1) * 1000 / observedDurationMs
    : null;
  const telemetry = {
    processedFrameCount: processedFrameWallTimes.length,
    processedFps,
    averageInferenceMs: average(inferenceDurationsMs),
    latestInferenceMs: inferenceDurationMs,
    minFrameIntervalMs: MIN_FRAME_INTERVAL_MS,
    configuredMaxFps: 1000 / MIN_FRAME_INTERVAL_MS,
  };

  if (frameSequence > 0 && frameSequence % PROCESSING_TELEMETRY_REPORT_INTERVAL === 0) {
    debug('pose-processing-rate', telemetry);
  }

  return telemetry;
}

function setSelectedTest(nextSelectedTest) {
  const next = assertSupportedAssessmentTestType(nextSelectedTest || selectedTest);
  if (next === selectedTest) return;
  selectedTest = next;
  poseSmoother = createPoseSmootherForTest(selectedTest);
  worldPoseSmoother = createPoseSmootherForTest(selectedTest);
  latestQualitySample = null;
  resetCachedAnalysisQuality();
  resetBrightnessSampling();
  resetBrightnessCalibration();
  resetPipelineCadence();
  resetStructuredSessionState({ sessionId: session?.id || 'preview', startedAt: Date.now() });
}

function inputReceivedAt(message, fallback = Date.now()) {
  const receivedAt = Number(message?.receivedAt);
  return Number.isFinite(receivedAt) ? receivedAt : fallback;
}

function frameAgeMs(receivedAt, now = Date.now()) {
  const timestamp = Number(receivedAt);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, now - timestamp);
}

function isStaleFrameMessage(message, now = Date.now()) {
  return frameAgeMs(inputReceivedAt(message, now), now) > MAX_INPUT_FRAME_AGE_MS;
}

function isStaleDetectedFrame(detected, now = Date.now()) {
  return frameAgeMs(detected?.inputReceivedAt, now) > MAX_INPUT_FRAME_AGE_MS;
}

function postFrameSkipped({ message, detected, source, reason, now = Date.now() }) {
  const receivedAt = detected?.inputReceivedAt ?? inputReceivedAt(message, now);
  if (!frameQueueStats) resetFrameQueueStats();
  frameQueueStats.droppedFrameCount += 1;
  postMessage({
    type: 'frame-skipped',
    sessionId: messageSessionId(message) || session?.id || null,
    frameId: frameIdFromMessage(message),
    source,
    reason,
    receivedAt,
    ageMs: frameAgeMs(receivedAt, now),
    maxFrameAgeMs: MAX_INPUT_FRAME_AGE_MS,
    frameQueue: frameQueueTelemetry(),
    at: now,
  });
}

function resetSessionQuality() {
  sessionQuality = {
    sampleCount: 0,
    acceptedFrameCount: 0,
    lowQualityFrameCount: 0,
    cautionFrameCount: 0,
    totalTrackingQualityScore: 0,
    currentLowQualityStreak: 0,
    longestLowQualityStreak: 0,
    latestReadiness: null,
  };
}

function recordSessionQuality(readiness, accepted) {
  if (!sessionQuality) resetSessionQuality();
  const trackingQualityScore = readiness?.trackingQualityScore ?? readiness?.trackingQuality?.trackingQualityScore ?? 0;
  sessionQuality.sampleCount += 1;
  sessionQuality.totalTrackingQualityScore += trackingQualityScore;
  if (accepted) {
    sessionQuality.acceptedFrameCount += 1;
    sessionQuality.currentLowQualityStreak = 0;
  } else {
    sessionQuality.lowQualityFrameCount += 1;
    sessionQuality.currentLowQualityStreak += 1;
    sessionQuality.longestLowQualityStreak = Math.max(
      sessionQuality.longestLowQualityStreak,
      sessionQuality.currentLowQualityStreak,
    );
  }
  if (readiness?.trackingQuality?.level === 'caution') sessionQuality.cautionFrameCount += 1;
  sessionQuality.latestReadiness = readiness;
}

function sessionTrackingQualitySummary() {
  const structuredQuality = structuredQualityStateMachine.snapshot(Date.now());
  if (!sessionQuality?.sampleCount) {
    return {
      sampleCount: 0,
      acceptedFrameCount: 0,
      lowQualityFrameCount: 0,
      cautionFrameCount: 0,
      lowQualityRatio: 1,
      trackingQualityScore: 0,
      longestLowQualityStreak: 0,
      gates: structuredQuality.gates || [],
      g3ViolationRatio: structuredQuality.g3ViolationRatio || 0,
    };
  }
  return {
    sampleCount: sessionQuality.sampleCount,
    acceptedFrameCount: sessionQuality.acceptedFrameCount,
    lowQualityFrameCount: sessionQuality.lowQualityFrameCount,
    cautionFrameCount: sessionQuality.cautionFrameCount,
    lowQualityRatio: sessionQuality.lowQualityFrameCount / sessionQuality.sampleCount,
    trackingQualityScore: sessionQuality.totalTrackingQualityScore / sessionQuality.sampleCount,
    longestLowQualityStreak: sessionQuality.longestLowQualityStreak,
    gates: structuredQuality.gates || [],
    g3ViolationRatio: structuredQuality.g3ViolationRatio || 0,
  };
}

function shouldBlockFrame(readiness) {
  return evaluateFrameQuality({ readiness }).legacy.generalBlocked;
}

function shouldBlockMovementFrame(readiness) {
  return evaluateFrameQuality({ readiness }).legacy.movementBlocked;
}

function shouldInvalidateSession(summary) {
  return (summary.g3ViolationRatio || 0) > stage2Operational.quality.invalidViolationRatioExclusive;
}

function invalidTrackingResult(completedAt, summary, reason = 'camera_tracking_quality') {
  return {
    testType: selectedTest,
    invalid: true,
    invalidReason: reason,
    primaryValue: null,
    primaryLabel: 'Camera Check',
    repetitionCount: 0,
    durationSeconds: analyzer.getCurrentState(completedAt)?.durationSeconds || 30,
    confidence: summary.trackingQualityScore,
    trackingQualityScore: summary.trackingQualityScore,
    trackingQualitySummary: summary,
    recommendationLevel: 'recheck',
    clinicalResultAvailable: false,
    testFlags: {
      cameraSetupNeeded: true,
      clinicalResultAvailable: false,
      trackingQualityTooLow: true,
      invalidReason: reason,
    },
    summaryMessage: "Let's adjust the camera and try again.",
    seniorMessage: "Let's adjust the camera and try again.",
    staffMessage: `Tracking quality was ${Math.round((summary.trackingQualityScore || 0) * 100)}%; no screening result was generated.`,
    professionalNotes: 'Pose tracking quality was below the assessment threshold. No fall-risk classification or weakness result should be used from this session.',
    startedAt: session?.startedAt || null,
    completedAt,
  };
}

function shouldFinishSessionFromState(state) {
  return Boolean(
    (state.elapsedSeconds || 0) >= (state.durationSeconds || 30)
      || state.balanceProtocol?.shouldFinishSession
      || state.armUseRestartRequired
      || state.armUseCdcZero
  );
}

function stateForCameraIssue(timestampMs, readiness) {
  const current = analyzer.getCurrentState(timestampMs);
  return {
    ...current,
    confidence: readiness?.trackingQualityScore ?? 0,
    trackingQualityScore: readiness?.trackingQualityScore ?? 0,
    trackingQuality: readiness?.trackingQuality || null,
    cameraReadiness: readiness,
    isFullBodyVisible: Boolean(readiness?.fullBodyVisible),
    warningMessage: readiness?.message || "Let's adjust the camera and try again.",
    postureMessage: 'Tracking is paused until the full body and both feet are clear.',
    phase: 'camera_check',
    trackingPaused: true,
  };
}

function calibrationMessage(calibrationStatus = {}) {
  const reasons = calibrationStatus.progress?.failureReasons || [];
  const codes = reasons.map((reason) => reason.code);
  if (codes.includes('FOOT_PLACEMENT_NOT_OBSERVABLE')) {
    return 'Turn slightly so the camera can see your foot placement.';
  }
  if (codes.includes('FOOT_LANDMARK_CONFIDENCE_LOW') || codes.includes('BALANCE_FOOT_BASELINE_NOT_STABLE')) {
    return 'Make sure both feet are clearly visible.';
  }
  if (codes.includes('SITTING_REFERENCE_NOT_STABLE')) {
    return 'Sit fully on the chair and hold still while we set up the camera.';
  }
  if (codes.includes('FOLDED_ARM_REFERENCE_NOT_READY')) {
    return 'Fold your arms across your chest and hold still.';
  }
  return 'Hold still while we set up the camera.';
}

function stateForCalibrationIssue(timestampMs, structuredPayload = {}) {
  const current = analyzer.getCurrentState(timestampMs);
  const message = calibrationMessage(structuredPayload.calibrationStatus);
  return {
    ...current,
    confidence: structuredPayload.poseFrame?.confidence?.overall ?? current.confidence ?? 0,
    trackingQualityScore: structuredPayload.qualityStatus?.scores?.overall ?? current.trackingQualityScore ?? 0,
    qualityStatus: structuredPayload.qualityStatus || null,
    calibrationProfile: structuredPayload.calibrationProfile || null,
    calibrationStatus: structuredPayload.calibrationStatus || null,
    normalizedBodyProgress: structuredPayload.normalizedBodyProgress || null,
    warningMessage: message,
    postureMessage: message,
    phase: 'calibration',
    calibrationReady: false,
    trackingPaused: true,
  };
}

function structuredQualityBlocksAnalysis(qualityStatus) {
  return [
    StructuredQualityStates.NotReady,
    StructuredQualityStates.Paused,
    StructuredQualityStates.Invalid,
  ].includes(qualityStatus?.state);
}

function buildCachedAnalysisQualityPayload({ smoothed, detected }) {
  const cached = latestAnalysisQualityPayload || {};
  return {
    ...smoothed,
    cameraReadiness: cached.cameraReadiness || null,
    trackingQuality: cached.trackingQuality || null,
    trackingQualityScore: cached.trackingQualityScore ?? detected.confidence ?? 0,
    brightness: cached.brightness || null,
    brightnessCalibration: cached.brightnessCalibration || brightnessCalibration,
  };
}

function cacheAnalysisQualityPayload(qualityPayload, brightnessContext) {
  latestAnalysisQualityPayload = {
    cameraReadiness: qualityPayload.cameraReadiness,
    trackingQuality: qualityPayload.trackingQuality,
    trackingQualityScore: qualityPayload.trackingQualityScore,
    brightness: brightnessContext?.brightness || null,
    brightnessCalibration: brightnessContext?.brightnessCalibration || null,
    cachedAt: Date.now(),
  };
}

function buildPoseQualityPayload({
  detected,
  timestampMs,
  poseCount,
  brightness,
  brightnessStats = null,
  brightnessCalibration = null,
  smoothed = null,
}) {
  const smoothedPose = smoothed || poseSmoother.smooth(detected.landmarks, { timestampMs });
  const readiness = evaluateCameraReadiness({
    landmarks: smoothedPose.landmarks,
    testType: selectedTest,
    previousSample: latestQualitySample,
    poseCount,
    brightness,
    strictStability: true,
  });
  const trackingQuality = {
    ...readiness.trackingQuality,
    rawBrightness: brightnessStats?.raw ?? null,
    correctedBrightness: brightnessStats?.corrected ?? null,
    brightnessCorrection: brightnessStats?.correction ?? 0,
    brightnessCalibration,
  };
  const cameraReadiness = {
    ...readiness,
    trackingQuality,
    brightness: brightnessStats,
    brightnessCalibration,
  };
  latestQualitySample = readiness.sample;
  return {
    ...smoothedPose,
    cameraReadiness,
    trackingQuality,
    trackingQualityScore: readiness.trackingQualityScore,
  };
}

async function estimateFrameBrightness(bitmap) {
  if (typeof OffscreenCanvas === 'undefined') return null;
  try {
    const width = 24;
    const height = 24;
    if (!brightnessCanvas) {
      brightnessCanvas = new OffscreenCanvas(width, height);
      brightnessContext = brightnessCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (!brightnessContext) return null;
    brightnessContext.drawImage(bitmap, 0, 0, width, height);
    const { data } = brightnessContext.getImageData(0, 0, width, height);
    let luma = 0;
    for (let index = 0; index < data.length; index += 4) {
      luma += (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
    }
    return luma / (data.length / 4);
  } catch (_) {
    return null;
  }
}

async function sampledFrameBrightness(bitmap, now = Date.now()) {
  if (
    latestBrightnessSample !== null
    && now - latestBrightnessSampleAt < BRIGHTNESS_SAMPLE_INTERVAL_MS
  ) {
    return {
      value: latestBrightnessSample,
      sampledAt: latestBrightnessSampleAt,
      fresh: false,
    };
  }
  const brightness = await estimateFrameBrightness(bitmap);
  latestBrightnessSample = brightness;
  latestBrightnessSampleAt = now;
  return {
    value: brightness,
    sampledAt: now,
    fresh: true,
  };
}

async function imageBitmapFromFrame(frame) {
  const createBitmap = async (source) => {
    try {
      return await createImageBitmap(source, {
        imageOrientation: 'from-image',
        colorSpaceConversion: 'default',
      });
    } catch (_) {
      return createImageBitmap(source);
    }
  };

  if (typeof ImageBitmap !== 'undefined' && frame instanceof ImageBitmap) {
    return frame;
  }

  if (frame instanceof Blob) {
    return createBitmap(frame);
  }

  if (frame instanceof ArrayBuffer) {
    return createBitmap(new Blob([frame], { type: 'image/jpeg' }));
  }

  if (typeof frame === 'string') {
    const response = await fetch(frame);
    const blob = await response.blob();
    return createBitmap(blob);
  }

  throw new Error('Unsupported camera frame type.');
}

function closeQueuedFrameInput(message) {
  message?.frame?.close?.();
}

async function detectPoseFromFrame(message) {
  await initLandmarker(message.config || {});
  const receivedAt = inputReceivedAt(message);
  const bitmap = await imageBitmapFromFrame(message.frame);
  const timestampMs = nextMediaPipeTimestampMs(monotonicNowMs());
  const inferenceStartedAt = Date.now();
  const result = landmarker.detectForVideo(bitmap, timestampMs);
  const inferenceEndedAt = Date.now();
  const rawLandmarks = result.landmarks?.[0] || [];
  const landmarks = normalizeLandmarks(rawLandmarks);
  const rawWorldLandmarks = result.worldLandmarks?.[0] || result.poseWorldLandmarks?.[0] || [];
  const worldLandmarks = worldPoseSmoother.smooth(rawWorldLandmarks, { timestampMs }).landmarks;
  const visibilityValues = rawLandmarks
    .map((point) => point.visibility)
    .filter((value) => Number.isFinite(value));
  const confidence = visibilityValues.length
    ? visibilityValues.reduce((sum, value) => sum + value, 0) / visibilityValues.length
    : rawLandmarks.length ? 1 : 0;

  return {
    bitmap,
    sessionId: messageSessionId(message) || session?.id || 'preview',
    frameId: frameIdFromMessage(message) || `${receivedAt}`,
    timestampMs,
    inputReceivedAt: receivedAt,
    cameraFrameSequence: message.cameraFrameSequence ?? message.sequence ?? null,
    mobileSequence: message.mobileSequence ?? null,
    landmarks,
    rawWorldLandmarks,
    worldLandmarks,
    people: (result.landmarks || []).map((personLandmarks, index) => ({
      normalizedLandmarks: normalizeLandmarks(personLandmarks),
      worldLandmarks: result.worldLandmarks?.[index] || result.poseWorldLandmarks?.[index] || [],
    })),
    mirrored: Boolean(message.mirrored || message.cameraMirrored || message.config?.mirrored),
    poseCount: result.landmarks?.length || 0,
    confidence,
    inferenceDurationMs: inferenceEndedAt - inferenceStartedAt,
  };
}

function buildStructuredFramePayload({
  detected,
  bitmap,
  analyzedAt = Date.now(),
  landmarks = detected?.landmarks || [],
  readiness = null,
  qualityDecision = null,
  brightness = null,
} = {}) {
  const poseFrameResult = poseFrameFromWorkerDetection({
    detected,
    image: { width: bitmap?.width, height: bitmap?.height, mirrored: Boolean(detected?.mirrored) },
    normalizedLandmarks: landmarks,
    worldLandmarks: detected?.worldLandmarks || null,
    secondaryPeople: (detected?.people || []).slice(1),
    completedAtMs: analyzedAt,
    mirrored: Boolean(detected?.mirrored),
  });
  const poseFrame = poseFrameResult.validation.ok ? poseFrameResult.value : null;
  if (!poseFrame) {
    debug('STRUCTURED_POSE_FRAME_VALIDATION_FAILED', {
      frameId: detected?.frameId || null,
      failures: poseFrameResult.validation.failures,
    });
    return {
      poseFrame: poseFrameResult.value,
      qualityStatus: null,
      assessmentEvents: [],
      frameAnalysisResult: null,
      structuredValidation: {
        poseFrame: poseFrameResult.validation,
      },
    };
  }

  const legacyQualityStatusResult = qualityDecision || readiness
    ? legacyQualityDecisionToQualityStatus({
      sessionId: poseFrame.sessionId,
      frameId: poseFrame.frameId,
      timestampMs: poseFrame.timestampMs,
      decision: qualityDecision,
      readiness,
      poseFrame,
    })
    : evaluateStructuredFrameQuality(poseFrame);
  const assessmentType = structuredAssessmentType();
  const qualityMetrics = evaluatePoseFrameQuality(poseFrame, {
    assessmentType,
    brightness,
    calibrationProfile: structuredCalibrationState?.profile || null,
  });
  const qualityStatusResult = structuredQualityStateMachine.update({
    frame: poseFrame,
    metrics: qualityMetrics,
    timestampMs: poseFrame.timestampMs,
  });
  const qualityStatus = qualityStatusResult.validation.ok ? qualityStatusResult.value : null;
  if (!qualityStatus) {
    debug('STRUCTURED_QUALITY_STATUS_VALIDATION_FAILED', {
      frameId: detected?.frameId || null,
      failures: qualityStatusResult.validation.failures,
    });
  }

  const eventType = poseFrame.detectedPersonCount > 0
    ? StructuredAssessmentEventTypes.PoseAcquired
    : StructuredAssessmentEventTypes.PoseLost;
  const eventResult = assessmentType ? createAssessmentEvent({
    sessionId: poseFrame.sessionId,
    assessmentType,
    type: qualityStatus?.state === 'PAUSED' || qualityStatus?.state === 'BLOCKED'
      ? StructuredAssessmentEventTypes.QualityPaused
      : eventType,
    timestampMs: poseFrame.timestampMs,
    frameId: poseFrame.frameId,
    confidence: poseFrame.confidence.overall,
  }) : null;
  const assessmentEvents = eventResult?.validation.ok ? [eventResult.value] : [];
  const calibrationResult = updatePersonalCalibration(structuredCalibrationState, {
    poseFrame,
    qualityStatus,
  });
  structuredCalibrationState = calibrationResult.state;
  const normalizedBodyProgress = calibrationResult.profile
    ? bodyProgressFromCalibration(poseFrame, calibrationResult.profile)
    : null;
  const frameAnalysisResult = qualityStatus ? {
    sessionId: poseFrame.sessionId,
    frameId: poseFrame.frameId,
    timestampMs: poseFrame.timestampMs,
    poseFrame,
    qualityStatus,
    assessmentEvents,
    isFinal: false,
  } : null;
  const frameValidation = frameAnalysisResult
    ? validateFrameAnalysisResult(frameAnalysisResult)
    : { ok: false, failures: [{ code: 'MISSING_QUALITY_STATUS', message: 'FrameAnalysisResult requires QualityStatus.' }] };
  if (!frameValidation.ok) {
    debug('STRUCTURED_FRAME_RESULT_VALIDATION_FAILED', {
      frameId: detected?.frameId || null,
      failures: frameValidation.failures,
    });
  }
  return {
    poseFrame,
    qualityStatus,
    assessmentEvents,
    frameAnalysisResult: frameValidation.ok ? frameAnalysisResult : null,
    calibrationProfile: calibrationResult.profile,
    calibrationStatus: {
      status: calibrationResult.profile?.status || 'IN_PROGRESS',
      canStartAssessment: Boolean(calibrationResult.canStartAssessment),
      progress: calibrationResult.progress || null,
      validation: calibrationResult.validation || null,
    },
    normalizedBodyProgress,
    debugOverlay: {
      fps: frameQueueTelemetry().structuredQueue?.targetFps || null,
      processingLatencyMs: poseFrame.processing.latencyMs,
      qualityState: qualityStatus?.state || null,
      calibrationProgress: calibrationResult.progress || null,
      coordinateOrientation: calibrationResult.profile?.coordinateOrientation || null,
      cameraView: qualityMetrics.camera?.view || null,
      pauseReason: qualityStatus?.reasons?.[0]?.code || null,
      landmarkConfidence: poseFrame.confidence,
      footPlacementObservable: qualityMetrics.footPlacementObservable,
      multiPersonInterventionDetection: true,
    },
    structuredValidation: {
      poseFrame: poseFrameResult.validation,
      qualityStatus: qualityStatusResult.validation,
      legacyQualityStatus: legacyQualityStatusResult.validation,
      calibration: calibrationResult.validation || null,
      frameAnalysisResult: frameValidation,
    },
  };
}

function buildStructuredFinalResponse(result) {
  const structuredAssessmentResult = result.structuredAssessmentResult || result.finalResponse?.result || null;
  if (!structuredAssessmentResult) return null;
  const assessmentValidation = validateAssessmentResult(structuredAssessmentResult);
  if (!assessmentValidation.ok) {
    debug('STRUCTURED_FINAL_RESULT_VALIDATION_FAILED', {
      sessionId: result.sessionId,
      selectedTest,
      failures: assessmentValidation.failures,
    });
  }
  const finalResponse = {
    sessionId: result.sessionId,
    result: structuredAssessmentResult,
    isFinal: true,
  };
  const responseValidation = validateFinalAssessmentResponse(finalResponse);
  if (!responseValidation.ok) {
    debug('STRUCTURED_FINAL_RESPONSE_VALIDATION_FAILED', {
      sessionId: result.sessionId,
      selectedTest,
      failures: responseValidation.failures,
    });
  }
  return {
    structuredAssessmentResult,
    finalResponse: responseValidation.ok ? finalResponse : null,
    structuredValidation: {
      assessmentResult: assessmentValidation,
      finalResponse: responseValidation,
    },
  };
}

function postWorkerFrameResult(payload) {
  postMessage({
    ...payload,
    type: 'FRAME_RESULT',
    resultType: AssessmentResultTypes.Frame,
    sessionId: payload.sessionId || session?.id || null,
    frameId: payload.frameId || null,
    payload,
  });
}

function postPoseFrame({ source, detected, bitmap, sequence = null, analyzedAt = Date.now() }) {
  const structured = buildStructuredFramePayload({
    detected,
    bitmap,
    analyzedAt,
  });
  postWorkerFrameResult({
    source,
    sequence,
    sessionId: detected.sessionId || session?.id || null,
    frameId: detected.frameId,
    cameraFrameSequence: detected.cameraFrameSequence,
    mobileSequence: detected.mobileSequence,
    landmarks: detected.landmarks,
    rawLandmarks: detected.landmarks,
    confidence: detected.confidence,
    frameSize: { width: bitmap.width, height: bitmap.height },
    receivedAt: detected.inputReceivedAt,
    analyzedAt,
    ...structured,
  });
}

async function handlePreviewFrame(message) {
  const now = Date.now();
  if (session?.active) {
    closeQueuedFrameInput(message);
    return;
  }
  if (isStaleFrameMessage(message, now)) {
    postFrameSkipped({
      message,
      source: 'preview-frame',
      reason: 'stale-before-inference',
      now,
    });
    closeQueuedFrameInput(message);
    return;
  }
  if (isAnalyzingFrame) {
    closeQueuedFrameInput(message);
    return;
  }
  if (now - latestAnalyzeAt < MIN_FRAME_INTERVAL_MS) {
    closeQueuedFrameInput(message);
    return;
  }
  latestAnalyzeAt = now;
  isAnalyzingFrame = true;
  setSelectedTest(message.selectedTest);

  let bitmap = null;
  try {
    const detected = await detectPoseFromFrame(message);
    bitmap = detected.bitmap;
    if (isStaleDetectedFrame(detected)) {
      postFrameSkipped({
        message,
        detected,
        source: 'preview-frame',
        reason: 'stale-after-inference',
      });
      return;
    }
    postPoseFrame({
      source: 'preview-frame',
      detected,
      bitmap,
    });
    if (!shouldRunPreviewQualityPipeline()) return;
    const brightnessSample = await sampledFrameBrightness(bitmap);
    const brightnessContext = brightnessQualityContext(brightnessSample, { updateCalibration: true });
    const qualityPayload = buildPoseQualityPayload({
      detected,
      timestampMs: detected.timestampMs,
      poseCount: detected.poseCount,
      brightness: brightnessContext.brightnessForQuality,
      brightnessStats: brightnessContext.brightness,
      brightnessCalibration: brightnessContext.brightnessCalibration,
    });
    const analyzedAt = Date.now();
    if (isStaleDetectedFrame(detected, analyzedAt)) {
      postFrameSkipped({
        message,
        detected,
        source: 'preview-frame',
        reason: 'stale-before-quality-post',
        now: analyzedAt,
      });
      return;
    }
    const qualityDecision = evaluateFrameQuality({
      readiness: qualityPayload.cameraReadiness,
      frameId: detected.frameId,
      source: 'preview-frame',
    });
    const structured = buildStructuredFramePayload({
      detected,
      bitmap,
      analyzedAt,
      landmarks: qualityPayload.landmarks,
      readiness: qualityPayload.cameraReadiness,
      qualityDecision,
      brightness: brightnessContext.brightness,
    });
    postWorkerFrameResult({
      source: 'preview-frame',
      sessionId: detected.sessionId,
      frameId: detected.frameId,
      landmarks: qualityPayload.landmarks,
      rawLandmarks: qualityPayload.rawLandmarks,
      confidence: detected.confidence,
      trackingQualityScore: qualityPayload.trackingQualityScore,
      trackingQuality: qualityPayload.trackingQuality,
      cameraReadiness: qualityPayload.cameraReadiness,
      qualityDecision,
      brightness: brightnessContext.brightness,
      brightnessCalibration: brightnessContext.brightnessCalibration,
      smoothing: qualityPayload.smoothing,
      frameSize: { width: bitmap.width, height: bitmap.height },
      receivedAt: detected.inputReceivedAt,
      cameraFrameSequence: detected.cameraFrameSequence,
      mobileSequence: detected.mobileSequence,
      analyzedAt,
      frameQueue: frameQueueTelemetry(),
      ...structured,
    });
  } catch (error) {
    if (/Packet timestamp mismatch|WaitUntilIdle failed|CalculatorGraph::Run\(\) failed/.test(error.message || '')) {
      closeLandmarker();
    }
    debug('preview-analysis-failed', {
      message: error.message || 'Pose preview failed.',
      stack: error.stack || null,
    });
    postMessage({
      type: 'ANALYSIS_ERROR',
      sessionId: messageSessionId(message) || session?.id || null,
      errorCode: 'PREVIEW_FRAME_FAILED',
      error: error.message || 'Pose preview failed.',
      recoverable: true,
      source: 'preview-frame',
      at: Date.now(),
    });
  } finally {
    if (bitmap) bitmap.close?.();
    else closeQueuedFrameInput(message);
    isAnalyzingFrame = false;
    scheduleFramePump();
  }
}

async function handleFrame(message) {
  const now = Date.now();
  latestFrameAt = now;
  if (!session?.active) {
    closeQueuedFrameInput(message);
    return;
  }
  if (!isMessageForActiveSession(message)) {
    if (!frameQueueStats) resetFrameQueueStats();
    frameQueueStats.staleSessionFrameCount += 1;
    postFrameSkipped({
      message,
      source: 'analysis-frame',
      reason: 'stale-session-before-inference',
      now,
    });
    closeQueuedFrameInput(message);
    return;
  }
  if (isStaleFrameMessage(message, now)) {
    postFrameSkipped({
      message,
      source: 'analysis-frame',
      reason: 'stale-before-inference',
      now,
    });
    closeQueuedFrameInput(message);
    return;
  }
  if (isAnalyzingFrame) {
    closeQueuedFrameInput(message);
    return;
  }
  if (now - latestAnalyzeAt < MIN_FRAME_INTERVAL_MS) {
    closeQueuedFrameInput(message);
    return;
  }
  latestAnalyzeAt = now;
  isAnalyzingFrame = true;

  let bitmap = null;
  try {
    const detected = await detectPoseFromFrame(message);
    bitmap = detected.bitmap;
    const timestampMs = detected.timestampMs;
    const nextSequence = frameSequence + 1;
    if (isStaleDetectedFrame(detected)) {
      postFrameSkipped({
        message,
        detected,
        source: 'analysis-frame',
        reason: 'stale-after-inference',
      });
      return;
    }
    postPoseFrame({
      source: 'analysis-frame',
      detected,
      bitmap,
      sequence: nextSequence,
    });
    const smoothed = poseSmoother.smooth(detected.landmarks, { timestampMs });
    const steadiFrame = steadiLandmarkSeries.push({
      sequence: nextSequence,
      timestampMs,
      receivedAt: detected.inputReceivedAt,
      landmarks: smoothed.landmarks,
      worldLandmarks: detected.worldLandmarks,
      retainedNormalizedLandmarks: detected.landmarks,
      retainedWorldLandmarks: detected.rawWorldLandmarks,
      confidence: detected.confidence,
    }, { includeSeriesFrames: false });
    frameSequence = nextSequence;
    if (!shouldRunMovementAnalysisPipeline()) return;

    if (usesFastRawAnalysis()) {
      const trackingQuality = {
        trackingQualityScore: detected.confidence,
        level: 'raw',
        fastPath: true,
      };
      const poseFrame = {
        timestampMs,
        landmarks: detected.landmarks,
        rawLandmarks: detected.landmarks,
        confidence: detected.confidence,
        metrics: null,
        landmarkSeries: null,
        trackingQuality,
        trackingQualityScore: detected.confidence,
        cameraReadiness: null,
      };
      let state = analyzer.addFrame({ poseFrame: null, calibrationProfile: null, qualityStatus: null });
      state = {
        ...state,
        trackingQualityScore: detected.confidence,
        trackingQuality,
        cameraReadiness: null,
      };
      recordSessionQuality({
        trackingQualityScore: detected.confidence,
        trackingQuality,
      }, true);

      frameSequence = nextSequence;
      const analyzedAt = Date.now();
      if (isStaleDetectedFrame(detected, analyzedAt)) {
        postFrameSkipped({
          message,
          detected,
          source: 'analysis-frame',
          reason: 'stale-before-analysis-post',
          now: analyzedAt,
        });
        return;
      }
      const processing = recordProcessingTelemetry({
        analyzedAt,
        inferenceDurationMs: detected.inferenceDurationMs,
      });
      noteFrameProcessed(detected, analyzedAt);
      const qualityDecision = evaluateFrameQuality({
        readiness: null,
        frameId: detected.frameId,
        source: 'analysis-frame',
      });
      const structured = buildStructuredFramePayload({
        detected,
        bitmap,
        analyzedAt,
        landmarks: detected.landmarks,
        readiness: null,
        qualityDecision,
        brightness: null,
      });

      postWorkerFrameResult({
        source: 'analysis-frame',
        sessionId: detected.sessionId,
        frameId: detected.frameId,
        sequence: frameSequence,
        state,
        landmarks: detected.landmarks,
        rawLandmarks: detected.landmarks,
        confidence: detected.confidence,
        trackingQualityScore: detected.confidence,
        trackingQuality,
        cameraReadiness: null,
        brightness: null,
        brightnessCalibration: null,
        smoothing: null,
        frameSize: { width: bitmap.width, height: bitmap.height },
        receivedAt: detected.inputReceivedAt,
        cameraFrameSequence: detected.cameraFrameSequence,
        mobileSequence: detected.mobileSequence,
        analyzedAt,
        processing: { ...processing, frameQueue: frameQueueTelemetry() },
        qualityDecision,
        frameQueue: frameQueueTelemetry(),
        ...structured,
      });

      if (session?.active && shouldFinishSessionFromState(state)) {
        debug('session-auto-finish', {
          selectedTest,
          elapsedSeconds: state.elapsedSeconds,
          durationSeconds: state.durationSeconds,
          balanceProtocolStatus: state.balanceProtocol?.status || null,
          fastPath: true,
        });
        finishSession({ completedAt: timestampMs });
      }
      return;
    }

    const shouldRefreshQuality = shouldRunAnalysisQualityPipeline() || !latestAnalysisQualityPayload;
    let qualityPayload = null;
    let brightnessStats = latestAnalysisQualityPayload?.brightness || null;
    let brightnessCalibrationStats = latestAnalysisQualityPayload?.brightnessCalibration || brightnessCalibration;

    if (shouldRefreshQuality) {
      const brightnessSample = await sampledFrameBrightness(bitmap);
      const brightnessContext = brightnessQualityContext(brightnessSample);
      qualityPayload = buildPoseQualityPayload({
        detected,
        timestampMs,
        poseCount: detected.poseCount,
        brightness: brightnessContext.brightnessForQuality,
        brightnessStats: brightnessContext.brightness,
        brightnessCalibration: brightnessContext.brightnessCalibration,
        smoothed,
      });
      cacheAnalysisQualityPayload(qualityPayload, brightnessContext);
      brightnessStats = brightnessContext.brightness;
      brightnessCalibrationStats = brightnessContext.brightnessCalibration;
      recordSessionQuality(qualityPayload.cameraReadiness, !shouldBlockFrame(qualityPayload.cameraReadiness));
    } else {
      qualityPayload = buildCachedAnalysisQualityPayload({ smoothed, detected });
    }

    const qualityDecision = evaluateFrameQuality({
      readiness: qualityPayload.cameraReadiness,
      frameId: detected.frameId,
      source: 'analysis-frame',
    });
    if (qualityDecision.disagreement) {
      debug('QUALITY_GATE_DISAGREEMENT', {
        frameId: detected.frameId,
        generalGateResult: qualityDecision.legacy.generalGateResult,
        movementGateResult: qualityDecision.legacy.movementGateResult,
      });
    }
    const structured = buildStructuredFramePayload({
      detected,
      bitmap,
      analyzedAt: Date.now(),
      landmarks: qualityPayload.landmarks,
      readiness: qualityPayload.cameraReadiness,
      qualityDecision,
      brightness: brightnessStats,
    });
    const blockedFrame = (selectedTest !== 'four_stage_balance' && qualityDecision.legacy.movementBlocked)
      || structuredQualityBlocksAnalysis(structured.qualityStatus);
    const calibrationBlocked = !structured.calibrationStatus?.canStartAssessment;
    let poseFrame = null;
    let state = null;
    if (calibrationBlocked) {
      state = stateForCalibrationIssue(timestampMs, structured);
    } else if (blockedFrame) {
      state = analyzer.addFrame({
        poseFrame: structured.poseFrame,
        calibrationProfile: structured.calibrationProfile,
        qualityStatus: structured.qualityStatus,
      });
      state = {
        ...stateForCameraIssue(timestampMs, qualityPayload.cameraReadiness),
        ...state,
        qualityStatus: structured.qualityStatus,
        calibrationProfile: structured.calibrationProfile,
        calibrationStatus: structured.calibrationStatus,
        normalizedBodyProgress: structured.normalizedBodyProgress || null,
        trackingPaused: true,
      };
    } else {
      poseFrame = {
        timestampMs,
        landmarks: steadiFrame?.frame.landmarks || qualityPayload.landmarks,
        rawLandmarks: qualityPayload.rawLandmarks,
        confidence: qualityPayload.trackingQualityScore,
        metrics: steadiFrame.metrics,
        landmarkSeries: steadiFrame.series,
        trackingQuality: qualityPayload.trackingQuality,
        trackingQualityScore: qualityPayload.trackingQualityScore,
        cameraReadiness: qualityPayload.cameraReadiness,
        brightness: brightnessStats,
        brightnessCalibration: brightnessCalibrationStats,
      };
      state = analyzer.addFrame({
        poseFrame: structured.poseFrame,
        calibrationProfile: structured.calibrationProfile,
        qualityStatus: structured.qualityStatus,
      });
      state = {
        ...state,
        trackingQualityScore: qualityPayload.trackingQualityScore,
        trackingQuality: qualityPayload.trackingQuality,
        cameraReadiness: qualityPayload.cameraReadiness,
        trackingQualityWarning: qualityPayload.trackingQuality?.level === 'caution'
          ? 'Low-confidence movement tracking. Staff should review before using this result.'
          : null,
      };
    }
    const analyzedAt = Date.now();
    if (isStaleDetectedFrame(detected, analyzedAt)) {
      postFrameSkipped({
        message,
        detected,
        source: 'analysis-frame',
        reason: 'stale-before-analysis-post',
        now: analyzedAt,
      });
      return;
    }
    const processing = recordProcessingTelemetry({
      analyzedAt,
      inferenceDurationMs: detected.inferenceDurationMs,
    });
    noteFrameProcessed(detected, analyzedAt);

    if (selectedTest === 'chair_stand' && (state?.armUseOccurrenceCount || 0) > 0) {
      armUseOccurrencesByAssessmentSession.set(
        session?.assessmentSessionId || session?.id,
        state.armUseOccurrenceCount,
      );
    }

    postWorkerFrameResult({
      source: 'analysis-frame',
      sessionId: detected.sessionId,
      frameId: detected.frameId,
      sequence: frameSequence,
      state,
      landmarks: poseFrame?.landmarks || qualityPayload.landmarks,
      rawLandmarks: qualityPayload.rawLandmarks,
      confidence: qualityPayload.trackingQualityScore,
      trackingQualityScore: qualityPayload.trackingQualityScore,
      trackingQuality: qualityPayload.trackingQuality,
      cameraReadiness: qualityPayload.cameraReadiness,
      brightness: brightnessStats,
      brightnessCalibration: brightnessCalibrationStats,
      smoothing: qualityPayload.smoothing,
      frameSize: { width: bitmap.width, height: bitmap.height },
      receivedAt: detected.inputReceivedAt,
      cameraFrameSequence: detected.cameraFrameSequence,
      mobileSequence: detected.mobileSequence,
      analyzedAt,
      processing: { ...processing, frameQueue: frameQueueTelemetry() },
      qualityDecision,
      frameQueue: frameQueueTelemetry(),
      ...structured,
    });

    if (session?.active && !calibrationBlocked && !blockedFrame && shouldFinishSessionFromState(state)) {
      debug('session-auto-finish', {
        selectedTest,
        elapsedSeconds: state.elapsedSeconds,
        durationSeconds: state.durationSeconds,
        balanceProtocolStatus: state.balanceProtocol?.status || null,
      });
      finishSession({ completedAt: timestampMs });
    }
  } catch (error) {
    if (/Packet timestamp mismatch|WaitUntilIdle failed|CalculatorGraph::Run\(\) failed/.test(error.message || '')) {
      closeLandmarker();
    }
    debug('frame-analysis-failed', {
      message: error.message || 'Pose analysis failed.',
      stack: error.stack || null,
    });
    postMessage({
      type: 'ANALYSIS_ERROR',
      sessionId: messageSessionId(message) || session?.id || null,
      errorCode: 'ANALYSIS_FRAME_FAILED',
      error: error.message || 'Pose analysis failed.',
      recoverable: true,
      source: 'camera-frame',
      at: Date.now(),
    });
  } finally {
    if (bitmap) bitmap.close?.();
    else closeQueuedFrameInput(message);
    isAnalyzingFrame = false;
    scheduleFramePump();
  }
}

function hasQueuedFrameMessage() {
  return Boolean(pendingAnalysisFrame || pendingPreviewFrame);
}

function clearQueuedFrameMessages() {
  closeQueuedFrameInput(pendingPreviewFrame);
  closeQueuedFrameInput(pendingAnalysisFrame);
  pendingPreviewFrame = null;
  pendingAnalysisFrame = null;
  framePumpScheduled = false;
}

function dropStaleQueuedFrameMessages() {
  const now = Date.now();
  if (pendingPreviewFrame && isStaleFrameMessage(pendingPreviewFrame, now)) {
    postFrameSkipped({
      message: pendingPreviewFrame,
      source: 'preview-frame',
      reason: 'stale-in-queue',
      now,
    });
    closeQueuedFrameInput(pendingPreviewFrame);
    pendingPreviewFrame = null;
  }
  if (pendingAnalysisFrame && isStaleFrameMessage(pendingAnalysisFrame, now)) {
    postFrameSkipped({
      message: pendingAnalysisFrame,
      source: 'analysis-frame',
      reason: 'stale-in-queue',
      now,
    });
    closeQueuedFrameInput(pendingAnalysisFrame);
    pendingAnalysisFrame = null;
  }
}

function nextQueuedFrameMessage() {
  if (session?.active) {
    const message = pendingAnalysisFrame;
    pendingAnalysisFrame = null;
    closeQueuedFrameInput(pendingPreviewFrame);
    pendingPreviewFrame = null;
    return message;
  }
  const message = pendingPreviewFrame;
  pendingPreviewFrame = null;
  return message;
}

async function processQueuedFrameMessage() {
  framePumpScheduled = false;
  if (isAnalyzingFrame) {
    scheduleFramePump();
    return;
  }

  dropStaleQueuedFrameMessages();
  if (!hasQueuedFrameMessage()) return;

  const elapsedSinceAnalysisMs = Date.now() - latestAnalyzeAt;
  if (elapsedSinceAnalysisMs < MIN_FRAME_INTERVAL_MS) {
    scheduleFramePump(MIN_FRAME_INTERVAL_MS - elapsedSinceAnalysisMs);
    return;
  }

  const message = nextQueuedFrameMessage();
  if (!message) return;
  if (message.type === 'frame') {
    await handleFrame(message);
  } else {
    await handlePreviewFrame(message);
  }

  if (hasQueuedFrameMessage()) scheduleFramePump();
}

function scheduleFramePump(delayMs = 0) {
  if (framePumpScheduled || isAnalyzingFrame) return;
  framePumpScheduled = true;
  setTimeout(() => {
    processQueuedFrameMessage().catch((error) => {
      framePumpScheduled = false;
      debug('frame-pump-failed', {
        message: error.message || 'Pose frame pump failed.',
        stack: error.stack || null,
      });
      postMessage({
        type: 'ANALYSIS_ERROR',
        sessionId: session?.id || null,
        errorCode: 'FRAME_PUMP_FAILED',
        error: error.message || 'Pose frame pump failed.',
        recoverable: true,
        at: Date.now(),
      });
    });
  }, Math.max(0, delayMs));
}

function queueFrameMessage(message) {
  const source = message.type === 'frame' ? 'analysis-frame' : 'preview-frame';
  const now = Date.now();
  if (!frameQueueStats) resetFrameQueueStats();
  frameQueueStats.receivedFrameCount += 1;
  const frameDecision = structuredFrameProcessor.enqueue(message, {
    sessionId: messageSessionId(message) || (message.type === 'frame' ? session?.id : 'preview'),
    active: message.type === 'frame' && Boolean(session?.active),
  });
  if (frameDecision.action === 'DROP') {
    postFrameSkipped({
      message,
      source,
      reason: frameDecision.reason,
      now,
    });
    closeQueuedFrameInput(message);
    return;
  }
  if (frameDecision.supersededFrame) {
    debug('structured-frame-superseded', {
      droppedFrameId: frameIdFromMessage(frameDecision.supersededFrame),
      nextFrameId: frameIdFromMessage(message),
      frameQueue: frameQueueTelemetry(),
    });
  }
  if (message.type === 'frame' && !isMessageForActiveSession(message)) {
    frameQueueStats.staleSessionFrameCount += 1;
    postFrameSkipped({
      message,
      source,
      reason: 'stale-session',
      now,
    });
    closeQueuedFrameInput(message);
    return;
  }
  const frameId = frameIdFromMessage(message);
  if (frameId) {
    const scopedFrameId = `${messageSessionId(message) || 'preview'}:${frameId}`;
    if (seenFrameIds.has(scopedFrameId)) {
      frameQueueStats.duplicateFrameCount += 1;
      postFrameSkipped({
        message,
        source,
        reason: 'duplicate-frame',
        now,
      });
      closeQueuedFrameInput(message);
      return;
    }
    seenFrameIds.add(scopedFrameId);
    if (seenFrameIds.size > 120) {
      seenFrameIds = new Set([...seenFrameIds].slice(-80));
    }
  }
  if (isStaleFrameMessage(message, now)) {
    postFrameSkipped({
      message,
      source,
      reason: 'stale-before-queue',
      now,
    });
    closeQueuedFrameInput(message);
    return;
  }
  if (message.type === 'frame') {
    if (pendingAnalysisFrame) {
      frameQueueStats.droppedFrameCount += 1;
      debug('analysis-frame-superseded', {
        droppedFrameId: frameIdFromMessage(pendingAnalysisFrame),
        nextFrameId: frameId,
        frameQueue: frameQueueTelemetry(),
      });
      closeQueuedFrameInput(pendingAnalysisFrame);
    }
    pendingAnalysisFrame = message;
  } else {
    if (pendingPreviewFrame) {
      frameQueueStats.droppedFrameCount += 1;
      debug('preview-frame-superseded', {
        droppedFrameId: frameIdFromMessage(pendingPreviewFrame),
        nextFrameId: frameId,
        frameQueue: frameQueueTelemetry(),
      });
      closeQueuedFrameInput(pendingPreviewFrame);
    }
    pendingPreviewFrame = message;
  }
  scheduleFramePump();
}

function startSession(message) {
  const startedAt = message.startedAt || Date.now();
  setSelectedTest(message.selectedTest || AssessmentTestTypes.ChairStand);
  clearQueuedFrameMessages();
  const sessionId = messageSessionId(message) || `analysis-${startedAt}`;
  const assessmentSessionId = message.assessmentSessionId || sessionId;
  analyzer = createMovementAnalyzer(selectedTest, {
    supportRoiNormalized: message.supportRoiNormalized || message.operationalContext?.supportRoiNormalized || null,
    armUseOccurrenceCount: Math.max(
      Number(message.armUseOccurrenceCount) || 0,
      armUseOccurrencesByAssessmentSession.get(assessmentSessionId) || 0,
    ),
    profile: message.profile || null,
  });
  session = {
    id: sessionId,
    active: true,
    userId: message.userId || 'remote-user',
    selectedTest,
    startedAt,
    manualTest: false,
    assessmentSessionId,
  };
  analyzer.startSession(session.userId, startedAt, sessionId);
  frameSequence = 0;
  steadiLandmarkSeries.reset();
  poseSmoother.reset();
  worldPoseSmoother.reset();
  latestQualitySample = null;
  resetCachedAnalysisQuality();
  resetBrightnessSampling();
  resetPipelineCadence();
  resetSessionQuality();
  resetProcessingTelemetry();
  resetFrameQueueStats();
  resetStructuredSessionState({ sessionId, startedAt, preserveValidCalibration: true });
  postMessage({
    type: 'SESSION_READY',
    sessionId,
    startedAt,
    state: analyzer.getCurrentState(startedAt),
  });
}

function finishSession(message) {
  if (!session?.active) return;
  if (messageSessionId(message) && messageSessionId(message) !== session.id) {
    if (!frameQueueStats) resetFrameQueueStats();
    frameQueueStats.staleSessionFrameCount += 1;
    debug('stale-finalize-session-ignored', {
      receivedSessionId: messageSessionId(message),
      activeSessionId: session.id,
    });
    return;
  }
  const completedAt = message.completedAt || Date.now();
  const qualitySummary = sessionTrackingQualitySummary();
  const fastRawAnalysis = usesFastRawAnalysis();
  const invalidSession = !fastRawAnalysis && shouldInvalidateSession(qualitySummary);
  const source = session.manualTest ? ResultSources.ManualTest : ResultSources.LivePose;
  const analyzerResult = analyzer.finishSession(completedAt, {
    qualitySummary,
    forceInvalid: invalidSession,
    invalidReason: invalidSession ? 'TRACKING_QUALITY_TOO_LOW' : null,
    source,
  });
  const resultTrackingQualityScore = qualitySummary.sampleCount
    ? qualitySummary.trackingQualityScore
    : analyzerResult?.confidence ?? 0;
  const rawResult = invalidSession
    ? {
      ...invalidTrackingResult(completedAt, qualitySummary),
      structuredAssessmentResult: analyzerResult?.structuredAssessmentResult || null,
      structuredAssessmentValidation: analyzerResult?.structuredAssessmentValidation || null,
    }
    : {
      ...analyzerResult,
      trackingQualityScore: resultTrackingQualityScore,
      trackingQualitySummary: qualitySummary,
      trackingQualityWarning: !fastRawAnalysis && resultTrackingQualityScore < 0.8
        ? 'Low-confidence movement tracking. Staff should review before using this result.'
        : null,
      testFlags: {
        ...(analyzerResult?.testFlags || {}),
        trackingQualityCaution: !fastRawAnalysis && resultTrackingQualityScore < 0.8,
        fastRawAnalysis,
      },
    };
  const status = invalidSession ? AssessmentStatuses.Invalid : AssessmentStatuses.Valid;
  const result = withAssessmentMetadata({
    ...rawResult,
    finalHalfStandCreditStatus: rawResult.finalHalfStandCreditStatus,
  }, {
    source,
    sessionId: session.id,
    analysisSessionId: session.id,
    testType: selectedTest,
    assessmentType: assessmentTypeForTestType(selectedTest),
    isPersistable: source === ResultSources.LivePose && status === AssessmentStatuses.Valid,
    isClinicallyScorable: source === ResultSources.LivePose && status === AssessmentStatuses.Valid,
    status,
    resultType: AssessmentResultTypes.Final,
    analyzerFinalEvent: true,
    generatedAt: Date.now(),
  });
  const structuredFinal = buildStructuredFinalResponse(result);
  const structuredResult = structuredFinal?.structuredAssessmentResult || null;
  const landmarkSeries = {
    schemaVersion: stage2Operational.landmarkSeries.schemaVersion,
    analysisSessionId: session.id,
    assessmentSessionId: session.assessmentSessionId,
    assessmentType: structuredResult?.assessmentType || assessmentTypeForTestType(selectedTest),
    status: structuredResult?.status === 'VALID' ? 'VALID' : 'INVALID',
    targetFps: stage2Operational.landmarkSeries.targetFps,
    startedAt: session.startedAt,
    completedAt,
    samples: steadiLandmarkSeries.getFrames()
      .filter((frame) => (
        frame.retainedNormalizedLandmarks.length === stage2Operational.landmarkSeries.landmarkCount
        && frame.retainedWorldLandmarks.length === stage2Operational.landmarkSeries.landmarkCount
        && [...frame.retainedNormalizedLandmarks, ...frame.retainedWorldLandmarks].every((point) => (
          [point.x, point.y, point.z, point.visibility].every(Number.isFinite)
        ))
      ))
      .map((frame) => ({
        sequence: frame.sequence,
        timestampMs: frame.timestampMs,
        normalizedLandmarks: frame.retainedNormalizedLandmarks.map(({ index, x, y, z, visibility }) => ({ index, x, y, z, visibility })),
        worldLandmarks: frame.retainedWorldLandmarks.map(({ index, x, y, z, visibility }) => ({ index, x, y, z, visibility })),
      })),
  };
  session = session ? { ...session, active: false, completedAt } : null;
  postMessage({
    type: 'FINAL_RESULT',
    sessionId: result.sessionId,
    completedAt,
    payload: {
      ...result,
      ...(structuredFinal || {}),
    },
    result: {
      ...result,
      ...(structuredFinal || {}),
    },
    ...(structuredFinal || {}),
    landmarkSeries,
    state: analyzer.getCurrentState(completedAt),
  });
}

function resetSession(message = {}) {
  const resetSessionId = messageSessionId(message) || session?.id || null;
  clearQueuedFrameMessages();
  closeLandmarker();
  analyzer = createMovementAnalyzer(selectedTest);
  analyzer.reset();
  session = null;
  frameSequence = 0;
  latestFrameAt = 0;
  latestAnalyzeAt = 0;
  steadiLandmarkSeries.reset();
  poseSmoother.reset();
  worldPoseSmoother.reset();
  latestQualitySample = null;
  resetCachedAnalysisQuality();
  resetBrightnessSampling();
  resetBrightnessCalibration();
  resetPipelineCadence();
  resetSessionQuality();
  isAnalyzingFrame = false;
  resetProcessingTelemetry();
  resetFrameQueueStats();
  resetStructuredSessionState({ sessionId: resetSessionId || 'preview', startedAt: Date.now() });
  postMessage({
    type: 'SESSION_CANCELLED',
    sessionId: resetSessionId,
    reason: message.reason || 'reset',
    state: analyzer.getCurrentState(Date.now()),
  });
}

self.onmessage = async (event) => {
  const message = event.data || {};
  try {
    if (message.type === 'debug-probe' || message.type === 'DEBUG_PROBE') {
      await probeWasmBasePath(message.wasmPath || defaultWasmPath());
    }
    if (message.selectedTest) setSelectedTest(message.selectedTest);
    if (message.type === 'init' || message.type === 'INIT') await initLandmarker(message.config || {});
    if (isPreviewFrameMessage(message)) {
      queueFrameMessage({ ...message, type: 'preview-frame' });
    }
    if (message.type === 'start-session' || message.type === 'START_SESSION') startSession(message);
    if (isAnalysisFrameMessage(message)) {
      queueFrameMessage({ ...message, type: 'frame' });
    }
    if (message.type === 'manual-repetition' || message.type === 'MANUAL_REPETITION') {
      if (session) session.manualTest = true;
      const state = analyzer.addManualRepetition();
      postWorkerFrameResult({
        source: 'analysis-frame',
        sessionId: session?.id || messageSessionId(message) || null,
        frameId: `manual-${Date.now()}`,
        sequence: frameSequence,
        state,
        landmarks: [],
        receivedAt: Date.now(),
        analyzedAt: Date.now(),
      });
    }
    if (message.type === 'CONFIRM_BALANCE_STAGE') {
      const state = analyzer?.confirmCurrentStage?.();
      if (state) {
        postWorkerFrameResult({
          source: 'analysis-frame',
          sessionId: session?.id || messageSessionId(message) || null,
          frameId: `balance-confirm-${Date.now()}`,
          sequence: frameSequence,
          state,
          landmarks: [],
          receivedAt: Date.now(),
          analyzedAt: Date.now(),
        });
      }
    }
    if (message.type === 'finish-session' || message.type === 'FINALIZE_SESSION') finishSession(message);
    if (message.type === 'reset-session' || message.type === 'RESET_SESSION' || message.type === 'CANCEL_SESSION') resetSession(message);
  } catch (error) {
    debug('worker-message-failed', {
      messageType: message.type,
      message: error.message || 'Pose worker failed.',
      stack: error.stack || null,
    });
    postMessage({
      type: 'ANALYSIS_ERROR',
      sessionId: messageSessionId(message) || session?.id || null,
      errorCode: 'WORKER_MESSAGE_FAILED',
      error: error.message || 'Pose worker failed.',
      at: Date.now(),
    });
  }
};

debug('worker-booted', { workerLocation: self.location.href, defaultWasmPath: defaultWasmPath() });
postMessage({ type: 'booted', at: Date.now() });
