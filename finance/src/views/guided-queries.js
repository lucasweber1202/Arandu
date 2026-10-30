// Consultas guiadas: primeira camada do Copilot SEM modelo generativo.
// Cada resposta é uma consulta determinística sobre registros que a tela já
// carregou (ou sobre a API existente), com a fonte e o recorte declarados.
// Nenhum texto é gerado por IA e nenhuma ação é executada daqui.
import { el, icon, formatDate, plural, RFQ_STATUS } from '../core.js';
import { button, drawer } from '../ui.js';
import { relationshipWorkItems, OVERVIEW_LIMITS } from './relationship-center.js';
import { CONTRACT_CATEGORIES } from '../../../lib/finance/contract-terms.mjs';

const LIVE = ['active', 'renewing'];
const limitNote = (rows, limit, noun) => rows.length >= limit ? ` O resumo lê até ${limit} ${noun}; pode haver mais fora do recorte.` : '';

/** Perguntas disponíveis; `run` devolve { rows:[{title, detail, href}], source, empty }. */
export function guidedQuestions(ctx, { providerId = null } = {}) {
  const contracts = (ctx.data.contracts || []).filter((row) => !providerId || row.provider_id === providerId);
  const rfqs = (ctx.data.rfqs || []).filter((row) => !providerId || (row.invites || []).some((inv) => inv.provider_id === providerId));
  return [
    { key: 'attention', label: 'Quais contratos precisam de atenção?', run: async () => {
      const items = relationshipWorkItems({ contracts, rfqs: [], tasks: [], members: ctx.members || [] }).filter((item) => item.role === 'contrato');
      return { rows: items.map((item) => ({ title: `${item.title} · ${item.providerName || 'instituição não informada'}`, detail: item.detail, href: item.href })),
        source: `Contratos vigentes carregados: término, aviso prévio registrado e status.${limitNote(ctx.data.contracts || [], OVERVIEW_LIMITS.contracts, 'contratos')}`,
        empty: 'Nenhum contrato vigente vencido, em janela de renovação ou sem término entre os registros carregados. Contratos não registrados não aparecem.' };
    } },
    { key: 'decision', label: 'Quais negociações aguardam decisão?', run: async () => {
      const rows = rfqs.filter((row) => row.status === 'comparing');
      return { rows: rows.map((row) => ({ title: row.title || 'Solicitação', detail: `${RFQ_STATUS[row.status]?.label} · ${plural((row.proposals || []).filter((p) => p.current_version > 0 && p.status !== 'withdrawn').length, 'proposta enviada', 'propostas enviadas')} pelo portal.`, href: `/finance/rfq.html?id=${row.id}#comparacao` })),
        source: `Solicitações carregadas em avaliação (coleta encerrada, sem decisão).${limitNote(ctx.data.rfqs || [], OVERVIEW_LIMITS.rfqs, 'solicitações')}`, empty: 'Nenhuma solicitação em avaliação entre as carregadas.' };
    } },
    { key: 'review', label: 'Quais sinais do Radar estão em revisão?', run: async () => {
      const page = await ctx.api(`opportunities?${new URLSearchParams({ organization_id: ctx.organization.id, status: 'under_review', limit: '25', ...(providerId ? { provider_id: providerId } : {}) })}`);
      return { rows: (page.rows || []).map((row) => ({ title: row.cells?.[0] || 'Sinal', detail: `${row.cells?.[1] || ''} Prazo: ${row.cells?.[2] || '—'}.`, href: `/finance/opportunities.html?id=${encodeURIComponent(row.id)}` })),
        source: `Oportunidades em revisão, pelas regras da sua empresa.${page.next ? ' Há mais na página Oportunidades.' : ''}`, empty: 'Nenhum sinal em revisão. Sem regra ativa nada dispara.' };
    } },
    { key: 'conditions', label: 'Quais contratos não têm condições estruturadas?', run: async () => {
      const rows = contracts.filter((row) => LIVE.includes(row.status) && !row.current_version);
      return { rows: rows.map((row) => ({ title: `${row.title || CONTRACT_CATEGORIES[row.product] || 'Contrato'} · ${row.provider_name || 'instituição não informada'}`, detail: 'Termos não estruturados: taxas, tarifas e prazos não podem ser comparados nem monitorados.', href: `/finance/contracts.html?abrir=contrato#contract-${row.id}` })),
        source: 'Contratos vigentes carregados sem versão de termos registrada.', empty: 'Todos os contratos vigentes carregados têm termos estruturados.' };
    } },
    { key: 'institutions', label: 'Quais instituições têm negociações em andamento?', run: async () => {
      const map = new Map();
      for (const rfq of rfqs.filter((row) => ['open', 'collecting', 'comparing'].includes(row.status))) for (const inv of rfq.invites || []) {
        if (['revoked', 'expired'].includes(inv.status) || (providerId && inv.provider_id !== providerId)) continue;
        const entry = map.get(inv.provider_id) || { name: inv.provider_name || 'Instituição', titles: [] };
        entry.titles.push(rfq.title || 'Solicitação'); map.set(inv.provider_id, entry);
      }
      return { rows: [...map.entries()].map(([id, entry]) => ({ title: entry.name, detail: entry.titles.join(' · '), href: `/finance/providers.html?provider_id=${encodeURIComponent(id)}` })),
        source: 'Convites ativos de solicitações abertas, em coleta ou em avaliação.', empty: 'Nenhuma instituição convidada em negociação aberta.' };
    } }
  ];
}

export function openGuidedQueries(ctx, { providerId = null, providerName = null } = {}) {
  const questions = guidedQuestions(ctx, { providerId });
  const answer = el('div', { class: 'stack guided-answer', 'aria-live': 'polite' }, el('p', { class: 'muted small', text: 'Escolha uma pergunta. A resposta lista os registros e diz de onde vieram.' }));
  let seq = 0;
  const ask = async (q, target) => {
    const mine = ++seq;
    for (const node of target.parentElement.children) node.setAttribute('aria-pressed', String(node === target));
    answer.replaceChildren(el('p', { class: 'muted small', role: 'status', text: 'Consultando os registros…' }));
    try {
      const out = await q.run();
      if (mine !== seq) return;
      answer.replaceChildren(el('h3', { class: 'small', text: q.label }),
        out.rows.length ? el('ol', { class: 'plain-list guided-rows' }, out.rows.map((row) => el('li', {}, [el('a', { href: ctx.href(row.href), text: row.title }), el('p', { class: 'muted small', text: row.detail })])))
          : el('p', { class: 'small', text: out.empty },),
        el('p', { class: 'muted small guided-source' }, [icon('file', { size: 12 }), ` Fonte: ${out.source}${out.rows.length ? ` ${plural(out.rows.length, 'registro', 'registros')}.` : ''}`]));
    } catch (error) {
      if (mine !== seq) return;
      answer.replaceChildren(el('p', { class: 'callout callout-danger compact', role: 'alert', text: `Não foi possível consultar agora${error.status === 403 ? ' (sem permissão para esta consulta)' : ''}. Nenhuma resposta foi inventada.` }));
    }
  };
  const buttons = el('div', { class: 'guided-questions', role: 'group', 'aria-label': 'Perguntas' }, questions.map((q) => {
    const node = button(q.label, { size: 'sm', variant: 'secondary', attrs: { 'aria-pressed': 'false', 'data-question': q.key }, onClick: () => ask(q, node) });
    return node;
  }));
  drawer({ title: 'Consultas do Arandu', subtitle: providerName ? `Contexto: ${providerName}` : `Contexto: ${ctx.organization.legal_name}`, className: 'guided-drawer',
    body: el('div', { class: 'stack' }, [
      el('p', { class: 'callout callout-info compact', role: 'note', text: 'Consultas determinísticas sobre os seus registros. Não há modelo de IA generativa configurado: nenhum texto é gerado, nada é decidido nem enviado daqui.' }),
      buttons, answer]) });
  queueMicrotask(() => buttons.querySelector('button')?.focus());
}
