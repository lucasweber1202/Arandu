// CRM records are declarations owned by one organization. They do not move a
// financial workflow or attest that a message was actually delivered.
export const CRM_VERSION = 'financial-crm-v1';
export const CRM_KINDS = Object.freeze(['meeting', 'call', 'email_record', 'note', 'follow_up', 'commitment', 'commercial_interaction']);
export const CRM_STAGES = Object.freeze(['prospect', 'qualification', 'engagement', 'negotiation', 'won', 'lost']);
export const CRM_REFERENCES = Object.freeze(['provider', 'rfq', 'contract', 'opportunity', 'proposal', 'task']);
export const CRM_FIELDS = Object.freeze({
  contact: ['name', 'title', 'email', 'phone', 'owner_id', 'source_reference', 'status'],
  activity: ['kind', 'subject', 'notes', 'occurred_at', 'due_on', 'owner_id', 'source_reference', 'status', 'contact_id', 'process_id', 'related_type', 'related_id'],
  process: ['title', 'stage', 'owner_id', 'due_on', 'next_action', 'outcome', 'source_reference', 'status', 'contact_id', 'related_type', 'related_id']
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const boundedText = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

export function validateCrmRecord(kind, input, { partial = false } = {}) {
  const fields = CRM_FIELDS[kind];
  if (!fields || !input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !fields.includes(k))) return ['invalid_fields'];
  const errors = [];
  const required = kind === 'contact' ? ['name', 'source_reference'] : kind === 'activity' ? ['kind', 'subject', 'source_reference'] : ['title', 'stage', 'next_action', 'source_reference'];
  for (const key of required) if ((!partial || Object.hasOwn(input, key)) && !boundedText(input[key], key === 'kind' || key === 'stage' ? 1 : 2, key === 'name' ? 120 : key === 'source_reference' ? 500 : 200)) errors.push(key);
  for (const [key, value] of Object.entries(input)) {
    if (value === null && !required.includes(key) && !['status', 'owner_id', 'stage', 'kind', 'next_action', 'subject'].includes(key)) continue;
    if (key.endsWith('_id') && !uuid.test(value)) errors.push(key);
    if (key === 'email' && !(boundedText(value, 3, 254) && /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(value))) errors.push(key);
    if (key === 'phone' && !(typeof value === 'string' && /^[0-9+() .-]{6,40}$/.test(value))) errors.push(key);
    if (['notes', 'outcome'].includes(key) && !boundedText(value, 1, 4000)) errors.push(key);
    if (key === 'title' && !boundedText(value, 2, kind === 'contact' ? 120 : 200)) errors.push(key);
    if (key === 'name' && (/@/.test(value) || !boundedText(value, 2, 120))) errors.push(key);
    if (key === 'due_on' && !day(value)) errors.push(key);
    if (key === 'occurred_at' && !(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && day(value.slice(0, 10)) && Number.isFinite(Date.parse(value)))) errors.push(key);
    if (key === 'kind' && !CRM_KINDS.includes(value)) errors.push(key);
    if (key === 'stage' && !CRM_STAGES.includes(value)) errors.push(key);
    if (key === 'status' && !(kind === 'activity' ? ['planned', 'recorded', 'cancelled', 'archived'] : ['active', 'archived']).includes(value)) errors.push(key);
    if (key === 'related_type' && !CRM_REFERENCES.includes(value)) errors.push(key);
    if (['subject', 'next_action', 'source_reference'].includes(key) && !boundedText(value, 2, key === 'source_reference' ? 500 : 200)) errors.push(key);
  }
  if (!partial && kind === 'activity') {
    if ((input.status || 'recorded') === 'recorded' && !input.occurred_at) errors.push('occurred_at');
    if (input.status === 'planned' && !input.due_on) errors.push('due_on');
  }
  if (!partial && Boolean(input.related_type) !== Boolean(input.related_id)) errors.push('reference_pair');
  if (!partial && kind === 'process' && ['won', 'lost'].includes(input.stage) && !boundedText(input.outcome, 3, 4000)) errors.push('outcome');
  return [...new Set(errors)];
}

export const CRM_NOTICE = 'Atividades e etapas comerciais são declarações da sua organização. Não comprovam envio de e-mail, aceite institucional ou alteração de estado da negociação financeira.';
