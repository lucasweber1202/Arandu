# Arandu

Arandu é uma plataforma de curadoria de arte brasileira contemporânea.

O projeto não deve ser tratado como e-commerce comum. A proposta central é construir uma experiência digital em que compradores, artistas, arquitetos e empresas sejam conduzidos por curadoria, contexto, trajetória e confiança.

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

Próximos focos:

1. Consolidar CSS e reduzir dependência de `!important`.
2. Padronizar definitivamente rotas de obra em páginas antigas remanescentes.
3. Separar site público, páginas internas e painel no sitemap.
4. Configurar logo final, WhatsApp real, sitemap e certificados não demonstrativos.
5. Revisar páginas antigas para redirecionamento, arquivamento ou remoção.

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
```

## Pendências de produção

- Adicionar a logo PNG real.
- Reduzir estilos inline remanescentes.
- Ativar formulários com envio real.
- Configurar WhatsApp real.
- Remover conteúdos demonstrativos de certificado.
- Criar painel administrativo funcional com backend conectado.
- Evoluir Minha Seleção para banco de dados.
