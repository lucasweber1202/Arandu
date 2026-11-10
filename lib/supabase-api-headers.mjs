// Supabase sb_publishable_/sb_secret_ are opaque API keys, NOT JWTs.
// Auth user sessions still use Authorization: Bearer <user access JWT>.
// Legacy anon/service_role JWT keys keep the old Bearer behavior.
export function isOpaqueSupabaseApiKey(apiKey) {
  return /^sb_(?:publishable|secret)_[A-Za-z0-9_-]{20,}$/.test(String(apiKey || '').trim());
}

export function supabaseApiKeyHeaders(apiKey, { accessToken = null, headers = {} } = {}) {
  const key = String(apiKey || '').trim();
  const userJwt = String(accessToken || '').trim();
  return {
    apikey: key,
    ...(userJwt ? { Authorization: `Bearer ${userJwt}` }
      : isOpaqueSupabaseApiKey(key) ? {} : { Authorization: `Bearer ${key}` }),
    ...headers
  };
}
