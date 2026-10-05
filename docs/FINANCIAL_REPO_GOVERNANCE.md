# Governança do repositório — Financial Procurement

## Proteção da branch `main` — `OWNER_ACTION_REQUIRED`

> Observação de 01/10/2026: `GET /repos/lucasweber1202/Arandu/branches/main`
> informa `protected: false`. As regras abaixo continuam pendentes; não são
> apresentadas como proteção já aplicada.

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
| Require approvals | 1 | revisão humana antes do merge |
| Dismiss stale pull request approvals when new commits are pushed | ligado | aprovação não sobrevive a um push novo |
| Require status checks to pass before merging | ligado | é o item que faltava: a PR #64 foi mesclada com o job `validate` ainda em execução |
| → Required status checks | `validate`, `database`, `deploy-boundaries`, `presentation` | os quatro jobs do `Arandu CI` |
| Require branches to be up to date before merging | ligado | evita merge verde contra base velha |
| Require conversation resolution before merging | ligado | nenhum comentário aberto some no merge |
| Do not allow bypassing the above settings | **ligado** | aplica os quatro gates também ao administrador; incidente exige procedimento explícito |
| Allow force pushes | desligado | histórico da `main` não é reescrito |
| Allow deletions | desligado | a `main` não pode ser apagada |

Regra atual para `pilot` e `main`: sem bypass permanente. A orientação histórica de emergência abaixo foi substituída por `BRANCH_PROTECTION.md` (originalmente pelo addendum v2.1, hoje histórico; a Guideline v3 §23.5 mantém a regra). Exceções precisam de incidente documentado. Em 05/10 ambas continuam `protected=false`; nada foi configurado pelo conector.

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
