# GHSA-fc5q-39xc-vjpf — retirada oficial em 18/11/2026

**Situação confirmada:** o GitHub Advisory Database retirou o advisory em **18/11/2026 15:38:56 UTC** (`withdrawn` no JSON de origem). O npm audit ainda retornou a versão antiga do alerta às **17:08:55 UTC** no [CI da PR #351](https://github.com/lucasweber1202/Arandu/actions/runs/44332148521), mesmo após a retirada; não é uma vulnerabilidade nova nem falha do código das migrations.

Fonte canônica: [registro oficial de GHSA-fc5q-39xc-vjpf](https://github.com/github/advisory-database/blob/main/advisories/github-reviewed/2026/10/GHSA-fc5q-39xc-vjpf/GHSA-fc5q-39xc-vjpf.json). O registro possui `id=GHSA-fc5q-39xc-vjpf`, `withdrawn=2026-11-18T15:38:56Z`, `github_reviewed=true`, pacote `picomatch` do ecossistema npm e alias `CVE-2026-112366`.

## Árvore e escopo

O lockfile contém Vite 8.3.8 → picomatch 4.0.7 e tinyglobby → fdir/picomatch. O npm audit conta quatro pacotes de alta severidade, mas todas as arestas do grafo convergem para **um único aviso retirado**. Nenhum downgrade, fork ou `npm audit fix --force` foi aplicado.

## Gate de segurança

`npm run audit:ci` executa **sempre** o npm audit completo com `--audit-level=high --json`. Quando não há high/critical, aprova normalmente. Quando há high/critical:

1. Inspeciona as causas de **todos** os pacotes sinalizados, inclusive dependências indiretas, verificando que todas convergem exclusivamente para o GHSA retirado.
2. Consulta o **arquivo vivo e oficial** do GitHub Advisory Database por HTTPS e exige ID, CVE, pacote, ecossistema, assinatura `github_reviewed`, data e status `withdrawn` válidos.
3. Só trata a sinalização como **metadado atrasado do npm**, por prazo limitado até **18/12/2026 UTC**, enquanto o GitHub ainda registrar a retirada.
4. Reprova caso apareça qualquer outro advisory high/critical, a retirada seja revertida, o GitHub não possa ser consultado, o npm audit falhe, a estrutura do relatório seja inválida ou a exceção expire.

Essa verificação **não permite ignorar vulnerabilidades ativas** nem altera a dependência, a severidade do audit ou o gate. Os testes negativos de `scripts/test-audit-ci.mjs` estão ligados a `check:supply-chain`.

### Ação futura

Após a propagação da retirada para a base do npm, `npm audit --audit-level=high` deverá aprovar sem tratamento especial. Remover a exceção quando o npm deixar de sinalizar o GHSA; se houver novo advisory, corrigir separadamente. Não transferir esse procedimento para outras vulnerabilidades.
