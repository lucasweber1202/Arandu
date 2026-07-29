function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function testAdminAccessToken({
  subject = 'admin-user-1',
  aal = 'aal2',
  expiresAt = Math.floor(Date.now() / 1000) + 3600
} = {}) {
  return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: subject, aal, exp: expiresAt })}.test-signature`;
}

export function testAdminUser({
  id = 'admin-user-1',
  email = 'admin@example.com',
  role = 'admin',
  includeUserMetadataRole = false,
  factors = [{ id: 'totp-factor-1', factor_type: 'totp', status: 'verified' }]
} = {}) {
  return {
    id,
    email,
    app_metadata: role ? { arandu_role: role } : {},
    user_metadata: includeUserMetadataRole ? { role: 'admin' } : {},
    factors
  };
}

export function testAdminCookie({
  accessToken = testAdminAccessToken(),
  refreshToken = 'admin-refresh-test',
  expiresAt = Math.floor(Date.now() / 1000) + 3600
} = {}) {
  const session = Buffer.from(JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt
  })).toString('base64url');
  return `arandu_session=${encodeURIComponent(session)}`;
}
