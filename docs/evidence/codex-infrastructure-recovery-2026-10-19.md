# Infraestrutura hospedada — 19/10/2026

Observações desta rodada entre 11:51 e 12:06 BRT (UTC−03).
Base remota confirmada: `0eb6a4aa8540c27bf45a379c8a4835c632cd25fc`.
Branch: `codex/hosted-infrastructure-recovery`. Nenhuma PR concorrente aberta
nas duas consultas. Nenhum arquivo visual, script da Demo local, package.json,
lockfile, workflow, atribuição ativa ou configuração hospedada foi alterado.

## Deployments e acesso

Fonte dos estados: status contexts do GitHub no SHA completo acima, consultados
em 19/10; não equivalem a logs de build nem a readiness.

| Projeto | Estado no SHA da base | Deployment |
| --- | --- | --- |
| arandu | failure | [J8AeUFeQpHp1gGAXGHu8o5AT1h1X](https://vercel.com/lucas-projects467/arandu/J8AeUFeQpHp1gGAXGHu8o5AT1h1X) |
| arandu-demo | success | [EFJoRkAGMCZtrmhtsgkGhPu4pNwv](https://vercel.com/lucas-projects467/arandu-demo/EFJoRkAGMCZtrmhtsgkGhPu4pNwv) |
| arandu-pilot | success (antes informado como pending) | [CBescTt9qLFWpTEnWm4gFXrwBVTi](https://vercel.com/lucas-projects467/arandu-pilot/CBescTt9qLFWpTEnWm4gFXrwBVTi) |

`vercel_get_project(arandu, slug=lucas-projects467)` retornou HTTP 403,
`forbidden`, team `team_BBpDcLVx5izJjXz5qBEq2cRy`, request id
`gru1:sfo1::vrlnj-1792421710138-39dc483fb4f7`. CLI Vercel indisponível.
Não foi repetida a chamada negada nem tentado outro escopo. **ACCESS_BLOCKED**:
logs, root directory, configuração efetiva, vínculo Git, branch/target de cada
deployment, versão Node remota e presença/escopo das variáveis não verificados.
A primeira causa causal do último erro oficial permanece **NOT_PROVEN**.
O responsável pelo escopo deve conceder à integração acesso de leitura aos três
projetos; depois ler os logs de `dpl_J8AeUFeQpHp1gGAXGHu8o5AT1h1X` e registrar
a primeira falha anterior ao exit 1. Não atribuir a falha oficial às reproduções
sintéticas abaixo sem comparar sua configuração e seus logs.

No repositório: Node 24.x, install `npm ci --include=optional`, build
`npm run vercel-build`, output `dist`. Preview usa `deploy:check`; sandbox usa
`deploy:check:demo`; Demo/Pilot/Production declarados passam antes pelo checker.
Rotas multissegmento e os quatro crons passaram na verificação local.

Variáveis exigidas no código: ARANDU_ENV, SUPABASE_URL, SUPABASE_ANON_KEY,
SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, ARANDU_SITE_URL; Demo exige também
ARANDU_DEMO_PASSWORD. VERCEL_ENV e VERCEL_GIT_COMMIT_REF contextualizam o gate.
ARANDU_DEPLOYMENT_KIND=demo identifica apenas sandbox e não pode coexistir com
ARANDU_ENV hospedado. ARANDU_PRESENTATION_MODE não libera a Demo canônica.
Presença real e escopos Vercel: **ACCESS_BLOCKED**, não presumidos ausentes.

## Readiness publicada

Prova agregada: `ops/consolidation/hosted-health-2026-10-19.json`.

- Demo: health 200, branch main, SHA completo da base, environment null,
  `mode=demo`, `datasource=synthetic-fixtures`; readiness 503 `not_ready`.
- Pilot e alias `arandu-bice`: health e probe=ready retornam 200 `alive`, sem
  identidade de release/readiness. Isso é liveness e não prova o commit servido.
- Alias `arandu.vercel.app`: health/readiness 404. Não prova configuração do
  projeto `arandu`, cujo alias histórico arandu-bice serve um artefato sem SHA.
- `check:live` na Demo com ARANDU_ENV=demo e SHA da base: **FAIL** esperado,
  quatro falhas (identidade/ambiente incompatível em health/readiness, readiness
  HTTP 503 e products HTTP 404); sessão 404. Sem jornada autenticada hospedada.

Resultado da Demo canônica: **BLOCKED**. Backend e isolamento operacional entre
Demo e Production: **NOT_PROVEN**; as atribuições positivas de ambos continuam
vazias. Não há configuração real de credenciais disponível para comparar.

## Stage 0 — bancos atuais

Fonte: Supabase list_projects, list_migrations e SQL em transações READ ONLY.
Inventários exatos e observações sanitizadas: `ops/consolidation/*-2026-10-19.json`.
Nenhuma linha de usuário, contato, token ou caminho de objeto foi recuperada.

| Ref / papel ativo | public tabelas/views/funções/policies | Linhas exatas | Auth usuários/sessões/MFA | Storage buckets/objetos |
| --- | --- | --- | --- | --- |
| offgpyysgdhfemjlchod / pilot | 71/18/101/51 | 14 | 0/0/0 | 1 privado / 0 |
| igacnfjeuqhxcmfyepgj / legacy | 16/5/2/12 | 42 | 0/0/0 | 0/0 |

Ambos ACTIVE_HEALTHY, PostgreSQL 17.6, região sa-east-1. O Pilot tem schema
`financial-surface-hardening-1`, sem `deployment_environment`; migrations
20260927151042, 20260927151230 e 20260929142139. O legado não tem fin_settings
nem migrations registradas. Todas as tabelas public observadas têm RLS enabled;
isso não comprova policies corretas, isolamento funcional ou compatibilidade atual.

Pilot mudou de 13 linhas históricas para 14 (api_rate_limits agora 2).
Legado tem 2 leads com contato, 1 reserva com contato e 5 certificados com
destinatário. **DATA_REVIEW_REQUIRED**: oito registros potencialmente pessoais,
sem classificação de origem sintética. Ambos manifests mantêm customer_rows e
personal_data_rows null. Contagens zero não classificam campos livres.
`consolidation:check`: **BLOCKED** em ambos; identidade e inventário exato PASS,
classificação, export e restore pendentes. Inventários expiram após 24 horas.

## Correção comprovada e testes

Antes: `finance:env:check` saía 0 com uma chave JWT anon em
SUPABASE_SERVICE_ROLE_KEY. `check-production-env` aceitava qualquer um dos dois
papéis em ambos os campos. Depois: parser estrutural compartilhado em
`lib/supabase-key-role.mjs`; o campo público exige anon/publishable e o campo
de servidor exige service_role/secret. JWT malformado, papel desconhecido e
prefixo curto são recusados. Nenhum valor de chave é impresso. Regressões em
`scripts/test-finance-env.mjs` cobrem ambos os gates. O resultado estrutural
não autentica chave, assinatura, revogação ou projeto hospedado.

- PASS: npm ci, audit:ci (0 vulnerabilidades), check:all, build e e2e:list
  (1.185 testes listados; não executados por essa listagem).
- PASS: testes de ambiente, separação deploy/release e roteamento Vercel.
- PASS: `npm run vercel-build` completo em Preview sem credenciais hospedadas,
  com VERCEL_URL sintética, e sandbox legado com ARANDU_DEPLOYMENT_KIND=demo.
  Build padrão restaurado ao final; sandbox não foi publicado nem classificado
  como Demo canônica.
- PASS: cinco cenários positivos/negativos em build-gates-2026-10-19.json;
  Pilot estrutural aceita configuração sintética correta; papéis trocados falham.
- PASS esperado: Production sem ambiente, Production no legado não atribuído e
  Demo canônica no Pilot não atribuído param **antes do build**. Não são bugs.
- Uma tentativa local de Preview sem URL da plataforma falhou no check:seo:dist;
  Vercel fornece VERCEL_URL. A reprodução final usa hostname sintético .vercel.app
  apenas como contexto de build, sem afirmar que esse hostname foi publicado.
- A primeira execução de check:all falhou no teste que cria um arquivo 0644
  porque o executor usa umask 077. Reexecução com umask 022 passou; sem bypass.
- E2E hospedado, Auth gerenciado, isolamento real e release aprovado: **NOT RUN**.

## Recovery e sequência executável restante

`node scripts/test-recovery-real.mjs`: **PASS**, PostgreSQL 17.11 Debian e age
1.3.2 (checksum fixado no repositório conferido). Clusters loopback descartáveis,
dados exclusivamente sintéticos. Mesmo ciphertext exportado/restaurado, checksums,
reconciliação, roles, grants/default privileges, funções, triggers, RLS e negativos
de corrupção/chave errada exercitados. Fixture de objetos HTTP: dois binários e
duas referências, permissões verificadas. Teardown verificado.
Resultado sanitizado: `ops/consolidation/recovery-local-2026-10-19.json`.
Não comprova Supabase Auth/Storage gerenciados ou recovery hospedado.

Recovery remoto: **NOT RUN / RECOVERY_BLOCKED**. Última execução de
consolidation-export permanece [38179837512](https://github.com/lucasweber1202/Arandu/actions/runs/38179837512),
failure em a321888. Não houve nova execução. Preflight desta sessão, com PG17 e
age válidos, identifica RECOVERY_DATABASE_URL_MISSING, RECOVERY_RECIPIENT_MISSING
e RECOVERY_DESTINATION_MISSING. SQL MCP não fornece pg_dump, conexão administrativa
nem destino durável. Não preparar backup sensível no filesystem efêmero desta sessão.

Procedimento já executável em `docs/SUPABASE_ENCRYPTED_PRESERVATION.md`:

1. Responsável configura conexão administrativa da origem em transporte seguro,
   destinatário age e store privado durável atestado; identidade privada separada,
   fora de CI/store/repositório. Sem copiar valores para chat ou logs.
2. No ambiente com custódia autorizada, executar recovery:doctor para cada ref;
   renovar inventário exato e classificação (todos os campos operacionais incluídos).
3. Executar recovery:export:private e recovery:verify. Havendo objetos, preservar
   binários por recovery:storage:export antes de declarar o conjunto completo.
4. Restaurar **esse mesmo export** em alvo Supabase compatível descartável isolado;
   recovery:restore:verify, reconciliação e probes; quando aplicável, restore e
   verificação dos binários e das permissões. Capturar identidades/hashes/datas.
5. Somente com classificação, preservação, restore e autorização específica:
   aplicar rollout aprovado, marker, credenciais independentes e PR de atribuição.
   Nenhuma aprovação para esse cutover foi inferida nesta missão.
6. Configurar arandu-demo, remover sandbox no cutover validado, executar seed
   canônico autorizado, doctor com SHA completo, check:live, canário e jornadas
   hospedadas; gerar candidato v3 com hosted_readiness. Só então decidir GO.

Bundles recalculados, não aplicados: cleanInstall 73 arquivos, marker final
financial-decision-authorization-1, SHA256
`0dfe6da2e0d6022797084e5e74128c174ff36d9a70ab1163b294a395140ce953`;
upgrade antes do boundary destrutivo 12 arquivos (26 adiados), SHA256
`0fd98cb1e34788e26985625ec0f274ff40c6f2e1b03ebe9e73bb001121ba5f9f`.
Não reutilizar os hashes históricos de bundles menores.

## Governança, estados e responsáveis

[CI da base](https://github.com/lucasweber1202/Arandu/actions/runs/39270231206):
database/deploy-boundaries/validate/presentation success no SHA completo; merge-audit
39270231215 success. Ruleset [25102965](https://github.com/lucasweber1202/Arandu/rules/25102965)
ativo: quatro contexts, strict, PR exigida, sem bypass actors, delete/force-push
bloqueados. Endpoint clássico de protection retorna 403; ruleset lido com sucesso.
CI da branch deve ser avaliado no HEAD próprio da PR; não herda o CI da base.

Production: **BUILD_TECHNICALLY_VALID** apenas para o artefato local sem contexto
de Production; build configurado de Production continua intencionalmente bloqueado
na reprodução sintética. **DEPLOYMENT_READY=BLOCKED**, **BACKEND_READY=NOT_PROVEN**,
**RELEASE_APPROVED=NO**. Nenhuma promoção, merge ou publicação nesta rodada.

Pendências por categoria: código corrigido nesta PR; configuração autorizada depende
de identidade/variáveis do projeto; acesso depende do responsável Vercel; custódia
de backup depende do proprietário; classificação e decisão de tratamento dos dados
dependem do responsável pelos dados. Próxima ação imediata: revisar esta correção
e habilitar a leitura Vercel no escopo exato enquanto se prepara a custódia de export.
