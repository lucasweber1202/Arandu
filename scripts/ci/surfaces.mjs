// Mapa de superfícies da CI proporcional (v6.2).
//
// Seleciona os E2E Chromium a partir das dependências REAIS do candidato:
// o grafo de imports relativos de finance/src e lib/finance é lido do checkout
// e percorrido no sentido "quem importa este arquivo". Cada view alcançada
// contribui com as suítes da sua jornada; qualquer arquivo de interface
// alcançado sem mapeamento explícito (core, ui, shell, shared, view nova) amplia
// para todas as suítes financeiras. Nunca reduz por nome de branch ou label.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { PURE_MODULES, PRESENTER } from './risk-policy.mjs';

const isListedPure = (p) => PURE_MODULES.has(p) || PRESENTER.test(p);

const spec = (name) => `tests/e2e/finance-${name}.spec.js`;

// Jornadas pedidas pelo proprietário (v6.2 §6). Uma view nova sem entrada aqui
// cai em "todas as suítes" até ser mapeada.
const NEGOTIATION = ['procurement', 'external-proposals', 'negotiation-board'];
const CRM = ['crm', 'relationship-center', 'central'];
const PORTAL = ['provider-draft', 'external-proposals', 'procurement'];
const FEES = ['fees', 'ingestion', 'contracts'];
export const VIEW_SPECS = Object.freeze({
  'rfq.js': NEGOTIATION,
  'rfqs.js': NEGOTIATION,
  'negotiation-board.js': NEGOTIATION,
  'negotiation-origin.js': NEGOTIATION,
  'external-proposals.js': PORTAL,
  'provider.js': PORTAL,
  'intake.js': ['provider-draft', 'procurement'],
  'crm-workspace.js': CRM,
  'relationship-center.js': CRM,
  'relationship-context.js': CRM,
  'provider-relationship.js': CRM,
  'context-signals.js': CRM,
  'dashboard.js': ['central', 'crm'],
  'fees.js': FEES,
  'fee-import.js': FEES,
  'contract-center.js': ['contracts', 'fees'],
  'contract-registration.js': ['contracts', 'ingestion'],
  'contract-work.js': ['contracts'],
  'documents.js': ['contracts', 'extractions'],
  'extractions.js': ['extractions', 'ingestion'],
  'covenants.js': ['covenants'],
  'entities.js': ['entities', 'procurement'],
  'executive.js': ['executive'],
  'governance.js': ['governance'],
  'implementations.js': ['implementations'],
  'integrations.js': ['integrations'],
  'passport.js': ['passport'],
  'performance.js': ['performance'],
  'policy.js': ['policy'],
  'portfolio.js': ['portfolio'],
  'spend.js': ['spend'],
  'sso.js': ['sso'],
  'value.js': ['value'],
  'opportunities.js': ['opportunities'],
  'opportunity-outcome.js': ['opportunities'],
  'qualifications.js': ['qualifications'],
  'copilot.js': ['copilot'],
  'product-catalog.js': ['product-terms'],
  'product-terms-panel.js': ['product-terms'],
  'graph-context.js': [...NEGOTIATION, ...CRM],
  // Hub de rotas da empresa (approvals, proposals, contracts, providers, tasks,
  // notifications, settings): suítes que visitam essas páginas.
  'company.js': ['procurement', 'contracts', 'central', 'crm', 'relationship-center', 'copilot', 'entities',
    'opportunities', 'portfolio', 'product-terms', 'governance', 'ingestion', 'integrations', 'policy', 'sso'],
});

const IMPORT = /(?:\bimport\s*\(\s*|\bfrom\s+|^\s*import\s+)['"]([^'"]+)['"]/gm;

function listFiles(root, dir, ext) {
  const abs = path.join(root, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(root, rel, ext));
    else if (ext.test(entry.name)) out.push(rel);
  }
  return out;
}

/** Grafo reverso: arquivo -> conjunto de arquivos que o importam. */
export function buildImportGraph(root = '.') {
  const files = [...listFiles(root, 'finance/src', /\.js$/), ...listFiles(root, 'lib/finance', /\.mjs$/)];
  const importers = new Map();
  for (const file of files) {
    const source = readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(IMPORT)) {
      if (!match[1].startsWith('.')) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(file);
    }
  }
  return { root, files: new Set(files), importers };
}

export function allFinanceSuites(root = '.') {
  return readdirSync(path.join(root, 'tests/e2e')).filter((n) => /^finance-.*\.spec\.js$/.test(n)).map((n) => `tests/e2e/${n}`).sort();
}

/**
 * Suites para um caminho alterado. Retorna `null` quando o impacto não pode
 * ser delimitado (deve ampliar para todas).
 */
export function suitesForPath(file, graph) {
  if (/^tests\/e2e\/finance-[a-z0-9-]+\.spec\.js$/.test(file)) return [file];
  // Teste de lógica pura herda as jornadas dos módulos de lib/finance que importa.
  if (/^scripts\/test-[a-z0-9-]+\.mjs$/.test(file)) {
    const abs = path.join(graph.root, file);
    if (!existsSync(abs)) return null;
    // Módulos sob teste = os da allowlist pura/presenters; demais imports de
    // lib/finance (ex.: catálogo de produtos) são fixtures inalteradas pelo diff.
    const targets = [...readFileSync(abs, 'utf8').matchAll(IMPORT)].map((x) => x[1])
      .filter((x) => x.startsWith('../lib/finance/') && isListedPure(path.posix.normalize(path.posix.join('scripts', x))));
    if (!targets.length) return null;
    const union = new Set();
    for (const target of targets) {
      const suites = suitesForPath(path.posix.normalize(path.posix.join('scripts', target)), graph);
      if (!suites) return null;
      for (const s of suites) union.add(s);
    }
    return [...union].sort();
  }
  if (!/^(?:finance\/src\/.+\.js|lib\/finance\/.+\.mjs)$/.test(file)) return null;
  const seen = new Set([file]);
  const queue = [file];
  const suites = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (current.startsWith('finance/src/')) {
      const view = current.startsWith('finance/src/views/') ? path.posix.basename(current) : null;
      if (!view || !VIEW_SPECS[view]) return null; // core/ui/shell/shared ou view não mapeada
      for (const name of VIEW_SPECS[view]) suites.add(spec(name));
    }
    for (const importer of graph.importers.get(current) || []) {
      if (!seen.has(importer)) { seen.add(importer); queue.push(importer); }
    }
  }
  // Módulo de lib sem nenhuma view alcançada: impacto não visível por interface.
  return suites.size ? [...suites].sort() : null;
}

export function selectSuites(plan, { graph, all }) {
  if (plan.risk === 'A') return ['tests/e2e/finance-procurement.spec.js'];
  if (plan.risk !== 'B') return all;
  const names = new Set();
  for (const reason of plan.reasons) {
    if (reason.risk === 'A') continue;
    if (reason.status === 'removed' || reason.previous) return all;
    const suites = suitesForPath(reason.path, graph);
    if (!suites) return all;
    for (const s of suites) names.add(s);
  }
  const selected = [...names].filter((s) => all.includes(s)).sort();
  return selected.length ? selected : all;
}
