/**
 * Casca pública canônica: cabeçalho, menu e rodapé iguais em toda página.
 *
 * O site tinha uma navegação diferente por página no HTML e dois scripts em
 * runtime reescrevendo o mesmo `.site-nav` com listas distintas. O visitante
 * via "Pesquisar" e "Entrar" duas vezes, a home tinha uma navegação e o resto
 * outra, e 48 páginas não tinham rodapé nenhum.
 *
 * A casca agora é emitida no build (aqui) e o runtime (js/site.js) só ajusta o
 * que depende da sessão e da seleção. Emitir no HTML evita o pisca entre a
 * navegação antiga e a nova, e mantém o site navegável sem JavaScript.
 *
 * `scripts/check-public-shell.mjs` compara estas listas com as de js/site.js:
 * as duas não podem divergir.
 */

/** Páginas de impressão e o login administrativo não usam a casca pública. */
export const SHELL_EXEMPT_PAGES = Object.freeze([
  'admin-login.html',
  'certificado-template.html',
  'proposta-curatorial-template.html',
  'selecao-curatorial-template.html',
  'proposta-publica.html'
]);

const SHELL_EXEMPT_SET = new Set(SHELL_EXEMPT_PAGES);

/** Barra principal. O CSS esconde o 4º item abaixo de 1080px: o menos crítico
 *  fica por último. */
export const PRIMARY_NAV = Object.freeze([
  ['Comprar arte', 'comprar-arte.html'],
  ['Artistas', 'artistas.html'],
  ['Para artistas', 'para-artistas.html'],
  ['Coleções', 'colecoes.html']
]);

/** Menu completo: é aqui que comprador, artista e empresa acham o caminho. */
export const MENU_GROUPS = Object.freeze([
  ['Explorar', Object.freeze([
    ['Início', 'index.html'],
    ['Comprar arte', 'comprar-arte.html'],
    ['Coleções', 'colecoes.html'],
    ['Artistas', 'artistas.html'],
    ['Pesquisar', 'pesquisa.html'],
    ['Narrativa', 'narrativa.html']
  ])],
  ['Caminhos', Object.freeze([
    ['Sou artista', 'para-artistas.html'],
    ['Portal do artista', 'portal-artista.html'],
    ['Empresas e arquitetos', 'empresas-e-arquitetos.html'],
    ['Portal de empresas', 'portal-empresa.html'],
    ['Confiança', 'confianca.html'],
    ['Verificar certificado', 'verificar-certificado.html']
  ])]
]);

export const FOOTER_COLUMNS = Object.freeze([
  ['Explorar', Object.freeze([
    ['Comprar arte', 'comprar-arte.html'],
    ['Coleções', 'colecoes.html'],
    ['Artistas', 'artistas.html'],
    ['Pesquisar', 'pesquisa.html']
  ])],
  ['Caminhos', Object.freeze([
    ['Sou artista', 'para-artistas.html'],
    ['Portal do artista', 'portal-artista.html'],
    ['Empresas e arquitetos', 'empresas-e-arquitetos.html'],
    ['Portal de empresas', 'portal-empresa.html']
  ])],
  ['Conta e confiança', Object.freeze([
    ['Entrar', 'login.html'],
    ['Minha seleção', 'minha-selecao.html'],
    ['Confiança', 'confianca.html'],
    ['Verificar certificado', 'verificar-certificado.html']
  ])]
]);

export const FOOTER_LEGAL = Object.freeze([
  ['Política de privacidade', 'politica-de-privacidade.html'],
  ['Termos de uso', 'termos-de-uso.html'],
  ['Cookies', 'cookies.html'],
  ['Falar com a curadoria', 'contato.html']
]);

const FOOTER_TAGLINE = 'Arte brasileira contemporânea com curadoria, território e procedência.';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function link(href, label, currentPage, className = '') {
  const active = href.split('?')[0].split('#')[0] === currentPage;
  const classes = [className, active ? 'is-active' : ''].filter(Boolean).join(' ');
  return `<a${classes ? ` class="${classes}"` : ''} href="${escapeHtml(href)}"${active ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`;
}

export function renderHeader(currentPage) {
  const nav = PRIMARY_NAV.map(([label, href]) => link(href, label, currentPage)).join('');
  return '<header class="site-header"><div class="container header-inner">'
    + '<a class="brand-logo" href="index.html">Arandu</a>'
    + `<nav class="site-nav" aria-label="Navegação principal">${nav}</nav>`
    + '<div class="site-actions">'
    + link('pesquisa.html', 'Pesquisar', currentPage, 'search-entry')
    + link('login.html', 'Entrar', currentPage, 'auth-entry')
    + '<button class="menu-toggle" type="button" data-mobile-menu-button aria-expanded="false" aria-controls="arandu-site-menu" aria-label="Abrir menu de navegação">Menu</button>'
    + '</div></div>'
    + renderMenuPanel(currentPage)
    + '</header>';
}

export function renderMenuPanel(currentPage) {
  const groups = MENU_GROUPS.map(([title, items]) =>
    `<p class="menu-group">${escapeHtml(title)}</p>${items.map(([label, href]) => link(href, label, currentPage)).join('')}`
  ).join('');
  const account = '<p class="menu-group">Conta</p>'
    + link('minha-selecao.html', 'Minha seleção', currentPage)
    + link('login.html', 'Entrar', currentPage, 'auth-entry')
    + link('cadastro.html', 'Criar conta', currentPage)
    + link('contato.html', 'Falar com a curadoria', currentPage);
  return `<div class="mobile-menu-panel" id="arandu-site-menu" hidden>${groups}${account}</div>`;
}

export function renderFooter(currentPage) {
  const columns = FOOTER_COLUMNS.map(([title, items]) =>
    `<div><p>${escapeHtml(title)}</p>${items.map(([label, href]) => link(href, label, currentPage)).join('')}</div>`
  ).join('');
  const legal = FOOTER_LEGAL.map(([label, href]) => link(href, label, currentPage)).join(' · ');
  return '<footer class="site-footer"><div class="container">'
    + `<div class="footer-grid"><div><h2>Arandu</h2><p>${escapeHtml(FOOTER_TAGLINE)}</p></div>${columns}</div>`
    + `<div class="footer-legal">${legal}</div>`
    + '</div></footer>';
}

const HEADER_PATTERN = /<header\b[^>]*class="[^"]*(?:site-header|safe-header)[^"]*"[\s\S]*?<\/header>/i;
const FOOTER_PATTERN = /<footer\b[^>]*class="[^"]*(?:site-footer|safe-footer)[^"]*"[\s\S]*?<\/footer>/i;

export function shellApplies(pageName) {
  return Boolean(pageName) && !SHELL_EXEMPT_SET.has(pageName);
}

/**
 * Troca cabeçalho e rodapé da página pela casca canônica. Sem rodapé no
 * documento, insere um: 48 páginas públicas não tinham nenhum, e sem rodapé a
 * pessoa que chega pelo meio do site não tem segunda saída.
 */
export function applyPublicShell(html, pageName) {
  if (!shellApplies(pageName)) return html;
  let output = html;
  if (HEADER_PATTERN.test(output)) output = output.replace(HEADER_PATTERN, renderHeader(pageName));
  const footer = renderFooter(pageName);
  if (FOOTER_PATTERN.test(output)) output = output.replace(FOOTER_PATTERN, footer);
  else if (output.includes('</body>')) output = output.replace('</body>', `${footer}</body>`);
  else output += footer;
  return output;
}
