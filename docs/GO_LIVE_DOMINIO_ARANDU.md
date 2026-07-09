# Arandu — checklist de domínio e go-live

Este roteiro é para o dia em que a Vercel liberar novos deploys e o domínio for comprado.

## 1. Antes de comprar o domínio

Priorize um domínio curto, pronunciável e sem hífen. Exemplos de estrutura:

- `arandu.com.br`
- `arandu.art.br`
- `arandu.art`
- `arandu.art.br` como opção mais alinhada à proposta cultural, caso esteja disponível.

Evite variações longas ou com palavras genéricas demais, porque a marca precisa parecer galeria/plataforma premium.

## 2. Na Vercel

1. Abra `Project arandu → Deployments`.
2. Confirme que o commit mais recente da `main` foi publicado.
3. Abra `Project arandu → Settings → Domains`.
4. Adicione o domínio raiz, por exemplo `arandu.com.br`.
5. Adicione também `www.arandu.com.br`.
6. Siga exatamente os registros DNS indicados pela Vercel.
7. Espere o status de domínio ficar válido.
8. Confirme HTTPS ativo.
9. Defina o domínio principal de produção.

## 3. Variáveis de ambiente na Vercel

Conferir em `Settings → Environment Variables`:

```txt
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ARANDU_ADMIN_TOKEN=
ARANDU_SITE_URL=https://SEU-DOMINIO
ARANDU_WHATSAPP_NUMBER=55DDNUMERO
ARANDU_CONTACT_EMAIL=contato@SEU-DOMINIO
ARANDU_STORAGE_BUCKET=arandu-media
```

Depois de alterar variáveis, faça um redeploy único.

## 4. Supabase

1. Confirmar tabelas, views e RLS.
2. Confirmar Auth por e-mail/senha.
3. Criar/confirmar bucket público `arandu-media`.
4. Subir uma imagem por `upload-imagens.html`.
5. Aplicar a imagem a uma obra real.
6. Testar catálogo público.
7. Testar painel admin com `ARANDU_ADMIN_TOKEN`.

## 5. URLs para validar

```txt
/
/comprar-arte.html
/artistas.html
/confianca.html
/pesquisa.html
/narrativa.html
/login.html
/colecoes.html
/como-funciona.html
/faq.html
/verificar-certificado.html
/painel-admin.html
/upload-imagens.html
/dominio-go-live.html
/status.html
/api/health
/sitemap.xml
/robots.txt
/manifest.webmanifest
```

## 6. Teste visual mínimo

Em desktop e celular:

- O menu deve aparecer em todas as páginas públicas.
- `Entrar` deve estar destacado.
- O assistente Arandu deve aparecer nas páginas públicas.
- Comprar deve exibir filtros e cards legíveis.
- Narrativa não pode ter cards espremidos.
- Confiança deve ter contraste suficiente.
- Login deve ter visual claro para Comprador, Artista e Empresa.

## 7. SEO mínimo

Antes de divulgar:

- `robots.txt` acessível.
- `sitemap.xml` acessível.
- `manifest.webmanifest` acessível.
- Home com título e descrição.
- Comprar, Artistas, Confiança, Narrativa e Pesquisa com titles próprios.
- Trocar URLs do sitemap para o domínio final quando o domínio estiver definido.

## 8. Critério de pronto para divulgar

A Arandu pode ser divulgada quando:

- Deploy mais recente está `Ready`.
- `/api/health` responde.
- Menu e assistente aparecem nas páginas públicas.
- Supabase grava pelo menos leads/reservas.
- Há pelo menos 5 artistas reais.
- Há pelo menos 20 obras reais.
- O domínio final está com HTTPS.
- WhatsApp/e-mail reais funcionam.
- Certificado e política comercial estão compreensíveis.

## 9. Se algo quebrar amanhã

1. Não faça vários redeploys seguidos.
2. Abra a página quebrada com `Ctrl + F5`.
3. Abra `F12 → Console`.
4. Copie o erro vermelho.
5. Teste a mesma página no Codespace com `npm run dev`.
6. Compare com a Vercel apenas depois de confirmar que o commit mais recente foi publicado.
