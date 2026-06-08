# Novo pacote de 20 melhorias implementadas — Arandu

Este documento registra a nova rodada de melhorias solicitada para deixar o MVP mais próximo de uma operação real.

## 1. Preparação para estrutura mais limpa

Foram reforçados arquivos compartilhados e de comportamento global:

- `css/arandu-system.css`
- `js/site.js`
- `data/site.json`
- `data/catalog.json`

## 2. Home e plataforma

A home já estava estruturada como entrada da plataforma. Nesta rodada, a prioridade foi ampliar páginas de suporte, políticas e rotas comerciais para fortalecer a navegação geral.

## 3. Dados mockados mais consistentes

`data/catalog.json` foi expandido com 6 obras, 4 artistas e coleções com URLs.

## 4. Mais páginas de obra e artista

Criadas:

- `obra-sertao-silencioso.html`
- `obra-equilibrio-suspenso.html`
- `artista-camila-reboucas.html`
- `artista-arthur-davila.html`

## 5. Catálogo melhorado

`obras.html` agora tem:

- busca;
- filtros;
- ordenação por preço;
- contador de resultados;
- limpar filtros;
- cards com `data-price`, `data-tags`, `data-search` e `data-order`.

## 6. Minha Seleção evoluída

`js/selection.js` e `minha-selecao.html` agora incluem:

- observações por obra;
- copiar seleção;
- envio por WhatsApp;
- resumo textual;
- campos de orçamento, ambiente e prazo.

## 7. Integração com WhatsApp

Criado `js/whatsapp.js` para gerar links `wa.me` com mensagens prontas para:

- falar com a curadoria;
- demonstrar interesse em obra;
- enviar seleção.

## 8. Verificação de certificado

Criada `verificar-certificado.html`, com simulação de consulta pelo código `ARD-2026-0001`.

## 9. Políticas obrigatórias

Criadas:

- `privacidade.html`
- `termos-de-uso.html`
- `cookies.html`
- `politica-de-entrega.html`
- `politica-de-devolucao.html`

## 10. SEO e compartilhamento

Adicionados e atualizados:

- `favicon.svg`
- `site.webmanifest`
- metadados em páginas novas;
- `sitemap.xml` expandido.

## 11. Assets de marca

Criado `favicon.svg` e `site.webmanifest`. O PNG final da logo ainda deve ser adicionado manualmente em `assets/logo-arandu.png`.

## 12. Press kit

Criada `press-kit.html`, com descrição curta, descrição média, tagline, paleta e contato.

## 13. Newsletter

Criada `newsletter.html`, com formulário local usando `js/forms.js`.

## 14. Documentação técnica

Criados:

- `docs/TECH_ARCHITECTURE.md`
- `docs/DATA_SCHEMA.md`
- `docs/MIGRATION_TO_NEXT.md`
- `docs/BACKEND_PLAN.md`

## 15. Preparação para Supabase

`supabase/schema.sql` foi expandido com tabelas para artistas, obras, coleções, leads, submissões, briefings, certificados e seleções.

## 16. Painel operacional visual

Criadas páginas mock de painel:

- `painel-obras.html`
- `painel-artistas.html`
- `painel-leads.html`
- `painel-certificados.html`

## 17. Páginas comerciais reforçadas

Já existiam páginas para arquitetos, empresas e artistas. Nesta rodada, foram fortalecidos os caminhos relacionados a WhatsApp, briefing, políticas, certificado e catálogo.

## 18. Textos de prospecção

Criados:

- `docs/PROSPECCAO_ARTISTAS.md`
- `docs/PROSPECCAO_ARQUITETOS.md`
- `docs/PROSPECCAO_EMPRESAS.md`

## 19. Demo mode

Criada `demo.html`, explicando o que funciona no MVP e o que ainda é simulado.

## 20. Performance, qualidade e checagem

Atualizados:

- `scripts/check-static.mjs`
- `sitemap.xml`
- `css/arandu-system.css`

O checker agora contempla o conjunto expandido de páginas e arquivos.

## Como testar

```bash
npm run check
npm run dev
```

Páginas recomendadas para teste:

- `/obras.html`
- `/minha-selecao.html`
- `/verificar-certificado.html`
- `/privacidade.html`
- `/termos-de-uso.html`
- `/politica-de-entrega.html`
- `/press-kit.html`
- `/newsletter.html`
- `/demo.html`
- `/painel-obras.html`
