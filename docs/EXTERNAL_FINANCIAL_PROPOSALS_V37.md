# Propostas financeiras externas — domínio e handoff v3.7

Missão explícita de implementação buyer-first, 20/10/2026. Não é release
hospedado, validação comercial, autenticação bancária ou aprovação de crédito.
A mesma regra atende Essencial/Gestão/Enterprise, sem billing ou entitlements.
A extensão de decisão altera somente external-proposals.js e o escopo externo de rfq.js; demais telas permanecem sob responsabilidade do Claude.

## Decisão de arquitetura

O modelo anterior exige um convite aceito e uma organização provedora em
`fin_proposals`. Versões têm `submitted_by`, revisão da RFQ e história imutável;
decisões/approvals/contratos apontam para essas propostas por FKs e usam locks.
O comprador não pode usar `fin_submit_proposal` como se fosse o banco.

**Escolha B:** ingestão externa persistida no tenant comprador, ligada à RFQ,
entidade original e `fin_providers`, com adaptação ao mesmo `buildComparison`
e `applyUserWeights`. Não há segunda lógica de cálculo, pesos ou negociação.
Os quatro estados são de preparação/revisão da transcrição, não uma cópia da
máquina de sourcing. A instituição não precisa ter conta nem aceitar convite.

## Extensão de decisão e continuidade

A migration `supabase-financial-external-decision.sql`, após relationship-continuity,
implementa referências tipadas nas decisões, aprovações e contratos canônicos.
As FKs e identidades institucionais de `fin_proposals` permanecem intactas.
A análise das alternativas está em `evidence/codex-v37-external-decision-design.md`.

`decision_allowed` é calculado no banco: exige revisão humana da versão atual,
RFQ na revisão correspondente e documento disponível, quando vinculado.
O comprador seleciona a fonte externa na aba de decisão, usa a mesma policy,
as mesmas alçadas/SoD e o mesmo motor de comparação. A aprovação continua
sendo ato interno; nenhuma etapa autentica o emissor ou significa aceite bancário.

A decisão captura versão, revisão da RFQ, termos brutos, moeda declarada,
revisor/documento, critérios/pesos, cobertura e incomparabilidades, ator e
limitações da transcrição. Correções posteriores preservam o snapshot.
A continuidade é uma ação separada: vincular um contrato importado existente,
confirmado explicitamente, da mesma organização, entidade, instituição, produto
e moeda declarada. Valores explicitamente preenchidos na mesma base (principal,
taxa mensal, spread anual, indexador, amortização e adquirência) não podem
conflitar. Prazo de crédito usa meses de calendário a partir do início do contrato
(com término no aniversário ou na véspera). Ausência não vira equivalência e
taxas mensais/anuais não são convertidas. Não cria contrato, assinatura, crédito ou desembolso.

### Comandos e recuperação

Todos usam JWT do usuário. `POST external-proposals/preview` recebe `id`,
`expected_version`, `rfq_revision`, `declared` e retorna a avaliação canônica.
`POST /decision`, `/approval` e `/contract` exigem também `request_key`
(8–80 caracteres alfanuméricos ou `._:-`). Decisão recebe `weights` e
`rationale`; aprovação recebe `approver_ids` ou `assignments`, `justification`
e `declared` conforme a policy. Vínculo recebe `decision_id`, `contract_id`,
`expected_contract_version` e `confirmed_contract_record:true`.
Resposta: `{ok:true,id,replayed,notice}`, 201 novo ou 200 replay.
Mesma intenção/material retorna o ID original; payload diferente conflita.
Versão/revisão/permissões são verificadas sob lock; não são atualizadas pelo retry.

`GET /result?organization_id=…&id=…&operation=decision|approval|contract&request_key=…`
retorna `{ok:true,state:"confirmed"|"unconfirmed",id}` sob RLS. Resultado ainda
não confirmado não autoriza trocar a intenção. `GET /contracts` usa organização,
ID externo, `limit` até 50 e cursor `after`; retorna candidatos importados e
`page.has_more/next_after`, independente do overview.
Os erros seguem os códigos estáveis de conflito, acesso e policy do domínio;
`external_proposal_conflict` inclui versão/documento/estado incompatíveis.

Migration e rollback: `financial-external-decision-1`; rollback próprio em
`rollback/supabase-financial-external-decision.rollback.sql`, somente antes
de uso material. Após decisão/aprovação/vínculo externo, exige forward-fix.
Sem aplicação hospedada ou conversão de dados nesta missão.

## Persistência e segurança

Migration aditiva `supabase-financial-external-proposals.sql`, depois de
`financial-decision-authorization-1`, marker `financial-external-proposals-1`.
Manifesto, ordem, doctor, backup preflight e probes/canário reconhecem esse
marker e mantêm as verificações de segurança anteriores. Sem execução remota.

- `fin_external_proposals`: identidade imutável (comprador/entidade/RFQ/provedor/
  produto), intenção idempotente de criação, autor/data e projeção de estado e
  versão corrente. Instituição é atribuição feita pelo comprador.
- `fin_external_proposal_versions`: termos, canal, recebimento/referência, moeda
  declarada, revisão da RFQ, documento/versão/metadados, motivo de correção,
  chave/hash da intenção e autor/data. Append-only.
- `fin_external_proposal_reviews`: confirmar/retirar, versão, justificativa,
  leitura declarada do material, ator/data. Append-only, recibo único por ação
  e versão; revisão significa correspondência da transcrição, não validação.
- `fin_external_proposal_current`: view SECURITY INVOKER, derivada das tabelas
  e dos documentos correntes; não é outra fonte de verdade.

RLS forçado nas três tabelas; comprador e entidade são sempre validados.
Clientes autenticados têm somente SELECT nas tabelas/view. Escritas só pelas
RPCs, com JWT do usuário; funções internas sem EXECUTE para clientes. Nenhum
service role no cliente ou caminho privilegiado na nova API. Provedor, mesmo
vinculado à RFQ, não recebe acesso aos registros externos nem aos concorrentes.
Revogação de sessão continua sob o hook PostgREST existente; os testes SQL de
papel/claims não são prova de login real em Auth gerenciado.

| Operação | Papel comprador e escopo de entidade |
| --- | --- |
| Ler/listar | admin, finance_manager, analyst, viewer autorizados |
| Criar/corrigir | admin, finance_manager, analyst |
| Confirmar/retirar | admin, finance_manager |
| Escolher/contratar proposta externa | Bloqueado nesta entrega |

Lock RFQ → membership/grants → registro → documento. Membership e grants são
relidos e protegidos após espera do lock; não confiar só no papel verificado
antes da espera. Alterar entidade de RFQ com evidência externa existente é
recusado: requer evolução formal, não reatribuição silenciosa de histórico.
Registros em RFQ encerrada/cancelada não aceitam novas versões. Correção em RFQ
já decidida pode registrar a evidência superveniente, sem modificar decisão ou
contrato; isso não reabre autorização para contratar a versão nova.

## Estados, idempotência e evidência

`preparing` → nova versão `pending_review` → confirmação humana `reviewed`.
Corrigir sempre cria nova versão e exige novo `expected_version`, chave e
motivo; a nova versão volta a preparing/pending_review. Estado de versão antiga
é derivado como `superseded`, sem apagar a revisão histórica. `withdrawn`
encerra a consideração corrente, com recibo e justificativa; não apaga versões.

Criação: chave estável por organização + fingerprint do payload normalizado e
escopo. Repetir a mesma chave/entrada devolve o mesmo ID/versão original; mesma
chave com conteúdo diferente conflita. Correção: chave por registro e fingerprint
incluindo versão esperada. Retry devolve o resultado original, mesmo após avanço
posterior; ler o detalhe para conhecer o estado atual. Não reutilizar chaves
para intenções diferentes. Confirmação repetida com mesma versão/justificativa/
leitura retorna o mesmo recibo. Nova intenção sobre versão obsoleta conflita.
Nenhuma operação ignora erro para aparentar persistência.

A revisão exige `material_reviewed=true` e motivo. Se há documento, também
`document_read=true`. Essa é declaração do revisor; o software não prova leitura
cognitiva nem autenticidade. Campo omitido fica ausente; não vira zero. Valores
presentes seguem tipos, limites e opções de `products.mjs`; a validação SQL
espelha esse catálogo e o teste de paridade falha se divergirem. Registros
incompletos podem ser revisados como transcrição parcial e exibem a cobertura e
as incomparabilidades do motor existente. O canal não altera o peso financeiro.

Moeda ausente permanece NULL; para propostas externas isso não assume BRL.
Comparação de moeda desconhecida/distinta não converte nem produz equivalência;
CET continua somente informado. Labels de dinheiro não afirmam R$ se há moeda
externa diferente/ausente. Indexador, prazo, principal e amortização mantêm os
bloqueios do motor atual. Nenhuma extração/IA promove fatos automaticamente.

## Documentos e governança

Reutilizar upload privado **da própria RFQ**, com `visibility=internal`, versão
já `available` e legível para o ator. Nenhum bucket, parser ou SDK novo. Upload
pendente/falho, documento removido, alheio ou de outro objeto é recusado antes
de vincular. Se Storage falhar durante o upload existente, terminar/reconciliar
aquele fluxo antes de enviar sua referência; a ingestão não anuncia upload.

Metadados são lidos no banco, não aceitos como hashes/autoria enviados no corpo
da proposta. O hash existente da versão documental pode ter sido informado no
upload e não recalculado na finalização atual. Portanto é **metadado registrado**,
rotulado `version_metadata_unverified`/`sha256_verified_against_bytes=false`,
não prova independente de integridade dos bytes ou de autoria. Hash ausente é
NULL. Nenhum download de arquivo é realizado por esta API. Sem arquivo,
`document_state=not_presented` e `document_available=false`; isso não impede
a análise de uma declaração manual revisada, mas nunca anuncia um anexo.

Remoção posterior do documento mantém história, mas `document_available=false`
na projeção e exclui o registro da comparação corrente. Revisão histórica não é
apagada nem apresentada como disponibilidade atual. Documento referenciado não
pode virar shared ou mudar de objeto/tenant por atualização: isso exporia termos
a outras instituições. Uma necessidade futura de compartilhamento requer fluxo
específico e autorização por destinatário, não mudança silenciosa de visibility.
O Passport permanece privado; não é compartilhado integralmente por inferência.

Registro de governança: cabeçalho FINANCIAL_SENSITIVE/FINANCIAL_RECORD/archive,
versões FINANCIAL_SENSITIVE/FINANCIAL_RECORD/immutable, revisões AUDIT_EVIDENCE/
AUDIT_EVIDENCE/immutable. Três datasets no export existente e na prévia de
exclusão; nenhuma retenção automática de negócio foi adicionada. Legal hold,
revogação/offboarding e retenção do tenant continuam existentes. Worker conserva
seu grant prévio para consultar o catálogo de datasets; mutações novas não usam
service role. Evidências não são descartadas após confirmação/retirada.

## Handoff de API para Claude Code

Prefixo `/api/finance/`. Mesma autenticação, rate limits e envelope de erros do
produto, Cache-Control no-store e request ID do roteador. Não renderizar sucesso
antes do ACK. Todas as referências abaixo são sintéticas, não fixtures hospedadas.

| Endpoint | Método | Request / retorno |
| --- | --- | --- |
| external-proposals | POST | Corpo abaixo → `{ok,id,version,replayed,notice}`; 201 novo, 200 replay |
| external-proposals/versions | POST | Mesmo corpo + id, expected_version, correction_reason e nova request_key → nova versão/replay |
| external-proposals/confirm | POST | `{id,expected_version,reason,material_reviewed:true,document_read:boolean}` → `{ok,review_id,notice}` |
| external-proposals/withdraw | POST | Mesmo envelope de revisão → recibo imutável de retirada |
| external-proposals?organization_id=…&rfq_id=…&limit=25&after=… | GET | `{ok,rows,page:{has_more,next_after},decision_allowed:false,notice}`; ordem id asc, cursor UUID |
| external-proposals?organization_id=…&id=…&limit=25&before_version=… | GET | `{ok,record,versions,reviews,page:{has_more,next_before},decision_allowed:false,notice}`; versões desc |
| export?rfq_id=… | GET | Export factual do processo e comparação com os mesmos canais elegíveis; provenance externa preservada |
| comparison | POST | `{rfq_id,weights?}` → comparison/weighted existentes, incluindo externas elegíveis |
| external-proposals/decision ou /contract | POST | 409 external_decision_not_supported; nenhuma persistência |

Exemplo de criação (UUIDs devem ser de objetos autorizados reais do ambiente):

```json
{
  "rfq_id": "00000000-0000-4000-8000-000000000702",
  "provider_id": "00000000-0000-4000-8000-000000000704",
  "request_key": "external-credit-demo-001",
  "rfq_revision": 1,
  "state": "pending_review",
  "channel": "manual",
  "received_at": "2026-01-01T12:00:00Z",
  "source_reference": "Comunicação comercial fictícia, referência DEMO-01",
  "currency": "BRL",
  "terms": {"offered_amount": 100000, "institution": "Instituição declarada"},
  "document_id": null,
  "document_version": null
}
```

Canal: email/document/spreadsheet/formal_communication/manual. Data de recebimento opcional: quando conhecida, informar com fuso, finita e
não futura; quando desconhecida, NULL. Nunca usar recorded_at como fallback
ou inventar horário para uma fonte que só informa o dia. Documento opcional,
mas os dois identificadores de versão devem estar presentes juntos. Não enviar
recorded_by/reviewed_by, hashes, instituição autenticada ou aceite como campos
controláveis: são derivados do servidor ou desconhecidos. Produto/entidade vêm
da RFQ, não do formulário. `terms` é o schema do produto, sem novo catálogo.

Detalhe/lista incluem `origin=buyer_recorded_external`, issuer_identity,
review_scope, external_validation/institution_acceptance=not_recorded,
document_hash_source e disponibilidade. `versions[].version_state` é derivado;
reviews é limitado às versões daquela página. A busca de histórico limita
as versões ao current_version do cabeçalho já lido: uma versão concorrente
nova não pode herdar o estado reviewed da versão anterior. Limite 1–50 (padrão25); usar
has_more/cursor, não insinuar histórico completo ao receber uma página.

Os endpoints tradicionais de lista/detalhe da RFQ e os contadores legados
continuam descrevendo propostas do portal. Para a fila externa, carregar
external-proposals; não inferir ausência de ofertas externas desses contadores.
O registro externo não simula uma transição causada por envio do banco.

Na comparação, `columns[].provenance` distingue fonte, autor do registro,
recebimento, revisão, documento e limitações. Para externas não há submitted_at
bancário; usar recorded_at da proveniência. Não desenhar botão de selecionar/
contratar quando provenance.decision_allowed=false. Não rotular reviewed como
"validado pelo banco" nem como assinatura, aceite ou identidade verificada.

Erros principais: 400 invalid_external_proposal/invalid_id; 403 forbidden ou
organization_forbidden; 404 external_proposal_not_found/route_not_found;
409 external_proposal_conflict/external_proposal_state/external_decision_not_supported;
413 payload_too_large; 422 external_comparison_limit/proposal_coverage_limit;
429 rate limit; 503 schema_incompatible/indisponibilidade herdada. Mensagens são
sanitizadas; não registrar termos, referências privadas ou documentos em logs.
Após cada mutação, reler a projeção corrente; um recibo repetido confirma o
resultado original, não a disponibilidade atual de um documento. Ao receber
conflito, recarregar versão e exigir decisão da pessoa; não repetir
com expected_version novo automaticamente. Retry de timeout mantém a mesma chave.

## Desempenho, migração e integração

Índices por RFQ/ID, tenant/RFQ/entidade/ID, versões por registro e tenant, recibos
por registro/versão/ação. A comparação acrescenta uma consulta limitada à view,
sem N+1 por proposta ou documento; pesos e fórmulas são os existentes. Máximo
500 propostas combinadas; consulta adicional de sentinela detecta excesso.
Loader tradicional também recusa truncamento de 500 propostas/2000 versões;
+1 é só sentinela, não aumento de capacidade. Sem cache entre tenants.

Não foram medidos p95 de API hospedada, capacidade ou RUM. CPU local não é SLA.
Queries e corridas são ensaios sintéticos em PostgreSQL descartável, não banco
hospedado. Body até48KB, termos até32KiB no banco, referências até500 caracteres,
justificativas10–1000; erros não produzem confirmação de persistência.

Aplicação futura: revisão da PR e quatro gates → recovery/restore/cutover e
rollout explicitamente autorizados → migration pelo fluxo existente → probes,
doctor e jornadas reais do SHA/schema corretos. **Nada disso foi executado
remotamente nesta missão.** Rollback recusa se houver qualquer registro externo;
com dados, forward-fix ou restore completo validado. Pré-dados: remove apenas
objetos novos e restaura catálogo/marker anteriores. Correções não reescrevem
snapshots/valores históricos nem removem evidência.

Cenário de seed futuro para a Demo canônica: comprador com RFQ crédito, cadastro
de uma instituição sem conta, transcrição manual parcial revisada pelo gestor;
segunda proposta autenticada em fixture distinta para comparar canais. Adicionar
via APIs reais depois de integrar e autorizar o ambiente, sem alterar sandbox
legado. Nenhum arquivo de seed/estação do Claude foi modificado nesta missão.
