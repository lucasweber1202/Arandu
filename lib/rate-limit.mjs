import { createHash } from 'node:crypto';
import { adminSupabaseRpc } from './supabase.mjs';

const MEMORY_LIMITS = new Map();

export class RateLimitError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function enabled(value) {
  return ['1', 'true', 'yes', 'sim'].includes(String(value || '').trim().toLowerCase());
}

function fingerprint(req, scope, identity = '') {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const address = forwarded || req.socket?.remoteAddress || 'unknown';
  return createHash('sha256')
    .update(`${scope}:${address}:${String(identity || '').trim().toLowerCase()}`)
    .digest('hex');
}

function consumeMemory(key, limit, windowMs) {
  const now = Date.now();
  if (MEMORY_LIMITS.size > 2000) {
    for (const [entryKey, entry] of MEMORY_LIMITS) {
      if (entry.resetAt <= now) MEMORY_LIMITS.delete(entryKey);
    }
  }
  const entry = MEMORY_LIMITS.get(key);
  if (!entry || entry.resetAt <= now) {
    MEMORY_LIMITS.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > limit) {
    throw new RateLimitError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', 'rate_limit_exceeded');
  }
}

export async function enforceSensitiveRateLimit(req, scope, {
  limit,
  windowMs,
  identity = ''
}) {
  const safeLimit = Number(limit);
  const safeWindow = Number(windowMs);
  if (!scope || !Number.isInteger(safeLimit) || safeLimit < 1 || !Number.isFinite(safeWindow) || safeWindow < 1000) {
    throw new TypeError('Configuração de rate limit inválida.');
  }

  const key = fingerprint(req, scope, identity);
  const distributed = enabled(process.env.ARANDU_DISTRIBUTED_RATE_LIMIT) || Boolean(process.env.VERCEL_ENV);
  if (!distributed) return consumeMemory(key, safeLimit, safeWindow);

  let allowed;
  try {
    allowed = await adminSupabaseRpc('consume_rate_limit', {
      p_scope: scope,
      p_fingerprint: key,
      p_limit: safeLimit,
      p_window_seconds: Math.max(1, Math.ceil(safeWindow / 1000))
    });
  } catch {
    throw new RateLimitError(
      503,
      'A proteção contra abuso está temporariamente indisponível.',
      'rate_limit_unavailable'
    );
  }
  if (allowed !== true) {
    throw new RateLimitError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', 'rate_limit_exceeded');
  }
}
