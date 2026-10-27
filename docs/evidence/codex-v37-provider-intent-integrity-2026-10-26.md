# Cadastro recuperável de instituições — 26/10/2026

## Base e ownership

Base reconciliada: `71c6398534ad9199ffca9150ade2cc137395f63c`. Merges #275
(`7aeb08d`), #276 (`ef056e7`) e #277 (`71c6398`) confirmados com
`git merge-base --is-ancestor`; nenhuma PR aberta na reconciliação. CI da #277,
run `40389490494`, SUCCESS. Checkout original `fa551c0` preservado; trabalho no
worktree exclusivo `arandu-codex-provider-integrity`, branch
`codex/v37-provider-intent-integrity`. Implementação: `f1bbdd5` (commit anterior
à evidência). HEAD publicado e gates devem ser lidos na PR; o CI da base não
valida este incremento.

Nenhum arquivo reservado ao Claude, guideline ou Implementation Matrix foi
alterado. `contract-center.js` é a interface livre; `company.js` permanece
reservado. Não se refez a integração contratual da #277.

## Problema reproduzido e contrato

O fluxo de contrato existente recuperava uma instituição cuja resposta se perdeu
procurando um nome equivalente no overview carregado. Esse recorte não é recibo
nem prova de identidade. O novo fluxo consulta exclusivamente a intenção.

`POST /api/finance/providers` aceita `request_key` UUID. Chave ausente mantém o
POST legado, agora pela mesma RPC autorizada, com resposta `{ok,row,id,state,
replayed}` compatível com clientes que leem `row`. Criação: HTTP 201; replay:
HTTP 200. O servidor normaliza campos, calcula SHA-256 de organização, ator e
payload material, serializa a intenção e grava contraparte + recibo + auditoria
na mesma transação. Mesma chave/ator/organização e mesmo payload retorna o mesmo
ID; conteúdo divergente recebe HTTP 409 `provider_creation_conflict`. Duas chaves
distintas podem criar contrapartes homônimas; não há deduplicação nominal.

`GET /api/finance/provider-creation-result?organization_id=<uuid>&request_key=<uuid>`
usa o JWT do usuário, restringe organização BUYER e ator original, e retorna:

| Estado | Significado / ação segura |
|---|---|
| `confirmed` | Recibo persistido; `id` e `row` são a contraparte autorizada. |
| `pending` | Lock de outra transação ainda ocupado; conferir novamente, sem inferir resultado. |
| `unconfirmed` | Sem recibo visível neste instante; NÃO prova rejeição. Pode reenviar o mesmo payload e chave. |
| `rejected` | Semântica de recusa definitiva da tentativa HTTP (400/403/409), não um recibo persistido. Um 409 pode corresponder a uma intenção anterior já confirmada. |

Falha de rede, resposta ilegível ou 5xx significa resultado incerto. Nunca se
conclui que nada foi criado com base nisso. 401 exige restaurar a sessão e
conferir; 403 impede novas ações; indisponibilidade de schema continua 503
`schema_incompatible`, conforme o sanitizador existente. Não se retorna SQL,
constraint ou payload em mensagens de erro/auditoria.

A instituição continua contraparte cadastrada pelo comprador, com
`provider_organization_id = null` e `NAO_VERIFICADO`. A operação não cria convite,
participação, proposta, identidade institucional ou conexão bancária.

## Persistência, autorização e operação

Migration canônica aditiva `docs/supabase-financial-provider-intent-integrity.sql`,
registrada imediatamente após a #277 nos dois fluxos do manifesto. Marker:
`financial-provider-intent-integrity-1`. Recibo fica em `fin_providers`:
`creation_request_key`, `creation_request_hash`, mais `created_by` já existente.
Índice único parcial `(organization_id,created_by,creation_request_key)` e guarda
de imutabilidade; sem tabela/PII adicional. A classificação/retention/export/hold
existente de `fin_providers` (`BUSINESS_RECORD`, archive, export providers) continua
aplicável ao recibo pelo mesmo período de vida da contraparte.

As RPCs têm `search_path=''`, permissões explicitamente fechadas para PUBLIC,
anon e service_role; somente as duas entradas públicas concedem EXECUTE a
`authenticated`. Helper de ator é interno. Só admin/finance_manager de BUYER
criam. Consulta exige membro atual e o ator original. O lock de intenção vem
ANTES da revalidação e dos locks compartilhados de membro/usuário: uma revogação
confirmada enquanto a tentativa esperava impede a escrita. Contas banidas e
organização em offboarding são recusadas. Escopo de contraparte continua por
organização; não se inventa escopo de entidade para um objeto global do buyer.
RLS, FORCE RLS e grants de coluna preexistentes são preservados.

Rollback `docs/rollback/supabase-financial-provider-intent-integrity.rollback.sql`:
recusa ordem invertida e qualquer recibo material; antes de uso remove somente a
camada nova e restaura o marker anterior. Após uso, forward-fix. Nenhuma migration
remota foi aplicada. Doctor exige as duas RPCs novas, probes conferem RLS/FORCE,
gatilho e privilégios; canário e backup preflight reconhecem o marker. O runner
remove a camada mais nova antes de reensaiar migrations históricas, sem fingir
que seus markers antigos representam o schema final.

## Interface e handoff para company.js

No cadastro dentro do contrato: uma chave por intenção, payload preservado após
falha, conferir recibo, esperar `pending`, retry com mesma chave após
`unconfirmed`, conflito explícito, sessão expirada e permissão negada recuperáveis,
ID confirmado reaproveitado no contrato. Mudança de organização bloqueia o
formulário antigo. Nenhuma busca por nome confirma a operação.

Handoff do cadastro reservado em `company.js`: criar UUID uma vez antes do POST,
conservar chave + organização + payload normalizado enquanto houver resultado
incerto; usar o GET acima; não buscar homônima nem gerar outra chave no retry.
Só liberar edição/nova intenção com transição explícita após conferir o resultado;
401 preserva preenchimento, 403 bloqueia, 409 exige conferir a intenção original.
O POST legado permanece disponível, mas cliente sem chave não recebe garantia de
retry idempotente. O drawer atual não promete recuperação após fechar/reabrir ou
recarregar o navegador; persistência de rascunho entre sessões é trabalho separado.

## Validação e limites

- Node 24.19.0 e `npm ci --include=optional`.
- `check:all`, API mockada, migrations/security, doctor, preflight e `audit:ci` PASS.
- Builds financeiro/Demo e budgets PASS, sem mudar limites. RFQ desta branch
  permanece 247.792 / 249.664 B; sua otimização é independente na frente B.
- PostgreSQL 16.15 exclusivo sem rede: replay normalizado, conflito, homônimas,
  legado, grants, RLS/FORCE, auditoria, ator/tenant/provider/analyst/viewer negados,
  conta banida, offboarding, recibo imutável, oito retries, consulta pendente e
  revogação DURANTE espera do lock PASS nos testes direcionados.
  A camada nova também passou integralmente em clean, upgrade e fresh, com
  rollback/reapply, SQL, concorrência e canário em cada banco.
- Browser com APIs simuladas: contratos Chromium desktop + Pixel 7: **148 PASS**,
  incluindo pending/503/401/403/unconfirmed/retry e conflito. Isto não é prova de
  Auth/Storage real. Lista desktop completa: 316 PASS / 5 SKIP / 1 timeout;
  o único timeout passou isoladamente com os mesmos asserts (1 PASS). O comando
  amplo não é relatado como verde. O runner canônico completo final é registrado
  na PR após conclusão; não confundir tentativa interrompida com PASS.
- A primeira regressão ampla de navegador sofreu contenção com duas suítes
  simultâneas e parou em timeouts; reexecução usa dois workers e servidor exclusivo,
  sem aumentar timeout nem retirar asserts.
- Firefox/WebKit locais NOT_RUN; dependem dos gates publicados.
- M3/M5 não promovidos; nenhum seed/reset, dado, segredo, assignment, migração,
  restore ou deployment hospedado foi modificado. Sem merge automático.

## Revisão complementar: não herdar a contraparte anterior

Após os quatro gates verdes da revisão `6daf537`, a revisão final reproduziu um
caso adicional: criar a instituição A, receber recusa do contrato, voltar e escolher
"Cadastrar nova instituição" para B. O estado local ainda mantinha o ID de A e
podia enviar o segundo contrato para a contraparte anterior. O E2E novo falhou
antes da correção (um POST de instituição, dois POSTs de contrato com o ID antigo).

A escolha explícita no seletor agora invalida o ID e a intenção de contraparte do
contexto anterior. A continua cadastrada e visível nas opções; escolher criar B
abre outra intenção, com outra chave e seu próprio ID. Falha incerta não libera
essa troca silenciosa: a recuperação pelo mesmo recibo continua igual.

Reprodução: 1 FAIL antes do patch; cenários de instituição/recibo/conflito/troca
corrigidos em desktop e Pixel 7: 8 PASS, sem mudar assertions ou tempos. O
`deploy:check` completo passou depois da correção. A suíte completa de contratos
passou antes do push: 150/150 em Chromium desktop e Pixel 7. Esta mudança não altera backend, SQL, permissões ou
migrations. Os quatro verdes de `6daf537` são históricos; a revisão nova permanece
draft até os quatro gates no novo HEAD. Um segundo push é necessário por este
defeito material reproduzido, não para alterar critérios ou reexecutar CI sem código.
