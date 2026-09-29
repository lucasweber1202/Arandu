# Fluxo de desenvolvimento, piloto e produção

Uma única base de código, três ambientes. Os ambientes diferem por branch,
projeto Vercel, variáveis e projeto Supabase, nunca por cópias do código.

| Ambiente | Projeto Vercel | Origem | `ARANDU_ENV` | Banco | Para quê |
| --- | --- | --- | --- | --- | --- |
| Demo | `arandu-demo` | `main`, com `ARANDU_DEPLOYMENT_KIND=demo` (o build vira `build:demo`) | (não definir) | nenhum; dados fictícios no navegador | mostrar o produto sem expor ambiente real |
| Piloto | `arandu-pilot` | branch `pilot` | `pilot` | Supabase do piloto (`offgpyysgdhfemjlchod`) | testar de verdade, com os primeiros usuários |
| Produção | `arandu` | branch `main` | `production` | Supabase de produção, próprio e vazio no início | uso oficial |

O projeto Supabase legado de arte (`igacnfjeuqhxcmfyepgj`) não é usado por
nenhum dos três.

## Demo

Uma URL pública, sem login de nenhum tipo, que abre direto a demonstração.

1. Vercel → **Add New… → Project** → importar `lucasweber1202/Arandu`, nome
   **`arandu-demo`**, Production Branch `main`.
2. **Não** altere o Build Command: o `vercel.json` fixa `npm run vercel-build` e
   sobrepõe o campo do painel. O que escolhe o build da demo é a variável.
3. **Environment Variables** (escopos Production e Preview): **só**
   `ARANDU_DEPLOYMENT_KIND=demo`. Nenhuma outra. Com ela, `vercel-build` roda
   `deploy:check:demo` (`build:demo` + fronteira da demo + tamanho + assets), e
   o build falha se aparecer `SUPABASE_*`, `RESEND_API_KEY`, `CRON_SECRET` ou
   `ARANDU_ENV`.
4. **Settings → Deployment Protection → Vercel Authentication: Disabled**
   (só neste projeto; piloto e produção continuam como estão).
5. Deploy. A raiz `/` é a entrada da demonstração; `/demo/…` continua valendo.
   Toda a API responde 404 nesse projeto (não há banco), exceto `/api/health`.
6. Conferir de uma janela anônima:

```bash
curl -sI https://arandu-demo.vercel.app/ | head -1                 # HTTP/2 200, sem 302 para vercel.com/sso-api
curl -s  https://arandu-demo.vercel.app/ | grep -c 'id="start-demo"' # 1
curl -s  https://arandu-demo.vercel.app/api/finance/me             # 404 legacy_surface_closed
```

## Branches

```text
feature/*  ──PR──▶  pilot  ──deploy automático──▶ arandu-pilot  (teste real)
                      │
                      └──PR (promoção)──▶  main  ──deploy──▶ arandu (produção)
hotfix/*   ──PR──▶  main, e em seguida main ──PR──▶ pilot
```

- **`feature/*`**: trabalho temporário, criado a partir de `pilot`. Toda
  mudança nasce aqui. A PR vai para `pilot`, nunca direto para `main`.
- **`pilot`**: o que está no ar no piloto. Toda mudança passa por aqui antes da
  produção. Só recebe PR com o CI verde.
- **`main`**: o que está no ar na produção. Só recebe a PR de promoção
  `pilot → main` e hotfixes.

Os previews da Vercel (PRs e branches `feature/*`) não recebem as variáveis do
piloto nem as da produção: elas ficam só no escopo *Production* de cada
projeto. Um preview é código sem banco real. Nunca teste uma feature
experimental na produção.

## Promover `pilot → main`

Abra a PR `pilot → main` só quando todos os itens abaixo valerem:

1. o CI (`validate`, `database`, `deploy-boundaries`, `presentation`) está verde
   no head de `pilot`;
2. o deploy de `arandu-pilot` desse head foi usado de verdade;
3. `ARANDU_ENV=pilot npm run finance:pilot:doctor` dá GO e `npm run pilot:canary`
   passa contra o piloto;
4. se há migration nova, ela foi aplicada no piloto antes, e o doctor confirmou
   o `schema_version`;
5. a produção recebe só código, migrations e configuração validados. Nunca
   recebe usuários, RFQs, propostas, documentos, contratos nem allowlist do
   piloto.

Depois do merge, aplique as migrations novas na produção (as mesmas, na mesma
ordem) e rode `ARANDU_ENV=production npm run finance:pilot:doctor` contra ela.

## Hotfix de produção

1. Crie `hotfix/*` a partir de `main`, abra a PR para `main` e faça o merge com
   o CI verde.
2. Logo depois, abra a PR `main → pilot` para trazer o hotfix, antes de
   qualquer outra promoção. Um `pilot` sem o hotfix reintroduziria o bug na
   próxima promoção.

## Quando `pilot` diverge de `main`

O normal é `pilot` estar à frente de `main`, com o que ainda está em teste. Se
`main` tiver algo que `pilot` não tem (um hotfix), faça o merge de `main` em
`pilot` por PR. Nunca force-push em nenhuma das duas.

## Rollback

- **Código**: *Instant Rollback* da Vercel no projeto afetado, para o deploy
  anterior. Depois, reverta o commit por PR na branch do ambiente.
- **Banco**: rollbacks em `docs/rollback/`, sempre ensaiados antes em
  `npm run test:database`. Faça backup antes (`npm run pilot:restore:drill`
  mostra o procedimento seguro).

## Estado da topologia em 29/09/2026

- `main` = `fd796e6` (merge da #81, `pilot → main`); `pilot` = `67b3404` (merge
  da #80). As árvores são idênticas: `main` só tem o commit de merge a mais.
  Não há código em `main` que não esteja em `pilot`.
- A #81 promoveu `pilot → main` antes de o piloto existir na Vercel, antes do
  doctor GO e com o CI bloqueado pela quota. O conteúdo promovido era só
  topologia e documentação (nenhuma migration, nenhuma mudança de dados), e o
  projeto `arandu` não tem `ARANDU_ENV` — então nada passou a apontar para o
  piloto. Não há o que reverter. Regra a partir daqui: a PR de promoção só é
  aberta com os cinco itens de "Promover `pilot → main`" atendidos, e as PRs de
  `feature/*` vão para `pilot`.
- O projeto `arandu` (produção) está no ar sem `ARANDU_ENV`. Desde esta rodada o
  código fecha a API legada em qualquer deployment de produção da Vercel, e o
  próximo deploy de `main` **falha** até `ARANDU_ENV=production` (e o Supabase
  próprio da produção) estar configurado. O deploy atual continua no ar.

## O que impede os erros de topologia

- `scripts/vercel-build.mjs` recusa um deploy de produção da Vercel que não
  declara o ambiente (`ARANDU_ENV` `pilot`/`production` ou
  `ARANDU_DEPLOYMENT_KIND=demo`).
- `scripts/vercel-build.mjs` roda `finance:env:check` antes do build sempre que
  `ARANDU_ENV` é `pilot` ou `production`. O deploy falha quando:
  - a produção aponta para o banco do piloto ou para o legado;
  - o piloto aponta para o legado;
  - uma chave pertence a outro projeto, ou há chave de serviço no lugar da anon;
  - o deploy vem da branch errada (`pilot` ≠ piloto, `main` ≠ produção);
  - a demo está ligada;
  - falta service role ou `CRON_SECRET`.
- O build (`lib/demo-mode.mjs`) nunca publica `/demo` com `ARANDU_ENV` `pilot`
  ou `production`, nem nos previews. Pedir a demo ali falha o build. O build da
  demo falha se houver qualquer credencial real no ambiente.
- Com `ARANDU_ENV` `pilot` ou `production`, em qualquer deployment de produção
  da Vercel e na demo, as rotas legadas de arte respondem 404
  (`lib/legacy-surface.mjs`). Na demo, toda a API responde 404.
- `finance:pilot:doctor` aceita `ARANDU_ENV=pilot` e `production`. Ele marca
  UNSAFE quando a produção aponta para o banco do piloto.
