// Resumo operacional do contrato: responde, com os dados do servidor, o que
// foi contratado, com quem, em qual entidade, quando, de onde veio o registro,
// quais termos valem e quem responde. Lacunas são fatos que impedem uma decisão
// específica (não uma nota de qualidade) e vêm com a ação autorizada, quando há.
import { el, icon, formatDate, CONTRACT_STATUS, renewalStage } from '../../core.js';
import { tag, button, mutedText } from '../../ui.js';
import { CONTRACT_CATEGORIES } from '../../../../lib/finance/contract-terms.mjs';
import { renewalButton } from './renewal.js';
import { lazyDocuments } from '../shared/documents.js';

const isoDay = (value) => (/^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10) : null);

/**
 * Fatos e lacunas do contrato (sem rede).
 * Cada lacuna diz o que ela impede; nenhuma é preenchida com valor presumido.
 */
export function contractSummary(detail, { members = [] } = {}) {
  const c = detail.contract;
  const live = ['active', 'renewing'].includes(c.status);
  // Mesma regra da carteira e da Central (renewalStage). Sem aviso prévio
  // registrado, a data-limite é desconhecida: não presumimos zero dias.
  const noticeKnown = Number.isInteger(c.renewal_notice_days) && c.renewal_notice_days >= 0;
  const stage = renewalStage(c);
  const deadline = noticeKnown && isoDay(c.ends_on) ? stage.deadline : null;
  const owner = c.owner_id ? members.find((m) => m.user_id === c.owner_id) : null;
  const gaps = [];
  if (!detail.effective) gaps.push({ key: 'terms', text: 'Termos não estruturados: sem eles não há comparação de tarifas cobradas nem diferença entre versões.', action: 'terms' });
  if (live && !isoDay(c.ends_on)) gaps.push({ key: 'end', text: 'Sem fim de vigência: os marcos de renovação (90/60/30 dias) não podem ser criados.' });
  if (live && isoDay(c.ends_on) && !deadline) gaps.push({ key: 'notice', text: 'Sem aviso prévio registrado: a data-limite para avisar a não renovação é desconhecida.', action: 'amendment' });
  if (live && !c.owner_id) gaps.push({ key: 'owner', text: 'Sem responsável: ninguém recebe os avisos de renovação deste contrato.' });
  if (!c.document_reference) gaps.push({ key: 'document', text: 'Sem referência do documento assinado: as condições registradas não têm evidência vinculada.', action: 'documents' });
  return {
    product: CONTRACT_CATEGORIES[c.product] || 'Produto financeiro',
    status: CONTRACT_STATUS[c.status] || null,
    origin: detail.source_rfq ? { kind: 'sourcing', rfq: detail.source_rfq } : { kind: c.origin === 'imported' ? 'imported' : 'manual' },
    period: [isoDay(c.starts_on), isoDay(c.ends_on)],
    deadline,
    deadlinePassed: Boolean(deadline) && stage.stage === 'past_notice',
    endPassed: live && stage.stage === 'expired',
    autoRenew: c.auto_renew === true ? 'Sim' : c.auto_renew === false ? 'Não' : 'Não informado',
    version: detail.effective?.version || null,
    owner: c.owner_id ? owner?.display_name || 'Pessoa sem acesso atual a esta organização' : null,
    gaps,
  };
}

export function contractSummaryCard(ctx, detail, { onStructureTerms = null, onAmendment = null, entityLabel = null } = {}) {
  const c = detail.contract;
  const s = contractSummary(detail, { members: ctx.members || [] });
  const row = (label, value) => el('div', { class: 'deflist-row' }, [el('dt', { text: label }), el('dd', {}, value)]);
  const origin = s.origin.kind === 'sourcing'
    ? el('a', { href: ctx.href(`/finance/rfq.html?id=${encodeURIComponent(s.origin.rfq.id)}#decisao`), text: `Negociação “${s.origin.rfq.title}”` })
    : s.origin.kind === 'imported' ? 'Contrato existente registrado na carteira (sem negociação no Arandu)' : 'Registro manual (sem negociação no Arandu)';
  const facts = el('dl', { class: 'deflist contract-summary-facts' }, [
    row('Instituição', el('a', { href: ctx.href(`/finance/providers.html?provider_id=${encodeURIComponent(c.provider_id)}`), text: c.provider_name || 'Instituição' })),
    row('Produto', s.product),
    entityLabel ? row('Entidade', entityLabel) : null,
    row('Vigência', `${s.period[0] ? formatDate(s.period[0]) : 'início não informado'} → ${s.period[1] ? formatDate(s.period[1]) : 'fim não informado'}`),
    row('Aviso de não renovação', s.deadline ? `até ${formatDate(s.deadline)} (${c.renewal_notice_days} dias antes do fim)` : 'Não calculável'),
    row('Renovação automática', s.autoRenew),
    row('Moeda', c.currency || 'Não informada'),
    row('Origem', origin),
    row('Termos vigentes', s.version ? `Versão ${s.version}` : 'Não estruturados'),
    row('Responsável', s.owner || 'Sem responsável'),
  ]);
  const manage = ctx.can('create_rfq');
  const actionFor = (gap) => {
    if (!manage) return null;
    if (gap.action === 'terms' && onStructureTerms) return button('Estruturar termos', { size: 'sm', onClick: onStructureTerms });
    if (gap.action === 'amendment' && onAmendment && ['active', 'renewing'].includes(c.status)) return button('Registrar aditivo', { size: 'sm', variant: 'ghost', onClick: onAmendment });
    return null;
  };
  const gaps = s.gaps.length
    ? el('ul', { class: 'contract-gaps', 'aria-label': 'Lacunas que impedem decisões' }, s.gaps.map((gap) => el('li', { class: 'contract-gap', dataset: { gap: gap.key } }, [
      icon('alert', { size: 14 }), el('span', { text: gap.text }), actionFor(gap)])))
    : mutedText('Nenhuma lacuna nos campos que este resumo confere.');
  return el('section', { class: 'cc-section contract-summary', 'aria-labelledby': `summary-${c.id}` }, [
    el('div', { class: 'cc-head' }, [el('h3', { id: `summary-${c.id}`, text: 'Resumo do contrato' }), s.status ? tag(s.status.label, s.status.tone || 'neutral') : null]),
    s.endPassed ? el('p', { class: 'callout callout-warning compact', role: 'note', text: `O fim da vigência (${formatDate(s.period[1])}) já passou e o contrato continua registrado como ${s.status?.label?.toLowerCase() || 'vigente'}. Confira a situação real antes de agir.` }) : null,
    s.deadlinePassed ? el('p', { class: 'callout callout-warning compact', role: 'note', text: `O prazo para avisar a não renovação passou em ${formatDate(s.deadline)}. Confira o contrato antes de agir.` }) : null,
    facts,
    el('h4', { class: 'small', text: 'O que falta para decidir' }), gaps,
    lazyDocuments(ctx, 'contract', c.id, 'Documentos e evidências do contrato', { canUpload: ctx.can('upload_document') }),
    el('div', { class: 'row-actions' }, [renewalButton(ctx, { ...c, provider_name: c.provider_name })]),
  ]);
}
