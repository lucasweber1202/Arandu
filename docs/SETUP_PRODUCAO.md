# Setup de produção — Arandu

## 1. Puxar a versão atual

No Codespace:

```bash
git checkout main
git pull origin main
npm install
```

## 2. Validar localmente

```bash
npm run check:backend
npm run check:all
npm run build
```

## 3. Testar preview local

```bash
npm run dev
```

Abrir a porta `5173` no Codespace.

## 4. Configurar Vercel

Em Project Settings > Environment Variables, configurar:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ARANDU_ADMIN_TOKEN=
ARANDU_WHATSAPP_NUMBER=
ARANDU_CONTACT_EMAIL=
ARANDU_SITE_URL=
```

Depois rodar novo deploy.

## 5. Confirmar que o erro de funções sumiu

A arquitetura atual usa:

```text
api/[...path].js
api/health.js
```

Ou seja: 2 funções serverless no total, ainda abaixo do limite de 12 do plano Hobby.

Não devem existir funções antigas como `api/forms.js`, `api/catalog.js`, `api/admin.js` ou `api/auth/login.js`.

## 6. Configurar Supabase

1. Criar projeto Supabase.
2. Rodar `docs/supabase-schema.sql` no SQL Editor.
3. Habilitar login por email/senha em Authentication.
4. Copiar URL, anon key e service role key para a Vercel.
5. Rodar seed:

```bash
npm run seed:supabase:dry
npm run seed:supabase
```

## 7. Testar rotas em produção

```text
/api/catalog
/api/artists
/api/auth/session
/api/certificates?code=ARANDU-TESTE
/api/health
/status.html
```

Sem dados reais, algumas respostas podem vir vazias. O importante é não retornar erro de deploy ou função inexistente.

## 8. Interpretar status.html

A página `status.html` consulta `/api/health` e mostra:

- se a API está respondendo;
- se o roteador principal existe;
- se `SUPABASE_URL` está configurada;
- se `SUPABASE_ANON_KEY` está configurada;
- se `SUPABASE_SERVICE_ROLE_KEY` está configurada;
- se `ARANDU_ADMIN_TOKEN` está configurado.

Quando todos esses itens estiverem marcados como configurados, a parte técnica estará pronta para testar operação real.

## 9. Antes de abrir redes sociais

Confirmar:

- domínio funcionando;
- e-mail ou WhatsApp real funcionando;
- pelo menos 5 artistas reais;
- pelo menos 20 obras reais;
- fotos autorizadas;
- política comercial revisada;
- certificado estruturado;
- 9 posts iniciais prontos.
