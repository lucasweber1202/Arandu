# Stage 0 — evidência operacional de 08/10/2026

## Baseline e separação de maturidade

Fonte: main `296b0357383e09a49348307b2921b3cf496c589b`, árvore
`45497e6dff1306e49849cd6812fb471ccedac8d6`, após #144. Leituras e probes
realizados em 08/10 entre 13:57 e 14:06 UTC. Sem PR aberta na leitura inicial.
Guideline v3.2, matriz, boundaries e runbooks de deployment, conversão, segurança,
governança, migrations, release e recovery regem esta rodada.

- [CI #799](https://github.com/lucasweber1202/Arandu/actions/runs/37677370704):
  database, deploy-boundaries, validate, presentation success no SHA acima,
  app GitHub Actions 15368; **M2/E2** para as capabilities presentes na árvore.
- [Merge audit #18](https://github.com/lucasweber1202/Arandu/actions/runs/37677370697): success.
- [Vercel Production reprovada](https://vercel.com/lucas-projects467/arandu/DPwnPBkBq5d22LzgS9YQ2PSRyjXL):
  GitHub status failure no mesmo SHA.
- [Vercel Demo](https://vercel.com/lucas-projects467/arandu-demo/4BFkHXdGeKZ6ngLvjreUDhhABcDw) e
  [Pilot transitório](https://vercel.com/lucas-projects467/arandu-pilot/7YEN7Ki8senUsjrh7UfYyjmruScP):
  GitHub statuses success no mesmo SHA. Status não prova alias, schema ou jornada.

A nova ferramenta desta PR não está incluída em BL-799: **M1/E1 até seus
próprios gates**. Nenhuma capability foi promovida a M3, M4, M5 ou M6.
O incidente histórico da #142 permanece registrado, mesmo com audit atual verde.

## IMPLEMENTADO — lote seguro desta rodada

1. `lib/live-governance.mjs`, `scripts/check-live-governance.mjs` e
   `scripts/test-live-governance.mjs`: avaliação de proteção **aplicada** na
   GitHub API, sem mutação. Verifica branch/SHA, protected, PR, quatro checks
   vinculados ao GitHub Actions, strict, bypass, conversa, deletion e force push.
   Ruleset precisa constar nas regras efetivas da main. Templates/evaluate,
   resposta ausente, SHA inválido ou leitura parcial nunca viram PROTECTED.
   Não combina políticas parciais com bypass diferente. Report anterior é
   invalidado antes da consulta; não grava payloads, tokens ou erros de rede.
2. Testes negativos integrados em `check:governance` → `check:all`, sem consulta
   hospedada obrigatória no CI. Comando operacional separado `governance:live`.
   É controle detectivo; só regra aplicada no GitHub impede o botão de merge.
3. Query somente leitura `ops/sql/consolidation-inventory.sql`, executada nos
   dois refs autorizados. Contagens exatas, RLS e metadados; nenhum conteúdo de
   registro, contato ou segredo retornado. Os manifests de 07/10 foram preservados;
   novos manifests de 08/10 receberam hashes pelo digest canônico existente.
4. Matriz reconciliada com BL-799, removendo blockers de CI obsoletos do registro
   vivo. M2 inclui a foundation existente de Document Intelligence, Qualification,
   Post-Award, Covenants, Performance e Spend; completude de escopo permanece partial.
5. Runbooks e índice atualizados: dois ambientes permanentes, main única,
   Pilot histórico; restrição de plano GitHub privado identificada como histórica.

Nenhuma migration DDL/DML, configuração Vercel/Supabase, secret, alias, allowlist,
reset ou exclusão foi executada. Não há nova capability de produto.

## VALIDADO — testes reproduzíveis

| Verificação | Resultado / limite |
| --- | --- |
| npm ci --include=optional | PASS, Node 24.19.0 |
| npm run audit:ci | PASS, zero vulnerabilidades |
| npm run check:all | PASS, inclui novos negativos de governança |
| npm run build | PASS |
| npm run check:build-size | PASS; JS 435.225/800.000; maior rota 208.645/250.000 bytes |
| npm run check:dist-assets | PASS; 38 páginas, 258 referências |
| npm run test:e2e:list | 520 testes listados, 19 arquivos; não é execução de navegador |
| node --use-env-proxy scripts/check-live-governance.mjs | BLOCKED correto, exit 1; main conhecida, protected=false, regras efetivas vazias; classic read 401 sem token |
| GitHub connector proteção administrativa | 403 Resource not accessible by integration; rulesets [] |
| consolidation:check demo / production com manifests 08/10 | BLOCKED correto, exit 1; identidade/inventário exato/plan PASS; classificação/export/restore não PASS |
| npm run test:database local | Não executado: psql command not found, sem PostgreSQL/Docker neste executor |
| SQL de inventário hospedado | PASS de leitura nos dois refs; não é teste de isolamento nem aplicação de migrations |

O Node neste executor exige flag de proxy para a GitHub API; a primeira tentativa
sem flag registrou unavailable e permaneceu BLOCKED. Não houve redução de cobertura,
threshold, guard ou workflow. Não há alteração visual, de auth ou de schema nesta PR.
Banco e browsers completos da nova árvore precisam do CI desta PR, além da evidência
histórica de BL-799. Logs de teste ficam locais, sem upload de dumps/credenciais.

## VALIDADO — sondas públicas não autenticadas

| Rota | Demo | Pilot histórico | Official |
| --- | --- | --- | --- |
| /api/health | 200; main296b0357; mode demo; synthetic-fixtures; environment null | 200, sem SHA | 200, sem SHA |
| /finance/passport.html | 200 | 200 | 404 |
| /finance/portfolio.html | 200 | 200 | 404 |
| /api/finance/organizations | 404 | 401 | 401 |

Demo pública ainda é sandbox. Páginas e interações sintéticas não demonstram
API/Auth/RLS da Demo canônica. Esta rodada não autenticou personas nem apresentou
uma jornada mock como hospedada. Alias Official não comprova release atual.

## BLOQUEADO — inventário, segurança e conversão

| Fonte | Tabelas / views / funções / policies | Linhas | Auth / MFA / objetos Storage |
| --- | --- | --- | --- |
| offgpyysgdhfemjlchod (Pilot → Demo planejado) | 71 / 18 / 101 / 51 | 13 | 0 / 0 / 0; um bucket privado |
| igacnfjeuqhxcmfyepgj (legado → Production planejado) | 16 / 5 / 2 / 12 | 42 | 0 / 0 / 0; zero buckets |

Pilot: marker `financial-surface-hardening-1`; deployment_environment ausente;
tabelas financeiras de negócio vazias. Conteúdo operacional não classificado
integralmente: personal_data_rows=null continua bloqueando conversão. Legado:
dois leads, uma reserva e cinco certificados têm campos de contato/destinatário.
Oito é contagem desses registros, não certificação de que nenhum outro campo
contenha PII. customer_rows=null; preservar até decisão e recuperação.

Todas as tabelas public observadas têm RLS enabled; fin_* do Pilot têm FORCE RLS.
Isso não prova as policies/RPCs das migrations ainda ausentes nem segregação real.
Advisors hospedados de 08/10:

- Pilot: 30 INFO RLS sem policy e 43 WARN funções SECURITY DEFINER executáveis
  por authenticated. A existência de função privilegiada é sinal para análise
  de guards, não prova automática de acesso indevido; nenhum grant foi aberto.
- Legado: dois ERROR de views SECURITY DEFINER, um WARN search_path mutável,
  um WARN função privilegiada executável por anon e um por authenticated;
  seis INFO RLS sem policy. Não considerar esse banco Production pronto.

Remediação oficial:
[RLS sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[views](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view),
[search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
[anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
Não alterar policies do legado para facilitar cutover. Primeiro preservar/exportar,
restaurar em descartável e executar a reconstrução aprovada com os gates existentes.

Backup e restore hospedados **não executados**. SQL conectado via MCP não fornece
conexão administrativa pg_dump nem destino descartável. Executor sem pg_dump,
pg_restore, psql e Docker, sem conexão administrativa segura provisionada. Não
reutilizar credenciais copiadas em conversa ou imprimir valores. Os slots/branches
históricos foram preservados; retirada continua bloqueada por Demo não validada
e inventário de dependências Vercel não acessível.

## BLOQUEADO — Production deployment e administração

Vercel team `lucas-projects467` / `team_BBpDcLVx5izJjXz5qBEq2cRy`.
GET projects nesse escopo retornou 403 Not authorized; list_teams retornou [];
CLI Vercel não instalado e não há autenticação/token Vercel no executor.
Não repetir request inalterada, trocar de equipe ou usar credential de Demo.
Logs completos, Node efetivo, Root Directory, overrides e bindings não puderam
ser observados. Configuração versionada: Node 24.x, npm ci --include=optional,
build npm run vercel-build, output dist. **Causa-raiz não comprovada; deployment
principal não corrigido.** As allowlists ativas Demo/Production vazias podem
bloquear finance:env:check se tais modos estiverem configurados; isso é hipótese
consistente com o código, nunca substituto dos logs reais.

## Ações externas concretas e próxima sequência

1. GitHub [Rulesets](https://github.com/lucasweber1202/Arandu/settings/rules):
   admin importa `.github/rulesets/main.json`, Active, bypass vazio; confirmar
   `governance:live` PROTECTED e PR pendente/vermelha impedida. Repo é público;
   não é necessário inferir upgrade de plano a partir do incidente antigo.
2. Vercel: dar ao conector acesso à equipe lucas-projects467 ou autorizar fallback
   de navegador para ler/configurar o projeto arandu. Abrir o deployment linkado,
   Build Logs; comparar Settings → Build and Deployment e Environment Variables
   por presença/escopo, sem copiar secrets. Depois aplicar apenas a correção provada.
3. Supabase: classificar os registros sob acesso protegido; fornecer executor
   PG17/conexão administrativa em transporte seguro e destino local descartável
   com bootstrap Supabase. Executar export Auth/Storage/public + restore com
   comparação/probes e rollback antes de solicitar conversão destrutiva.
4. Credenciais anteriormente publicadas em conversa (secret key e password de DB
   do Pilot) precisam de rotação administrativa; status de rotação não comprovado.
   Supabase do Pilot → Settings → API Keys e Database; criar/rotacionar por fluxo
   seguro, atualizar consumidores/variáveis, revogar antiga e verificar recusa.
   Não compartilhar valores no chat. Rotação precisa de acesso e coordenação com
   consumidores hoje invisíveis na Vercel.
5. Após recovery/classificação e autorização material: cutover por PR verde,
   runtime demo real, seed/reset canônicos, doctor/canário e QA autenticado; depois
   release:candidate:check GO. Production só após isolamento e recovery próprios,
   owners de incidente/suporte nomeados e validação de release no SHA correto.

## NÃO INICIADO nesta rodada

Jornadas M4 autenticadas, falhas controladas hospedadas, DR, promoção M5,
retirada de pilot e novas funcionalidades Stage 1. São dependentes dos gates
acima. Após Stage 0: (1) validar Document Intelligence já existente com documentos
sintéticos autorizados e revisão humana; (2) IAM/SSO real e SCIM conforme necessidade
do cliente; (3) Qualification; (4) Search e Executive sobre dados reais autorizados.
Não reconstruir foundations já CI-validadas nem avançar Product Packs/network.

**Stage 0 permanece aberto.** Rollback deste lote é revert de código/documentação;
nenhum banco ou ambiente hospedado foi alterado. A PR só ficará pronta após
database/deploy-boundaries/validate/presentation success no HEAD exato.
