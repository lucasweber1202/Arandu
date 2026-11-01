# Financial Relationship Workspace — interface do CRM 1.0

Branch `claude/gallant-pasteur-6wo5ko`, base `main@3a7d129` (inclui #297). Maturidade: **M1** (código + E2E com API simulada). Sem validação em ambiente canônico (Supabase/RPC reais), sem seed executado, sem LLM/ERP.

## Superfícies

| Onde | O que | Código |
| --- | --- | --- |
| Instituições → painel da instituição (`providers.html?provider_id=…`) | Seção **Relacionamento comercial** com abas Agenda, Contatos, Atividades e Processos; substitui a lista simples de contatos (mesma tabela canônica `fin_provider_contacts`) | `finance/src/views/crm-workspace.js` (`crmWorkspace`) montado em `provider-relationship.js` |
| Instituições (Central) | **Agenda e processos comerciais** da organização: compromissos pendentes e processos ativos, filtros Vencidos/Hoje/Sem responsável/Meus, botão que abre a instituição | `crmOrganizationPanel` em `company.js` |

Nenhuma área nova de menu: o CRM fica em **Relacionamentos → Instituições** (Design Constitution, cinco áreas).

## Contratos consumidos (financial-crm-v1)

- `GET/POST/PATCH crm-contacts`: lista por `provider_id`, cadastro, edição de campos alterados, responsável, arquivamento/reativação (`status`).
- `GET/POST/PATCH crm-activities`: reunião, ligação, interação, nota, follow-up, compromisso, anotação de e-mail; realizada (`occurred_at` com fuso) × planejada (`due_on`); marcar como realizada, cancelar, editar.
- `GET/POST/PATCH crm-processes`: quadro por etapa (com alternativa em tabela), troca de etapa persistida, `won|lost` exigem resultado declarado; vínculo a instituição, contrato ou negociação.
- `GET crm-history`: histórico de cada contato/atividade/processo com data, autor, campos alterados e fonte.

Regras aplicadas: `request_key` única por intenção e reenviada igual após falha incerta (replay, sem duplicar); `expected_version` em todo PATCH; 409 mostra conflito, preserva o formulário e oferece recarregar; 403/404/503/400 viram mensagens de negócio; sucesso só após resposta; formulário com campos obrigatórios e fonte; fechar com dados preenchidos pede confirmação; leitor (viewer) não vê ações de escrita. "Ganho" é rotulado como declarado e o texto explica que não fecha contrato nem registra economia.

Correção transversal: `drawer()` passa a gerar id de título único quando há painel empilhado (antes o segundo painel herdava o nome acessível do primeiro).

## Testes

`tests/e2e/finance-crm.spec.js` — **API simulada com estado** (versão, chave idempotente, 409, histórico). Cobre a jornada de aceite (contato → reunião → processo com responsável e vínculo ao contrato → etapa → histórico → link de volta ao contrato), ganho com resultado obrigatório e cancelável, agenda (vencido/hoje/futuro/sem responsável, realização com data), conflito de versão, retry com a mesma chave, leitor sem escrita e agenda da organização sem overflow horizontal. Executado localmente em Chromium desktop e Pixel 7 junto com relationship-center, portfolio e contracts: 270 PASS. Firefox/WebKit ficam para o CI.

## Handoffs para o backend (Codex)

1. **Filtro por instituição em atividades/processos.** Página: painel da instituição. Hoje o contrato aceita `provider_id` só em contatos; a tela faz fan-out por `related_id` (instituição, até 30 contratos/negociações) e `contact_id` (até 20 contatos) e avisa quando o recorte pode estar incompleto. Pedido: `provider_id` em `crm-activities` e `crm-processes` resolvendo vínculos diretos, via contrato/RFQ da instituição e via contato. Resposta igual à lista atual. Teste afetado: `finance-crm.spec.js` (mock de fan-out).
2. **Campos do evento de histórico.** A tela lê `event_type`, `happened_at`, `actor_id`, `payload.changed_fields|after` e `payload.source_reference`. Pedido: confirmar/documentar esses nomes no contrato (`docs/FINANCIAL_CRM_V1.md`) para não depender de inferência.
3. **Vínculo editável.** `related_type/id` só é fixado na criação pela UI (PATCH de vínculo não está documentado). Se o backend permitir, documentar para habilitar "vincular processo a contrato" depois de criado.
4. **Experiência da instituição.** O mesmo componente aceita `counterparty`, mas o portal da instituição ainda não o monta; requer a lista de compradores com convite aceito para preencher `counterparty_organization_id`.

## Pendente

Validação na Demo canônica com o seed ampliado (#297), capturas antes/depois via `npm run design:capture`, montagem no portal da instituição e entrada a partir do Contract Center (atividades do contrato).
