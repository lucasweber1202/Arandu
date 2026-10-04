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
  [/fee schedule already exists/i, 409, 'Já existe tarifa contratada para este serviço e unidade neste contrato; registre uma nova versão.', 'fee_schedule_exists'],
  [/fee schedule version conflict|fee review conflict/i, 409, 'O registro mudou desde que você abriu. Recarregue e tente de novo.', 'fee_conflict'],
  [/fee schedule effective date regression/i, 400, 'A nova versão não pode ter vigência anterior à versão atual.', 'fee_effective_regression'],
  [/fee schedule reason required/i, 400, 'Justifique a nova versão da tarifa contratada.', 'fee_reason_required'],
  [/fee contract version unavailable/i, 400, 'Versão do contrato inexistente: registre os termos do contrato antes da tarifa.', 'fee_contract_version'],
  [/invalid fee schedule/i, 400, 'Confira serviço, unidade, modelo de cobrança, taxa, faixas, mínimo/máximo, moeda e fonte.', 'invalid_fee_schedule'],
  [/fee observation conflict/i, 409, 'Já existe observação desta fonte e período com valores diferentes; registre a correção com outra referência.', 'fee_observation_conflict'],
  [/invalid fee observation source/i, 400, 'Origem não aceita: integrações automáticas ainda não existem; registre a fonte do documento.', 'invalid_fee_source'],
  [/invalid fee observation/i, 400, 'Confira serviço, unidade, moeda, período encerrado, valores e evidência.', 'invalid_fee_observation'],
  [/fee observation already verified/i, 409, 'Esta observação já foi verificada ou rejeitada.', 'fee_already_verified'],
  [/invalid fee verification|invalid fee review transition|invalid fee review/i, 400, 'Transição ou dados de revisão inválidos para o estado atual.', 'invalid_fee_review'],
  [/invalid fee filters/i, 400, 'Filtros de tarifas inválidos.', 'invalid_fee_filters'],
  [/value already realized/i, 409, 'Já há realização deste período; preserve a evidência e registre a correção como novo baseline.', 'value_already_realized'],
  [/value observation incomplete/i, 400, 'Realização exige período encerrado, mesma moeda, cobertura completa e confirmação humana da evidência.', 'invalid_value_observation'],
  [/value not realizable/i, 409, 'Este registro não é uma estimativa negociada ativa e comparável.', 'value_not_realizable'],
  [/value not comparable/i, 400, 'Critérios econômicos desconhecidos ou diferentes impedem o cálculo.', 'value_not_comparable'],
  [/invalid value|value currency mismatch|value target version unavailable/i, 400, 'Confira baseline, custos totais, moeda, período e versão do contrato.', 'invalid_value'],
  [/graph root unavailable/i, 404, 'Item não encontrado ou sem acesso para a sua conta.', 'not_found'],
  [/invalid graph query/i, 400, 'Confira filtros e paginação.', 'invalid_graph_query'],
  // Policy & Approval Engine v2 (docs/supabase-financial-policy-engine.sql).
  [/policy assignment required/i, 409, 'A policy da empresa define as etapas desta aprovação. Indique os aprovadores de cada etapa do plano.', 'policy_assignment_required'],
  [/policy approval not applicable/i, 409, 'Nenhuma policy ativa exige etapas para esta operação. Use o pedido de aprovação simples, se quiser.', 'policy_not_applicable'],
  [/policy approvers required/i, 400, 'Cada etapa do plano precisa do número mínimo de aprovadores indicados.', 'policy_approvers_required'],
  [/policy approver ineligible/i, 400, 'Alguém indicado não cumpre o papel ou o escopo exigido pela etapa (por exemplo, tesouraria do grupo ou aprovador local da entidade).', 'policy_approver_ineligible'],
  [/policy justification required/i, 400, 'A policy exige justificativa (ao menos 10 caracteres) para esta operação.', 'policy_justification_required'],
  [/policy plan too large/i, 409, 'O plano derivado tem etapas demais. Revise as policies do grupo e da entidade.', 'policy_plan_too_large'],
  [/policy version not draft/i, 409, 'Só rascunhos podem ser ativados ou descartados. Versões ativadas são imutáveis.', 'policy_version_not_draft'],
  [/invalid policy exception/i, 400, 'Confira a exceção: regra do plano, motivo (10 a 2.000 caracteres) e evidências.', 'invalid_policy_exception'],
  [/policy exception already open/i, 409, 'Já existe uma exceção aberta ou aprovada para esta regra neste pedido.', 'policy_exception_open'],
  [/policy exception closed/i, 409, 'Esta exceção já foi decidida ou cancelada.', 'policy_exception_closed'],
  [/policy exception not found/i, 404, 'Exceção não encontrada ou sem acesso para a sua conta.', 'policy_exception_not_found'],
  [/segregation of duties/i, 403, 'Segregação de funções: esta pessoa não pode acumular este papel neste processo.', 'segregation_of_duties'],
  [/approver no longer eligible/i, 403, 'Seu papel ou acesso à entidade mudou e você não cumpre mais esta etapa. Peça a substituição do pedido.', 'approver_ineligible'],
  [/approval expired/i, 409, 'Este pedido passou da validade definida pela policy.', 'approval_expired'],
  [/invalid delegation/i, 400, 'Delegação inválida: escolha outro membro, um período de até 90 dias que termine no futuro e um motivo.', 'invalid_delegation'],
  // Data Governance (docs/supabase-financial-data-governance.sql).
  [/retention class not configurable/i, 400, 'Esta classe de dado não aceita retenção automática configurável pela organização.', 'retention_class_not_configurable'],
  [/invalid retention period/i, 400, 'Prazo fora dos limites técnicos da classe.', 'invalid_retention_period'],
  [/invalid retention policy/i, 400, 'Confira prazo, motivo e referência da política.', 'invalid_retention_policy'],
  [/retention policy not draft/i, 409, 'Só rascunhos são ativados. Versões ativadas são imutáveis; crie uma nova versão.', 'retention_policy_not_draft'],
  [/retention policy not active/i, 409, 'Esta versão já foi substituída ou aposentada.', 'retention_policy_not_active'],
  [/invalid legal hold/i, 400, 'Hold inválido: escopo deve ser desta organização e o motivo ter de 10 a 1.000 caracteres.', 'invalid_legal_hold'],
  [/invalid export range/i, 400, 'Faixa de download inválida.', 'invalid_export_range'],
  [/export not available/i, 410, 'Este pacote não está disponível: ainda não ficou pronto, venceu ou falhou. Peça um novo export.', 'export_not_available'],
  [/invalid export/i, 400, 'Pedido de export inválido.', 'invalid_export'],
  [/organization offboarding/i, 409, 'A organização está em offboarding: novos acessos, exports e políticas estão bloqueados.', 'organization_offboarding'],
  [/invalid offboarding transition/i, 409, 'Esta ação não vale para o estado atual do offboarding.', 'invalid_offboarding_transition'],
  [/invalid offboarding/i, 400, 'Confira motivo, janela de retenção (0 a 3.650 dias) e referência da decisão.', 'invalid_offboarding'],
  [/legal hold active/i, 409, 'Há legal hold ativo: a exclusão fica suspensa até a liberação.', 'legal_hold_active'],
  [/tenant data remains/i, 409, 'Ainda há dados do tenant; a exclusão física não foi concluída.', 'tenant_data_remains'],
  // Enterprise SSO (docs/supabase-financial-sso.sql).
  [/invalid sso connection/i, 400, 'Conexão SSO inválida: protocolo, nome, URLs https e mapeamento com e-mail.', 'invalid_sso_connection'],
  [/sso connection active/i, 409, 'Conexão ativa não é editada. Desative, ajuste, teste e reative.', 'sso_connection_active'],
  [/sso connection incomplete/i, 409, 'Complete a conexão (provedor no broker, metadados; em OIDC, issuer e client_id) antes de testar ou ativar.', 'sso_connection_incomplete'],
  [/sso domain not verified/i, 409, 'Ligue à conexão um domínio verificado por DNS antes de testar ou ativar.', 'sso_domain_not_verified'],
  [/sso test login required/i, 409, 'Faça ao menos um login SSO bem-sucedido em modo de teste antes de ativar.', 'sso_test_login_required'],
  [/sso mock broker/i, 409, 'A conexão de teste (mock) nunca é ativada.', 'sso_mock_broker'],
  [/sso domain unavailable/i, 409, 'Este domínio não está disponível para esta organização.', 'sso_domain_unavailable'],
  [/sso domain already verified/i, 409, 'Este domínio já está verificado.', 'sso_domain_verified'],
  [/invalid sso domain/i, 400, 'Domínio inválido ou de e-mail pessoal.', 'invalid_sso_domain'],
  // Public API v1 & Webhooks (docs/supabase-financial-public-api.sql).
  [/invalid service account/i, 400, 'Conta de serviço inválida: nome, escopos do catálogo e, se restrita, entidades ativas do grupo.', 'invalid_service_account'],
  [/service account revoked/i, 409, 'Esta conta de serviço está revogada ou desativada.', 'service_account_revoked'],
  [/too many active credentials/i, 409, 'Cada conta de serviço tem no máximo duas credenciais ativas (para rotação). Revogue uma antes.', 'too_many_credentials'],
  [/invalid credential/i, 400, 'Credencial inválida: validade entre 1 e 365 dias.', 'invalid_credential'],
  [/invalid webhook/i, 400, 'Webhook inválido: use uma URL https pública (porta 443, sem usuário/senha) e eventos do catálogo.', 'invalid_webhook'],
  [/too many webhooks/i, 409, 'Limite de 10 webhooks ativos por organização atingido.', 'webhook_limit'],
  [/delivery not replayable/i, 409, 'Esta entrega ainda está em andamento.', 'delivery_not_replayable'],
  [/webhook disabled/i, 409, 'O webhook está desativado. Reative-o antes de reenviar.', 'webhook_disabled'],
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

