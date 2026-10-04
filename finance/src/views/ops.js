// Console operacional: saúde da plataforma para operadores com MFA.
// Só estados, contagens e identificadores chegam aqui — o banco não devolve
// valores, termos, títulos, e-mails, payloads nem documentos.

import { el, icon, formatDateTime, timeAgo } from '../core.js';
import { card, tag, button, emptyState, errorState, field, toast } from '../ui.js';

const STATUS_TONE = { running: 'warning', succeeded: 'success', failed: 'danger', delivered: 'success', pending: 'neutral', processing: 'neutral', retry: 'warning', dead: 'danger' };
const OUTBOX_LABEL = { delivered: 'Entregues', pending: 'Pendentes', processing: 'Em envio', retry: 'Nova tentativa', dead: 'Falhas definitivas' };

function check(label, ok, detail) {
  return el('li', { class: `ops-check ${ok ? 'ok' : 'warn'}` }, [
    icon(ok ? 'checkCircle' : 'alert', { size: 16 }),
    el('span', { class: 'ops-check-label', text: label }),
    el('span', { class: 'ops-check-state', text: ok ? 'OK' : detail })
  ]);
}

function table(headers, rows, empty) {
  if (!rows.length) return emptyState({ title: empty, compact: true, iconName: 'checkCircle' });
  return el('div', { class: 'table-card inner' }, el('table', { class: 'data-table compact' }, [
    el('thead', {}, el('tr', {}, headers.map((label) => el('th', { scope: 'col', text: label })))),
    el('tbody', {}, rows.map((cells) => el('tr', {}, cells.map((cell, index) => el('td', { 'data-label': headers[index] }, cell ?? '—')))))
  ]));
}

// Segundo fator do operador financeiro, no próprio console: o login
// administrativo legado não aceita o papel finance_ops.
function mfaForm(ctx) {
  const code = el('input', { name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]{6}', maxlength: '6', required: true, class: 'input mono' });
  const status = el('p', { class: 'field-hint', role: 'status', 'aria-live': 'polite' });
  const form = el('form', { class: 'inline-form', novalidate: true });
  form.append(field({ label: 'Código do aplicativo autenticador', control: code }), button('Confirmar', { type: 'submit', iconName: 'lock' }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!/^[0-9]{6}$/.test(code.value.trim())) { status.textContent = 'Digite os 6 dígitos mostrados no aplicativo.'; code.focus(); return; }
    status.textContent = 'Verificando…';
    try {
      const challenge = await ctx.api('ops/mfa', { method: 'POST', body: JSON.stringify({ step: 'challenge' }) });
      await ctx.api('ops/mfa', { method: 'POST', body: JSON.stringify({ step: 'verify', factor_id: challenge.factor_id, challenge_id: challenge.challenge_id, code: code.value.trim() }) });
      location.reload();
    } catch (error) {
      status.textContent = error.code === 'mfa_not_enrolled'
        ? 'Esta conta ainda não tem aplicativo autenticador cadastrado. Cadastre com npm run finance:operator:mfa.'
        : (error.message || 'Não foi possível confirmar o código.');
      code.select();
    }
  });
  return card({ title: 'Confirme o segundo fator', subtitle: 'O console operacional exige autenticação com dois fatores (MFA).', body: [form, status] });
}

export async function opsConsole(ctx) {
  ctx.header({ title: 'Console operacional' });
  let data;
  try {
    data = await ctx.api('ops/overview');
  } catch (error) {
    if (error.code === 'mfa_required') return mfaForm(ctx);
    if (error.code === 'finance_ops_required') {
      return emptyState({ title: 'Acesso restrito a operadores financeiros da plataforma', text: 'É preciso o papel de plataforma finance_ops. Papéis das empresas (administrador, gestor financeiro) e o operador do admin legado não dão acesso a este console.', iconName: 'shield' });
    }
    if (error.status === 403 || error.status === 401) {
      return emptyState({ title: 'Acesso restrito a operadores da plataforma', text: 'Esta área não faz parte do espaço das empresas. Papéis como administrador ou gestor financeiro não dão acesso a ela.', iconName: 'shield' });
    }
    return errorState({ title: 'Console indisponível', error });
  }
  const { overview = {}, health = {} } = data;
  const root = el('div', { class: 'ops' });
  if (data.demo) root.append(el('p', { class: 'callout callout-info' }, [icon('info'), el('span', { text: 'Números de exemplo da demonstração. No ambiente real, estes dados vêm do banco e exigem operador com MFA.' })]));
  root.append(el('p', { class: 'callout callout-neutral compact' }, [icon('lock', { size: 14 }), el('span', { text: 'Sem valores de propostas, termos financeiros, documentos ou conteúdo de clientes. Cada acesso a este console fica registrado.' })]));

  const lastSuccess = overview.last_renewal_success;
  const stale = !lastSuccess || Date.now() - Date.parse(lastSuccess) > 26 * 3600000;
  root.append(card({ title: 'Saúde', subtitle: `Gerado ${formatDateTime(overview.generated_at)} · versão do schema ${overview.schema_version || '—'}${health.commit ? ` · commit ${health.commit}` : ''}`, body:
    el('ul', { class: 'ops-checks', role: 'list' }, [
      check('Banco configurado', health.database_configured, 'Configure SUPABASE_URL e a chave pública'),
      check('Chave de servidor configurada', health.server_key_configured, 'Sem ela, jobs e documentos não funcionam'),
      check('Segredo do cron', health.cron_secret_configured, 'CRON_SECRET ausente ou curto'),
      check('Agenda de renovação nas últimas 26 h', !stale, lastSuccess ? `Último sucesso ${timeAgo(lastSuccess)}` : 'Nunca executada com sucesso'),
      check('E-mail de avisos', overview.email_enabled && health.email_provider_configured, overview.email_enabled ? 'Provedor de e-mail não configurado' : 'Desligado (email_enabled = false)')
    ]) }));

  root.append(card({ title: 'Execuções de jobs', subtitle: 'Últimas 20. Use o request ID para rastrear nos logs.', body: table(['Job', 'Estado', 'Processados', 'Falhas', 'Duração (ms)', 'Início', 'Fim', 'Request ID', 'Erro'],
    (overview.jobs || []).map((job) => [job.job === 'renewals' ? 'Renovações' : job.job, tag(job.status === 'succeeded' ? 'Sucesso' : job.status === 'running' ? 'Em execução' : 'Falha', STATUS_TONE[job.status]), String(job.processed), String(job.failed ?? 0), String(job.duration_ms ?? '—'),
      formatDateTime(job.started_at), formatDateTime(job.finished_at), el('code', { text: job.request_id || '—' }), job.error_code ? el('code', { text: job.error_code }) : '—']), 'Nenhuma execução registrada ainda') }));

  const webhooks = overview.webhooks || {};
  root.append(card({ title: 'Integrações e leases', subtitle: 'Contagens operacionais, sem URLs, segredos ou conteúdo financeiro.', body: [
    el('dl', { class: 'summary-strip compact' }, [
      ['Leases de job vencidos', overview.expired_job_leases ?? 0],
      ['Webhooks pendentes', webhooks.by_status?.pending ?? 0], ['Webhooks em retry', webhooks.by_status?.failed ?? 0],
      ['Dead letters', webhooks.by_status?.dead ?? 0], ['Pendente mais antigo (min)', webhooks.oldest_pending_minutes ?? '—'],
      ['Recusas de SSO em 24 h', overview.sso?.failures_24h ?? 0]
    ].map(([label,value]) => el('div', { class: 'summary-item' }, [el('dt', { text: label }),el('dd', { text: String(value) })]))),
    table(['ID', 'Estado', 'Tentativas', 'Erro', 'Criado'], (webhooks.recent_failures || []).map(row => [el('code', { text: String(row.id).slice(0,13) }), row.status, String(row.attempts), row.error_code || '—', formatDateTime(row.created_at)]), 'Nenhuma falha recente de webhook'),
    el('p', { class: 'field-hint', text: 'Presença de configuração não comprova disponibilidade ou recuperação da dependência.' }),
    table(['Dependência', 'Configuração'], (health.dependencies || []).map(row => [row.name, row.state === 'configured' ? 'Configurada; disponibilidade não medida' : 'Não configurada']), 'Sem evidência de configuração')
  ] }));

  const governance = overview.governance;
  if (governance) {
    const count = (map) => Object.entries(map || {}).map(([status, total]) => `${status}: ${total}`).join(' · ') || 'nenhum';
    root.append(card({ title: 'Governança de dados', subtitle: 'Contagens de exports, offboarding, holds e retenção; nenhum dado de cliente.', body: el('dl', { class: 'summary-strip compact' }, [
      ['Exports', count(governance.exports_by_status)], ['Offboarding', count(governance.offboarding_by_status)],
      ['Legal holds ativos', governance.active_legal_holds ?? 0], ['Registros removidos ou anonimizados pela retenção em 24 h', governance.retention_purged_24h ?? 0],
      ['Última retenção com sucesso', governance.last_retention_run ? timeAgo(governance.last_retention_run) : 'nunca']
    ].map(([label, value]) => el('div', { class: 'summary-item' }, [el('dt', { text: label }), el('dd', { text: String(value) })]))) }));
  }

  const outbox = overview.outbox || {};
  const byStatus = Object.entries(outbox.by_status || {});
  root.append(card({ title: 'Outbox de e-mail (avisos financeiros)', subtitle: outbox.oldest_pending_minutes != null ? `Pendente mais antigo há ${outbox.oldest_pending_minutes} min` : 'Nada pendente', body: [
    el('dl', { class: 'summary-strip compact' }, (byStatus.length ? byStatus : [['pending', 0]]).map(([status, total]) => el('div', { class: 'summary-item' }, [el('dt', { text: OUTBOX_LABEL[status] || status }), el('dd', { text: String(total) })]))),
    table(['ID', 'Estado', 'Tentativas', 'Erro', 'Criado'], (outbox.recent_failures || []).map((row) => [el('code', { text: String(row.id).slice(0, 13) }), tag(OUTBOX_LABEL[row.status] || row.status, STATUS_TONE[row.status]), String(row.attempts), row.error_code ? el('code', { text: row.error_code }) : '—', formatDateTime(row.created_at)]), 'Nenhuma falha recente')
  ] }));

  const docs = overview.documents || {};
  root.append(card({ title: 'Documentos e avisos', body: el('dl', { class: 'summary-strip compact' }, [
    ['Envios pendentes há mais de 1 h', docs.pending_over_1h ?? 0], ['Envios com falha em 24 h', docs.failed_24h ?? 0], ['Versões disponíveis', docs.available_total ?? 0],
    ['Marcos de renovação em 24 h', overview.renewal_milestones_24h ?? 0], ['Notificações em 24 h', overview.notifications_24h ?? 0]
  ].map(([label, value]) => el('div', { class: 'summary-item' }, [el('dt', { text: label }), el('dd', { text: String(value) })]))) }));

  // Diagnóstico por identificador, sem conteúdo.
  const form = el('form', { class: 'inline-form', novalidate: true });
  const lookup = el('input', { name: 'lookup', maxlength: '80', placeholder: 'request ID ou UUID de entidade/organização', autocomplete: 'off' });
  const output = el('div', { 'aria-live': 'polite' });
  form.append(field({ label: 'Rastrear', control: lookup }), button('Rastrear', { type: 'submit', iconName: 'search' }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = lookup.value.trim();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    if (!/^[A-Za-z0-9-]{1,80}$/.test(value)) { toast('Informe um request ID ou um identificador de entidade válido.', 'error'); return; }
    try {
      const { trace } = await ctx.api(`ops/trace?${uuid ? 'entity_id' : 'request_id'}=${encodeURIComponent(value)}`);
      output.replaceChildren(
        table(['Job', 'Estado', 'Processados', 'Erro', 'Fim'], (trace.jobs || []).map((job) => [job.job, job.status, String(job.processed), job.error_code || '—', formatDateTime(job.finished_at)]), 'Nenhuma execução com este request ID'),
        table(['Organização', 'Entidade', 'Evento', 'Quando'], (trace.events || []).map((row) => [el('code', { text: String(row.organization_id).slice(0, 8) }), `${row.entity_type} ${String(row.entity_id).slice(0, 8)}`, row.event_type, formatDateTime(row.happened_at)]), 'Nenhum evento para este identificador'));
    } catch (error) { output.replaceChildren(errorState({ title: 'Rastreamento indisponível', error })); }
  });
  root.append(card({ title: 'Rastrear por identificador', subtitle: 'Mostra execuções e tipos de evento. Metadados e conteúdo ficam de fora.', body: [form, output] }));
  return root;
}
