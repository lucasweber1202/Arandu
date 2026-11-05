// Avaliação dos budgets do build (lógica pura; o CLI é scripts/check-build-size.mjs).
//
// Duas superfícies, medidas separadamente para que uma não esconda a outra:
//   * produto  — o que Oficial, Staging/Pilot e a Demo canônica (ARANDU_ENV=demo)
//     publicam. Mesmo código em todo build. Desde 05/11/2026 o agregado de JS
//     (800.000) é INDICADOR DE CAPACIDADE do catálogo, não teto de performance:
//     passar dele exige registro em docs/perf/bundle-growth-log.json (valor
//     aceito, justificativa, baseline de jornadas registrada). Sem registro, falha.
//     Performance é protegida por rota/arquivo (hard) e pelo peso REAL por
//     jornada (scripts/perf/measure-journeys.mjs + baseline com tolerância).
//   * sandbox  — camada legada que só existe em build demonstrativo explícito
//     (chunks 100% de `finance/demo/**`: motor no navegador, seed e Work OS).
//     Congelada no tamanho medido em 06/10/2026 (327.597 bytes) e corrigida em
//     04/11/2026 para 382.400: até então o motor (`finance/demo/engine.js`,
//     ~53,6 KB) contava como produto porque o Rollup embutia nele
//     `lib/finance/workflow.mjs`; com o workflow em chunk próprio (vite.config.js)
//     o motor é sandbox, como sempre foi descrito. Soma produto+sandbox inalterada
//     (+63 B de chunk). Não cresce; sai inteira quando `arandu-demo` migrar.
// Antes, as duas somavam contra um único teto de 800.000; com 331 bytes de
// margem, capabilities de produto eram retiradas do build demonstrativo para
// caber (antigo `productionOnly`). Ver docs/FINANCIAL_BUNDLE_HEADROOM.md.
//
// Além do total, o que o usuário baixa por tela: rota = fechamento estático do
// app + fechamento estático da tela (união, sem contar chunk compartilhado duas vezes).

export const LIMITS = Object.freeze({
  total: 3000000,
  sandboxJavascript: 382400,
  css: 650000,
  largestJavascript: 100000,
  largestRouteJavascript: 250000,
  // A cascata canônica substitui 26 requests históricos; o limite por arquivo
  // cresce apenas para ela, enquanto o budget CSS total continua inalterado.
  largestCss: 170000,
  largestImage: 750000
});
/** Indicadores de capacidade: crescer além exige registro justificado, não é silencioso. */
export const CAPACITY = Object.freeze({ javascript: 800000 });
export const MIN_GROWTH_REASON = 40;
/** Envelope saudável (guideline §24.1): acima disto o build passa, mas avisa. */
export const HEALTHY_RATIO = 0.9;

const SANDBOX_PREFIX = 'finance/demo/';
const ext = (name) => (name.match(/\.[^./]+$/)?.[0] || '').toLowerCase();

export function sandboxChunk(chunk) {
  return Array.isArray(chunk?.modules) && chunk.modules.length > 0 && chunk.modules.every((module) => String(module.source).startsWith(SANDBOX_PREFIX));
}

/** Fechamento estático (união) de um conjunto de chunks pelo grafo de imports. */
function closure(byFile, files) {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file) || !byFile.has(file)) return;
    seen.add(file);
    for (const imported of byFile.get(file).imports || []) visit(imported);
  };
  for (const file of files) visit(file);
  return seen;
}

/** Rotas do produto: cada tela `finance/src/views/*.js` somada ao app que a carrega. */
export function routeSizes(profile) {
  const chunks = profile?.chunks || [];
  const byFile = new Map(chunks.map((chunk) => [chunk.file, chunk]));
  const chunkOf = new Map();
  for (const chunk of chunks) for (const module of chunk.modules || []) chunkOf.set(module.source, chunk.file);
  const app = chunkOf.get('finance/app.js');
  const routes = {};
  for (const [source, file] of chunkOf) {
    const match = /^finance\/src\/views\/([a-z0-9-]+)\.js$/.exec(source);
    if (!match || !app) continue;
    routes[match[1]] = [...closure(byFile, [app, file])].reduce((sum, name) => sum + byFile.get(name).bytes, 0);
  }
  return routes;
}

/**
 * @param {{ files: {name: string, size: number}[], profile: object|null }} input
 *   `files`: todo arquivo publicado em dist (caminho relativo a dist).
 */
export function assessBuildSize({ files, profile, growthLog = null, journeyBaseline = null }) {
  const problems = [];
  if (!profile || !Array.isArray(profile.chunks)) problems.push('reports/bundle-profile.json ausente ou inválido: rode o build antes do check (falha fechada).');
  const sandboxFiles = new Set((profile?.chunks || []).filter(sandboxChunk).map((chunk) => chunk.file));
  const js = files.filter((file) => ['.js', '.mjs'].includes(ext(file.name)));
  const css = files.filter((file) => ext(file.name) === '.css');
  const images = files.filter((file) => ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg'].includes(ext(file.name)));
  const sum = (items) => items.reduce((n, item) => n + item.size, 0);
  const max = (items) => items.reduce((n, item) => Math.max(n, item.size), 0);
  const sandbox = js.filter((file) => sandboxFiles.has(file.name));
  const product = js.filter((file) => !sandboxFiles.has(file.name));
  const routes = routeSizes(profile);
  const largestRoute = Object.entries(routes).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
  const metrics = {
    total: sum(files),
    javascript: sum(product),
    sandboxJavascript: sum(sandbox),
    css: sum(css),
    largestJavascript: max(js),
    largestRouteJavascript: largestRoute[1],
    largestCss: max(css),
    largestImage: max(images)
  };
  for (const key of Object.keys(LIMITS)) if (metrics[key] > LIMITS[key]) problems.push(`${key}: ${metrics[key]} > ${LIMITS[key]} bytes`);
  const warnings = [...Object.keys(LIMITS), ...Object.keys(CAPACITY)]
    .filter((key) => { const cap = LIMITS[key] ?? CAPACITY[key]; return metrics[key] <= cap && metrics[key] > cap * HEALTHY_RATIO; })
    .map((key) => `${key} acima do envelope saudável (${Math.round((metrics[key] / (LIMITS[key] ?? CAPACITY[key])) * 100)}% do ${key in LIMITS ? 'hard limit' : 'indicador de capacidade'}): reaja antes de encostar no limite.`);
  const capacity = assessCapacity(metrics, growthLog, journeyBaseline);
  problems.push(...capacity.problems); warnings.push(...capacity.warnings);
  return { metrics, limits: LIMITS, capacity: CAPACITY, accepted: capacity.accepted, routes, largestRoute: largestRoute[0], problems, warnings, ok: problems.length === 0 };
}

/**
 * Agregado de JS acima do indicador: só passa com entrada no registro de
 * crescimento cujo valor aceito cobre o medido, com justificativa e apontando
 * uma data presente no histórico da baseline de jornadas (prova de que o peso
 * real foi medido antes de aceitar o crescimento). Cada novo crescimento acima
 * do último valor aceito exige nova entrada — o número não sobe sozinho.
 */
export function assessCapacity(metrics, growthLog, journeyBaseline) {
  const problems = []; const warnings = [];
  const value = metrics.javascript; const cap = CAPACITY.javascript;
  if (value <= cap) return { problems, warnings, accepted: null };
  const entries = Array.isArray(growthLog?.entries) ? growthLog.entries : [];
  const latest = entries.at(-1);
  const dates = new Set((journeyBaseline?.history || []).map((h) => h.date));
  if (!latest) problems.push(`javascript: ${value} > ${cap} bytes (indicador de capacidade) sem registro em docs/perf/bundle-growth-log.json`);
  else if (!Number.isSafeInteger(latest.accepted) || latest.accepted < value) problems.push(`javascript: ${value} bytes acima do último valor aceito (${latest.accepted}); registre nova entrada justificada`);
  else if (typeof latest.reason !== 'string' || latest.reason.trim().length < MIN_GROWTH_REASON) problems.push(`javascript: entrada de crescimento sem justificativa (>= ${MIN_GROWTH_REASON} caracteres)`);
  else if (!dates.has(latest.journeyBaseline)) problems.push(`javascript: entrada de crescimento não aponta uma baseline de jornadas registrada (journeyBaseline=${latest.journeyBaseline ?? '—'})`);
  else warnings.push(`javascript: ${value} bytes acima do indicador de capacidade ${cap} (aceito até ${latest.accepted} em ${latest.date}: ${latest.reason.trim()})`);
  return { problems, warnings, accepted: latest?.accepted ?? null };
}
