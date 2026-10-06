# Seed, reset e travas da demonstração

## Comandos

| Comando | Efeito |
| --- | --- |
| `npm run demo:seed` | semeia a Vitta Foods num banco DEMO vazio |
| `npm run demo:reset` | apaga **só** os dados da demo e semeia de novo |
| `npm run demo:check` | só as checagens de sanidade (não escreve) |
| `npm run demo:setup` / `demo:local:reset` / `demo:local:check` | o mesmo no ambiente local (`scripts/demo/local.sh` preenche as variáveis) |

O reset apaga as organizações criadas pelas contas `*.example` da demo e tudo
o que pertence a elas (RFQs, convites, propostas e versões, aprovações,
decisões, contratos, marcos, tarefas, comentários, avisos, eventos,
documentos e objetos do Storage, e o pós-contrato: implantações, obrigações e
covenants, performance, spend, qualificações, extrações de documento e
oportunidades), os e-mails da fila dessas contas, as entradas de allowlist
criadas por elas e as próprias contas. Registros imutáveis só saem porque o
banco está marcado como demonstração (`fin_immutable_row` aceita o service
role apenas ali). Nada fora desse escopo é tocado. Em seguida o seed recria a
história (inclusive o capítulo pós-contrato, `LIFECYCLE` em
`scripts/demo/dataset.mjs`) e roda 29 checagens de sanidade.

Duração observada localmente em 06/10/2026: ~15–20 min. O seed respeita o rate
limit real da API (240 requisições por conta a cada 10 min) e espera quando o
atinge — não há atalho que pule a regra.

## Contra o Supabase DEMO hospedado

Da sua máquina — nunca em um build ou função da Vercel:

```bash
export ARANDU_ENV=demo
export ARANDU_DEMO_CONFIRM=<ref do projeto DEMO>      # repete o alvo
export SUPABASE_URL=https://<ref do projeto DEMO>.supabase.co
export SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=…  # do projeto DEMO
export ARANDU_DEMO_APP_URL=https://<url da demo>      # app com ARANDU_ENV=demo
export ARANDU_DEMO_PASSWORD=…                         # 12+ caracteres, maiúscula, minúscula e número
export CRON_SECRET=…                                  # opcional: marcos de renovação na hora
npm run demo:reset
```

Leva ~2 minutos (o seed espera entre os passos para separar os horários e
respeita o rate limit da API). Depois: `npm run test:e2e:demo` com
`ARANDU_DEMO_APP_URL` e `ARANDU_DEMO_PASSWORD`.

## Travas (todas precisam passar; `lib/finance/demo-guard.mjs`)

1. `ARANDU_ENV=demo` declarado explicitamente — `NODE_ENV` não conta.
2. Recusa com `VERCEL_ENV` definido: o seed nunca roda dentro de um deploy.
3. `ARANDU_DEMO_CONFIRM` precisa repetir o ref do projeto Supabase (ou `local`).
4. O alvo nunca é o projeto legado, o do piloto nem o da produção
   (`lib/finance/pilot-doctor.mjs`); com `DEMO_SUPABASE_REFS` preenchido, só ele.
   Só aceita `*.supabase.co` ou `localhost` (ref verificável).
5. Chaves do mesmo projeto, service role verdadeira, anon que não é service
   role, app em https, senha forte.
6. No banco: marcador `fin_settings.deployment_environment = 'demo'` ou
   nenhuma organização. **Banco com dados e sem marcador é recusado** — é
   assim que um banco real se parece. O marcador só é gravado pelo seed.
7. Na aplicação: depois do primeiro login, `/api/finance/organizations`
   precisa responder `environment: 'demo'`.

Do outro lado: `finance:env:check` e o build recusam `ARANDU_DEMO_PASSWORD` em
produção e demo apontando para o banco do piloto; o `finance:pilot:doctor`
marca **UNSAFE** um piloto ou produção ligados a banco com marcador de demo; e
nenhum script de build/deploy chama o seed
(`scripts/test-deploy-release-separation.mjs`). Testes das travas:
`node scripts/test-demo-guard.mjs` (parte de `npm run check:all`).

## Se algo falhar no meio

Rode `npm run demo:reset` de novo: o reset apaga o que o seed parcial criou e
recomeça. As travas são as mesmas.
