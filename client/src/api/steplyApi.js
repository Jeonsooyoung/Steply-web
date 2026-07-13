import { assertSupportedAssessmentTestType } from '../pipeline/shared/assessmentTestTypes.js';

async function requestJson(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const reason = data.reason ? ` (${data.reason})` : '';
    throw new Error(`${data.error || `Request failed: ${response.status}`}${reason}`);
  }

  return data;
}

export function getNetworkInfo() {
  return requestJson('/api/network-info');
}

export function createSession() {
  return requestJson('/api/session/create', { method: 'POST', body: '{}' });
}

export function getSessionStatus(sessionId) {
  return requestJson(`/api/session/${sessionId}/status`);
}

export function getAssessmentSession(sessionId) {
  return requestJson(`/api/session/${sessionId}/assessment-session`);
}

export function updateAssessmentSession(sessionId, update) {
  return requestJson(`/api/session/${sessionId}/assessment-session`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
}

export function getCareAgentProjection(sessionId) {
  return requestJson(`/api/session/${sessionId}/care-agent-projection`);
}

export function putCareAgentProjection(sessionId, update) {
  return requestJson(`/api/session/${sessionId}/care-agent-projection`, {
    method: 'PUT',
    body: JSON.stringify(update),
  });
}

export function selectTest(sessionId, selectedTest) {
  assertSupportedAssessmentTestType(selectedTest);
  return requestJson(`/api/session/${sessionId}/select-test`, {
    method: 'POST',
    body: JSON.stringify({ selectedTest }),
  });
}

export function postRealtimeAnalysis(payload) {
  return requestJson('/api/analysis/realtime', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function postFinalAnalysis(payload) {
  return requestJson('/api/analysis/final', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
