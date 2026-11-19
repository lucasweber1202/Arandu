# Arandu — Release de produção estritamente manual

## Estado de referência (19/11/2026)
- Linha única de código: `main`; ambiente de testes hospedado: `arandu-demo`.
- Projeto de produção: Vercel `arandu`, id `prj_lW4anlfqzftRUF6vaIuN29MBQuGl`.
- Produção **não está ativada**: `ACTIVE_SUPABASE_ASSIGNMENTS.production=[]`.
- Supabase legado `igacnfjeuqhxcmfyepgj` não deve ser transformado, promovido, semeado ou migrado por este fluxo.
- O projeto `arandu-pilot` foi removido. Pilot permanece um conceito histórico/etapa de validação, não um ambiente hospedado.

## Deploy automático do GitHub
O Vercel `arandu` tem (em configuração do projeto, NÃO no `vercel.json` compartilhado):
- Ignored Build Step: `exit 0` (ignora builds de pushes em Git).
- Auto Assign Custom Domains: desativado.

Assim, merges para `main` continuam acionando a build da **Demo** (`arandu-demo`), mas não devem realizar builds do projeto de produção. A Vercel ainda pode registrar eventos `SKIPPED`. O controle deve ser verificado no próximo push/merge.

**Não** altere `vercel.json` global para bloquear `main`: ele também controla a Demo. Não remova `finance:env:check` nem o gate de atribuição do banco de produção.

## Release manual, em duas autorizações
Workflow `.github/workflows/production-manual-release.yml`: **somente** `workflow_dispatch` na branch `main`.

1. **Plan** (somente leitura): forneça SHA completo do HEAD `main`, operation `plan`. Verifica identidade, sucesso do `Arandu CI` no SHA e atribuição exclusiva de Production em código. Produz relatório GO/NO-GO, sem segredos ou acesso aos bancos.
2. **Stage** (publicação de deployment imutável, SEM domínio): em outro disparo manual, operation `stage`, mesmo SHA do HEAD, confirmação literal `ARANDU-PRODUCTION-STAGE`. Exige gates GO; usa GitHub Environment `production`, Vercel CLI fixada, `npm run release:check` e `vercel build --prod`. Publica com `vercel deploy --prebuilt --prod --skip-domain`.
3. **Validação do stage**: inspecionar build e runtime da URL imutável, migrations já aprovadas e compatibilidade operacional, testes E2E hospedados com autenticação/tenants, RLS, backup/restore comprovados. O stage não implica GO-LIVE.
4. **Promoção**: decisão **separada e explícita** do proprietário, executada no projeto `arandu` no painel Vercel (Promote), **somente** para o deployment aprovado. Nenhum workflow deste plano promove domínios.

## Pré-requisitos para stage (não presumir configurados)
- Ativação formal da atribuição `production` a um Supabase de produção **exclusivo** e comprovado; hoje está vazia.
- Banco Production com schema compatível, ambiente `ARANDU_ENV=production`, secrets e configurações adequadas. Não usar o Supabase Demo ou legado sem procedimento de cutover aprovado.
- Evidências de release em `npm run release:check` com GO.
- GitHub Environment `production` com **required reviewers** e restrição de deployment à branch `main`; verificar essas proteções no painel antes da primeira execução de `stage`. Atenção: se inexistente, o GitHub pode criar o environment automaticamente sem proteções.
- Secret `VERCEL_TOKEN` no GitHub Environment `production` com acesso mínimo ao projeto; **não** colar tokens em issues, PR, logs ou chat. O workflow usa IDs fixos do time/projeto.
- Validação de permissões e resultado do primeiro `vercel build --prod` / `--skip-domain` com a versão fixada; não presumir release apto antes disso.

## Limites
- Não há `push`, `pull_request` ou `schedule` para Production.
- O CI da `main` e a publicação da Demo seguem independentes.
- Nunca executar `seed`, `reset`, `cleanup`, `migrations` ou alterações de Supabase nesta workflow.
- Nenhum `stage` é permitido por padrão: a topologia atual bloqueia.
- Evitar comandos `vercel promote` automáticos; a promoção é um segundo ato humano.
- Reverter o Ignored Build Step apenas mediante decisão formal de abandonar releases manuais. Reabilitar o auto-assign de domínios exige autorização específica.
