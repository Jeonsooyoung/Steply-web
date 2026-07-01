export function initials(name = 'Steply User') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'SU';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export function formatDate(value) {
  if (!value) return 'Not saved yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved yet';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function statusFromScore(score = 0) {
  if (score >= 82) return 'steady';
  if (score >= 62) return 'practice_needed';
  return 'recheck';
}

export function statusLabel(status) {
  if (status === 'steady') return 'Stable';
  if (status === 'practice_needed') return 'Practice Recommended';
  return 'Check Again';
}

export function roundMetric(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number);
}
