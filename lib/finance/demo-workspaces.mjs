// Workspaces isolados por visitante da Demo canônica (docs/demo/VISITOR_ISOLATION.md).
//
// Cada workspace é uma Vitta Foods inteira montada pelo seed real com contas
// sintéticas próprias: `<pessoa>+ws-<slug>@<domínio>.example`. O visitante
// recebe um workspace pronto (fin_demo_workspace_claim) e um cookie HttpOnly
// `arandu_demo_ws=<id>.<token>`; o banco guarda só o SHA-256 do token. Trocar de
// persona reabre o MESMO workspace (fin_demo_workspace_resume) e autentica a conta
// daquela persona nele: o navegador nunca escolhe usuário, organização ou papel.
//
// Senhas: cada conta de workspace tem senha própria, derivada no servidor por
// HMAC de ARANDU_DEMO_PASSWORD com o e-mail. Nada é armazenado nem enviado ao
// navegador; o seed e o login calculam a mesma derivação.
import crypto from 'node:crypto';

export const WORKSPACE_COOKIE = 'arandu_demo_ws';
export const BASELINE_VERSION = 'vitta-2026-10';
export const WORKSPACE_LIMITS = Object.freeze({
  idleMinutes: 240,          // 4 h sem uso
  lifetimeMinutes: 1440,     // 24 h no total
  maxActive: 25,             // teto de workspaces reivindicados ao mesmo tempo
  claimsPerHourPerOrigin: 4  // novos workspaces por origem de requisição
});

const SLUG = /^[a-f0-9]{10}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const newSlug = () => crypto.randomBytes(5).toString('hex');
export const isSlug = (value) => SLUG.test(String(value || ''));

/** E-mail da persona dentro do workspace (endereçamento +ws, domínio .example inalterado). */
export function workspaceEmail(baseEmail, slug) {
  if (!isSlug(slug)) throw new Error('slug de workspace inválido');
  const [local, domain] = String(baseEmail).toLowerCase().split('@');
  if (!local || !domain || local.includes('+')) throw new Error('e-mail base de persona inválido');
  return `${local}+ws-${slug}@${domain}`;
}

/** Slug do workspace a que a conta pertence, ou null (baseline e contas reais). */
export function workspaceSlugFromEmail(email) {
  const match = /^[^@+]+\+ws-([a-f0-9]{10})@[^@]+$/.exec(String(email || '').toLowerCase());
  return match ? match[1] : null;
}

/** Senha da conta de workspace: derivada, estável, nunca armazenada; cumpre a política de senha. */
export function workspacePassword(secret, email) {
  const base = String(secret || '');
  if (base.length < 12) throw new Error('segredo da demonstração ausente');
  const digest = crypto.createHmac('sha256', base).update(`arandu-demo-workspace:${String(email).toLowerCase()}`).digest('base64url');
  return `Ws-${digest.slice(0, 32)}-9a`;
}

export const newClaimToken = () => crypto.randomBytes(32).toString('base64url');
export const tokenHash = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/** Lê `<id>.<token>`; qualquer outra forma é ignorada (nunca confiável sozinha: o banco confere o hash). */
export function parseWorkspaceCookie(value) {
  const [id, token, extra] = String(value || '').split('.');
  if (extra !== undefined || !UUID.test(id || '') || !TOKEN.test(token || '')) return null;
  return { id, token };
}

export function workspaceCookie(id, token, maxAgeSeconds) {
  if (!UUID.test(id) || !TOKEN.test(token)) throw new Error('cookie de workspace inválido');
  const maxAge = Math.max(60, Math.min(Number(maxAgeSeconds) || 0, WORKSPACE_LIMITS.lifetimeMinutes * 60));
  return `${WORKSPACE_COOKIE}=${id}.${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;
}

export const clearWorkspaceCookie = () => `${WORKSPACE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;

/** E-mail da persona escolhida no workspace, só se a chave existir no mapa gravado pelo seed. */
export function personaEmailIn(workspace, key) {
  const personas = workspace?.personas && typeof workspace.personas === 'object' ? workspace.personas : {};
  if (!Object.hasOwn(personas, key)) return null;
  const email = String(personas[key] || '');
  return workspaceSlugFromEmail(email) === workspace.slug ? email : null;
}
