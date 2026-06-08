# Expansão operacional — Arandu

Esta rodada ampliou as bases, funções administrativas e painéis para aproximar o projeto de uma operação real de galeria/curadoria.

## Banco de dados adicional

Criado:

```text
supabase/2026_06_operational_expansion.sql
```

Novas tabelas:

- `crm_notes`
- `tasks`
- `proposals`
- `proposal_items`
- `reservations`
- `artwork_events`
- `media_assets`

Essas tabelas permitem acompanhar histórico, tarefas, propostas, reservas, eventos de obra e imagens/arquivos.

## APIs novas

Criadas:

```text
/api/admin/operational
/api/search
/api/public/catalog
/api/public/artists
```

### `/api/admin/operational`

Aceita `resource`:

```text
notes
tasks
proposals
proposal_items
reservations
events
media
```

Suporta:

- `GET`
- `POST`
- `PATCH`

### `/api/search`

Busca pública unificada, com fallback em modo demonstração.

### `/api/public/catalog`

Catálogo público conectado ao Supabase, com filtros básicos por linguagem e status.

### `/api/public/artists`

Lista pública de artistas publicados.

## Painéis operacionais

Atualizado:

```text
js/painel-operacional.js
```

Agora os painéis têm:

- filtros por texto;
- filtros por status;
- métricas atualizadas pelo filtro;
- seleção de múltiplos registros;
- alteração de status em lote;
- exportação CSV filtrada;
- botão de detalhes por registro.

Criado:

```text
js/painel-detalhes.js
```

Esse arquivo abre uma gaveta operacional com:

- histórico de notas;
- criação de notas;
- histórico de tarefas;
- criação de tarefas.

Painéis atualizados:

- `painel-obras.html`
- `painel-artistas.html`
- `painel-leads.html`
- `painel-submissoes.html`
- `painel-briefings.html`
- `painel-certificados.html`

## Como aplicar no Supabase

Depois de rodar o schema principal e o seed:

```sql
-- rode o conteúdo de:
supabase/2026_06_operational_expansion.sql
```

## Como testar

```bash
git pull
npm install
npm run check:all
npm run build
```

Depois do deploy:

```text
/api/search?q=fotografia
/api/public/catalog
/api/public/artists
/painel-obras.html
/painel-leads.html
/painel-submissoes.html
/painel-briefings.html
```

## Próximos limites técnicos

A partir daqui, as próximas funções com maior impacto são:

- geração de certificado em PDF;
- upload real para Supabase Storage;
- páginas públicas renderizadas a partir do banco;
- proposta curatorial em PDF;
- workflow de reserva conectado à obra;
- auditoria automática ao mudar status;
- permissões administrativas por usuário, não apenas token.
