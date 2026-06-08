# Implementação das 20 melhorias — Arandu

Este documento registra o pacote implementado após o pedido de evoluir o MVP antes do próximo `git pull`.

## 1. Página de política comercial

Criada `politica-comercial.html`, com compra, reserva, pagamento, entrega, seguro, certificado, devolução, obras únicas, edições limitadas e responsabilidade da Arandu.

## 2. FAQ

Criada `faq.html`, com dúvidas frequentes sobre autenticidade, certificado, entrega, curadoria, artistas, arquitetos e Minha Seleção.

## 3. Página de curadoria

Criada `curadoria.html`, explicando critérios artísticos, critérios de contexto, confiança e diferença entre curadoria e marketplace.

## 4. Página Certificado Arandu

Criada `certificado-arandu.html`, com modelo visual de certificado, número de registro, dados técnicos, assinatura, procedência e QR code futuro.

## 5. Manifesto

Criada `manifesto.html`, com texto institucional sobre a razão de existência da Arandu e seu posicionamento cultural.

## 6. Menu mobile

Criado `js/site.js`, que injeta automaticamente um botão de menu mobile com base nos links do header.

## 7. Indicador de Minha Seleção no header

`js/site.js` também adiciona link de Minha Seleção com contador baseado no `localStorage`.

## 8. Filtros visuais no catálogo

Criado `js/catalog-filters.js` e atualizado `obras.html` com filtros por pintura, fotografia, escultura, orçamento, ambiente e intenção.

## 9. Busca simples no catálogo

`obras.html` agora tem campo de busca por obra, artista, técnica ou contexto, usando `js/catalog-filters.js`.

## 10. Coleção Primeira Obra

Criada `colecao-primeira-obra.html`, com texto editorial e seleção de obras recomendadas para primeiro comprador.

## 11. Arte para escritório

Criada `arte-para-escritorio.html`, com foco em recepção, sala de reunião, escritório executivo e ambiente corporativo.

## 12. Landing page para artistas

Criada `artistas-convite.html`, uma versão mais direta para prospecção de artistas por WhatsApp, Instagram ou e-mail.

## 13. Página Para arquitetos

Criada `para-arquitetos.html`, separando a jornada de arquitetos da página geral de empresas e projetos.

## 14. Página Para empresas

Criada `para-empresas.html`, com foco em recepções, escritórios, clínicas, hotéis, restaurantes e espaços institucionais.

## 15. Briefing mais específico

As páginas `para-arquitetos.html`, `para-empresas.html` e `empresas-e-arquitetos.html` capturam briefing com informações de projeto, orçamento, medidas, prazo e referências.

## 16. Painel interno mock

Criada `admin-preview.html`, mostrando uma prévia visual do futuro painel administrativo com leads, artistas, briefings, obras, certificados e seleções.

## 17. Roadmap público

Criada `roadmap.html`, com fases de evolução do MVP estático para plataforma completa.

## 18. Componentes e comportamento global

Criado `js/site.js`, que centraliza comportamento global: menu mobile, link ativo e contador da seleção.

## 19. Configuração central do site

Criado `data/site.json`, com marca, tagline, navegação, cores e pilares centrais.

## 20. Guia de conteúdo

Criado `docs/CONTENT_GUIDE.md`, com regras para descrição de obras, bio de artistas, notas curatoriais, textos para arquitetos, artistas e certificados.

## Arquivos também atualizados

- `css/arandu-system.css`
- `obras.html`
- `sitemap.xml`
- `scripts/check-static.mjs`

## Como testar

```bash
npm run check
npm run dev
```

Páginas recomendadas para teste:

- `/obras.html`
- `/faq.html`
- `/politica-comercial.html`
- `/curadoria.html`
- `/certificado-arandu.html`
- `/para-arquitetos.html`
- `/para-empresas.html`
- `/arte-para-escritorio.html`
- `/admin-preview.html`
- `/roadmap.html`
