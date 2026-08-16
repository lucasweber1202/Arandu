// Perfis e capacidades de conta da Arandu.
//
// Regra central: `profile_type` vem de `user_metadata`, que a própria pessoa
// consegue alterar pela API do Supabase Auth. Ele é uma **declaração**, nunca
// uma permissão. Toda capacidade aqui deriva de fato verificado no servidor:
//
//   comprador      → sempre; dados próprios via RLS
//   empresa        → possui briefing empresarial vinculado à conta
//   artista        → possui vínculo ativo em `artist_accounts`, criado por curadoria
//
// A administração é um sistema separado: papel em `app_metadata` + MFA,
// tratado em lib/admin-auth.mjs e lib/admin-rbac.mjs. Nada neste arquivo
// concede acesso administrativo.

export class ProfileAccessError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'ProfileAccessError';
    this.status = status;
    this.code = code;
  }
}

// Tipos que a pessoa pode declarar. Não conferem capacidade por si só.
export const DECLARED_PROFILE_TYPES = Object.freeze(['comprador', 'artista', 'empresa', 'arquiteto']);

export const ACCOUNT_CAPABILITIES = Object.freeze({
  ACCOUNT: 'account:read',
  ARTIST_PORTAL: 'artist-portal:read',
  COMPANY_PORTAL: 'company-portal:read'
});

function clean(value) {
  return String(value ?? '').trim();
}

/**
 * Tipo declarado pela pessoa. Serve para orientar navegação e comunicação —
 * jamais para autorizar. Valores desconhecidos caem em `comprador`.
 */
export function declaredProfileType(user) {
  const declared = clean(user?.user_metadata?.profile_type || user?.profile_type).toLowerCase();
  return DECLARED_PROFILE_TYPES.includes(declared) ? declared : 'comprador';
}

/**
 * Monta as capacidades a partir de fatos do banco.
 *
 * @param {object} facts
 * @param {object|null} facts.artistLink linha ativa de `artist_accounts`
 * @param {number} facts.companyBriefCount briefings empresariais da conta
 */
export function resolveCapabilities(facts = {}) {
  const capabilities = [ACCOUNT_CAPABILITIES.ACCOUNT];
  const artistLink = facts.artistLink && clean(facts.artistLink.status) === 'active'
    ? facts.artistLink
    : null;
  if (artistLink && clean(artistLink.artist_id)) {
    capabilities.push(ACCOUNT_CAPABILITIES.ARTIST_PORTAL);
  }
  if (Number(facts.companyBriefCount) > 0) {
    capabilities.push(ACCOUNT_CAPABILITIES.COMPANY_PORTAL);
  }
  return {
    capabilities,
    artistId: artistLink ? clean(artistLink.artist_id) : null
  };
}

export function hasCapability(access, capability) {
  return Array.isArray(access?.capabilities) && access.capabilities.includes(capability);
}

export function requireCapability(access, capability) {
  if (!hasCapability(access, capability)) {
    throw new ProfileAccessError(
      403,
      capability === ACCOUNT_CAPABILITIES.ARTIST_PORTAL
        ? 'Esta conta não está vinculada a um artista aprovado.'
        : 'Esta conta não tem acesso a esta área.',
      'profile_capability_denied'
    );
  }
  return access;
}

// Campos do artista que o próprio artista pode ver no portal. Notas internas de
// curadoria, referências de origem e dados de terceiros ficam de fora.
export const ARTIST_PORTAL_ARTIST_FIELDS = Object.freeze([
  'id', 'name', 'slug', 'city', 'state', 'region', 'status', 'editorial_status',
  'artist_level', 'identity_verified', 'publishing_consent_at', 'created_at', 'updated_at'
]);

// Campos da obra visíveis ao artista dono dela.
export const ARTIST_PORTAL_ARTWORK_FIELDS = Object.freeze([
  'id', 'slug', 'title', 'status', 'editorial_status', 'technique', 'support',
  'year', 'dimensions', 'price', 'price_label', 'published',
  'image_authorized_at', 'created_at', 'updated_at'
]);

export function artistPortalArtwork(row) {
  if (!row || typeof row !== 'object') return null;
  return Object.fromEntries(
    ARTIST_PORTAL_ARTWORK_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]])
  );
}

export function artistPortalArtist(row) {
  if (!row || typeof row !== 'object') return null;
  return Object.fromEntries(
    ARTIST_PORTAL_ARTIST_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]])
  );
}

// Briefing empresarial devolvido à própria empresa: sem campos comerciais
// internos (orçamento negociado, notas de curadoria, atribuição de lead).
export const COMPANY_PORTAL_BRIEF_FIELDS = Object.freeze([
  'id', 'project_type', 'environment', 'deadline', 'status', 'created_at', 'updated_at'
]);

export function companyPortalBrief(row) {
  if (!row || typeof row !== 'object') return null;
  return Object.fromEntries(
    COMPANY_PORTAL_BRIEF_FIELDS.filter((field) => row[field] !== undefined).map((field) => [field, row[field]])
  );
}
