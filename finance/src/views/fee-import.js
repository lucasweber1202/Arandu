// Assistente de importação de tarifas (CSV/XLSX) sobre `financial-fee-import-v1`
// (docs/PLATFORM_INGESTION_BACKEND_CONTRACTS_2026_11.md).
//
// Etapas: arquivo → colunas → mapeamento → prévia por linha → seleção →
// confirmação → recibo → navegação. A tela não valida economia nem reconcilia:
// quem decide estado de cada linha é o backend (`fee-imports/preview`), que relê
// tudo na confirmação. Arquivo, mapeamento e `request_key` ficam preservados
// após falha; repetir reenvia a mesma intenção.

import { el, icon, formatDate, uid, plural } from '../core.js';
import { button, drawer, field, toast, sessionLink, confirmDialog } from '../ui.js';
import { CHARGING_UNITS } from '../../../lib/finance/fee-intelligence.mjs';

export const IMPORT_LIMITS = Object.freeze({ bytes: 65536, rows: 100, columns: 40 });
export const IMPORT_FIELDS = Object.freeze([
  ['source_object_id', 'Identificador do lançamento na origem', true, 'Código estável do extrato/ERP; evita duplicar ao reenviar.'],
  ['service', 'Serviço cobrado', true, null], ['charging_unit', 'Unidade de cobrança', true, `Valores aceitos: ${Object.keys(CHARGING_UNITS).join(', ')}.`],
  ['currency', 'Moeda', true, 'Código de três letras, ex.: BRL.'], ['period_start', 'Início do período', true, 'AAAA-MM-DD.'], ['period_end', 'Fim do período', true, 'Período já encerrado.'],
  ['observed_amount', 'Valor cobrado', true, 'Decimal sem separador de milhar.'], ['volume', 'Quantidade', false, null], ['base_amount', 'Valor-base', false, 'Para cobranças percentuais.']
]);
const STATE = {
  valid: ['Válida para importar', 'success'], duplicate: ['Já registrada (idêntica)', 'neutral'], conflicting: ['Conflita com registro existente', 'danger'],
  invalid: ['Inválida', 'danger'], incomplete: ['Incompleta', 'warning'], pending_review: ['Requer revisão', 'warning']
};
const CODE_TEXT = { required: 'Valor obrigatório ausente', invalid_source_id: 'Identificador inválido', invalid_fee_observation: 'Cobrança inconsistente' };
const enc = encodeURIComponent;

/** Nomes de coluna do cabeçalho de um CSV (primeiro registro), respeitando aspas. */
export function csvHeader(text, delimiter) {
  const out = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c; continue; }
    if (c === '"') quoted = true; else if (c === delimiter) { out.push(cell.trim()); cell = ''; } else if (c === '\n' || c === '\r') break; else cell += c;
  }
  out.push(cell.trim());
  return out.map((v) => v.replace(/^﻿/, ''));
}
/** Sugestão de mapeamento por nome exato (sem acento/caixa); a pessoa confirma cada campo. */
export function suggestMapping(columns) {
  const fold = (v) => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const hints = { source_object_id: ['id', 'id externo', 'codigo', 'identificador'], service: ['servico', 'tarifa', 'descricao'], charging_unit: ['unidade'], currency: ['moeda'], period_start: ['inicio'], period_end: ['fim'], observed_amount: ['valor', 'valor cobrado'], volume: ['quantidade', 'volume'], base_amount: ['base', 'valor base'] };
  const out = {};
  for (const [key, words] of Object.entries(hints)) { const hit = columns.find((c) => words.includes(fold(c)) && !Object.values(out).includes(c)); if (hit) out[key] = hit; }
  return out;
}
const toBase64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

export function importErrorMessage(error) {
  if (error?.status === 400) return 'O arquivo ou o mapeamento não foi aceito: confira formato, cabeçalho único, colunas mapeadas, limite de 100 registros e origem (letras, números e . _ : / -). Nada foi gravado.';
  if (error?.status === 403) return 'Seu papel não permite esta etapa. Prévia: qualquer pessoa com acesso ao contrato; confirmação: administração ou gestão financeira.';
  if (error?.status === 404) return 'Contrato indisponível no seu escopo.';
  if (error?.status === 409) return 'Os dados mudaram desde a prévia ou esta confirmação já foi usada com outro conteúdo. Nada foi sobrescrito: gere a prévia de novo.';
  if (error?.status === 422) return 'O recorte tem fontes demais para reconciliar de uma vez. Divida o arquivo.';
  if (error?.status === 401) return error.message;
  return 'Não recebemos confirmação do servidor. Pode ter sido gravado: consulte o histórico abaixo antes de repetir; repetir aqui reenvia a mesma ação.';
}

export function openFeeImport(ctx, { contracts = [], contractId = null } = {}) {
  const live = contracts.filter((c) => ['active', 'renewing'].includes(c.status) || c.id === contractId);
  const state = { file: null, bytes: null, format: null, columns: [], mapping: {}, preview: null, requestKey: uid(), confirmKey: null, selected: new Set() };
  const steps = el('ol', { class: 'import-steps', 'aria-label': 'Etapas da importação' }, ['Arquivo', 'Mapeamento', 'Prévia', 'Resultado'].map((label, i) => el('li', { dataset: { step: String(i + 1) }, text: label })));
  const area = el('div', { class: 'stack import-area', 'aria-live': 'polite' });
  const setStep = (n) => { for (const li of steps.children) { const s = Number(li.dataset.step); li.setAttribute('aria-current', s === n ? 'step' : 'false'); li.dataset.done = String(s < n); } };

  // ------------------------------------------------------------ 1. arquivo
  const contract = el('select', { class: 'input', id: 'import-contract' }, [new Option('Selecione o contrato', ''), ...live.map((c) => new Option(`${c.title || 'Contrato'} · ${c.provider_name || 'instituição não informada'}`, c.id, false, c.id === contractId))]);
  const fileInput = el('input', { type: 'file', class: 'input', accept: '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const delimiter = el('select', { class: 'input' }, [new Option('Ponto e vírgula (;)', ';'), new Option('Vírgula (,)', ',')]);
  const source = el('input', { class: 'input', maxlength: '100', placeholder: 'Ex.: Extrato Atlas outubro 2026' });
  const fileErr = el('div', { class: 'callout callout-error compact', role: 'alert', hidden: true });
  const delimiterField = field({ label: 'Separador do CSV', control: delimiter });
  const stepOne = () => {
    setStep(1);
    const next = button('Ler colunas', { variant: 'primary', iconName: 'arrowRight', onClick: readFile });
    area.replaceChildren(
      el('p', { class: 'muted small', text: `Formatos: CSV (UTF-8) ou XLSX sem fórmulas. Até ${IMPORT_LIMITS.bytes / 1024} KiB, ${IMPORT_LIMITS.rows} registros e ${IMPORT_LIMITS.columns} colunas; primeira linha é o cabeçalho. Nada é gravado antes da sua confirmação.` }),
      field({ label: 'Contrato das tarifas', control: contract, required: true, hint: 'A cobrança observada é comparada às tarifas contratadas deste contrato.' }),
      field({ label: 'Arquivo', control: fileInput, required: true }), delimiterField,
      field({ label: 'Origem do arquivo', control: source, required: true, hint: 'Use sempre o mesmo nome para o mesmo conjunto externo: é parte da chave contra duplicidade.' }),
      fileErr, el('div', { class: 'form-actions' }, [next]));
  };
  fileInput.addEventListener('change', () => { delimiterField.hidden = /\.xlsx$/i.test(fileInput.files?.[0]?.name || ''); });
  async function readFile() {
    const f = fileInput.files?.[0];
    const problems = [];
    if (!contract.value) problems.push('Selecione o contrato.');
    if (!f) problems.push('Escolha um arquivo CSV ou XLSX.');
    if (!/^[\p{L}\p{N} ._:/-]{3,100}$/u.test(source.value.trim())) problems.push('Informe a origem com 3 a 100 caracteres (letras, números, espaço e . _ : / -).');
    const format = f && (/\.xlsx$/i.test(f.name) ? 'xlsx' : /\.csv$/i.test(f.name) ? 'csv' : null);
    if (f && !format) problems.push('Formato não suportado: use .csv ou .xlsx.');
    if (f && f.size > IMPORT_LIMITS.bytes) problems.push(`Arquivo com ${Math.ceil(f.size / 1024)} KiB passa do limite de ${IMPORT_LIMITS.bytes / 1024} KiB. Divida-o em partes.`);
    if (f && f.size === 0) problems.push('Arquivo vazio.');
    if (problems.length) { fileErr.replaceChildren(...problems.map((p) => el('p', { text: p }))); fileErr.hidden = false; return; }
    fileErr.hidden = true;
    const bytes = new Uint8Array(await f.arrayBuffer());
    Object.assign(state, { file: f, bytes, format, preview: null });
    if (format === 'csv') {
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fileErr.replaceChildren(el('p', { text: 'O CSV não está em UTF-8. Exporte novamente como "CSV UTF-8".' })); fileErr.hidden = false; return; }
      const columns = csvHeader(text, delimiter.value);
      if (columns.length < 2) { fileErr.replaceChildren(el('p', { text: `Só uma coluna lida com o separador "${delimiter.value}". Troque o separador.` })); fileErr.hidden = false; return; }
      if (new Set(columns).size !== columns.length || columns.some((c) => !c)) { fileErr.replaceChildren(el('p', { text: 'O cabeçalho tem colunas vazias ou repetidas. Dê um nome único a cada coluna.' })); fileErr.hidden = false; return; }
      state.columns = columns;
    } else state.columns = [];
    state.mapping = { ...suggestMapping(state.columns), ...state.mapping };
    for (const k of Object.keys(state.mapping)) if (state.columns.length && !state.columns.includes(state.mapping[k])) delete state.mapping[k];
    stepTwo();
  }

  // ------------------------------------------------------- 2. mapeamento
  function stepTwo() {
    setStep(2);
    const controls = new Map();
    const rows = IMPORT_FIELDS.map(([key, label, required, hint]) => {
      let control;
      if (state.columns.length) {
        control = el('select', { class: 'input', dataset: { field: key } }, [new Option(required ? 'Escolha a coluna' : 'Não importar', ''), ...state.columns.map((c) => new Option(c, c, false, state.mapping[key] === c))]);
      } else control = el('input', { class: 'input', maxlength: '100', value: state.mapping[key] || '', placeholder: 'Nome exato da coluna na planilha', dataset: { field: key } });
      controls.set(key, control);
      return field({ label, control, required, optionalLabel: !required, hint });
    });
    const err = el('div', { class: 'callout callout-error compact', role: 'alert', hidden: true });
    const back = button('Voltar', { variant: 'ghost', onClick: stepOne });
    const go = button('Gerar prévia', { variant: 'primary', iconName: 'eye', onClick: async () => {
      const mapping = {};
      for (const [key, control] of controls) if (control.value.trim()) mapping[key] = control.value.trim();
      const missing = IMPORT_FIELDS.filter(([key, , req]) => req && !mapping[key]).map(([, label]) => label);
      const dup = Object.values(mapping).filter((v, i, a) => a.indexOf(v) !== i);
      if (missing.length || dup.length) { err.textContent = missing.length ? `Mapeie: ${missing.join(', ')}.` : `A coluna "${dup[0]}" foi usada em mais de um campo.`; err.hidden = false; return; }
      err.hidden = true; state.mapping = mapping; go.disabled = true;
      try { await runPreview(); } catch (error) { err.replaceChildren(el('span', { text: importErrorMessage(error) }), ...(sessionLink(error) ? [' ', sessionLink(error)] : [])); err.hidden = false; } finally { go.disabled = false; }
    } });
    area.replaceChildren(
      el('p', { class: 'small', text: state.columns.length ? `Arquivo ${state.file.name}: ${plural(state.columns.length, 'coluna lida', 'colunas lidas')}. Relacione cada campo financeiro a uma coluna; colunas não mapeadas não são importadas.` : `Planilha ${state.file.name}: informe o nome exato de cada coluna do cabeçalho (a primeira planilha é lida pelo servidor na prévia).` }),
      el('div', { class: 'import-mapping' }, rows), err, el('div', { class: 'form-actions' }, [back, go]));
  }
  const body = () => ({ organization_id: ctx.organization.id, contract_id: contract.value, file: { name: state.file.name, format: state.format, content_base64: toBase64(state.bytes) }, mapping: state.mapping, source_reference: source.value.trim(), ...(state.format === 'csv' ? { delimiter: delimiter.value } : {}) });
  async function runPreview() {
    const out = await ctx.api('fee-imports/preview', { method: 'POST', body: JSON.stringify(body()) });
    state.preview = out.preview;
    state.confirmKey = uid();
    state.selected = new Set(state.preview.rows.filter((r) => r.state === 'valid').map((r) => r.line));
    stepThree();
  }

  // ----------------------------------------------------------- 3. prévia
  function stepThree() {
    setStep(3);
    const p = state.preview;
    const stats = p.stats || {};
    const filter = el('select', { class: 'input', 'aria-label': 'Filtrar linhas da prévia' }, [new Option('Todas as linhas', ''), ...Object.entries(STATE).filter(([k]) => stats[k]).map(([k, [label]]) => new Option(`${label} (${stats[k]})`, k))]);
    const tbody = el('tbody');
    const selCount = el('p', { class: 'small', role: 'status' });
    const confirm = button('Confirmar importação', { variant: 'primary', iconName: 'check' });
    const sync = () => { selCount.textContent = `${plural(state.selected.size, 'linha selecionada', 'linhas selecionadas')} para gravar. Duplicadas selecionadas não criam registro novo.`; confirm.disabled = !state.selected.size; };
    const draw = () => {
      tbody.replaceChildren(...p.rows.filter((r) => !filter.value || r.state === filter.value).map((r) => {
        const [label, tone] = STATE[r.state] || ['Situação desconhecida', 'neutral'];
        const selectable = ['valid', 'duplicate'].includes(r.state);
        const box = el('input', { type: 'checkbox', 'aria-label': `Importar linha ${r.line}`, disabled: !selectable });
        box.checked = state.selected.has(r.line);
        box.addEventListener('change', () => { if (box.checked) state.selected.add(r.line); else state.selected.delete(r.line); sync(); });
        const v = r.values || {};
        return el('tr', { dataset: { line: String(r.line), state: r.state } }, [
          el('td', { 'data-label': 'Importar' }, box), el('td', { 'data-label': 'Linha', class: 'num', text: String(r.line) }),
          el('td', { 'data-label': 'Situação' }, el('span', { class: `tag tag-${tone}`, text: label })),
          el('td', { 'data-label': 'Serviço', text: v.service || '—' }), el('td', { 'data-label': 'Período', text: v.period_start ? `${v.period_start} a ${v.period_end || '?'}` : '—' }),
          el('td', { 'data-label': 'Valor', class: 'num', text: v.observed_amount ? `${v.currency || ''} ${v.observed_amount}`.trim() : '—' }),
          el('td', { 'data-label': 'Problemas' }, (r.errors || []).length ? el('ul', { class: 'plain-list small' }, r.errors.map((e) => el('li', { text: `${e.column ? `Coluna "${e.column}": ` : ''}${CODE_TEXT[e.code] || 'Problema'}${e.suggestion ? ` — ${e.suggestion}` : ''}` })))
            : r.state === 'conflicting' ? el('span', { class: 'small', text: 'Mesmo identificador de origem com valores diferentes do já registrado. Não sobrescreve: revise a origem.' }) : el('span', { class: 'muted small', text: '—' }))
        ]);
      }));
    };
    filter.addEventListener('change', draw);
    confirm.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: `Gravar ${plural(state.selected.size, 'linha', 'linhas')}?`, description: 'O servidor relê o arquivo e refaz a validação. Se algo mudou desde a prévia, nada é gravado. Diferenças contra o contrato ficam para revisão humana; não são economia.', confirmLabel: 'Gravar' });
      if (!ok) return;
      confirm.disabled = true;
      try {
        const out = await ctx.api('fee-imports/confirm', { method: 'POST', body: JSON.stringify({ ...body(), confirmation: true, preview_fingerprint: p.fingerprint, selected_lines: [...state.selected].sort((a, b) => a - b), request_key: state.confirmKey }) });
        stepFour(out.receipt || out);
      } catch (error) {
        errBox.replaceChildren(el('span', { text: importErrorMessage(error) }), ...(sessionLink(error) ? [' ', sessionLink(error)] : []));
        errBox.hidden = false; confirm.disabled = false;
        if (!error.status || error.status >= 500) confirm.querySelector('.btn-label').textContent = 'Repetir a mesma confirmação';
      }
    });
    const errBox = el('div', { class: 'callout callout-error compact', role: 'alert', hidden: true });
    area.replaceChildren(
      el('ul', { class: 'import-stats', 'aria-label': 'Resumo da prévia' }, Object.entries(STATE).filter(([k]) => stats[k]).map(([k, [label, tone]]) => el('li', { class: `tag tag-${tone}`, text: `${label}: ${stats[k]}` }))),
      el('p', { class: 'muted small', text: `Prévia calculada pelo servidor sobre ${plural(p.rows.length, 'registro', 'registros')}. Só linhas válidas ou já registradas podem ser selecionadas.` }),
      el('div', { class: 'toolbar' }, [filter]),
      el('div', { class: 'table-card' }, el('table', { class: 'data-table compact import-preview' }, [el('thead', {}, el('tr', {}, ['Importar', 'Linha', 'Situação', 'Serviço', 'Período', 'Valor', 'Problemas'].map((t) => el('th', { scope: 'col', text: t })))), tbody])),
      selCount, errBox, el('div', { class: 'form-actions' }, [button('Corrigir mapeamento', { variant: 'ghost', onClick: stepTwo }), confirm]));
    draw(); sync();
  }

  // --------------------------------------------------------- 4. resultado
  function stepFour(receipt) {
    setStep(4);
    const rows = receipt.rows || [];
    const imported = receipt.imported ?? rows.filter((r) => r.state === 'imported').length;
    const ignored = receipt.ignored ?? rows.filter((r) => r.state === 'ignored').length;
    area.replaceChildren(
      el('div', { class: 'callout callout-success', role: 'status' }, [icon('checkCircle', { size: 16 }), el('span', { text: `${receipt.replayed ? 'Esta importação já tinha sido registrada; nada foi duplicado. ' : ''}${plural(imported, 'linha importada', 'linhas importadas')}, ${plural(ignored, 'linha ignorada (já registrada)', 'linhas ignoradas (já registradas)')}.` })]),
      ...(rows.length ? [el('ul', { class: 'plain-list small' }, rows.map((r) => el('li', { text: `Linha ${r.line}: ${r.state === 'imported' ? 'importada' : 'já existia, ignorada'}` })))] : []),
      el('p', { class: 'muted small', text: 'As cobranças observadas entram em Tarifas bancárias, comparadas às tarifas do contrato. Diferenças aguardam revisão humana.' }),
      el('div', { class: 'form-actions' }, [
        el('a', { class: 'btn btn-secondary', href: ctx.href(`/finance/fees.html?contract_id=${enc(contract.value)}`) }, el('span', { class: 'btn-label', text: 'Ver tarifas do contrato' })),
        el('a', { class: 'btn btn-ghost', href: ctx.href(`/finance/contracts.html?abrir=contrato#contract-${contract.value}`) }, el('span', { class: 'btn-label', text: 'Abrir contrato' })),
        button('Importar outro arquivo', { variant: 'primary', onClick: () => { Object.assign(state, { file: null, bytes: null, preview: null, requestKey: uid(), confirmKey: null, selected: new Set() }); fileInput.value = ''; stepOne(); } })
      ]), history());
  }
  function history() {
    const box = el('section', { class: 'stack-sm', 'aria-label': 'Importações deste contrato' }, [el('h3', { class: 'small', text: 'Importações anteriores deste contrato' })]);
    ctx.api(`fee-imports/history?organization_id=${enc(ctx.organization.id)}&contract_id=${enc(contract.value)}&limit=25`).then((out) => {
      const rows = out.rows || [];
      box.append(rows.length ? el('ul', { class: 'plain-list small' }, rows.map((r) => el('li', { text: `${formatDate(r.happened_at)} · ${r.metadata?.file_name || 'arquivo'} · ${plural(r.metadata?.imported ?? 0, 'importada', 'importadas')}` }))) : el('p', { class: 'muted small', text: 'Nenhuma importação anterior.' }));
    }).catch(() => box.append(el('p', { class: 'muted small', text: 'Histórico indisponível agora.' })));
    return box;
  }

  stepOne();
  return drawer({ title: 'Importar tarifas cobradas', subtitle: 'Extrato ou planilha de cobranças → prévia por linha → confirmação.', body: el('div', { class: 'stack' }, [steps, area]), className: 'drawer-wide import-drawer' });
}
