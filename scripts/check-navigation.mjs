/**
 * Catraca de navegação.
 *
 * Os defeitos que esta checagem existe para impedir eram todos invisíveis para
 * as demais catracas, porque nenhuma olhava o que é realmente publicado:
 *
 * 1. `css/arandu-product.css` escondia `.header-inner > .site-nav` sem media
 *    query — nenhuma página tinha barra de navegação em desktop;
 * 2. dois scripts reconstruíam o mesmo `.site-nav`, duplicando "Pesquisar" e
 *    "Entrar" e apagando o rodapé de cada página;
 * 3. 21 links de páginas públicas levavam a páginas administrativas;
 * 4. 17 links apontavam para `docs/*.md`, que nunca é publicado;
 * 5. `portal-artista.html` não tinha um único link de entrada.
 *
 * Roda contra `dist/`, que é o que vai ao ar. Exige `npm run build` antes.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { INTERNAL_PAGE_SET } from '../lib/internal-pages.mjs';
import { FOOTER_COLUMNS, MENU_GROUPS, PRIMARY_NAV, SHELL_EXEMPT_PAGES, shellApplies } from '../lib/public-shell.mjs';
import { CONSOLE_GROUPS, consoleTargets } from '../lib/owner-console.mjs';
import { INTERNAL_PAGES } from '../lib/internal-pages.mjs';

const issues = [];
const root = process.cwd();
const dist = join(root, 'dist');

if (!existsSync(dist)) {
  console.error('dist/ ausente. Rode `npm run build` antes de `npm run check:navigation`.');
  process.exit(1);
}

const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const rewrites = vercel.rewrites || [];
const redirects = new Set((vercel.redirects || []).map((item) => String(item.source).replace(/^\//, '')));
const exactRewrites = new Set(rewrites.map((item) => String(item.source).replace(/^\//, '')).filter((source) => !source.includes(':')));
const patternRewrites = rewrites
  .map((item) => String(item.source).replace(/^\//, ''))
  .filter((source) => source.includes(':'))
  .map((source) => new RegExp(`^${source.replace(/:[A-Za-z]+\*?/g, '[^/]+')}$`));

const distPages = readdirSync(dist).filter((entry) => entry.endsWith('.html'));

function resolveHref(page, raw) {
  const href = raw.split('#')[0].split('?')[0];
  if (!href) return '';
  return href.startsWith('/') ? href.slice(1) : normalize(join(dirname(page), href));
}

function linksOf(html) {
  return [...html.matchAll(/\b(?:href|src)=['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((raw) => raw && !/^(https?:|mailto:|tel:|#|javascript:|data:)/.test(raw));
}

// --- 1. Nada publicado pode apontar para uma página administrativa ----------
// --- 2. Nada publicado pode apontar para um arquivo que não foi publicado ---
const inbound = new Map();
for (const page of distPages) {
  const html = readFileSync(join(dist, page), 'utf8');
  for (const raw of linksOf(html)) {
    const target = resolveHref(page, raw);
    if (!target) continue;
    inbound.set(target, (inbound.get(target) || 0) + (page === target ? 0 : 1));
    if (INTERNAL_PAGE_SET.has(target)) {
      issues.push(`${page} leva o visitante para a página administrativa ${target}.`);
      continue;
    }
    // `/docs/*` é servido atrás da sessão administrativa: de uma página pública
    // o link vira um desvio para o login do admin.
    if (target.startsWith('docs/')) {
      issues.push(`${page} leva o visitante para o manual protegido ${target}.`);
      continue;
    }
    if (target.startsWith('api/')) continue;
    if (exactRewrites.has(target) || redirects.has(target)) continue;
    if (patternRewrites.some((pattern) => pattern.test(target))) continue;
    if (!existsSync(join(dist, target))) {
      issues.push(`${page} referencia ${raw}, que não existe em dist/.`);
    }
  }
}

// --- 3. A casca pública tem um dono só -------------------------------------
const shellPages = distPages.filter((page) => shellApplies(page));
for (const page of shellPages) {
  const html = readFileSync(join(dist, page), 'utf8');
  const navCount = (html.match(/<nav class="site-nav"/g) || []).length;
  if (navCount !== 1) issues.push(`${page} tem ${navCount} barras de navegação no HTML publicado.`);
  if (!html.includes('class="site-actions"')) issues.push(`${page} saiu sem as ações de cabeçalho.`);
  if (!html.includes('data-mobile-menu-button')) issues.push(`${page} saiu sem o botão de menu.`);
  if (!html.includes('id="arandu-site-menu"')) issues.push(`${page} saiu sem o painel do menu.`);
  if (!html.includes('class="footer-grid"')) issues.push(`${page} saiu sem rodapé.`);
  if (!html.includes('class="footer-legal"')) issues.push(`${page} saiu sem a linha de privacidade e termos.`);
  if (!/src=["'][^"']*\/?js\/site\.js/.test(html)) issues.push(`${page} saiu sem js/site.js: o menu não abriria.`);
}
for (const page of SHELL_EXEMPT_PAGES) {
  if (!existsSync(join(root, page))) issues.push(`Página isenta de casca declarada e inexistente: ${page}.`);
}

// A lista do runtime precisa ser a mesma do build, senão a navegação muda
// sozinha assim que o JavaScript carrega.
const site = readFileSync(join(root, 'js/site.js'), 'utf8');
for (const [label, href] of PRIMARY_NAV) {
  if (!site.includes(`['${label}','${href}']`)) issues.push(`js/site.js não traz "${label}" (${href}) na barra principal.`);
}
for (const [, items] of MENU_GROUPS) {
  for (const [label, href] of items) {
    if (!site.includes(`['${label}','${href}']`)) issues.push(`js/site.js não traz "${label}" (${href}) no menu.`);
  }
}
for (const [, items] of FOOTER_COLUMNS) {
  for (const [, href] of items) {
    if (href !== 'login.html' && !site.includes(`'${href}'`)) issues.push(`js/site.js não traz ${href} no rodapé.`);
  }
}
const audit = readFileSync(join(root, 'js/arandu-interface-audit.js'), 'utf8');
if (/\.site-nav['"]?\s*\)?[\s\S]{0,80}innerHTML/.test(audit) || audit.includes('normalizeFooter')) {
  issues.push('js/arandu-interface-audit.js voltou a reconstruir a navegação ou o rodapé: a casca tem um dono só (js/site.js).');
}

// A barra não pode voltar a ser escondida fora de media query. Só conta a
// regra que esconde o próprio elemento da navegação em qualquer largura —
// esconder o 4º item ou um item excedente é decisão de layout, não o defeito.
function topLevelRules(css) {
  const rules = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    if (char === '{') {
      if (depth === 0) {
        const selector = css.slice(start, index).trim();
        const close = matchingBrace(css, index);
        if (!selector.startsWith('@')) rules.push({ selector, body: css.slice(index + 1, close) });
        index = close;
        start = index + 1;
        continue;
      }
      depth += 1;
      continue;
    }
    if (char === '}') { depth = Math.max(0, depth - 1); start = index + 1; }
  }
  return rules;
}

function matchingBrace(css, open) {
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    else if (css[index] === '}') { depth -= 1; if (depth === 0) return index; }
  }
  return css.length;
}

const NAV_ELEMENT = /(^|[\s>+~])\.(site-nav|safe-links|nav)$/;
for (const file of readdirSync(join(root, 'css')).filter((name) => name.endsWith('.css'))) {
  const css = readFileSync(join(root, 'css', file), 'utf8');
  for (const rule of topLevelRules(css)) {
    if (!/display\s*:\s*none/.test(rule.body)) continue;
    const parts = rule.selector.split(',').map((part) => part.trim()).filter(Boolean);
    if (!parts.length) continue;
    if (!parts.every((part) => NAV_ELEMENT.test(part))) continue;
    issues.push(`css/${file}: "${rule.selector.replace(/\s+/g, ' ')}" esconde a navegação em toda largura.`);
  }
}

// --- 4. Cada audiência tem porta de entrada --------------------------------
const ENTRY_POINTS = [
  ['portal-artista.html', 'portal do artista (vendedor)'],
  ['minha-conta.html', 'área do comprador'],
  ['minha-selecao.html', 'seleção do comprador'],
  ['para-artistas.html', 'submissão de portfólio'],
  ['login.html', 'entrada de conta'],
  ['cadastro.html', 'criação de conta']
];
for (const [page, role] of ENTRY_POINTS) {
  if (!existsSync(join(dist, page))) { issues.push(`Página de entrada ausente em dist/: ${page} (${role}).`); continue; }
  if ((inbound.get(page) || 0) < 1) issues.push(`Nenhuma página publicada leva a ${page} (${role}).`);
}
const entryReport = ENTRY_POINTS.map(([page]) => `${page}: ${inbound.get(page) || 0}`).join(' · ');

// --- 5. O console do proprietário alcança todas as telas internas ----------
const targets = new Set(consoleTargets());
const CONSOLE_HOME = 'admin.html';
for (const page of INTERNAL_PAGES) {
  if (page === CONSOLE_HOME) continue;
  if (!targets.has(page)) issues.push(`Página interna fora do console: ${page}.`);
}
for (const target of targets) {
  if (target.startsWith('docs/')) {
    const name = target.slice('docs/'.length);
    if (name !== 'README.md' && !existsSync(join(root, 'docs', name))) issues.push(`Console aponta para manual inexistente: ${target}.`);
    continue;
  }
  if (!INTERNAL_PAGE_SET.has(target)) issues.push(`Console aponta para ${target}, que não é uma página interna protegida.`);
}
for (const [title, items] of CONSOLE_GROUPS) {
  if (!items.length) issues.push(`Grupo do console sem telas: ${title}.`);
}

console.log('Arandu Navigation Check');
console.log(`Páginas publicadas: ${distPages.length} · com casca pública: ${shellPages.length}`);
console.log(`Telas internas no console: ${targets.size}`);
console.log(`Links de entrada por audiência — ${entryReport}`);
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);
console.log('Navegação publicada, casca única, entradas de audiência e console verificados.');
