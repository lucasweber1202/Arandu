# Vercel Env Setup — Arandu

Guia rápido para tirar o Arandu do modo demo/local e deixar a operação pronta para produção.

## 1. Onde configurar

Na Vercel:

1. Abra o projeto do Arandu.
2. Acesse **Settings**.
3. Entre em **Environment Variables**.
4. Cadastre as variáveis abaixo em **Production**.
5. Repita em **Preview** se quiser testar PRs e previews com dados reais.
6. Faça novo deploy depois de salvar.

## 2. Variáveis obrigatórias

| Variável | Obrigatória | Onde usar | Observação |
|---|---:|---|---|
| `SUPABASE_URL` | Sim | API, painel, catálogo, formulários | URL do projeto Supabase. |
| `SUPABASE_ANON_KEY` | Sim | Leitura pública e autenticação | Chave pública anon. Pode existir no front/API. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Operações administrativas servidoras | Nunca expor no front. Usar apenas na Vercel/API. |
| `ARANDU_ADMIN_TOKEN` | Sim | Painel administrativo | Token longo e aleatório. Não usar senha pessoal. |
| `ARANDU_SITE_URL` | Sim | Health check, links públicos, domínio | Exemplo: `https://arandu.art`. |
| `ARANDU_WHATSAPP_NUMBER` | Recomendado | Contato comercial | Formato: `55` + DDD + número, só dígitos. |
| `ARANDU_CONTACT_EMAIL` | Recomendado | Contato comercial alternativo | Use se o WhatsApp ainda não estiver pronto. |

## 3. Modelo para copiar

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=cole_a_chave_anon_aqui
SUPABASE_SERVICE_ROLE_KEY=cole_a_service_role_aqui
ARANDU_ADMIN_TOKEN=gere_um_token_longo_e_aleatorio
ARANDU_SITE_URL=https://seu-dominio-final.com
ARANDU_WHATSAPP_NUMBER=5521999999999
ARANDU_CONTACT_EMAIL=contato@seu-dominio-final.com
```

## 4. Ordem recomendada

1. Criar o projeto no Supabase, se ainda não existir.
2. Em instalação nova: rodar `docs/supabase-schema.sql`, `docs/supabase-production.sql` e `docs/supabase-sprint1-auth-ownership.sql`, nesta ordem.
3. Em banco já existente: rodar primeiro `docs/supabase-sprint1-auth-ownership.sql` e depois executar novamente `docs/supabase-production.sql`.
4. Rodar `docs/arandu-mvp-operacional.sql`.
5. Rodar `docs/arandu-mvp-collections.sql`.
6. Configurar as variáveis na Vercel.
7. Fazer novo deploy.
8. Abrir `/api/health`.
9. Abrir `/api/health?probe=1` para testar tabelas, views e colunas de propriedade.
10. Testar cadastro, confirmação de e-mail, login, Minha Seleção, reserva, Minha Conta e logout.
11. Abrir `/status.html`.
12. Abrir `/painel-admin.html` ou o painel operacional e testar leitura com token.

## 5. Como validar pelo terminal

Antes do deploy:

```bash
npm run check:all
npm run check:security
npm run build
```

Depois do deploy:

```text
/api/health
/api/health?probe=1
/status.html
/comprar-arte.html
/colecoes.html
/painel-mvp.html
```

## 6. Interpretação dos alertas

### Supabase ausente

O site ainda pode abrir, mas endpoints ficam em modo demo/local ou sem persistência real.

### Token administrativo ausente

O painel não deve operar dados reais. Configure `ARANDU_ADMIN_TOKEN` antes de usar administração em produção.

### WhatsApp ausente

Não bloqueia o site, mas prejudica conversão comercial. Configure WhatsApp ou email antes de divulgar.

### Logo final ausente

Não impede deploy técnico, mas deve ser resolvido antes de anúncio público.

## 7. Regra de segurança

Nunca cole `SUPABASE_SERVICE_ROLE_KEY` em arquivo público, HTML, JavaScript do navegador, README público com valor real ou print compartilhado. Essa chave deve ficar apenas na Vercel e em ambientes locais privados.
