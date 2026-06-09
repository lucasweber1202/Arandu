import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html')).sort();
const requiredCore = ['index.html', 'obras.html', 'obra.html', 'minha-selecao.html', 'proposta-curatorial.html', 'contato.html'];
const criticalScripts = ['js/site.js'];
const criticalCss = ['css/arandu-system.css'];
const issues = [];
const warnings = [];
const metrics = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

function attrValues(text, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*>`, 'gi');
  return [...text.matchAll(re)].map((match) => match[1]);
}

function checkFileReferences(file, html) {
  const refs = [...attrValues(html, 'script', 'src'), ...attrValues(html, 'link', 'href')]
    .map((ref) => ref.split('?')[0])
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
  if (!header) issues.push(`${file}: header ausente`);
  const searchCount = count(header, />\s*Pesquisar\s*</g);
  if (searchCount > 1) issues.push(`${file}: header contém ${searchCount} ocorrências de Pesquisar`);
  if (!/brand-logo/.test(header)) issues.push(`${file}: brand-logo ausente no header`);
  if (!/site-nav/.test(header)) warnings.push(`${file}: site-nav ausente no header`);
}

function checkExperienceLoad(file, html) {
  if (requiredCore.includes(file)) {
    if (!html.includes('js/site.js')) issues.push(`${file}: não carrega js/site.js`);
    if (!html.includes('css/arandu-system.css')) issues.push(`${file}: não carrega css/arandu-system.css`);
    if (!html.includes('Pesquisar')) warnings.push(`${file}: sem controle visível de busca`);
  }
  if (['index.html', 'obras.html', 'obra.html', 'minha-selecao.html'].includes(file)) {
    if (!html.includes('arandu-experience.js')) warnings.push(`${file}: camada arandu-experience não conectada`);
    if (!html.includes('arandu-curation-lab.js')) warnings.push(`${file}: camada Curation Lab não conectada`);
  }
}

function checkPerformanceRisk(file, html) {
  const scripts = attrValues(html, 'script', 'src');
  const styles = attrValues(html, 'link', 'href').filter((href) => href.includes('.css'));
  metrics.push({ file, scripts: scripts.length, styles: styles.length });
  if (scripts.length > 12) warnings.push(`${file}: muitos scripts (${scripts.length}); revisar consolidação`);
  if (styles.length > 8) warnings.push(`${file}: muitas folhas CSS (${styles.length}); revisar consolidação`);
  const duplicateScripts = scripts.filter((src, i) => scripts.indexOf(src) !== i);
  if (duplicateScripts.length) issues.push(`${file}: scripts duplicados: ${duplicateScripts.join(', ')}`);
}

function checkAccessibility(file, html) {
  if (!/<html[^>]+lang=["']pt-BR["']/i.test(html)) issues.push(`${file}: lang pt-BR ausente`);
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) issues.push(`${file}: viewport ausente`);
  if (!/<meta[^>]+name=["']description["']/i.test(html)) warnings.push(`${file}: meta description ausente`);
  if (!/<h1[\s>]/i.test(html)) issues.push(`${file}: h1 ausente`);
  const buttons = [...html.matchAll(/<button\b([^>]*)>/gi)];
  buttons.forEach((match, idx) => {
    const tag = match[0];
    if (!/type=/.test(tag)) warnings.push(`${file}: button ${idx + 1} sem type`);
  });
}

function checkContentQuality(file, html) {
  if (/IA|inteligência artificial|ChatGPT/i.test(html)) issues.push(`${file}: contém menção a IA/ChatGPT`);
  if (/lorem ipsum/i.test(html)) issues.push(`${file}: contém Lorem Ipsum`);
  if (html.includes('Pesquisar</a><a class="search-trigger')) issues.push(`${file}: possível duplicidade literal de pesquisa`);
}

function checkScriptSyntaxRisk() {
  const scriptFiles = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js'));
  scriptFiles.forEach((script) => {
    const text = read(path.join('js', script));
    if (/\btype\s*=\s*['"]button['"]/.test(text) && !/\.type\s*=\s*['"]button['"]/.test(text)) {
      warnings.push(`js/${script}: possível atribuição global type='button'; usar element.type='button'`);
    }
    if (count(text, /setInterval\(/g) > 3) warnings.push(`js/${script}: muitos setInterval; revisar performance`);
    if (/innerHTML\s*=/.test(text) && !/escapeHtml|textContent/.test(text)) warnings.push(`js/${script}: usa innerHTML; revisar conteúdo dinâmico`);
  });
}

function checkCoreFiles() {
  [...criticalScripts, ...criticalCss].forEach((file) => {
    if (!exists(file)) issues.push(`Arquivo crítico ausente: ${file}`);
  });
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
};
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports', 'arandu-quality-report.json'), JSON.stringify(report, null, 2));

console.log(`Arandu Quality Gate`);
console.log(`HTML analisados: ${htmlFiles.length}`);
console.log(`Erros: ${issues.length}`);
console.log(`Alertas: ${warnings.length}`);
if (issues.length) {
  console.error('\nErros críticos:');
  issues.forEach((issue) => console.error(`- ${issue}`));
}
if (warnings.length) {
  console.warn('\nAlertas:');
  warnings.slice(0, 80).forEach((warning) => console.warn(`- ${warning}`));
  if (warnings.length > 80) console.warn(`... +${warnings.length - 80} alertas no relatório JSON.`);
}
console.log('\nRelatório: reports/arandu-quality-report.json');
if (issues.length) process.exit(1);
