import { HttpError, clean } from '../../api-core.mjs';
import { userSupabaseRequest } from '../../supabase.mjs';
import { MIN_REVIEW_DAYS, MAX_REVIEW_DAYS } from '../../finance/passport.mjs';

// Primitivas compartilhadas pelos domínios de API financeiros
// (finance.mjs e finance-enterprise.mjs). Toda chamada ao banco usa o JWT do
// usuário: o RLS é a primeira linha de isolamento, nunca a service role.

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function requireUuid(value, label) {
  const id = clean(value);
  if (!UUID.test(id)) throw new HttpError(400, `${label} inválido.`, 'invalid_id');
  return id;
}

export function query(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

export function rest(token, resource) {
  return userSupabaseRequest(token, resource);
}

export function rpc(token, name, body) {
  return upstream(userSupabaseRequest(token, `rpc/${name}`, { method: 'POST', body }));
}

/**
 * Traduz as exceções nomeadas das funções do banco em mensagens que ajudam
 * quem está usando o portal.
 *
 * Sem isto, o roteador redige tudo para "Operação inválida ou sem permissão." —
 * seguro, mas inútil para quem só quer saber que o convite expirou. O que NÃO
 * atravessa daqui é qualquer coisa que não esteja nesta tabela: mensagem de
 * Postgres, nome de tabela, constraint ou a existência de registro alheio.
 */
// Uma única mensagem para toda recusa de convite: não diz qual e-mail era
// esperado, se ele existe nem qual organização deveria aceitar.
export const INVITE_INVALID_MESSAGE = 'Este convite não é válido para esta conta: ele pode ter expirado, já ter sido usado, ter sido revogado ou ter sido enviado a outro e-mail.';
const UPSTREAM_MESSAGES = [
  [/graph root unavailable/i, 404, 'Item não encontrado ou sem acesso para a sua conta.', 'not_found'],
  [/invalid graph query/i, 400, 'Confira filtros e paginação.', 'invalid_graph_query'],
  // Multi-entity (docs/supabase-financial-multi-entity.sql).
  [/legal entity change requires rpc/i, 409, 'A entidade de um processo só muda pela ação de reatribuição, que fica registrada na trilha.', 'entity_change_requires_rpc'],
  [/legal entity has active units/i, 409, 'Arquive antes as unidades ativas desta entidade.', 'entity_has_active_units'],
  [/legal entity already assigned/i, 409, 'Este contrato já tem entidade. Mudanças materiais de contrato são registradas como aditivo.', 'entity_already_assigned'],
  [/legal entity conflict/i, 409, 'Já existe uma entidade com este CNPJ no grupo.', 'entity_conflict'],
  [/invalid legal entity/i, 400, 'Entidade inválida, arquivada ou de outro grupo.', 'invalid_legal_entity'],
  [/invalid scope/i, 400, 'Escopo inválido: administradores são do grupo, e o escopo restrito exige ao menos uma entidade ativa.', 'invalid_scope'],
  [/member not found/i, 404, 'Membro não encontrado nesta organização.', 'member_not_found'],
  [/invalid currency/i, 400, 'Informe a moeda no código ISO de três letras (ex.: BRL).', 'invalid_currency'],
  // Contract Center v2 (docs/supabase-financial-contracts-v2.sql).
  [/contract version conflict/i, 409, 'Os termos deste contrato mudaram em outra sessão. Recarregue antes de gravar uma nova versão.', 'contract_version_conflict'],
  [/correction reason required/i, 400, 'Toda correção de termos já registrados precisa de justificativa; a versão anterior continua no histórico.', 'correction_reason_required'],
  [/invalid contract terms/i, 400, 'Confira os termos do contrato: algum campo está fora do formato aceito.', 'invalid_contract_terms'],
  [/empty amendment/i, 400, 'O aditivo precisa mudar termos, datas ou trazer um resumo do que mudou.', 'empty_amendment'],
  [/invalid amendment/i, 400, 'Confira os dados do aditivo.', 'invalid_amendment'],
  [/milestone closed/i, 409, 'Este marco já foi concluído ou cancelado.', 'milestone_closed'],
  [/milestone not found/i, 404, 'Marco não encontrado ou sem acesso para a sua conta.', 'milestone_not_found'],
  [/invalid milestone/i, 400, 'Confira o tipo, a data e a recorrência do marco.', 'invalid_milestone'],
  [/invalid owner/i, 400, 'O responsável precisa ser membro desta organização.', 'invalid_owner'],
  [/invalid contract/i, 400, 'Confira categoria, datas e entidade do contrato.', 'invalid_contract'],
  // Relationship & Portfolio (docs/supabase-financial-relationships-portfolio.sql).
  [/used limit exceeds approved/i, 400, 'O uso informado passa do limite aprovado registrado. Atualize o limite antes, se ele mudou.', 'used_limit_exceeds_approved'],
  [/schedule version conflict/i, 409, 'O cronograma mudou em outra sessão. Recarregue antes de registrar outro.', 'schedule_version_conflict'],
  [/resolution required/i, 400, 'Descreva como a issue foi resolvida.', 'resolution_required'],
  [/issue closed/i, 409, 'Esta issue já foi encerrada.', 'issue_closed'],
  [/issue not found/i, 404, 'Issue não encontrada ou sem acesso para a sua conta.', 'issue_not_found'],
  [/contact not found/i, 404, 'Contato não encontrado ou sem acesso para a sua conta.', 'contact_not_found'],
  [/facility not found/i, 404, 'Facility não encontrada ou sem acesso para a sua conta.', 'facility_not_found'],
  [/guarantee not found/i, 404, 'Garantia não encontrada ou sem acesso para a sua conta.', 'guarantee_not_found'],
  [/invalid contact/i, 400, 'Confira nome, e-mail e telefone do contato.', 'invalid_contact'],
  [/invalid relationship/i, 400, 'Confira estado e categorias do relacionamento.', 'invalid_relationship'],
  [/invalid issue/i, 400, 'Confira os dados da issue.', 'invalid_issue'],
  [/invalid scorecard/i, 400, 'Scorecard inválido ou aposentado: confira critérios, pesos e escala.', 'invalid_scorecard'],
  [/invalid review/i, 400, 'Notas precisam estar entre zero e a escala de cada critério do scorecard.', 'invalid_review'],
  [/invalid facility/i, 400, 'Confira tipo, valores, datas e moeda da facility.', 'invalid_facility'],
  [/invalid balance/i, 400, 'Confira a fotografia de saldo.', 'invalid_balance'],
  [/invalid schedule/i, 400, 'Confira as parcelas do cronograma (datas únicas e valores não negativos).', 'invalid_schedule'],
  [/invalid guarantee/i, 400, 'Confira tipo, valor e datas da garantia.', 'invalid_guarantee'],
  [/invalid invitation/i, 409, INVITE_INVALID_MESSAGE, 'invite_invalid'],
  [/provider organization required/i, 400, 'Para aceitar um convite é preciso estar em uma organização do tipo provedor.', 'provider_org_required'],
  [/rfq is not receiving proposals/i, 409, 'Esta solicitação não está mais recebendo propostas.', 'rfq_closed'],
  [/invalid parent/i, 400, 'Só é possível responder a um comentário de primeiro nível que você consegue ler.', 'invalid_parent'],
  [/invalid mention/i, 400, 'Mencione somente membros desta organização.', 'invalid_mention'],
  [/invalid visibility/i, 400, 'Escolha uma visibilidade permitida para este objeto.', 'invalid_visibility'],
  [/invalid comment/i, 400, 'Escreva texto simples sem HTML, entre 1 e 4.000 caracteres.', 'invalid_comment'],
  [/comment conflict/i, 409, 'Este comentário já foi registrado com outra autoria ou objeto.', 'comment_conflict'],
  [/rfq revision conflict/i, 409, 'A RFQ mudou em outra sessão. Recarregue a versão atual antes de publicar.', 'rfq_revision_conflict'],
  [/rfq draft conflict/i, 409, 'Esta solicitação foi alterada em outra aba. Recarregue o rascunho antes de salvar.', 'rfq_draft_conflict'],
  [/invalid editor draft/i, 400, 'Rascunho inválido. Confira os campos da solicitação.', 'invalid_editor_draft'],
  [/draft conflict/i, 409, 'Este rascunho mudou em outra aba ou a proposta foi enviada. Atualize a página antes de continuar.', 'draft_conflict'],
  [/approval pending/i, 409, 'Já há uma aprovação em andamento para esta RFQ.', 'approval_pending'],
  [/approval required or stale|approval stale/i, 409, 'A aprovação está pendente ou ficou desatualizada após uma alteração. Solicite uma nova aprovação.', 'approval_stale'],
  [/approval not pending/i, 409, 'Esta aprovação já foi concluída.', 'approval_closed'],
  [/invalid approver|duplicate approver/i, 400, 'Escolha membros distintos desta organização, diferentes do solicitante.', 'invalid_approver'],
  [/approval comment required/i, 400, 'Informe um motivo ao rejeitar ou solicitar alterações.', 'comment_required'],
  [/decision already recorded/i, 409, 'Esta solicitação já tem uma decisão registrada.', 'decision_exists'],
  [/contract already registered/i, 409, 'Esta decisão já gerou um contrato.', 'contract_exists'],
  [/proposal not eligible/i, 409, 'Esta proposta não pode ser escolhida: ela precisa estar enviada e pertencer a esta solicitação.', 'proposal_not_eligible'],
  [/decided proposal/i, 409, 'Esta proposta não pode ser retirada porque já foi escolhida em uma decisão.', 'proposal_decided'],
  [/invalid transition/i, 409, 'Esta mudança de estado não é permitida a partir do estado atual.', 'invalid_transition'],
  [/invalid state/i, 409, 'A operação não é permitida no estado atual desta solicitação.', 'invalid_state'],
  [/invalid tax identifier/i, 400, 'O CNPJ informado não está em um formato aceito.', 'invalid_cnpj'],
  [/invalid revenue band/i, 400, 'A faixa de faturamento informada não é uma das opções aceitas.', 'invalid_revenue_band'],
  [/evidence url must use https/i, 400, 'A evidência regulatória precisa de um endereço https.', 'invalid_evidence_url'],
  [/authority and registry are required/i, 400, 'Informe a autoridade e o número de registro da evidência.', 'evidence_incomplete'],
  [/invalid check date/i, 400, 'A data de consulta da evidência não pode estar no futuro.', 'invalid_check_date'],
  [/invalid email/i, 400, 'Informe um e-mail válido para o convite.', 'invalid_email'],
  [/invalid role/i, 400, 'O papel informado não é um dos papéis aceitos.', 'invalid_role'],
  [/provider not found/i, 404, 'Provedor não encontrado nesta organização.', 'provider_not_found'],
  [/document type not allowed/i, 400, 'Tipo de arquivo não aceito. Envie PDF, JPG, PNG, XLSX ou DOCX.', 'document_type_not_allowed'],
  [/document too large/i, 413, 'O arquivo passa de 10 MB. Reduza o tamanho ou divida em partes.', 'document_too_large'],
  [/invalid document hash/i, 400, 'Não foi possível conferir a integridade do arquivo. Tente enviar de novo.', 'invalid_document_hash'],
  [/too many pending uploads/i, 429, 'Há muitos envios de arquivo em andamento. Aguarde a conclusão antes de enviar outros.', 'too_many_pending_uploads'],
  [/invalid document title/i, 400, 'Dê um nome ao documento, com pelo menos 2 caracteres.', 'invalid_document_title'],
  [/document not available/i, 409, 'Esta versão do documento ainda não terminou de ser enviada ou não existe.', 'document_not_available'],
  [/invalid document|invalid entity/i, 404, 'Documento não encontrado ou já removido.', 'document_not_found'],
  [/authentication required/i, 401, 'Sua sessão expirou. Entre de novo para continuar.', 'authentication_required'],
  [/buyer organization required/i, 403, 'Esta ação é da empresa compradora. Contas de provedor não podem executá-la.', 'buyer_org_required'],
  [/pilot access not allowed/i, 403, 'Esta organização ainda não foi liberada para o piloto. Fale com o time do Arandu.', 'pilot_access_not_allowed'],
  [/invalid approval action|invalid approval request/i, 400, 'Escolha aprovar, pedir alterações ou rejeitar, em um pedido que ainda está aberto.', 'invalid_approval_action'],
  [/invalid draft revision|invalid draft/i, 409, 'O rascunho mudou em outra aba ou sessão. Recarregue a página antes de salvar.', 'draft_conflict'],
  [/invalid demand/i, 400, 'Confira os campos da necessidade: algum valor está fora do formato ou do intervalo aceito.', 'invalid_demand'],
  [/invalid terms version/i, 409, 'Os termos do piloto foram atualizados. Recarregue a página e aceite a versão atual.', 'terms_version_outdated'],
  [/invalid terms/i, 400, 'Confira as condições da proposta: algum valor está fora do formato ou do intervalo aceito.', 'invalid_terms'],
  [/invalid criteria/i, 400, 'Os pesos de decisão precisam ser números entre 0 e 100 em critérios comparáveis.', 'invalid_criteria'],
  [/invalid policy/i, 400, 'Política de aprovação inválida.', 'invalid_policy'],
  [/invalid preference|unknown event/i, 400, 'Este tipo de aviso não pode ser configurado.', 'invalid_preference'],
  [/invalid notification selection/i, 400, 'Selecione avisos da sua própria caixa de notificações.', 'invalid_notification_selection'],
  [/invalid profile document/i, 400, 'Vincule um documento do perfil desta empresa, já enviado e não removido.', 'invalid_profile_document'],
  [/invalid profile source/i, 400, 'Escolha uma origem do dado entre as opções do formulário.', 'invalid_source'],
  [/invalid profile field/i, 400, 'Campo do perfil inválido ou inexistente.', 'invalid_field_key'],
  [/invalid profile value/i, 400, 'Informe um valor de 1 a 500 caracteres, sem marcação HTML.', 'invalid_field_value'],
  [/invalid review period/i, 400, `O período de revisão precisa ficar entre ${MIN_REVIEW_DAYS} e ${MAX_REVIEW_DAYS} dias.`, 'invalid_review_period'],
  [/invalid passport usage/i, 400, 'Algum campo do Passport usado na solicitação não existe mais no perfil. Recarregue a página.', 'invalid_passport_usage'],
  [/immutable record/i, 409, 'Este registro é histórico e não pode ser alterado.', 'immutable_record'],
  [/invalid product/i, 400, 'Produto não suportado. O Arandu cobre crédito empresarial e adquirência.', 'invalid_product'],
  [/invalid period|invalid date/i, 400, 'Informe datas válidas: o fim precisa ser depois do início.', 'invalid_period'],
  [/invalid search/i, 400, 'Informe uma busca de 2 a 100 caracteres.', 'invalid_search'],
  [/invite secret unavailable|invite unavailable/i, 409, 'Este convite não está mais disponível. Peça um novo link à empresa.', 'invite_unavailable'],
  [/rfq not found/i, 404, 'Solicitação não encontrada nesta organização. Ela pode ter sido cancelada ou você não tem acesso.', 'rfq_not_found'],
  [/proposal not found/i, 404, 'Proposta não encontrada ou sem acesso para a sua instituição.', 'proposal_not_found'],
  [/approval not found/i, 404, 'Pedido de aprovação não encontrado. Ele pode ter sido cancelado.', 'approval_not_found'],
  [/decision not found/i, 404, 'Decisão não encontrada. Registre a decisão antes de cadastrar o contrato.', 'decision_not_found'],
  [/contract not found/i, 404, 'Contrato não encontrado nesta organização.', 'contract_not_found'],
  [/object not found|unknown entity|not found/i, 404, 'Item não encontrado ou sem acesso para a sua conta.', 'not_found'],
  [/invalid organization|invalid context/i, 403, 'Esta organização não está disponível para a sua conta.', 'invalid_organization'],
  [/mfa required/i, 403, 'Confirme o segundo fator de autenticação para abrir o console operacional.', 'mfa_required'],
  [/lookup required|invalid lookup/i, 400, 'Informe um request ID ou um identificador de entidade válido.', 'invalid_lookup'],
  [/forbidden/i, 403, 'Sua conta não tem permissão para esta operação nesta organização.', 'forbidden']
];

export async function upstream(promise) {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const raw = String(error?.details?.message || error?.message || '');
    for (const [pattern, status, message, code] of UPSTREAM_MESSAGES) {
      if (pattern.test(raw)) throw new HttpError(status, message, code);
    }
    throw error;
  }
}

/** Organização declarada pelo cliente só vale depois de confirmada no banco. */
export async function memberOrganization(token, organizationId, kinds = null) {
  const id = requireUuid(organizationId, 'organization_id');
  const rows = await rest(token, `fin_organizations?select=id,legal_name,trade_name,kind,country,sector,revenue_band&id=eq.${id}&limit=1`);
  const organization = rows?.[0];
  // RLS já devolve vazio para organização de terceiro: nada a distinguir aqui.
  if (!organization) throw new HttpError(403, 'Organização não disponível para esta conta.', 'organization_forbidden');
  if (kinds && !kinds.includes(organization.kind)) throw new HttpError(400, 'Tipo de organização incompatível com a operação.', 'organization_kind');
  return organization;
}

export async function loadRfq(token, rfqId) {
  const id = requireUuid(rfqId, 'rfq_id');
  const rows = await rest(token, `fin_rfqs?select=*&id=eq.${id}&limit=1`);
  if (!rows?.length) throw new HttpError(404, 'RFQ não encontrada.', 'rfq_not_found');
  return rows[0];
}

