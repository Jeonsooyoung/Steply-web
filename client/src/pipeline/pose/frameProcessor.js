import { poseConfig } from '../shared/config/pose.config.js';

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function frameIdFromInput(input = {}) {
  return String(
    input.frameId
      || input.cameraFrameSequence
      || input.sequence
      || input.mobileSequence
      || input.receivedAt
      || '',
  );
}

function monotonicTimestamp(candidate, previous) {
  const numeric = Number(candidate);
  const base = Number.isFinite(numeric) ? numeric : Date.now();
  return Math.max(base, previous + 1);
}

export function createPoseFrameProcessor({
  config = poseConfig.processing,
  maxInputFrameAgeMs = poseConfig.maxInputFrameAgeMs,
  minFrameIntervalMs = poseConfig.minFrameIntervalMs,
  now = () => Date.now(),
} = {}) {
  const duplicateWindowSize = config.duplicateFrameWindowSize || 120;
  const targetFrameIntervalMs = minFrameIntervalMs || Math.round(1000 / (config.targetFps || 15));
  const renderFrameIntervalMs = Math.round(1000 / (config.renderFps || 30));
  let latestMediaPipeTimestampMs = 0;
  let latestAnalysisStartedAtMs = 0;
  let latestRenderedAtMs = 0;
  let processing = false;
  let pendingFrame = null;
  let activeSessionId = null;
  let cancelled = false;
  let seenFrameIds = new Set();
  const stats = {
    receivedFrameCount: 0,
    processedFrameCount: 0,
    droppedFrameCount: 0,
    duplicateFrameCount: 0,
    staleFrameCount: 0,
    staleSessionFrameCount: 0,
    supersededFrameCount: 0,
    totalProcessingLatencyMs: 0,
  };

  function reset({ sessionId = null } = {}) {
    latestMediaPipeTimestampMs = 0;
    latestAnalysisStartedAtMs = 0;
    latestRenderedAtMs = 0;
    processing = false;
    pendingFrame = null;
    activeSessionId = sessionId;
    cancelled = false;
    seenFrameIds = new Set();
    Object.keys(stats).forEach((key) => {
      stats[key] = 0;
    });
  }

  function cancel() {
    cancelled = true;
    pendingFrame = null;
    processing = false;
  }

  function scopedFrameId(frame, sessionId) {
    const id = frameIdFromInput(frame);
    return id ? `${sessionId || 'preview'}:${id}` : '';
  }

  function rememberFrameId(scopedId) {
    if (!scopedId) return;
    seenFrameIds.add(scopedId);
    if (seenFrameIds.size > duplicateWindowSize) {
      seenFrameIds = new Set([...seenFrameIds].slice(-Math.floor(duplicateWindowSize * 0.66)));
    }
  }

  function shouldRenderFrame(timestampMs = now()) {
    if (!latestRenderedAtMs || timestampMs - latestRenderedAtMs >= renderFrameIntervalMs) {
      latestRenderedAtMs = timestampMs;
      return true;
    }
    return false;
  }

  function enqueue(frame, {
    sessionId = frame?.sessionId || frame?.analysisSessionId || null,
    active = false,
  } = {}) {
    const acceptedAtMs = now();
    stats.receivedFrameCount += 1;
    if (cancelled) {
      stats.droppedFrameCount += 1;
      return { action: 'DROP', reason: 'cancelled', acceptedAtMs };
    }

    if (active && activeSessionId && sessionId && sessionId !== activeSessionId) {
      stats.staleSessionFrameCount += 1;
      stats.droppedFrameCount += 1;
      return { action: 'DROP', reason: 'stale-session', acceptedAtMs };
    }

    const receivedAt = Number(frame?.receivedAt);
    if (finiteNumber(receivedAt) && acceptedAtMs - receivedAt > maxInputFrameAgeMs) {
      stats.staleFrameCount += 1;
      stats.droppedFrameCount += 1;
      return { action: 'DROP', reason: 'stale-frame', acceptedAtMs };
    }

    const scopedId = scopedFrameId(frame, sessionId);
    if (scopedId && seenFrameIds.has(scopedId)) {
      stats.duplicateFrameCount += 1;
      stats.droppedFrameCount += 1;
      return { action: 'DROP', reason: 'duplicate-frame', acceptedAtMs };
    }
    rememberFrameId(scopedId);

    const elapsedSinceLastStart = acceptedAtMs - latestAnalysisStartedAtMs;
    if (!processing && elapsedSinceLastStart >= targetFrameIntervalMs) {
      processing = true;
      latestAnalysisStartedAtMs = acceptedAtMs;
      return { action: 'PROCESS_NOW', frame, acceptedAtMs };
    }

    const supersededFrame = pendingFrame;
    if (supersededFrame) {
      stats.supersededFrameCount += 1;
      stats.droppedFrameCount += 1;
    }
    pendingFrame = frame;
    return {
      action: 'QUEUE_LATEST',
      frame,
      supersededFrame,
      acceptedAtMs,
      retryAfterMs: Math.max(0, targetFrameIntervalMs - elapsedSinceLastStart),
    };
  }

  function takePending() {
    if (processing || !pendingFrame) return null;
    const frame = pendingFrame;
    pendingFrame = null;
    processing = true;
    latestAnalysisStartedAtMs = now();
    return frame;
  }

  function markProcessed({ receivedAtMs, completedAtMs = now() } = {}) {
    processing = false;
    stats.processedFrameCount += 1;
    if (finiteNumber(receivedAtMs)) {
      stats.totalProcessingLatencyMs += Math.max(0, completedAtMs - receivedAtMs);
    }
  }

  function nextMediaPipeTimestamp(candidateTimestampMs) {
    latestMediaPipeTimestampMs = monotonicTimestamp(candidateTimestampMs, latestMediaPipeTimestampMs);
    return latestMediaPipeTimestampMs;
  }

  function snapshot() {
    const processed = stats.processedFrameCount;
    return {
      ...stats,
      activeSessionId,
      processing,
      pendingFrameId: pendingFrame ? frameIdFromInput(pendingFrame) : null,
      targetFps: config.targetFps || 15,
      renderFps: config.renderFps || 30,
      averageProcessingLatency: processed ? stats.totalProcessingLatencyMs / processed : null,
    };
  }

  return {
    reset,
    cancel,
    enqueue,
    takePending,
    markProcessed,
    nextMediaPipeTimestamp,
    shouldRenderFrame,
    snapshot,
    setActiveSessionId(sessionId) {
      activeSessionId = sessionId;
      cancelled = false;
    },
    get isProcessing() {
      return processing;
    },
    get pendingFrame() {
      return pendingFrame;
    },
  };
}

