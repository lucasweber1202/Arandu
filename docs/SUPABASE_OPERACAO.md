# Supabase — Operação Arandu

Este guia transforma o backend preparado em operação real.

## 1. Criar projeto

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Rode o conteúdo de `docs/supabase-schema.sql`.
4. Em Authentication, confirme se login por email/senha está habilitado.

## 2. Configurar variáveis

No ambiente local ou na Vercel, configure:

```bash
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=chave_publica_anon
SUPABASE_SERVICE_ROLE_KEY=chave_service_role_servidor
ARANDU_ADMIN_TOKEN=um_token_longo_e_privado_para_o_painel
```

Observações:

- `SUPABASE_URL` é obrigatório para operação real.
- `SUPABASE_ANON_KEY` permite autenticação pública e uso do Supabase Auth.
- `SUPABASE_SERVICE_ROLE_KEY` deve ficar apenas no ambiente servidor. Não colocar no front.
- `ARANDU_ADMIN_TOKEN` protege o painel operacional. Use um valor longo, privado e diferente de senhas pessoais.

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

### Seleções salvas

Arquivos:

- `api/selections.js`;
- `js/selection-tools.js`.

Quando o Supabase está configurado, o botão de compartilhar da página `minha-selecao.html` salva a seleção em `saved_selections` e gera um link com `selection_token`. Sem Supabase, o fluxo mantém o link antigo com a seleção codificada na própria URL.

Endpoints:

```text
POST /api/selections
GET /api/selections?token=token_publico
```

### Dashboard

Arquivo: `api/dashboard.js`.

Retorna métricas operacionais para `painel.html` e `minha-conta.html`:

- obras;
- artistas;
- leads;
- certificados;
- reservas;
- propostas;
- submissões;
- briefings;
- tarefas;
- últimos movimentos do pipeline comercial.

### Autenticação

Arquivos:

- `api/auth/session.js`;
- `api/auth/login.js`;
- `api/auth/signup.js`;
- `api/auth/logout.js`;
- `api/auth/_auth.js`.

O fluxo usa Supabase Auth com email e senha. A sessão é guardada em cookie `HttpOnly`, e o front continua usando `js/auth.js`.

Endpoints:

```text
GET /api/auth/session
POST /api/auth/login
POST /api/auth/signup
POST /api/auth/logout
```

### Painel administrativo

Arquivos:

- `api/admin.js`;
- `js/painel-operacional.js`;
- `js/admin-cadastros.js`.

O painel tenta consultar o Supabase quando o usuário informa o `ARANDU_ADMIN_TOKEN` no campo de acesso administrativo. Com Supabase e token configurados, ele passa a:

- listar obras, artistas, certificados, leads, submissões, briefings, propostas, reservas e tarefas pelo backend;
- atualizar status com `PATCH /api/admin`;
- cadastrar artistas, obras, certificados e tarefas com `POST /api/admin`;
- manter fallback local/demo quando o banco ou o token não estiverem disponíveis.

Exemplo de consulta administrativa:

```text
GET /api/admin?panel=leads
Header: x-arandu-admin-token: seu_token
```

Exemplo de cadastro administrativo:

```text
POST /api/admin
Header: x-arandu-admin-token: seu_token
Body: { "type": "artist", "data": { "name": "Nome do artista" } }
```

Exemplo de atualização de status:

```text
PATCH /api/admin
Header: x-arandu-admin-token: seu_token
Body: { "panel": "reservations", "id": "uuid", "status": "confirmed" }
```

### Notas e tarefas operacionais

Arquivos:

- `api/operational.js`;
- `js/painel-detalhes.js`.

O botão `Detalhes` do painel abre um histórico operacional por entidade. Com Supabase e token configurados, é possível:

- consultar notas e tarefas por obra, artista, lead, certificado, proposta, reserva, briefing ou submissão;
- adicionar nota de CRM;
- criar tarefa com responsável, prazo e prioridade;
- marcar tarefa como concluída.

Exemplo de consulta de notas:

```text
GET /api/operational?resource=notes&entity_type=lead&entity_id=uuid
Header: x-arandu-admin-token: seu_token
```

Exemplo de criação de tarefa:

```text
POST /api/operational?resource=tasks
Header: x-arandu-admin-token: seu_token
Body: { "entity_type": "lead", "entity_id": "uuid", "title": "Retornar contato" }
```

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
7. Criar cadastro e fazer login.
8. Compartilhar uma seleção e abrir o link em outro navegador.
9. Abrir o painel, inserir `ARANDU_ADMIN_TOKEN` e alterar o status de um lead, reserva ou proposta.
10. Cadastrar um artista, uma obra e um certificado pelo painel de cadastros.
11. Abrir detalhes de um registro, adicionar nota e criar tarefa.

Quando esses onze fluxos estiverem funcionando, o Arandu está pronto para receber logo final, WhatsApp real e início de prospecção.
