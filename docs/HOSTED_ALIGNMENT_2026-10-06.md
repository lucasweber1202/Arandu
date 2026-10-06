# Alinhamento hospedado à main — 06/10/2026

Estado lido nesta rodada: `main@fcc68f91c9dae997adcbacd7f82bdeaaf04ef2ed`,
árvore `20c11ac3bbf58107e4f853d17e56eeb7f5a87a81`. #136, #137 e #138 merged;
nenhuma PR aberta inicialmente. Código e SQL locais conferidos por blob SHA
contra esta árvore; só screenshots históricos não estão materializados no
checkout local. Nenhuma capability reconstruída ou nova implementada.

## O que os endereços públicos realmente servem

Resolução pelo `get_deployment` usando o hostname do alias, não inferida do
latest deployment do projeto:

| Ambiente/alias | Deploy que recebe tráfego | Branch/SHA | Estado |
| --- | --- | --- | --- |
| `arandu-demo.vercel.app` | `dpl_4PSczMxhAS73dmAB59w1MFziPhdu` | `main@fcc68f91` | READY/production, sandbox legado |
| `arandu-pilot.vercel.app` | `dpl_E8iHaoFCrjHiNDbnh2RrcNxtC4Cm` | `pilot@2241d3b94568acfdb99c8b7b31b53810e356846e` | READY/production, produto anterior |
| `arandu-bice.vercel.app` | `dpl_4Dd6HusgFXDMiPeFRvF72J8Mo6mD` | `main@fd796e6be3e7f9b994552f1866f7ec4632b9e7fa` (#81) | READY/production, release antiga |

Deploys recentes de `main@fcc68f91`: Pilot
`dpl_6LupNLnhVq73y4Yoqf271tb1RDCN` READY **preview**, só alias git-main;
Official `dpl_5h4GH8QVKkRxANzeo1bVgvtcDnKq` ERROR/production,
`BUILD_UTILS_SPAWN_1`, `npm run vercel-build` exit 1. Nenhum desses dois
substituiu o release público. Production Branch Pilot não é exposta pelo
schema do update_project; o alias público continua vindo de pilot.

Smoke público sem sessão: os três aliases respondem health 200. Demo `/`
tem título Explorar demonstração, link /demo e organizations 404. Pilot e
Official têm landing financeira e organizations 401. Persona entry 404 nos
três. Esses resultados não comprovam conexão autenticada, schema, release
atual ou presença das novas capabilities. Não há QA visual hospedado canônico.

## Topologia e configurações verificadas

| Supabase acessível | Classificação | Verificação |
| --- | --- | --- |
| `offgpyysgdhfemjlchod` | PILOT | PostgreSQL 17.6; marker financial-surface-hardening-1; 3 migrations gerenciadas |
| `igacnfjeuqhxcmfyepgj` | LEGACY | artworks existe; fin_settings ausente; não reutilizar |
| Demo / Production | ausentes no acesso atual | criação depende de escolha de organização e custo |

Única organização visível: `whvfafmjxdlwfohdseuk` (lucasweber1202's Org).
Isso não é uma seleção do usuário: os conectores get_cost/create_project
exigem que ele escolha a organização; confirm_cost exige confirmação do
valor. Custo e limite atual não consultados/confirmados. Limite de dois
projetos Free é observação histórica, não resultado desta rodada.

Nomes/escopos, sem valores de secrets:

- Demo Production: somente ARANDU_DEPLOYMENT_KIND. ARANDU_ENV, SUPABASE_*,
  CRON_SECRET, ARANDU_SITE_URL e ARANDU_DEMO_PASSWORD ausentes.
- Pilot Production: ARANDU_ENV, SUPABASE_URL, SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, ARANDU_SITE_URL,
  ARANDU_PILOT_ALLOWLIST_CONFIRMED presentes. Preview não recebe essas vars.
- Official Production: ARANDU_ENV já existente, SUPABASE_*, ARANDU_SITE_URL
  presentes; CRON_SECRET ausente. URL Supabase sensitive não pôde ser lida
  em claro pelo conector; identidade PROD permanece não comprovada.

Logs Official: 403 de scope lucas-projects467 mesmo com teamId explícito.
Fallback Vercel CLI 62.5.0 sem credenciais; login automático interrompido,
sem autenticação concluída. Causa específica do build **desconhecida**.
Ausência de CRON_SECRET é gap confirmado, não diagnóstico inventado do log.

## Cutover Demo preparado (não executado)

1. Usuário escolhe organização; consultar custo, informar valor e confirmar;
   criar **Arandu Demo**, região sa-east-1, sem pausar/apagar outro projeto.
2. Conferir projeto novo, vazio e exclusivo. Registrar seu ref em
   DEMO_SUPABASE_REFS por PR, mantendo lista PROD distinta e Pilot fixo.
   Não relaxar as guardas enquanto o ref real não existe.
3. Instalação limpa: 59 arquivos de cleanInstall na ordem do manifesto;
   aplicar por apply_migration no projeto novo, preservando histórico/hashes.
   Bundle técnico gerado em reports/supabase-migrations-cleanInstall.sql,
   SHA256 `bed3fa64c83a69c509c02ebda6381c7d9d2cc27c2996997c9b0ae269a5267555`.
   Marker final financial-opportunity-discriminator-1. Este hash não é o
   hash de outro serializador (migrations:release) nem prova de aplicação.
4. Advisors, grants, invoker/definer, RPCs, RLS, bucket privado e probes.
   Banco sem dado financeiro prévio; jamais usar cleanInstall no Pilot.
5. Preparar API real de operador em ARANDU_ENV=demo usando app-server.mjs
   existente, HTTPS e certificado local confiado, ligada ao novo Supabase.
   O servidor usa cert/key em PILOT_LOCAL_CERT_DIR e porta PILOT_LOCAL_APP_PORT;
   não depende de subir Docker se o Supabase alvo é hospedado. Build padrão,
   ARANDU_SITE_URL/ARANDU_DEMO_APP_URL https desse servidor, secrets privados
   e CRON_SECRET próprios. Não definir VERCEL_ENV no seed.
6. ARANDU_DEMO_CONFIRM repete o novo ref; demo:seed pela API real, demo:check
   completo (32 checks com CRON_SECRET, incluindo renovação/oportunidades).
   Validar senha forte compartilhada com o servidor, marker demo, personas,
   Portfolio, Fee, USD sem FX e todas as histórias lifecycle. Reset só se as
   guardas autorizarem o banco Demo; nunca como primeira ação no Pilot.
7. Somente então configurar Production do **mesmo arandu-demo**: ARANDU_ENV=demo,
   SUPABASE_* novos, CRON_SECRET, ARANDU_SITE_URL=https://arandu-demo.vercel.app,
   ARANDU_DEMO_PASSWORD do seed. Remover ARANDU_DEPLOYMENT_KIND no cutover,
   não manter os dois seletores. Main/mesmo release, sem secrets em Preview.
8. Deploy READY; resolver alias para o SHA certo; rodar env check/doctor/canary,
   demo:check contra URL pública, persona entry e E2E/QA desktop/mobile.
   Conferir as 24 superfícies do roteiro do usuário; HTTP 200 não basta.
   Depois marcar sandbox legacy/deprecated/internal fallback, sem removê-lo
   antes da comprovação do substituto. M3 só após M2 e evidência completa E3.

Sem Demo dedicado, os passos 2–8 permanecem bloqueados. Não trocar o runtime
público para uma configuração inválida nem publicar uma segunda Demo.

## Pilot: recovery e upgrade preparados

Marker relido e histórico Supabase: clean_install_main_64a9bdc,
pilot_advisor_hardening_9470493, financial_pilot_surface_hardening.
Storage objects=0, MFA factors=0, Auth policies=0, tabelas fin_ sem RLS=0.
Contagens não substituem recuperação exercitada.

Preflight com conexão anteriormente fornecida: identidade direct Pilot aceita;
clientes psql/pg_dump/pg_restore 16 presentes; Docker daemon indisponível.
Teste real somente de leitura da conexão direta: DNS failure neste executor;
validade da senha não avaliada. Host tem PostgreSQL 17 pelo conector; recovery
requer clientes compatíveis 17 e imagem Supabase versionada 17.6.1.166.
Backup e restore **NOT RUN**; nenhum artefato fictício criado.

Bundles do mesmo código:

| Etapa | Arquivos/marker final | SHA256 |
| --- | --- | --- |
| Clean Demo/PROD novo | 59 / financial-opportunity-discriminator-1 | bed3fa64c83a69c509c02ebda6381c7d9d2cc27c2996997c9b0ae269a5267555 |
| Pilot prefixo após marker real | 12 / financial-data-governance-1 | 8e15a95bd1a95a5ef9dbdebd6107bc0f3bbf520e64ed9a8580fc23820f0084a0 |
| Pilot pendente completo | 24 / financial-opportunity-discriminator-1 | fee0b5ba2a96da4e70333d8407b2b0aa7689a4b39cf0f115158ee84fdff8248d |

Backup → restore descartável do mesmo hash → probes/comparações → rehearsal
da cópia → prefixo 12 → provas do novo marker. Antes das 12 restantes:
inventário/export verificado/decisão específica do owner e ack decommission.
Não saltar etapa destrutiva. Não aplicar SQL enquanto recovery não passar.
Depois doctor atual, canário, jornada 26 etapas, probes 15 e operação real.
pilot:release:check atual **NO-GO**, sem evidência JSON real.

Canário exato do repo reexecutado pelo conector SQL no Pilot: sem erro, termina
ROLLBACK. PASS somente na cobertura disponível do marker antigo; notices/
contagem não expostos, capabilities pendentes não comprovadas. Doctor GO no
release final não obtido; cobertura ampliada da #138 preservada. Probe SQL
somente de catálogo contra a lista real REQUIRED_RPCS: **75 de 90 nomes
exigidos ausentes** no Pilot. É evidência adicional de schema incompleto,
não execução bem-sucedida do CLI doctor nem substituto de seus probes REST.

Branch pilot está contida em main (compare: ahead 16, behind 0), mas seu
alias ainda é operacional: não criar archive/delete até Production Branch main
e tráfego no release correto comprovados. Official permanece adiado até Pilot
válido no mesmo SHA. Nenhuma env/release/migration hospedada alterada nesta rodada.

## Validação e conclusão

Audit 0 vulnerabilidades, SBOM 21 componentes, check:all, build,
check:build-size (775339 total/435225 JS/208645 maior rota), assets 38 páginas /
258 refs e dry-run migrations passam. Testes negativos persona/sandbox/Pilot/
Official/XSS/doctor/release fazem parte desses checks.

Finance Chromium desktop/mobile: reexecução inicialmente 208 passed/7 skipped
e uma captura falhou durante rebuild concorrente do executor; captura passou
isolada, suíte completa reexecutada sem concorrência: **209 passed, 7 skipped**, zero
falhas. Nenhuma assertion alterada.
São fixtures locais, não Demo Vitta hospedada. Evidência anterior de apresentação:
121 passed/19 skipped, dois erros ENOENT de trace e dois reruns passed.
Firefox/WebKit/Mobile Safari indisponíveis; não alegar cinco browsers verdes.
demo:setup falhou por Docker ausente; demo:check recusou configuração incompleta
sem escrita; E2E real Demo não executado. SQL local/rehearsal falharam por
PostgreSQL localhost sem servidor. Não copiar os 297 checks históricos como
resultado desta rodada.

CI main #784 (`37505201208`): database/deploy-boundaries/validate/presentation
failure, steps vazios; merge-audit #12 failure. Rulesets 403 pede upgrade do
plano ou repo público; protected=false. Nenhum gate enfraquecido.

Maturity do release atual: **M1/E1**; **M2 externally blocked**;
**M3/M4/M5/M6 não atingidos**. Observações **E3 parciais** de alias/health e
canário antigo não são E3 de validação integral; sem E4/E5/E6. M0/E0 é o plano
de execução ainda não exercitado. Main final desta rodada permanece fcc68f91;
PR documental separada registra estas provas, sem merge pelo agente.

Ações humanas mínimas: escolher organização Supabase (depois confirmar custo);
reauthorizar Vercel no team lucas-projects467/autorizar login deliberado;
executor com Docker + PostgreSQL 17 e conexão de dump resolvível; export/decisão
decommission; restabelecer Actions/plano rulesets. Próximo trabalho concreto:
provisionar Demo dedicado e executar cleanInstall + seed, sem iniciar Stage B.
