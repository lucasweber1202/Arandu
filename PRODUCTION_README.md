# Arandu — Guia rápido de produção

Este arquivo resume o que precisa ser feito antes de hospedar a Arandu em domínio público.

## Páginas públicas recomendadas

- `index.html`
- `encontrar-arte.html`
- `obras.html`
- páginas individuais de obras
- `colecoes.html`
- páginas de coleções
- `artistas.html`
- páginas individuais de artistas
- `para-artistas.html`
- `para-arquitetos.html`
- `para-empresas.html`
- `curadoria.html`
- `autenticidade.html`
- `certificado-arandu.html`
- `verificar-certificado.html`
- `faq.html`
- políticas
- `contato.html`
- `press-kit.html`

## Páginas internas ou de demonstração

Não divulgar como produto final:

- `demo.html`
- `roadmap.html`
- `admin-preview.html`
- `painel-obras.html`
- `painel-artistas.html`
- `painel-leads.html`
- `painel-certificados.html`
- `mapa-do-site.html`
- `configuracao.html`

## Antes de publicar

1. Adicionar a logo real em `assets/logo-arandu.png`.
2. Trocar o WhatsApp em `data/whatsapp-config.js`.
3. Atualizar e-mail oficial em `data/site.json`.
4. Revisar políticas com apoio jurídico.
5. Remover linguagem de MVP das páginas públicas.
6. Rodar `npm run check`.
7. Rodar `npm run check:links`.
8. Rodar `npm run check:production`.
9. Testar mobile.
10. Atualizar `sitemap.xml` com domínio real quando houver.

## O que ainda é simulado

- Formulários não enviam para servidor.
- Minha Seleção usa o navegador do usuário.
- Certificado é demonstrativo.
- Painel é apenas mock.
- Não há pagamento, login, reserva real ou banco de dados.

## Comandos

```bash
npm install
npm run check
npm run check:links
npm run check:production
npm run dev
```
