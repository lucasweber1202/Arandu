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

Regra atual para `pilot` e `main`: sem bypass permanente. A orientação histórica de emergência abaixo foi substituída pelo addendum v2.1 e `BRANCH_PROTECTION.md`. Exceções precisam de incidente documentado. Em 04/10 ambas continuam `protected=false`; nada foi configurado pelo conector.

### Por que isso importa — agora com duas ocorrências

A PR #64 foi mesclada com o job `validate` ainda em execução. A PR #65 também.
Nos dois casos o run seguinte na `main` ficou verde, mas isso é sorte
observada duas vezes, não um controle. `validate` é o job que roda a suíte E2E
nos cinco navegadores e leva cerca de vinte minutos; ele é exatamente o que
"Require status checks" existe para esperar.

Enquanto a regra não existir, a recomendação operacional é simples: **não
mesclar antes de os quatro jobs fecharem**, e conferir na aba Actions.

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
