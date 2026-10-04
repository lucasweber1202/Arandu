// Governança de dados em Configurações (P0.11) — só administração do grupo.
//
// Mostra o que existe e como cada dado é tratado (classificação, retenção,
// exclusão), e opera o mínimo: políticas de retenção versionadas, legal hold,
// export portável e offboarding. Não é plataforma de compliance: nada aqui
// afirma conformidade jurídica, e nenhum prazo vem preenchido pelo produto.
// Docs: docs/FINANCIAL_DATA_GOVERNANCE.md.

import { el, icon, formatDateTime, formatDate } from '../core.js';
import { button, linkButton, tag, field, emptyState, errorState, loading, toast, confirmDialog, promptDialog } from '../ui.js';

const CLASS_LABEL = {
  TEMPORARY_OPERATIONAL: 'Avisos no aplicativo', WEBHOOK_DELIVERY: 'Entregas de webhook encerradas',
  SECURITY_EVENT: 'Tentativas de login SSO', CONTACT_PII: 'E-mail de convites encerrados'
};
const POLICY_TONE = { draft: 'neutral', active: 'success', superseded: 'neutral', retired: 'warning' };
const POLICY_LABEL = { draft: 'rascunho', active: 'ativa', superseded: 'substituída', retired: 'aposentada' };
const EXPORT_LABEL = { requested: 'na fila', ready: 'pronto', failed: 'falhou', expired: 'vencido', cancelled: 'cancelado' };
const EXPORT_TONE = { requested: 'info', ready: 'success', failed: 'danger', expired: 'neutral', cancelled: 'neutral' };
const OFFBOARDING_LABEL = {
  requested: 'pedido registrado', export_pending: 'aguardando export', export_ready: 'export pronto', access_revocation: 'revogando acessos',
  retention_window: 'janela de retenção', scheduled_for_deletion: 'exclusão agendada', closed: 'encerrado', cancelled: 'cancelado'
};
const SCOPE_LABEL = { organization: 'Organização inteira', retention_class: 'Classe de retenção', legal_entity: 'Entidade', rfq: 'Solicitação', contract: 'Contrato', provider: 'Provedor' };

function post(ctx, path, body) { return ctx.api(path, { method: 'POST', body: JSON.stringify(body) }); }
function bytes(value) { return value >= 1e6 ? `${(value / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round((value || 0) / 1e3))} kB`; }

export function governanceSettings(ctx) {
  const box = el('div', { class: 'stack governance-settings' }, loading());
  const render = async () => {
    let data;
    try { data = await ctx.api(`governance?organization_id=${encodeURIComponent(ctx.organization.id)}`); } catch (error) {
      box.replaceChildren(error?.status === 403 || error?.code === 'forbidden'
        ? el('p', { class: 'muted small', text: 'Governança de dados é administrada por quem tem papel de administração do grupo.' })
        : errorState({ error }));
      return;
    }
    box.replaceChildren(
      el('p', { class: 'muted small', text: 'Quais dados a sua organização tem aqui, por quanto tempo ficam e como saem. Registros de decisão, contratos, aprovações e trilha de auditoria não são apagados por rotina: eles só saem pelo offboarding controlado, sem legal hold ativo. Isto não é parecer jurídico; prazos legais dependem da revisão da sua empresa.' }),
      summarySection(data),
      retentionSection(ctx, data, render),
      holdSection(ctx, data, render),
      exportSection(ctx, data, render),
      offboardingSection(ctx, data, render)
    );
  };
  render();
  return box;
}

function summarySection(data) {
  const catalog = data.catalog || {};
  const offboarding = data.summary?.offboarding;
  return el('section', { class: 'stack-sm', 'aria-labelledby': 'gov-summary' }, [
    el('h3', { id: 'gov-summary', text: 'Resumo' }),
    el('ul', { class: 'plain-list governance-facts' }, [
      el('li', { text: `${catalog.tables ?? 0} tabelas classificadas · ${catalog.personal_data_tables ?? 0} com dado pessoal · ${catalog.credential_tables ?? 0} com material de credencial (nunca exportado).` }),
      el('li', { text: `${(catalog.export_datasets || []).length} conjuntos no export portável (JSON com manifesto e checksum por conjunto).` }),
      el('li', { text: `Legal holds ativos: ${data.summary?.active_holds ?? 0}.` }),
      el('li', { text: offboarding ? `Offboarding em andamento: ${OFFBOARDING_LABEL[offboarding.status] || offboarding.status}.` : 'Nenhum offboarding em andamento.' }),
      el('li', { text: data.summary?.last_retention ? `Última execução de retenção: ${formatDateTime(data.summary.last_retention)}.` : 'A retenção automática ainda não executou para esta organização.' })
    ])
  ]);
}

function retentionSection(ctx, data, render) {
  const classes = data.summary?.retention_classes || [];
  const policies = data.policies || [];
  const rows = classes.map((entry) => {
    const active = policies.find((p) => p.retention_class === entry.retention_class && p.status === 'active');
    const drafts = policies.filter((p) => p.retention_class === entry.retention_class && p.status === 'draft');
    return el('li', { class: 'card' }, el('div', { class: 'card-body stack-sm' }, [
      el('div', { class: 'policy-head' }, [el('strong', { text: CLASS_LABEL[entry.retention_class] || entry.retention_class }),
        active ? tag(`${active.retention_days} dias · v${active.version}`, 'success') : tag('sem retenção automática', 'neutral')]),
      el('span', { class: 'small muted', text: `${entry.action === 'anonymize' ? 'Anonimiza' : 'Apaga'} após o prazo. Limites técnicos: ${entry.min_days} a ${entry.max_days} dias.` }),
      active ? el('div', { class: 'row-actions' }, button('Aposentar política', { size: 'sm', onClick: async () => {
        if (!await confirmDialog({ title: 'Aposentar política?', description: 'A retenção automática desta classe para; a versão continua no histórico.', confirmLabel: 'Aposentar' })) return;
        try { await post(ctx, 'governance/retention-retire', { policy_id: active.id }); toast('Política aposentada.'); render(); } catch (error) { toast(error.message, 'error'); }
      } })) : null,
      ...drafts.map((draft) => el('div', { class: 'row-actions' }, [tag(`rascunho v${draft.version}: ${draft.retention_days} dias`, 'neutral'),
        button('Ativar', { size: 'sm', variant: 'primary', onClick: async () => {
          try { await post(ctx, 'governance/retention-activate', { policy_id: draft.id }); toast('Política ativada; vale a partir de agora.'); render(); } catch (error) { toast(error.message, 'error'); }
        } }),
        button('Descartar', { size: 'sm', variant: 'ghost', onClick: async () => {
          try { await post(ctx, 'governance/retention-retire', { policy_id: draft.id }); toast('Rascunho descartado.'); render(); } catch (error) { toast(error.message, 'error'); }
        } })]))
    ]));
  });

  const select = el('select', { name: 'retention_class', required: true }, classes.map((entry) => el('option', { value: entry.retention_class, text: CLASS_LABEL[entry.retention_class] || entry.retention_class })));
  const days = el('input', { name: 'retention_days', type: 'number', inputmode: 'numeric', min: '1', max: '3650', required: true, placeholder: 'Ex.: 365' });
  const reason = el('input', { name: 'reason', maxlength: '500', required: true, placeholder: 'Por que este prazo' });
  const ref = el('input', { name: 'decision_reference', maxlength: '120', placeholder: 'Ticket ou documento da decisão', autocomplete: 'off' });
  const form = el('form', { class: 'field-grid', novalidate: true }, [field({ label: 'Classe', control: select }), field({ label: 'Prazo (dias)', control: days }),
    field({ label: 'Motivo', control: reason }), field({ label: 'Referência da decisão', control: ref, optionalLabel: true }),
    el('div', { class: 'form-actions span-2' }, [button('Criar rascunho de política', { type: 'submit', size: 'sm', iconName: 'plus' })])]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await post(ctx, 'governance/retention-policies', { organization_id: ctx.organization.id, retention_class: select.value, retention_days: Number(days.value), reason: reason.value, decision_reference: ref.value });
      toast('Rascunho criado. Ative para começar a valer.'); render();
    } catch (error) { toast(error.message, 'error'); }
  });

  const previewSlot = el('div', { class: 'stack-sm', 'aria-live': 'polite' });
  const preview = button('Prévia: o que sairia hoje (sem apagar)', { size: 'sm', iconName: 'search', onClick: async () => {
    try {
      const { preview: result } = await post(ctx, 'governance/retention-preview', { organization_id: ctx.organization.id });
      const items = result?.items || [];
      previewSlot.replaceChildren(items.length ? el('ul', { class: 'plain-list' }, items.map((item) => el('li', { class: 'small', text: item.held
        ? `${CLASS_LABEL[item.retention_class] || item.retention_class}: retida por legal hold.`
        : `${CLASS_LABEL[item.retention_class] || item.retention_class}: ${item.eligible} registro(s) elegível(is) pela política v${item.policy_version}.` })))
        : el('p', { class: 'small muted', text: 'Nenhuma política ativa: nada sairia.' }));
    } catch (error) { toast(error.message, 'error'); }
  } });

  return el('section', { class: 'stack-sm', 'aria-labelledby': 'gov-retention' }, [
    el('h3', { id: 'gov-retention', text: 'Retenção automática' }),
    el('p', { class: 'small muted', text: 'Só dados técnicos de curta utilidade aceitam retenção automática. Nenhum prazo vem preenchido: a política nasce da decisão da sua empresa, em versão, e um legal hold suspende a execução.' }),
    rows.length ? el('ul', { class: 'plain-list' }, rows) : emptyState({ title: 'Sem classes configuráveis', compact: true }),
    form, el('div', { class: 'row-actions' }, preview), previewSlot
  ]);
}

function holdSection(ctx, data, render) {
  const holds = data.holds || [];
  const list = holds.length ? el('ul', { class: 'plain-list' }, holds.map((hold) => el('li', { class: 'card' }, el('div', { class: 'card-body stack-sm' }, [
    el('div', { class: 'policy-head' }, [el('strong', { text: SCOPE_LABEL[hold.scope_type] || hold.scope_type }),
      tag(hold.status === 'active' ? 'ativo' : 'liberado', hold.status === 'active' ? 'warning' : 'neutral')]),
    el('span', { class: 'small', text: hold.reason }),
    el('span', { class: 'small muted', text: `Criado em ${formatDateTime(hold.created_at)}${hold.reference ? ` · ${hold.reference}` : ''}${hold.released_at ? ` · liberado em ${formatDateTime(hold.released_at)}` : ''}` }),
    hold.status === 'active' ? el('div', { class: 'row-actions' }, button('Liberar hold', { size: 'sm', onClick: async () => {
      const reason = await promptDialog({ title: 'Liberar legal hold', label: 'Motivo da liberação', minLength: 10, confirmLabel: 'Liberar' });
      if (!reason) return;
      try { await post(ctx, 'governance/legal-holds-release', { hold_id: hold.id, reason }); toast('Hold liberado.'); render(); } catch (error) { toast(error.message, 'error'); }
    } })) : null
  ])))) : emptyState({ title: 'Nenhum legal hold', text: 'Use quando houver disputa, auditoria ou obrigação formal de preservação.', compact: true, iconName: 'shield' });

  const scope = el('select', { name: 'scope_type' }, ['organization', 'retention_class', 'legal_entity', 'rfq', 'contract', 'provider'].map((key) => el('option', { value: key, text: SCOPE_LABEL[key] })));
  const scopeClass = el('select', { name: 'scope_class' }, (data.summary?.retention_classes || []).map((entry) => el('option', { value: entry.retention_class, text: CLASS_LABEL[entry.retention_class] || entry.retention_class })));
  const scopeId = el('input', { name: 'scope_id', maxlength: '36', placeholder: 'Identificador do objeto', autocomplete: 'off' });
  const classField = field({ label: 'Classe', control: scopeClass });
  const idField = field({ label: 'Identificador', control: scopeId, hint: 'Copie da página do objeto.' });
  const sync = () => { classField.hidden = scope.value !== 'retention_class'; idField.hidden = ['organization', 'retention_class'].includes(scope.value); };
  scope.addEventListener('change', sync); sync();
  const reason = el('input', { name: 'reason', maxlength: '1000', required: true, placeholder: 'Ex.: auditoria externa em curso' });
  const ref = el('input', { name: 'reference', maxlength: '120', placeholder: 'Protocolo ou ticket', autocomplete: 'off' });
  const form = el('form', { class: 'field-grid', novalidate: true }, [field({ label: 'Escopo', control: scope }), classField, idField,
    field({ label: 'Motivo (sem dado pessoal)', control: reason }), field({ label: 'Referência', control: ref, optionalLabel: true }),
    el('div', { class: 'form-actions span-2' }, button('Criar legal hold', { type: 'submit', size: 'sm', iconName: 'shield' }))]);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await post(ctx, 'governance/legal-holds', { organization_id: ctx.organization.id, scope_type: scope.value, scope_class: scopeClass.value, scope_id: scopeId.value.trim(), reason: reason.value, reference: ref.value });
      toast('Legal hold criado.'); render();
    } catch (error) { toast(error.message, 'error'); }
  });
  return el('section', { class: 'stack-sm', 'aria-labelledby': 'gov-holds' }, [el('h3', { id: 'gov-holds', text: 'Legal hold' }),
    el('p', { class: 'small muted', text: 'Enquanto houver hold ativo, a retenção automática da organização fica suspensa e a exclusão do offboarding não é agendada.' }), list, form]);
}

function exportSection(ctx, data, render) {
  const exports = data.exports || [];
  const max = data.bundle_max_bytes || 4000000;
  const list = exports.length ? el('ul', { class: 'plain-list' }, exports.map((item) => {
    const href = `/api/finance/governance/export-download?export_id=${encodeURIComponent(item.id)}`;
    return el('li', { class: 'card' }, el('div', { class: 'card-body stack-sm' }, [
      el('div', { class: 'policy-head' }, [el('strong', { text: item.purpose === 'offboarding' ? 'Export do offboarding' : 'Export portável' }), tag(EXPORT_LABEL[item.status] || item.status, EXPORT_TONE[item.status] || 'neutral')]),
      el('span', { class: 'small muted', text: `Pedido em ${formatDateTime(item.requested_at)}${item.status === 'ready' ? ` · ${item.dataset_count} conjuntos, ${item.row_count} registros, ${bytes(item.byte_size)} · disponível até ${formatDateTime(item.expires_at)}` : ''}${item.error_code ? ` · ${item.error_code}` : ''}` }),
      item.status === 'ready' ? (item.byte_size <= max
        ? linkButton('Baixar pacote (JSON)', href, { size: 'sm', iconName: 'download', attrs: { download: '' } })
        : el('p', { class: 'small muted', text: 'Pacote grande: baixe por conjunto (o manifesto traz o checksum de cada um).' })) : null
    ]));
  })) : emptyState({ title: 'Nenhum export', text: 'Pacote com os dados da organização para portabilidade ou auditoria.', compact: true });
  const request = button('Pedir export dos dados', { size: 'sm', iconName: 'download', onClick: async () => {
    try { const result = await post(ctx, 'governance/exports', { organization_id: ctx.organization.id }); toast(result.notice || 'Export pedido.'); render(); } catch (error) { toast(error.message, 'error'); }
  } });
  return el('section', { class: 'stack-sm', 'aria-labelledby': 'gov-export' }, [el('h3', { id: 'gov-export', text: 'Export e portabilidade' }),
    el('p', { class: 'small muted', text: 'Inclui organização, entidades, membros (sem e-mail), Passport, solicitações, propostas, decisões, contratos, provedores, facilities, garantias, policies, aprovações, tarefas, trilha e metadados de documentos. Não inclui hashes de token, segredos de webhook, verificação de domínio, caminhos internos de storage nem os arquivos de documentos.' }),
    el('div', { class: 'row-actions' }, request), list]);
}

function offboardingSection(ctx, data, render) {
  const current = (data.offboarding || []).find((item) => !['closed', 'cancelled'].includes(item.status));
  const body = [];
  if (!current) {
    body.push(el('p', { class: 'small muted', text: 'Encerramento controlado da organização: export, revogação de todos os acessos (pessoas, contas de serviço, tokens, webhooks, SSO, convites) e janela de retenção. Não apaga nada de imediato e não é desfeito pela interface.' }),
      button('Iniciar offboarding', { size: 'sm', variant: 'danger', onClick: async () => {
        const reason = await promptDialog({ title: 'Iniciar offboarding', description: 'Nada é revogado agora. Os próximos passos pedem confirmação.', label: 'Motivo', minLength: 10, confirmLabel: 'Registrar pedido', tone: 'danger' });
        if (!reason) return;
        try { await post(ctx, 'governance/offboarding', { organization_id: ctx.organization.id, reason }); toast('Pedido de offboarding registrado.'); render(); } catch (error) { toast(error.message, 'error'); }
      } }));
  } else {
    body.push(el('div', { class: 'policy-head' }, [el('strong', { text: 'Offboarding' }), tag(OFFBOARDING_LABEL[current.status] || current.status, 'warning')]),
      el('span', { class: 'small muted', text: `Pedido em ${formatDateTime(current.requested_at)}${current.retention_until ? ` · retenção até ${formatDate(current.retention_until)}` : ''}` }));
    const act = (action, payload = {}) => post(ctx, 'governance/offboarding-action', { request_id: current.id, action, ...payload });
    const actions = [];
    if (current.status === 'requested') actions.push(button('Gerar export final', { size: 'sm', iconName: 'download', onClick: async () => { try { await act('request_export'); toast('Export final na fila.'); render(); } catch (error) { toast(error.message, 'error'); } } }));
    if (['export_ready', 'requested'].includes(current.status)) {
      const days = el('input', { type: 'number', min: '0', max: '3650', inputmode: 'numeric', placeholder: 'Ex.: 90' });
      const ref = el('input', { maxlength: '120', placeholder: 'Contrato ou parecer', autocomplete: 'off' });
      actions.push(field({ label: 'Janela de retenção pós-contrato (dias)', control: days, hint: 'Definida pelo contrato/decisão da sua empresa; o produto não sugere prazo.' }),
        field({ label: 'Referência da decisão', control: ref }),
        button('Revogar todos os acessos', { size: 'sm', variant: 'danger', onClick: async () => {
          const waived = current.status === 'requested';
          const ok = await confirmDialog({ title: 'Revogar todos os acessos?', tone: 'danger', confirmLabel: 'Revogar agora',
            description: `${waived ? 'Você está seguindo SEM export final. ' : ''}Todas as pessoas (inclusive você), contas de serviço, tokens, webhooks, SSO e convites desta organização perdem acesso imediatamente. Os dados ficam preservados durante a janela de retenção.` });
          if (!ok) return;
          try { await act('confirm_revocation', { retention_days: Number(days.value), decision_reference: ref.value.trim(), export_waived: waived, confirm: true }); toast('Acessos revogados.'); ctx.reload(); } catch (error) { toast(error.message, 'error'); }
        } }));
    }
    if (['requested', 'export_pending', 'export_ready'].includes(current.status)) actions.push(button('Cancelar offboarding', { size: 'sm', variant: 'ghost', onClick: async () => {
      try { await act('cancel'); toast('Offboarding cancelado.'); render(); } catch (error) { toast(error.message, 'error'); }
    } }));
    body.push(el('div', { class: 'stack-sm' }, actions));
  }
  return el('section', { class: 'stack-sm', 'aria-labelledby': 'gov-offboarding' }, [el('h3', { id: 'gov-offboarding', text: 'Offboarding da organização' }), ...body,
    el('p', { class: 'small muted' }, [icon('alert', { size: 14 }), el('span', { text: ' Exclusão física só depois da janela, sem legal hold, por procedimento operacional registrado. Cópias de backup seguem a política do provedor de banco e não são apagadas pela interface.' })])]);
}
