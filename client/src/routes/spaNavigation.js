export const STEPLY_NAVIGATE_EVENT = 'steply:navigate';

export function navigateSpa(path, { replace = false } = {}) {
  if (typeof window === 'undefined') return;
  const next = new URL(path, window.location.origin);
  const current = `${window.location.pathname}${window.location.hash}`;
  const target = `${next.pathname}${next.hash}`;
  if (target === current) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', target);
  window.dispatchEvent(new CustomEvent(STEPLY_NAVIGATE_EVENT, { detail: { path: target } }));
}
