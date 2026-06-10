import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html')).sort();
const requiredCore = ['index.html', 'obras.html', 'obra.html', 'minha-selecao.html', 'proposta-curatorial.html', 'contato.html'];
const requiredLegal = ['termos-de-uso.html', 'politica-de-privacidade.html', 'compra-reserva-reembolso.html', 'politica-para-artistas.html', 'certificado-autenticidade.html'];
const directLoaderPages = ['index.html', 'obras.html', 'obra.html', 'minha-selecao.html'];
const criticalScripts = ['js/site.js', 'js/arandu-loader.js', 'js/arandu-architecture.js'];
const criticalCss = ['css/arandu-system.css', 'css/arandu-public-shell.css', 'css/arandu-architecture.css', 'css/arandu-clean.css', 'css/arandu-legal.css'];
const legacyLayerScripts = ['arandu-experience.js', 'arandu-advanced.js', 'arandu-curation-lab.js', 'arandu-final-300.js', 'arandu-visual-governor.js', 'arandu-public-mode.js', 'arandu-legal-footer.js'];
const publicCriticalPages = new Set([...requiredCore, ...requiredLegal, 'encontrar-arte.html', 'comparar-obras.html', 'como-comprar-na-arandu.html', 'autenticidade.html', 'verificar-certificado.html', 'artistas.html', 'narrativas.html']);
const issues = [];
const warnings = [];
const metrics = [];
const loaderStatus = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function isOperationalPage(file) {
  return /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i.test(file);
}

function addProblem(file, message, critical = publicCriticalPages.has(file)) {
  const text = `${file}: ${message}`;
  if (critical) issues.push(text);
  else warnings.push(text);
}

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

function attrValues(text, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*>`, 'gi');
  return [...text.matchAll(re)].map((match) => match[1]);
}

function baseRef(ref) {
  return ref.split('?')[0];
}

function checkFileReferences(file, html) {
  const refs = [...attrValues(html, 'script', 'src'), ...attrValues(html, 'link', 'href')]
    .map(baseRef)
    .filter((ref) => ref && !ref.startsWith('http') && !ref.startsWith('#') && !ref.startsWith('mailto:') && !ref.startsWith('tel:'));
  refs.forEach((ref) => {
    if (!exists(ref)) issues.push(`${file}: referência inexistente: ${ref}`);
  });
}

function checkLinks(file, html) {
  attrValues(html, 'a', 'href').forEach((href) => {
    if (!href || href === '#') return;
    if (/^(https?:|mailto:|tel:|whatsapp:)/.test(href)) return;
    const target = href.split('#')[0].split('?')[0];
    if (!target) return;
    if (!exists(target)) warnings.push(`${file}: link interno pode estar quebrado: ${href}`);
  });
}

function checkHeader(file, html) {
  const header = html.match(/<header[\s\S]*?<\/header>/i)?.[0] || '';
  if (!header) return addProblem(file, 'header ausente');
  const searchCount = count(header, />\s*Pesquisar\s*</g);
  if (searchCount > 1) addProblem(file, `header contém ${searchCount} ocorrências de Pesquisar`);
  if (!/brand-logo/.test(header)) addProblem(file, 'brand-logo ausente no header');
  if (!/site-nav/.test(header)) warnings.push(`${file}: site-nav ausente no header`);
}

function checkExperienceLoad(file, html) {
  const scripts = attrValues(html, 'script', 'src').map(baseRef);
  const usesSite = scripts.includes('js/site.js');
  const usesLoader = scripts.includes('js/arandu-loader.js');
  const receivesLoader = usesLoader || usesSite;
  const manualLayers = scripts.filter((src) => legacyLayerScripts.some((layer) => src.endsWith(layer)));
  loaderStatus.push({ file, usesSite, usesLoader, receivesLoader, manualLayers: manualLayers.length });

  if (requiredCore.includes(file)) {
    if (!usesSite) issues.push(`${file}: não carrega js/site.js`);
    if (!html.includes('css/arandu-system.css')) issues.push(`${file}: não carrega css/arandu-system.css`);
    if (!html.includes('Pesquisar')) warnings.push(`${file}: sem controle visível de busca`);
  }

  if (directLoaderPages.includes(file) && !usesLoader) warnings.push(`${file}: deveria carregar js/arandu-loader.js diretamente para reduzir dependência`);
  if (!receivesLoader && publicCriticalPages.has(file) && !file.includes('404')) warnings.push(`${file}: não recebe loader centralizado via site.js ou arandu-loader.js`);
  if (receivesLoader && manualLayers.length) warnings.push(`${file}: ainda carrega camadas manuais legadas (${manualLayers.join(', ')})`);
}

function checkPerformanceRisk(file, html) {
  const scripts = attrValues(html, 'script', 'src');
  const styles = attrValues(html, 'link', 'href').filter((href) => href.includes('.css'));
  metrics.push({ file, scripts: scripts.length, styles: styles.length });
  if (scripts.length > 12) warnings.push(`${file}: muitos scripts (${scripts.length}); revisar consolidação`);
  if (styles.length > 8) warnings.push(`${file}: muitas folhas CSS (${styles.length}); revisar consolidação`);
  const normalized = scripts.map(baseRef);
  const duplicateScripts = normalized.filter((src, i) => normalized.indexOf(src) !== i);
  if (duplicateScripts.length) addProblem(file, `scripts duplicados: ${[...new Set(duplicateScripts)].join(', ')}`);
}

function checkAccessibility(file, html) {
  if (!/<html[^>]+lang=["']pt-BR["']/i.test(html)) addProblem(file, 'lang pt-BR ausente');
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) addProblem(file, 'viewport ausente');
  if (!/<meta[^>]+name=["']description["']/i.test(html) && !isOperationalPage(file)) warnings.push(`${file}: meta description ausente`);
  if (!/<h1[\s>]/i.test(html)) addProblem(file, 'h1 ausente');
  const buttons = [...html.matchAll(/<button\b([^>]*)>/gi)];
  buttons.forEach((match, idx) => {
    const tag = match[0];
    if (!/type=/.test(tag)) warnings.push(`${file}: button ${idx + 1} sem type`);
  });
}

function checkContentQuality(file, html) {
  const forbiddenMention = /\b(?:IA|I\.A\.|inteligência artificial)\b/i.test(html);
  if (forbiddenMention) addProblem(file, 'contém menção indevida a tecnologia generativa');
  if (/lorem ipsum/i.test(html)) addProblem(file, 'contém Lorem Ipsum');
  if (html.includes('Pesquisar</a><a class="search-trigger')) addProblem(file, 'possível duplicidade literal de pesquisa');
}

function checkScriptSyntaxRisk() {
  const scriptFiles = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js'));
  scriptFiles.forEach((script) => {
    const rel = path.join('js', script);
    const text = read(rel);
    try {
      execFileSync(process.execPath, ['--check', path.join(root, rel)], { stdio: 'pipe' });
    } catch (error) {
      issues.push(`${rel}: erro de sintaxe JavaScript (${String(error.stderr || error.message).split('\n')[0]})`);
    }
    if (/^\s*type\s*=\s*['"]button['"]/m.test(text) && !/\.type\s*=\s*['"]button['"]/.test(text)) {
      warnings.push(`${rel}: possível atribuição global type='button'; usar element.type='button'`);
    }
    if (count(text, /setInterval\(/g) > 3) warnings.push(`${rel}: muitos setInterval; revisar performance`);
    const usesDynamicHtml = /innerHTML\s*=/.test(text);
    const hasEscaping = /escape[A-Za-z]*Html|textContent/.test(text);
    const isOperationalDrawer = rel === path.join('js', 'painel-detalhes.js');
    if (usesDynamicHtml && !hasEscaping && !isOperationalDrawer) warnings.push(`${rel}: usa innerHTML; revisar conteúdo dinâmico`);
  });
}

function checkCoreFiles() {
  [...criticalScripts, ...criticalCss, ...requiredLegal].forEach((file) => {
    if (!exists(file)) issues.push(`Arquivo crítico ausente: ${file}`);
  });
  const siteJs = exists('js/site.js') ? read('js/site.js') : '';
  const loaderJs = exists('js/arandu-loader.js') ? read('js/arandu-loader.js') : '';
  if (!siteJs.includes('arandu-loader.js')) issues.push('js/site.js: não aciona arandu-loader.js automaticamente');
  if (!loaderJs.includes('arandu-public-shell.css')) issues.push('js/arandu-loader.js: não carrega arandu-public-shell.css');
  if (!loaderJs.includes('arandu-architecture.js')) issues.push('js/arandu-loader.js: não carrega arandu-architecture.js');
}

checkCoreFiles();
htmlFiles.forEach((file) => {
  const html = read(file);
  checkFileReferences(file, html);
  checkLinks(file, html);
  checkHeader(file, html);
  checkExperienceLoad(file, html);
  checkPerformanceRisk(file, html);
  checkAccessibility(file, html);
  checkContentQuality(file, html);
});
checkScriptSyntaxRisk();

const report = {
  checkedAt: new Date().toISOString(),
  htmlFiles: htmlFiles.length,
  issues,
  warnings,
  metrics,
  loaderStatus,
};
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports', 'arandu-quality-report.json'), JSON.stringify(report, null, 2));

console.log(`Arandu Quality Gate`);
console.log(`HTML analisados: ${htmlFiles.length}`);
console.log(`Erros: ${issues.length}`);
console.log(`Alertas: ${warnings.length}`);
console.log(`Páginas recebendo loader: ${loaderStatus.filter((item) => item.receivesLoader).length}`);
if (issues.length) {
  console.error('\nErros críticos:');
  issues.forEach((issue) => console.error(`- ${issue}`));
}
if (warnings.length) {
  console.warn('\nAlertas:');
  warnings.slice(0, 100).forEach((warning) => console.warn(`- ${warning}`));
  if (warnings.length > 100) console.warn(`... +${warnings.length - 100} alertas no relatório JSON.`);
}
console.log('\nRelatório: reports/arandu-quality-report.json');
if (issues.length) process.exit(1);
