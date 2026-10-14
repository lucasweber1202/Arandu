#!/usr/bin/env node
// Gate de paridade Demo × Oficial (npm run check:demo-parity).
//
// Responde, com o que é verificável sem infraestrutura: "a Demo canônica
// (ARANDU_ENV=demo) representa o mesmo produto deste commit?". Falha se:
//   * uma tela/rota/item de menu do produto não pertence a nenhuma capacidade;
//   * uma capacidade aponta para view, recurso de API ou check do seed inexistente;
//   * uma capacidade não tem cobertura de dataset nem lacuna/estado vazio declarado;
//   * a casca canônica carrega o sandbox, ou o sandbox ganhou novo acoplamento;
//   * o frontend ou o servidor passam a decidir comportamento pelo ambiente
//     demo fora dos pontos permitidos (selo, login por persona);
//   * uma persona usa papel fora do modelo canônico;
//   * vercel.json desvia rota financeira para /demo;
//   * segredo de servidor aparece no código do navegador;
//   * a matriz versionada diverge do manifesto (rode com --write).
// O que este gate NÃO prova: publicação hospedada. hostedState vem da
// atribuição ativa do Supabase DEMO e fica BLOCKED até o cutover.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

import { PAGES, DEMO_ONLY_PAGES, renderPage } from './generate-finance-pages.mjs';
import { navItems } from '../lib/finance/navigation.mjs';
import { POLICY_ROLES } from '../lib/finance/policy.mjs';
import { BUYERS } from '../lib/finance/demo-personas.mjs';
import { ACTIVE_SUPABASE_ASSIGNMENTS } from '../lib/deployment-topology.mjs';
import {
  CAPABILITIES, SANDBOX_ONLY, SANDBOX_COUPLING_BUDGET, SERVER_DEMO_BRANCH_ALLOWLIST,
  CLIENT_ENVIRONMENT_ALLOWLIST, OPEN_ITEMS
} from '../lib/finance/parity-manifest.mjs';

const MATRIX = 'docs/DEMO_PRODUCTION_PARITY_MATRIX.md';
const read = (path) => readFileSync(path, 'utf8');
// As allowlists usam caminhos com /; no Windows, join() devolve \.
const walk = (dir, filter) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name).replaceAll('\\', '/');
  if (entry.isDirectory()) return walk(path, filter);
  return filter(path) ? [path] : [];
});
const SANDBOX_DIR = resolve('finance/demo');
const problems = [];
const fail = (message) => problems.push(message);

// ------------------------------------------------------------ fontes vivas
const seed = read('scripts/demo/seed.mjs');
const app = read('finance/app.js');
const domainSource = walk('lib/api/domains', (p) => p.endsWith('.mjs')).map(read).join('\n');
const viewsBlock = app.slice(app.indexOf('const VIEWS = {'), app.indexOf('\n};', app.indexOf('const VIEWS = {')));
const appViews = new Set([...viewsBlock.matchAll(/(?:^|[\s,{])(\w+): (?:lazy\(|\(\) =>)/g)].map((m) => m[1]));
const pagesByView = new Map();
for (const page of PAGES) pagesByView.set(page.view, [...(pagesByView.get(page.view) || []), page]);

// ------------------------------------------------------------ 1. cobertura do inventário
const covered = new Set(CAPABILITIES.flatMap((c) => c.views));
for (const view of pagesByView.keys()) if (!covered.has(view)) fail(`tela "${view}" (${pagesByView.get(view)[0].path}) não pertence a nenhuma capacidade do manifesto`);
for (const item of [...navItems('company'), ...navItems('provider')]) {
  const view = item.key === 'dashboard' ? 'dashboard' : item.key;
  if (!pagesByView.has(view) && !(item.views || []).some((v) => pagesByView.has(v))) fail(`item de menu "${item.key}" sem página gerada`);
  if (!covered.has(view) && !(item.views || []).some((v) => covered.has(v))) fail(`item de menu "${item.key}" sem capacidade no manifesto`);
}
const ids = new Set();
for (const cap of CAPABILITIES) {
  if (ids.has(cap.id)) fail(`id de capacidade duplicado: ${cap.id}`);
  ids.add(cap.id);
}

// ------------------------------------------------------------ 2. cada capacidade é real
const quoted = (name) => new RegExp(`['\`]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\`/]`).test(domainSource);
function evaluate(cap) {
  const issues = [];
  for (const view of cap.views) {
    if (!pagesByView.has(view)) issues.push(`view ${view} sem página`);
    if (!appViews.has(view)) issues.push(`view ${view} sem roteamento em finance/app.js`);
  }
  for (const resource of cap.api) {
    if (resource.startsWith('auth/')) {
      if (!domainSource.includes(`'${resource.slice(5)}'`)) issues.push(`ação ${resource} inexistente`);
      continue;
    }
    const head = resource.split('/')[0];
    if (!quoted(head)) issues.push(`recurso /api/finance/${resource} inexistente`);
  }
  for (const label of cap.sanity) if (!seed.includes(label)) issues.push(`check do seed "${label}" inexistente`);
  const dataset = cap.sanity.length > 0 || Boolean(cap.emptyState);
  if (!dataset && !cap.gap) issues.push('sem cobertura de dataset nem lacuna declarada');
  const routes = cap.views.flatMap((v) => (pagesByView.get(v) || []).map((p) => `/${p.path}`));
  const state = issues.length ? 'BLOCKED'
    : cap.views.length && !routes.length ? 'NOT_REPRESENTED'
      : cap.envLimit ? 'ENVIRONMENT_LIMITED'
        : cap.gap ? 'PARITY_PARTIAL'
          : 'PARITY_VERIFIED';
  return { ...cap, routes, issues, state };
}
const evaluated = CAPABILITIES.map(evaluate);
for (const cap of evaluated) for (const issue of cap.issues) fail(`${cap.id}: ${issue}`);

// ------------------------------------------------------------ 3. sandbox legado
const sandboxViews = new Set(DEMO_ONLY_PAGES.map((p) => p.view));
for (const view of sandboxViews) if (!SANDBOX_ONLY[view]) fail(`tela exclusiva do sandbox "${view}" sem decisão registrada em SANDBOX_ONLY`);
for (const view of Object.keys(SANDBOX_ONLY)) if (!sandboxViews.has(view)) fail(`SANDBOX_ONLY.${view} não existe mais: remova do manifesto`);
for (const view of sandboxViews) if (covered.has(view)) fail(`tela do sandbox "${view}" listada como capacidade canônica`);
for (const page of PAGES) {
  const html = renderPage(page);
  if (/\/finance\/demo\/|data-mode="demo"|demo-banner/.test(html)) fail(`casca canônica /${page.path} carrega o sandbox`);
}
for (const [file, budget] of Object.entries(SANDBOX_COUPLING_BUDGET)) {
  const count = (read(file).match(/import\(['"]\.\/demo\//g) || []).length;
  if (count > budget) fail(`${file} importa o sandbox ${count}× (orçamento ${budget}); o acoplamento só pode diminuir`);
}
const canonicalClient = [...walk('finance/src', (p) => p.endsWith('.js')), ...walk('lib', (p) => p.endsWith('.mjs'))];
for (const file of canonicalClient) {
  const source = read(file);
  // Resolve cada especificador (from, import puro e import dinâmico) e recusa o que cair em finance/demo/.
  for (const [, spec] of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
    if (!spec.startsWith('.')) continue;
    if (relative(SANDBOX_DIR, resolve(dirname(file), spec)).match(/^[^.]/)) fail(`${file} importa o sandbox legado (${spec})`);
  }
}

// ------------------------------------------------------------ 4. sem ramo de comportamento por ambiente
for (const file of walk('finance/src', (p) => p.endsWith('.js')).concat('finance/app.js')) {
  if (/ctx\.environment|environment\s*===\s*['"]demo['"]/.test(read(file)) && !CLIENT_ENVIRONMENT_ALLOWLIST.includes(file)) {
    fail(`${file} decide comportamento pelo ambiente; a Demo canônica não pode ter tela ou regra própria`);
  }
}
for (const file of walk('lib/api', (p) => p.endsWith('.mjs'))) {
  if (/\b(isDemo|canUseDemoPersonas|canUseSyntheticFixtures)\b/.test(read(file)) && !SERVER_DEMO_BRANCH_ALLOWLIST.includes(file)) {
    fail(`${file} ramifica pelo runtime de demonstração fora da lista permitida`);
  }
}

// ------------------------------------------------------------ 5. personas, rotas, segredos
const personaRoles = Object.values(BUYERS).map((p) => p.role);
for (const role of personaRoles) if (!POLICY_ROLES.includes(role)) fail(`persona com papel fora do modelo canônico: ${role}`);
for (const role of POLICY_ROLES) if (!personaRoles.includes(role)) fail(`papel canônico ${role} sem persona na Demo`);
const vercel = JSON.parse(read('vercel.json'));
for (const rule of [...(vercel.rewrites || []), ...(vercel.redirects || [])]) {
  if (/^\/(finance|provider)\b/.test(rule.source) && /^\/demo\b/.test(rule.destination)) fail(`vercel.json desvia ${rule.source} para ${rule.destination}`);
}
// Nome de variável em rótulo de diagnóstico é permitido; valor ou leitura de ambiente no navegador, não.
const SECRET = /process\.env|\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9]|service_role"\s*:/;
for (const file of walk('finance', (p) => /\.(js|html)$/.test(p)).concat(walk('provider', (p) => p.endsWith('.html')))) {
  if (SECRET.test(read(file))) fail(`${file} contém segredo ou leitura de ambiente no código do navegador`);
}

// ------------------------------------------------------------ 5b. isolamento de visitantes
// O login público da Demo entra num workspace próprio (docs/demo/VISITOR_ISOLATION.md):
// nunca na conta do baseline, nunca com a senha compartilhada, nunca por escolha do navegador.
const auth = read('lib/api/domains/auth.mjs');
const demoLogin = auth.slice(auth.indexOf("action === 'demo-personas' || action === 'demo-login'"), auth.indexOf("if (action === 'session')"));
if (!demoLogin.includes('visitorWorkspace(req)') || !demoLogin.includes('personaEmailIn(') || !demoLogin.includes('workspacePassword(')) fail('demo-login não passa pelo workspace do visitante (visitorWorkspace, personaEmailIn, workspacePassword)');
if (/email:persona\.email|password\}\)/.test(demoLogin.replace(/\s+/g, ''))) fail('demo-login autentica a conta do baseline ou com a senha compartilhada');
if (/body\.(workspace|email|role|user)/.test(demoLogin)) fail('demo-login usa workspace, e-mail, papel ou usuário vindo do navegador');
if (!/demoWorkspaceAllows\(user\)/.test(auth)) fail('sessão de conta de workspace não confere se o workspace está ativo');
const migrations = JSON.parse(read('docs/supabase-migrations.json'));
for (const [flow, files] of Object.entries(migrations)) if (!files.includes('docs/supabase-financial-demo-workspaces.sql')) fail(`migration de workspaces ausente do fluxo ${flow}`);
if (!/fin_demo_workspaces:/.test(read('lib/finance/data-governance.mjs'))) fail('fin_demo_workspaces sem classificação em data governance');
if (!/WORKSPACE/.test(seed) || !/saveWorkspace\(/.test(seed)) fail('seed sem modo workspace: o pool não pode ser montado pela história real');

// ------------------------------------------------------------ 6. estado hospedado (eixo separado)
const hostedState = ACTIVE_SUPABASE_ASSIGNMENTS.demo.length ? 'ASSIGNED_PENDING_EVIDENCE' : 'BLOCKED';

// ------------------------------------------------------------ 7. matriz versionada
function renderMatrix() {
  const counts = Object.fromEntries(['PARITY_VERIFIED', 'PARITY_PARTIAL', 'ENVIRONMENT_LIMITED', 'NOT_REPRESENTED', 'BLOCKED'].map((s) => [s, evaluated.filter((c) => c.state === s).length]));
  const cell = (text) => String(text || '—').replace(/\|/g, '\\|');
  const lines = [
    '# Matriz de paridade Demo × Oficial',
    '',
    '> Gerado por `node scripts/check-demo-parity.mjs --write` a partir de `lib/finance/parity-manifest.mjs`. Não edite à mão: `npm run check:demo-parity` falha se este arquivo divergir.',
    '',
    'A Demo canônica (`ARANDU_ENV=demo`) é o mesmo build da `main` ligado a um Supabase DEMO dedicado: as rotas abaixo são as mesmas nos dois ambientes. O estado **local** é calculado (rota canônica + recurso real da API + check de sanidade do seed). Ele **não** prova publicação: o eixo hospedado é separado.',
    '',
    `**Estado hospedado da Demo canônica:** \`${hostedState}\` — ${hostedState === 'BLOCKED' ? 'Supabase DEMO sem atribuição ativa aprovada em `lib/deployment-topology.mjs`; depende de recuperação comprovada e cutover (docs/TWO_ENVIRONMENT_CONSOLIDATION.md).' : 'atribuição ativa registrada; falta evidência hospedada (deploy, seed, doctor, canary).'}`,
    '',
    `**Denominador:** ${evaluated.length} capacidades. Verificadas localmente: ${counts.PARITY_VERIFIED}. Parciais: ${counts.PARITY_PARTIAL}. Limitadas pelo ambiente: ${counts.ENVIRONMENT_LIMITED}. Não representadas: ${counts.NOT_REPRESENTED}. Bloqueadas: ${counts.BLOCKED}.`,
    '',
    '| ID | Capacidade | Rotas (Oficial = Demo) | Recursos da API | Cobertura do dataset | Estado local | Lacuna / limitação |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...evaluated.map((c) => `| ${c.id} | ${cell(c.name)} | ${cell(c.routes.map((r) => `\`${r}\``).join('<br>'))} | ${cell(c.api.map((a) => `\`${a}\``).join(', '))} | ${cell(c.sanity.length ? c.sanity.map((s) => `“${s.replace(/"$/, '')}”`).join('; ') : c.emptyState)} | \`${c.state}\` | ${cell(c.gap || c.envLimit)} |`),
    '',
    '## Telas exclusivas do sandbox legado (`/demo`)',
    '',
    'Não fazem parte da Demo canônica. Cada uma tem decisão registrada; saem junto com o sandbox, depois da Demo canônica hospedada e validada.',
    '',
    '| View | Decisão |',
    '| --- | --- |',
    ...Object.entries(SANDBOX_ONLY).map(([view, decision]) => `| \`${view}\` | ${cell(decision)} |`),
    '',
    '## Itens abertos fora do gate local',
    '',
    ...OPEN_ITEMS.map((item) => `- **${item.id}** — ${item.text}`),
    '',
    '## O que o gate verifica',
    '',
    '`npm run check:demo-parity` (parte de `check:all`) falha quando: uma tela ou item de menu não pertence a nenhuma capacidade; uma capacidade aponta para view, recurso de API ou check do seed inexistente; falta cobertura de dataset sem lacuna declarada; a casca canônica carrega o sandbox ou o sandbox ganha acoplamento; o frontend ou o servidor ramificam pelo ambiente demo fora do selo e do login por persona; uma persona usa papel fora do modelo canônico (ou um papel fica sem persona); `vercel.json` desvia rota financeira para `/demo`; segredo ou leitura de `process.env` aparece no código do navegador; ou esta matriz diverge do manifesto.',
    ''
  ];
  return lines.join('\n');
}

const matrix = renderMatrix();
if (process.argv.includes('--write')) writeFileSync(MATRIX, matrix);
else if (!existsSync(MATRIX) || read(MATRIX) !== matrix) fail(`${MATRIX} diverge do manifesto (rode node scripts/check-demo-parity.mjs --write)`);

if (problems.length) {
  console.error(`Paridade Demo × Oficial: ${problems.length} problema(s)\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
const summary = evaluated.reduce((acc, c) => ({ ...acc, [c.state]: (acc[c.state] || 0) + 1 }), {});
console.log(`Paridade Demo × Oficial: ${evaluated.length} capacidades — ${Object.entries(summary).map(([k, v]) => `${k} ${v}`).join(', ')}; hospedado ${hostedState}.`);
