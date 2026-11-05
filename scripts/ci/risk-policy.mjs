// Política fechada de CI proporcional ao risco (v6.2).
//
// A — apresentação simples: estática, build e smoke de superfície.
// B — frontend e lógica pura VERIFICADA: build, contratos, testes puros e E2E
//     Chromium desktop/mobile das jornadas alcançadas pelo grafo de imports.
// C — backend não crítico (API/domínio): caminho B ampliado a todas as suítes
//     Chromium + PostgreSQL real (schema, RLS, rollback, transações). Sem
//     Recovery real, Firefox/WebKit integrais e Demo Integration.
// D — crítico: Auth, sessão, permissões, RLS, Storage, Recovery, migrations,
//     integridade econômica, deploy, workflows/CI, governança, documentos
//     normativos e QUALQUER caminho desconhecido. Matriz integral + Demo
//     Integration efêmera.
// A classe mais alta prevalece. Renomes avaliam origem e destino; remoções
// contam. Pureza é verificada no conteúdo do candidato, não presumida pelo nome.
const rank = { A: 0, B: 1, C: 2, D: 3 };

export const PATHS = Object.freeze({ A: 'fast', B: 'fast', C: 'backend', D: 'full' });
export const REQUIRED = Object.freeze({
  A: ['static-build', 'targeted-browser'],
  B: ['static-build', 'pure-tests', 'targeted-browser'],
  C: ['static-build', 'pure-tests', 'targeted-browser', 'database'],
  D: ['static-build', 'database', 'recovery', 'deploy-boundaries', 'validate', 'presentation', 'demo-integration'],
});

// Termos críticos no caminho sempre vencem qualquer allowlist.
const CRITICAL = /(?:auth|session|cookie|permission|rls|recovery|restore|backup|storage|deploy|migration|rollback|economics|product-terms|policy|security|threat|secret|sso|supabase|release|cutover|production|runbook|governance|ruleset|branch[-_]protection|vercel|incident|merge-gate|data-classification|retention)/i;
const CRITICAL_PREFIX = /^(?:\.github\/|scripts\/ci\/|scripts\/ci-demo\/|docs\/rollback\/|supabase\/)/;
const CRITICAL_FILE = /^(?:package(?:-lock)?\.json|\.npmrc|vercel\.json|vite\.config\.[cm]?js|playwright(?:\.[a-z]+)?\.config\.js|CLAUDE\.md|AGENTS\.md|CONTRIBUTING\.md|SECURITY\.md)$/;
const SQL = /\.sql$/i;

// Módulos de lib/finance cuja função é organizar/apresentar estados já
// autorizados. Só ficam em B se o conteúdo do candidato passar em isPureModule.
export const PURE_MODULES = Object.freeze(new Set([
  'lib/finance/negotiation-next-step.mjs',
  'lib/finance/negotiation-board.mjs',
  'lib/finance/central-signals.mjs',
  'lib/finance/format.mjs',
  'lib/finance/presentation.mjs',
  'lib/finance/command-center.mjs',
  'lib/finance/navigation.mjs',
]));
export const PRESENTER = /^lib\/finance\/[a-z0-9-]+-presenter\.mjs$/;

// Documentação funcional/explicativa (A). Normativos, CI, release, Recovery,
// Production, segurança e governança não estão aqui e caem em D.
const FUNCTIONAL_DOCS = new Set([
  'FINANCIAL_NEGOTIATION_BOARD', 'FINANCIAL_NEGOTIATION_CONTINUITY_V2', 'FINANCIAL_CENTRAL_360_SIGNALS',
  'FINANCIAL_CRM_WORKSPACE_UI', 'FINANCIAL_CRM_V1', 'FINANCIAL_COVENANTS', 'FINANCIAL_FEE_INTELLIGENCE',
  'FINANCIAL_GRAPH', 'FINANCIAL_IMPLEMENTATION', 'FINANCIAL_OPPORTUNITY_ENGINE', 'FINANCIAL_PROVIDER_PERFORMANCE',
  'FINANCIAL_PROVIDER_QUALIFICATION', 'FINANCIAL_SPEND_INTELLIGENCE', 'FINANCIAL_VALUE_INTELLIGENCE_EXECUTIVE',
  'FINANCIAL_VALUE_REALIZATION', 'FINANCIAL_PROCUREMENT_PRODUCT', 'FINANCIAL_DOCUMENT_INTELLIGENCE',
  'FINANCIAL_UI_ARCHITECTURE', 'FINANCIAL_DEMO_EXPERIENCE', 'EXTERNAL_FINANCIAL_PROPOSALS_V37',
  'FINANCIAL_INSTITUTIONAL_DECLINE_V2', 'FINANCIAL_PASSPORT_ENTITIES', 'FINANCIAL_EMAIL_TEMPLATES',
  'PUBLIC_TOUR', 'DEMO_WORK_OS_V3', 'DEMO_WORK_OS_V3_REVIEW', 'DEMO_WORKSPACE_V2_REVIEW',
]);
const FUNCTIONAL_DOC = /^docs\/(?:(?:guides|help)\/[a-z0-9-]+\.md|claude-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.md)$/;

// Conteúdo proibido num módulo puro: rede, ambiente, DOM, armazenamento,
// escrita, avaliação dinâmica. Import só relativo e dentro de lib/finance.
const IMPURE_TOKENS = /\bfetch\s*\(|\bprocess\b|\bglobalThis\b|\bwindow\b|\bdocument\.|localStorage|sessionStorage|indexedDB|XMLHttpRequest|WebSocket|\beval\s*\(|\bnew\s+Function\b|\bimport\s*\(|\brequire\s*\(|supabase|\.rpc\s*\(|\.insert\s*\(|\.upsert\s*\(|\.from\s*\(\s*['"`]/;
const IMPORT_SPEC = /(?:\bfrom\s+|^\s*import\s+|\bexport\s+\*\s+from\s+)['"]([^'"]+)['"]/gm;

export function isPureModule(source) {
  if (typeof source !== 'string') return false;
  if (IMPURE_TOKENS.test(source)) return false;
  for (const [, spec] of source.matchAll(IMPORT_SPEC)) {
    if (!/^\.\/[a-z0-9-]+\.mjs$/.test(spec)) return false;
    if (CRITICAL.test(spec)) return false;
  }
  return true;
}

// Teste de lógica pura: só asserções, leitura de arquivo e módulos de
// lib/finance não críticos. Processos, rede, ambiente e escrita ficam fora.
const TEST_IMPURE = /child_process|\bspawn|\bexec(?:File)?(?:Sync)?\s*\(|writeFile|appendFile|\brmSync|\bunlink|mkdir|\bfetch\s*\(|process\.env|node:(?:net|http|https|dns|worker_threads|child_process)|supabase|playwright/;
const ALLOWED_TEST_IMPORT = /^(?:node:assert(?:\/strict)?|node:test|node:fs|\.\.\/lib\/finance\/[a-z0-9-]+\.mjs)$/;
export function isPureTest(source) {
  if (typeof source !== 'string' || TEST_IMPURE.test(source)) return false;
  let libImports = 0;
  for (const [, spec] of source.matchAll(IMPORT_SPEC)) {
    if (!ALLOWED_TEST_IMPORT.test(spec) || CRITICAL.test(spec)) return false;
    if (spec.startsWith('../lib/')) libImports++;
  }
  const fsImport = source.match(/import\s*\{([^}]*)\}\s*from\s*['"]node:fs['"]/);
  if (/from\s*['"]node:fs['"]/.test(source) && (!fsImport || fsImport[1].split(',').some((n) => !/^\s*(?:readFileSync|existsSync)?\s*$/.test(n)))) return false;
  return libImports > 0;
}

function classifyPath(path, { status, readSource }) {
  if (CRITICAL_PREFIX.test(path) || CRITICAL_FILE.test(path) || SQL.test(path) || CRITICAL.test(path)) {
    return { risk: 'D', why: 'critical surface' };
  }
  const removed = status === 'removed';
  // Passive raster test evidence is not a contract or executable document.
  // Critical path terms above still win. SVG/HTML/JSON/Markdown stay closed.
  if (/^docs\/evidence\/[a-z0-9_./-]+\.(?:png|jpg|webp)$/.test(path)) return { risk: 'A', why: 'passive raster test evidence' };
  if (/^(?:README|CHANGELOG)\.md$/.test(path)) return { risk: 'A', why: 'explanatory doc' };
  const doc = path.match(/^docs\/([A-Za-z0-9_]+)\.md$/);
  if ((doc && FUNCTIONAL_DOCS.has(doc[1])) || FUNCTIONAL_DOC.test(path)) return { risk: 'A', why: 'functional doc' };
  if (/^finance\/(?:style\.css|src\/icons\.svg)$/.test(path)) return { risk: 'A', why: 'style/asset' };
  if (/^finance\/(?:styles|assets)\/.+\.(?:css|svg|png|jpg|webp)$/.test(path)) return { risk: 'A', why: 'style/asset' };
  if (/^finance\/src\/.+\.js$/.test(path)) return { risk: 'B', why: 'view/component' };
  if (/^tests\/e2e\/[a-z0-9-]+\.(?:spec\.)?js$/.test(path)) return { risk: 'B', why: 'browser test' };
  if (PURE_MODULES.has(path) || PRESENTER.test(path)) {
    if (removed) return { risk: 'B', why: 'pure module removed (build + all suites)' };
    return isPureModule(readSource(path))
      ? { risk: 'B', why: 'verified pure module' }
      : { risk: 'D', why: 'listed pure module violates purity contract' };
  }
  if (/^scripts\/test-[a-z0-9-]+\.mjs$/.test(path)) {
    if (!removed && isPureTest(readSource(path))) return { risk: 'B', why: 'verified pure-logic test' };
    return { risk: 'D', why: 'test script with side effects or unknown scope' };
  }
  if (/^lib\/(?:api|finance)\/.+\.mjs$/.test(path) || /^api\/.+\.js$/.test(path)) return { risk: 'C', why: 'API/domain' };
  return { risk: 'D', why: 'unknown path (closed policy)' };
}

export function classifyChanges(changes, { readSource = () => null } = {}) {
  if (!Array.isArray(changes) || changes.length === 0) throw new Error('Changes unavailable');
  let risk = 'A';
  const reasons = [];
  for (const change of changes) {
    if (!['added', 'modified', 'removed', 'renamed'].includes(change.status)) throw new Error('Unknown change status');
    const paths = change.status === 'renamed' ? [change.filename, change.previous_filename] : [change.filename];
    paths.forEach((path, index) => {
      if (typeof path !== 'string' || !path || path.startsWith('/') || path.split('/').includes('..')) throw new Error('Invalid change path');
      const previous = change.status === 'renamed' && index === 1;
      const result = classifyPath(path, { status: previous ? 'removed' : change.status, readSource });
      reasons.push({ path, status: change.status, ...(previous ? { previous: true } : {}), risk: result.risk, why: result.why });
      if (rank[result.risk] > rank[risk]) risk = result.risk;
    });
  }
  return { risk, path: PATHS[risk], reasons, required: REQUIRED[risk] };
}

export function evaluateGate({ plan, results, expectedSha, actualSha }) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha || '') || expectedSha !== actualSha) throw new Error('Candidate SHA mismatch');
  if (!plan || !Array.isArray(plan.required) || !plan.required.length) throw new Error('Risk plan unavailable');
  const failed = plan.required.filter((name) => results?.[name] !== 'success');
  if (failed.length) throw new Error(`Required checks incomplete: ${failed.join(', ')}`);
  return true;
}
