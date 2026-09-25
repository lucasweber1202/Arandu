# Operação diária do Financial Procurement

## Colaboração e isolamento

`fin_comments` é append-only por RPC. Cada comentário aponta para um objeto
cuja organização compradora é resolvida pelo banco. Comentários `internal`
são lidos apenas pela empresa compradora. `provider_visible` exige ação
explícita no formulário e só se aplica a RFQ/proposta; provedores aceitos na
RFQ veem os comentários compartilhados do processo, e um provedor vê
comentários compartilhados de sua própria proposta. Nenhum comentário é
enviado como HTML. Identificadores de cliente tornam retry idempotente.

Mentions internas aceitam IDs de até dez membros da organização. A função
valida associação antes de criar notificações. A timeline lê `fin_events`
paginados; metadados contêm IDs, contagens e visibilidade, sem corpo do
comentário. Não há edição ou exclusão silenciosa de evidência.

`fin_notifications` pertence a um usuário e organização; RLS e RPC de
marcação impedem que outro usuário marque ou leia. Preferências por evento
podem desligar notificações in-app. A preferência de e-mail fica registrada
com padrão desligado; **não dispara e-mail**. Não existe integração desta
nova categoria com o dispatcher transacional legado, que exige revisão de
templates, consentimento e credenciais próprias antes de ativar.

## Busca

`fin_search` aceita 2–100 caracteres, tipo opcional, lote de no máximo 30
e offset limitado. A função verifica papel comprador e restringe cada ramo
da consulta por `organization_id`. Retorna somente metadados de navegação:
título, status/prazo público para a empresa e URL interna. Nunca retorna
termos, notas, tokens, comentário ou condição financeira. O command center
usa debounce e descarta resposta de busca obsoleta; ações rápidas seguem
disponíveis sem consulta.

A implementação usa `position(lower(query) in lower(field))` em cada ramo.
No volume atual, consulta paginada e filtro de tenant são suficientes. Antes
de escalar para milhares de itens por organização, medir com
`EXPLAIN (ANALYZE, BUFFERS)` e considerar índices de texto/trigram por campo
consultado. Nenhum índice especulativo foi criado.

## Rascunho de RFQ

`fin_rfq_editor_drafts` guarda uma edição por pessoa e organização. O
navegador envia após 650 ms sem digitação, exibe salvando/salvo/falha e
permite retry. A RPC compara `revision` atomically no `ON CONFLICT`:
uma aba antiga recebe 409 e precisa recarregar. O GET só expõe o próprio
rascunho via RLS. O wizard cria a RFQ a partir do estado atual e tenta
descartar o rascunho correspondente. Se o descarte falhar após a RFQ já
criada, a solicitação continua válida e um rascunho antigo pode permanecer
para descarte manual; não recriar automaticamente a RFQ.

Esse editor persiste a criação de novas RFQs. Edição de uma RFQ já aberta
continua no RPC existente, sem revisão publicada adicional nesta rodada.

## Renovação

`fin_process_renewals` percorre contratos da organização autorizada,
bloqueia linhas, determina o marco mais próximo (`d180`, `d120`,
`d90`, `d60`, `d30`, `d7` ou `expired`) e cria tarefa, evento e
notificação ao responsável na mesma transação. A chave única
`(contract_id,milestone)` evita duplicação na repetição/concor­rência. O
marco é acionado por “Atualizar marcos de renovação” na área de contratos.
Não há daemon local nem cron configurado: para alertas sem acesso humano,
agendar chamada autenticada e monitorada da mesma lógica em infraestrutura
externa após definir credencial de job e política operacional.

“Iniciar nova concorrência” cria RFQ em rascunho com produto e demanda
originais, vinculada ao contrato por eventos. Não copia convites, proposta,
aprovação, decisão ou score. A empresa revê dados e prazo antes de abrir.

## Migração, rollback e retenção

Ordem canônica no `docs/supabase-migrations.json`:
colaboração → busca → renovação → editor de RFQ. Os quatro scripts em
`docs/rollback/` desfazem no sentido inverso; o teste de banco executa
instalação limpa, reaplicação, upgrade, rollback e reaplicação. Em ambiente
real, **exportar evidências e rascunhos antes do rollback**: o rollback
isolado remove tabelas novas, enquanto tarefas e eventos já gerados são
preservados. Comentários, eventos e milestones não devem ser apagados por
rotina automática sem política jurídica de retenção.

## Segurança e limites verificáveis

Regressões PostgreSQL cobrem comentário interno contra provedor, mention
estrangeira, notificação por usuário, search cross-tenant, revisão obsoleta,
viewer sem edição, milestone repetido e provider sem renovação. A UI usa
`textContent` para comentário, busca, timeline e notificações.

Documentos continuam como referências HTTPS no módulo legado. Upload
privado não foi anunciado como pronto: bucket, política de Storage, signed
URL, validação de bytes e retenção ainda precisam ser implementados juntos.
Nenhum endpoint inseguro de upload foi introduzido.
