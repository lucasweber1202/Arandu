# API de tarefas e reconciliação operacional M3

Data: 16/10/2026 (America/Sao_Paulo). Branch isolada
`codex/m3-operational-hardening-20261016`; base revalidada
`origin/main@8d1a18d39d0d5b72bdd5c8382d3240012f6d30e5`. Nenhum arquivo sob
ownership do Claude foi modificado. Nenhuma migration, banco hospedado,
atribuição ativa, secret ou deployment foi alterado.

## Reconciliação da main e da hospedagem

No SHA `8d1a18d39d0d5b72bdd5c8382d3240012f6d30e5`, GitHub concluiu com SUCCESS
os quatro gates `database`, `deploy-boundaries`, `validate` e `presentation`,
além do `merge-audit`. Não havia PR aberta ao consultar GitHub. Os status de
deployment associados ao SHA foram Demo SUCCESS, Pilot SUCCESS e Official
FAILURE. Os status não vinculam datasource, alias ou schema.

A listagem read-only do Supabase continua mostrando somente legado
`igacnfjeuqhxcmfyepgj` e Pilot `offgpyysgdhfemjlchod`; nenhum projeto Demo foi
listado. No Pilot, a consulta agregada de catálogo confirmou: três migrations
registradas até `financial_pilot_surface_hardening`; `fin_tasks.assignee_id`
ausente; marker `deployment_environment` ausente; `fin_request_session_guard()`
ausente; `pgrst.db_pre_request` ausente; zero tabelas públicas sem RLS; zero
usuários Auth, fatores MFA e objetos Storage. O único bucket listado,
`fin-documents`, é privado, limite 10 MiB, allowlist PDF/JPEG/PNG/XLSX/DOCX;
zero policies no schema Storage foram observadas. Isso é inventário de catálogo,
não prova comportamental de Auth, Storage, revogação ou isolamento.

Consultas detalhadas da Vercel no scope `lucas-projects467` continuam em 403.
Não foi tentado outro scope nem bypass. Os dois canários públicos da Demo não
puderam ser reconsultados: o proxy de rede do executor recusou conexão ao
proxy `8080`. Build logs, domínios, variáveis por nome/escopo e datasource do
deployment permanecem `ACCESS_BLOCKED`/`INCONCLUSIVE`. O motivo hospedado do
Official FAILURE não foi determinado. Nenhuma hipótese de build ou env é
apresentada como causa comprovada.

### Official: guarda fail-closed versus causa hospedada

`ACTIVE_SUPABASE_ASSIGNMENTS.demo` e `.production` continuam vazios, conforme a
topologia. Foram feitos ensaios locais com refs sintéticos conhecidos, sem
credenciais reais:

- Production sem `ARANDU_ENV` termina antes do build com exit 1 e a mensagem
  `deploy interrompido`.
- Production declarada com ref Pilot ou legado é recusada por
  `check-finance-env`; com ref legado a mensagem instrui a conclusão de recovery
  e cutover antes da atribuição.
- O status de deployment Official FAILURE é observado no GitHub, mas não há
  log autorizado que prove que a falha hospedada foi causada por esse guard.

O fail-closed é o comportamento esperado. Não removi/alterei assignments nem
configuração para buscar build verde.

## Defeito reproduzido e correção — PATCH de tarefa

Antes da correção, `PATCH /api/finance/tasks` enviava `Prefer: return=representation`
e ignorava o corpo retornado. PostgREST pode responder HTTP 200 com `[]` quando
RLS oculta o objeto, o ID não existe ou uma exclusão concorrente vence. O
handler então devolvia HTTP 200 `{ ok: true }`, embora nenhuma tarefa tivesse
sido atualizada.

O novo teste foi executado primeiro contra a implementação antiga e falhou com
`Missing expected rejection` (`scripts/test-finance-api.mjs`, fixture de PATCH
com HTTP 200 e representação vazia). Agora o handler exige uma representação
com ao menos uma linha antes de confirmar sucesso. Resposta vazia resulta em
HTTP 404, código estável `not_found` e mensagem neutra “Tarefa não encontrada
ou sem acesso para esta conta.”. Tarefa de outro tenant/entidade invisível,
inexistente e removida durante a requisição têm o mesmo resultado; nenhum
identificador, membership ou detalhe de RLS é devolvido. Uma representação
presente continua retornando HTTP 200.

### Erros de atribuição

Ator sem permissão permanece em `403 task_assignment_forbidden`, com a mensagem
neutra existente; o lookup do papel continua restrito à própria organização e
usa o JWT do chamador. Um `invalid task assignee` gerado pela validação no banco
agora é `403 task_assignee_unavailable`, com mensagem “Responsável indisponível
para esta tarefa.”. O código não diferencia pessoa inexistente, removida,
papel ou escopo, e a validação SQL continua sendo a autoridade atômica.

## Contrato aditivo de filtros e paginação

`GET /api/finance/tasks` preserva `ok` e `rows` e aceita:

- `status=open|done|cancelled`;
- `assignee_id=<UUID>` ou `unassigned=true` (mutuamente exclusivos);
- `limit=1..200` e `cursor=<cursor>` para paginação.

A resposta acrescenta `page: { limit, has_more, next_cursor }`; não calcula nem
expõe total global. A leitura pede `limit + 1` para obter `has_more`, ordena por
`due_on ASC NULLS LAST, created_at ASC, id ASC` e usa cursor keyset sobre esses
campos, incluindo o ramo `due_on IS NULL`. O cursor é entrada não confiável e
validada; seu conteúdo só restringe a consulta que continua sujeita a membership,
organização e RLS. Para continuar a mesma página lógica, o cliente repete os
mesmos filtros. A busca de nomes `assignee_name` acontece apenas para os IDs de
linhas que RLS retornou, sempre dentro da organização validada.

Clientes atuais que ignoram `page` continuam recebendo `rows` e o limite padrão
de 200. A interface pode adotar os filtros e consumir `next_cursor` quando
precisar paginar; não houve edição visual nem E2E nesta PR. Filtros que não
encontram tarefas não consultam/enumeram memberships.

## Validações

- `npm ci --include=optional`: PASS.
- `node scripts/test-finance-api.mjs`: PASS; cobre regressão vazia, alterações
  permitidas, erro de permissão de status, assignment autorizado/negado,
  responsável inelegível, filtros e cursors não-nulo/nulo, inválido e limites.
- `npm run check:backend`: PASS.
- `npm run check:migrations`: PASS; não houve mudança SQL nem de manifesto.
- `npm run check:security`: PASS.
- `npm run build`: PASS.
- `git diff --check`: PASS.
- `npm run check:finance`: FAIL antes de completar em
  `scripts/test-finance-env.mjs:29`; o fixture recebeu `stderr` vazio de um
  subprocesso em vez de `/projeto legado de arte/`. As suítes anteriores do
  comando passaram; checagem direta local reproduziu a mensagem de bloqueio
  fail-closed. Não alterei guard ou teste.
- `npm run check:all`: FAIL na primeira etapa
  `scripts/test-deploy-release-separation.mjs:38`; fixture recebeu `stderr` vazio
  em vez de `/deploy interrompido/`. A simulação direta do build sem
  `ARANDU_ENV` imprimiu a recusa esperada. Nenhum guard/teste dessa fronteira foi
  alterado.
- `npm run test:database`: BLOCKED antes dos testes de banco; `psql` não
  instalado. Docker está instalado, mas o daemon retorna `permission denied` em
  `/var/run/docker.sock`. Não há conexão PostgreSQL descartável independente e
  não tentei qualquer base compartilhada ou hospedada.
- `npm run audit:ci`: BLOCKED/sem resultado; o endpoint de audit do npm falhou
  ao conectar pelo proxy (`EPERM`). `npm ci` usou o lockfile; o audit não foi
  inferido a partir disso.
- `test:e2e`/browser: NOT_RUN, fora do ownership desta API e sem mudança visual.

## Segurança, dados, rollback e maturidade

Não houve SQL, migration, grants, RLS ou mudança de dados. RLS/RBAC e os guards
de assignment seguem intactos; erros de membership não são projetados em lista.
`fin_events` permanece responsabilidade das triggers transacionais existentes;
a API só confirma a alteração depois de receber a representação da linha.

Rollback é simples e não afeta dados: revertendo os arquivos da API e do teste,
restaura-se o comportamento anterior; não existe rollback SQL. O risco residual
é a integração de filtros pelo cliente e a limitação local de PostgreSQL/CI
completo. Os gates da main atual passaram, mas isso não valida este novo HEAD.
Nenhum dado/ambiente hospedado foi testado nesta rodada; M3 continua não
comprovado.

## Handoff ao Claude

- `GET /api/finance/tasks?organization_id=…&status=open&assignee_id=…&limit=50`
  aplica filtros no servidor sob RLS.
- Troque `assignee_id` por `unassigned=true` para fila sem responsável.
- Continue usando `rows`; para paginar, envie `cursor=page.next_cursor` e repita
  os mesmos filtros. Não use `page` como contagem total.
- PATCH bem-sucedido mantém HTTP 200; objeto invisível/ausente/removido devolve
  404 `not_found`. A pessoa sem poder continua 403
  `task_assignment_forbidden`; responsável sem elegibilidade é 403
  `task_assignee_unavailable` sem detalhes do motivo.

PR, quatro gates no SHA desta branch e `merge:gates` serão registrados após o
push. Não houve merge.
