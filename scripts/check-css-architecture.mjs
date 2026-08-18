import fs from 'node:fs';
import path from 'node:path';

const issues = [];
const cssDir = path.resolve('css');
const cssFiles = fs.readdirSync(cssDir).filter((file) => file.endsWith('.css')).sort();
const MAX_CSS_FILES = 19;
const MAX_CSS_BYTES = 301000;
const MAX_IMPORTANT = 2050;
const legacyFiles = [
  "arandu-interface-hardening.css",
  "arandu-final-polish.css",
  "arandu-ux-refresh.css",
  "arandu-ux-final-tune.css",
  "arandu-operational-upgrade.css",
  "arandu-next-ops.css",
  "arandu-advanced-features.css",
  "arandu-ui-rescue.css",
  "arandu-deep-clean.css",
  "arandu-release.css",
  "arandu-clarity.css",
  "arandu-visual-polish.css",
  "arandu-refinamento.css",
  "arandu-ui-polish.css",
  "arandu-flow.css",
  "arandu-empty-states.css",
  "arandu-commercial-ux.css",
  "arandu-test-mode.css",
  "arandu-security.css",
  "arandu-enhancements.css",
  "arandu-visual-governor.css",
  "arandu-admin-ops.css",
  "painel-crm-lite.css",
  "arandu-readability-commerce.css",
  "arandu-lunch-polish.css",
  "arandu-visual-commercial-polish.css"
];

const cssSources = cssFiles.map((file) => fs.readFileSync(path.join(cssDir, file), 'utf8'));
const cssBytes = cssSources.reduce((total, source) => total + Buffer.byteLength(source), 0);
const important = cssSources.reduce((total, source) => total + (source.match(/!important/g) || []).length, 0);

if (cssFiles.length > MAX_CSS_FILES) issues.push(`Folhas CSS cresceram: ${cssFiles.length}/${MAX_CSS_FILES}.`);
if (cssBytes > MAX_CSS_BYTES) issues.push(`CSS cresceu: ${cssBytes}/${MAX_CSS_BYTES} bytes.`);
if (important > MAX_IMPORTANT) issues.push(`!important cresceu: ${important}/${MAX_IMPORTANT}.`);
if (!cssFiles.includes('arandu-runtime.css')) issues.push('Folha canônica css/arandu-runtime.css ausente.');

for (const file of legacyFiles) {
  if (cssFiles.includes(file)) issues.push(`Camada consolidada reapareceu: css/${file}`);
}

const jsFiles = fs.readdirSync('js').filter((file) => file.endsWith('.js'));
let styleAssignments = 0;
for (const file of jsFiles) {
  const source = fs.readFileSync(path.join('js', file), 'utf8');
  if (/createElement\(\s*['"]style['"]/.test(source)) issues.push(`js/${file}: cria <style> em runtime.`);
  if (/createElement\(\s*['"]link['"][\s\S]{0,300}?rel\s*=\s*['"]stylesheet['"]/.test(source)) issues.push(`js/${file}: injeta stylesheet em runtime.`);
  if (/setAttribute\(\s*['"]style['"]/.test(source)) issues.push(`js/${file}: cria atributo style em runtime.`);
  styleAssignments += (source.match(/\.style(?:\.|\[|=)/g) || []).length;
}
if (styleAssignments > 49) issues.push(`Atribuições element.style cresceram: ${styleAssignments}/49.`);
const site = fs.readFileSync('js/site.js', 'utf8');
if (/GLOBAL_STYLES|appendChild\(refinement\)|injectStyles/.test(site)) issues.push('js/site.js ainda controla precedência da cascata em runtime.');

function walkHtml(dir = '.') {
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', 'reports', 'test-results', 'playwright-report'].includes(entry)) continue;
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) out.push(...walkHtml(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}
for (const file of walkHtml()) {
  const source = fs.readFileSync(file, 'utf8');
  if (/\sstyle\s*=/i.test(source)) issues.push(`${file}: style inline permanece no HTML.`);
  if (/<style\b/i.test(source)) issues.push(`${file}: bloco <style> permanece no HTML.`);
  for (const legacy of legacyFiles) {
    if (source.includes(legacy)) issues.push(`${file}: referencia CSS consolidado removido (${legacy}).`);
  }
}

const vite = fs.readFileSync('vite.config.js', 'utf8');
if (!vite.includes('/css/arandu-runtime.css')) issues.push('vite.config.js não injeta a cascata canônica.');
const runtime = fs.readFileSync('css/arandu-runtime.css', 'utf8');
for (const marker of ['hardening', 'components', 'operations', 'corrections', 'semantic utilities']) {
  if (!runtime.toLowerCase().includes(marker)) issues.push(`arandu-runtime.css sem seção documentada: ${marker}.`);
}

console.log('Arandu CSS Architecture Check');
console.log(`CSS: ${cssFiles.length} arquivos · ${cssBytes} bytes · ${important} !important`);
console.log(`Erros: ${issues.length}`);
if (issues.length) {
  issues.forEach((issue) => console.error(`- ${issue}`));
  process.exit(1);
}
console.log('Cascata estática, consolidada e protegida contra crescimento.');
