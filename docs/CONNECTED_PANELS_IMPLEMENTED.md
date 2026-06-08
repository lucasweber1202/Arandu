# Painéis conectados — Arandu

Esta etapa transformou os painéis que eram apenas prévias visuais em módulos conectados às rotas administrativas.

## Páginas conectadas

- `painel.html`
- `painel-obras.html`
- `painel-artistas.html`
- `painel-leads.html`
- `painel-certificados.html`
- `painel-submissoes.html`
- `painel-briefings.html`

## JavaScript criado

- `js/painel-operacional.js`

Esse arquivo:

- lê a chave administrativa salva no navegador;
- carrega dados das rotas administrativas;
- mostra métricas por status;
- lista registros em tabela;
- permite alterar status;
- exporta CSV.

## API criada

- `api/admin/crm.js`

Essa rota cobre:

```text
/api/admin/crm?type=leads
/api/admin/crm?type=submissions
/api/admin/crm?type=briefs
/api/admin/crm?type=newsletters
/api/admin/crm?type=selections
```

Também foram aproveitadas rotas já criadas:

```text
/api/admin/artists
/api/admin/artworks
/api/admin/certificates
```

## Como acessar

1. Configure na Vercel:

```text
ARANDU_ADMIN_TOKEN
```

2. Abra uma página do painel, por exemplo:

```text
/painel-obras.html
```

3. Cole a mesma chave administrativa no campo do painel.

4. Clique em atualizar.

## O que já funciona

- Listagem de obras, artistas, certificados, leads, submissões e briefings.
- Métricas simples por status.
- Mudança de status.
- Exportação CSV.
- Navegação central pelo `painel.html`.

## Próximas etapas recomendadas

- Criar edição expandida por modal ou página dedicada.
- Adicionar filtros por status, linguagem e origem.
- Conectar upload de imagens.
- Criar geração automática de certificado em PDF.
- Conectar páginas públicas ao conteúdo do banco.
