# Deploy, domínio e lançamento — Arandu

## 1. Antes de apontar domínio

Rodar localmente ou no painel do deploy:

```bash
npm run build
npm run check:all
```

Conferir páginas principais:

- `/`
- `/obras.html`
- `/artistas.html`
- `/para-compradores.html`
- `/para-artistas.html`
- `/contato.html`
- `/cadastro.html`
- `/login.html`
- `/painel.html`

## 2. Supabase

No Supabase, rodar nesta ordem:

1. `docs/supabase-schema.sql`
2. `docs/supabase-production.sql`

Depois configurar no Vercel:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ARANDU_ADMIN_TOKEN`

O token administrativo deve ser criado como uma senha longa e usado apenas no ambiente do servidor.

## 3. Vercel não está atualizado

Conferir no projeto do Vercel:

- repositório conectado: `lucasweber1202/Arandu`
- branch de produção: `main`
- último deployment: precisa estar com status `Ready`
- se estiver em `Failed`, abrir logs do build
- se estiver antigo, usar `Redeploy`

Também conferir se houve rollback manual para deployment antigo.

## 4. Domínio

Para `arandu.com.br`, comprar pelo Registro.br e apontar para o Vercel.

Sugestão:

- domínio principal: `arandu.com.br`
- redirecionamento: `www.arandu.com.br` para `arandu.com.br`
- e-mail profissional separado: `contato@arandu.com.br`, `curadoria@arandu.com.br`, `artistas@arandu.com.br`

## 5. Ordem recomendada

1. Corrigir build.
2. Configurar Supabase.
3. Configurar variáveis no Vercel.
4. Fazer redeploy.
5. Testar formulários.
6. Comprar ou conectar domínio.
7. Criar redes sociais.
