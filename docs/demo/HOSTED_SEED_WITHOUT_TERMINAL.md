# Como executar o seed hospedado sem CMD nem computador configurado

**Alvo único:** Supabase Demo `offgpyysgdhfemjlchod`; aplicação canônica candidata `https://arandu-demo-9fxmf7u6k-lucas-projects467.vercel.app`; commit de código fixado em `89b1f0f68e7c2a3cdf3fa138fc683889124098dc`. A produção financeira `igacnfjeuqhxcmfyepgj` não é usada.

Há um workflow manual no GitHub Actions: `.github/workflows/demo-hosted-seed.yml`. Ele compartilha o **Environment `demo`** com `.github/workflows/demo-pool.yml`, mas não se inicia por push, PR ou merge. Não roda seed na Vercel nem usa a máquina pessoal. GitHub runner remoto com Node 24, permissões de repositório somente leitura, código pinado em SHA e confirmação explícita do ref. Não existe comando de reset automático. Um seed parcial exige diagnóstico antes de nova execução.

## Passos no navegador (uma única configuração de credenciais)

1. Após merge revisado da PR, abra [Settings → Environments](https://github.com/lucasweber1202/Arandu/settings/environments) e selecione/crie `demo`. Recomendado: adicionar **required reviewer**, restringir deployment a `main` e não permitir acionamento por forks. Configure **Environment secrets** (não *repository variables*):
   - `ARANDU_DEMO_SUPABASE_ANON_KEY`: mesma chave `sb_publishable_...` do Vercel Demo.
   - `ARANDU_DEMO_SUPABASE_SERVICE_ROLE_KEY`: mesma chave **atual** `sb_secret_...` do Vercel Demo. Nunca reutilizar uma chave já exposta ou revogada.
   - `ARANDU_DEMO_PASSWORD`: mesma senha de personas do Vercel Demo.
   - `ARANDU_DEMO_CRON_SECRET`: mesmo `CRON_SECRET` do Vercel Demo.
   
   Estes outros três segredos são usados pelo controlador de pool já existente: `ARANDU_DEMO_SUPABASE_REF=offgpyysgdhfemjlchod`, `ARANDU_DEMO_SUPABASE_URL=https://offgpyysgdhfemjlchod.supabase.co` e `ARANDU_DEMO_APP_URL=https://arandu-demo-9fxmf7u6k-lucas-projects467.vercel.app`. São valores não sigilosos; você pode cadastrá-los agora para uso futuro. Não publicar **nenhum** valor de chave/senha no chat, commit, log ou input de workflow. O conector Vercel não recupera os valores classificados como Sensitive; eles precisam ser informados pelo administrador no Environment do GitHub.
2. Abra [Actions → Arandu — semeadura remota da Demo](https://github.com/lucasweber1202/Arandu/actions/workflows/demo-hosted-seed.yml), selecione `main`, clique `Run workflow` e execute **primeiro** `preflight-only` com confirmação `offgpyysgdhfemjlchod`. Se falhar, inspecionar o erro sem forçar seed.
3. Depois do resultado `DEMO_REMOTE_PREFLIGHT_OK`, execute `seed-and-provision`. O runner fará `demo:seed`, `demo:check`, criação de dois workspaces e listagem. Durante a execução, o alias público `arandu-demo.vercel.app` permanece no sandbox anterior; não promover.
4. Quando o workflow terminar com sucesso, verificar no Supabase `deployment_environment=demo`, organizações e usuários fictícios presentes, dois workspaces `ready`, Auth/RLS/Storage e E2E autenticado. Só depois pensar em promover o deployment canônico ao domínio público.

## Travas e diagnóstico

- Um ref diferente, secret ausente/incompatível, runtime que não declara `demo/supabase`, `/api/health` diferente de HTTP 200, banco marcado como outro ambiente, ou organização sem marcador **interrompem antes da primeira escrita**.
- Se o seed começou e falhou, **não rodar `seed-and-provision` novamente automaticamente**, pois o preflight exige banco vazio e não faz reset. Inspecionar logs e dados parciais. Uma rotina de recuperação explícita exigirá revisão separada.
- O SHA fixo evita executar código que mudou na `main` após revisão do deployment.
- A opção `preflight-only` é somente leitura.
- GitHub e Vercel usam cofres diferentes: os Environment secrets do GitHub não aparecem automaticamente só porque existem na Vercel.
- GitHub Actions em repositórios públicos geralmente oferece runners padrão sem cobrança por minutos; verifique as configurações de faturamento do repositório antes de iniciar qualquer execução que possa gerar custo. Não foram criados projetos pagos neste preparo.

**Não usar CMD:** todo o processo de execução é pelo navegador em GitHub → Actions.
