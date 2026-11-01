import READ_CATALOG from '../../finance/copilot-read-catalog.json' with { type: 'json' };
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { HttpError, json, readBody } from '../../api-core.mjs';
import { requireUuid, UUID, rest, rpc, memberOrganization } from './finance-core.mjs';
import { closedSchema, copilotProvider, runCopilot, CopilotFailure } from '../../finance/copilot.mjs';
import { validateCrmRecord, CRM_FIELDS, CRM_KINDS } from '../../finance/crm.mjs';
import { GRAPH_ROOTS, GRAPH_KINDS, graphHref } from '../../finance/graph.mjs';
import { handleGuaranteeEconomics } from './finance-guarantee-economics.mjs';
import { validateGuaranteeScenario } from '../../finance/guarantee-economics.mjs';

// Scope and credentials are captured from the authenticated request. Neither
// organization, JWT, SQL, table names nor arbitrary URLs are model arguments.
const READS = Object.freeze(READ_CATALOG);
const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const text = v => typeof v === 'string' && /^[\p{L}\p{N} .@+-]{2,100}$/u.test(v);
const source = (type, row, page) => ({ source_id: `${type}:${row.id}`, object_type: type, id: row.id,
  label: row.title || row.subject || ({ contracts: 'Contrato financeiro', proposals: 'Proposta financeira', opportunities: 'Oportunidade financeira' })[type] || 'Registro financeiro', version: row.version ?? row.current_version ?? row.revision ?? null,
  updated_at: row.updated_at ?? row.last_seen_at ?? null, href: `/finance/${page}.html?id=${row.id}`, information: row });

export function financialCopilotTools({ token, organizationId }) {
  return {
    compare_guarantees: {
      description: 'Calcula custos explícitos de fianças por cenários declarados. Obtém termos de versões canônicas autorizadas; não precifica hedge nem calcula economia realizada.',
      schema: closedSchema({ sources: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', properties: { contract_id: { type: 'string' }, version: { type: 'integer' } }, required: ['contract_id', 'version'], additionalProperties: false } },
        scenarios: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', properties: { label: { type: 'string' }, period_start: { type: 'string' }, period_end: { type: 'string' }, currency: { type: 'string' }, guaranteed_amount: { type: 'number' }, source_reference: { type: 'string' } }, required: ['label', 'period_start', 'period_end', 'currency', 'guaranteed_amount', 'source_reference'], additionalProperties: false } } }, ['sources', 'scenarios'], v => Array.isArray(v.sources) && v.sources.length >= 1 && v.sources.length <= 10 && v.sources.every(s => s && Object.keys(s).every(k => ['contract_id', 'version'].includes(k)) && UUID.test(s.contract_id) && Number.isInteger(s.version) && s.version > 0) && Array.isArray(v.scenarios) && v.scenarios.length >= 1 && v.scenarios.length <= 10 && v.scenarios.every(validateGuaranteeScenario)),
      async execute(v) {
        const req = Object.assign(Readable.from([JSON.stringify({ ...v, organization_id: organizationId })]), { method: 'POST', url: '/api/finance/guarantee-economics', headers: {} });
        const res = { setHeader() {}, end(value) { this.result = JSON.parse(value); } };
        await handleGuaranteeEconomics(req, res, { resource: 'guarantee-economics', token, headers: {} });
        const analysis = res.result.analysis;
        return { analysis, sources: analysis.scenarios.flatMap(scenario => scenario.results.map(row => ({ source_id: `guarantee:${row.source.id}:v${row.source.version}:${scenario.scenario.label}`, ...row.source, information: { scenario: scenario.scenario, result: row } }))) };
      }
    },
    financial_graph: {
      description: 'Consulta o Financial Graph autorizado a partir de uma raiz canônica. Retorna no máximo 25 objetos; offset permite continuar até 5000.',
      schema: closedSchema({ root_type: { type: 'string', enum: GRAPH_ROOTS }, root_id: { type: 'string' }, kind: { type: 'string', enum: GRAPH_KINDS }, offset: { type: 'integer', minimum: 0, maximum: 5000 } }, ['root_type', 'root_id'], v => GRAPH_ROOTS.includes(v.root_type) && UUID.test(v.root_id) && (!Object.hasOwn(v, 'kind') || GRAPH_KINDS.includes(v.kind)) && (!Object.hasOwn(v, 'offset') || Number.isInteger(v.offset) && v.offset >= 0 && v.offset <= 5000)),
      async execute(v) {
        const fetched = await rpc(token, 'fin_query_graph', { p_org: organizationId, p_root_type: v.root_type, p_root: v.root_id,
          p_kind: v.kind || null, p_entity: null, p_status: null, p_query: null, p_due_before: null, p_limit: 25, p_offset: v.offset || 0 });
        const rows = (fetched || []).slice(0, 25);
        return { rows, has_more: (fetched || []).length > 25, next_offset: (fetched || []).length > 25 ? (v.offset || 0) + 25 : null,
          sources: rows.map(row => ({ source_id: `${row.object_type}:${row.object_id}`, object_type: row.object_type, id: row.object_id, label: row.label || row.title || row.object_type, href: graphHref(row), information: row })) };
      }
    },
    read_financial: {
      description: 'Consulta dados financeiros autorizados. Lista por ID estável, no máximo 25; use after para continuar. Termos de contratos são consultados em contract_terms.',
      schema: closedSchema({ kind: { type: 'string', enum: Object.keys(READS) }, id: { type: 'string' }, provider_id: { type: 'string' }, legal_entity_id: { type: 'string' }, search: { type: 'string' }, status: { type: 'string' }, due_before: { type: 'string' }, due_after: { type: 'string' }, after: { type: 'string' } }, ['kind'], v => Object.hasOwn(READS, v.kind)
        && ['id', 'provider_id', 'legal_entity_id', 'after'].every(k => !Object.hasOwn(v, k) || typeof v[k] === 'string' && UUID.test(v[k]))
        && (!Object.hasOwn(v, 'search') || text(v.search)) && (!Object.hasOwn(v, 'status') || typeof v.status === 'string' && /^[a-z_]{2,40}$/.test(v.status))
        && ['due_before', 'due_after'].every(k => !Object.hasOwn(v, k) || day(v[k])) && !(v.id && v.after) && !(v.due_after && v.due_before && v.due_after > v.due_before)),
      async execute(input) {
        const def = READS[input.kind];
        if (input.provider_id && !def.provider || input.search && !def.name || (input.due_before || input.due_after) && !def.date) return { error: 'unsupported_filter' };
        const q = new URLSearchParams({ select: def.select, [def.org || 'organization_id']: `eq.${organizationId}`, order: 'id.asc', limit: '26' });
        for (const k of ['id', 'provider_id', 'legal_entity_id', 'status']) if (input[k]) q.set(k, `eq.${input[k]}`);
        if (input.search) q.set(def.name, `ilike.*${input.search}*`);
        if (input.due_before) q.append(def.date, `lte.${input.due_before}`);
        if (input.due_after) q.append(def.date, `gte.${input.due_after}`);
        if (input.after) q.set('id', `gt.${input.after}`);
        const fetched = await rest(token, `${def.table}?${q}`) || [], rows = fetched.slice(0, 25);
        return { rows, sources: rows.map(row => source(input.kind, row, def.page)), has_more: fetched.length > 25, after: fetched.length > 25 ? rows.at(-1).id : null, coverage: 'authorized_rows_only' };
      }
    },
    contract_terms: {
      description: 'Consulta uma versão explícita de termos contratuais e sua fonte, após conferir o acesso ao contrato.',
      schema: closedSchema({ contract_id: { type: 'string' }, version: { type: 'integer', minimum: 1 } }, ['contract_id', 'version'], v => UUID.test(v.contract_id) && Number.isInteger(v.version) && v.version > 0 && v.version < 1000000),
      async execute({ contract_id, version }) {
        const roots = await rest(token, `fin_contracts?select=id&organization_id=eq.${organizationId}&id=eq.${contract_id}&limit=1`);
        if (!roots?.length) return { error: 'source_unavailable', sources: [] };
        const rows = await rest(token, `fin_contract_versions?select=version,effective_from,source,reason,terms&contract_id=eq.${contract_id}&organization_id=eq.${organizationId}&version=eq.${version}&limit=1`);
        return { rows: rows || [], sources: (rows || []).map(row => ({ ...source('contract', { ...row, id: contract_id }, 'contracts'), source_id: `contract:${contract_id}:v${version}` })) };
      }
    },
    prepare_activity: {
      description: 'Prepara, SEM GRAVAR, atividade de CRM para revisão e confirmação humana. Nunca envia e-mail.',
      schema: closedSchema({ legal_entity_id: { type: 'string' }, values: { type: 'object', additionalProperties: false,
        properties: Object.fromEntries(CRM_FIELDS.activity.map(k => [k, k === 'kind' ? { type: 'string', enum: CRM_KINDS } : { type: ['string', 'null'] }])), required: ['kind', 'subject', 'source_reference'] } }, ['values'], v => validateCrmRecord('activity', v.values).length === 0 && (!Object.hasOwn(v, 'legal_entity_id') || UUID.test(v.legal_entity_id))),
      async execute({ values, legal_entity_id = null }) {
        return { prepared_action: { type: 'create_crm_activity', method: 'POST', endpoint: '/api/finance/copilot/confirm',
          confirmation_required: true, payload: { organization_id: organizationId, legal_entity_id, request_key: randomUUID(), values },
          notice: 'Prévia validada na forma. Vínculos, responsável e estado serão novamente autorizados pelo banco na confirmação.' } };
      }
    }
  };
}

export async function handleFinanceCopilot(req, res, { resource, sub, token, session, headers, env = process.env, enforceRateLimit = null }) {
  if (resource !== 'copilot') return false;
  if (req.method !== 'POST' || !['ask', 'confirm'].includes(sub)) throw new HttpError(405, 'Operação do Copilot indisponível.', 'method_not_allowed');
  const body = await readBody(req);
  const allowed = sub === 'ask' ? ['organization_id', 'question'] : ['organization_id', 'legal_entity_id', 'request_key', 'values', 'confirmation'];
  if (Object.keys(body).some(k => !allowed.includes(k))) throw new HttpError(400, 'Confira os campos do Copilot.', 'invalid_copilot');
  const org = await memberOrganization(token, requireUuid(body.organization_id, 'organization_id'), ['BUYER']);
  if (sub === 'confirm') {
    if (body.confirmation !== true || validateCrmRecord('activity', body.values).length) throw new HttpError(400, 'Revise a atividade e confirme explicitamente.', 'copilot_confirmation_required');
    const result = await rpc(token, 'fin_crm_command', { p_org: org.id, p_kind: 'activity', p_id: null, p_expected: null,
      p_request: requireUuid(body.request_key, 'request_key'), p_scope: { legal_entity_id: body.legal_entity_id ? requireUuid(body.legal_entity_id, 'legal_entity_id') : null }, p_values: body.values });
    json(res, result.replayed ? 200 : 201, { ok: true, ...result }, headers); return true;
  }
  try {
    const provider = copilotProvider(env);
    if (enforceRateLimit) {
      await enforceRateLimit(req, 'finance-copilot-user', 10, 600000, session.user.id);
      await enforceRateLimit(req, 'finance-copilot-organization', 20, 600000, org.id);
    }
    const result = await runCopilot({ question: body.question, provider, tools: financialCopilotTools({ token, organizationId: org.id }),
      metrics: m => console.info(JSON.stringify({ event: 'financial_copilot', ...m })) });
    json(res, 200, { ok: true, ...result }, headers); return true;
  } catch (error) {
    if (!(error instanceof CopilotFailure)) throw error;
    throw new HttpError(error.code === 'invalid_copilot_question' ? 400 : 503, 'Copilot indisponível para esta solicitação. Nenhuma ação foi executada.', error.code);
  }
}
