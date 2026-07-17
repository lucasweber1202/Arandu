# Supabase — Operação Arandu

Este guia transforma o backend preparado em operação real.

## 1. Arquitetura atual

A operação de API está consolidada para caber no plano Hobby da Vercel:

```text
api/[...path].js
api/health.js
```

As rotas públicas continuam existindo, mas não devem mais ser implementadas como arquivos separados dentro de `api/`.

Não recriar:

```text
api/forms.js
api/reservations.js
api/proposals.js
api/catalog.js
api/artists.js
api/admin.js
api/dashboard.js
api/auth/login.js
```

Cada arquivo separado em `api/` conta como uma Serverless Function na Vercel.

## 2. Criar projeto Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Rode o conteúdo de `docs/supabase-schema.sql`.
4. Em Authentication, confirme se login por email/senha está habilitado.

## 3. Configurar variáveis

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

## 4. Validar backend

Sem variáveis, o backend roda em modo demo/local:

```bash
npm run check:backend
```

Com variáveis configuradas, rode:

```bash
npm run check:all
npm run build
```

Depois do deploy, abra:

```text
/api/health
/status.html
```

## 5. Testar seed sem enviar dados

Antes de popular o banco:

```bash
npm run seed:supabase:dry
```

Esse comando valida quantidade de artistas, obras e certificados sem gravar nada.

## 6. Popular banco

Depois de aplicar o schema e configurar variáveis:

```bash
npm run seed:supabase
```

O seed faz upsert de:

- `data/artists.json` em `artists`;
- `data/artworks.json` em `artworks`;
- `data/certificates.json` em `certificates`.

## 7. Reimportação

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

## 8. Fluxos que passam a gravar no banco

### Formulários

Endpoint público:

```text
POST /api/forms
```

Destino:

- contato geral: `leads`;
- submissão de artista: `artist_submissions`;
- empresa/proposta: `company_briefs`;
- newsletter: `newsletter_subscriptions`.

### Reservas

Endpoint público:

```text
POST /api/reservations
```

Destino:

- `reservations`.

A reserva mantém fallback local no navegador quando o banco não está configurado.

### Propostas

Endpoint público:

```text
POST /api/proposals
```

Destino:

- `proposals`;
- `proposal_items`.

A integração pública está em `js/proposal-api.js`.

### Certificados

Consulta pública por código:

```text
GET /api/certificates?code=ARD-2026-0001
GET /api/certificate-document?code=ARD-2026-0001
```

O front tenta API primeiro e usa `data/certificates.json` como fallback.

### Catálogo e artistas

Leitura pública:

```text
GET /api/catalog
GET /api/artists
```

Essas rotas alimentam páginas públicas quando o Supabase está configurado.

### Seleções salvas

Quando o Supabase está configurado, a página `minha-selecao.html` sincroniza automaticamente a seleção da conta autenticada. O botão de compartilhar gera um link com `selection_token`. Sem Supabase, o fluxo mantém o link antigo com a seleção codificada na própria URL.

Endpoints:

```text
POST /api/selections
GET /api/selections?token=token_publico
DELETE /api/selections
```

O GET público devolve somente obras, briefing sem campos pessoais, status e datas. A leitura direta da tabela pelo token deve permanecer desabilitada.
O DELETE exige sessão e remove somente a seleção aberta do comprador autenticado.

### Conta do comprador

Endpoint autenticado por cookie `HttpOnly`:

```text
GET /api/account
```

Retorna somente seleções e reservas cujo `user_id` corresponde à sessão atual.

### Dashboard

Endpoint:

```text
GET /api/dashboard
Header: x-arandu-admin-token: seu_token
```

Retorna métricas operacionais somente para os painéis internos:

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

Endpoints:

```text
GET /api/auth/session
POST /api/auth/login
POST /api/auth/signup
POST /api/auth/logout
```

O fluxo usa Supabase Auth com email e senha. A sessão é guardada em cookie `HttpOnly`, e o front continua usando `js/auth.js`.

### Painel administrativo

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

### Edição administrativa completa

Endpoint:

```text
PATCH /api/admin-update
Header: x-arandu-admin-token: seu_token
```

Uso previsto para edição de campos de artistas, obras, certificados e tarefas.

### Notas e tarefas operacionais

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

### Mídia

Endpoint:

```text
GET /api/media?entity_type=artwork&entity_id=id_da_obra
POST /api/media
Header: x-arandu-admin-token: seu_token
```

Uso previsto para associar imagens e materiais a obras, artistas e entidades operacionais.

## 9. Critério para seguir para WhatsApp e logo

Antes de configurar WhatsApp real e logo final, confirmar:

```bash
npm run check:all
npm run build
```

Depois, confirmar em produção:

```text
/status.html
/api/health
```

## 10. Próximo passo após Supabase configurado

1. Rodar seed.
2. Testar `/api/catalog`.
3. Testar `/api/artists`.
4. Testar `/api/certificates?code=...`.
5. Testar envio de formulário.
6. Testar reserva.
7. Testar proposta.
8. Testar login.
9. Testar painel com `ARANDU_ADMIN_TOKEN`.
10. Trocar base demonstrativa por artistas e obras reais.
