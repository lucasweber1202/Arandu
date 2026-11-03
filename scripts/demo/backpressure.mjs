// Never retry a rate-limited command before the server's requested time.
export function retryDelayMs(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return 30_000;
  const text = value.trim();
  const seconds = /^\d+$/.test(text) ? Number(text) : null;
  const delay = seconds === null ? Date.parse(text) - now : seconds * 1000;
  if (!Number.isFinite(delay) || delay < 0) return 30_000;
  // Fail rather than silently shortening a wait outside our 15-minute budget.
  if (delay > 900_000) throw new Error('SEED_RETRY_AFTER_EXCEEDS_BUDGET');
  return Math.max(1000, Math.ceil(delay));
}
