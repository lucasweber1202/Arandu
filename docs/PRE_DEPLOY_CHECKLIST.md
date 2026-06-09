# Arandu — Checklist de Pré-Deploy

Use este checklist antes de publicar no Vercel. O objetivo é evitar regressões depois da grande rodada de melhorias visuais, funcionais e curatoriais.

## 1. Validação técnica

Execute:

```bash
npm install --include=optional
npm run build
npm run check:quality
npm run check:all
```

O deploy só deve avançar se `npm run predeploy` passar.

```bash
npm run predeploy
```

## 2. Páginas obrigatórias para teste manual

- `/`
- `obras.html`
- `obra.html?id=estudo-de-solo-04`
- `minha-selecao.html`
- `proposta-curatorial.html`
- `contato.html`
- `autenticidade.html`
- `verificar-certificado.html`
- `encontrar-arte.html`
- `comparar-obras.html`
- `como-comprar-na-arandu.html`

## 3. Header e navegação

- Apenas um botão `Pesquisar` visível.
- Botão `Explorar` funcionando.
- Menu mobile sem duplicidade.
- Links principais ativos:
  - Obras
  - Artistas
  - Narrativas
  - Comunicação
  - Minha seleção

## 4. Busca

Testar buscas por:

- primeira obra
- fotografia
- empresa
- clínica
- certificado
- brasilidade
- acolhimento

## 5. Fluxo de compra

Validar:

1. Home abre corretamente.
2. Acervo carrega obras.
3. Página de obra abre por `obra.html?id=estudo-de-solo-04`.
4. Salvar obra funciona.
5. Minha seleção mostra contagem.
6. Proposta abre a partir da seleção.
7. Contato preserva contexto.

## 6. Camadas visuais

Verificar se não há excesso de elementos flutuantes:

- score de intenção
- seleção flutuante
- modo galeria
- modo silencioso
- command palette
- rodapé fixo
- selo de confiança

No mobile, elementos laterais devem sumir ou não atrapalhar.

## 7. Performance

Verificar:

- Sem erros no console.
- Sem travamento no scroll.
- Sem duplicação de seções automáticas.
- Sem carregamento repetido de scripts.
- Sem excesso visual no mobile.

## 8. Conteúdo e confiança

Validar:

- Não há menção a IA.
- Não há Lorem Ipsum.
- Textos usam tom de galeria curatorial.
- Autenticidade e certificado estão fáceis de encontrar.
- Compra parece consultiva, não genérica.

## 9. Vercel

Antes do deploy:

- Node.js Version Override: `20.x`
- Branch: `main`
- Build command: `npm run build`
- Output directory: `dist`

Depois do limite de deploy resetar, publicar apenas uma vez.
