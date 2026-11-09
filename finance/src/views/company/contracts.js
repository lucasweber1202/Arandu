// Contratos: ciclo de vida, próxima ação e entrada para o centro de contrato.
// Extraído de company.js (v7.0): uma capability por módulo e rota.

import { el, icon, formatDate, relativeDays, daysUntil, plural, productLabel, CONTRACT_STATUS, todayIso, renewalStage, textSpan } from '../../core.js';
import { pill, tag, button, emptyState, toast, confirmDialog, mutedText, toastError } from '../../ui.js';
import { memberName } from '../shared/people.js';
import { lazyDocuments } from '../shared/documents.js';
import { CONTRACT_CATEGORIES } from '../../../../lib/finance/contract-terms.mjs';
import { loadEntities, entityContextSelect, inContext, contractEntityControl, entityName } from '../entities.js';
import { mods, need } from './capabilities.js';
import { renewalButton } from '../contract-center/renewal.js';
import { contractExceptions, CONTRACT_EXCEPTIONS, readPortfolioFilters, writePortfolioFilters, PORTFOLIO_FILTERS, filterContracts, exceptionCounts, institutionSummary } from '../../../../lib/finance/contract-portfolio.mjs';

function lifecycleBar(contract) {
  const start = Date.parse(`${contract.starts_on}T00:00:00Z`);
  const end = Date.parse(`${contract.ends_on}T00:00:00Z`);
  const today = Date.parse(`${todayIso()}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return mutedText('Datas de vigência incompletas.');
  const pos = (time) => `${Math.max(0, Math.min(100, ((time - start) / (end - start)) * 100)).toFixed(2)}%`;
  const notice = end - Number(contract.renewal_notice_days || 0) * 86400000;
  const opens = Date.parse(`${renewalStage(contract).opensAt}T00:00:00Z`);
  const marks = [['90 dias', end - 90 * 86400000], ['60 dias', end - 60 * 86400000], ['30 dias', end - 30 * 86400000]].filter(([, time]) => time > start);
  const bar = el('div', { class: 'life-track' }, [
    el('span', { class: 'life-elapsed', style: `width:${pos(today)}` }),
    el('span', { class: 'life-window', style: `left:${pos(opens)};width:calc(${pos(notice)} - ${pos(opens)})`, title: 'Janela de decisão (até o aviso prévio)' }),
    el('span', { class: 'life-after', style: `left:${pos(notice)};width:calc(100% - ${pos(notice)})`, title: 'Depois do prazo de aviso prévio' }),
    ...marks.map(([label, time]) => el('span', { class: `life-mark${today >= time ? ' reached' : ''}`, style: `left:${pos(time)}`, title: `${label} antes do vencimento` })),
    el('span', { class: 'life-notice', style: `left:${pos(notice)}`, title: 'Data limite do aviso prévio' }),
    today >= start && today <= end ? el('span', { class: 'life-today', style: `left:${pos(today)}` }, el('span', { class: 'life-today-label', text: 'Hoje' })) : null
  ]);
  const legend = el('ol', { class: 'life-legend' }, [
    ['Início', contract.starts_on, today >= start], ['90 dias', new Date(end - 90 * 86400000).toISOString().slice(0, 10), today >= end - 90 * 86400000],
    ['60 dias', new Date(end - 60 * 86400000).toISOString().slice(0, 10), today >= end - 60 * 86400000], ['30 dias', new Date(end - 30 * 86400000).toISOString().slice(0, 10), today >= end - 30 * 86400000],
    ['Aviso prévio', new Date(notice).toISOString().slice(0, 10), today >= notice], ['Vencimento', contract.ends_on, today >= end]
  ].filter(([, date]) => date >= contract.starts_on).sort((a, b) => a[1].localeCompare(b[1]) || (a[0] === 'Aviso prévio' ? -1 : 1))
    // Marcos na mesma data (aviso prévio de 60 dias = marco de 60 dias) viram um rótulo só, sem data repetida.
    .reduce((list, point) => { const last = list.at(-1); if (last && last[1] === point[1]) last[0] = `${last[0]} · ${point[0]}`; else list.push([...point]); return list; }, [])
    .map(([label, date, reached]) => el('li', { class: `life-point${reached ? ' reached' : ''}` }, [el('span', { class: 'life-point-label', text: label }), el('span', { class: 'life-point-date', text: formatDate(date, { withYear: 'auto' }) }), reached ? el('span', { class: 'sr-only', text: '(alcançado)' }) : null])));
  return el('div', { class: 'lifecycle-bar', role: 'img', 'aria-label': `Vigência de ${formatDate(contract.starts_on)} a ${formatDate(contract.ends_on)}; aviso prévio em ${formatDate(new Date(notice).toISOString().slice(0, 10))}` }, [bar, legend]);
}

// Dias até o vencimento pelo calendário de quem lê (daysUntil), a mesma conta
// do Painel. O days_to_end da API arredonda a partir do instante da requisição
// e, à tarde, dá um dia a menos que o Painel para o mesmo contrato.
function contractDays(contract) {
  const days = daysUntil(contract.ends_on);
  if (days === null || !['active', 'renewing'].includes(contract.status)) return null;
  return el('span', { class: `contract-days${days <= 60 ? ' warn' : ''}`, text: days === 0 ? 'vence hoje' : days === 1 ? 'vence amanhã' : days > 1 ? `vence em ${days} dias` : 'vencido' });
}

function contractNextAction(contract) {
  if (!['active', 'renewing'].includes(contract.status)) return { tone: 'neutral', icon: 'clock', text: 'Contrato encerrado. Mantido para histórico.' };
  const stage = renewalStage(contract);
  if (contract.status === 'renewing' && stage.stage !== 'past_notice') return { tone: 'info', icon: 'repeat', text: `Nova concorrência em andamento. Compare as propostas antes do aviso prévio (${formatDate(stage.deadline)}).` };
  if (stage.stage === 'window') return { tone: 'warning', icon: 'alert', text: `Janela de renovação aberta. Decida até ${formatDate(stage.deadline)} (${relativeDays(stage.deadline)}, prazo do aviso prévio) se renova, renegocia ou troca.`, cta: true };
  if (stage.stage === 'past_notice') return { tone: 'danger', icon: 'alert', text: `O prazo do aviso prévio passou em ${formatDate(stage.deadline)}. Negocie com o provedor ou prepare a substituição antes do vencimento (${formatDate(contract.ends_on)}).`, cta: true };
  if (stage.stage === 'expired') return { tone: 'neutral', icon: 'clock', text: 'Vigência encerrada. Atualize o status do contrato.' };
  return { tone: 'success', icon: 'checkCircle', text: `Nada a fazer agora. A janela de decisão abre ${relativeDays(stage.opensAt)} (${formatDate(stage.opensAt)}).` };
}

// Pós-contratação a um clique: implantação e obrigações DESTE contrato. A API
// filtra por contract_id (#211) e a página de destino diz o recorte aplicado.
function contractLifecycleLinks(ctx, contract) {
  if (!['active', 'renewing'].includes(contract.status)) return null;
  // contract_id vai à API; contrato só diz à página de onde a pessoa veio.
  const query = new URLSearchParams({ contract_id: contract.id, contrato: contract.id });
  const who = contract.provider_name || 'esta instituição';
  return el('nav', { class: 'contract-lifecycle-links', 'aria-label': `Pós-contratação do contrato com ${who}` }, [
    el('a', { class: 'contract-link', href: ctx.href(`/finance/implementations.html?${query}`) }, [textSpan('Implantação deste contrato'), icon('arrowRight', { size: 14 })]),
    el('a', { class: 'contract-link', href: ctx.href(`/finance/covenants.html?${query}`) }, [textSpan('Covenants e obrigações deste contrato'), icon('arrowRight', { size: 14 })])
  ]);
}

export async function contracts(ctx) {
  const [entities] = await Promise.all([loadEntities(ctx), need('contractCenter')]);
  // A visão geral traz até OVERVIEW_CONTRACT_CAP contratos. No limite, a carteira
  // é lida inteira pela consulta paginada (servidor, keyset): nunca uma visão
  // aparentemente completa que seja só a primeira página.
  const coverage = await portfolioCoverage(ctx);
  const rows = coverage.rows.filter((row) => inContext(entities, row));
  const requestedId = location.hash.startsWith('#contract-') ? location.hash.slice('#contract-'.length) : null;
  if (new URLSearchParams(location.search).get('abrir') === 'contrato' && requestedId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedId)) {
    const known = rows.find(row => row.id === requestedId);
    if (known) queueMicrotask(() => mods.contractCenter.openContract(ctx, known));
    else if (!(ctx.data.contracts || []).some(row => row.id === requestedId)) {
      // Um contrato fora do recorte recente continua acessível pelo endpoint
      // existente, sem aceitar objeto de outra organização/entidade em foco.
      ctx.api(`contract-detail?id=${encodeURIComponent(requestedId)}`).then(detail => {
        if (detail.contract?.id !== requestedId || detail.contract?.organization_id !== ctx.organization.id || !inContext(entities, detail.contract)) throw new Error('Contrato indisponível neste contexto.');
        mods.contractCenter.openContract(ctx, detail.contract, { initialDetail: detail });
      }).catch(error => toastError(error));
    }
  }
  const manage = ctx.can('create_rfq');
  const refresh = manage ? button('Atualizar marcos de renovação', { size: 'sm', iconName: 'refresh', onClick: async (event) => {
    const target = event.currentTarget;
    target.disabled = true;
    try {
      const result = await ctx.send('renewals', { organization_id: ctx.organization.id });
      toast(result.tasks_created ? `${plural(result.tasks_created, 'tarefa de renovação criada', 'tarefas de renovação criadas')}.` : 'Marcos em dia. Nenhuma tarefa nova.');
      if (result.tasks_created) ctx.reload();
    } catch (error) { toastError(error); } finally { target.disabled = false; }
  } }) : null;
  const context = entityContextSelect(entities, { onChange: () => ctx.rerender() });
  const importButton = mods.contractCenter.importContractButton(ctx, entities);
  ctx.header({ title: 'Contratos e renovações', subtitle: 'Termos versionados, aditivos, marcos próprios, aviso prévio e próxima ação de cada contrato.', actions: [context, button('Catálogo de produtos', { iconName: 'layers', attrs: { 'data-intent': 'catalogo' }, onClick: () => import('../product-catalog.js').then((m) => m.openProductCatalog(ctx)) }), importButton, refresh].filter(Boolean) });
  // Filtro de entidade sem contrato não é carteira vazia: diz o recorte e não oferece o "primeiro" registro.
  if (!rows.length && (ctx.data.contracts || []).length) return emptyState({ title: 'Nenhum contrato nesta entidade', text: ctx.can('create_rfq') ? 'Há contratos carregados em outras entidades do grupo. Troque a entidade no seletor acima ou registre um contrato desta entidade.' : 'Há contratos carregados em outras entidades do grupo. Troque a entidade no seletor acima para vê-los.', iconName: 'briefcase',
    action: mods.contractCenter.importContractButton(ctx, entities) });
  if (!rows.length && !ctx.can('create_rfq')) return emptyState({ title: 'Nenhum contrato registrado ainda', text: 'Quando a equipe registrar contratos, você acompanha aqui vigência, aviso prévio e próxima ação. Registrar contratos fica com administração e gestão financeira.', iconName: 'briefcase' });
  if (!rows.length) return emptyState({ title: 'Nenhum contrato registrado ainda', text: 'Registre os contratos que a empresa já tem com vigência e aviso prévio: o Arandu abre a tarefa de revisão da renovação e acompanha os marcos. Contratos de uma concorrência no Arandu entram pela decisão.', iconName: 'briefcase',
    action: mods.contractCenter.importContractButton(ctx, entities, { label: 'Registrar o primeiro contrato', variant: 'primary' }) });
  const ordered = [...rows].sort((a, b) => (['active', 'renewing'].includes(b.status) - ['active', 'renewing'].includes(a.status)) || String(a.review_from).localeCompare(String(b.review_from)));
  // Destaque por âncora (#contract-…) ou pelo link de origem da implantação (?id=…).
  const focusId = location.hash.startsWith('#contract-') ? location.hash.slice('#contract-'.length) : new URLSearchParams(location.search).get('id');
  const card = (contract) => {
    const next = contractNextAction(contract);
    // Só crédito e adquirência têm concorrência no Arandu. Em renovação, o
    // mesmo botão leva à concorrência já aberta a partir deste contrato.
    const restart = renewalButton(ctx, contract, { variant: next.cta ? 'primary' : 'secondary' });
    // O contrato guarda a decisão (decision_id), não a solicitação: a origem é
    // a solicitação cuja decisão registrada é a deste contrato.
    const source = contract.decision_id ? (ctx.data.rfqs || []).find((rfq) => rfq.decision_id && rfq.decision_id === contract.decision_id) : null;
    return (el('article', { class: `contract-card${focusId === contract.id ? ' highlighted' : ''}`, id: `contract-${contract.id}`, tabindex: '-1', dataset: { entity: 'contract', id: contract.id } }, [
      el('header', { class: 'contract-head' }, [
        el('div', {}, [
          el('p', { class: 'contract-kicker', text: `${CONTRACT_CATEGORIES[contract.product] || productLabel(contract.product)}${source ? ` · ${source.title}` : contract.title ? ` · ${contract.title}` : ''}` }),
          el('h2', { class: 'contract-title', text: contract.provider_name || 'Provedor' }),
          entities.rows.length ? el('p', { class: 'contract-entity', 'aria-label': `Entidade: ${entityName(entities, contract.legal_entity_id)}` }, contractEntityControl(ctx, entities, contract)) : null
        ]),
        el('div', { class: 'contract-status' }, [pill(CONTRACT_STATUS[contract.status]), contractDays(contract)])
      ]),
      ['active', 'renewing'].includes(contract.status) ? lifecycleBar(contract) : null,
      ctx.mode === 'demo' ? null : (() => { const list = contractExceptions(contract, todayIso()); return list.length ? el('ul', { class: 'tag-list contract-exceptions', 'aria-label': 'Pendências do registro' }, list.map((k) => el('li', { title: CONTRACT_EXCEPTIONS[k].hint }, tag(CONTRACT_EXCEPTIONS[k].label, ['past_notice', 'expired'].includes(k) ? 'danger' : ['window'].includes(k) ? 'warning' : 'neutral')))) : null; })(),
      el('div', { class: `next-action-box tone-${next.tone}` }, [icon(next.icon, { size: 16 }), el('span', { class: 'next-action-label', text: 'Próxima ação' }), el('span', { class: 'next-action-text', text: next.text }), restart]),
      el('dl', { class: 'deflist deflist-3' }, [
        ['Vigência', `${formatDate(contract.starts_on)} → ${formatDate(contract.ends_on)}`], ['Prazo do aviso prévio', `${contract.renewal_notice_days} dias antes do fim · ${formatDate(contract.review_from)}`],
        // Quem responde pelo contrato: a renovação e os marcos têm dono.
        ['Responsável pelo contrato', !contract.owner_id ? 'Não informado' : (ctx.members || []).some((row) => row.user_id === contract.owner_id) ? `${memberName(ctx.members, contract.owner_id)}${contract.owner_id === ctx.viewer?.id ? ' (você)' : ''}` : 'Pessoa sem acesso atual à organização'],
        ['Custo registrado', contract.cost_summary || 'Não informado'], contract.main_conditions ? ['Condições', contract.main_conditions] : null,
        contract.document_reference ? ['Documento', contract.document_reference] : null
      ].filter(Boolean).map(([label, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: label }), el('dd', { class: value === 'Não informado' ? 'missing' : '', text: value })]))),
      el('div', { class: 'contract-open' }, [button('Abrir contrato: termos, aditivos e marcos', { size: 'sm', iconName: 'file', onClick: () => mods.contractCenter.openContract(ctx, contract) }),
        contract.origin === 'imported' ? tag('Carteira existente') : null, contract.current_version ? tag(`Termos v${contract.current_version}`, 'accent') : tag('Termos não estruturados', 'warning'),
        source ? el('a', { class: 'contract-link contract-origin', href: ctx.href(`/finance/rfq.html?id=${source.id}#decisao`) }, [textSpan('Ver processo e decisão de origem'), icon('arrowRight', { size: 14 })]) : null]),
      lazyDocuments(ctx, 'contract', contract.id, 'Documentos do contrato', { canUpload: ctx.can('upload_document') }),
      contractLifecycleLinks(ctx, contract)
    ]));
  };
  // Sandbox legado (/demo): sem capability nova (CLAUDE.md); mantém a lista simples.
  if (ctx.mode === 'demo') {
    const root = el('div', { class: 'stack' }, ordered.map(card));
    if (focusId) queueMicrotask(() => { const target = document.getElementById(`contract-${focusId}`); target?.scrollIntoView({ block: 'start' }); target?.focus({ preventScroll: true }); });
    return root;
  }
  return portfolioControlTower(ctx, ordered, { card, focusId, entities, coverage });
}

// ------------------------------------------------- carteira (control tower)
// Filtros na URL (?provider_id, product, status, owner, excecao, q): o link de
// uma instituição abre a carteira já recortada, e voltar/recarregar preserva o
// recorte. Exceções são fatos do registro (lib/finance/contract-portfolio.mjs).
export const OVERVIEW_CONTRACT_CAP = 200;
export const CARD_PAGE = 50;
export const PORTFOLIO_MAX_PAGES = 50;
/** Carteira completa: a da visão geral, ou todas as páginas quando a visão geral bateu no limite. */
export async function portfolioCoverage(ctx) {
  const base = ctx.data.contracts || [];
  if (ctx.mode === 'demo' || base.length < OVERVIEW_CONTRACT_CAP) return { rows: base, state: 'complete', total: base.length };
  const rows = [];
  let after = null;
  let pages = 0;
  try {
    do {
      const page = await ctx.api(`contracts?${new URLSearchParams({ organization_id: ctx.organization.id, paged: '1', limit: '100', ...(after ? { after } : {}) })}`);
      rows.push(...(page.rows || []));
      after = page.next || null;
      pages += 1;
    } while (after && pages < PORTFOLIO_MAX_PAGES);
  } catch (error) {
    // Falha da leitura completa: mostra o que a visão geral trouxe e diz que é parcial.
    return { rows: base, state: 'failed', total: base.length, error };
  }
  return { rows, state: after ? 'capped' : 'complete', total: rows.length };
}

function coverageNote(coverage) {
  if (coverage.state === 'failed') return el('p', { class: 'callout callout-warning compact', role: 'alert', 'data-coverage': 'failed' }, [icon('alert', { size: 14 }), textSpan(`Não conseguimos ler a carteira completa; a lista mostra os primeiros ${coverage.total} contratos e as contagens valem só para eles.`)]);
  if (coverage.state === 'capped') return el('p', { class: 'callout callout-info compact', 'data-coverage': 'capped' }, [icon('info', { size: 14 }), textSpan(`Carteira grande: mostrando os primeiros ${coverage.total} contratos. Use os filtros de instituição, produto ou situação para recortar.`)]);
  return null;
}

function portfolioControlTower(ctx, ordered, { card, focusId, coverage = { state: 'complete' } }) {
  const today = todayIso();
  const exceptions = new Map(ordered.map((c) => [c.id, contractExceptions(c, today)]));
  const providers = [...new Map(ordered.filter((c) => c.provider_id).map((c) => [c.provider_id, { id: c.provider_id, name: c.provider_name || 'Instituição' }])).values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const products = [...new Set(ordered.map((c) => c.product).filter(Boolean))];
  const owners = [...new Set(ordered.map((c) => c.owner_id).filter(Boolean))].filter((id) => (ctx.members || []).some((m) => m.user_id === id));
  const filters = readPortfolioFilters(location.search, { providers, products, members: owners.map((user_id) => ({ user_id })) });
  const select = (key, label, options) => {
    const control = el('select', { class: 'input', 'aria-label': label, name: key });
    for (const [value, text] of options) control.add(new Option(text, value));
    control.value = filters[key];
    control.addEventListener('change', () => { filters[key] = control.value; draw(); });
    return control;
  };
  const search = el('input', { type: 'search', class: 'input', placeholder: 'Buscar contrato ou instituição…', value: filters.q, 'aria-label': 'Buscar contrato ou instituição' });
  search.addEventListener('input', () => { filters.q = search.value.slice(0, 80); draw(); });
  const controls = {
    provider_id: select('provider_id', 'Instituição', [['', 'Todas as instituições'], ...providers.map((p) => [p.id, p.name])]),
    product: select('product', 'Produto', [['', 'Todos os produtos'], ...products.map((k) => [k, CONTRACT_CATEGORIES[k] || productLabel(k)])]),
    status: select('status', 'Situação', [['', 'Qualquer situação'], ['live', 'Vigentes'], ['active', 'Ativos'], ['renewing', 'Em renovação'], ['ended', 'Encerrados']]),
    owner: select('owner', 'Responsável', [['', 'Qualquer responsável'], ['none', 'Sem responsável'], ...owners.map((id) => [id, memberName(ctx.members, id)])])
  };
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Pendências da carteira' });
  const summary = el('section', { class: 'card portfolio-institutions', 'aria-labelledby': 'carteira-inst' });
  const count = el('p', { class: 'result-count', role: 'status', 'aria-live': 'polite' });
  const list = el('div', { class: 'stack contract-list' });
  const clear = button('Limpar filtros', { size: 'sm', variant: 'ghost', onClick: () => { for (const k of Object.keys(filters)) filters[k] = ''; search.value = ''; for (const [k, c] of Object.entries(controls)) c.value = filters[k]; draw(); } });
  const cards = new Map();
  // Deep link (#contract-…) para um contrato além dos primeiros: renderiza até ele.
  let shown = Math.max(CARD_PAGE, focusId ? ordered.findIndex((c) => c.id === focusId) + 1 : 0);
  const cardFor = (c) => { if (!cards.has(c.id)) cards.set(c.id, card(c)); return cards.get(c.id); };

  function draw() {
    const scoped = filterContracts(ordered, { ...filters, excecao: '' }, exceptions);
    const counts = exceptionCounts(scoped, exceptions);
    chips.replaceChildren(...[['', 'Todos', scoped.length, 'Todos os contratos do recorte'], ['any', 'Com pendência', counts.any, 'Contratos vigentes com ao menos uma pendência'],
      ...counts.items.map((i) => [i.key, i.label, i.count, i.hint])].map(([key, label, n, hint]) => {
      const chip = el('button', { type: 'button', class: 'chip', title: hint, 'aria-pressed': String(filters.excecao === key), dataset: { excecao: key } }, [textSpan(label), el('span', { class: 'chip-count', text: String(n) })]);
      chip.addEventListener('click', () => { filters.excecao = filters.excecao === key ? '' : key; draw(); });
      return chip;
    }));
    // Instituições do recorte (sem o filtro de instituição): leva à carteira dela e ao relacionamento.
    const inst = institutionSummary(filterContracts(ordered, { ...filters, provider_id: '', excecao: '' }, exceptions), exceptions).slice(0, 8);
    summary.replaceChildren(el('h2', { class: 'card-title', id: 'carteira-inst', text: 'Por instituição' }),
      inst.length ? el('ul', { class: 'mini-list', role: 'list' }, inst.map((r) => el('li', { class: `mini-row${filters.provider_id === r.providerId ? ' selected' : ''}`, dataset: { provider: r.providerId } }, [
        el('div', { class: 'mini-main' }, [
          el('button', { type: 'button', class: 'link-button mini-title', 'aria-pressed': String(filters.provider_id === r.providerId), onclick: () => { filters.provider_id = filters.provider_id === r.providerId ? '' : r.providerId; controls.provider_id.value = filters.provider_id; draw(); } }, r.name),
          el('span', { class: 'mini-meta', text: `${plural(r.live, 'contrato vigente', 'contratos vigentes')}${r.withExceptions ? ` · ${r.withExceptions} com pendência` : ''} · ${r.products.map((k) => CONTRACT_CATEGORIES[k] || productLabel(k)).join(', ')}` })]),
        el('a', { class: 'btn btn-ghost btn-sm', href: ctx.href(`/finance/providers.html?provider_id=${encodeURIComponent(r.providerId)}`), text: 'Relacionamento', 'aria-label': `Relacionamento com ${r.name}` })
      ]))) : mutedText('Nenhuma instituição no recorte.'));
    const visible = filterContracts(ordered, filters, exceptions);
    count.textContent = `${visible.length} de ${ordered.length} contratos`;
    // Renderização progressiva: cada cartão consulta documentos e monta a linha do
    // tempo; com carteiras grandes, só os primeiros CARD_PAGE do recorte entram de
    // imediato. Contagens e pendências continuam valendo para o recorte inteiro.
    list.replaceChildren(...visible.slice(0, shown).map(cardFor));
    if (visible.length > shown) list.append(button(`Mostrar mais ${Math.min(CARD_PAGE, visible.length - shown)} de ${visible.length - shown} restantes`, { variant: 'secondary', attrs: { 'data-more': 'contracts' }, onClick: () => { shown += CARD_PAGE; draw(); } }));
    if (!visible.length) list.append(emptyState({ title: 'Nenhum contrato neste recorte', text: 'Ajuste ou limpe os filtros. Os filtros ficam no endereço da página.', iconName: 'search', compact: true, action: clear }));
    // Só as chaves de filtro mudam; o resto do endereço (?abrir=…, #contract-…) fica.
    const params = new URLSearchParams(location.search);
    for (const key of PORTFOLIO_FILTERS) params.delete(key);
    for (const [key, value] of new URLSearchParams(writePortfolioFilters(filters))) params.set(key, value);
    const query = params.toString();
    const next = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
    if (next !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, '', next);
  }
  // Plano de renovações: carregado sob demanda, sobre os mesmos contratos do recorte.
  const plan = el('div');
  import('../contract-center/renewal-workbench.js').then((m) => { if (plan.isConnected || !plan.childElementCount) plan.replaceWith(m.renewalWorkbench(ctx, ordered, { coverage })); }).catch(() => plan.remove());
  const root = el('div', { class: 'stack contracts-tower' }, [coverageNote(coverage), plan,
    el('div', { class: 'toolbar' }, [el('div', { class: 'toolbar-search' }, [icon('search'), search]), ...Object.values(controls), count]),
    el('div', { class: 'toolbar-chips' }, chips), summary, list].filter(Boolean));
  draw();
  if (focusId) queueMicrotask(() => { const target = document.getElementById(`contract-${focusId}`); target?.scrollIntoView({ block: 'start' }); target?.focus({ preventScroll: true }); });
  return root;
}

// -------------------------------------------------------------- provedores
