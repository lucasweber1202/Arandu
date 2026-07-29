# Autenticação administrativa e MFA

## Estado implementado

O Arandu não aceita mais `ARANDU_ADMIN_TOKEN` nas APIs privilegiadas. A administração usa a mesma sessão Supabase Auth mantida em cookie `HttpOnly`, com autorização verificada no servidor.

O acesso exige simultaneamente:

1. usuário e senha válidos no Supabase Auth;
2. papel em `app_metadata.arandu_role`;
3. papel igual a `admin`, `operator` ou `curator`;
4. fator TOTP verificado;
5. access token com `aal=aal2`;
6. conta não desativada por `app_metadata.arandu_disabled`.

Campos em `user_metadata` nunca concedem acesso administrativo.

## Bootstrap da primeira conta

1. Crie o usuário no Supabase Auth ou faça um cadastro normal.
2. No servidor/SQL Editor, atribua o papel em `raw_app_meta_data`. Nunca ofereça essa alteração ao navegador:

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('arandu_role', 'admin')
where email = 'SUBSTITUA_PELO_EMAIL_ADMINISTRATIVO';
```

3. Cadastre e verifique um fator TOTP para a conta pelo fluxo oficial do Supabase.
4. Revogue as sessões anteriores à mudança de papel.
5. Acesse `/admin-login.html`, entre e confirme o código TOTP.

Não execute o SQL sem substituir o e-mail. Não versione e-mail, senha, QR code, seed TOTP, recovery code, access token ou service role.

## Revogação e desligamento

Para retirar acesso imediatamente:

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  - 'arandu_role'
  || jsonb_build_object('arandu_disabled', true)
where id = 'SUBSTITUA_PELO_UUID_DO_USUARIO';
```

Depois, revogue as sessões do usuário no painel do Supabase. A API também rejeita sessões expiradas, papéis ausentes e contas marcadas como desativadas.

## Superfícies protegidas

As páginas listadas em `lib/internal-pages.mjs`:

- não entram no `dist` estático;
- são reescritas pela Vercel para `api/internal-page.js`;
- só recebem HTML depois de sessão, papel e MFA válidos;
- usam `no-store`, `noindex`, CSP e frame denial.

`/api/health` é público e retorna apenas liveness. Diagnóstico de ambiente, banco e release fica em `/api/readiness`, protegido pelos mesmos controles administrativos.

## Validação

```bash
npm run check:admin-auth
npm run check:security
npm run build
```

Após o build, nenhuma página de `lib/internal-pages.mjs` pode existir em `dist/`.
