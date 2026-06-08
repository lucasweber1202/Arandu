# Upgrade para produto real com Vercel — Arandu

Este pacote começa a tirar a Arandu do modo apenas estático e aproxima o projeto de uma operação real em Vercel.

## O que foi implementado

### API routes na Vercel

Foram criadas rotas serverless em `/api`:

- `/api/health` — verifica se a API está viva e se o Supabase está configurado.
- `/api/leads` — recebe contatos, briefings, submissões e seleções.
- `/api/certificates?code=ARD-2026-0001` — verifica certificados.

### Supabase opcional

Foi criado `api/_supabase.js`, que usa Supabase via REST API quando as variáveis existem:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_ANON_KEY`

Se as variáveis não estiverem configuradas, as rotas funcionam em modo demonstração.

### Formulários reais por API

`js/forms.js` agora tenta enviar para `/api/leads`. Se o backend ainda estiver sem Supabase, a API responde em modo demo e o navegador mantém fallback local.

### Certificado por API

`verificar-certificado.html` agora usa `js/certificates.js`, que chama `/api/certificates`.

## Como testar na Vercel

Depois do deploy, abra:

```text
/api/health
/api/leads
/api/certificates?code=ARD-2026-0001
/verificar-certificado.html
/contato.html
/para-artistas.html
/para-arquitetos.html
/minha-selecao.html
```

## Como ativar Supabase

1. Criar projeto Supabase.
2. Rodar `supabase/schema.sql` no SQL Editor.
3. Rodar `supabase/seed.sql` para dados demonstrativos.
4. Na Vercel, adicionar variáveis:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

5. Fazer redeploy.

## Resultado esperado

- Sem Supabase: rotas respondem em modo demo.
- Com Supabase: leads entram na tabela `leads`; certificados podem ser consultados na tabela `certificates`.

## Próxima fase

- Criar painel real para listar leads.
- Criar CRUD real de obras e artistas.
- Persistir Minha Seleção no banco.
- Gerar certificados em PDF.
- Migrar para Next.js quando o catálogo ficar dinâmico.
