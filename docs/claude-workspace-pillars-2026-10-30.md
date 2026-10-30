# Copilot, CRM, Catálogo e ERP Hub: o que a interface já entrega e o que depende do Codex (Claude, 30/10/2026)

Base: `main@5c3a3f7`, sem PRs abertas. Reconciliação do backend nesta data: **não existem** API de Copilot ou modelo generativo, API de atividades ou interações de CRM, schema de catálogo por modalidade, nem conector ou sincronização de ERP. Existem: `GET products` (crédito e adquirência negociáveis), `CONTRACT_CATEGORIES` com termos tipados (7 categorias), `provider-contacts` (criar e arquivar contato no relacionamento), API pública, contas de serviço e webhooks, `opportunities` e os demais registros.

## Entregue (frontend, com dados reais)
| Pilar | Entrega | Onde |
|---|---|---|
| Catálogo | 7 famílias e 27 modalidades mapeadas para as categorias canônicas. O nível de suporte é derivado do código (termos tipados / negociação / motor econômico), com busca, filtro por família, "Iniciar negociação" só onde há formulário e "Registrar contrato existente" nas demais | Instituições e Contratos → "Catálogo de produtos" |
| Copilot (camada 0) | "Consultas do Arandu": 5 perguntas respondidas por consulta determinística sobre registros carregados ou a API de oportunidades, com links e fonte. A tela declara que não há modelo generativo. Falha não inventa resposta | Painel e Instituições → "Consultas" |
| ERP Hub | Seção "Conectores de ERP" com 6 ERPs como "Suporte planejado · sem conector". Explica o caminho real atual (API pública e webhooks). Nenhum campo de credencial e nenhum estado de conexão falso | Configurações → Integrações |
| CRM | Sem mudança: contatos já existem no relacionamento por instituição. Atividades, interações e pipeline dependem de backend | — |

## Contratos propostos ao Codex (entrada/saída, sem implementação)
1. **Copilot:** `POST copilot/ask {organization_id, context:{type, id}, question}` → `{answer, model, citations:[{type, id, title, version, href, available}], insufficient_evidence:bool, suggested_actions:[{kind, payload_preview, missing[], effects[]}]}`. Streaming opcional. `GET copilot/conversations`. Estados: `model_not_configured`, `rate_limited`, `partial`. Ação assistida: `POST copilot/actions/prepare` → rascunho; confirmação por endpoint de domínio já existente (por exemplo, tarefa), nunca pelo Copilot.
2. **CRM:** `crm-activities` (GET/POST: `kind` ∈ meeting|call|email_logged|note|follow_up; `provider_id`, `contact_id?`, `rfq_id?`, `contract_id?`, `occurred_at`, `owner_id`, `due_on?`, `status`, `source:'user_declared'|'system'`). Contatos já existentes recebem `owner_id`, `area`, `phone`, `restrictions`. Isolamento buyer/provider por RLS.
3. **Catálogo:** `GET product-catalog` → `{families:[{key, label, modalities:[{key, label, contract_category, term_schema_id, negotiable, comparison_engine|null, integration|null}]}]}`. Com isso, a taxonomia sai do frontend (`finance/src/views/product-catalog.js`), que passa a só renderizar.
4. **ERP:** `GET erp-connectors` (estado por conector: not_configured…planned), `POST erp-connections` (autorização OAuth no servidor, sem segredo no navegador), `POST erp-connections/:id/test`, `GET erp-connections/:id/mapping-preview`, `POST erp-syncs`, `GET erp-syncs/:id` → `{processed, imported, skipped, duplicates, conflicts, errors[], records:[{type, id, href}]}`.

## Testes (API simulada por mocks)
- `finance-relationship-center`: +3 testes. Catálogo (busca, família, suporte, ações por modalidade, estado vazio, mobile sem overflow), catálogo para leitor sem ações, e consultas com fonte, links e falha honesta.
- `finance-integrations`: +1 teste (ERP hub sem credencial e sem estado falso).
- relationship-center, integrations, contracts e procurement em chromium-desktop e mobile-chrome: 359 passaram. `check:all` passou.
- `check:build-size`: aviso (não falha) de que a maior rota (`rfq`) está acima de 90% do limite. Não verifiquei se o aviso já existia na `main`.

## Não feito (depende do backend)
Copilot generativo, atividades e pipeline de CRM, formulários por modalidade além de crédito e adquirência, e conexão ou sincronização de ERP. Nada disso é anunciado como funcionando na interface.
