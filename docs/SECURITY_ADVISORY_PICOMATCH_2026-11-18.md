# Advisory GHSA-fc5q-39xc-vjpf (picomatch ≤ 4.0.7) — bloqueio externo

Estado em 18/11/2026: **não resolvido; gate `supply-chain-audit` permanece reprovado de propósito.**

## Diagnóstico (árvore instalada pelo lockfile)

- `vite@8.3.8` → `picomatch@4.0.7` e `tinyglobby@0.2.17` → (`fdir@6.5.0` → `picomatch`, `picomatch`), tudo deduplicado em **uma única cópia** `picomatch@4.0.7`.
- `npm audit` lista 4 pacotes (picomatch, fdir, tinyglobby, vite), mas é **um** advisory propagado pela cadeia transitiva.
- Versão afetada: todas até 4.0.7 (`last_affected: 4.0.7`, OSV). A última versão publicada no npm é 4.0.7; não há 4.0.8 nem linha 3.x/2.x isenta. A correção upstream (micromatch/picomatch PR #194) não foi publicada.
- Vite é `devDependency`/ferramenta de build: o código de `picomatch` não está no bundle publicado (`grep -r picomatch dist` vazio). Os globs avaliados vêm da configuração do repositório, não de visitantes. Risco real: build/dev local com padrões controlados pelo próprio repositório.

## Alternativas avaliadas e recusadas

- `npm audit fix --force` → downgrade para `vite@6.2.7` (major antigo, que embute dependências e apenas esconde o pacote do audit). Recusado: mascaramento e regressão.
- `overrides` para uma versão inexistente/fork ou patch local: o audit continuaria correto em sinalizar `4.0.7`; não há fork com procedência verificável. Recusado.
- Rebaixar o nível do audit, `continue-on-error`, `|| true`, exclusões: proibidos.

## Condição objetiva de desbloqueio

Publicação de `picomatch` > 4.0.7 com a correção (ou atualização de `vite`/`tinyglobby` que a consuma). Então: atualizar o lockfile (`npm update picomatch` ou bump do Vite), `npm ci`, `npm run audit:ci`, `npm run check:all`, `npm run build` e a matriz integral.
