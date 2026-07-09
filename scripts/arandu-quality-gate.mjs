import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html')).sort();

const requiredPublicPages = [
  'index.html',
  'comprar-arte.html',
  'artistas.html',
  'confianca.html',
  'pesquisa.html',
  'narrativa.html',
  'login.html',
  'colecoes.html',
  'como-funciona.html',
  'faq.html',
  'verificar-certificado.html',
  'minha-selecao.html',
  'contato.html'
];

const requiredOperationalPages = [
  'painel-admin.html',
  'obra-editor.html',
  'artista-editor.html',
  'upload-imagens.html',
  'kanban-comercial.html',
  'checklist-lancamento.html'
];

const requiredLegalPages = [
  'termos-de-uso.html',
  'politica-de-privacidade.html',
  'compra-reserva-reembolso.html',
  'termos-artistas.html'
];

const requiredFiles = [
  'js/site.js',
  'js/arandu-loader.js',
  'js/arandu-assistant.js',
  'css/arandu-system.css',
  'css/arandu-ui-rescue.css',
  'css/arandu-advanced-features.css',
  'api/[...path].js',
  'api/health.js',
  'vite.config.js',
  'vercel.json',
  'sitemap.xml',
  'robots.txt'
];

const currentPublicNav = ['Home', 'Comprar', 'Artistas', 'Confiança', 'Pesquisar', 'Narrativa', 'Entrar'];
const legacyPublicTargets = ['obras.html?', 'acervo.html?', 'proposta-curatorial.html?'];
const issues = [];
const warnings = [];
const metrics = [];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function attrValues(text, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*>`, 'gi');
  return [...text.matchAll(re)].map((match) => match[1]);
}
function baseRef(ref) { return String(ref || '').split('?')[0].split('#')[0]; }
function isExternal(ref) { return /^(https?:|mailto:|tel:|whatsapp:|#)/.test(ref || ''); }
function isOperationalPage(file) { return /^(painel|admin|demo|roadmap|configuracao|status|editor-registro|obra-editor|artista-editor|certificados-admin|kanban-comercial|funil-comercial|lead-detalhe|upload-imagens|catalogo-intake|operacao-obras|diagnostico)/i.test(file); }
function isPublicRequired(file) { return requiredPublicPages.includes(file) || requiredLegalPages.includes(file); }
function problem(file, message, critical = true) { (critical ? issues : warnings).push(file ? `${file}: ${message}` : message); }

function checkRequiredFiles() {
  [...requiredPublicPages, ...requiredOperationalPages, ...requiredLegalPages, ...requiredFiles].forEach((file) => {
    if (!exists(file)) problem('', `Arquivo obrigatório ausente: ${file}`);
  });
  const site = exists('js/site.js') ? read('js/site.js') : '';
  const loader = exists('js/arandu-loader.js') ? read('js/arandu-loader.js') : '';
  const vite = exists('vite.config.js') ? read('vite.config.js') : '';
  if (!site.includes('ensureHeaderNav')) problem('js/site.js', 'não restaura navegação pública');
  if (!site.includes('arandu-assistant.js')) problem('js/site.js', 'não injeta assistente Arandu');
  if (!loader.includes('disabledLegacyLayers')) problem('js/arandu-loader.js', 'loader seguro deve manter camadas legadas desativadas');
  if (!vite.includes('arandu-ui-rescue.css')) problem('vite.config.js', 'não injeta CSS de resgate global');
}

function checkHtml(file, html) {
  if (!/<html[^>]+lang=["']pt-BR["']/i.test(html)) problem(file, 'lang pt-BR ausente');
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) problem(file, 'viewport ausente');
  if (!/<title[\s>]/i.test(html)) problem(file, 'title ausente');
  if (!/<h1[\s>]/i.test(html) && !isOperationalPage(file)) problem(file, 'h1 ausente');
  if (!/<header[\s\S]*?<\/header>/i.test(html)) problem(file, 'header ausente');
  if (!/brand-logo|safe-logo/.test(html)) problem(file, 'logo/header sem marca navegável');
  if (!/site\.js/.test(html) && isPublicRequired(file)) problem(file, 'página pública crítica não carrega js/site.js');
  if (!/arandu-system\.css/.test(html)) problem(file, 'não carrega css/arandu-system.css');
  if (/\b(?:IA|I\.A\.|inteligência artificial)\b/i.test(html)) problem(file, 'contém menção indevida a tecnologia generativa');
  if (/lorem ipsum/i.test(html)) problem(file, 'contém Lorem Ipsum');
  legacyPublicTargets.forEach((target) => {
    if (html.includes(target)) warnings.push(`${file}: contém referência legada com query: ${target}`);
  });

  const refs = [...attrValues(html, 'script', 'src'), ...attrValues(html, 'link', 'href')]
    .map(baseRef)
    .filter((ref) => ref && !isExternal(ref));
  refs.forEach((ref) => { if (!exists(ref)) problem(file, `referência inexistente: ${ref}`); });

  attrValues(html, 'a', 'href').forEach((href) => {
    if (!href || href === '#' || isExternal(href)) return;
    const target = baseRef(href);
    if (target && !exists(target)) warnings.push(`${file}: link interno pode estar quebrado: ${href}`);
  });

  const scripts = attrValues(html, 'script', 'src');
  const styles = attrValues(html, 'link', 'href').filter((href) => href.includes('.css'));
  metrics.push({ file, scripts: scripts.length, styles: styles.length });
  const normalizedScripts = scripts.map(baseRef);
  const duplicated = normalizedScripts.filter((src, i) => normalizedScripts.indexOf(src) !== i);
  if (duplicated.length) problem(file, `scripts duplicados: ${[...new Set(duplicated)].join(', ')}`);
}

function checkScriptSyntax() {
  const scriptFiles = fs.readdirSync(path.join(root, 'js')).filter((f) => f.endsWith('.js'));
  scriptFiles.forEach((script) => {
    const rel = path.join('js', script);
    try {
      execFileSync(process.execPath, ['--check', path.join(root, rel)], { stdio: 'pipe' });
    } catch (error) {
      problem(rel, `erro de sintaxe JavaScript (${String(error.stderr || error.message).split('\n')[0]})`);
    }
  });
}

function checkNavigationContract() {
  const site = exists('js/site.js') ? read('js/site.js') : '';
  currentPublicNav.forEach((label) => {
    if (!site.includes(label)) problem('js/site.js', `menu público não contém ${label}`);
  });
  ['obras.html', 'acervo.html'].forEach((legacy) => {
    if (!site.includes(legacy)) warnings.push(`js/site.js: mapeamento legado não menciona ${legacy}`);
  });
}

checkRequiredFiles();
checkNavigationContract();
htmlFiles.forEach((file) => checkHtml(file, read(file)));
checkScriptSyntax();

const report = { checkedAt: new Date().toISOString(), htmlFiles: htmlFiles.length, issues, warnings, metrics };
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports', 'arandu-quality-report.json'), JSON.stringify(report, null, 2));

console.log('Arandu Quality Gate');
console.log(`HTML analisados: ${htmlFiles.length}`);
console.log(`Erros: ${issues.length}`);
console.log(`Alertas: ${warnings.length}`);
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
