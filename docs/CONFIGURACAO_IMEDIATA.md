# Configuração imediata — Arandu

Use este arquivo para preencher produção sem mexer no código.

## 1. Vercel

Adicionar em Project Settings > Environment Variables:

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ARANDU_ADMIN_TOKEN=
ARANDU_WHATSAPP_NUMBER=
ARANDU_CONTACT_EMAIL=
ARANDU_SITE_URL=
```

## 2. Supabase

1. Criar projeto.
2. Abrir SQL Editor.
3. Rodar `docs/supabase-schema.sql`.
4. Copiar URL e chaves para a Vercel.
5. Rodar seed local quando as variáveis estiverem disponíveis.

## 3. WhatsApp

Usar número apenas com dígitos:

```text
55DDDNUMERO
```

Exemplo de formato:

```text
5521999999999
```

## 4. Domínio

Quando definir domínio real:

- atualizar `ARANDU_SITE_URL`;
- revisar `sitemap.xml`;
- revisar Open Graph;
- revisar Search Console.

## 5. Testes depois do deploy

Abrir:

```text
/api/health
/status.html
/api/catalog
/api/artists
/api/auth/session
```

## 6. Próximo passo real

Depois de produção funcionar, substituir dados demonstrativos por:

- 5 artistas reais;
- 20 obras reais;
- imagens autorizadas;
- preços validados;
- certificados quando aplicável.
