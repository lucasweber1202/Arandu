# Supabase — Operação Arandu

Este guia transforma o backend preparado em operação real.

## 1. Criar projeto

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Rode o conteúdo de `docs/supabase-schema.sql`.

## 2. Configurar variáveis

No ambiente local ou na Vercel, configure:

```bash
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=chave_publica_anon
SUPABASE_SERVICE_ROLE_KEY=chave_service_role_servidor
```

Observações:

- `SUPABASE_URL` é obrigatório para operação real.
- `SUPABASE_ANON_KEY` permite leitura/escrita conforme políticas do banco.
- `SUPABASE_SERVICE_ROLE_KEY` deve ficar apenas no ambiente servidor. Não colocar no front.

## 3. Validar backend

Sem variáveis, o backend roda em modo demo/local:

```bash
npm run check:backend
```

Com variáveis configuradas, rode:

```bash
npm run check:all
npm run build
```

## 4. Testar seed sem enviar dados

Antes de popular o banco:

```bash
npm run seed:supabase:dry
```

Esse comando valida quantidade de artistas, obras e certificados sem gravar nada.

## 5. Popular banco

Depois de aplicar o schema e configurar variáveis:

```bash
npm run seed:supabase
```

O seed faz upsert de:

- `data/artists.json` em `artists`;
- `data/artworks.json` em `artworks`;
- `data/certificates.json` em `certificates`.

## 6. Reimportação

O seed usa conflito por chave:

- artistas: `id`;
- obras: `id`;
- certificados: `code`.

Assim, pode ser rodado novamente para atualizar a base.

Para limpar artistas, obras e certificados antes do seed:

```bash
ARANDU_SEED_RESET=1 npm run seed:supabase
```

Use reset com cuidado, especialmente quando já houver reservas, propostas e certificados emitidos.

## 7. Fluxos que passam a gravar no banco

### Formulários

Arquivo: `api/forms.js`.

Destino:

- contato geral: `leads`;
- submissão de artista: `artist_submissions`;
- empresa/proposta: `company_briefs`;
- newsletter: `newsletter_subscriptions`.

### Reservas

Arquivo: `api/reservations.js`.

Destino:

- `reservations`.

A reserva mantém fallback local no navegador quando o banco não está configurado.

### Propostas

Arquivo: `api/proposals.js`.

Destino:

- `proposals`;
- `proposal_items`.

A integração pública está em `js/proposal-api.js`.

### Certificados

Arquivo: `api/certificates.js`.

Consulta pública por código:

```text
/api/certificates?code=ARD-2026-0001
```

O front tenta API primeiro e usa `data/certificates.json` como fallback.

## 8. Critério para seguir para WhatsApp e logo

Antes de configurar WhatsApp real e logo final, confirmar:

```bash
npm run check:all
npm run build
npm run seed:supabase:dry
```

E, com Supabase real:

```bash
npm run seed:supabase
```

Depois testar manualmente:

1. Enviar formulário de contato.
2. Enviar submissão de artista.
3. Enviar briefing de empresa.
4. Criar reserva de obra.
5. Criar proposta curatorial.
6. Verificar certificado por código.

Quando esses seis fluxos estiverem funcionando, o Arandu está pronto para receber logo final, WhatsApp real e início de prospecção.
