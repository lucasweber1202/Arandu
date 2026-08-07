const MAX_VALUE = 240;
const SAFE_FIELDS = new Set([
  'service', 'requestId', 'route', 'status', 'code', 'event', 'method', 'operation', 'outcome'
]);

function clean(value, max = MAX_VALUE) {
  return String(value ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
}

function redact(value) {
  return clean(value, 500)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b(?:\+?\d[\s().-]?){8,15}\b/g, '[phone]')
    .replace(/\b(?:bearer|token|apikey|api_key|secret)\s*[:=]?\s*[A-Za-z0-9._~+/=-]{8,}\b/gi, '[secret]');
}

export function safeErrorEvent(input = {}) {
  const event = {
    level: Number(input.status) >= 500 ? 'error' : 'warning',
    timestamp: new Date().toISOString()
  };
  for (const field of SAFE_FIELDS) {
    const value = field === 'status' ? Number(input[field]) : clean(input[field]);
    if (value || value === 0) event[field] = value;
  }
  if (input.error) {
    event.errorType = clean(input.error?.name || 'Error', 80);
    const safeMessage = redact(input.safeMessage || input.error?.message || '');
    if (safeMessage) event.message = safeMessage.slice(0, 180);
  }
  return event;
}

export async function reportError(input = {}, { fetchImpl = globalThis.fetch } = {}) {
  const event = safeErrorEvent(input);
  console.error(JSON.stringify(event));

  const endpoint = clean(process.env.ARANDU_ERROR_MONITORING_ENDPOINT, 500);
  if (!endpoint) return { delivered: false, reason: 'unconfigured', event };
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return { delivered: false, reason: 'invalid_endpoint', event };
  }
  if (url.protocol !== 'https:') return { delivered: false, reason: 'insecure_endpoint', event };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const token = clean(process.env.ARANDU_ERROR_MONITORING_TOKEN, 1000);
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(event),
      signal: controller.signal
    });
    return { delivered: response.ok, reason: response.ok ? null : `http_${response.status}`, event };
  } catch (error) {
    return { delivered: false, reason: error?.name === 'AbortError' ? 'timeout' : 'network_error', event };
  } finally {
    clearTimeout(timeout);
  }
}
