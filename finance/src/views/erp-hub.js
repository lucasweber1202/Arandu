// ERP Hub sobre `erp-fees` (docs/PLATFORM_INGESTION_BACKEND_CONTRACTS_2026_11.md).
//
// Único adaptador implementado: Microsoft Dynamics 365 Business Central API v2.0
// (despesas de uma conta mapeada → cobranças observadas de um contrato). Os
// demais ERPs continuam "planejados". Estados separados e verdadeiros:
// configurada ≠ conectada. `connection_state:not_tested` é exibido como tal;
// a prévia é o único teste real, e só com credencial aprovada no servidor.
// Nenhum segredo é pedido ou aceito aqui.

import { el, icon, formatDate, formatDateTime, uid, plural } from '../core.js';
import { button, tag, field, drawer, toast, confirmDialog, sessionLink, loading, errorState } from '../ui.js';
import { CHARGING_UNITS } from '../../../lib/finance/fee-intelligence.mjs';
import { periodText, amountText } from './fee-import.js';

const enc = encodeURIComponent;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ERP_CATALOG = Object.freeze([
  { key: 'bc', name: 'Microsoft Dynamics 365 Business Central', state: 'implemented', detail: 'Lê lançamentos de uma conta de despesa (API v2.0, generalLedgerEntries) e os traz como cobranças observadas de um contrato, com prévia e confirmação.' },
  { key: 'sap', name: 'SAP S/4HANA', state: 'planned' }, { key: 'oracle', name: 'Oracle Fusion', state: 'planned' },
  { key: 'dfo', name: 'Microsoft Dynamics 365 Finance & Operations', state: 'planned' }, { key: 'totvs', name: 'TOTVS Protheus / RM', state: 'planned' },
  { key: 'senior', name: 'Senior', state: 'planned' }, { key: 'sankhya', name: 'Sankhya', state: 'planned' }
]);
const STATUS = { configured: ['Configurada · conexão não testada', 'info'], suspended: ['Suspensa', 'warning'], revoked: ['Revogada', 'neutral'] };

export function erpErrorMessage(error) {
  const code = error?.code;
  if (code === 'erp_not_configured') return 'A conexão com o Business Central não está habilitada no servidor deste ambiente (credencial e vínculo de tenant/empresa aprovados pela operação). Nenhuma chamada externa foi feita.';
  if (error?.status === 503) return 'O Business Central não respondeu, recusou o acesso ou o recorte excedeu os limites (5 páginas / 100 lançamentos). Nada foi importado.';
  if (error?.status === 409) return 'A integração mudou (suspensa, revogada ou nova versão) ou a origem mudou desde a prévia. Recarregue e gere outra prévia.';
  if (error?.status === 403) return 'Configurar integrações exige administração; consultar a origem exige administração ou gestão financeira.';
  if (error?.status === 400) return 'Confira os identificadores (formato UUID), ambiente, moeda, serviço, unidade e o período. Nada foi gravado.';
  if (error?.status === 401) return error.message;
  return 'Sem confirmação do servidor. Recarregue a lista antes de repetir; repetir aqui reenvia a mesma ação.';
}

export function erpHubSection(ctx, { contracts = [] } = {}) {
  const root = el('section', { class: 'stack-sm erp-hub', id: 'erp-hub', 'aria-labelledby': 'erp-hub-title' });
  const admin = ctx.viewer?.role === 'admin';
  const reader = ['admin', 'finance_manager'].includes(ctx.viewer?.role);
  const contractName = (id) => { const c = contracts.find((x) => x.id === id); return c ? `${c.title || 'Contrato'} · ${c.provider_name || 'instituição'}` : 'Contrato do seu escopo'; };
  const head = [
    el('h3', { id: 'erp-hub-title', text: 'Conectores de ERP' }),
    el('p', { class: 'small', text: 'Além da API pública e dos webhooks, o Arandu tem um adaptador de leitura para o Business Central. "Configurada" registra o mapeamento; a conexão só é comprovada quando uma prévia lê dados reais com credencial aprovada no servidor.' })
  ];
  const catalog = el('ul', { class: 'plain-list erp-list', 'aria-label': 'ERPs' }, ERP_CATALOG.map((erp) => el('li', { class: 'erp-row', dataset: { state: erp.state } }, [
    el('div', {}, [el('span', { text: erp.name }), erp.detail ? el('p', { class: 'muted small', text: erp.detail }) : null]),
    erp.state === 'implemented' ? tag('Adaptador implementado · leitura', 'info') : tag('Suporte planejado · sem conector', 'neutral')])));
  const list = el('div', { class: 'stack-sm' });
  const load = async () => {
    list.replaceChildren(loading('Carregando integrações…'));
    try {
      const out = await ctx.api(`erp-fees?organization_id=${enc(ctx.organization.id)}&limit=100`);
      const rows = out.rows || [];
      list.replaceChildren(
        el('h4', { class: 'small', text: `Integrações Business Central (${rows.length})` }),
        rows.length ? el('ul', { class: 'plain-list crm-list' }, rows.map(row)) : el('p', { class: 'muted small', text: 'Nenhuma integração configurada.' }),
        admin ? button('Configurar Business Central', { size: 'sm', iconName: 'plus', onClick: () => configure() }) : el('p', { class: 'muted small', text: 'Somente administração configura integrações.' }));
    } catch (error) {
      list.replaceChildren(error.status === 503 ? el('p', { class: 'callout callout-info compact', text: 'Integrações de ERP ainda não estão disponíveis neste ambiente.' }) : errorState({ title: 'Integrações indisponíveis', error: { ...error, message: erpErrorMessage(error) }, onRetry: load }));
    }
  };
  function row(cfg) {
    const [label, tone] = STATUS[cfg.status] || ['Situação desconhecida', 'neutral'];
    const s = cfg.settings || {};
    return el('li', { class: 'crm-row', dataset: { integration: cfg.status } }, [
      el('div', { class: 'crm-row-main' }, [
        el('strong', { text: contractName(cfg.contract_id) }),
        el('span', { class: 'small', text: `Ambiente ${s.environment || '—'} · serviço "${s.service || '—'}" · ${s.currency || '—'} · ${CHARGING_UNITS[s.charging_unit] || s.charging_unit || '—'}` }),
        el('span', { class: 'muted small', text: `Versão ${cfg.version}${cfg.updated_at || cfg.happened_at ? ` · ${formatDateTime(cfg.updated_at || cfg.happened_at)}` : ''} · conexão externa ${cfg.connection_state === 'not_tested' || !cfg.connection_state ? 'não testada' : 'informada pelo servidor'}` })
      ]),
      tag(label, tone),
      el('div', { class: 'crm-row-actions' }, [
        cfg.status === 'configured' && reader ? button('Prévia do ERP', { size: 'sm', iconName: 'eye', onClick: () => erpPreview(cfg) }) : null,
        admin && cfg.status !== 'revoked' ? button('Editar', { size: 'sm', variant: 'ghost', onClick: () => configure(cfg) }) : null,
        admin && cfg.status === 'configured' ? button('Suspender', { size: 'sm', variant: 'ghost', onClick: () => setStatus(cfg, 'suspended') }) : null,
        admin && cfg.status === 'suspended' ? button('Reativar', { size: 'sm', variant: 'ghost', onClick: () => setStatus(cfg, 'configured') }) : null,
        admin && cfg.status !== 'revoked' ? button('Revogar', { size: 'sm', variant: 'ghost', onClick: () => setStatus(cfg, 'revoked') }) : null
      ])
    ]);
  }
  async function setStatus(cfg, status) {
    const ok = await confirmDialog({ title: status === 'revoked' ? 'Revogar integração?' : status === 'suspended' ? 'Suspender integração?' : 'Reativar integração?',
      description: status === 'revoked' ? 'Revogação é definitiva: a integração não volta a ler o ERP. Importações já confirmadas continuam no histórico.' : status === 'suspended' ? 'Prévias e confirmações ficam bloqueadas até reativar.' : 'Prévias voltam a ser permitidas.',
      confirmLabel: status === 'revoked' ? 'Revogar' : status === 'suspended' ? 'Suspender' : 'Reativar', tone: status === 'configured' ? 'primary' : 'danger' });
    if (!ok) return;
    try {
      await ctx.send('erp-fees/configure', { organization_id: ctx.organization.id, integration_id: cfg.id, contract_id: cfg.contract_id, expected_version: cfg.version, request_key: uid(), status, settings: cfg.settings });
      toast(status === 'revoked' ? 'Integração revogada.' : status === 'suspended' ? 'Integração suspensa.' : 'Integração reativada.'); load();
    } catch (error) { toast(erpErrorMessage(error), 'error'); if (error.status === 409) load(); }
  }
  function configure(cfg = null) {
    const s = cfg?.settings || {};
    const input = (key, attrs = {}) => el('input', { class: 'input', value: s[key] || '', ...attrs });
    const contract = el('select', { class: 'input', disabled: Boolean(cfg) }, [new Option('Selecione o contrato', ''), ...contracts.filter((c) => ['active', 'renewing'].includes(c.status) || c.id === cfg?.contract_id).map((c) => new Option(contractName(c.id), c.id, false, c.id === cfg?.contract_id))]);
    const tenant = input('tenant_id', { placeholder: '00000000-0000-0000-0000-000000000000' });
    const env = input('environment', { placeholder: 'production ou sandbox' });
    const company = input('company_id'); const account = input('account_id');
    const currency = input('currency', { maxlength: '3', placeholder: 'BRL' });
    const service = input('service', { maxlength: '120', placeholder: 'Ex.: Tarifas bancárias Atlas' });
    const unit = el('select', { class: 'input' }, Object.entries(CHARGING_UNITS).map(([k, label]) => new Option(label, k, false, k === s.charging_unit)));
    const specs = [
      [contract, 'Contrato que recebe as cobranças', 'Fixado no cadastro.', (v) => (cfg || v) ? '' : 'Selecione o contrato.'],
      [tenant, 'Tenant Microsoft Entra (ID)', null, (v) => UUID.test(v) ? '' : 'Use o ID do tenant (formato UUID).'],
      [env, 'Ambiente do Business Central', null, (v) => /^[A-Za-z0-9_-]{1,60}$/.test(v) ? '' : 'Nome do ambiente: letras, números, _ ou -.'],
      [company, 'Empresa (ID)', null, (v) => UUID.test(v) ? '' : 'Use o ID da empresa (formato UUID).'],
      [account, 'Conta de despesa (ID)', 'Só lançamentos desta conta são lidos.', (v) => UUID.test(v) ? '' : 'Use o ID da conta (formato UUID).'],
      [currency, 'Moeda dos lançamentos', 'A API não informa a moeda: é uma declaração sua.', (v) => /^[A-Z]{3}$/.test(v) ? '' : 'Código de três letras.'],
      [service, 'Serviço correspondente', null, (v) => v.length >= 2 ? '' : 'Descreva o serviço.'],
      [unit, 'Unidade de cobrança', null, () => '']
    ];
    const wraps = specs.map(([control, label, hint]) => field({ label, control, hint, required: true }));
    const err = el('div', { class: 'callout callout-error compact', role: 'alert', hidden: true });
    const save = button('Gravar configuração', { variant: 'primary', type: 'submit' });
    const form = el('form', { class: 'stack', novalidate: true }, [
      el('p', { class: 'callout callout-info compact', role: 'note', text: 'Nenhuma senha, token ou segredo é pedido aqui. A credencial do Business Central é provisionada pela operação no servidor; sem ela, a prévia responde que a conexão não está habilitada.' }),
      ...wraps, err, save]);
    const key = uid();
    const dialog = drawer({ title: cfg ? 'Editar integração Business Central' : 'Configurar Business Central', body: form });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      let bad = null;
      specs.forEach(([control, , , check], i) => { const msg = check(control.value.trim()); wraps[i].setError(msg); if (msg && !bad) bad = control; });
      if (bad) { bad.focus(); return; }
      save.disabled = true; err.hidden = true;
      try {
        await ctx.send('erp-fees/configure', { organization_id: ctx.organization.id, integration_id: cfg?.id || (configure.id ||= uid()), contract_id: cfg?.contract_id || contract.value, expected_version: cfg?.version || 0, request_key: key, status: cfg?.status || 'configured',
          settings: { tenant_id: tenant.value.trim(), environment: env.value.trim(), company_id: company.value.trim(), account_id: account.value.trim(), currency: currency.value.trim(), service: service.value.trim(), charging_unit: unit.value } });
        configure.id = null; dialog.close(); toast('Configuração gravada. Conexão ainda não testada: gere uma prévia.'); load();
      } catch (error) { err.replaceChildren(el('span', { text: erpErrorMessage(error) }), ...(sessionLink(error) ? [' ', sessionLink(error)] : [])); err.hidden = false; save.disabled = false; }
    });
  }
  function erpPreview(cfg) {
    const start = el('input', { type: 'date', class: 'input' }); const end = el('input', { type: 'date', class: 'input' });
    const out = el('div', { class: 'stack-sm', 'aria-live': 'polite' });
    const go = button('Ler o Business Central', { variant: 'primary', iconName: 'eye' });
    const confirmKey = uid();
    let preview = null;
    go.addEventListener('click', async () => {
      if (!start.value || !end.value || end.value < start.value) { out.replaceChildren(el('p', { class: 'callout callout-error compact', role: 'alert', text: 'Informe um período válido (início ≤ fim).' })); return; }
      go.disabled = true; out.replaceChildren(loading('Consultando o ERP…'));
      try {
        preview = (await ctx.send('erp-fees/preview', { organization_id: ctx.organization.id, integration_id: cfg.id, period_start: start.value, period_end: end.value })).preview;
        drawPreview();
      } catch (error) { out.replaceChildren(el('p', { class: 'callout callout-error compact', role: 'alert', text: erpErrorMessage(error) })); }
      finally { go.disabled = false; }
    });
    const ROW_STATE = { valid: 'válido', duplicate: 'já registrado', conflicting: 'conflita com registro existente', invalid: 'inválido', incomplete: 'incompleto', pending_review: 'requer revisão; não será importado automaticamente' };
    function drawPreview() {
      const rows = preview.rows || [];
      const stats = preview.stats || {};
      // Revisão humana por lançamento: começa com os válidos marcados; a pessoa pode desmarcar.
      const selected = new Set(rows.filter((r) => r.state === 'valid').map((r) => r.line));
      const confirm = button('', { variant: 'primary', iconName: 'check' });
      const sync = () => {
        confirm.querySelector('.btn-label').textContent = `Confirmar ${plural(selected.size, 'lançamento selecionado', 'lançamentos selecionados')}`;
        confirm.disabled = !selected.size;
      };
      confirm.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Gravar lançamentos selecionados?', description: 'O Arandu lê o ERP de novo; se a origem mudou, nada é gravado e uma nova prévia é necessária. Diferenças contra o contrato ficam para revisão humana; não são economia.', confirmLabel: 'Gravar' }))) return;
        confirm.disabled = true;
        try {
          const r = await ctx.send('erp-fees/confirm', { organization_id: ctx.organization.id, integration_id: cfg.id, period_start: start.value, period_end: end.value, confirmation: true, preview_fingerprint: preview.fingerprint, selected_lines: [...selected].sort((a, b) => a - b), request_key: confirmKey });
          out.replaceChildren(el('p', { class: 'callout callout-success', role: 'status' }, [icon('checkCircle', { size: 16 }), el('span', { text: `${r.replayed ? 'Já registrado antes; nada duplicado. ' : ''}${plural(r.imported ?? 0, 'lançamento importado', 'lançamentos importados')}, ${plural(r.ignored ?? 0, 'ignorado', 'ignorados')}. Período ${formatDate(start.value)} a ${formatDate(end.value)}.` })]),
            el('a', { class: 'btn btn-secondary btn-sm', href: ctx.href(`/finance/fees.html?contract_id=${enc(cfg.contract_id)}`) }, el('span', { class: 'btn-label', text: 'Ver tarifas do contrato' })),
            el('a', { class: 'btn btn-ghost btn-sm', href: ctx.href(`/finance/contracts.html?abrir=contrato#contract-${cfg.contract_id}`) }, el('span', { class: 'btn-label', text: 'Abrir contrato' })));
        } catch (error) {
          out.querySelector('.erp-confirm-error')?.remove();
          out.append(el('p', { class: 'callout callout-error compact erp-confirm-error', role: 'alert' }, [el('span', { text: erpErrorMessage(error) }), ...(sessionLink(error) ? [' ', sessionLink(error)] : [])]));
          confirm.disabled = false;
        }
      });
      const list = el('ul', { class: 'plain-list erp-preview-rows', 'aria-label': 'Lançamentos lidos' }, rows.slice(0, 100).map((r) => {
        const box = el('input', { type: 'checkbox', 'aria-label': `Importar lançamento ${r.line}`, disabled: r.state !== 'valid' });
        box.checked = selected.has(r.line);
        box.addEventListener('change', () => { if (box.checked) selected.add(r.line); else selected.delete(r.line); sync(); });
        const v = r.values || {};
        return el('li', { class: 'erp-preview-row small', dataset: { line: String(r.line), state: r.state } }, [
          el('label', { class: 'checkbox' }, [box, el('span', { text: `Lançamento ${r.line} · ${v.period_start ? formatDate(v.period_start) : periodText(v)} · ${amountText(v)} · ${ROW_STATE[r.state] || 'situação não reconhecida'}` })])]);
      }));
      out.replaceChildren(
        el('p', { class: 'small', text: `${plural(rows.length, 'lançamento lido', 'lançamentos lidos')}${preview.coverage?.complete === false ? ' (recorte incompleto: reduza o período)' : ''}. ${Object.entries(stats).filter(([, n]) => n).map(([k, n]) => `${({ valid: 'válidos', duplicate: 'já registrados', conflicting: 'em conflito', invalid: 'inválidos', incomplete: 'incompletos', pending_review: 'para revisão (créditos, estornos ou zero)' })[k] || 'outros'}: ${n}`).join(' · ')}` }),
        el('p', { class: 'muted small', text: 'Só lançamentos válidos podem ser marcados. Desmarque o que não pertence a este contrato antes de gravar.' }),
        list, confirm);
      sync();
    }
    drawer({ title: 'Prévia do Business Central', subtitle: contractName(cfg.contract_id), body: el('div', { class: 'stack' }, [
      el('p', { class: 'muted small', text: 'Leitura de até 5 páginas / 100 lançamentos da conta mapeada. Créditos, estornos e valores zero ficam para revisão, nunca viram despesa automaticamente.' }),
      field({ label: 'Início do período', control: start, required: true }), field({ label: 'Fim do período', control: end, required: true }), go, out]) });
  }
  root.append(...head, catalog, list);
  load();
  return root;
}
