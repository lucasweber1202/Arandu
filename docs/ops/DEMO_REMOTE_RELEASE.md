# Demo: política de recuperação proporcional e release remoto

Issue #366. Torna a atualização da Demo canônica (`offgpyysgdhfemjlchod`)
executável pelo GitHub Actions, sem máquina pessoal, sem novo ambiente
permanente e sem serviço pago, **sem relaxar nada fora da Demo**.

## 1. Política (verificável por código)

`lib/demo-recovery-policy.mjs` decide entre dois caminhos, só por fatos conferidos:

| Caminho | Quando | Exige |
| --- | --- | --- |
| `FULL_RECOVERY` | Production, staging, Pilot legado, qualquer dado real ou de classificação desconhecida, qualquer dúvida de identidade | recovery integral da #365 (`scripts/recovery/orchestrate.mjs`: export criptografado, custódia da identidade, restore isolado, drill DB+Storage) — inalterado |
| `DEMO_PROPORTIONAL` | `ARANDU_ENV=demo` **e** conexão do ref Demo (host/usuário/porta 5432) **e** `fin_settings.deployment_environment='demo'` no banco | ensaio remoto do snapshot + preservação do estado não regenerável + lease + autorização |

Não existe flag de bypass: `recoveryPath` ignora qualquer parâmetro extra, e
"demo" com ref de outro projeto, ou banco que se declara `production`, cai em
`FULL_RECOVERY` (testado em todas as combinações).

Classificação (`ops/sql/demo-recovery-inventory.sql`, somente contagens):
todas as contas nos domínios fictícios de `lib/finance/demo-guard.mjs`, todas as
organizações com membros/criador fictícios, nenhum MFA/SSO/identidade externa,
nenhum objeto do Storage fora de organizações fictícias, nenhum bucket público.
Qualquer desvio ⇒ NO-GO (`DATA_UNCLASSIFIED_*`, `AUTH_STATE_NOT_REGENERABLE`,
`STORAGE_*`, `DATA_INVENTORY_INVALID`).

**Estado não regenerável**: workspaces reivindicados válidos (sessões de
visitante e o que criaram). Conteúdo de visitante **não** é descartável só por
estar na Demo. Se existir, o apply exige ciphertext verificado num destino
privado aprovado; senão NO-GO `PRESERVATION_DESTINATION_MISSING`.

## 2. Fluxo remoto (`.github/workflows/demo-release.yml`)

Manual, na `main`, SHA revisado, quatro contextos verdes no SHA, environment
`demo`, concorrência `arandu-demo-pool` (nunca junto do controlador do pool),
sem agenda, sem artifact (repositório público), sem credencial de Production.

| Modo | O que faz | Escreve na Demo? |
| --- | --- | --- |
| `plan` (padrão) | identidade, inventário, política, migrations pendentes e hash do bundle | não |
| `rehearse` | `plan` + snapshot `public` com ACLs (RUNNER_TEMP 0700) → cadeia do gate da #365 (`verify-backup-restore` em PG 17 descartável, mesmo hash) → restore do MESMO arquivo em outro PG 17 descartável com `pgrst.*` do `authenticator` → migrations pendentes aplicadas na cópia → `post-migration-probes` → canário de isolamento → rollback (ordem inversa) → reaplicação → probes | não |
| `apply` | `rehearse` + preservação (se houver sessão válida) + `fin_demo_pool_lease` do release + decisão da política + `release-migrations --apply` com o mesmo backup/evidência (≤ 6 h) + probes + canário; libera o lease | **sim, só com `authorization_reference`** |

Escopo do ensaio, explícito na evidência: schema `public` com dados e
constraints, `auth.users` só com ids (placeholders no descartável). Conteúdo do
Auth e binários do Storage não são restaurados por este ensaio — isso é o
recovery integral. **Ensaio não é recovery hospedado.**

## 3. Correções em mecanismos canônicos

1. `scripts/release-migrations.mjs --apply` terminava em `npm run check:supabase:write`,
   script que **nunca existiu** no repositório: aplicava e depois falhava. Agora roda
   o canário de isolamento real (`ops/sql/pilot-isolation-canary.sql`, o mesmo de `pilot:canary`).
2. `makeExec` (#365) passou a logar só stderr (stdout é dado de trabalho, ex.: schema).
3. O snapshot do gate carrega ACLs; `verify-backup-restore` continua restaurando
   sem ACL (inalterado), e o ensaio restaura o mesmo arquivo com grants fiéis — sem
   isso a cópia herdava `EXECUTE` para `PUBLIC` e o probe de ACL (corretamente) reprovava.

## 4. Preservação: destino privado (bloqueio atual)

O repositório `lucasweber1202/Arandu` é **público**: artifacts e releases dele
não servem para backup, nem cifrado. Destino suportado sem custo novo:
**release draft num repositório GitHub privado do owner** (repositórios privados
são gratuitos). O workflow envia `age` cifrado para a chave **pública**, relê o
asset e compara o sha256; o snapshot cifrado nunca é decifrado em CI.

Configuração mínima (owner, uma vez):
1. Criar um repositório privado vazio, ex.: `lucasweber1202/arandu-demo-snapshots`.
2. Gerar uma identidade age na máquina do owner (`age-keygen -o ~/arandu-demo.age`),
   guardar offline; publicar **só** o destinatário `age1…` na variável
   `ARANDU_DEMO_BACKUP_RECIPIENT` do environment `demo`.
3. Variável `ARANDU_DEMO_BACKUP_REPOSITORY=lucasweber1202/arandu-demo-snapshots`.
4. Secret `ARANDU_DEMO_BACKUP_TOKEN`: fine-grained token com acesso **apenas** a esse
   repositório, permissão Contents: read/write, validade curta.
5. Secret `ARANDU_DEMO_DATABASE_URL` no environment `demo` (Session pooler 5432).

Verificar a recuperação do ciphertext (sem chave em CI): na máquina do owner,
`age -d -i ~/arandu-demo.age snapshot.dump.age > snapshot.dump` e o restore
isolado do recovery integral (`docs/ops/RECOVERY_ORCHESTRATOR.md`). Até isso
ser feito, o ciphertext é "preservado e íntegro", não "restore comprovado".

Alternativa sem destino: aplicar quando **não houver sessão válida** (a política
calcula `claimed_valid` e a próxima expiração). A reconstrução canônica
(seed/manifesto) é elegível como recuperação somente com estado não regenerável
ausente ou preservado e aprovação do owner para janela e risco
(`reconstructionEligibility`); nunca equivale ao restore do snapshot e não é
executada por este fluxo.

## 5. Proteções por migration

| Migration | Toca | Auth/Storage | Proteção adicional |
| --- | --- | --- | --- |
| `invite-integrity` | funções de convite, marcador | não altera dados | ensaio + probe de ACL |
| `demo-pool-integrity` | 2 colunas aditivas em `fin_demo_workspaces`, funções de jobs escopados, corpos de 4 processadores | lê `auth.users.email` (escopo) | ensaio + canário; sessões claimed intactas (provado: hash de `fin_demo_workspaces`) |

Nenhuma reescreve dados de usuário, Auth ou Storage: o snapshot `public` +
ensaio cobre o risco; Auth/Storage não exigem preservação adicional para estas duas.

## 6. Testes e evidências (locais; nada hospedado)

- `node scripts/test-demo-recovery-policy.mjs` (em `check:staging`): Production/staging
  sempre `FULL_RECOVERY` em todas as combinações, classificação fail-closed, NO-GOs
  específicos, reconstrução não equivalente, CLI recusa antes de conectar, workflow manual
  em `plan`, sem artifact e sem credencial de outro ambiente.
- `npm run test:demo:release:real` (Docker; **36 s** medidos aqui): PostgreSQL 17
  Supabase + GoTrue `auth migrate` + Storage-API descartáveis; "Demo" fictícia em
  `financial-arandu-10-1` com baseline, visitante com sessão válida e atividade, Storage
  privado. `plan` → `DEMO_PROPORTIONAL` com as 2 pendentes; `rehearse` 6/6 PASS sem
  alterar a origem; NO-GO para sessão válida sem destino, lease de outro controlador,
  evidência vencida/trocada/incompleta, schema de origem diferente, autorização inválida,
  conta desconhecida e banco não Demo; `release-migrations --apply` **real** com o mesmo
  backup aplicou as 2 migrations com baseline, visitante, sessão e Storage
  byte-idênticos; backup alterado recusado.
- `npm run test:recovery:orchestrator:real`: cadeia da #365 inalterada (restore parcial/truncado recusado).

## 7. Custo

- GitHub Actions: runners padrão são gratuitos para repositórios públicos.
  Estimativa por execução `rehearse`/`apply`: 5–10 min (apt do cliente PG 17 e
  pull da imagem ≈ 2–3 min; dump/restore da Demo dependem do tamanho real, **não
  medido no hospedado**). `plan` ≈ 1–2 min.
- Supabase Demo: egress do `pg_dump public` uma vez por execução (no ensaio local
  com schema completo, ~1,9 MiB; a Demo real terá mais dados — medir no primeiro `plan`).
- Repositório privado do owner para ciphertext: gratuito; cada snapshot ocupa o tamanho do dump cifrado.
- Não prometemos custo zero além disso sem medir a primeira execução.

## 8. Intervenções do owner (mínimo)

1. Uma vez: secret `ARANDU_DEMO_DATABASE_URL`; e, se quiser aplicar com sessões de
   visitante válidas, o destino privado do §4.
2. Por release: disparar `plan`, depois `rehearse`, depois `apply` com o SHA revisado e
   uma `authorization_reference` (ex.: link do comentário de aprovação na issue).
3. Recuperação definitiva do pool (§9): um `maintain` manual depois do apply.

## 9. Recuperação do pool depois do apply

1. `apply` concluído (`schema_version = financial-demo-pool-integrity-1`).
2. Workflow do pool, `maintain` manual (dry-run é automático). O `provisioning`
   interrompido (sem heartbeat, anterior a esta versão) é limpo após 6 h pela regra
   de fallback; claimed válidos nunca são removidos.
3. Conferir no resumo: `ready_deficit: 0`, `provision_failed: 0`.
4. Agenda (`ARANDU_DEMO_POOL_AUTOMATION_ENABLED`) continua desligada até aprovação.

## 10. Handoff para o Modo Work

1. Validar esta PR (quatro gates no HEAD) e o merge.
2. Conferir o secret/variáveis do §8.1 (sem ler valores).
3. Disparar `plan`: anexar o resumo (sem segredos) à issue #366.
4. Se `plan` OK, `rehearse`; registrar `snapshot sha256`, checks e decisão.
5. NO-GO `PRESERVATION_DESTINATION_MISSING` com sessões válidas: ou configurar §4,
   ou aguardar a janela sem sessão válida (próxima expiração no relatório).
6. `apply` só com autorização explícita do owner registrada; depois §9.
