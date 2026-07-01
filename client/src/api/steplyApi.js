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
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

export function getNetworkInfo() {
  return requestJson('/api/network-info');
}

export function createSession() {
  return requestJson('/api/session/create', { method: 'POST', body: '{}' });
}

export function connectProfile(sessionId, profile) {
  return requestJson(`/api/session/${sessionId}/connect`, {
    method: 'POST',
    body: JSON.stringify({ profile }),
  });
}

export function getSessionStatus(sessionId) {
  return requestJson(`/api/session/${sessionId}/status`);
}

export function selectTest(sessionId, selectedTest) {
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

export function getAllHistory() {
  return requestJson('/api/history');
}
