# Passport por entidade legal

O tenant continua sendo `fin_organizations`. O Passport existente ganha `legal_entity_id` em perfil e histórico; NULL mantém os dados anteriores no grupo. Não há cópia dos registros do grupo para entidades. Unidades de negócio mantêm seu escopo de processo; não recebem automaticamente o perfil da entidade-mãe.

| Campo | Default de grupo no contexto de entidade |
| --- | --- |
| sector | Cadastro do grupo; sem override pelo formulário |
| moeda_base | Permitido; valor explícito da entidade prevalece |
| necessidades_recorrentes | Permitido; valor explícito da entidade prevalece |
| canais_de_venda | Permitido; valor explícito da entidade prevalece |
| Outros campos, inclusive livres | Nunca herdados |

Identidade vem do cadastro da entidade selecionada. Saldos, índices, garantias e documentos do grupo não viram fatos da entidade. Ausência significa não informado, sem fallback financeiro. A UI mostra Grupo, Entidade legal ou Default do grupo (herdado), além de origem, responsável, datas e revisão.

## API e autorização

`GET /api/finance/profile?organization_id=...&legal_entity_id=...` monta somente o contexto solicitado. `POST profile` e `POST profile/confirm` recebem `legal_entity_id`; chamadas antigas sem entidade mantêm RPCs compatíveis de grupo. `GET profile/history` exige o mesmo contexto original. `GET profile/search` aceita q (2–100 caracteres), limit (1–50), offset (0–1000), organization_id e legal_entity_id.

As consultas usam JWT do usuário. RLS filtra perfil, histórico e snapshots. Um membro restrito pode ler apenas defaults de grupo permitidos e entidades concedidas; não grava o grupo. O endpoint valida identidade autorizada antes de consultar dados da entidade. A busca SQL é SECURITY INVOKER e resolve precedência antes de procurar, para não revelar um default suprimido pelo valor da entidade. Provedores não alcançam o Passport comprador.

Documentos continuam privados. Profile document entity_id passa a aceitar o ID de uma entidade legal autorizada; vincular um arquivo de grupo à entidade é recusado. Não há compartilhamento implícito de documentos de outra entidade.

## RFQ e ponto no tempo

O prefill resolve grupo + entidade exata, nunca a irmã. Ao mudar a entidade no wizard, sugestões ainda não editadas são retiradas e resolvidas novamente; conteúdo editado manualmente permanece uma declaração da pessoa.

O snapshot é capturado na transação de criação a partir da entidade real da RFQ, não de um ID enviado dentro de passport_fields. Preserva contexto do processo, source_legal_entity_id, original_scope, valor, source, owner (profile_updated_by), verified_at, captura e vintage. O banco também valida pares campo/demanda do catálogo. Passport corrigido e permissões revogadas não reescrevem snapshot; RLS governa quem pode lê-lo agora.

## Migration e reversão

Nova migration aditiva `supabase-financial-passport-entities.sql`, após relationships-portfolio, marcador `financial-passport-entities-1`. Índice UNIQUE NULLS NOT DISTINCT mantém uma linha corrente por tenant/escopo/campo. Histórico e snapshots permanecem append-only; gatilho bloqueia reatribuição de escopo do campo.

Dados históricos anteriores não são reescritos para preencher novas colunas. Defaults NULL indicam provenance anterior não disponível; snapshot antigo permanece group sourced conforme o modelo que o produziu.

Rollback exige ausência de dados por entidade no perfil, histórico e snapshots. Com dados, recusa antes de mudar qualquer objeto: usar forward-fix ou restore completo verificado. Não colapsar saldos em uma linha do grupo. Restore e migrations hospedadas seguem o preflight existente; esta rodada não aplica SQL no Pilot hospedado.

## Evidência

Testes de domínio/API: precedência, identidade, ausência de irmã, prefill e entidade não autorizada. E2E: selector, identidade/valor por entidade, teclado/formulários e mobile em cinco projetos. Testes PostgreSQL: clean install, upgrade, reapply, rollback pré-dados, RLS entre entidades/tenants/provedor, escrita de grupo recusada, snapshot com vintage e permanência após correção/revogação. Resultados executados são registrados no PR; código de teste não equivale a execução aprovada.
