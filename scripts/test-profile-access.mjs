import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  ACCOUNT_CAPABILITIES,
  ARTIST_PORTAL_ARTIST_FIELDS,
  ARTIST_PORTAL_ARTWORK_FIELDS,
  COMPANY_PORTAL_BRIEF_FIELDS,
  DECLARED_PROFILE_TYPES,
  ProfileAccessError,
  artistPortalArtist,
  artistPortalArtwork,
  companyPortalBrief,
  declaredProfileType,
  hasCapability,
  requireCapability,
  resolveCapabilities
} from '../lib/profile-access.mjs';

const root = process.cwd();

// --- Declaração não é permissão ------------------------------------------

assert.equal(declaredProfileType({ user_metadata: { profile_type: 'artista' } }), 'artista');
assert.equal(declaredProfileType({ user_metadata: { profile_type: 'admin' } }), 'comprador');
assert.equal(declaredProfileType({ user_metadata: { profile_type: 'curadoria' } }), 'comprador');
assert.equal(declaredProfileType({}), 'comprador');
assert.equal(declaredProfileType(null), 'comprador');
assert.ok(!DECLARED_PROFILE_TYPES.includes('admin'));
assert.ok(!DECLARED_PROFILE_TYPES.includes('curadoria'));

// O ponto central: declarar-se artista não concede o portal do artista.
const selfDeclared = resolveCapabilities({ artistLink: null, companyBriefCount: 0 });
assert.deepEqual(selfDeclared.capabilities, [ACCOUNT_CAPABILITIES.ACCOUNT]);
assert.equal(selfDeclared.artistId, null);
assert.ok(!hasCapability(selfDeclared, ACCOUNT_CAPABILITIES.ARTIST_PORTAL));

// --- Capacidades a partir de fatos do banco -------------------------------

const linked = resolveCapabilities({
  artistLink: { artist_id: 'artista-1', status: 'active' },
  companyBriefCount: 0
});
assert.ok(hasCapability(linked, ACCOUNT_CAPABILITIES.ARTIST_PORTAL));
assert.equal(linked.artistId, 'artista-1');

// Vínculo revogado não concede nada.
const revoked = resolveCapabilities({
  artistLink: { artist_id: 'artista-1', status: 'revoked' },
  companyBriefCount: 0
});
assert.ok(!hasCapability(revoked, ACCOUNT_CAPABILITIES.ARTIST_PORTAL));
assert.equal(revoked.artistId, null);

// Vínculo ativo sem artista é inconsistente e não concede acesso.
const emptyLink = resolveCapabilities({ artistLink: { artist_id: '', status: 'active' }, companyBriefCount: 0 });
assert.ok(!hasCapability(emptyLink, ACCOUNT_CAPABILITIES.ARTIST_PORTAL));

const company = resolveCapabilities({ artistLink: null, companyBriefCount: 3 });
assert.ok(hasCapability(company, ACCOUNT_CAPABILITIES.COMPANY_PORTAL));
assert.ok(!hasCapability(company, ACCOUNT_CAPABILITIES.ARTIST_PORTAL));

assert.throws(
  () => requireCapability(selfDeclared, ACCOUNT_CAPABILITIES.ARTIST_PORTAL),
  (error) => error instanceof ProfileAccessError
    && error.status === 403
    && error.code === 'profile_capability_denied'
);
assert.doesNotThrow(() => requireCapability(linked, ACCOUNT_CAPABILITIES.ARTIST_PORTAL));

// --- Minimização de dados -------------------------------------------------

const artwork = artistPortalArtwork({
  id: 'obra-1',
  title: 'Obra',
  status: 'available',
  price: 4200,
  source_reference: 'contrato interno',
  curatorial_reading: 'nota interna da curadoria',
  payload: { interno: true }
});
assert.equal(artwork.title, 'Obra');
assert.equal(artwork.source_reference, undefined, 'Referência interna não pode ir ao portal.');
assert.equal(artwork.curatorial_reading, undefined, 'Leitura curatorial não pode ir ao portal.');
assert.equal(artwork.payload, undefined, 'Payload bruto não pode ir ao portal.');

const artist = artistPortalArtist({
  id: 'artista-1',
  name: 'Artista',
  status: 'approved',
  source_reference: 'indicação interna',
  legal_name: 'Nome legal',
  payload: { interno: true }
});
assert.equal(artist.name, 'Artista');
assert.equal(artist.source_reference, undefined);
assert.equal(artist.legal_name, undefined, 'Nome legal não é devolvido pelo portal.');

const brief = companyPortalBrief({
  id: 'brief-1',
  status: 'qualified',
  project_type: 'hotelaria',
  budget: 'R$ 90.000',
  email: 'contato@example.com',
  message: 'mensagem original'
});
assert.equal(brief.status, 'qualified');
assert.equal(brief.budget, undefined, 'Orçamento interno não volta ao portal.');
assert.equal(brief.email, undefined);
assert.equal(brief.message, undefined);

for (const field of ['payload', 'source_reference', 'legal_name']) {
  assert.ok(!ARTIST_PORTAL_ARTIST_FIELDS.includes(field));
}
for (const field of ['payload', 'source_reference', 'curatorial_reading', 'summary']) {
  assert.ok(!ARTIST_PORTAL_ARTWORK_FIELDS.includes(field));
}
for (const field of ['budget', 'message', 'email', 'whatsapp', 'name', 'company']) {
  assert.ok(!COMPANY_PORTAL_BRIEF_FIELDS.includes(field), `Briefing não deve devolver ${field}.`);
}

// --- Superfície da API ----------------------------------------------------

const apiSource = [
  path.join(root, 'api/[...path].js'),
  ...fs.readdirSync(path.join(root, 'lib/api/domains')).filter((name) => name.endsWith('.mjs')).map((name) => path.join(root, 'lib/api/domains', name))
].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
assert.ok(apiSource.includes('resolveAccountAccess'), 'A API precisa resolver capacidades no servidor.');
assert.ok(
  apiSource.includes('requireCapability(access, ACCOUNT_CAPABILITIES.ARTIST_PORTAL)'),
  'O portal do artista precisa exigir capacidade verificada.'
);
assert.ok(
  apiSource.includes('link_artist_account_atomic') && apiSource.includes('revoke_artist_account_atomic'),
  'A API precisa usar as RPCs de vínculo.'
);

// Nenhuma rota pode autorizar a partir do tipo declarado.
const declaredUses = [...apiSource.matchAll(/declaredProfileType\(/g)].length;
assert.equal(declaredUses, 1, 'declaredProfileType só deve ser usado para descrever a conta, uma vez.');
assert.ok(
  !/requireCapability\([^)]*declaredProfileType/.test(apiSource),
  'Autorização não pode derivar do tipo declarado.'
);

const sql = fs.readFileSync(path.join(root, 'docs/supabase-profile-access.sql'), 'utf8');
assert.ok(
  sql.includes("revoke all on public.artist_accounts from anon, authenticated"),
  'O vínculo não pode ficar gravável por clientes.'
);
assert.ok(
  sql.includes("v_artist.status not in ('approved', 'published')"),
  'O vínculo precisa exigir artista aprovado.'
);
assert.ok(sql.includes('uq_artist_accounts_active_artist'), 'Um artista não pode ter dois vínculos ativos.');

process.env.SUPABASE_URL = 'https://arandu-profile-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-profile-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-profile-test';
delete process.env.VERCEL_ENV;
delete process.env.ARANDU_DISTRIBUTED_RATE_LIMIT;

const { default: handler } = await import(`../api/[...path].js?profile-test=${Date.now()}`);

function req(method, url, body, headers = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const request = Readable.from(chunks);
  request.method = method;
  request.url = url;
  request.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  request.socket = { remoteAddress: '127.0.0.12' };
  return request;
}

function res() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value = '') { this.body = String(value); }
  };
}

async function call(method, url, body, headers) {
  const response = res();
  await handler(req(method, url, body, headers), response);
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

for (const url of ['/api/portal/artist', '/api/portal/company']) {
  const anonymous = await call('GET', url);
  assert.equal(anonymous.status, 401, `${url} deve exigir conta autenticada.`);
}

const portalMethod = await call('POST', '/api/portal/artist', {});
assert.equal(portalMethod.status, 405, 'Portal é somente leitura.');

for (const method of ['GET', 'POST', 'DELETE']) {
  const anonymous = await call(method, '/api/artist-accounts', { user_id: 'x', artist_id: 'y' });
  assert.ok(
    [401, 403].includes(anonymous.status),
    `Gestão de vínculo (${method}) exige sessão administrativa, recebeu ${anonymous.status}.`
  );
}

const unknownArea = await call('GET', '/api/portal/inexistente');
assert.equal(unknownArea.status, 401, 'Área desconhecida não deve vazar antes da autenticação.');

// --- Escalada de privilégio pelo tipo declarado ---------------------------

function sessionCookie() {
  const value = Buffer.from(JSON.stringify({
    access_token: 'access-profile-test',
    refresh_token: 'refresh-profile-test',
    expires_at: Math.floor(Date.now() / 1000) + 3600
  })).toString('base64url');
  return `arandu_session=${encodeURIComponent(value)}`;
}

const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

const originalFetch = global.fetch;
try {
  // A pessoa alterou o próprio user_metadata para "artista" via Supabase Auth.
  // Sem vínculo em artist_accounts, o portal precisa continuar fechado.
  global.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) {
      return jsonResponse({
        id: 'user-declara',
        email: 'declarada@example.com',
        user_metadata: { full_name: 'Declarada', profile_type: 'artista' }
      });
    }
    if (value.includes('/artist_accounts?')) return jsonResponse([]);
    if (value.includes('/company_briefs?')) return jsonResponse([]);
    throw new Error(`URL inesperada: ${value}`);
  };
  const escalation = await call('GET', '/api/portal/artist', undefined, { cookie: sessionCookie() });
  assert.equal(escalation.status, 403, 'Declarar-se artista não pode abrir o portal do artista.');
  assert.equal(escalation.body.code, 'profile_capability_denied');

  // Com vínculo ativo criado pela curadoria, o portal abre e devolve só o próprio acervo.
  const requested = [];
  global.fetch = async (url) => {
    const value = String(url);
    requested.push(value);
    if (value.endsWith('/auth/v1/user')) {
      return jsonResponse({
        id: 'user-vinculada',
        email: 'vinculada@example.com',
        user_metadata: { full_name: 'Vinculada', profile_type: 'comprador' }
      });
    }
    if (value.includes('/artist_accounts?')) {
      return jsonResponse([{ artist_id: 'artista-1', status: 'active', linked_at: '2026-08-01T00:00:00Z' }]);
    }
    if (value.includes('/company_briefs?')) return jsonResponse([]);
    if (value.includes('/artists?')) {
      return jsonResponse([{ id: 'artista-1', name: 'Artista Um', status: 'published', legal_name: 'Nome Legal', source_reference: 'interno' }]);
    }
    if (value.includes('/artworks?')) {
      return jsonResponse([{ id: 'obra-1', title: 'Obra Um', status: 'available' }]);
    }
    if (value.includes('/operational_status_history?')) {
      return jsonResponse([{ from_status: 'approved', to_status: 'published', created_at: '2026-08-02T00:00:00Z' }]);
    }
    throw new Error(`URL inesperada: ${value}`);
  };
  const portal = await call('GET', '/api/portal/artist', undefined, { cookie: sessionCookie() });
  assert.equal(portal.status, 200, 'Vínculo ativo deve abrir o portal, mesmo com perfil declarado comprador.');
  assert.equal(portal.body.artist.name, 'Artista Um');
  assert.equal(portal.body.artist.legal_name, undefined, 'Portal não devolve nome legal.');
  assert.equal(portal.body.artist.source_reference, undefined, 'Portal não devolve referência interna.');
  assert.equal(portal.body.artworks.length, 1);
  assert.equal(portal.body.statusTrail.length, 1);
  // O acervo consultado precisa ser filtrado pelo artista do vínculo.
  assert.ok(
    requested.some((url) => url.includes('artworks?artist_id=eq.artista-1')),
    'A busca de obras precisa ser restrita ao artista vinculado.'
  );

  // Vínculo revogado fecha o portal de novo.
  global.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) {
      return jsonResponse({ id: 'user-revogada', email: 'revogada@example.com', user_metadata: {} });
    }
    if (value.includes('/artist_accounts?')) return jsonResponse([]);
    if (value.includes('/company_briefs?')) return jsonResponse([]);
    throw new Error(`URL inesperada: ${value}`);
  };
  const revokedAccess = await call('GET', '/api/portal/artist', undefined, { cookie: sessionCookie() });
  assert.equal(revokedAccess.status, 403, 'Sem vínculo ativo o portal fecha.');
} finally {
  global.fetch = originalFetch;
}

console.log('Profile access tests approved.');
console.log(`Capacidades: ${Object.keys(ACCOUNT_CAPABILITIES).length} · Perfis declaráveis: ${DECLARED_PROFILE_TYPES.length}`);
