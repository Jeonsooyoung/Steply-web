export function createAnalysisLogEvent({
  event,
  timestampMs = Date.now(),
  sessionId = null,
  frameId = null,
  source = null,
  payload = {},
} = {}) {
  return {
    event,
    timestampMs,
    sessionId,
    frameId,
    source,
    payload,
  };
}

export function logAnalysisEvent(input = {}, { enabled = false } = {}) {
  if (!enabled || typeof console === 'undefined') return null;
  const event = createAnalysisLogEvent(input);
  const safePayload = { ...(event.payload || {}) };
  delete safePayload.landmarks;
  delete safePayload.rawLandmarks;
  delete safePayload.image;
  console.debug('[analysis]', { ...event, payload: safePayload });
  return event;
}

