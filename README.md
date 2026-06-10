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

Concluído nesta etapa:

1. Navegação pública unificada em torno de `Comprar arte`, `Acervo`, `Empresas`, `Confiança`, `Narrativa` e `Explorar`.
2. Proteção para páginas internas, evitando que painel/admin recebam a navegação pública por acidente.
3. Busca pública e fallback de busca limpos, sem entradas antigas de versão anterior.
4. Página `pesquisa.html` atualizada para a nova arquitetura visual e textual.
5. Camada `arandu-architecture.js` tornou-se menos agressiva, removendo ruídos por seletor e não mais por termos amplos como orçamento.

Próximos focos:

1. Padronizar headers e footers diretamente no HTML das páginas públicas.
2. Consolidar CSS e reduzir dependência de `!important`.
3. Padronizar rotas de obra em `obra.html?id=...`.
4. Separar definitivamente site público, páginas internas e painel.
5. Configurar logo final, WhatsApp real, sitemap e certificados não demonstrativos.

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
