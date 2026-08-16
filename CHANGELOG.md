# Changelog — Arandu

## Não lançado — Integridade transacional e autorização

- Trilha operacional passa a ser gravada por gatilho e cobre também as transições
  internas do banco: reserva criada, reserva expirada, pedido concluído e pedido
  cancelado deixaram de ser invisíveis no histórico da obra.
- Capacidades de conta passam a derivar de fato verificado no servidor. `profile_type`
  vive em `user_metadata`, é editável pela própria pessoa e agora é tratado
  explicitamente como declaração, nunca como permissão.
- Portal do artista exige vínculo ativo em `artist_accounts`, criado por curadoria e
  aceito somente para artista já aprovado, com unicidade garantida por índice.
- Portal da empresa devolve os briefings da própria conta por RLS, sem orçamento,
  mensagem original ou contato.
- Máquina de estados operacional aplica status de obras, artistas, submissões,
  certificados e registros comerciais sob lock, com trilha imutável em
  `operational_status_history`; status deixou de ser campo livre no painel.
- Fluxo real de aprovação de artista: `approved` exige identidade verificada e
  `published` exige consentimento de publicação, ambos ligados ao RBAC de curadoria.
- Obra vendida não retorna a disponível, venda exige preço e disponibilização
  exige autorização de imagem.
- `historico-obra.html` e `historico-artista.html` passam a exibir a trilha real
  de transições, e não apenas eventos inferidos do cadastro.
- Máquina de estados transacional de pedidos rejeita combinações impossíveis entre
  pedido, pagamento, fulfillment e certificado; a API deixou de atualizar a tabela diretamente.
- Upgrade de banco agora aplica e testa migrations de pedidos, incluindo replay,
  RLS entre compradores, auditoria e transições negativas.
- Preflight de staging vincula site, banco e Supabase ao project ref esperado e
  bloqueia coincidência com produção antes de qualquer DDL.
- Verificador operacional de backup/restore valida idade e integridade do dump,
  fingerprint do schema e probes em banco restaurado descartável.
- Evidências de release v3 distinguem preparação, CI, staging, verificação externa
  e falha, com metadados obrigatórios e promoções fail-closed.
- Reservas atômicas com bloqueio da obra e unicidade de reserva ativa.
- Propostas e registros comerciais calculados e criados no PostgreSQL.
- Idempotência serializada, vinculada à identidade e ao payload.
- Clientes Supabase separados para leitura pública, JWT do usuário e service role.
- Escritas diretas anônimas/autenticadas fechadas nos fluxos protegidos.
- RBAC explícito para `admin`, `operator` e `curator`, inclusive nas páginas internas.
- Auditoria transacional minimizada com operador, papel e request ID.
- PostgreSQL descartável na CI para migrations, rollback, RLS e concorrência.
- Snapshots imutáveis da política comercial em reservas, propostas e registros.
- Política comercial central, completa e fail-closed, sem valores vindos do navegador.
- Fluxo operacional de migrations com dry-run, preflight sem PII, backup obrigatório,
  probes pós-migration e canário de escrita.
- Evidências de release tipadas por estágio, validadas e publicadas em relatório
  legível, sem alegar validações externas.
- Intake de catálogo com moeda, situação editorial, autorizações, consentimento,
  duplicidades e relatório por linha.
- Observabilidade com request ID, logs estruturados minimizados e adaptador HTTPS.
- Piloto fechado com tarefas, severidade de feedback, bloqueadores e gate de aprovação.
- Scanner de regressão impede segredos administrativos legados, fallback da service
  role e papéis privilegiados em `user_metadata`.

## v1.1 — Usabilidade, segurança, estética e organização

### Segurança

- CSP passa a ser **aplicada**, não apenas relatada, com `object-src`, `frame-src`
  e `worker-src` fechados e `upgrade-insecure-requests`.
- Novos cabeçalhos de borda: `Cross-Origin-Resource-Policy`,
  `X-Permitted-Cross-Domain-Policies`, `X-DNS-Prefetch-Control`, HSTS de dois anos
  com `preload` e `X-Robots-Tag: noindex` nas respostas de API.
- Guarda de mesma origem (`lib/http-security.mjs`) recusa escrita vinda de outro
  site em `api/[...path].js`, `api/commercial.js` e `api/upload.js`. Clientes
  não-navegador seguem permitidos.
- Cabeçalhos de segurança das respostas de API unificados num único helper
  (`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Vary`).
- Novo gate `npm run check:http`, incluído em `check:security` e `check:all`.

### Usabilidade

- Menu móvel fecha com `Esc` e devolve o foco ao botão; abre com foco no primeiro
  item e trava a rolagem de fundo.
- Item de navegação atual passa a expor `aria-current="page"`.
- Cabeçalho e menu deixam de ser reescritos a cada temporizador — antes o botão
  vinculado e o foco do teclado eram descartados a 300 ms e 1200 ms.
- Corrigido o acúmulo de ouvintes de busca, que reexecutava a filtragem três vezes
  por tecla digitada.
- Alvos de toque da navegação com no mínimo 44 px.

### Estética

- Home volta ao tema claro pretendido: faltava a classe `home-page`, então ela
  recebia o gradiente escuro das páginas internas. O texto de apoio do herói subiu
  de **2,7:1 para 16,4:1** de contraste.
- Corrigido texto creme sobre fundo creme nos cartões da faixa inferior da home
  (colisão entre `arandu-clarity.css` e `arandu-readability-commerce.css`).
- CSS inline da home extraído para `css/arandu-home.css`.
- Nova camada `css/arandu-refinamento.css` com foco visível, `prefers-reduced-motion`,
  alvos de toque e folha de impressão — uma definição só, para o site inteiro.

### Organização

- Removidos 32 arquivos de CSS/JS comprovadamente mortos (~144 KB), confirmados
  por análise estática e por navegação real nas 152 páginas construídas.
- Novo gate `npm run check:assets` impede o retorno de assets órfãos.
- `docs/ARQUITETURA_FRONTEND.md` documenta a ordem de cascata, onde colocar estilo
  novo e as armadilhas de especificidade.

## v1.0 — Execução auditável de produção

- Cadeia dos Sprints 2–12, SEO, PWA e legibilidade consolidada na `main`.
- CI passa a executar todos os contratos, build, SEO de `dist` e jornadas Playwright em desktop e celular.
- Auditoria de variáveis de produção sem expor valores ou segredos.
- Registro obrigatório de evidências externas para Supabase, catálogo, comercial, marca, plataforma, piloto e domínio.
- Bundle reproduzível das migrations com SHA-256 por arquivo e do pacote completo.
- Importador CSV corrigido para os cabeçalhos em português e metadados necessários ao catálogo real.
- Gate comercial reforçado com valores, versões, responsável e data de aprovação.
- Comandos `release:status` e `release:check` para decisão objetiva de lançamento.

## v0.9 — Clareza e legibilidade visual

- Contraste alto e explícito para superfícies claras, heróis, rodapé e cards.
- Títulos com entrelinha mais confortável e escala responsiva menos agressiva.
- Texto corrido maior, com largura e espaçamento adequados para leitura contínua.
- Correção de texto claro sobre fundo claro nas faixas de conversão e segurança.
- Remoção de barras flutuantes duplicadas que cobriam conteúdo no celular.
- Controles, estados de foco, menus e placeholders com leitura mais nítida.
- Verificação automatizada de contraste e da ordem final das camadas de estilo.

## v0.8 — SEO, compartilhamento social e base PWA

- Open Graph e Twitter Cards gerados no build para todas as páginas, com título,
  descrição e imagem social da Arandu.
- Canonical e indexação continuam condicionados a `ARANDU_SITE_URL` em domínio
  próprio; previews da Vercel e páginas internas permanecem `noindex,nofollow`.
- Imagem social 1200×630, favicon e ícones PNG 32/180/192/512 adicionados.
- Manifestos PWA unificados, com `start_url`, `scope`, cores e ícones coerentes.
- Dados estruturados `Organization`, `WebSite` e `SearchAction` na home quando o
  domínio final está configurado.
- Verificação automatizada de SEO/social/PWA integrada a `npm run check:all`,
  incluindo idempotência, dimensões dos assets e teste do gate de domínio.
- Arquivos runtime `favicon.svg`, `manifest.webmanifest` e `site.webmanifest`
  passam a ser copiados explicitamente para `dist/`.

## v0.1 — Base visual inicial

- Estrutura inicial do site.
- Home com posicionamento da Arandu.
- Primeiras páginas de obras, artistas e contato.

## v0.2 — Jornada de curadoria

- Páginas de Encontrar arte, Obras, Coleções, Artistas, Empresas e arquitetos, Para artistas, Autenticidade e Sobre.
- Estrutura de curadoria por contexto.
- Páginas individuais de obra e artista.

## v0.3 — Funcionalidade estática

- `js/selection.js` para Minha Seleção com localStorage.
- `js/forms.js` para captura local de formulários.
- `js/catalog-filters.js` para busca e filtros.
- `js/site.js` para menu mobile e contador da seleção.

## v0.4 — Confiança, políticas e certificado

- FAQ.
- Política comercial.
- Privacidade, termos, cookies, entrega e devolução.
- Certificado Arandu.
- Verificação demonstrativa de certificado.

## v0.5 — Pré-publicação e operação manual

- Mapa do site.
- Configuração interna.
- Templates CSV para CRM, artistas e obras.
- Templates de certificado e proposta.
- Documentação de manutenção, onboarding, certificado, go-to-market e auditoria.

## v0.6 — Qualidade técnica e preparação para produção

- Guia rápido de produção.
- Scripts de checagem de links e pré-produção.
- Documentos de limitações, decisões e snippets.
- Templates reutilizáveis para páginas futuras.
- Estrutura de assets.
- Seed inicial para Supabase.
