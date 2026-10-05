// P1.4 — composição server-side da fila de documentos e da revisão de fatos.
// Toda frase da tela sai daqui. Linguagem: "extraído (não confirmado)",
// "revisão necessária", "confirmado por pessoa". Nunca "melhor proposta",
// nunca recomendação. Puro: recebe linhas já autorizadas pelo RLS.
import { SCHEMAS, VALUE_STATES, FACT_STATUS, EXTRACTION_STATUS, METHODS, PROVIDERS, FAILURE_CODES, schemaField, semanticDiff } from './document-intelligence.mjs';

const day = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—');
const stamp = (v) => (v ? `${day(v)} ${String(v).slice(11, 16)} UTC` : '—');
const pairs = (map) => Object.entries(map);
const FLAG_TEXT = { instruction_like_content: 'o documento contém trechos com formato de instrução — tratados apenas como texto, nunca obedecidos', no_known_labels: 'nenhum rótulo conhecido encontrado: confira o tipo de documento ou digite os campos' };
const UNIT_TEXT = { percent: '%', percent_per_year: '% a.a.', percent_per_month: '% a.m.', days: 'dias', months: 'meses' };

export function valueText(fact) {
  if (!fact) return '—';
  if (fact.value_state !== 'present') return VALUE_STATES[fact.value_state] || fact.value_state;
  const field = schemaField(fact.schema_key, fact.field_key);
  const v = fact.normalized_value;
  if (field?.type === 'money' && typeof v === 'number') return `${fact.currency ? `${fact.currency} ` : ''}${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
  if (field?.type === 'date') return day(v);
  if (typeof v === 'number') return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(v)}${fact.unit ? ` ${UNIT_TEXT[fact.unit]}` : ''}`;
  return String(v);
}
/** "De onde veio este valor?" em uma linha. */
export function provenanceText(fact) {
  const where = fact.locator || (fact.page ? `página ${fact.page}` : 'posição não registrada');
  const confidence = fact.confidence === null || fact.confidence === undefined ? 'sem confiança calculada' : `confiança ${Math.round(Number(fact.confidence) * 100)}%`;
  const who = fact.status === 'confirmed' ? ` · confirmado em ${stamp(fact.confirmed_at)}` : fact.status === 'rejected' ? ` · rejeitado: ${fact.rejection_reason}` : '';
  return `documento v${fact.document_version}, ${where} · ${METHODS[fact.method] || fact.method} ${fact.parser_version} · ${confidence} · registrado ${stamp(fact.created_at)}${who}`;
}

export function factLine(fact) {
  const field = schemaField(fact.schema_key, fact.field_key);
  const raw = fact.raw_value && fact.value_state === 'present' && String(fact.raw_value) !== valueText(fact) ? ` (no documento: "${String(fact.raw_value).slice(0, 120)}")` : '';
  return `${field?.critical ? '◆ ' : ''}${field?.label || fact.field_key}: ${valueText(fact)}${raw} — ${FACT_STATUS[fact.status]} · ${provenanceText(fact)}`;
}

export function extractionForms(documents) {
  const docOptions = [['', 'Selecione um documento'], ...documents.map((d) => [`${d.id}|${d.current_version}`, `${d.title} · v${d.current_version} · ${d.entity_type}`])];
  return [{
    label: 'Extrair fatos de documento', primary: true, title: 'Extrair fatos de documento', post: 'extractions/start',
    intro: 'O leitor determinístico lê PDF com texto, XLSX e DOCX (sem OCR). Imagem ou PDF digitalizado exige digitação. O resultado é dado a revisar: campo crítico (◆) só vale depois de confirmado por administração ou gestão financeira.',
    fields: [['document', 'Documento (versão atual)', docOptions, { required: true }], ['schema_key', 'Tipo de documento', pairs(SCHEMAS).map(([k, v]) => [k, v.label])],
      ['provider', 'Leitor', [['deterministic_v1', PROVIDERS.deterministic_v1], ['manual', `${PROVIDERS.manual} (campo: valor por linha)`], ['model_external', `${PROVIDERS.model_external} (exige configuração)`]]],
      ['manual_text', 'Campos digitados (só para digitação manual), um por linha, ex.: "Spread: 2,35% a.a."', 'textarea', { maxlength: 8000 }]]
  }];
}

export function presentExtractionPage({ rows, documents, next, queue }) {
  return {
    cards: [{
      title: 'Revisão de fatos extraídos',
      lines: [`${queue.needs_review} fato(s) com revisão necessária · ${queue.extracted} extraído(s) sem confirmação · ${queue.confirmed} confirmado(s) por pessoa`,
        'Extração é leitura assistida: nada aqui escolhe proposta, aprova ou altera contrato. Valores ausentes aparecem como "não informado", nunca como zero.'],
      note: 'Origem de cada valor: documento, versão, página/linha, leitor e versão, confiança e quem confirmou.'
    }],
    columns: ['Documento', 'Tipo', 'Leitor', 'Estado', 'Revisão', 'Criada'],
    rows: rows.map((x) => ({ id: x.id, cells: [`${x.document_title || x.document_id} · v${x.document_version}`, SCHEMAS[x.schema_key]?.label || x.schema_key, PROVIDERS[x.provider] || x.provider,
      x.status === 'failed' ? `${EXTRACTION_STATUS.failed}: ${FAILURE_CODES[x.error_code] || x.error_code}` : EXTRACTION_STATUS[x.status], x.needs_review ? `${x.needs_review} pendente(s)` : '—', stamp(x.created_at)] })),
    next,
    empty: { title: 'Nenhuma extração no escopo', text: 'Envie o documento na solicitação, proposta ou contrato e extraia os fatos aqui. Documento sem extração não é documento sem dado.' },
    options: { schema_key: pairs(SCHEMAS).map(([k, v]) => [k, v.label]), status: pairs(EXTRACTION_STATUS) },
    forms: extractionForms(documents),
    detail_label: 'Revisar'
  };
}

export function reviewForm(facts) {
  const open = facts.filter((x) => x.status === 'extracted' || x.status === 'needs_review');
  if (!open.length) return [];
  return [{
    label: 'Revisar fato', primary: true, title: 'Revisar fato extraído', post: 'extractions/review',
    intro: 'Confirme só o que você conferiu no documento. Corrigir cria um novo valor digitado e confirmado, preservando o anterior no histórico. Campo crítico (◆) exige administração ou gestão financeira.',
    fields: [['fact', 'Fato', open.map((x) => [`${x.id}|${x.status}`, `${schemaField(x.schema_key, x.field_key)?.critical ? '◆ ' : ''}${schemaField(x.schema_key, x.field_key)?.label || x.field_key}: ${valueText(x)}`])],
      ['action', 'Ação', [['confirm', 'Confirmar (conferido no documento)'], ['reject', 'Rejeitar (não confere)'], ['correct', 'Corrigir com o valor do documento']]],
      ['value', 'Valor correto (só para corrigir), como está no documento', 'text', { maxlength: 500 }], ['reason', 'Justificativa (obrigatória para rejeitar ou corrigir)', 'textarea', { maxlength: 1000 }]]
  }];
}

export function diffLines(schemaKey, rows) {
  const side = (r, s) => (s ? valueText({ schema_key: schemaKey, field_key: r.field, value_state: s.state, normalized_value: s.value, unit: s.unit, currency: s.currency }) : '—');
  return rows.filter((r) => r.change !== 'absent_both' && r.change !== 'unchanged').map((r) => {
    const before = side(r, r.before);
    const after = side(r, r.after);
    const kind = { added: 'passou a constar', removed: 'deixou de constar', changed: 'alterado', state_changed: 'mudou de estado' }[r.change];
    return `${r.critical ? '◆ ' : ''}${r.label}: ${before} → ${after} (${kind}${r.impact ? `, ${r.impact}` : ''})${r.unconfirmed ? ' · inclui valor não confirmado' : ''}`;
  });
}

export function presentExtractionDetail({ extraction: x, document: d = {}, facts, reviews, previous = null, previousFacts = [] }) {
  const current = facts.filter((f) => f.status !== 'superseded');
  const flagLines = [...new Set([...(x.flags || []), ...(x.warnings || [])])].map((k) => `Atenção: ${FLAG_TEXT[k] || k}.`);
  const diff = previous ? diffLines(x.schema_key, semanticDiff(x.schema_key, previousFacts, facts)) : [];
  return {
    title: `${d.title || 'Documento'} · ${SCHEMAS[x.schema_key]?.label || x.schema_key}`,
    lines: [
      `${x.status === 'failed' ? `${EXTRACTION_STATUS.failed}: ${FAILURE_CODES[x.error_code] || x.error_code}` : EXTRACTION_STATUS[x.status]} · ${PROVIDERS[x.provider] || x.provider} ${x.provider_version} · ${x.pages ? `${x.pages} página(s)` : 'páginas não informadas'}`,
      `Documento v${x.document_version} · ${x.document_mime} · SHA-256 ${x.document_sha256 ? `${x.document_sha256.slice(0, 16)}…` : 'não registrado no envio'} · solicitada ${stamp(x.created_at)}`,
      ...flagLines,
      'Fatos extraídos são dados para conferência humana; não definem vencedor, não aprovam e não alteram contrato.'
    ],
    sections: [
      { title: 'Fatos (◆ = crítico, exige confirmação)', empty: 'Nenhum fato registrado.', items: current.map(factLine) },
      ...(previous ? [{ title: `Diferenças em relação à extração anterior (${day(previous.created_at)}, v${previous.document_version})`, empty: 'Nenhuma diferença nos campos do schema.', items: diff }] : []),
      { title: 'Histórico de revisão', empty: 'Sem revisão registrada.', items: reviews.map((r) => `${stamp(r.acted_at)} · ${FACT_STATUS[r.from_status] || r.from_status} → ${FACT_STATUS[r.to_status]} · ${r.action}${r.reason ? ` · ${r.reason}` : ''}`) }
    ],
    links: d.entity_type && d.entity_id ? [{ href: d.entity_type === 'contract' ? `/finance/contracts.html?id=${d.entity_id}` : d.entity_type === 'rfq' ? `/finance/rfq.html?id=${d.entity_id}` : '/finance/proposals.html', text: 'Abrir o objeto de origem do documento' }] : [],
    actions: reviewForm(facts)
  };
}
