# Governança do repositório — Financial Procurement

## Proteção da branch `main` — `OWNER_ACTION_REQUIRED`

**Não foi possível configurar nem sequer ler as regras de proteção a partir
desta sessão.** A API respondeu:

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
| → Required status checks | `validate`, `database`, `deploy-boundaries` | os três jobs do `Arandu CI` |
| Require branches to be up to date before merging | ligado | evita merge verde contra base velha |
| Require conversation resolution before merging | ligado | nenhum comentário aberto some no merge |
| Do not allow bypassing the above settings | **desligado** | mantém o acesso de emergência do proprietário |
| Allow force pushes | desligado | histórico da `main` não é reescrito |
| Allow deletions | desligado | a `main` não pode ser apagada |

O toggle "Do not allow bypassing" fica **desligado de propósito**: ligá-lo
bloquearia o próprio proprietário em uma emergência sem que haja um segundo
administrador para destravar.

### Por que isso importa nesta rodada

A PR #64 foi mesclada às 18:07 UTC com o job `validate` ainda em execução —
o job que roda a suíte E2E nos cinco navegadores. Deu certo (o run seguinte na
`main` ficou verde), mas deu certo por sorte, não por regra. Com
"Require status checks" ligado, esse merge teria esperado.

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

Duas PRs abertas no momento desta rodada (`#60` vite, `#61` @playwright/test)
não foram tocadas: atualizar dependência no meio de uma rodada de hardening
misturaria a causa de qualquer regressão. Elas seguem o fluxo normal.
