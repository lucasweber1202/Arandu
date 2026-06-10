# Arandu

Arandu é uma plataforma de curadoria de arte brasileira contemporânea.

O projeto não deve ser ser tratado como e-commerce comum. A proposta central é construir uma experiência digital em que compradores, artistas, arquitetos e empresas sejam conduzidos por curadoria, contexto, trajetória e confiança.

## Como rodar

```bash
npm install
npm run dev
```

## Implementação atual

1. Base visual compartilhada criada em `css/arandu-system.css`.
2. Header e footer padronizados por classes comuns.
3. Textos das novas páginas revisados com acentuação.
4. Projeto preparado para receber a logo final em `assets/logo-arandu.png`.
5. Home conectada às principais áreas da plataforma.
6. Novas abas reais criadas como arquivos HTML próprios.
7. CTAs principais conectados a páginas reais.
8. Minha Seleção implementada com `localStorage` em `js/selection.js`.
9. Responsividade mobile incluída no CSS compartilhado.
10. Estrutura pronta para deploy estático inicial.

## Refatoração pública iniciada

A primeira frente de limpeza prioriza a experiência pública antes de novas funcionalidades.

Concluído na etapa 1:

1. Navegação pública unificada em torno de `Comprar arte`, `Acervo`, `Empresas`, `Confiança`, `Narrativa` e `Explorar`.
2. Proteção para páginas internas, evitando que painel/admin recebam a navegação pública por acidente.
3. Busca pública e fallback de busca limpos, sem entradas antigas de versão anterior.
4. Página `pesquisa.html` atualizada para a nova arquitetura visual e textual.
5. Camada `arandu-architecture.js` tornou-se menos agressiva, removendo ruídos por seletor e não mais por termos amplos como orçamento.

Concluído na etapa 2:

1. Header e footer padronizados diretamente no HTML de `index.html`.
2. Header e footer padronizados diretamente no HTML de `comprar-arte.html`.
3. Header e footer padronizados diretamente no HTML de `acervo.html`.
4. Header e footer padronizados diretamente no HTML de `obras.html`.
5. Header e footer padronizados diretamente no HTML de `empresas.html`.
6. Header e footer padronizados diretamente no HTML de `confianca.html`.
7. Header e footer padronizados diretamente no HTML de `narrativa.html`.
8. Links principais dessas páginas foram alinhados à arquitetura pública final.

Concluído na etapa 3:

1. Header e footer padronizados em `artistas.html`.
2. Header e footer padronizados em `obra.html`.
3. Header e footer padronizados em `minha-selecao.html`.
4. Header e footer padronizados em `proposta-curatorial.html`.
5. Header e footer padronizados em `contato.html`.
6. Header e footer padronizados em `certificado-autenticidade.html`.
7. Header e footer padronizados em `verificar-certificado.html`.
8. `arandu-loader.js` reduzido a loader mínimo, evitando carregar camadas globais repetidas.
9. `obra.html` passou a carregar `js/artwork_page.js` diretamente.
10. Wrapper duplicado `js/artwork-page.js` removido.

Concluído na etapa 4:

1. `artista.html` padronizado com estrutura completa, meta description, header, footer e loader mínimo.
2. `sobre.html` deixou de usar CSS inline próprio e passou para o padrão visual público.
3. `colecoes.html` deixou de usar CSS inline próprio e passou para o padrão visual público.
4. `artista-marina-silveira.html` foi padronizado e seus links de obra migraram para `obra.html?id=...`.
5. `index.html` e `obras.html` ganharam acesso visível à busca pública.
6. `comparar-obras.html`, `como-comprar-na-arandu.html` e `encontrar-arte.html` deixaram de carregar `arandu-experience.js` manualmente.
7. Botões da curadoria guiada em `encontrar-arte.html` receberam `type="button"`.

Concluído na etapa 5:

1. `sitemap.xml` consolidado com arquitetura pública atual e sem rotas antigas prioritárias.
2. `sitemap-interno.xml` atualizado com URLs absolutas para painel, demo e páginas internas.
3. `robots.txt` passou a expor apenas o sitemap público e bloquear rotas internas.
4. WhatsApp centralizado em `data/whatsapp-config.js`, sem número falso de produção.
5. `whatsapp.js` e `reservation.js` passaram a tratar ausência de número real sem abrir link falso.
6. `production-check.mjs` passou a validar número real de WhatsApp e rotas antigas no sitemap.
7. `obra.html`, `obras.html`, `minha-selecao.html` e `proposta-curatorial.html` passaram a carregar a configuração central de WhatsApp.
8. Landing pages de empresa, apartamento, escritórios, hotéis, restaurantes e recepções foram padronizadas com meta description, navegação final, footer e loader mínimo.

Concluído na etapa 6 — Plataforma v1:

1. Documento estratégico criado em `docs/ARANDU_PLATAFORMA_V1.md`.
2. Schema Supabase criado em `docs/supabase-schema.sql`.
3. Validador curatorial criado em `scripts/check-data.mjs`.
4. `check:all` passou a incluir `check:data`.
5. Base de artistas expandida para 12 perfis curatoriais.
6. Base de obras expandida para 20 obras com `artistId` válido.
7. URLs de obras normalizadas para `obra.html?id=...`.
8. Certificados reestruturados com vínculos reais de obra e artista.
9. Busca estática atualizada para o acervo ampliado.

Concluído na etapa 7 — Backend operacional v1:

1. Endpoints públicos criados em `api/forms.js`, `api/reservations.js`, `api/proposals.js` e `api/certificates.js`.
2. Endpoints públicos de leitura criados em `api/catalog.js` e `api/artists.js`.
3. Helper compartilhado criado em `api/_arandu.js`.
4. Formulários passam a tentar `/api/forms` antes do fallback local.
5. Reservas passam a tentar `/api/reservations` antes do fallback local/WhatsApp.
6. Propostas passam a tentar `/api/proposals` por integração complementar em `js/proposal-api.js`.
7. Certificados passam a tentar `/api/certificates` antes do JSON local.
8. Seed Supabase criado em `scripts/seed-supabase.mjs`.
9. Check de backend criado em `scripts/check-backend.mjs` e incluído no `check:all`.
10. Guia operacional criado em `docs/SUPABASE_OPERACAO.md`.

Próximos focos:

1. Configurar Supabase real e rodar `npm run seed:supabase`.
2. Testar fluxos reais de formulário, reserva, proposta e certificado.
3. Evoluir o painel operacional como CRM de curadoria.
4. Consolidar CSS e reduzir dependência de `!important`.
5. Adicionar logo final em `assets/logo-arandu.png`.
6. Configurar o WhatsApp real em `data/whatsapp-config.js`.

## Páginas públicas prioritárias

- `index.html`
- `comprar-arte.html`
- `acervo.html`
- `obras.html`
- `obra.html?id=...`
- `artistas.html`
- `empresas.html`
- `confianca.html`
- `narrativa.html`
- `pesquisa.html`
- `contato.html`
- `minha-selecao.html`
- `proposta-curatorial.html`
- `certificado-autenticidade.html`
- `verificar-certificado.html`

## Validação recomendada

```bash
npm run check:all
npm run build
npm run seed:supabase:dry
```

## Pendências de produção

- Adicionar a logo PNG real.
- Configurar Supabase real no ambiente de produção.
- Popular Supabase com `npm run seed:supabase`.
- Testar envio real de formulários, reservas, propostas e certificados.
- Configurar WhatsApp real.
- Consolidar CSS e reduzir estilos redundantes.
