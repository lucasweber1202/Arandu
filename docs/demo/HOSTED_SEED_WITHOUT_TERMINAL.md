# Como executar o seed hospedado sem CMD nem computador configurado

**Alvo único:** Supabase Demo `offgpyysgdhfemjlchod`; aplicação canônica candidata = Environment secret `ARANDU_DEMO_APP_URL` (deployment do projeto `arandu-demo` com `ARANDU_ENV=demo`); commit = input `expected_sha`, que precisa ser o HEAD da `main` no disparo **e** o commit publicado nesse app. A produção financeira `igacnfjeuqhxcmfyepgj` não é usada.

> Atualizado no Arandu 10.2: o commit `89b1f0f…` e a URL de preview fixos foram substituídos por `expected_sha` conferido contra o app; o preflight virou um job próprio, somente leitura, com verificação de schema; a escrita é outro job, que exige preflight GO e `authorization_reference`. Ver `docs/demo/ARANDU_10_2_DEMO_READINESS.md`.

Há um workflow manual no GitHub Actions: `.github/workflows/demo-hosted-seed.yml`. Ele compartilha o **Environment `demo`** com `.github/workflows/demo-pool.yml`, mas não se inicia por push, PR ou merge. Não roda seed na Vercel nem usa a máquina pessoal. GitHub runner remoto com Node 24, permissões de repositório somente leitura, código pinado em SHA e confirmação explícita do ref. Não existe comando de reset automático. Um seed parcial exige diagnóstico antes de nova execução.

## Passos no navegador (uma única configuração de credenciais)

1. Após merge revisado da PR, abra [Settings → Environments](https://github.com/lucasweber1202/Arandu/settings/environments) e selecione/crie `demo`. Recomendado: adicionar **required reviewer**, restringir deployment a `main` e não permitir acionamento por forks. Configure **Environment secrets** (não *repository variables*):
   - `ARANDU_DEMO_SUPABASE_ANON_KEY`: mesma chave `sb_publishable_...` do Vercel Demo.
   - `ARANDU_DEMO_SUPABASE_SERVICE_ROLE_KEY`: mesma chave **atual** `sb_secret_...` do Vercel Demo. Nunca reutilizar uma chave já exposta ou revogada.
   - `ARANDU_DEMO_PASSWORD`: mesma senha de personas do Vercel Demo.
   - `ARANDU_DEMO_CRON_SECRET`: mesmo `CRON_SECRET` do Vercel Demo.
   
   Estes outros três segredos são usados pelo controlador de pool e, `ARANDU_DEMO_APP_URL`, também pela semeadura: `ARANDU_DEMO_SUPABASE_REF=offgpyysgdhfemjlchod`, `ARANDU_DEMO_SUPABASE_URL=https://offgpyysgdhfemjlchod.supabase.co` e `ARANDU_DEMO_APP_URL=<URL https do deployment canônico da Demo no commit a provisionar>`. São valores não sigilosos; você pode cadastrá-los agora para uso futuro. Não publicar **nenhum** valor de chave/senha no chat, commit, log ou input de workflow. O conector Vercel não recupera os valores classificados como Sensitive; eles precisam ser informados pelo administrador no Environment do GitHub.
2. Abra [Actions → Arandu — semeadura remota da Demo](https://github.com/lucasweber1202/Arandu/actions/workflows/demo-hosted-seed.yml), selecione `main`, clique `Run workflow` e execute **primeiro** `preflight-only` com confirmação `offgpyysgdhfemjlchod` e `expected_sha` = HEAD da `main`. O resumo mostra cada verificação, as camadas e, se houver, as migrations pendentes na ordem. Se der NO-GO, corrigir a causa sem forçar seed (migrations hospedadas são uma operação separada: ver o plano no documento do 10.2).
3. Depois de `DEMO_PREFLIGHT_VERDICT=GO`, execute `seed-and-provision` com o mesmo `expected_sha` e uma `authorization_reference` (ex.: link da issue/decisão que autoriza a escrita). O runner fará `demo:seed`, `demo:check`, criação de dois workspaces e listagem. Durante a execução, o alias público `arandu-demo.vercel.app` permanece no sandbox anterior; não promover.
4. Quando o workflow terminar com sucesso, verificar no Supabase `deployment_environment=demo`, organizações e usuários fictícios presentes, dois workspaces `ready`, Auth/RLS/Storage e E2E autenticado. Só depois pensar em promover o deployment canônico ao domínio público.

## Travas e diagnóstico

- Um ref diferente, secret ausente/incompatível, runtime que não declara `demo/supabase`, `/api/health` diferente de HTTP 200, banco marcado como outro ambiente, ou organização sem marcador **interrompem antes da primeira escrita**.
- Se o seed começou e falhou, **não rodar `seed-and-provision` novamente automaticamente**, pois o preflight exige banco vazio e não faz reset. Inspecionar logs e dados parciais. Uma rotina de recuperação explícita exigirá revisão separada.
- **Migrations não são executadas por este workflow**. Quando houver `SCHEMA_PENDING`, conferir o procedimento de `docs/demo/ARANDU_10_2_DEMO_READINESS.md`: selecionar somente arquivos após o marker observado, preservar backup/restore e executar no ref Demo em processo separado autorizado. É proibido executar `migrations:release` sem `--after-schema` ou usar `staging` como atalho para a Demo.
- `expected_sha` precisa ser igual ao HEAD da `main` no disparo e ao commit publicado no app; código diferente do revisado interrompe antes de escrever.
- O preflight é somente leitura (apenas GET/HEAD, testado em `scripts/test-demo-hosted-preflight.mjs`) e roda também imediatamente antes da escrita.
- GitHub e Vercel usam cofres diferentes: os Environment secrets do GitHub não aparecem automaticamente só porque existem na Vercel.
- GitHub Actions em repositórios públicos geralmente oferece runners padrão sem cobrança por minutos; verifique as configurações de faturamento do repositório antes de iniciar qualquer execução que possa gerar custo. Não foram criados projetos pagos neste preparo.

**Não usar CMD:** todo o processo de execução é pelo navegador em GitHub → Actions.
