// Avaliação dos budgets do build (lógica pura; o CLI é scripts/check-build-size.mjs).
//
// Duas superfícies, medidas separadamente para que uma não esconda a outra:
//   * produto  — o que Oficial, Staging/Pilot e a Demo canônica (ARANDU_ENV=demo)
//     publicam. Mesmo código em todo build. Hard limit de JS inalterado: 800.000.
//   * sandbox  — camada legada que só existe em build demonstrativo explícito
//     (chunks 100% de `finance/demo/**`: motor no navegador, seed e Work OS).
//     Congelada no tamanho medido em 06/10/2026 (327.597 bytes): não cresce, e
//     sai inteira quando `arandu-demo` migrar para ARANDU_ENV=demo.
// Antes, as duas somavam contra um único teto de 800.000; com 331 bytes de
// margem, capabilities de produto eram retiradas do build demonstrativo para
// caber (antigo `productionOnly`). Ver docs/FINANCIAL_BUNDLE_HEADROOM.md.
//
// Além do total, o que o usuário baixa por tela: rota = fechamento estático do
// app + fechamento estático da tela (união, sem contar chunk compartilhado duas vezes).

export const LIMITS = Object.freeze({
  total: 3000000,
  javascript: 800000,
  sandboxJavascript: 330000,
  css: 650000,
  largestJavascript: 100000,
  largestRouteJavascript: 250000,
  // A cascata canônica substitui 26 requests históricos; o limite por arquivo
  // cresce apenas para ela, enquanto o budget CSS total continua inalterado.
  largestCss: 170000,
  largestImage: 750000
});
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
export function assessBuildSize({ files, profile }) {
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
  const warnings = Object.keys(LIMITS)
    .filter((key) => metrics[key] <= LIMITS[key] && metrics[key] > LIMITS[key] * HEALTHY_RATIO)
    .map((key) => `${key} acima do envelope saudável (${Math.round((metrics[key] / LIMITS[key]) * 100)}% do hard limit): reaja antes de encostar no limite.`);
  return { metrics, limits: LIMITS, routes, largestRoute: largestRoute[0], problems, warnings, ok: problems.length === 0 };
}
