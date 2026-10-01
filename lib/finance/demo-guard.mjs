// Travas do seed e do reset da demonstração canônica (Vitta Foods).
//
// A demonstração é o produto real ligado a um Supabase DEMO próprio. O seed e o
// reset escrevem nesse banco com a service role, então erram de alvo só se TODAS
// as travas abaixo falharem ao mesmo tempo:
//
//   1. ARANDU_ENV=demo declarado na linha de comando (nunca inferido);
//   2. nunca dentro de um deploy (VERCEL_ENV presente → recusa);
//   3. ARANDU_DEMO_CONFIRM repete o alvo: o ref do projeto Supabase, ou "local"
//      para o Supabase local de scripts/pilot-local;
//   4. o ref não é o legado, o do piloto nem o da produção (lib/finance/pilot-doctor.mjs),
//      e, quando DEMO_SUPABASE_REFS estiver preenchido, precisa estar nele;
//   5. chaves do mesmo projeto, service role de verdade, senha das personas forte;
//   6. no banco: marcador fin_settings.deployment_environment = 'demo', ou banco
//      sem nenhuma organização (primeira semeadura). Banco com dado e sem
//      marcador é recusado — é assim que um banco real se parece;
//   7. na aplicação: depois do primeiro login, /api/finance/organizations precisa
//      responder environment = 'demo' (o deploy alvo está configurado como demo).
//
// As travas 1–5 são puras (testadas em scripts/test-demo-guard.mjs); 6 e 7 são
// conferidas por scripts/demo/seed.mjs antes da primeira escrita.
import { LEGACY_SUPABASE_REFS, PILOT_SUPABASE_REFS, PRODUCTION_SUPABASE_REFS, DEMO_SUPABASE_REFS } from './pilot-doctor.mjs';

export const DEMO_MARKER_KEY = 'deployment_environment';
export const DEMO_MARKER_VALUE = 'demo';
// Domínios reservados para documentação (RFC 2606): nunca recebem e-mail real.
export const DEMO_EMAIL_DOMAINS = Object.freeze([
  'vittafoods.example', 'atlasbank.example', 'nexopay.example', 'orbecapital.example', 'meridianfinancial.example', 'luminapay.example'
]);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export class DemoGuardError extends Error {
  constructor(reasons) {
    super(`Recusado: ${reasons.join(' ')}`);
    this.reasons = reasons;
  }
}

const read = (env, key) => String(env[key] ?? '').trim();

function claims(key) {
  try { return JSON.parse(Buffer.from(String(key || '').split('.')[1] || '', 'base64url').toString('utf8')) || {}; } catch { return {}; }
}
function keyRole(key) {
  const value = String(key || '');
  if (value.startsWith('sb_secret_')) return 'service_role';
  if (value.startsWith('sb_publishable_')) return 'anon';
  return claims(value).role || null;
}

/** Identidade do alvo: "local" para o Supabase local, ref para *.supabase.co, null para o resto. */
export function demoTargetIdentity(supabaseUrl) {
  try {
    const url = new URL(String(supabaseUrl || ''));
    const host = url.hostname.toLowerCase();
    if (LOCAL_HOSTS.has(host)) return { kind: 'local', ref: 'local' };
    if (url.protocol === 'https:' && /^[a-z0-9]{20}\.supabase\.co$/.test(host)) return { kind: 'hosted', ref: host.split('.')[0] };
    return null;
  } catch {
    return null;
  }
}

/** Travas 1–5. Devolve a configuração validada ou lança DemoGuardError com todos os motivos. */
export function assertDemoTarget(env = process.env) {
  const reasons = [];
  if (read(env, 'ARANDU_ENV').toLowerCase() !== 'demo') reasons.push('defina ARANDU_ENV=demo explicitamente; o seed da demonstração nunca roda em outro ambiente.');
  if (read(env, 'VERCEL_ENV')) reasons.push('VERCEL_ENV presente: o seed da demonstração nunca roda dentro de um deploy.');

  const supabaseUrl = read(env, 'SUPABASE_URL').replace(/\/+$/, '');
  const target = demoTargetIdentity(supabaseUrl);
  if (!target) reasons.push('SUPABASE_URL precisa ser https://<ref>.supabase.co ou o Supabase local (localhost).');
  const confirm = read(env, 'ARANDU_DEMO_CONFIRM');
  if (target && confirm !== target.ref) {
    reasons.push(`ARANDU_DEMO_CONFIRM precisa repetir o alvo (${target.kind === 'local' ? '"local"' : 'o ref do projeto Supabase DEMO'}).`);
  }
  if (target?.kind === 'hosted') {
    if (LEGACY_SUPABASE_REFS.includes(target.ref)) reasons.push('o alvo é o projeto legado de arte.');
    if (PILOT_SUPABASE_REFS.includes(target.ref)) reasons.push('o alvo é o Supabase do piloto, que tem dados reais.');
    if (PRODUCTION_SUPABASE_REFS.includes(target.ref)) reasons.push('o alvo é o Supabase da produção.');
    if (DEMO_SUPABASE_REFS.length && !DEMO_SUPABASE_REFS.includes(target.ref)) reasons.push('o alvo não está em DEMO_SUPABASE_REFS (lib/finance/pilot-doctor.mjs).');
  }

  const anonKey = read(env, 'SUPABASE_ANON_KEY');
  if (!anonKey || keyRole(anonKey) === 'service_role') reasons.push('SUPABASE_ANON_KEY ausente ou é chave de serviço.');
  const serviceKey = read(env, 'SUPABASE_SERVICE_ROLE_KEY');
  // A chave de servidor nunca é substituída por outra: sem ela, o seed não roda.
  if (keyRole(serviceKey) !== 'service_role') reasons.push('SUPABASE_SERVICE_ROLE_KEY ausente ou não é chave de serviço.');
  for (const [name, key] of [['SUPABASE_SERVICE_ROLE_KEY', serviceKey], ['SUPABASE_ANON_KEY', anonKey]]) {
    const ref = claims(key).ref;
    if (target?.kind === 'hosted' && ref && ref !== target.ref) reasons.push(`${name} pertence a outro projeto Supabase.`);
  }

  const appUrl = read(env, 'ARANDU_DEMO_APP_URL').replace(/\/+$/, '');
  let app = null;
  try { app = new URL(appUrl); } catch { app = null; }
  if (!app || app.protocol !== 'https:') reasons.push('ARANDU_DEMO_APP_URL precisa ser a URL https da aplicação de demonstração (ARANDU_ENV=demo).');

  const password = read(env, 'ARANDU_DEMO_PASSWORD');
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    reasons.push('ARANDU_DEMO_PASSWORD precisa ter 12+ caracteres com maiúscula, minúscula e número (nunca versionada).');
  }

  if (reasons.length) throw new DemoGuardError(reasons);
  return { supabaseUrl, target, serviceKey, anonKey, appUrl, password };
}

/** Trava 6: estado do banco antes da primeira escrita. */
export function assertDemoDatabase({ marker, organizations }) {
  if (marker === DEMO_MARKER_VALUE) return 'marked';
  if (marker) throw new DemoGuardError([`o banco está marcado como "${marker}", não como demonstração.`]);
  if (organizations === 0) return 'empty';
  throw new DemoGuardError([`o banco tem ${organizations ?? 'um número desconhecido de'} organização(ões) e nenhum marcador de demonstração: não é um banco de demonstração.`]);
}

/** Trava 7: a aplicação alvo declara ARANDU_ENV=demo. */
export function assertDemoApplication(environment) {
  if (environment !== DEMO_MARKER_VALUE) {
    throw new DemoGuardError(['a aplicação em ARANDU_DEMO_APP_URL não está configurada com ARANDU_ENV=demo.']);
  }
}

export function isDemoEmail(email) {
  const domain = String(email || '').toLowerCase().split('@')[1] || '';
  return DEMO_EMAIL_DOMAINS.includes(domain);
}
