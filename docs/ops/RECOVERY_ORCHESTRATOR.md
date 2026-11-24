# Recovery orquestrado da Demo (backup, restore descartável e gate de release)

Procedimento único que encadeia os mecanismos canônicos de recovery e prepara
a aplicação autorizada das migrations pendentes na Demo
(`offgpyysgdhfemjlchod`). **Não aplica migration, não escreve no projeto
hospedado e não toca Production.**

## 1. Onde executar (diagnóstico do executor)

| Executor | Docker | PG 17 | age | Disco persistente | Custódia da identidade | Credencial admin | Veredito |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sessão cloud do Claude Code | sim | instalável | sim | **não** (efêmero) | **não** | não deve receber | só para desenvolver e testar com dados sintéticos |
| Modo Work (relato de 24/11) | não | não | não | não | não | não | inadequado |
| GitHub Actions hospedado | sim | instalável | instalável | **não** | **proibido** (identidade nunca em CI) | via secret | inadequado para a identidade |
| **Windows + WSL2 (Ubuntu 24.04) do responsável** | Docker Desktop ou docker.io | PGDG | apt | sim (ext4 do WSL) | sim (máquina do responsável + cópia offline) | entrada oculta | **recomendado** |

O `check` do orquestrador não consegue provar que um disco é persistente: o
controle é o **atestado explícito** (`PERSISTENTE`) antes de criar o store, as
recusas de `/tmp`, do repositório e de `/mnt/c` (sem permissão 0700 real) e o
aviso de que desinstalar a distribuição apaga o disco do WSL.

## 2. Como executar (responsável)

1. Baixe `scripts/recovery/Start-AranduRecovery.ps1` da `main` revisada.
2. No PowerShell (usuário comum):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\Start-AranduRecovery.ps1 -ReviewedSha <SHA da main revisada>
   ```
   Ele verifica Windows/WSL2, oferece instalar o Ubuntu 24.04, clona o repositório
   **dentro** do WSL no SHA revisado e chama o bootstrap.
3. O bootstrap (`scripts/recovery/wsl-bootstrap.sh`) pergunta antes de instalar
   cada item (openssl, age, `postgresql-client-17` do PGDG, Docker, Node 24 via
   nvm), cria `~/arandu-recovery/{store,keys}` com 0700 e roda o diagnóstico.
   `--check-only` só diagnostica.
4. O orquestrador (`node scripts/recovery/orchestrate.mjs run`) executa as etapas
   e para nas intervenções abaixo.

Já com WSL pronto: `bash scripts/recovery/wsl-bootstrap.sh --expect-sha=<SHA>`.

## 3. Intervenções humanas (mínimo)

1. Iniciar o launcher.
2. Autorizar instalações (uma confirmação por ferramenta ausente; `sudo` pede a senha do Linux).
3. Colar, em **entrada oculta**, a conexão PostgreSQL da Demo (Session pooler ou
   direct, **porta 5432**, usuário `postgres.offgpyysgdhfemjlchod`) e a chave `service_role` da Demo.
4. Digitar `PERSISTENTE` para atestar o store.
5. Autorizar a geração da identidade age (`SIM`) e **guardar uma cópia offline**
   fora do computador; digitar os 6 últimos caracteres do fingerprint.
6. Digitar `EXPORTAR` para autorizar o export (somente leitura na origem).

Credenciais nunca vão em argumento (recusadas), nem para log, evidência ou histórico.

## 4. Etapas e mecanismos reutilizados

| # | Etapa | Mecanismo canônico | Falha |
| --- | --- | --- | --- |
| 1 | requisitos | `orchestrate check` | para antes de pedir credencial |
| 2 | credenciais | entrada oculta + `demoConnectionProblems` + forma da `service_role` | projeto/porta/chave errados |
| 3 | origem | leitura `begin read only`: `deployment_environment=demo`, PG 17, marcador | origem não Demo |
| 4 | store | `recovery:store:init --attest-persistent` | sem atestado |
| 5–6 | identidade e custódia | `recovery:key:prepare` (ida e volta) + confirmação | cripto ou custódia |
| 7 | preflight | `recovery:doctor --export` | bloqueio do doctor |
| 8 | export | `recovery:export:private` | export |
| 9 | Storage | `recovery:storage:export` (se houver objetos) | Storage |
| 10 | integridade | `recovery:verify` | hash/tamanho divergente |
| 11 | restore isolado | `recovery:restore:verify` em PG 17 Supabase loopback descartável | restore |
| 12 | DB + Storage | `pilot:restore:drill` com binários do Storage | drill |
| 13 | gate de release | `pg_dump public` + `backup:restore:verify` + `release-migrations --dry-run` | evidência divergente |

Evidência sanitizada: `reports/recovery-orchestration.json` (0600) e cópia no store.

## 5. Compatibilidade com os gates de release (corrigida nesta entrega)

O `--apply` de `scripts/release-migrations.mjs` exige `ARANDU_BACKUP_PATH`
(dump `public` ≤ 6 h, fora do repositório), seu SHA-256 e
`reports/backup-restore-verification.json` de `verify-backup-restore.mjs`
com as mesmas referências e ≤ 6 h. O export criptografado do recovery **não**
satisfaz isso (formato e escopo diferentes); por isso a etapa 13 produz a cadeia
exigida. Três defeitos reais do `verify-backup-restore` impediam o gate em
qualquer banco Supabase com usuários, comprovados com o schema canônico completo:

1. **FK para `auth.users` fora do escopo `public_schema`** — o restore falhava
   (`fin_organizations_created_by_fkey`). Correção: num alvo Supabase descartável,
   restore em seções (pre-data, data), criação de `auth.users` **só com o id** dos
   usuários referenciados pelas FKs lidas do próprio backup
   (`ops/sql/restore-auth-reference-stubs.sql`; 144 FKs, 1 placeholder no ensaio)
   e post-data com todas as FKs criadas e validadas. Registrado como check
   `auth-references-stubbed`. Alvo sem `auth.users` (staging) mantém o caminho anterior.
2. **`ENOBUFS`** ao ler o schema real (> 1 MiB). Buffer ampliado para 256 MiB.
3. **Fingerprint textual instável**: o PostgreSQL re-deparsa `CHECK` com `BETWEEN`
   (parênteses redundantes) ao recarregar. O orquestrador calcula o esperado a
   partir do schema da **própria origem após ida e volta num PG 17 descartável sem
   dados**; a origem crua também é registrada. Restore parcial continua divergindo.

Referências auditáveis são derivadas do artefato (`demo-public-backup-<UTC>-sha256-<16 hex>`),
nunca inventadas; nenhum timestamp é ajustado. A janela de 6 h começa no backup:
a aplicação autorizada precisa acontecer dentro dela (o relatório mostra `valid_until`
e o comando exato, com a conexão como `<entrada oculta>`).

## 6. Testes

- `npm run test:recovery:orchestrator` (em `check:staging`): caminho feliz e 24
  falhas seguras — dependência ausente, store em `/tmp`/repositório/`/mnt/c`,
  credencial inválida, projeto legado, transaction pooler, chave anon/de outro
  projeto, origem não Demo, senha errada, store sem atestado, falha de
  criptografia, custódia, export não autorizado, doctor, export, Storage, hash
  divergente, integridade, restore, drill, evidência divergente, evidência vencida
  (gate canônico) — nada posterior roda, alvos descartáveis sempre removidos,
  segredo nunca em argv/evidência. Simulado (exec/prompt/docker injetados).
- `npm run test:recovery:orchestrator:real` (Docker + clientes PG 17): origem
  PG 17 Supabase descartável com **todo o manifesto canônico** e dados sintéticos,
  `pg_dump public` (~1,6 MiB), `verify-backup-restore` real em outro PG 17
  descartável, aceitação pelas inspeções exatas do `--apply`, e recusa de
  adulteração, referência trocada, evidência vencida e dump truncado.
- Não executado: o procedimento contra a Demo hospedada (exige o executor do
  responsável e credenciais) e o launcher em Windows real (sem Windows nesta sessão).

## 7. Handoff para o Modo Work

1. Merge desta PR com os quatro gates verdes no SHA exato.
2. Responsável roda o launcher com esse SHA; o Work acompanha a evidência
   sanitizada `reports/recovery-orchestration.json` (sem segredos).
3. Com `result: passed` e dentro de `valid_until`, a aplicação das migrations é
   uma **operação separada e autorizada**, executada pelo responsável no mesmo
   executor com o `apply_command` do relatório (a conexão é pedida de novo, oculta).
4. Depois: `ops/sql/post-migration-probes.sql`, canário de isolamento, e só então
   `node scripts/demo/workspaces.mjs maintain --dry-run` e um `maintain` manual.
