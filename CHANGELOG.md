# Changelog — Arandu

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
