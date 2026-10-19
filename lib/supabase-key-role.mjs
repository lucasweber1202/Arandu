// Structural diagnostics only: decoding a JWT does not authenticate a key,
// verify its signature, or prove that it is accepted by the hosted project.
export function supabaseKeyRole(candidate) {
  const value = String(candidate || '').trim();
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value)) return 'anon';
  if (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(value)) return 'service_role';
  const parts = value.split('.');
  if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]{8,}$/.test(part))) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!header || typeof header.alg !== 'string' || header.alg.toLowerCase() === 'none') return null;
    return ['anon', 'service_role'].includes(payload?.role) ? payload.role : null;
  } catch { return null; }
}
