# Modelo de segurança — Financial Procurement

A vertical herda os padrões já existentes do Arandu: Supabase Auth, sessão
segura, RLS, RBAC, proteção contra enumeração, rate limit, validação de origem,
CSP, sanitização, DTO com allowlist, auditoria e retenção.

## Camadas

1. **Origem e sessão** — `enforceSameOrigin` e `requireUser` em
   `api/[...path].js`, antes de qualquer rota `/api/finance/*`.
2. **Rate limit** — três escopos: catálogo de produtos (anônimo, 120/10min),
   conta (240/10min por usuário) e escrita (60/10min por usuário). O limite de
   escrita cobre convite, envio de proposta e decisão; ele é folgado o bastante
   para um piloto real e apertado o bastante para que replay de convite ou spam
   de proposta esbarrem nele.
3. **DTO / allowlist** — `lib/finance/products.mjs` define os campos aceitos por
   produto. `normalizeDemand` / `normalizeProposal` descartam qualquer chave não
   declarada e devolvem a lista do que foi rejeitado.
4. **Resolução no servidor** — `organization_id` só vale depois de confirmado
   pelo banco; o **produto** de uma proposta vem da linha em `fin_proposals`,
   nunca do corpo; `provider_organization_id` é validado por membresia.
5. **RLS forçada** — `force row level security` em todas as tabelas `fin_*`.
   `anon` não recebe nenhum privilégio. Mesmo um chamador que fale direto com a
   REST API do Supabase não atravessa as policies.
6. **Escrita de estado por função** — `INSERT`/`UPDATE`/`DELETE` diretos estão
   revogados em RFQs, convites, propostas, versões, decisões, contratos e
   eventos. Tudo passa por funções `SECURITY DEFINER` que checam papel e estado.
7. **Redação de erro** — erros não-`HttpError` no domínio financeiro viram 503
   ou um código genérico. A mensagem do Postgres nunca chega ao cliente: ela
   revelaria nomes de tabela, policies e a existência de registros alheios.
   Falhas conhecidas das funções do banco são traduzidas por uma tabela fixa
   em `lib/api/domains/finance.mjs` para mensagens úteis ("este convite não é
   válido", "esta solicitação já tem uma decisão") — nada fora dessa tabela
   atravessa.

## Isolamento entre organizações

* Uma organização nunca lê RFQ, proposta, contrato, provedor ou perfil de outra.
* O Financial Passport (perfil, histórico e fotografia na RFQ) é lido só por
  membros da compradora; o provedor com convite aceito não o alcança. A escrita
  é só por RPC (`fin_passport_set_field`, `fin_passport_confirm_field`,
  `fin_create_rfq_from_passport`), que conferem papel, origem e documento; o
  INSERT/UPDATE direto foi revogado. Histórico e fotografia são imutáveis; só o
  reset de um banco marcado `deployment_environment=demo` os apaga, com a chave
  de serviço. Testes: `tests/database/financial-passport.sql`.
* Um provedor lê apenas: as RFQs cujo convite **aceitou** e a **própria**
  proposta, com as próprias versões.
* Um provedor nunca lê proposta de concorrente, nota interna da empresa nem a
  decisão antes de registrada.

Todos esses pontos têm teste em `tests/database/financial-procurement.sql`,
rodando contra PostgreSQL real com `set role authenticated` e claim JWT.

## Convites

| Ameaça | Defesa |
| --- | --- |
| Reuso de token | `status='invited' and accepted_at is null ... for update` |
| Token expirado | `expires_at > now()` |
| Vazamento do token armazenado | apenas o `sha256` é persistido |
| Troca de identidade do provedor | a organização provedora vem da membresia do chamador, validada por `fin_has_role`; não há caminho em que o corpo escolha por quem responder |
| Convite de si mesmo | `check (buyer_organization_id <> provider_organization_id)` e checagem em `fin_accept_provider_invite` |
| Token de convite de membro exposto | `fin_member_invitations` não tem `SELECT` para `authenticated` |

## Testes de segurança exigidos e onde estão

| Cenário | Arquivo |
| --- | --- |
| Org A não lê org B | `tests/database/financial-procurement.sql` |
| Provider A não lê provider B | idem |
| Provedor não lê concorrente (proposta e versões) | idem |
| `viewer` não altera | idem |
| `organization_id` adulterado falha | `scripts/test-finance-api.mjs` (400/403 sem tocar o banco) |
| `provider_id` / produto adulterado é ignorado | `scripts/test-finance-api.mjs` |
| Campos financeiros privilegiados injetados pelo browser | `scripts/test-finance-api.mjs` e `scripts/test-finance-domain.mjs` |
| Proposta de outra RFQ não pode ser vinculada | chaves compostas + `fin_record_decision` |
| Contrato de outra organização não é acessível | policy `fin_contract_read` |
| Token expirado falha | `tests/database/financial-procurement.sql` |
| Token reutilizado falha | idem |
| Transição inválida falha | idem + `scripts/test-finance-api.mjs` |
| Anon não alcança nenhuma tabela `fin_*` | idem (checagem de privilégio) |
| Duas decisões na mesma RFQ | `tests/database/financial-procurement-hardening.sql` |
| Dois contratos para a mesma decisão | idem |
| Revisão posterior alterando o snapshot da decisão | idem |
| Evidência regulatória sem https ou com data futura | idem |
| Provedor lendo o cadastro interno do comprador após o vínculo canônico | idem |
| Comparação acessada por organização provedora | `scripts/test-finance-api.mjs` |
| Mensagem crua do Postgres chegando ao cliente | idem |

| Token de convite em analytics, referrer, histórico ou log | `tests/e2e/finance-procurement.spec.js` |
| Bypass ou configuração pela metade da allowlist do piloto | `tests/database/financial-pilot.sql` |
| Aceite de termos forjado por escrita direta | idem |
| Evento arbitrário ou termo financeiro pela porta dos sinais | idem + `scripts/test-finance-api.mjs` |
| E-mail enfileirado com token ou condição no payload | `tests/database/financial-pilot.sql` |

O mapa completo de ataques está em [`FINANCIAL_THREAT_MODEL.md`](FINANCIAL_THREAT_MODEL.md).

## Idempotência e concorrência

* Aceitar convite usa `select ... for update` e é idempotente por
  `on conflict (invite_id) do nothing` na criação da proposta.
* Envio de proposta usa `for update` sobre `fin_proposals` e a unicidade
  `(proposal_id, version)` impede duas versões com o mesmo número em corrida.
  Reenvio de termos idênticos é idempotente.
* Decisão e contrato travam a linha que leem (`for update`) e têm índice único
  por RFQ e por decisão: duas requisições simultâneas não produzem duas
  decisões nem dois contratos.
* Transições são `update ... where status = <estado esperado>`: duas abas
  concorrentes não atravessam o mesmo estado duas vezes.

## Logs e PII

Os eventos em `fin_events` carregam tipo de entidade, identificador, tipo de
evento, ator e metadados não sensíveis. Termos financeiros não são registrados
na trilha — há teste de banco que falha se forem.

## Segredos que o produto manipula

| Segredo | Onde existe | Onde nunca existe |
| --- | --- | --- |
| Token de convite de provedor | no fragmento do link e em memória na página | banco (só o `sha256`), log, analytics, referrer, histórico, payload de e-mail |
| Token de convite de membro | na resposta da chamada que o criou | banco (só o `sha256`), qualquer leitura de cliente |
| Chave de serviço do Supabase | não usada pelo domínio financeiro | qualquer caminho financeiro |

## Administração

A vertical não cria nenhum bypass administrativo. Ações sensíveis continuam
sujeitas ao modelo já existente: sessão administrativa, MFA, RBAC, auditoria e
motivo. Nenhuma função `fin_*` concede acesso a `service_role` além do que o
Supabase já concede por padrão, e nenhuma delas aceita "agir como" outro
usuário.

## Isolamento entre entidades do mesmo grupo (multi-entity)

Dentro de uma organização compradora, membros com escopo `entities` só leem e
escrevem objetos das entidades concedidas (e das unidades abaixo delas). A regra
mora no banco:

* **Leitura** — `fin_entity_visible` em todas as policies do lado comprador e na
  busca (`fin_search`, SECURITY DEFINER, reescrita com o filtro em cada ramo),
  em `fin_can_read_document` e em `fin_comment_authors`.
* **Escrita** — gatilhos `BEFORE INSERT/UPDATE` em RFQ, contrato, decisão,
  aprovação (pedido e etapa), convite, tarefa, comentário e documento privado
  chamam `fin_assert_entity_write`. Por estarem nas tabelas, cobrem toda RPC
  existente e futura; não dependem de cada função lembrar a regra.
* **Aprovador** — a etapa só é criada para quem alcança a entidade, e quem perde
  o escopo no meio do fluxo não consegue mais agir.
* **Consolidado** — calculado sobre linhas já filtradas pelo RLS.
* **Mudança de escopo** — só admin do grupo (`fin_set_member_entity_scope`),
  com evento na trilha; administrador nunca é restrito.

Provedores e jobs sem sessão não passam por essa guarda: as RPCs de provedor já
exigem a organização provedora, e o job agendado roda sem `auth.uid()`.

| Cenário | Arquivo |
| --- | --- |
| Membro restrito não lê RFQ, proposta, decisão, contrato, marco, tarefa, convite, evento ou comentário de outra entidade | `tests/database/financial-multi-entity.sql` |
| Escrita fora do escopo via RPC existente (transição, convite, comentário, decisão, tarefa, renovação) | idem |
| Aprovador sem escopo / escopo revogado no meio do fluxo | idem |
| Reatribuição silenciosa de entidade (UPDATE direto) | idem |
| Consolidado do restrito sem contagem de outra entidade | idem + `scripts/test-finance-entities.mjs` |
| Outro tenant, provedor e externo sem acesso a entidades | idem |
| Canário por membro restrito no banco real | `ops/sql/pilot-isolation-canary.sql` |
