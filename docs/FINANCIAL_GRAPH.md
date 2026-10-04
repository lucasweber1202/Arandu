# Financial Graph foundations

O Graph consulta os systems of record existentes. Não há banco adicional, tabela de edges, cópia de saldo ou decisão automática. As views `fin_graph_objects` e `fin_financial_graph` usam SECURITY INVOKER (PostgreSQL 15+) em ambas as camadas. Cada tabela de origem continua aplicando seu RLS ao JWT do usuário.

Os objetos cobertos são grupo, entidade, provedor, relacionamento, RFQ, proposta, decisão, contrato, facility, limite, garantia, snapshot do Passport, marco, obrigação, documento, responsável, valor de procurement (P1.1) e tarifas (P1.2: tarifa contratada, observação, diferença e revisão). Limite é uma faceta da facility com approved_limit; obrigação é marco contratual ou parcela da versão vigente do cronograma. Responsável representa a atribuição no contexto de um objeto, não um cadastro paralelo. Não se somam moedas nem se inferem obrigações ausentes.

## Consulta

`GET /api/finance/graph/{organization|entity|provider|rfq|contract|facility}` exige sessão e `organization_id` e `id` UUID. Papéis BUYER permitidos: admin, finance_manager, analyst, viewer. A organização e o papel são conferidos antes da RPC; a RPC valida novamente o papel e a existência autorizada da raiz. Provedor e usuário de outro tenant não percorrem dados do comprador. Raiz oculta e inexistente produzem a mesma resposta genérica 404.

Filtros: `kind`, `legal_entity_id`, `status`, `q` (2–100 caracteres), `due_before` (data ISO válida, janela de hoje até a data), `limit` (1–50, padrão 20), `offset` (0–5000). Resposta: rows, limit, offset, has_more, next_offset. A RPC busca um registro sentinela adicional; a API o remove. Ordem inclui tipo, ID e todo contexto de atribuição. Paginação reflete registros vivos; uma edição concorrente pode alterar páginas. Nenhum total revela objetos fora do escopo. O rate limit financeiro e a trilha de request existentes continuam aplicados; leituras não produzem eventos com valores financeiros ou texto de busca.

Exemplos: provider + kind=contract + due_before=data responde contratos com vencimento na janela; provider + kind=relationship retorna entidades pelo nome factual do relacionamento; entity + kind=facility retorna facilities daquela entidade; facility + kind=guarantee retorna garantias autorizadas; rfq + kind=passport_snapshot retorna valores e proveniência point-in-time. Contrato expõe origem, decisão e RFQ somente quando os respectivos joins são legíveis. Uma referência a ancestral oculto vira null, inclusive em vínculos legados inconsistentes; não se retorna FK crua nesse caso.

Documentos retornam somente metadados legíveis, sem URL assinada, path de storage ou conteúdo. Snapshots continuam históricos e imutáveis: corrigir o Passport não muda fatos usados na RFQ. Perder acesso muda a leitura, não o snapshot.

## Interface

Cartão sob demanda nas telas existentes de provedor, contrato, Passport e RFQ; ações contextuais para facility e entidade, além do consolidado de grupo. Filtro de tipo, páginas, estado vazio e erro com retry explícito. O Passport preserva o filtro da entidade selecionada. A demonstração que não implementa esta consulta apresenta indisponibilidade, sem relações fictícias. Links usam IDs e páginas canônicas; detalhes de contrato/facility são abertos pelos controles existentes dessas páginas.

## Migration e recuperação

`docs/supabase-financial-graph.sql` segue Passport entities no manifesto e é reaplicável. Apenas camada derivada e RPC; sem reescrita histórica. Rollback `docs/rollback/supabase-financial-graph.rollback.sql` remove RPC/views e devolve o marcador anterior; nenhum registro canônico é apagado. O runner cobre clean install, upgrade, reapply e rollback. Retirar a consulta exige publicar código compatível antes do rollback. Deploy hospedado segue backup preflight, restore drill, confirmação de ambiente e executor seguro; o banco Pilot antigo continua blocker externo documentado em PILOT_STABILIZATION_2026-10-03.md.

Probes PostgreSQL: travessia tenant/entity/provider, garantia escondida pelo RLS e contrato oculto em facility legada, search leakage, snapshot leakage, paginação e recusa de NULL. Testes domínio/API validam filtros, JWT, papel, tenant e redaction; E2E cobre contexto Passport, links, páginas, entidade e overflow nos cinco projetos desktop/mobile. Resultados de execução ficam na matriz/PR; presença de teste não equivale a gate verde.
