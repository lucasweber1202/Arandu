/**
 * Console do proprietário: uma navegação só para as 51 páginas internas.
 *
 * Cada painel tinha o seu próprio cabeçalho improvisado, e quatro páginas
 * disputavam o papel de início (`admin.html`, `painel.html`,
 * `painel-admin.html`, `operacao.html`). Não havia como saber onde se está,
 * o que existe, nem como voltar — várias telas só eram alcançáveis digitando
 * a URL. Este módulo emite a mesma barra em toda página interna, marca a
 * página atual, mostra o grupo aberto e oferece o mapa completo.
 *
 * A barra é montada no servidor (api/internal-page.js) porque as páginas
 * internas não passam pelo build do Vite: elas são lidas do disco e servidas
 * atrás da sessão administrativa.
 */

/** Grupos na ordem em que o trabalho acontece: o que entra, o que é publicado,
 *  o que é vendido, o que é garantido, o que é operado e o que é configurado. */
export const CONSOLE_GROUPS = Object.freeze([
  ['Entradas', Object.freeze([
    ['Submissões', 'painel-submissoes.html'],
    ['Leads', 'painel-leads.html'],
    ['Briefings', 'painel-briefings.html'],
    ['Prospecção', 'prospeccao-artistas.html'],
    ['Detalhe do lead', 'lead-detalhe.html']
  ])],
  ['Catálogo', Object.freeze([
    ['Obras', 'painel-obras.html'],
    ['Artistas', 'painel-artistas.html'],
    ['Cadastros', 'painel-cadastros.html'],
    ['Editor de obra', 'obra-editor.html'],
    ['Editor de artista', 'artista-editor.html'],
    ['Onboarding do artista', 'onboarding-artista.html'],
    ['Coleções', 'colecoes-admin.html'],
    ['Importar CSV', 'catalogo-intake.html'],
    ['Revisão editorial', 'revisao-catalogo.html'],
    ['Qualidade', 'painel-qualidade.html'],
    ['Diagnóstico', 'diagnostico-catalogo.html'],
    ['Imagens', 'upload-imagens.html'],
    ['Operação de obras', 'operacao-obras.html'],
    ['Histórico da obra', 'historico-obra.html'],
    ['Histórico do artista', 'historico-artista.html'],
    ['Calendário editorial', 'calendario-editorial.html']
  ])],
  ['Comercial', Object.freeze([
    ['Propostas', 'painel-propostas.html'],
    ['Reservas', 'painel-reservas.html'],
    ['Pedidos', 'painel-pedidos.html'],
    ['Funil', 'funil-comercial.html'],
    ['Kanban', 'kanban-comercial.html'],
    ['Editor de propostas', 'propostas-admin.html'],
    ['Proposta em PDF', 'proposta-pdf.html'],
    ['Editor de registro', 'editor-registro.html'],
    ['Benchmark', 'benchmark-conversao.html'],
    ['Modelos de mensagem', 'templates-comunicacao.html']
  ])],
  ['Confiança', Object.freeze([
    ['Certificados', 'painel-certificados.html'],
    ['Emitir certificado', 'certificados-admin.html'],
    ['Certificado imprimível', 'certificado-imprimivel.html']
  ])],
  ['Operação', Object.freeze([
    ['Tarefas', 'painel-tarefas.html'],
    ['Visão geral', 'painel.html'],
    ['Backoffice', 'operacao.html'],
    ['Backoffice clássico', 'painel-admin.html'],
    ['MVP', 'painel-mvp.html'],
    ['Roteiro do MVP', 'mvp-operacional.html'],
    ['Piloto', 'painel-piloto.html'],
    ['Sessões do piloto', 'piloto.html']
  ])],
  ['Sistema', Object.freeze([
    ['Status técnico', 'status.html'],
    ['Lançamento', 'lancamento.html'],
    ['Checklist', 'checklist-lancamento.html'],
    ['Go-live', 'go-live.html'],
    ['Domínio', 'dominio-go-live.html'],
    ['Configuração', 'configuracao.html'],
    ['Prévia pública', 'admin-preview.html'],
    ['Demonstração', 'demo.html'],
    ['Manuais', 'docs/README.md']
  ])]
]);

const HOME_PAGE = 'admin.html';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function groupOf(page) {
  for (const [title, items] of CONSOLE_GROUPS) {
    if (items.some(([, href]) => href === page)) return title;
  }
  return '';
}

function href(target) {
  return target.startsWith('docs/') ? `/${target}` : `/${target}`;
}

function item(label, target, currentPage) {
  const active = target === currentPage;
  return `<a href="${escapeHtml(href(target))}"${active ? ' class="is-active" aria-current="page"' : ''}>${escapeHtml(label)}</a>`;
}

/**
 * Barra do console. Linha 1: marca, grupos e sair. Linha 2: as telas do grupo
 * aberto, para o trabalho do dia ficar a um clique. O mapa completo fica no
 * `<details>`, para quem precisa de uma tela fora do grupo.
 */
export function renderConsole(currentPage) {
  const current = groupOf(currentPage);
  const groups = CONSOLE_GROUPS.map(([title, items]) => {
    const open = title === current;
    const target = items[0][1];
    return `<a href="${escapeHtml(href(target))}"${open ? ' class="is-open"' : ''}>${escapeHtml(title)}</a>`;
  }).join('');

  const openGroup = CONSOLE_GROUPS.find(([title]) => title === current);
  const subnav = openGroup
    ? `<div class="owner-console-sub" aria-label="Telas de ${escapeHtml(openGroup[0])}">${openGroup[1].map(([label, target]) => item(label, target, currentPage)).join('')}</div>`
    : '';

  const map = CONSOLE_GROUPS.map(([title, items]) =>
    `<div><p>${escapeHtml(title)}</p>${items.map(([label, target]) => item(label, target, currentPage)).join('')}</div>`
  ).join('');

  return '<div class="owner-console" data-owner-console>'
    + '<nav class="owner-console-bar" aria-label="Console de operação">'
    + `<a class="owner-console-home${currentPage === HOME_PAGE ? ' is-active' : ''}" href="/${HOME_PAGE}">Arandu · Console</a>`
    + `<div class="owner-console-groups">${groups}</div>`
    + '<div class="owner-console-actions">'
    + '<a href="/index.html">Ver o site</a>'
    + '<button type="button" data-auth-logout>Sair</button>'
    + '</div></nav>'
    + subnav
    + `<details class="owner-console-map"><summary>Todas as telas</summary><div class="owner-console-map-grid">${map}</div></details>`
    + '</div>';
}

/** Todos os destinos declarados, para o gate conferir que nada ficou de fora. */
export function consoleTargets() {
  return CONSOLE_GROUPS.flatMap(([, items]) => items.map(([, target]) => target));
}
