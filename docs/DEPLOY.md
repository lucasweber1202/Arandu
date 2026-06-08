# Deploy da Arandu

A versão atual da Arandu funciona como MVP estático. Isso significa que pode ser publicada sem backend em serviços como Vercel, Netlify, GitHub Pages, Cloudflare Pages ou uma hospedagem tradicional.

## Estrutura principal

```text
index.html
encontrar-arte.html
obras.html
colecoes.html
artistas.html
empresas-e-arquitetos.html
para-artistas.html
autenticidade.html
sobre.html
contato.html
css/arandu-system.css
js/selection.js
js/forms.js
assets/logo-arandu.svg
```

## Vercel

1. Conectar o repositório `lucasweber1202/Arandu`.
2. Framework preset: Other.
3. Build command: deixar vazio ou usar `npm run build` apenas se o Vite for mantido.
4. Output directory: raiz do projeto ou `dist`, conforme configuração escolhida.
5. Publicar.

## Netlify

1. Conectar o repositório.
2. Build command: vazio para site estático simples.
3. Publish directory: `.`.
4. Publicar.

## GitHub Pages

1. Ir em Settings > Pages.
2. Selecionar deploy from branch.
3. Branch: main.
4. Folder: root.
5. Salvar.

## Cloudflare Pages

1. Criar novo projeto conectado ao GitHub.
2. Framework preset: None.
3. Build command: vazio.
4. Output directory: `/`.
5. Publicar.

## Antes do deploy público

- Subir a logo PNG final em `assets/logo-arandu.png`.
- Conferir todos os links internos.
- Revisar textos finais.
- Definir domínio.
- Adicionar URL final no `sitemap.xml`.
- Trocar formulários locais por integração real quando necessário.

## Limitações atuais

- Formulários salvam localmente no navegador.
- Minha Seleção usa localStorage.
- Não há banco de dados.
- Não há painel administrativo.
- Não há checkout ou pagamento.
- Não há envio automático de e-mail.
