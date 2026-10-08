# Governança do repositório — Financial Procurement

## Proteção da branch `main` — `OWNER_ACTION_REQUIRED`

> Observação de 08/10/2026: `main@296b0357`, `protected: false`, rulesets `[]`.
> O repositório agora é público: a antiga restrição de plano para repo privado
> não é o blocker atual. O conector continua sem administração (403).
> As regras abaixo continuam pendentes; não são proteção já aplicada.

`npm run governance:live` verifica a API real, somente leitura. Exige identidade
main/SHA, protected=true e uma política completa sem bypass: PR, quatro checks
vinculados ao GitHub Actions, base atual, conversas resolvidas, sem force push
ou deletion. Ruleset versionada, evaluate, aplicação em outra branch, ausência
de leitura ou bypass não passa. O relatório sanitizado em
`reports/live-governance.json` é invalidado antes da consulta. Em executores com
proxy Node 24, usar `node --use-env-proxy scripts/check-live-governance.mjs`.
O comando detecta configuração; **não aplica proteção nem bloqueia o botão de
merge no GitHub**. `merge:gates` e merge-audit continuam necessários.

**Não foi possível configurar nem sequer ler as regras de proteção a partir
desta sessão.** Tentado novamente nesta rodada, com o mesmo resultado. A API
respondeu, nas duas tentativas:

```
GET /repos/lucasweber1202/Arandu/branches/main/protection
403 — "Resource not accessible by integration"
```

Isso é uma limitação de permissão do token desta integração, não uma escolha.
Nada foi alterado, e nada abaixo deve ser lido como "já configurado".

### O que ativar, em Settings → Branches → Add branch protection rule

Branch name pattern: `main`

| Toggle | Valor | Por quê |
| --- | --- | --- |
| Require a pull request before merging | ligado | impede push direto na `main` |
| Require approvals | 0 no mantenedor único; 1 com segundo revisor | alinhado ao template main.json; GitHub não permite aprovar a própria PR |
| Dismiss stale pull request approvals when new commits are pushed | ligado | aprovação não sobrevive a um push novo |
| Require status checks to pass before merging | ligado | é o item que faltava: a PR #64 foi mesclada com o job `validate` ainda em execução |
| → Required status checks | `validate`, `database`, `deploy-boundaries`, `presentation` | os quatro jobs do `Arandu CI` |
| Require branches to be up to date before merging | ligado | evita merge verde contra base velha |
| Require conversation resolution before merging | ligado | nenhum comentário aberto some no merge |
| Do not allow bypassing the above settings | **ligado** | aplica os quatro gates também ao administrador; incidente exige procedimento explícito |
| Allow force pushes | desligado | histórico da `main` não é reescrito |
| Allow deletions | desligado | a `main` não pode ser apagada |

Regra atual: `main` é a única branch longa de produto e não tem bypass permanente; `pilot` está congelada (histórica) e mantém a ruleset só para não ser apagada/reescrita antes da confirmação da transição. A orientação histórica de emergência abaixo foi substituída por `BRANCH_PROTECTION.md` (originalmente pelo addendum v2.1, hoje histórico; a Guideline v3 §23.5 mantém a regra). Exceções precisam de incidente documentado. Em 05/10 ambas continuam `protected=false`; nada foi configurado pelo conector.

### Por que isso importa — agora com duas ocorrências

A PR #64 foi mesclada com o job `validate` ainda em execução. A PR #65 também.
Nos dois casos o run seguinte na `main` ficou verde, mas isso é sorte
observada duas vezes, não um controle. `validate` é o job que roda a suíte E2E
nos cinco navegadores e leva cerca de vinte minutos; ele é exatamente o que
"Require status checks" existe para esperar.

Enquanto a regra não existir, a recomendação operacional é simples: **não
mesclar antes de os quatro jobs fecharem**, e conferir na aba Actions.

## Incidentes de governança de merge

Registro factual, sem culpa individual (modelo de `FINANCIAL_INCIDENT_POSTMORTEM.md`).
Classe: **merge governance incident** — não é falha do produto.

### MGI-2026-10-06-01 — #135 "merged" fora da linha de produto; #131–#135 sem gates executados

| Campo | Fato |
| --- | --- |
| PR | #135 Financial Spend, base `codex/provider-performance` (branch da #134), HEAD `e7449477f32b1153125cfd03c2445df99556b0fe` |
| Merge | `99c6f85ed81bb5b7db07b12638e2591f1e59f0ad` em `codex/provider-performance` — **não** em `pilot` nem `main` |
| Efeito | GitHub mostra "merged", mas o código nunca chegou à linha de produto; `pilot@2241d3b` (merge da #134) não continha `docs/FINANCIAL_SPEND_INTELLIGENCE.md` |
| CI | runs #771–#778 sem runner (`runner_id: 0`, zero passos, sem log): #131–#135 mergeadas sem nenhum gate executado; `merge-audit` falhou corretamente (`GITHUB_ACTIONS_MINUTES.md`) |
| Recuperação | consolidação de 06/10: merge de `e7449477` (mesmo SHA) sobre `pilot@2241d3b`, sem conflito, árvore validada localmente (DB completo, check:all, builds, E2E) e PR para `main` |
| Correção de processo | `main` é a única branch longa; PR empilhada precisa ter a base devolvida para `main` antes do merge final; integração se prova com `git merge-base --is-ancestor <sha> origin/main`, não com o rótulo "merged" (`FINANCIAL_DEPLOYMENT_WORKFLOW.md`) |

### MGI-2026-10-05-01 — PR #127 mergeada com gates em execução e base desatualizada

| Campo | Fato |
| --- | --- |
| Severidade | baixa (diff só de documentação; nenhum ambiente hospedado afetado), mas quebra a invariante "`pilot` = árvore validada" |
| PR | #127 `docs: guideline v3 — operational maturity and enterprise lifecycle` (HEAD `c16ae6642fdc2ac18080347ce19cc8731193c69f`, criada sobre `pilot@556258c`) |
| Merge | `pilot@d828a44027506a9d4a4eddd807914f85dd8dde4c`, 05/10 13:28:36Z — 25 s depois do merge da #125 (`399b7ac`, 13:28:11Z) |
| Estado dos gates no merge | run `37316477732` sobre `c16ae66`: `database` e `deploy-boundaries` success; **`validate` e `presentation` `in_progress`** (`validate` terminou success às 13:39:46Z, depois do merge) |
| Base | a branch da #127 **não continha** a ponta da `pilot` após a #125; a combinação #125 + #127 nunca rodou CI (o CI não roda em push para `pilot`) |
| Detecção | `merge-audit` (workflow introduzido pela #125) no push de `d828a44`: run `37317090124` **failure** em 16 s — "validate: in_progress", "presentation: in_progress", "PR desatualizada: pilot avançou depois do HEAD testado". O run anterior (`37317037072`, merge da #125) ficou success |
| Causa | merge manual pela interface enquanto não há ruleset ativa (`protected=false`); `npm run merge:gates -- 127` não foi executado (teria bloqueado pelos dois motivos) |
| Fator contribuinte | três merges em 25 s (#125 → `pilot`, #126 → `main`, #127 → `pilot`); a #126 (Dependabot) entrou direto em `main` com CI verde, criando divergência de dependência `main` × `pilot` (Vite 8.3.2 só em `main`). `main` não tem `merge-audit` até a próxima promoção `pilot → main`, por isso a #126 não foi auditada pós-merge |
| Impacto | `pilot@d828a44` deixou de ser baseline limpa até nova validação; nenhum dado, deploy hospedado, migration ou segurança afetados |

**Por que a história não é reescrita.** `pilot` é branch compartilhada; reverter/forçar
apagaria a evidência que o próprio controle detectivo produziu e invalidaria checkouts de
terceiros. A correção é sempre **para frente, por PR nova**.

**Correção.** PR de reconciliação v3 (05/10): parte da ponta atual da `pilot`, incorpora
#125 + #127 + o bump da #126 (merge consciente de `main`), migra a
`IMPLEMENTATION_MATRIX` para M0–M6 e só é mergeada com os quatro gates verdes no HEAD
exato, `merge:gates` verde e base contida; depois do merge, o `merge-audit` do novo HEAD
precisa ficar verde. Evidência: `FINANCIAL_RELEASE_EVIDENCE_2026-10-05_V3_BASELINE.md`.

**Preventivo × detectivo.**

| Controle | Tipo | Quando atua | Limite |
| --- | --- | --- | --- |
| `npm run merge:gates -- <PR>` | preventivo **manual** | antes do merge, se alguém o executar | depende de disciplina; não impede o botão de merge |
| `.github/workflows/merge-audit.yml` | **detectivo** pós-merge | a cada push em `pilot`/`main` | o merge já aconteceu quando falha; só existe em `main` após a promoção |
| Rulesets `.github/rulesets/{pilot,main}.json` | preventivo **definitivo** | o GitHub bloqueia o merge sem os quatro checks success e branch atualizada | **OWNER_ACTION_REQUIRED** — exige plano GitHub Pro/Team (repositório privado no Free; ver MGI-03) e depois importar; `protected=false` |

**Prevenção.** (1) Owner importa as rulesets (`BRANCH_PROTECTION.md`) — é o único controle
que torna este incidente impossível. (2) Até lá, `merge:gates` antes de qualquer merge.
(3) Dependabot passa a abrir PR contra `pilot` (`target-branch: "pilot"` em
`.github/dependabot.yml`, verificado em `check:governance`); efetivo quando o arquivo
chegar a `main`, que é de onde o Dependabot lê a configuração.

### MGI-2026-10-05-02 — PR #128 (a correção da MGI-01) mergeada com gates em execução

| Campo | Fato |
| --- | --- |
| Severidade | baixa (docs + bump patch do Vite); repete o padrão da MGI-01 na própria PR que a corrigia |
| PR | #128 `fix(pilot): baseline v3 reconciliada` (HEAD `4a93fa60b51ae4c094e95d25cee8be4748363cfb`) |
| Merge | `pilot@d4d6c22`, 05/10 13:56:23Z, ~3 min depois do push; árvore idêntica a `4a93fa6`; base `d828a44` contida (frescor OK) |
| Estado dos gates no merge | run `37320266260`: `database` (13:55:12Z) e `deploy-boundaries` (13:54:34Z) success; **`validate` e `presentation` `in_progress`** |
| Desfecho dos gates | `validate` success 14:09:41Z, `presentation` success 14:15:20Z — quatro gates verdes no HEAD, **depois** do merge |
| Detecção | `merge-audit` run `37320702496` **failure** no push de `d4d6c22` |
| Causa | merge manual pela interface antes do fim do CI, sem ruleset ativa e sem `npm run merge:gates -- 128` (que bloquearia por `validate`/`presentation` `in_progress`) |
| Impacto | nenhum funcional: a árvore mergeada ficou verde nos quatro gates. A **governança** não foi cumprida: a evidência chegou depois da decisão, que é exatamente o que a regra proíbe |

Por que não reescrever: idem MGI-01. Correção: PR documental de seguimento, mergeada só com
os quatro gates verdes no HEAD exato, `merge:gates` verde e `merge-audit` verde depois do
merge. Lição: duas ocorrências no mesmo dia, inclusive na PR que documentava a primeira,
mostram que controle processual não basta — **as rulesets são a única prevenção efetiva**
(OWNER_ACTION_REQUIRED).

### MGI-2026-10-05-03 — PR #129 (registro da MGI-02) mergeada com `presentation` em execução

| Campo | Fato |
| --- | --- |
| PR | #129 `docs(governance): registra incidente de merge da #128 e resultado de CI da BL-V3` (HEAD `5cecd140407204013545f6a6606b5f788fc5bd82`, base `d4d6c22` contida) |
| Merge | `pilot@280490b36b083a98bec720e0ac57bd22823bc8f3`, 05/10 14:38:35Z, merge manual; árvore idêntica a `5cecd14` |
| Gates no merge | `database` success 14:20:35Z, `deploy-boundaries` success 14:19:44Z, `validate` success 14:30:05Z; **`presentation` `in_progress`** |
| Desfecho | `presentation` success 14:40:35Z — quatro gates verdes no HEAD, dois minutos **depois** do merge |
| Detecção | `merge-audit` run `37326353933` **failure** (`presentation: in_progress`) |
| Impacto funcional | nenhum (diff só documental; árvore verde) |
| Impacto de governança | terceiro merge consecutivo sem esperar os quatro gates; a evidência veio depois da decisão |
| Causa | merge manual sem `npm run merge:gates -- 129` e **sem nenhum controle técnico possível no plano atual** (ver abaixo) |

**Causa estrutural confirmada em 05/10 (15:00Z).** O repositório é **privado** e a conta está no
plano **GitHub Free**. A API responde, com a identidade do owner (permissão `admin`):

```
GET /repos/lucasweber1202/Arandu/rulesets
403 "Upgrade to GitHub Pro or make this repository public to enable this feature."
```

Ou seja: nem rulesets nem branch protection clássica podem ser ativadas neste repositório
no plano atual. A ação "importar as rulesets" registrada antes era **inexequível** sem
upgrade de plano. Os arquivos `.github/rulesets/{pilot,main}.json` continuam corretos e
testados; ficam prontos para o dia do upgrade.

Prevenção (inalterada em conteúdo, corrigida no pré-requisito): plano que suporte rulesets em
repositório privado (GitHub Pro/Team) → importar as rulesets (quatro checks obrigatórios,
`strict`/base atualizada, sem bypass) → `merge:gates` antes do merge → `merge-audit`
detectivo depois. Até o upgrade, **a única barreira é humana**: não clicar em merge antes de
`npm run merge:gates -- <PR>` aprovar.

## PR #63 — encerrada como obsoleta

A PR #63 ("Draft: núcleo B2B e pilotos Export Compliance / Financial
Procurement") foi substituída pela #64, que implementou o pivot a partir de uma
branch limpa e sem Export Compliance.

* a PR foi **fechada**, não mesclada;
* a branch `work/arandu-b2b-platform-pivot` foi **preservada**, e o histórico
  com ela;
* a análise do que foi portado e do que ficou de fora está em
  [`FINANCIAL_PIVOT_AUDIT.md`](FINANCIAL_PIVOT_AUDIT.md).

## Dependabot

> Estado em 29/09/2026: #60 e #61 fechadas; o `package-lock.json` já tem vite 8.3.1 e @playwright/test 1.63.0. O texto abaixo é histórico.

`#60` (vite 8.2.2 → 8.3.0) e `#61` (@playwright/test 1.62.1 → 1.63.0). Ambas são
incrementos de versão menor dentro da mesma maior, sem breaking change
declarado.

Nesta rodada as duas branches foram **atualizadas contra a `main` atual**, para
que o CI delas rode contra o código de hoje — o CI verde que elas exibiam era
de 21/09, anterior às PRs #64 e #65, e não dizia mais nada.

Elas **não** foram mescladas junto com esta rodada, de propósito: misturar
atualização de dependência com mudança de produto torna impossível saber qual
das duas causou uma regressão. Merge separado, depois do CI verde, é
`OWNER_ACTION_REQUIRED`.

## Verificação da rodada operacional (25/09/2026)

A leitura de `GET /repos/lucasweber1202/Arandu/branches/main/protection` retornou novamente `403 Resource not accessible by integration`. A conexão GitHub não oferece permissão administrativa; portanto a proteção **não foi alterada nem considerada ativa**. O proprietário deve aplicar os quatro checks acima em Settings → Branches e impedir push direto, force push e deleção, com branch atualizada antes do merge.

## MGI-07 — #140 e #141 mergeadas sem quatro gates (07/10/2026)

#140: main 8be66cab705c8bdf41707a34848c0cf4afb3c65a; CI 37628077116 falhou.
#141: HEAD ad40094ce1981d8a49f7c513365f2e22802c4ff8; CI 37634914967 falhou;
merge em main 59806334e038f2b3a01f363a63e4ca577949b26b.
CI da main 37635735477 e merge-audit 37635735484 falharam. Os quatro jobs
obrigatórios terminaram failure, com steps vazios e runner_id 0. Mergeado
não é M2. Nesta rodada o agente não executou merge.

Regra: merge proibido se database != success; deploy-boundaries != success;
validate != success; presentation != success, ou se o SHA/base forem divergentes.
merge:gates continua fail-closed e seus testes negativos permanecem.
Rulesets GET retornou 403: Upgrade to GitHub Pro or make this repository public
to enable this feature. Branch protection GET retornou 403 Resource not accessible
by integration. Não foi alterada a visibilidade, o plano ou o controle de acesso.
Causa administrativa do CI ainda não confirmada; runner 0 não prova cobrança.
O impedimento de CI é CI_EXTERNAL_BLOCKER; nenhuma flexibilização de gates.


## MGI-2026-10-07-08 — #142 mergeada antes do término dos gates

| Campo | Evidência observada em 07/10/2026 |
| --- | --- |
| PR / HEAD | #142, `85e95cd94a023a3012c6b20841c64f2fd159af36` |
| Merge | `main@477ad8be5b95733e8ac97aa3a6f3e1c6a2e54d62`, 18:06:00Z |
| Gates no merge | `database` e `deploy-boundaries` success; `validate` e `presentation` in_progress |
| Detecção | merge-audit `37664210727`, job `112939139701`; log 18:06:10Z identifica os dois gates em execução e retorna exit 1 |
| Run da PR | #793 (`37662454889`): presentation terminou success às 18:06:44Z; validate terminou failure às 18:07:58Z; nenhum desses resultados havia terminado no merge |
| Validação posterior do commit mergeado | **Run #794 (`37664210563`) no SHA 477ad8be: quatro gates success**; database 18:08:03Z, deploy-boundaries 18:07:25Z, validate 18:18:46Z, presentation 18:21:39Z |
| Estado de código | M2/E2 comprovado para a árvore mergeada pelo run #794; isso não comprova deployment ou readiness de Production |
| Estado de governança | Incidente registrado; a prova posterior não retroage para autorizar o merge prematuro |
| Deployment | Vercel arandu failure no mesmo SHA, deployment `dpl_Aj44zzVxwHt139cYZ3H4XZNLuZVE`; causa exata ainda não exposta pelos logs, leitura bloqueada 403 |
| Proteção | branches/main informa protected=false nesta observação; repositório agora público. Limitação de plano do repositório privado relatada anteriormente é histórica, não foi reutilizada como diagnóstico atual |

Não reescrever história, enfraquecer audit ou fazer rollback automático por
este incidente. O audit detectou corretamente a decisão antes da evidência;
o CI posterior validou a árvore efetivamente mergeada. Corrigir o deployment
com base em seus próprios logs e preservar merge:gates para próximas PRs.
Evidência complementar: `FINANCIAL_DEPLOYMENT_FAILURE_2026-10-07.md`.

## MGI-2026-10-07-09 — #143 mergeada fora da regra

A PR #143 (HEAD `4cc68b52a2e2f221ac9777fbd75efc37171bcadb`) entrou em
main como `b5ce6944faaa9108bc5cea588d9892c573da803e` em 07/10/2026
19:04:19Z. O merge-audit `37671698546`, job `112964789995`, observou
validate failure e presentation in_progress; database e deploy-boundaries
success. O audit detectou corretamente o incidente e permanece inalterado.

O run #795 (`37669076014`) terminou com ambos os gates de browser failure:
install-deps esgotou 12 minutos nos dois jobs, com índices do mirror Ubuntu
Azure indisponíveis/lentos. Presentation continuou após essa falha porque a
suíte usava `if: !cancelled()`; WebKit não encontrou libevent-2.1.so.7.
188 testes passed, 142 failed e 25 skipped nesse ambiente parcialmente preparado
não constituem prova isolada de regressão funcional.

O run #794 (`37664210563`) continua evidência dos quatro gates success no
merge anterior `477ad8be5b95733e8ac97aa3a6f3e1c6a2e54d62`; não corrige o
merge prematuro da #142 (MGI-2026-10-07-08) nem valida automaticamente #143.
A correção dedicada de infraestrutura exige os quatro gates concluídos success
no próprio HEAD antes do merge e CI do novo main depois dele. Nenhum histórico,
audit, gate, assertion, screenshot ou projeto de browser deve ser removido.
