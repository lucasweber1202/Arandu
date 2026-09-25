# Fluxos enterprise de procurement financeiro

Base desta rodada: main `37f385d7965456dcd5a710ce5d12d730f65774e8`.

## Aprovação de decisão

A organização compradora pode exigir aprovação em Configurações. A mudança exige papel `admin` e produz `approval_policy_updated`. Na ausência de política, a aprovação é opcional; uma vez solicitada para uma RFQ, a última solicitação precisa estar aprovada e atual para permitir a decisão. O banco impõe isso inclusive para chamadas RPC diretas.

O solicitante escolhe uma proposta, registra contexto e seleciona de um a cinco membros distintos em sequência. Não pode indicar a si próprio nem usuários de outra organização. Cada voto trava a RFQ e a solicitação, só o primeiro passo pendente vota e o resultado fica registrado. Rejeição e pedido de alterações encerram a solicitação; uma nova aprovação é necessária. O snapshot preserva versão e termos da proposta e a demanda vista pelo aprovador. A decisão mantém o ID da solicitação de aprovação. Termos não entram em `fin_events.metadata`.

O aprovador encontra a solicitação no dashboard e vota no detalhe da RFQ. O primeiro release usa a identidade curta e papel do membro na seleção; nomes de exibição corporativos ainda exigem modelo próprio.

## Rascunho de proposta

O formulário do provedor carrega rascunho exclusivamente de sua organização. Alterações aguardam 900 ms antes de salvar. A API normaliza apenas campos do produto; campos obrigatórios são conferidos no envio, permitindo rascunho parcial. A RPC trava a proposta, exige a versão base e a revisão esperada e devolve conflito quando uma segunda aba ou um envio mudou a versão. O status anuncia salvar, salvo, falha e conflito. Falha temporária permite nova tentativa pelo botão. O gatilho remove o rascunho quando uma versão enviada é inserida, na mesma transação. O navegador elimina o antigo rascunho em `localStorage` ao abrir a proposta.

## Banco e reversão

Ordem: procurement → hardening → pilot → enterprise approvals → enterprise drafts. `scripts/test-database.sh` percorre instalação limpa, reaplicação, upgrade e rollback isolado. Os scripts em `docs/rollback/` apagam evidência e rascunhos: são apenas para ambiente de ensaio. Em piloto/produção, exporte e retenha as solicitações e votos antes de qualquer reversão. Não aplique rollback destrutivo sobre decisões registradas.

## Ameaças e controles

| Ameaça | Controle | Regressão |
| --- | --- | --- |
| Decisão sem aprovação obrigatória | Guarda na RPC `fin_record_decision` | `financial-enterprise-approvals.sql` |
| Aprovação forjada ou autoaprovação | Associação membro/papel, solicitante distinto, escrita apenas RPC | Teste PostgreSQL |
| Voto repetido ou fora de ordem | Lock da RFQ, primeiro passo pendente | Teste PostgreSQL |
| Proposta alterada depois de aprovada | Versão e atualização da RFQ conferidas no voto e decisão | Guarda SQL |
| Leitura de aprovação entre organizações | RLS de comprador nas solicitações e passos | Teste PostgreSQL |
| Rascunho de provedor alheio | RLS pelo provider_organization_id e RPC | `financial-enterprise-drafts.sql` |
| Sobrescrita entre abas | Revisão otimista + versão base | Teste PostgreSQL |
| Escrita arbitrária em tabelas de evidência | Grants apenas SELECT, funções com autorização | Teste PostgreSQL |

## Limitações conhecidas

Aprovação por alçada monetária, grupos de aprovadores paralelos, notificações por e-mail/in-app, documentos privados, autosave de RFQ, templates e uma caixa de aprovação dedicada ainda não existem. A UI do provedor usa confirmação de revisão antes do envio; um preview detalhado continua pendente. Estas funcionalidades não devem ser descritas como prontas em materiais comerciais.

## Implantação

1. Executar migrations canônicas em ambiente de teste e `npm run test:database` com PostgreSQL real.
2. Aplicar migrations de approvals e drafts ao ambiente selecionado antes do deploy da API/UI; scripts são aditivos e reaplicáveis.
3. Verificar duas contas da mesma empresa, uma conta de outra empresa e uma conta provedora: pedido, voto, alteração de versão, conflito de duas abas e envio.
4. Habilitar obrigatoriedade por organização somente após designar pelo menos um membro além do solicitante; a política inicia desligada.
5. Conferir outbox e backups do ambiente real pelas rotinas existentes. Não inferir que e-mail ou storage privado estejam ativos.
