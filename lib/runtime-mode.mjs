import { PERMANENT_HOSTED_ENVIRONMENTS, TRANSITIONAL_ENVIRONMENTS } from './deployment-topology.mjs';
export { PERMANENT_HOSTED_ENVIRONMENTS, TRANSITIONAL_ENVIRONMENTS };
// Política única de runtime do Arandu.
//
// Uma árvore (`main`), dois ambientes permanentes: Demo e Production.
// Pilot/staging permanece apenas por compatibilidade até o cutover seguro. O que muda entre Oficial, Staging/Pilot
// e Demo é decidido aqui, a partir do ambiente do processo, e em nenhum outro
// lugar: datasource, autenticação, fixtures, integrações e side effects. Telas,
// rotas, regras de domínio, cálculos, RLS e permissões são os mesmos em todos.
//
//   ARANDU_ENV=production           → official  (dados reais, release aprovada)
//   ARANDU_ENV=pilot                → staging   (Supabase de validação, migrations, E2E, RC)
//   ARANDU_ENV=demo                 → demo      (Supabase DEMO com empresa fictícia)
//   ARANDU_DEPLOYMENT_KIND=demo     → demo      (sandbox: fixtures sintéticas no navegador, sem banco)
//   sem nada / preview / local      → development (sem banco real)
//
// Não existe variável paralela (ex.: ARANDU_RUNTIME_MODE): um segundo seletor
// abriria a chance de os dois discordarem. `ARANDU_ENV` é o seletor; este
// módulo é a política. Ambiguidade falha fechada: valor desconhecido nunca vira
// "official" nem libera side effect.
//
// Toda fronteira que antes perguntava `ARANDU_ENV === 'demo'` por conta própria
// pergunta agora a uma capability deste objeto (`runtime.canSendEmail`, ...).

const read = (env, key) => String(env?.[key] ?? '').trim().toLowerCase();

export const RUNTIME_MODES = Object.freeze(['official', 'staging', 'demo', 'development']);
/** Valores aceitos: dois permanentes e compatibilidade transitória com pilot. */
export const SERVER_ENVIRONMENTS = Object.freeze(['demo', ...TRANSITIONAL_ENVIRONMENTS, 'production']);
const MODE_BY_ENV = Object.freeze({ production: 'official', pilot: 'staging', demo: 'demo' });

/** Única branch longa de produto. Todo ambiente hospedado publica a partir dela. */
export const CANONICAL_BRANCH = 'main';

/**
 * Resolve o runtime efetivo. Puro e determinístico: mesma entrada, mesma saída.
 * @param {Record<string, string|undefined>} env
 */
export function resolveRuntime(env = process.env) {
  const declared = read(env, 'ARANDU_ENV');
  const sandbox = read(env, 'ARANDU_DEPLOYMENT_KIND') === 'demo';
  const known = Object.hasOwn(MODE_BY_ENV, declared);
  const invalid = Boolean(declared) && !known;
  // Sandbox e ambiente com banco ao mesmo tempo é configuração contraditória:
  // o build já falha (lib/demo-mode.mjs); aqui ela não libera nada.
  const conflicting = sandbox && known;
  const mode = conflicting || invalid ? 'development' : known ? MODE_BY_ENV[declared] : sandbox ? 'demo' : 'development';
  const datasource = conflicting || invalid ? 'none'
    : known ? 'supabase'
      : sandbox ? 'synthetic-fixtures'
        : 'none';
  const isDemo = mode === 'demo';
  const isOfficial = mode === 'official';
  const isStaging = mode === 'staging';
  const hosted = known && !conflicting;

  // Side effects externos (e-mail real, webhook de cliente, modelo de terceiros)
  // nunca saem da demo, nem com credencial configurada por engano, nem de uma
  // configuração contraditória. Em official/staging continuam dependendo da
  // própria configuração de cada integração (provider, aprovação, segredo); em
  // development/CI só existem mocks, porque não há credencial real.
  const realTenantData = !isDemo && !invalid && !conflicting;
  return Object.freeze({
    mode,
    environment: known && !conflicting ? declared : null,
    datasource,
    misconfigured: invalid || conflicting,
    isDemo,
    isOfficial,
    isStaging,
    isDevelopment: mode === 'development',
    isPermanentEnvironment: hosted && PERMANENT_HOSTED_ENVIRONMENTS.includes(declared),
    isTransitionalEnvironment: hosted && TRANSITIONAL_ENVIRONMENTS.includes(declared),
    isSandbox: isDemo && datasource === 'synthetic-fixtures',
    /** Ambiente hospedado publica somente a partir da branch canônica. */
    expectedBranch: hosted ? CANONICAL_BRANCH : null,
    canSendEmail: realTenantData,
    canDispatchWebhooks: realTenantData,
    canCallExternalProviders: realTenantData,
    canExecuteSideEffects: realTenantData,
    /** Product telemetry is opt-in and only eligible in the permanent real environment. */
    canCollectProductAnalytics: isOfficial && !invalid && !conflicting && read(env, 'VERCEL_ENV') === 'production',
    /** Documento real de cliente nunca entra na demo. */
    canPersistRealDocuments: realTenantData,
    /** Dado fictício: só na demo (seed no banco DEMO ou fixtures do sandbox). */
    canUseSyntheticFixtures: isDemo,
    canUseDemoPersonas: isDemo && datasource === 'supabase',
    /** Mock de IdP/SSO nunca em produção oficial (nem em deploy de produção sem ARANDU_ENV). */
    canUseMockIdentity: (declared || read(env, 'VERCEL_ENV')) !== 'production',
    /** Rótulo visível no shell: o usuário sempre sabe onde está. */
    label: isDemo ? 'Ambiente de demonstração' : isStaging ? 'Ambiente de validação' : null
  });
}

/** Atalho para fronteiras de side effect: devolve o motivo do bloqueio ou null. */
export function sideEffectBlockReason(capability, env = process.env) {
  const runtime = resolveRuntime(env);
  if (runtime[capability] === true) return null;
  if (runtime.isDemo) return 'runtime_demo';
  if (runtime.misconfigured) return 'runtime_misconfigured';
  return 'runtime_development';
}

/** Metadados públicos, sem configuração, credenciais ou identidade de cliente. */
export function releaseIdentity(env = process.env) {
  const { environment, mode, datasource, misconfigured } = resolveRuntime(env);
  const sha = String(env.VERCEL_GIT_COMMIT_SHA || '').trim();
  return Object.freeze({ environment, mode, datasource, misconfigured,
    branch: env.VERCEL_GIT_COMMIT_REF === CANONICAL_BRANCH ? CANONICAL_BRANCH : null,
    commit: /^[a-f0-9]{40}$/.test(sha) ? sha : null });
}
