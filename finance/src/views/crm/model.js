// Vocabulário, permissões, datas e leitura paginada do CRM (fonte única para workspace, painéis e Copilot).
// Extraído de views/crm-workspace.js (v7.0).


export const ACTIVITY_KINDS = Object.freeze({
  meeting: 'Reunião', call: 'Ligação', commercial_interaction: 'Interação comercial', note: 'Nota interna',
  follow_up: 'Follow-up', commitment: 'Compromisso', email_record: 'E-mail (anotação)'
});

export const ACTIVITY_STATUS = Object.freeze({ recorded: ['Realizada', 'success'], planned: ['Planejada', 'info'], cancelled: ['Cancelada', 'neutral'], archived: ['Arquivada', 'neutral'] });

export const STAGES = Object.freeze({
  prospect: 'Prospecção', qualification: 'Qualificação', engagement: 'Relacionamento ativo',
  negotiation: 'Em negociação', won: 'Ganho (declarado)', lost: 'Encerrado sem acordo'
});

export const STAGE_ORDER = Object.keys(STAGES);

export const REFERENCE_LABEL = { provider: 'Instituição', contract: 'Contrato', rfq: 'Negociação', opportunity: 'Oportunidade', proposal: 'Proposta', task: 'Tarefa' };

export const EVENT_TEXT = {
  crm_contact_created: 'Contato registrado', crm_contact_updated: 'Contato atualizado', crm_activity_created: 'Atividade registrada',
  crm_activity_updated: 'Atividade atualizada', crm_process_created: 'Processo criado', crm_process_updated: 'Processo atualizado'
};

export const FIELD_TEXT = {
  name: 'nome', title: 'cargo ou título', email: 'e-mail', phone: 'telefone', owner_id: 'responsável', source_reference: 'fonte', status: 'estado',
  kind: 'tipo', subject: 'assunto', notes: 'observações', occurred_at: 'data em que aconteceu', due_on: 'prazo', contact_id: 'contato', process_id: 'processo',
  related_type: 'vínculo', related_id: 'vínculo', stage: 'etapa', next_action: 'próximo passo', outcome: 'resultado'
};

/** Mensagem legível para os erros do contrato CRM; nunca texto técnico. */

export function crmErrorMessage(error) {
  if (!error) return 'Não foi possível concluir. Tente novamente.';
  if (error.status === 409) return 'Outra pessoa alterou este registro depois que você o abriu, ou esta mesma ação já foi enviada com outro conteúdo. Nada foi sobrescrito: recarregue para ver a versão atual.';
  if (error.status === 403) return 'Seu acesso não permite esta ação nesta organização ou entidade. Peça a quem administra o Arandu.';
  if (error.status === 404) return 'Registro indisponível no seu escopo. Ele pode ter sido arquivado ou pertencer a outra entidade.';
  if (error.status === 503) return 'O registro comercial ainda não está disponível neste ambiente. Nada foi gravado.';
  if (error.status === 400) return 'Confira os campos obrigatórios, a fonte e o vínculo escolhido. Nada foi gravado.';
  if (error.status === 401) return error.message;
  if (!error.status || error.status >= 500) return 'Não recebemos confirmação do servidor. Pode ter sido gravado: confira a lista antes de repetir. Repetir aqui reenvia a mesma ação, sem duplicar.';
  return error.message || 'Não foi possível concluir.';
}

export const enc = encodeURIComponent;

export const memberLabel = (ctx, id) => {
  if (!id) return 'Sem responsável';
  const row = (ctx.members || []).find((m) => m.user_id === id);
  if (!row) return 'Pessoa sem acesso atual';
  return `${row.display_name || row.email || 'Pessoa da equipe'}${id === ctx.viewer?.id ? ' (você)' : ''}`;
};

export const writers = (ctx) => (ctx.members || []).filter((m) => m.user_id && ['admin', 'finance_manager', 'analyst', 'provider_user'].includes(m.role));
/** Escrita no CRM: buyer admin/gestão/analista; instituição admin/usuário da instituição (contrato §Transporte). */

export function canWriteCrm(ctx) {
  const role = ctx.viewer?.role || (ctx.members || []).find((m) => m.user_id === ctx.viewer?.id)?.role;
  return ['admin', 'finance_manager', 'analyst', 'provider_user'].includes(role);
}

export function localDateTime(value) {
  const d = value ? new Date(value) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** datetime-local → ISO com fuso (o contrato exige timezone explícito). */

export function isoWithZone(local) {
  const d = new Date(local);
  if (!Number.isFinite(d.getTime())) return null;
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n) => String(Math.trunc(Math.abs(n))).padStart(2, '0');
  return `${local.length === 16 ? `${local}:00` : local}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

/** Lê todas as páginas de um recurso CRM (até `max` linhas), seguindo `next`. */

export async function crmList(ctx, resource, params = {}, { max = 200 } = {}) {
  const rows = [];
  let after = null;
  do {
    const q = new URLSearchParams({ organization_id: ctx.organization.id, limit: '100', ...params });
    if (after) q.set('after', after);
    const page = await ctx.api(`${resource}?${q}`);
    rows.push(...(page.rows || []));
    after = page.next;
  } while (after && rows.length < max);
  return { rows, truncated: Boolean(after) };
}

// ----------------------------------------------------------------- formulário
/**
 * Formulário CRM em painel. `fields`: [{ key, label, control, required, hint, read }].
 * Uma chave idempotente por abertura; a mesma chave é reenviada se a pessoa
 * repetir após falha incerta. Fecha só com confirmação do servidor.
 */
