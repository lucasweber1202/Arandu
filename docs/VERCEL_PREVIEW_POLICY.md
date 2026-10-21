# Política de deployments automáticos da Vercel (v3.8, 21/10/2026)

## Regra

`vercel.json` → `git.deploymentEnabled`:

```json
{ "main": true, "docs/**": false, "**": false }
```

Semântica documentada pela Vercel (`git.deploymentEnabled`, consultada em 21/10/2026):
- os padrões usam minimatch;
- uma branch sem regra casada **é publicada** (default `true`);
- se a branch casa várias regras e **ao menos uma é `true`**, há deployment.

Efeito:
- `main` casa `main: true` e `**: false`, portanto continua publicando os releases.
- Qualquer outra branch (`claude/*`, `codex/*`, `feature/*`, `fix/*`, `chore/*`,
  `agent/*`, `integration/*`, `docs/*`, `dependabot/*`, `pilot`) casa apenas regras
  `false` e não gera preview automático. Isso vale nos três projetos ligados ao
  repositório (`arandu`, `arandu-demo`, `arandu-pilot`), que leem o mesmo `vercel.json`.

O que não muda:
- os quatro checks obrigatórios do GitHub (`database`, `deploy-boundaries`,
  `validate`, `presentation`), que não dependem de preview Vercel;
- rewrites, cron, headers, CSP e funções;
- a proteção da `main`.

Não usamos `ignoreCommand`: um build cancelado nessa etapa ainda pode contar na quota.

## Teste

`npm run check:vercel-routing` (`scripts/check-vercel-api-routing.mjs`) avalia as
regras com a semântica acima e cobre:
- `main` publica;
- nomes reais de branches não publicam;
- política antiga (sem `**`) falha;
- `main: false` falha;
- `deploymentEnabled: false` global é proibido;
- padrão fora do subconjunto avaliado (literal, `x/**`, `**`) falha até o avaliador
  ser estendido.

O teste não substitui observação: a efetividade deve ser registrada pelo
comportamento real da Vercel no primeiro push após a integração.

## Quando um preview for necessário

Preview passa a ser exceção. Opções, em ordem:
1. Validar localmente (`npm run build`, E2E, `npm run design:capture`).
2. Deploy manual autorizado pelo owner, fora do fluxo automático.
3. Liberar temporariamente uma branch específica numa PR própria (`"feature/x": true`),
   removendo a regra antes do merge.

Nenhum agente libera branch ou faz deploy manual sem autorização.

## Reversão

Remover a linha `"**": false` de `vercel.json` restaura a política anterior
(`main` publica, `docs/**` bloqueado, demais branches com preview) e ajustar o
teste correspondente. É uma reversão só de configuração, sem efeito em dados,
banco ou segredos.
