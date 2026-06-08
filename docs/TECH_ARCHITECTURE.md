# Arquitetura técnica — Arandu

## Estado atual

O projeto está como MVP estático navegável, com HTML, CSS e JavaScript simples. Essa decisão permite validar marca, jornada, catálogo, artistas, arquitetos e formulários antes de investir em backend completo.

## Camadas atuais

- HTML estático para páginas.
- `css/arandu-system.css` como sistema visual compartilhado.
- `js/site.js` para menu mobile, link ativo e contador da seleção.
- `js/selection.js` para Minha Seleção com localStorage.
- `js/forms.js` para captura local de formulários.
- `js/catalog-filters.js` para busca, filtros, ordenação e contador no catálogo.
- `data/catalog.json` e `data/site.json` como preparação para conteúdo estruturado.

## Próxima arquitetura recomendada

1. Manter MVP estático até validar proposta com artistas, arquitetos e compradores.
2. Integrar formulários reais com Supabase ou Resend.
3. Migrar dados de obras e artistas para Supabase.
4. Criar painel administrativo mínimo.
5. Migrar para Astro ou Next.js quando houver catálogo dinâmico e SEO em escala.

## Quando migrar para Next.js

Migrar quando for necessário:

- rotas dinâmicas de obras e artistas;
- banco de dados em produção;
- geração automática de páginas;
- login de artistas ou arquitetos;
- painel administrativo;
- certificados verificáveis;
- checkout ou reserva real.
