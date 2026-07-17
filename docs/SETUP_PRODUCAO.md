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
npm run check:security
npm run check:all
npm run build
```

## 3. Testar preview local

```bash
npm run dev
```

Abrir a porta `5173` no Codespace.

## 4. Configurar Vercel

Em Project Settings > Environment Variables, configurar em Production:

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
api/collections.js
api/commercial.js
api/health.js
api/mvp-dashboard.js
api/upload.js
```

Ou seja: 6 funções serverless no total, ainda abaixo do limite de 12 do plano Hobby.

Não devem existir funções antigas como `api/forms.js`, `api/catalog.js`, `api/admin.js` ou `api/auth/login.js`.

## 6. Configurar Supabase

1. Criar projeto Supabase, se ainda não existir.
2. Em instalação nova, rodar `docs/supabase-schema.sql`, `docs/supabase-production.sql` e `docs/supabase-sprint1-auth-ownership.sql`, nesta ordem.
3. Em banco já existente, rodar primeiro `docs/supabase-sprint1-auth-ownership.sql` e depois executar novamente `docs/supabase-production.sql`.
4. Habilitar login por email/senha e configurar a URL final de redirecionamento em Authentication.
5. Copiar URL, anon key e service role key para a Vercel.
6. Rodar seed:

```bash
npm run seed:supabase:dry
npm run seed:supabase
```

## 7. Testar rotas em produção

```text
/api/catalog
/api/artists
/api/auth/session
/api/account
/api/certificates?code=ARANDU-TESTE
/api/health
/api/health?probe=1
/status.html
```

Sem dados reais, algumas respostas podem vir vazias. O importante é não retornar erro de deploy, função inexistente ou falha de tabela/view.

Teste também o fluxo completo: criar conta, confirmar o e-mail, entrar, salvar uma seleção, solicitar uma reserva, conferir os dois registros em `minha-conta.html` e sair.

## 8. Rodar validação live

Para a URL padrão atual:

```bash
npm run check:live:prod
```

Para outra URL de preview ou domínio:

```bash
npm run check:live -- https://sua-url.vercel.app
```

O script não substitui a validação visual, mas ajuda a detectar:

- API fora do ar;
- JSON inválido;
- Supabase em modo demo;
- variáveis ausentes;
- falhas em `artists`, `artworks`, `v_public_catalog` e `v_sales_pipeline`;
- página `status.html` indisponível.

## 9. Interpretar status.html

A página `status.html` consulta `/api/health?probe=1` e mostra:

- se a API está respondendo;
- se o roteador principal existe;
- se `SUPABASE_URL` está configurada;
- se `SUPABASE_ANON_KEY` está configurada;
- se `SUPABASE_SERVICE_ROLE_KEY` está configurada;
- se `ARANDU_ADMIN_TOKEN` está configurado;
- se o canal de contato está configurado;
- se as tabelas/views principais do Supabase respondem.

Quando todos esses itens estiverem marcados como OK, a parte técnica estará pronta para testar operação real.

## 10. Antes de abrir redes sociais

Confirmar:

- domínio funcionando;
- e-mail ou WhatsApp real funcionando;
- pelo menos 5 artistas reais;
- pelo menos 20 obras reais;
- fotos autorizadas;
- política comercial revisada;
- certificado estruturado;
- 9 posts iniciais prontos.
