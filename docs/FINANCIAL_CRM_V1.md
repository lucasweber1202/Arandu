# Financial CRM Domain 1.0

Implementação: branch `codex/platform-crm-1`, base `f25a207`. Código presente e testes específicos locais executados; suíte completa/CI e integração em main devem ser conferidos no SHA da PR. Nenhuma jornada hospedada, UI de CRM ou credencial externa é atestada por este contrato.

## Domínio e persistência

Contatos estendem **`fin_provider_contacts`**, sem segundo cadastro. Atividades declaradas persistem em `fin_crm_activities`; processos comerciais em `fin_crm_processes`. Histórico, correções e recibos de comandos usam **`fin_events`**. A RFQ continua sendo a fonte do estado financeiro; `stage=won` não decide, contrata ou conclui oportunidade. `email_record` é anotação humana e não comprova transmissão de e-mail.

Todos os registros pertencem a uma única `organization_id`, com `visibility=organization_private` fixa. Não existe compartilhamento automático. Buyer usa `provider_id` de seu cadastro; instituição usa sua própria organização como identidade e pode vincular um `counterparty_organization_id` apenas quando tem convite aceito daquele comprador. Não ganha acesso a contatos/notas do comprador nem de outra instituição.

Buyer pode escopar CRM a uma entidade autorizada. Referência financeira precisa pertencer à mesma organização e exatamente à mesma entidade do registro; escopo de grupo não é atalho para expor um contrato de entidade a todo o grupo. Contato de grupo legado preserva sua leitura anterior; contatos específicos respeitam entidade. Nesta versão o CRM da instituição é interno ao grupo da própria instituição (`legal_entity_id=null`); não cria nem atribui entidades do comprador à instituição.

## Transporte comum

Prefixo `/api/finance/`. Sessão autenticada; todas as consultas usam o JWT da pessoa, com RLS e membership atuais. Escritas apenas pela RPC `fin_crm_command`, com escopo e vínculo validados novamente no banco. Nenhuma service role no transporte do usuário.

| Recurso | GET | POST | PATCH |
| --- | --- | --- | --- |
| `crm-contacts` | lista/busca/detalhe | criar | atualizar, atribuir, arquivar/reativar |
| `crm-activities` | lista/busca/detalhe | registrar atividade ou compromisso | corrigir, atribuir, alterar estado |
| `crm-processes` | lista/busca/detalhe | criar processo comercial | etapa, responsável, próximo passo, resultado, arquivo |
| `crm-history` | histórico autorizado por objeto | — | — |

Escrita buyer: `admin`, `finance_manager`, `analyst` com escopo de entidade. Escrita provider: `admin`, `provider_user` da própria organização. Owner precisa ser membro ativo, não banido, com papel de escrita e escopo compatível; ausência na criação atribui ao ator. Leitura segue membership/entidade; viewer lê e não escreve. Revogação concorrente é serializada com a escrita por locks de membership/grants.

### Lista, filtros e paginação

`GET crm-contacts?organization_id=…&limit=25&search=Maria&provider_id=…&status=active`

Comuns: `organization_id` obrigatório; `id`, `legal_entity_id`, `owner_id`, `search` (2–100 caracteres), `status`, `limit` (1–100, padrão 25), `after` e `sort=id.asc`. Contatos aceitam `provider_id`; atividades/processos aceitam `contact_id`, `related_id`, `due_before=YYYY-MM-DD`. Atividades aceitam `kind`; processos `stage`. Filtros incompatíveis ou desconhecidos são erro, nunca ignorados. Busca é por nome/assunto/título, com lista restrita de caracteres e transporte codificado; não recebe expressão PostgREST ou SQL.

Resposta: `{ok:true,api_version:"financial-crm-v1",rows:[…],next:null|opaque,sort:"id.asc",notice}`. `next` usa chave estável e é vinculado ao recurso e filtros. Reenviar os mesmos filtros, podendo ajustar `limit`. Não usar `after` junto com detalhe por `id`. Ausência de linhas não é falha nem prova de inexistência fora do escopo.

Contato retorna os campos anteriores, mais `counterparty_organization_id`, `owner_id`, `source_reference`, `version`, `updated_at`, `visibility`. Arquivamento continua canônico em `archived_at`, sem coluna de estado paralela; o filtro `status=active|archived` traduz essa condição. Fonte/owner legados podem ser null: não há backfill inventado. Para editar pelo novo comando, fonte explícita é necessária.

### Criação

```json
{
  "organization_id": "00000000-0000-4000-8000-000000000001",
  "legal_entity_id": null,
  "provider_id": "00000000-0000-4000-8000-000000000002",
  "request_key": "00000000-0000-4000-8000-000000000003",
  "values": {
    "name": "Contato sintético",
    "title": "Gerência de relacionamento",
    "email": "contato@example.invalid",
    "source_reference": "Reunião registrada pela equipe"
  }
}
```

Campos de escopo somente na criação: `legal_entity_id`, `provider_id`, `counterparty_organization_id`. Os dois últimos são exclusivos de contatos. Não podem mudar por PATCH. `values` rejeita chave desconhecida, HTML e formatos incompatíveis; referências/owner são UUIDs, nunca nomes usados como vínculo.

Resposta POST 201 (replay 200): `{ok:true,api_version:"financial-crm-v1",id,object_type:"contact",version:1,replayed:false,notice}`.

### Campos de `values`

| Objeto | Obrigatórios na criação | Opcionais / estados |
| --- | --- | --- |
| contato | `name` (2–120), `source_reference` (2–500) | `title` (2–120), `email`, `phone`, `owner_id`, `status=active|archived` |
| atividade | `kind`, `subject` (2–200), `source_reference` | `notes` (até 4000), `owner_id`, `occurred_at`, `due_on`, `contact_id`, `process_id`, `related_type/id`, `status` |
| processo | `title` (2–200), `stage`, `next_action` (2–200), `source_reference` | `owner_id`, `due_on`, `outcome` (3–4000), `contact_id`, `related_type/id`, `status=active|archived` |

Atividade: `meeting`, `call`, `email_record`, `note`, `follow_up`, `commitment`, `commercial_interaction`. Estados: `recorded` (padrão, exige `occurred_at` ISO com timezone), `planned` (exige `due_on`), `cancelled`, `archived`. Nota/comentário de CRM é uma atividade `note`; comentários financeiros e tarefas existentes continuam nos seus endpoints canônicos, sem replicação de seus eventos.

Etapas comerciais: `prospect`, `qualification`, `engagement`, `negotiation`, `won`, `lost`. Encerrar em `won|lost` exige `outcome`; são resultados declarados, sem efeito sobre RFQ, proposta, decisão ou ledger de valor. Reabrir/corrigir é uma nova versão comercial auditada.

Referências buyer: `provider`, `rfq`, `contract`, `opportunity`, `proposal`, `task`; sempre canônicas e autorizadas. Provider pode apontar a RFQ de convite aceito ou à própria proposta nesse contexto, nunca proposta concorrente, contrato privado ou Radar do comprador. Contato/processo vinculado precisa ser da própria organização e escopo compatível; novos vínculos a objetos arquivados são rejeitados.

### Atualização, atribuição e replay

```json
{
  "organization_id": "00000000-0000-4000-8000-000000000001",
  "id": "00000000-0000-4000-8000-000000000004",
  "expected_version": 1,
  "request_key": "00000000-0000-4000-8000-000000000005",
  "values": {"owner_id":"00000000-0000-4000-8000-000000000006"}
}
```

PATCH retorna versão numérica incrementada; mesma chave/ator/organização + mesmo comando retorna recibo original com `replayed:true`. Chave reutilizada com outro conteúdo é 409. Duas edições com a mesma versão não se sobrescrevem: uma grava, a outra recebe 409. Escritas de clientes antigos em contatos também incrementam a versão. Fonte, campos alterados, ator/data e valores anteriores/posteriores das correções ficam na trilha autorizada; não se duplica o corpo de criação no recibo.

Após timeout: consultar registro/histórico; reenviar **a mesma intenção e chave** apenas se necessário, sem fabricar sucesso ou gerar nova chave para repetir a ação. O replay pode representar uma versão anterior à atual; ler novamente antes da próxima edição. O frontend deve preservar o formulário, distinguir erro de leitura de ausência e não executar transição financeira por uma etapa CRM.

### Histórico e Financial Graph

`GET crm-history?organization_id=…&object_type=contact|activity|process&object_id=…&limit=25`

Confere primeiro o acesso ao objeto. Retorna eventos por `happened_at.asc,id.asc`, com cursor de data/ID vinculado ao recorte; `sort` só aceita essa ordenação. Eventos antigos de contatos permanecem no histórico canônico da instituição, sem reclassificação retroativa; o novo recurso consulta eventos `crm_*`.

`GET graph/provider|rfq|contract?organization_id=…&id=…&include_crm=true` acrescenta `crm:{contacts,activities,processes}`, cada coleção `{rows,has_more,limit:25}`. Sem a opção, nenhum acesso ao novo schema é exigido. Raiz precisa ser autorizada pelo Graph. A entidade em foco se aplica à expansão; filtros de tipo/estado financeiros não reinterpretam os estados comerciais. Para continuar uma coleção, usar seu endpoint CRM com os filtros correspondentes, não o offset do Graph. Não há tabela/DB de grafo nova.

## Erros e rollout

400 `invalid_crm`: campos, fonte, responsável ou referência incompatíveis. 403: organização/papel/entidade indisponível. 404 `crm_not_found`: objeto indisponível, sem revelar existência alheia. 409 `crm_conflict`: versão/intenção conflitante. 503 `schema_incompatible`: RPC ainda não instalada. Métodos/recursos não suportados seguem o roteamento padrão. Não expor SQL ou texto de exceção interno na interface.

Migration aditiva `supabase-financial-crm.sql` após recusa institucional; manifest, probes, doctor e export alinhados. Rollback revoga o comando novo e restaura marker anterior, preservando contatos, novos registros, RLS, export e histórico. Não desfaz dados nem ressuscita memberships. Dados de correção podem conter PII: classificação de eventos explicitada, retenção imutável/hold existentes; exclusão física exige política/revisão próprias, não novo DELETE cotidiano.

O seed canônico foi ampliado com contato, reunião e processo ligados ao contrato, além de pipeline privado da instituição, todos pelas APIs reais com personas sintéticas. Reset remove atividades antes de processos e contatos; o service role conserva leitura/exclusão operacional para esse reset guardado e inventário, nunca para as consultas de usuário. **Execução do seed Auth/Storage não realizada nesta missão**; preparar o roteiro não equivale a validá-lo no ambiente canônico.

## Evidências

- `node scripts/test-financial-crm.mjs`: domínio e API com mocks HTTP explícitos, JWT do usuário, filtros, keyset, histórico, validação antes de RPC e expansão opt-in.
- `tests/database/financial-crm.sql`: contatos, atividades, vínculos, owner, fonte, versões, arquivo, histórico, tenant/entidade/provider/viewer/revogação e export em PostgreSQL real.
- `tests/database/financial-crm-concurrency.mjs`: duas versões concorrentes, oito retries idênticos e membership revogada durante espera por lock, em sessões independentes.
- Runner completo: clean/upgrade/reapply/rollback e canário, com status final no relatório da PR. Sem Supabase hospedado ou UI/LLM/ERP validados por estes testes.
