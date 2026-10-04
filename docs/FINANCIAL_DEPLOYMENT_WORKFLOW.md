# Fluxo de desenvolvimento, piloto e produção

Uma única base de código, três ambientes. Os ambientes diferem por branch,
projeto Vercel, variáveis e projeto Supabase, nunca por cópias do código.

| Ambiente | Projeto Vercel | Origem | `ARANDU_ENV` | Banco | Para quê |
| --- | --- | --- | --- | --- | --- |
| Demo | `arandu-demo` | `main` | `demo` | Supabase DEMO próprio, com a empresa fictícia Vitta Foods | mostrar o produto real com dados fictícios |
| Piloto | `arandu-pilot` | branch `pilot` | `pilot` | Supabase do piloto (`offgpyysgdhfemjlchod`) | testar de verdade, com os primeiros usuários |
| Produção | `arandu` | branch `main` | `production` | Supabase de produção, próprio e vazio no início | uso oficial |

O projeto Supabase legado de arte (`igacnfjeuqhxcmfyepgj`) não é usado por
nenhum dos três.

## Demo

A demonstração é **a mesma `main`** com outra configuração e outro banco. Não
há branch de demo nem código exclusivo de demo: o que muda é `ARANDU_ENV=demo`,
o projeto Supabase DEMO e os dados fictícios semeados por comando manual.
Detalhes: [`docs/demo/ARCHITECTURE.md`](demo/ARCHITECTURE.md).

```text
main ──┬── ARANDU_ENV=demo       + Supabase DEMO  ──▶ arandu-demo (Vitta Foods, fictícia)
       └── ARANDU_ENV=production + Supabase PROD  ──▶ arandu      (clientes reais)
```

1. Supabase → criar o projeto **DEMO** (nunca reutilizar piloto, produção ou o
   legado) e aplicar `docs/supabase-migrations.json` (`cleanInstall`), como na
   produção. Confirmação de e-mail ligada, como nos outros ambientes.
2. Vercel → projeto `arandu-demo` (Production Branch `main`) → Environment
   Variables (escopo Production): `ARANDU_ENV=demo`, `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (do projeto DEMO),
   `CRON_SECRET` (32+ caracteres, próprio), `ARANDU_SITE_URL` (URL https da
   demo). **Remover** `ARANDU_DEPLOYMENT_KIND`. O build roda `finance:env:check`
   e falha se o Supabase for o do piloto/legado, se a branch não for `main` ou
   se o sandbox estiver ligado.
3. Deploy. Depois, da sua máquina (nunca no Vercel):
   `ARANDU_ENV=demo ARANDU_DEMO_CONFIRM=<ref DEMO> ARANDU_DEMO_APP_URL=<URL> … npm run demo:seed`
   — passo a passo em [`docs/demo/RESET.md`](demo/RESET.md).
4. `ARANDU_ENV=demo npm run finance:pilot:doctor` com as variáveis do projeto
   DEMO deve dar GO (o marcador `deployment_environment=demo` só existe nesse banco).
5. Registre o ref DEMO em `DEMO_SUPABASE_REFS` (`lib/finance/pilot-doctor.mjs`)
   por PR: a produção passa a recusar esse banco também pelo ref.

A Deployment Protection da Vercel pode ficar ligada ou não: o acesso ao produto
é pelo login normal com as contas das personas (senha fora do Git).

O sandbox antigo (motor no navegador, `ARANDU_DEPLOYMENT_KIND=demo`, sem banco)
continua funcionando enquanto o projeto `arandu-demo` não migra; ver
[`FINANCIAL_DEMO_MODE.md`](FINANCIAL_DEMO_MODE.md). Ele não é a demonstração
canônica e será aposentado depois da migração.

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

## Estado atual das branches

Não confie num SHA escrito aqui: confira sempre no Git.

```bash
git fetch origin main pilot
git rev-list --left-right --count origin/main...origin/pilot   # "0 N": pilot N commits à frente, 0 atrás
git log --oneline origin/main..origin/pilot                     # o que ainda não foi promovido
```

O esperado entre promoções é `pilot` à frente e `0` atrás. Se o primeiro
número for maior que zero, há hotfix em `main` sem volta para `pilot`: faça a
PR `main → pilot` antes de qualquer outra coisa.

Histórico: a #81 promoveu `pilot → main` antes de o piloto existir na Vercel e
com o CI sem quota. O conteúdo era só topologia e documentação (sem migration
nem dado), e nada passou a apontar para o piloto; não houve o que reverter.
Desde então as mudanças vão para `pilot` (#82 em diante) e `main` só recebe a
promoção com os cinco itens acima atendidos.

O projeto `arandu` (produção) roda sem `ARANDU_ENV` desde antes da #82. O
código fecha a API legada em qualquer deployment de produção da Vercel, e o
próximo deploy de `main` **falha** até `ARANDU_ENV=production` e o Supabase
próprio da produção estarem configurados. O deploy atual continua no ar.

## O que impede os erros de topologia

- `scripts/vercel-build.mjs` recusa um deploy de produção da Vercel que não
  declara o ambiente (`ARANDU_ENV` `demo`/`pilot`/`production` ou
  `ARANDU_DEPLOYMENT_KIND=demo`).
- Nenhum script de build ou deploy executa `demo:seed`/`demo:reset`
  (`scripts/test-deploy-release-separation.mjs`); o seed recusa rodar com
  `VERCEL_ENV` definido, fora de `ARANDU_ENV=demo` explícito, contra o banco do
  piloto/legado/produção ou contra um banco com dados e sem o marcador de demo.
- No deploy, os testes de contrato do `check:all` rodam sem o ambiente de
  deploy (`scripts/run-hermetic.mjs`), como no CI: nada de `ARANDU_ENV`,
  `SUPABASE_*` ou segredos herdados. O build e o `finance:env:check` usam o
  ambiente completo.
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
  sandbox legado falha se houver qualquer credencial real no ambiente. A demo
  canônica (`ARANDU_ENV=demo`) exige as credenciais do Supabase DEMO próprio e
  não publica o sandbox.
- A API só tem rotas financeiras (finance/*, auth/*, v1/*, crons, security.txt);
  o resto responde 404 `route_not_found`. Com `ARANDU_ENV` `demo`, `pilot` ou
  `production` e em qualquer deployment de produção da Vercel, a mesma lista é
  conferida antes do roteamento (`lib/deployment-surface.mjs`). Só no sandbox legado toda a API de domínio responde
  404; a demo canônica usa autenticação e a API financeira reais.
- `finance:pilot:doctor` aceita `ARANDU_ENV=demo`, `pilot` e `production`. Ele marca
  UNSAFE quando a produção aponta para o banco do piloto.
