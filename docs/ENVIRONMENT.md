# Variáveis de ambiente — Arandu

O MVP atual é estático e não depende de variáveis de ambiente para rodar. Este documento prepara a migração futura.

## ARANDU_WHATSAPP_NUMBER

Número oficial da curadoria no formato internacional, apenas dígitos.

Exemplo:

```text
5521999999999
```

Hoje o número também pode ser alterado em `data/whatsapp-config.js`.

## ARANDU_CONTACT_EMAIL

E-mail oficial da Arandu para contato, curadoria, artistas e parceiros.

## ARANDU_SITE_URL

URL final do site em produção. Deve ser usada no sitemap, Open Graph e integrações.

## SUPABASE_URL

URL do projeto Supabase quando o backend for ativado.

## SUPABASE_ANON_KEY

Chave pública anon do Supabase, usada pelo frontend quando houver autenticação, catálogo dinâmico ou formulários reais.

## RESEND_API_KEY

Chave para envio de e-mails transacionais quando formulários reais forem implementados.

## PUBLIC_ANALYTICS_ID

Identificador futuro de analytics, caso seja adotado.

## Regra

Nunca versionar `.env` real com chaves sensíveis. Versionar apenas `.env.example`.
