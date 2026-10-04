// Integrações (Public API v1 & Webhooks) em Configurações — só administração.
//
// Token de conta de serviço e segredo de webhook aparecem uma única vez, na
// resposta da criação; a tela não guarda nenhum dos dois. Docs:
// docs/FINANCIAL_PUBLIC_API.md.

import { el, icon, formatDateTime } from '../core.js';
import { button, tag, field, emptyState, errorState, loading, toast, confirmDialog } from '../ui.js';
import { SCOPE_LABELS, API_SCOPES, WEBHOOK_EVENTS } from '../../../lib/finance/api-catalog.mjs';

const EVENT_LABELS = {
  'rfq.created': 'Solicitação criada', 'rfq.status_changed': 'Solicitação mudou de estado', 'proposal.submitted': 'Proposta enviada ou revisada',
  'decision.recorded': 'Decisão registrada', 'approval.required': 'Aprovação solicitada', 'approval.completed': 'Aprovação concluída',
  'contract.created': 'Contrato registrado', 'contract.renewal_due': 'Renovação de contrato em revisão'
};
const DELIVERY_TONE = { succeeded: 'success', failed: 'warning', dead: 'danger', pending: 'info', delivering: 'info', cancelled: 'neutral' };
const DELIVERY_LABEL = { succeeded: 'entregue', failed: 'falhou (vai tentar de novo)', dead: 'dead-letter', pending: 'na fila', delivering: 'enviando', cancelled: 'cancelada' };

/** Exibe um segredo uma única vez, com cópia. */
function revealOnce(label, value, notice) {
  const code = el('code', { class: 'mono secret-once', text: value });
  const copy = button('Copiar', { size: 'sm', iconName: 'check', onClick: async () => {
    try { await navigator.clipboard.writeText(value); toast('Copiado.'); } catch { toast('Copie manualmente o valor exibido.', 'error'); }
  } });
  return el('div', { class: 'callout callout-warning stack-xs', role: 'status' }, [el('strong', { text: label }), code, el('span', { class: 'small', text: notice }), copy]);
}

function checkboxes(legend, values, labels, selected = []) {
  const group = el('fieldset', { class: 'check-row' }, el('legend', { class: 'field-label', text: legend }));
  for (const value of values) group.append(el('label', { class: 'check-option' }, [el('input', { type: 'checkbox', value, checked: selected.includes(value) }), el('span', { text: labels[value] || value })]));
  return group;
}
const checked = (group) => [...group.querySelectorAll('input:checked')].map((input) => input.value);

export function integrationSettings(ctx, entities) {
  const box = el('div', { class: 'stack integration-settings' }, loading());
  const entityOptions = (entities?.rows || []).filter((row) => row.status === 'active');
  // Fora do re-render: o token/segredo exibido uma vez não pode sumir quando a lista recarrega.
  const reveals = { accounts: el('div', { class: 'reveal-slot' }), hooks: el('div', { class: 'reveal-slot' }) };
  const render = async () => {
    let accounts; let hooks;
    try {
      [accounts, hooks] = await Promise.all([
        ctx.api(`service-accounts?organization_id=${encodeURIComponent(ctx.organization.id)}`),
        ctx.api(`webhooks?organization_id=${encodeURIComponent(ctx.organization.id)}`)
      ]);
    } catch (error) {
      box.replaceChildren(error?.status === 403 || error?.code === 'forbidden'
        ? el('p', { class: 'muted small', text: 'Integrações são administradas por quem tem papel de administração.' })
        : errorState({ error }));
      return;
    }
    box.replaceChildren(
      el('p', { class: 'muted small', text: 'A API v1 é máquina-a-máquina (ERP, TMS, data platform). Cada credencial vale para uma organização, entidades e escopos definidos aqui; o acesso final é credencial + organização + entidade + escopo + objeto. Tokens expiram e podem ser revogados.' }),
      accountsSection(ctx, accounts, entityOptions, render, reveals.accounts),
      webhooksSection(ctx, hooks, entityOptions, render, reveals.hooks)
    );
  };
  render();
  return box;
}

function accountsSection(ctx, result, entityOptions, render, reveal) {
  const list = (result.rows || []).length ? el('ul', { class: 'plain-list' }, result.rows.map((account) => {
    const active = account.status === 'active';
    const credentials = (account.credentials || []).map((credential) => {
      const live = !credential.revoked_at && Date.parse(credential.expires_at) > Date.now();
      return el('li', { class: 'small' }, [el('code', { class: 'mono', text: `${credential.token_prefix}…` }),
        el('span', { class: 'muted', text: ` · expira ${formatDateTime(credential.expires_at)} · último uso ${credential.last_used_at ? formatDateTime(credential.last_used_at) : 'nunca'}` }),
        credential.revoked_at ? tag('revogada') : live ? tag('ativa', 'success') : tag('expirada', 'warning'),
        live ? button('Revogar', { size: 'sm', variant: 'ghost', onClick: async () => {
          if (!await confirmDialog({ title: 'Revogar esta credencial?', description: 'Integrações que usam este token param na próxima chamada.', confirmLabel: 'Revogar', tone: 'danger' })) return;
          try { await ctx.api('service-accounts/credentials-revoke', { method: 'POST', body: JSON.stringify({ credential_id: credential.id }) }); toast('Credencial revogada.'); render(); } catch (error) { toast(error.message, 'error'); }
        } }) : null]);
    });
    return el('li', { class: 'card' }, el('div', { class: 'card-body stack-sm' }, [
      el('div', { class: 'policy-head' }, [el('strong', { text: account.name }), tag(active ? 'ativa' : account.status === 'revoked' ? 'revogada' : 'desativada', active ? 'success' : 'neutral')]),
      el('span', { class: 'small', text: `Escopos: ${account.scopes.map((scope) => SCOPE_LABELS[scope] || scope).join(', ')}` }),
      el('span', { class: 'small muted', text: account.entity_scope === 'group' ? 'Alcance: todas as entidades do grupo' : `Alcance: ${account.entity_ids.length} entidade(s)` }),
      el('span', { class: 'small muted', text: `Último uso: ${account.last_used_at ? formatDateTime(account.last_used_at) : 'nunca'}` }),
      credentials.length ? el('ul', { class: 'plain-list' }, credentials) : null,
      active ? el('div', { class: 'row-actions' }, [
        button('Emitir token', { size: 'sm', iconName: 'plus', onClick: async () => {
          try {
            const out = await ctx.api('service-accounts/credentials', { method: 'POST', body: JSON.stringify({ service_account_id: account.id, expires_in_days: 90 }) });
            reveal.replaceChildren(revealOnce(`Token de ${account.name}`, out.token, 'Copie agora: ele não será mostrado de novo. Válido por 90 dias. Envie no cabeçalho Authorization: Bearer.'));
            toast('Token emitido.');
            render().then(() => reveal.scrollIntoView?.({ block: 'nearest' }));
          } catch (error) { toast(error.message, 'error'); }
        } }),
        button('Revogar conta', { size: 'sm', variant: 'danger-ghost', onClick: async () => {
          if (!await confirmDialog({ title: `Revogar ${account.name}?`, description: 'Todas as credenciais param na próxima chamada e os webhooks criados por esta conta são desativados. O histórico continua.', confirmLabel: 'Revogar conta', tone: 'danger' })) return;
          try { await ctx.api('service-accounts/revoke', { method: 'POST', body: JSON.stringify({ service_account_id: account.id }) }); toast('Conta revogada.'); render(); } catch (error) { toast(error.message, 'error'); }
        } })]) : null
    ]));
  })) : emptyState({ title: 'Nenhuma conta de serviço', text: 'Crie uma conta para cada sistema que vai integrar.', compact: true, iconName: 'shield' });

  const name = el('input', { maxlength: '120', placeholder: 'Ex.: ERP SAP do grupo' });
  const scopes = checkboxes('Escopos', API_SCOPES, SCOPE_LABELS, ['rfqs:read']);
  const scope = el('select', {}, [el('option', { value: 'group', text: 'Todas as entidades do grupo' }), el('option', { value: 'entities', text: 'Só entidades escolhidas' })]);
  const entities = checkboxes('Entidades', entityOptions.map((row) => row.id), Object.fromEntries(entityOptions.map((row) => [row.id, row.short_name || row.legal_name])));
  entities.hidden = true;
  scope.addEventListener('change', () => { entities.hidden = scope.value !== 'entities'; });
  const form = el('form', { class: 'stack-sm', novalidate: true }, [field({ label: 'Nome do sistema', control: name }), scopes, field({ label: 'Alcance', control: scope }), entities,
    button('Criar conta de serviço', { type: 'submit', size: 'sm', iconName: 'plus' })]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await ctx.api('service-accounts', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, name: name.value.trim(), scopes: checked(scopes),
        entity_scope: scope.value, entity_ids: scope.value === 'entities' ? checked(entities) : [] }) });
      toast('Conta criada. Emita um token para começar.'); render();
    } catch (error) { toast(error.message, 'error'); }
  });
  return el('section', { class: 'stack-sm', 'aria-label': 'Contas de serviço' }, [el('h3', { text: 'Contas de serviço e tokens' }), reveal, list,
    el('details', {}, [el('summary', { text: 'Nova conta de serviço' }), form])]);
}

function webhooksSection(ctx, result, entityOptions, render, reveal) {
  const unconfigured = result.secrets_configured === false
    ? el('p', { class: 'callout callout-warning compact' }, [icon('alert', { size: 14 }), el('span', { text: 'Webhooks indisponíveis neste ambiente: a chave de cifragem dos segredos (ARANDU_WEBHOOK_SECRET_KEY) não está configurada. Peça ao responsável pelo ambiente.' })])
    : null;
  const list = (result.rows || []).length ? el('ul', { class: 'plain-list' }, result.rows.map((hook) => el('li', { class: 'card' }, el('div', { class: 'card-body stack-sm' }, [
    el('div', { class: 'policy-head' }, [el('code', { class: 'mono', text: hook.url }), tag(hook.status === 'active' ? 'ativo' : hook.status === 'disabled_failing' ? 'desativado por falhas' : 'desativado', hook.status === 'active' ? 'success' : 'warning')]),
    el('span', { class: 'small', text: hook.events.map((event) => EVENT_LABELS[event] || event).join(' · ') }),
    hook.consecutive_failures ? el('span', { class: 'small muted', text: `${hook.consecutive_failures} falha(s) seguida(s)` }) : null,
    (hook.deliveries || []).length ? el('details', {}, [el('summary', { text: `Entregas recentes (${hook.deliveries.length})` }), el('ul', { class: 'plain-list small' }, hook.deliveries.map((delivery) => el('li', {}, [
      tag(DELIVERY_LABEL[delivery.status] || delivery.status, DELIVERY_TONE[delivery.status] || 'neutral'),
      el('span', { class: 'muted', text: ` ${formatDateTime(delivery.created_at)} · tentativas ${delivery.attempts}${delivery.last_status_code ? ` · HTTP ${delivery.last_status_code}` : ''}${delivery.last_error_code ? ` · ${delivery.last_error_code}` : ''}${delivery.replay_of ? ' · reenvio' : ''}` }),
      ['succeeded', 'failed', 'dead', 'cancelled'].includes(delivery.status) && hook.status === 'active' ? button('Reenviar', { size: 'sm', variant: 'ghost', onClick: async () => {
        try { await ctx.api('webhooks/replay', { method: 'POST', body: JSON.stringify({ delivery_id: delivery.id }) }); toast('Reenvio na fila.'); render(); } catch (error) { toast(error.message, 'error'); }
      } }) : null
    ])))]) : el('span', { class: 'small muted', text: 'Nenhuma entrega ainda.' }),
    el('div', { class: 'row-actions' }, button(hook.status === 'active' ? 'Desativar' : 'Reativar', { size: 'sm', variant: 'ghost', onClick: async () => {
      try { await ctx.api('webhooks/status', { method: 'POST', body: JSON.stringify({ endpoint_id: hook.id, active: hook.status !== 'active' }) }); toast('Webhook atualizado.'); render(); } catch (error) { toast(error.message, 'error'); }
    } }))
  ])))) : emptyState({ title: 'Nenhum webhook', text: 'Receba eventos mínimos (ids, tipo e estado) assinados com HMAC.', compact: true, iconName: 'send' });

  const url = el('input', { type: 'url', maxlength: '500', placeholder: 'https://erp.suaempresa.com.br/arandu/webhook' });
  const events = checkboxes('Eventos', WEBHOOK_EVENTS, EVENT_LABELS, ['rfq.created', 'approval.required']);
  const entities = checkboxes('Filtrar entidades (opcional)', entityOptions.map((row) => row.id), Object.fromEntries(entityOptions.map((row) => [row.id, row.short_name || row.legal_name])));
  const form = el('form', { class: 'stack-sm', novalidate: true }, [field({ label: 'URL https pública', control: url, hint: 'Porta 443, sem usuário/senha; endereços internos são recusados.' }), events,
    entityOptions.length ? entities : el('span'), button('Criar webhook', { type: 'submit', size: 'sm', iconName: 'plus' })]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const out = await ctx.api('webhooks', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, url: url.value.trim(), events: checked(events), entity_ids: checked(entities) }) });
      reveal.replaceChildren(revealOnce('Segredo de assinatura', out.secret, 'Copie agora: ele não será mostrado de novo. Use-o para verificar o cabeçalho Arandu-Signature.'));
      toast('Webhook criado.'); render();
    } catch (error) { toast(error.message, 'error'); }
  });
  const dispatch = button('Enviar pendentes agora', { size: 'sm', iconName: 'send', onClick: async () => {
    try { const out = await ctx.api('webhooks/dispatch', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id }) }); toast(`${out.succeeded} entregue(s), ${out.failed + out.dead} com falha.`); render(); }
    catch (error) { toast(error.message, 'error'); }
  } });
  return el('section', { class: 'stack-sm', 'aria-label': 'Webhooks' }, [el('h3', { text: 'Webhooks' }), unconfigured, reveal, list, el('div', { class: 'row-actions' }, dispatch),
    el('details', {}, [el('summary', { text: 'Novo webhook' }), form])]);
}
