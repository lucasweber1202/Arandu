# Bases de dados, cadastros, formulários e padronizações — Arandu

Esta etapa iniciou a base operacional real da Arandu para catálogo, CRM, submissões, empresas, certificados e cadastros internos.

## 1. Banco de dados

`supabase/schema.sql` foi reestruturado para cobrir:

- `profiles`
- `artists`
- `artworks`
- `artwork_images`
- `collections`
- `artwork_collections`
- `certificates`
- `leads`
- `artist_submissions`
- `company_briefs`
- `saved_selections`
- `newsletter_subscriptions`
- `narratives`
- `form_submissions`
- `audit_events`

Também foram adicionados:

- status padronizados;
- check constraints;
- triggers de `updated_at`;
- índices principais;
- políticas RLS básicas;
- trigger de criação automática de perfil ao criar usuário.

## 2. Seed

`supabase/seed.sql` foi alinhado ao novo schema, com artistas, obras, coleções, certificado e narrativas de demonstração.

## 3. Padronização de formulários

Criado `data/form-standards.json` com:

- status de leads;
- status de submissões;
- status de briefs;
- status de obras;
- tipos de perfil;
- eixos curatoriais;
- linguagens;
- tags curatoriais;
- tipos de formulário;
- aliases de campos.

## 4. API de formulários

Criado `/api/forms`, que roteia automaticamente:

- `contato` e `selecao` para `leads`;
- `submissao-artista` para `artist_submissions`;
- `empresa-intencao` e `proposta-empresa` para `company_briefs`;
- `newsletter` para `newsletter_subscriptions`.

`/api/leads` agora reaproveita o roteador de formulários.

## 5. Frontend de formulários

`js/forms.js` foi refeito para:

- padronizar payload;
- coletar página, URL, UTM e referrer;
- anexar seleção salva quando o formulário for do tipo `selecao`;
- anexar quiz curatorial se existir;
- salvar rascunho local;
- enviar para `/api/forms`.

## 6. Cadastros administrativos

Criados:

- `/api/admin/artists`
- `/api/admin/artworks`
- `/api/admin/certificates`
- `api/_admin.js`
- `api/_normalize.js`
- `painel-cadastros.html`
- `js/admin-cadastros.js`

Essas rotas exigem token administrativo.

Variável necessária na Vercel:

```text
ARANDU_ADMIN_TOKEN
```

O painel `painel-cadastros.html` permite iniciar cadastros de artista, obra e certificado.

## 7. Variáveis necessárias

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ARANDU_ADMIN_TOKEN
```

## 8. Como testar

```bash
git pull
npm run check:all
npm run build
```

Depois do deploy:

```text
/api/health
/api/forms
/api/dashboard
/painel-cadastros.html
```

## 9. Próxima etapa recomendada

- transformar `painel-obras.html`, `painel-artistas.html`, `painel-leads.html` e `painel-certificados.html` em dashboards conectados;
- criar edição real de registros;
- criar upload de imagens para Supabase Storage;
- conectar páginas públicas de obras/artistas ao banco;
- criar geração de certificado em PDF.
