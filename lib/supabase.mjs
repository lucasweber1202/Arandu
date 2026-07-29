function clean(value) {
  return String(value || '').trim();
}

export class SupabaseRequestError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function config() {
  return {
    url: clean(process.env.SUPABASE_URL).replace(/\/$/, ''),
    anonKey: clean(process.env.SUPABASE_ANON_KEY),
    serviceKey: clean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  };
}

export function hasSupabaseAccess(kind = 'admin') {
  const { url, anonKey, serviceKey } = config();
  if (kind === 'public' || kind === 'user') return Boolean(url && anonKey);
  return Boolean(url && serviceKey);
}

async function request(resource, {
  method = 'GET',
  body,
  headers = {},
  prefer,
  accessToken,
  access = 'admin'
} = {}) {
  const { url, anonKey, serviceKey } = config();
  const apiKey = access === 'admin' ? serviceKey : anonKey;
  const bearer = access === 'user' ? clean(accessToken) : apiKey;
  if (!url || !apiKey || !bearer) {
    throw new SupabaseRequestError(503, `Acesso Supabase ${access} não configurado.`);
  }

  const response = await fetch(`${url}/rest/v1/${resource}`, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      ...(prefer === undefined ? {} : { Prefer: prefer }),
      ...headers
    },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }
  if (!response.ok) {
    throw new SupabaseRequestError(
      response.status,
      data?.message || data?.error || `Supabase ${response.status}`,
      data
    );
  }
  return data;
}

export function publicSupabaseRequest(resource, options = {}) {
  return request(resource, { ...options, access: 'public', prefer: options.prefer ?? '' });
}

export function userSupabaseRequest(accessToken, resource, options = {}) {
  return request(resource, {
    ...options,
    access: 'user',
    accessToken,
    prefer: options.prefer ?? 'return=representation'
  });
}

export function adminSupabaseRequest(resource, options = {}) {
  return request(resource, {
    ...options,
    access: 'admin',
    prefer: options.prefer ?? 'return=representation'
  });
}

export function adminSupabaseRpc(name, body, options = {}) {
  return adminSupabaseRequest(`rpc/${name}`, {
    ...options,
    method: 'POST',
    body
  });
}

export function auditRequestHeaders(actor, requestId, justification = '') {
  const headers = {
    'Arandu-Actor-Type': actor?.role ? 'admin' : actor?.type || 'system',
    'Arandu-Actor-Id': clean(actor?.id || actor?.ref).slice(0, 160),
    'Arandu-Actor-Role': clean(actor?.role).slice(0, 40),
    'Arandu-Request-Id': clean(requestId).slice(0, 80)
  };
  const reason = clean(justification).slice(0, 500);
  if (reason) headers['Arandu-Justification'] = reason;
  return headers;
}
