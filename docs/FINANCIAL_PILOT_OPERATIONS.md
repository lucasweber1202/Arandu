# Operação do piloto — documentos, identidade, console e rotinas

Migration: `docs/supabase-financial-pilot-grade.sql` (aditiva). Rollback:
`docs/rollback/supabase-financial-pilot-grade.rollback.sql`. Testes:
`tests/database/financial-pilot-grade.sql` (rodam em `npm run test:database`).

## Documentos privados

| Item | Valor |
| --- | --- |
| Bucket | `fin-documents`, criado pela migration com `public = false` |
| Políticas de Storage para o navegador | nenhuma — o bucket só é acessado pelo servidor |
| Tamanho máximo | 10 MB (`10485760` bytes), no bucket, na RPC e na API |
| Tipos aceitos | PDF, JPEG, PNG, XLSX, DOCX (lista fechada) |
| URL de envio | assinada, 120 s, gerada depois de `fin_document_begin_upload` |
| URL de download | assinada, 60 s, gerada depois de `fin_document_authorize_download` |
| O que o banco guarda | bucket, caminho (`org/documento/vN-uuid`, sem nome de arquivo), versão, MIME, tamanho, SHA-256, quem enviou, quando |
| Versões | cada envio para o mesmo documento vira `v1`, `v2`, `v3`…; nada é sobrescrito |
| Remoção | esconde o documento; versões e objetos ficam para retenção e auditoria |
| Trilha | `document_uploaded`, `document_version_added`, `document_downloaded`, `document_removed` — só id do documento, versão, MIME e tamanho |

Fluxo:

1. `POST /api/finance/private-documents/upload` — a RPC, com o token do usuário,
   valida papel, entidade, tipo, tamanho e cria a versão **pendente**. O servidor
   assina a URL de envio com o service role.
2. O navegador faz `PUT` do arquivo direto no Storage (CSP já permite
   `https://*.supabase.co`).
3. `POST /api/finance/private-documents/complete` — só quem iniciou conclui. O
   servidor confere tamanho e tipo reais do objeto e só então publica a versão;
   divergência marca a versão como falha.
4. `POST /api/finance/private-documents/download` — a RPC autoriza e registra o
   download; o servidor assina uma URL de 60 s e não a guarda.

Quem lê:

- a organização dona do documento;
- provedores com convite **aceito** na RFQ, quando a empresa marcou o documento
  como “Visível aos provedores convidados”;
- a empresa compradora, quando o provedor anexou à própria proposta como
  compartilhado.

Provedor nunca lê documento de outro provedor, nem documento interno da empresa.
Contratos e perfil são sempre internos.

## Comentários entre provedores

Antes desta rodada, um comentário “visível ao provedor” escrito por um provedor
era lido por **todos** os provedores do processo, embora a tela dissesse o
contrário. Agora o provedor lê apenas o que a empresa publicou e o que a própria
instituição escreveu. O nome e a instituição de quem escreveu vêm de
`fin_comment_authors`, que só devolve autores de comentários que a pessoa já lê.

## Identidade dos membros

`fin_members.display_name` e `fin_members.job_title`. O nome inicial vem de
`profiles.full_name` quando existir e não for um e-mail. Cada pessoa edita o
próprio registro em Configurações → “Seu nome e cargo” (RPC
`fin_update_my_member_profile`). A API de membros devolve nome e cargo, nunca
e-mail.

## Console operacional (`/finance/ops.html`)

- Acesso: usuário presente em `public.fin_platform_operators` **e** sessão com MFA
  (`aal2`). Papéis das empresas (admin, finance_manager…) não dão acesso.
- Conceder acesso é ação do responsável, direto no banco:
  `insert into public.fin_platform_operators (user_id, granted_by) values ('<uuid>', '<quem autorizou>');`
- Mostra: saúde da configuração (booleanos), últimas execuções do job de
  renovação com request ID e código de erro, outbox de avisos financeiros por
  estado e falhas recentes (id, tentativas, código), envios de documentos
  pendentes ou com falha, marcos de renovação e notificações nas últimas 24 h,
  versão do schema, commit.
- Rastreio por request ID ou UUID de entidade/organização: execuções e tipos de
  evento, sem metadados.
- Não mostra: valores, termos, títulos, e-mails, payloads, documentos.
- Cada abertura e cada rastreio ficam em `fin_ops_access_log`.

## Rotina de renovação

`GET /api/jobs/renewals`, diário pelo cron do Vercel (`vercel.json`), exige
`Authorization: Bearer $CRON_SECRET` com 32+ caracteres. Cada execução é
registrada em `fin_job_runs` com o request ID (`x-vercel-id`). A idempotência é
da função SQL: rodar duas vezes no mesmo dia não duplica tarefa, notificação nem
evento (provado em `tests/database/financial-delivery.sql`).

## E-mail de avisos

Menção, aprovação, proposta e renovação viram e-mail somente se a pessoa pediu
e-mail para aquele tipo **e** `fin_settings.email_enabled = 'true'`. O payload
leva só o tipo e o caminho da tela; idempotência por aviso; no máximo 20 por
destinatário por hora. Provado em `tests/database/financial-delivery.sql` e
`tests/database/financial-pilot-grade.sql`.
