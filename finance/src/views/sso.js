// Segurança: SSO corporativo (SAML/OIDC) em Configurações — só administração.
//
// A tela configura e mostra a prontidão; nunca diz "SSO funcionando" por
// configuração: "operacional" exige broker real, domínio verificado e um login
// bem-sucedido registrado. O registro TXT aparece uma única vez. Docs:
// docs/FINANCIAL_SSO.md.

import { el, icon, formatDateTime } from '../core.js';
import { button, tag, field, emptyState, errorState, loading, toast, confirmDialog } from '../ui.js';

const STATUS_LABEL = { draft: 'rascunho', testing: 'em teste', active: 'ativa', disabled: 'desativada' };
const STATUS_TONE = { draft: 'neutral', testing: 'info', active: 'success', disabled: 'warning' };
const CHECK_TONE = { ok: 'success', missing: 'neutral', blocked: 'danger' };
const CHECK_LABEL = { ok: 'ok', missing: 'pendente', blocked: 'bloqueado' };
const REASON_LABEL = {
  ok: 'login concluído', member_not_found: 'conta não convidada', member_disabled: 'conta bloqueada', session_revoked: 'sessões revogadas',
  session_expired: 'sessão passou do limite', domain_mismatch: 'domínio fora da conexão', provider_mismatch: 'outro provedor', org_mismatch: 'outra organização',
  connection_inactive: 'conexão inativa', state_invalid: 'tentativa expirada ou inválida', broker_failed: 'provedor não concluiu', email_unverified: 'e-mail não confirmado'
};

function post(ctx, path, body) { return ctx.api(path, { method: 'POST', body: JSON.stringify(body) }); }

export function ssoSettings(ctx) {
  const box = el('div', { class: 'stack sso-settings' }, loading());
  // Fora do re-render: o TXT exibido uma vez não pode sumir quando a lista recarrega.
  const reveal = el('div', { class: 'reveal-slot' });
  const render = async () => {
    let data;
    try { data = await ctx.api(`sso?organization_id=${encodeURIComponent(ctx.organization.id)}`); } catch (error) {
      box.replaceChildren(error?.status === 403 || error?.code === 'forbidden'
        ? el('p', { class: 'muted small', text: 'SSO é administrado por quem tem papel de administração.' })
        : errorState({ error }));
      return;
    }
    box.replaceChildren(
      el('p', { class: 'muted small', text: 'Login pelo provedor corporativo (Microsoft Entra ID, Okta, Google Workspace e outros, via SAML ou OIDC). A conta continua precisando de convite: SSO autentica, o papel e as entidades continuam definidos aqui. Enquanto a conexão não estiver ativa, o login por senha + MFA continua valendo.' }),
      environmentNotice(data),
      domainsSection(ctx, data, render, reveal),
      connectionsSection(ctx, data, render),
      eventsSection(data)
    );
  };
  render();
  return box;
}

function environmentNotice(data) {
  const missing = [];
  if (!data.state_secret_configured) missing.push('o segredo de assinatura do login (ARANDU_SSO_STATE_SECRET)');
  if (!data.broker_configured) missing.push('o broker de SSO (Supabase Auth com SSO habilitado; ARANDU_SSO_BROKER=supabase)');
  if (!missing.length) return null;
  return el('p', { class: 'callout callout-warning compact' }, [icon('alert', { size: 14 }),
    el('span', { text: `Neste ambiente falta ${missing.join(' e ')}. Dá para configurar e verificar domínios, mas nenhuma conexão fica operacional até o responsável pelo ambiente concluir isso.` })]);
}

function domainsSection(ctx, data, render, reveal) {
  const connections = data.connections || [];
  const list = (data.domains || []).length ? el('ul', { class: 'plain-list' }, data.domains.map((domain) => {
    const select = el('select', { 'aria-label': `Conexão do domínio ${domain.domain}` }, [el('option', { value: '', text: 'Sem conexão' }),
      ...connections.map((connection) => el('option', { value: connection.id, text: connection.display_name, selected: connection.id === domain.connection_id }))]);
    select.addEventListener('change', async () => {
      try { await post(ctx, 'sso/domains-link', { domain: domain.domain, connection_id: select.value || null }); toast('Domínio atualizado.'); render(); } catch (error) { toast(error.message, 'error'); render(); }
    });
    return el('li', { class: 'card' }, el('div', { class: 'card-body stack-sm' }, [
      el('div', { class: 'policy-head' }, [el('code', { class: 'mono', text: domain.domain }), tag(domain.status === 'verified' ? 'verificado' : domain.status === 'pending' ? 'aguardando TXT' : 'revogado', domain.status === 'verified' ? 'success' : 'warning')]),
      domain.verified_at ? el('span', { class: 'small muted', text: `Verificado em ${formatDateTime(domain.verified_at)}` }) : null,
      el('div', { class: 'row-actions' }, [
        domain.status === 'pending' ? button('Verificar no DNS', { size: 'sm', iconName: 'check', onClick: async () => {
          try { await post(ctx, 'sso/domains-verify', { organization_id: ctx.organization.id, domain: domain.domain }); toast('Domínio verificado.'); render(); } catch (error) { toast(error.message, 'error'); }
        } }) : null,
        domain.status === 'verified' && connections.length ? field({ label: 'Conexão', control: select }) : null
      ])
    ]));
  })) : emptyState({ title: 'Nenhum domínio', text: 'Comece reivindicando o domínio dos e-mails da empresa.', compact: true, iconName: 'shield' });

  const input = el('input', { maxlength: '253', placeholder: 'suaempresa.com.br', autocomplete: 'off' });
  const form = el('form', { class: 'stack-sm', novalidate: true }, [field({ label: 'Domínio de e-mail', control: input, hint: 'Domínios de e-mail pessoal (gmail.com, outlook.com…) são recusados.' }),
    button('Reivindicar domínio', { type: 'submit', size: 'sm', iconName: 'plus' })]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const out = await post(ctx, 'sso/domains', { organization_id: ctx.organization.id, domain: input.value.trim() });
      reveal.replaceChildren(el('div', { class: 'callout callout-warning stack-xs', role: 'status' }, [
        el('strong', { text: `Registro TXT para ${out.domain}` }),
        el('span', { class: 'small', text: 'Nome' }), el('code', { class: 'mono secret-once', text: out.record.name }),
        el('span', { class: 'small', text: 'Valor' }), el('code', { class: 'mono secret-once', text: out.record.value }),
        el('span', { class: 'small', text: out.notice })]));
      input.value = '';
      toast('Domínio reivindicado.'); render();
    } catch (error) { toast(error.message, 'error'); }
  });
  return el('section', { class: 'stack-sm', 'aria-label': 'Domínios' }, [el('h3', { text: 'Domínios verificados' }), reveal, list,
    el('details', {}, [el('summary', { text: 'Reivindicar domínio' }), form])]);
}

function readinessList(readiness) {
  return el('ul', { class: 'plain-list small sso-readiness', 'aria-label': 'Prontidão' }, readiness.checks.map((check) => el('li', {}, [
    tag(CHECK_LABEL[check.status] || check.status, CHECK_TONE[check.status] || 'neutral'), el('span', { text: ` ${check.detail}` })])));
}

function connectionsSection(ctx, data, render) {
  const list = (data.connections || []).length ? el('ul', { class: 'plain-list' }, data.connections.map((connection) => {
    const readiness = connection.readiness;
    const setStatus = (status, enforce = false, confirm = null) => async () => {
      if (confirm && !await confirmDialog(confirm)) return;
      try { await post(ctx, 'sso/status', { connection_id: connection.id, status, enforce }); toast('Conexão atualizada.'); render(); } catch (error) { toast(error.message, 'error'); }
    };
    return el('li', { class: 'card' }, el('div', { class: 'card-body stack-sm' }, [
      el('div', { class: 'policy-head' }, [el('strong', { text: connection.display_name }), tag(STATUS_LABEL[connection.status] || connection.status, STATUS_TONE[connection.status] || 'neutral'),
        connection.enforce_sso ? tag('SSO exigido', 'info') : null, readiness.operational ? tag('operacional', 'success') : tag('não operacional', 'neutral')]),
      el('span', { class: 'small muted', text: `${connection.protocol.toUpperCase()} · broker ${connection.broker === 'mock' ? 'de teste (nunca ativa)' : 'Supabase Auth'} · sessão máxima ${connection.max_session_hours} h${connection.provider_ref ? ` · ${connection.provider_ref}` : ''}` }),
      connection.sessions_valid_after ? el('span', { class: 'small muted', text: `Sessões anteriores a ${formatDateTime(connection.sessions_valid_after)} foram revogadas.` }) : null,
      readinessList(readiness),
      el('div', { class: 'row-actions' }, [
        ['draft', 'disabled'].includes(connection.status) ? button('Colocar em teste', { size: 'sm', onClick: setStatus('testing') }) : null,
        connection.status === 'testing' ? button('Ativar', { size: 'sm', variant: 'primary', onClick: setStatus('active') }) : null,
        connection.status === 'active' && !connection.enforce_sso ? button('Exigir SSO', { size: 'sm', onClick: setStatus('active', true, { title: 'Exigir SSO para os domínios desta conexão?', description: 'O login por senha deixa de valer para e-mails destes domínios. Mantenha ao menos um administrador capaz de entrar pelo provedor antes de confirmar.', confirmLabel: 'Exigir SSO' }) }) : null,
        connection.status === 'active' && connection.enforce_sso ? button('Liberar senha', { size: 'sm', variant: 'ghost', onClick: setStatus('active', false) }) : null,
        connection.status !== 'disabled' ? button('Desativar', { size: 'sm', variant: 'danger-ghost', onClick: setStatus('disabled', false, { title: `Desativar ${connection.display_name}?`, description: 'O login volta a ser por e-mail, senha e MFA para estes domínios. O histórico continua.', confirmLabel: 'Desativar', tone: 'danger' }) }) : null,
        connection.status === 'active' ? button('Revogar sessões', { size: 'sm', variant: 'danger-ghost', onClick: async () => {
          if (!await confirmDialog({ title: 'Revogar todas as sessões SSO?', description: 'Quem entrou por esta conexão precisa entrar de novo no próximo acesso.', confirmLabel: 'Revogar sessões', tone: 'danger' })) return;
          try { await post(ctx, 'sso/revoke-sessions', { connection_id: connection.id }); toast('Sessões revogadas.'); render(); } catch (error) { toast(error.message, 'error'); }
        } }) : null
      ])
    ]));
  })) : emptyState({ title: 'Nenhuma conexão', text: 'Cadastre a conexão do seu provedor de identidade.', compact: true, iconName: 'shield' });

  const name = el('input', { maxlength: '120', placeholder: 'Ex.: Microsoft Entra ID do grupo' });
  const protocol = el('select', {}, [el('option', { value: 'saml', text: 'SAML 2.0' }), el('option', { value: 'oidc', text: 'OIDC' })]);
  const providerRef = el('input', { maxlength: '120', placeholder: 'sso:<id do provedor no Supabase>', autocomplete: 'off' });
  const metadata = el('input', { type: 'url', maxlength: '500', placeholder: 'https://login.suaempresa.com/metadata.xml' });
  const issuer = el('input', { type: 'url', maxlength: '300', placeholder: 'https://idp.suaempresa.com' });
  const audience = el('input', { maxlength: '200', placeholder: 'client_id do Arandu no IdP' });
  const hours = el('input', { type: 'number', min: '1', max: '168', value: '12' });
  const oidc = el('div', { class: 'stack-sm', hidden: true }, [field({ label: 'Issuer', control: issuer }), field({ label: 'Audience (client_id)', control: audience })]);
  protocol.addEventListener('change', () => { oidc.hidden = protocol.value !== 'oidc'; });
  const form = el('form', { class: 'stack-sm', novalidate: true }, [field({ label: 'Nome', control: name }), field({ label: 'Protocolo', control: protocol }),
    field({ label: 'Identificador do provedor no broker', control: providerRef, hint: 'Criado pelo responsável pelo ambiente no Supabase Auth (SSO). Opcional no rascunho.' }),
    field({ label: 'URL de metadados / discovery', control: metadata }), oidc, field({ label: 'Sessão máxima (horas)', control: hours }),
    button('Salvar conexão', { type: 'submit', size: 'sm', iconName: 'plus' })]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await post(ctx, 'sso/connections', { organization_id: ctx.organization.id, display_name: name.value.trim(), protocol: protocol.value, provider_ref: providerRef.value.trim(),
        metadata_url: metadata.value.trim(), issuer: protocol.value === 'oidc' ? issuer.value.trim() : '', audience: protocol.value === 'oidc' ? audience.value.trim() : '', max_session_hours: Number(hours.value) });
      toast('Conexão salva como rascunho.'); render();
    } catch (error) { toast(error.message, 'error'); }
  });
  return el('section', { class: 'stack-sm', 'aria-label': 'Conexões SSO' }, [el('h3', { text: 'Conexões' }), list, el('details', {}, [el('summary', { text: 'Nova conexão' }), form])]);
}

function eventsSection(data) {
  const events = data.events || [];
  if (!events.length) return el('p', { class: 'small muted', text: 'Nenhuma tentativa de login SSO registrada ainda.' });
  return el('details', { class: 'sso-events' }, [el('summary', { text: `Tentativas recentes (${events.length})` }), el('ul', { class: 'plain-list small' }, events.map((event) => el('li', {}, [
    tag(event.outcome === 'success' ? 'sucesso' : 'recusado', event.outcome === 'success' ? 'success' : 'warning'),
    el('span', { class: 'muted', text: ` ${formatDateTime(event.happened_at)} · ${REASON_LABEL[event.reason_code] || event.reason_code}${event.email_domain ? ` · ${event.email_domain}` : ''}` })])))]);
}
