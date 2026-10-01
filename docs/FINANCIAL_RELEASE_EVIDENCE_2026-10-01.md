# Evidência operacional — 01/10/2026

Baseline observada: `main` `8625dc9998b81ed2fd0bd73bd9f4fc5de11a60a0`.
Esta rodada segue a guideline mestra; **Onda 0 ainda não tem GO**. Não foi
iniciado Financial Passport v2 nem removido o sandbox temporário.

## Correções de apresentação

- Breadcrumb: os itens navegáveis não encolhem abaixo da largura do texto;
  o link tem uma caixa de bloco. Isso evita o centro de clique do link inline
  cair sobre o item seguinte quando a topbar precisa truncar o título.
- Comparação móvel: as colunas e o grid interno dos seletores usam
  `minmax(0,1fr)`; o controle nativo pode encolher dentro da própria coluna.
- Entrada da demo: marca e ações podem passar para uma segunda linha quando
  as métricas da fonte não permitem uma única linha em 360/320 px.
- Os testes preservam clique normal, Escape, retorno de foco, filtros e scroll;
  conferem o alvo real de clique e os limites dos seletores. Reflow inclui
  390, 375, 360 e 320 px. Nenhum `overflow-x:hidden` global foi introduzido.
- A matriz de apresentação mantém os cinco projetos, com dois workers no CI.
  A execução anterior rodava 340 casos em um worker e terminou cancelada perto
  do limite do job, depois de registrar as regressões conhecidas.

## Validação local do hotfix

- `npm ci --include=optional`: passou; `npm run audit:ci`: zero vulnerabilidades.
- `npm run check:all`, `git diff --check`: passaram após as alterações.
- Build limpo padrão e build de apresentação: passaram. Checks de assets,
  tamanho, SEO (URL fictícia explícita), superfície e navegação: passaram.
- Apresentação completa em Chromium desktop e mobile: **117 passed, 19 skipped**
  (skips condicionais já existentes), 3,6 minutos. App financeiro: **40 passed**.
- Os binários oficiais Playwright não puderam ser baixados nesta sessão
  (arquivo de download inválido); Chromium 153 foi executado por uma instalação
  temporária fora do repositório. Nenhuma dependência ou matriz oficial mudou.
  Firefox, WebKit desktop e mobile Safari permanecem pendentes no CI do hotfix.
- `npm run test:database` não pôde executar localmente: `psql` ausente. O job
  `database` da baseline passou; não é atribuído ao novo head. Nenhum SQL mudou.
- Uma execução local anterior foi descartada porque um rebuild concorrente
  alterou seu `dist`. Os números acima vêm da repetição com build limpo e estável.

## Git e CI observados

`pilot` está em `407819cbf34abf36f17d851aa1026d84ac082fd7`. A comparação
`pilot...main` mostra 33 commits à frente e 3 atrás. A PR
[#92](https://github.com/lucasweber1202/Arandu/pull/92) propõe `main → pilot`
por merge, preservando ambos os históricos. É draft e mergeable; **a abertura
da PR não equivale a branches reconciliadas**. Não houve force-push.

Run da baseline:
[36868851832](https://github.com/lucasweber1202/Arandu/actions/runs/36868851832).
`validate`, `database` e `deploy-boundaries` terminaram em sucesso;
`presentation` terminou cancelada, com falhas WebKit/Safari registradas no log.
Isso não é CI verde. Os checks do hotfix e da reconciliação precisam concluir
antes de promoção ou início da Onda 1.

## Ambientes externos observados (somente leitura)

| Ambiente | Evidência em 01/10 | Limite da observação |
| --- | --- | --- |
| Supabase PILOT `offgpyysgdhfemjlchod` | `schema_version=financial-surface-hardening-1`; 33 tabelas `fin_*` com RLS habilitada e forçada; `fin-documents` privado, 10 MB, cinco MIME | Approval handoff ainda pendente; não é doctor/canary/restore GO |
| Supabase DEMO / PROD | Não aparecem entre os projetos acessíveis: apenas legado e PILOT; organização está no plano free | Nenhum projeto criado; nenhum dado semeado; custo/capacidade e provisionamento dependem do proprietário |
| Vercel | Conexão lista zero equipes; escopo documentado `lucas-projects467` retorna 403 | Não foi possível ler Production Branch, variáveis, seus escopos ou logs privados |
| Status GitHub do SHA da main | `arandu-demo` SUCCESS, `arandu-pilot` SUCCESS, `arandu` FAILURE | Status de deployment não prova configuração ou SHA publicado no domínio |
| Demo pública | `/demo/index.html` 200; `/api/finance/products` e `/api/forms` 404 `legacy_surface_closed` | Ainda é o sandbox; não comprova demo canônica com Supabase |
| Piloto público | health 200, produtos financeiros 200, `/api/forms` 404, `/demo/index.html` 404 | Nenhuma credencial usada; identidade do banco/variáveis e jornada autenticada não são inferidas dessas respostas |
| Produção pública `arandu-bice.vercel.app` | health 200, produtos financeiros 503, `/api/forms` 405, `/demo/index.html` 404 | A API legada ainda está roteada no deployment servido; produção não foi declarada segura |

As sondas públicas acima são GET. Não foi aplicada migration remota, não foi
copiado dado entre ambientes e nenhum segredo foi publicado.

## Próximos passos concretos

1. Concluir os quatro checks do hotfix; fazer merge em `main`, então concluir
   e fazer merge da #92 em `pilot` **com merge commit**, preservando ancestria.
2. Restabelecer acesso Vercel ao escopo `lucas-projects467`. Conferir os três
   projetos e variáveis (nomes/escopos, sem divulgar valores), usando o runbook
   `FINANCIAL_DEPLOYMENT_WORKFLOW.md`.
3. Provisionar Supabase DEMO e PROD separados, após decisão de capacidade/custo.
   Aplicar `cleanInstall` do manifesto, storage privado e Auth. Não reutilizar
   legado nem PILOT. Configurar DEMO com `ARANDU_ENV=demo`, não com a flag do
   sandbox; executar o seed Vitta Foods existente, reset e check; registrar o
   ref dedicado em `DEMO_SUPABASE_REFS` e testar as fronteiras negativas.
4. Para PILOT, referenciar backup verificável, ensaiar restore e aplicar a
   última migration do manifesto (`supabase-financial-approval-handoff.sql`)
   antes de PROD. Rodar doctor, canary e restore com as credenciais do ambiente.
   A ausência de backup e credenciais operacionais nesta sessão impede aplicar
   a migration remota com segurança; a migration e o rollback já existem.
5. Só com demo canônica demonstrada, aposentar o sandbox em PR própria. Só com
   os gates da Onda 0 comprovados, começar Passport sobre `pilot` reconciliada.

Os procedimentos completos continuam nos runbooks canônicos; este arquivo é
evidência datada, não uma guideline alternativa.
