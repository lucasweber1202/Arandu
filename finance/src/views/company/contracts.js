// Contratos: ciclo de vida, próxima ação e entrada para o centro de contrato.
// Extraído de company.js (v7.0): uma capability por módulo e rota.

import { el, icon, formatDate, relativeDays, daysUntil, plural, productLabel, CONTRACT_STATUS, todayIso, renewalStage } from '../../core.js';
import { pill, tag, button, emptyState, toast, confirmDialog, mutedText, toastError } from '../../ui.js';
import { memberName } from '../shared/people.js';
import { lazyDocuments } from '../shared/documents.js';
import { CONTRACT_CATEGORIES } from '../../../../lib/finance/contract-terms.mjs';
import { loadEntities, entityContextSelect, inContext, contractEntityControl, entityName } from '../entities.js';
import { mods, need } from './capabilities.js';
import { renewalButton } from '../contract-center/renewal.js';

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
    el('a', { class: 'contract-link', href: ctx.href(`/finance/implementations.html?${query}`) }, [el('span', { text: 'Implantação deste contrato' }), icon('arrowRight', { size: 14 })]),
    el('a', { class: 'contract-link', href: ctx.href(`/finance/covenants.html?${query}`) }, [el('span', { text: 'Covenants e obrigações deste contrato' }), icon('arrowRight', { size: 14 })])
  ]);
}

export async function contracts(ctx) {
  const [entities] = await Promise.all([loadEntities(ctx), need('contractCenter')]);
  const rows = (ctx.data.contracts || []).filter((row) => inContext(entities, row));
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
  // Contratos que pedem ação primeiro.
  const root = el('div', { class: 'stack' });
  // Destaque por âncora (#contract-…) ou pelo link de origem da implantação (?id=…).
  const focusId = location.hash.startsWith('#contract-') ? location.hash.slice('#contract-'.length) : new URLSearchParams(location.search).get('id');
  for (const contract of ordered) {
    const next = contractNextAction(contract);
    // Só crédito e adquirência têm concorrência no Arandu. Em renovação, o
    // mesmo botão leva à concorrência já aberta a partir deste contrato.
    const restart = renewalButton(ctx, contract, { variant: next.cta ? 'primary' : 'secondary' });
    // O contrato guarda a decisão (decision_id), não a solicitação: a origem é
    // a solicitação cuja decisão registrada é a deste contrato.
    const source = contract.decision_id ? (ctx.data.rfqs || []).find((rfq) => rfq.decision_id && rfq.decision_id === contract.decision_id) : null;
    root.append(el('article', { class: `contract-card${focusId === contract.id ? ' highlighted' : ''}`, id: `contract-${contract.id}`, tabindex: '-1', dataset: { entity: 'contract', id: contract.id } }, [
      el('header', { class: 'contract-head' }, [
        el('div', {}, [
          el('p', { class: 'contract-kicker', text: `${CONTRACT_CATEGORIES[contract.product] || productLabel(contract.product)}${source ? ` · ${source.title}` : contract.title ? ` · ${contract.title}` : ''}` }),
          el('h2', { class: 'contract-title', text: contract.provider_name || 'Provedor' }),
          entities.rows.length ? el('p', { class: 'contract-entity', 'aria-label': `Entidade: ${entityName(entities, contract.legal_entity_id)}` }, contractEntityControl(ctx, entities, contract)) : null
        ]),
        el('div', { class: 'contract-status' }, [pill(CONTRACT_STATUS[contract.status]), contractDays(contract)])
      ]),
      ['active', 'renewing'].includes(contract.status) ? lifecycleBar(contract) : null,
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
        source ? el('a', { class: 'contract-link contract-origin', href: ctx.href(`/finance/rfq.html?id=${source.id}#decisao`) }, [el('span', { text: 'Ver processo e decisão de origem' }), icon('arrowRight', { size: 14 })]) : null]),
      lazyDocuments(ctx, 'contract', contract.id, 'Documentos do contrato', { canUpload: ctx.can('upload_document') }),
      contractLifecycleLinks(ctx, contract)
    ]));
  }
  if (focusId) queueMicrotask(() => { const target = document.getElementById(`contract-${focusId}`); target?.scrollIntoView({ block: 'start' }); target?.focus({ preventScroll: true }); });
  return root;
}

// -------------------------------------------------------------- provedores
