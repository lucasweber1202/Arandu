// Provider Qualification & Due Diligence (Guideline v3 §11).
//
// Qualificação registra exigências DEFINIDAS PELO CLIENTE, evidências com
// origem e validade, exceções aprovadas com motivo e a DECISÃO HUMANA. O
// Arandu não é provedor de KYC/KYB/sanções: verificações especializadas
// entram como evidência de serviço externo (fronteira de integração), sem
// alegação de verificação própria. Consultar o estado de qualificação nunca
// escolhe vencedor nem bloqueia por conta própria uma decisão.

export const AREAS = Object.freeze({
  registration: 'Cadastro', legal: 'Jurídico', financial: 'Financeiro', security: 'Segurança da informação', privacy: 'Privacidade',
  compliance: 'Compliance', continuity: 'Continuidade', documentation: 'Documentação', insurance: 'Seguros', category_specific: 'Específico da categoria'
});
export const CATEGORIES = Object.freeze({
  all: 'Todas as categorias', credit: 'Crédito', acquiring: 'Adquirência', cash_management: 'Cash management', payments: 'Pagamentos',
  fx: 'Câmbio/hedge', guarantee: 'Garantias', insurance: 'Seguros', other: 'Outros serviços financeiros'
});
export const STATUS = Object.freeze({
  not_started: 'Não iniciada', in_progress: 'Em andamento', pending_provider: 'Aguardando provedor', pending_internal_review: 'Aguardando revisão interna',
  qualified: 'Qualificado', qualified_with_conditions: 'Qualificado com condições', expired: 'Vencida', rejected: 'Não qualificado', suspended: 'Suspensa'
});
export const TRANSITIONS = Object.freeze({
  not_started: ['in_progress'],
  in_progress: ['pending_provider', 'pending_internal_review'],
  pending_provider: ['in_progress', 'pending_internal_review'],
  pending_internal_review: ['qualified', 'qualified_with_conditions', 'rejected', 'in_progress'],
  qualified: ['suspended', 'expired', 'in_progress'],
  qualified_with_conditions: ['suspended', 'expired', 'in_progress'],
  suspended: ['in_progress', 'rejected'],
  rejected: ['in_progress'],
  expired: ['in_progress']
});
export const DECISIONS = new Set(['qualified', 'qualified_with_conditions', 'rejected', 'suspended']);
export const EVIDENCE_STATUS = Object.freeze({ submitted: 'Enviada', accepted: 'Aceita', rejected: 'Recusada', expired: 'Vencida' });
export const EVIDENCE_SOURCES = Object.freeze({ provider: 'Enviada pelo provedor', internal: 'Levantada pela equipe', external_service: 'Serviço especializado externo (KYC/KYB/sanções, etc.)' });
export const EXCEPTION_STATUS = Object.freeze({ requested: 'Pedida', approved: 'Aprovada', rejected: 'Recusada', expired: 'Vencida' });
/** Visão consultável por RFQ/policy: informa, não decide. */
export const CONSULT = Object.freeze({ qualified: 'qualified', qualified_with_conditions: 'conditional', expired: 'expired', rejected: 'rejected', suspended: 'suspended' });

const text = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max && !/[<>]/.test(v);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

export function validateRequirement(r) {
  if (!r || typeof r !== 'object') return 'Exigência inválida.';
  if (!text(r.title, 3, 200)) return 'Título da exigência: 3 a 200 caracteres.';
  if (!(r.area in AREAS)) return 'Área inválida.';
  if (r.category !== undefined && r.category !== null && r.category !== '' && !(r.category in CATEGORIES)) return 'Categoria inválida.';
  if (r.description && !text(r.description, 3, 2000)) return 'Descrição: até 2.000 caracteres, sem marcação.';
  if (r.validity_days !== undefined && r.validity_days !== null && r.validity_days !== '' && !(Number.isInteger(Number(r.validity_days)) && Number(r.validity_days) >= 1 && Number(r.validity_days) <= 3650)) return 'Validade: 1 a 3.650 dias.';
  return null;
}
export function validateEvidence(e, today = new Date().toISOString().slice(0, 10)) {
  if (!e || typeof e !== 'object') return 'Evidência inválida.';
  if (!(e.source in EVIDENCE_SOURCES)) return 'Origem da evidência inválida.';
  if (!text(e.evidence_reference, 3, 200)) return 'Referência da evidência: 3 a 200 caracteres.';
  if (e.source === 'external_service' && !text(e.external_service, 2, 80)) return 'Informe o serviço externo que produziu a verificação.';
  if (e.valid_until && (!isDate(e.valid_until) || e.valid_until < today)) return 'Validade deve ser uma data futura.';
  return null;
}
export function validateTransition(from, input) {
  if (!(from in TRANSITIONS) || !TRANSITIONS[from].includes(input?.to_status)) return 'Transição não permitida a partir do estado atual.';
  if ((DECISIONS.has(input.to_status) || input.to_status === 'in_progress' && ['rejected', 'suspended', 'expired'].includes(from)) && !text(input.reason, 10, 2000)) return 'Decisão exige justificativa (10 a 2.000 caracteres).';
  if (input.to_status === 'qualified_with_conditions' && !text(input.conditions, 10, 2000)) return 'Descreva as condições (10 a 2.000 caracteres).';
  if (input.valid_until && !isDate(input.valid_until)) return 'Validade inválida.';
  return null;
}

/**
 * Prontidão factual para decisão: cada exigência aplicável precisa de
 * evidência aceita e vigente OU exceção aprovada e vigente. Não decide; diz o
 * que falta e qual seria o desfecho permitido.
 */
export function readiness(requirements, evidence, exceptions, today = new Date().toISOString().slice(0, 10)) {
  const items = requirements.map((r) => {
    const ev = evidence.filter((e) => e.requirement_id === r.id && e.status === 'accepted' && (!e.valid_until || e.valid_until >= today));
    const ex = exceptions.filter((x) => x.requirement_id === r.id && x.status === 'approved' && x.expires_on >= today);
    const state = ev.length ? 'met' : ex.length ? 'excepted' : evidence.some((e) => e.requirement_id === r.id && e.status === 'submitted') ? 'under_review' : 'missing';
    const validUntil = ev.length ? ev.map((e) => e.valid_until).filter(Boolean).sort()[0] || null : ex.length ? ex.map((x) => x.expires_on).sort()[0] : null;
    return { requirement_id: r.id, title: r.title, area: r.area, critical: Boolean(r.critical), state, valid_until: validUntil };
  });
  const missing = items.filter((i) => i.state === 'missing' || i.state === 'under_review');
  const excepted = items.filter((i) => i.state === 'excepted');
  const until = items.map((i) => i.valid_until).filter(Boolean).sort()[0] || null;
  return { items, missing: missing.length, excepted: excepted.length, met: items.filter((i) => i.state === 'met').length,
    allowed: missing.length ? [] : excepted.length ? ['qualified_with_conditions', 'rejected'] : ['qualified', 'qualified_with_conditions', 'rejected'], valid_until: until };
}

/** Estado efetivo: qualificação vencida pela validade conta como vencida mesmo antes do job. */
export function effectiveStatus(q, today = new Date().toISOString().slice(0, 10)) {
  return ['qualified', 'qualified_with_conditions'].includes(q.status) && q.valid_until && q.valid_until < today ? 'expired' : q.status;
}
export function consultStatus(q, today) {
  if (!q) return 'unknown';
  return CONSULT[effectiveStatus(q, today)] || 'in_progress';
}
