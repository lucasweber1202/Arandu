# Publicação verificável P0-A — Issue #240

Esta engenharia não libera M3 nem cutover. `ARANDU_DEPLOYMENT_KIND=demo` publica
visita/sandbox estáticos; `ARANDU_ENV=demo` continua exigindo Supabase Demo,
recovery e atribuição aprovados. A estação local possui evidência independente.

## Artefato e identidade

`copy-runtime-assets.mjs`, depois de finalizar a raiz e copiar os recursos,
gera `dist/arandu-build.json` **somente** no projeto demonstrativo independente.
Usa a identidade Vercel já reconhecida por `releaseIdentity`: SHA completo/ref;
na Vercel, ausência ou SHA malformado interrompe o build. Build local sem
metadados não inventa SHA. O manifesto identifica modalidade, fixtures,
ausência de backend, data e SHA-256/tamanho de todos os arquivos emitidos.
Não contém variáveis de ambiente nem confere M3. Recusa arquivos privados,
symlinks, chaves privadas, JWT service_role e valores de segredos do servidor.
O manifesto usa no-store no browser e no CDN. A política dos demais assets é
preservada. Não há segundo versionamento, API fictícia ou seed no build.

## Verificação reproduzível

Após integrar a PR de UX #241 e esta PR, escolher o SHA **aprovado da main**
com database/deploy-boundaries/validate/presentation success no HEAD exato.
Ler o adaptador abaixo contra o roteiro aprovado antes de executar:

```bash
npm ci --include=optional
npm run check:all
npm run build
npm run build:demo
npm run check:public-publication
node scripts/test-publication-browser.mjs
node scripts/public-tour-proof-flow.mjs "$RELEASE_SHA" /tmp/arandu-flow.json
npm run smoke:public-demo -- --url=https://arandu-demo.vercel.app/ --sha="$RELEASE_SHA" --browser --flow=/tmp/arandu-flow.json
```

`RELEASE_SHA` deve ser informado como SHA completo previamente aprovado. O
adaptador lê `lib/public-tour.mjs` da PR #241 e usa seus links reais: entrada,
introdução, painel, solicitação, convites, propostas, comparação, aprovação,
contrato, continuidade, instituição, proposta da instituição, cinco áreas e
retorno. Não copia regras financeiras nem altera a página. Âncoras e queries
são navegação, nunca prova de versão. A comprovação do SHA vem do manifesto,
dos bytes servidos e, quando disponível, da identidade declarada pelo runtime.

O smoke segue somente redirects na mesma origem, sem credenciais ou bypass.
Verifica todos os arquivos do inventário, SHA/tamanho, MIME de JS/CSS/HTML,
assets locais referenciados no HTML e raiz. Um 404 ou versão antiga falha.
Proteção de deployment é ACCESS_BLOCKED; transporte inconclusivo é NOT_PROVEN.
Liveness não confere readiness. Health ausente (404) é permitido num site
estático; quando presente, sua identidade deve concordar com o artefato.

Com `--browser`, Chromium anônimo percorre os links de fato, confere conteúdo
visível, reload de cada deep link, overflow horizontal, imagens/fontes,
erros JS/console/HTTP e bytes das respostas do navegador. Bloqueia qualquer
escrita, origem externa ou chamada de API durante a visita estática. Executa
1440×900 e 390×844, produz screenshots e `reports/public-demo/proof.json`.
Falhas JS não são ignoradas. Isso verifica distribuição e navegação; não
substitui a prova de fidelidade visual/capturas canônicas da frente de UX.

Sem `--browser`, HTTP_ARTIFACT pode PASS, mas PUBLIC_SHAREABLE fica NOT_PROVEN
e o processo sai com 1. `--local` só permite loopback e **sempre** conserva
PUBLIC_SHAREABLE=NOT_PROVEN, mesmo com navegador verde. O teste sintético de
15 etapas exercita essa recusa. Sem Chromium, a etapa não passa; instalar o
browser da versão Playwright já adotada pelo lockfile, sem trocar ferramentas.

## Atualização e publicação

1. Integrar ambas as PRs pela main com quatro gates no commit exato; não
   publicar cada push como liberação aprovada. Pode-se congelar candidato.
2. Confirmar no escopo `lucas-projects467` / projeto `arandu-demo` a branch,
   build `npm run vercel-build`, output `dist`, seletor independente e ausência
   de credenciais reais. Não substituir por `ARANDU_ENV=demo`.
3. Publicar somente candidato aprovado pelo fluxo de release existente.
   Esta mudança não altera proteção, domínio, secrets, crons ou Production.
4. Rodar o smoke contra o **domínio atribuído**, com o SHA aprovado, guardar
   JSON/screenshots e verificar a evidência de UX separada. Falha ou versão
   antiga impede PUBLIC_SHAREABLE; deploy SUCCESS isolado não basta.
5. A cada nova liberação, comparar o manifesto e repetir o smoke. Não se
   adiciona job pesado por push: regressões Node entram no check:all existente;
   navegador/publicação são provas explícitas do candidato escolhido.

## Acesso Vercel

A consulta autorizada do projeto retornou 403 para
`team_BBpDcLVx5izJjXz5qBEq2cRy`. Não houve repetição nem troca de escopo. A CLI
não está instalada/autenticada neste executor. Intervenção mínima: na conexão
Vercel usada pelo Codex, conceder acesso de **leitura** ao projeto arandu-demo
no escopo lucas-projects467 e repetir a inspeção. Não enviar token no chat.
Deploy/configuração exigem permissão adicional específica apenas se forem
necessários; não remover Deployment Protection globalmente. O 403 da API não
impediu as leituras públicas anônimas nem significa indisponibilidade do site.
