# Threat model — Financial Procurement

Escopo: `/api/finance/*`, tabelas `fin_*`, portais `/finance/` e `/provider/`.

Atores: empresa compradora (admin, finance_manager, analyst, viewer), provedor
(admin, provider_user), anônimo, e uma conta autenticada qualquer do Arandu.

Premissa: o atacante tem uma conta válida, sabe a chave anônima do Supabase
(ela é pública por construção) e pode falar direto com a REST API, sem passar
pelo nosso frontend nem pela nossa API.

## Ataques e onde cada um para

| # | Ataque | Defesa | Teste |
| --- | --- | --- | --- |
| 1 | **IDOR** — trocar o id na URL para ler RFQ/proposta/contrato alheios | RLS por `fin_has_role`, com `force row level security` | `financial-procurement.sql` |
| 2 | **Tenant breakout** — passar `organization_id` de outra empresa | `memberOrganization` confirma no banco antes de qualquer uso; RLS devolve vazio | `test-finance-api.mjs`, `financial-procurement.sql` |
| 3 | **Provider impersonation** — aceitar convite em nome de outro provedor | `fin_accept_provider_invite` exige `fin_has_role` na organização provedora do chamador | `financial-procurement.sql` |
| 4 | **Invitation replay** — reusar um token já aceito | `status='invited' and accepted_at is null ... for update` | `financial-procurement.sql` |
| 5 | **Token expirado** | `expires_at > now()` | `financial-procurement.sql` |
| 6 | **Vazamento do token armazenado** | só o `sha256` é persistido; o token em claro existe uma vez, na resposta | revisão de schema |
| 7 | **Mass assignment** — injetar `status`, `owner_id`, `verification_state` | allowlist por produto em `lib/finance/products.mjs`; campos de controle nunca vêm do corpo | `test-finance-api.mjs`, `test-finance-domain.mjs` |
| 8 | **`organization_id` forjado** | validado como UUID e confirmado por membresia; nunca chega ao banco se inválido | `test-finance-api.mjs` |
| 9 | **`provider_id` forjado** | FK composta `(buyer_organization_id, provider_id)`: o provedor tem de ser cadastro do próprio comprador | schema |
| 10 | **`proposal_id` forjado** | o produto e a organização vêm da linha do banco, não do corpo | `test-finance-api.mjs` |
| 11 | **Decisão forjada** | `fin_record_decision` é definer, exige papel e valida elegibilidade da proposta | `financial-procurement.sql` |
| 12 | **RFQ swapping** — decidir com proposta de outra RFQ | duas FKs compostas: `(organization_id, proposal_id)` e `(rfq_id, proposal_id)` | schema + `financial-procurement.sql` |
| 13 | **Cross-RFQ decision / decisão dupla** | índice único `fin_decisions(rfq_id)` + `for update` na RFQ | `financial-procurement-hardening.sql` |
| 14 | **Contract swapping / contrato duplo** | FK `(organization_id, decision_id, proposal_id)` + índice único `fin_contracts(decision_id)` | `financial-procurement-hardening.sql` |
| 15 | **Version tampering** — reescrever termos já enviados | `UPDATE`/`DELETE` revogados em `fin_proposal_versions`; versões são append-only | `financial-procurement.sql` |
| 16 | **Alterar a fotografia da decisão** | `snapshot` é jsonb gravado no instante da decisão; revisão posterior não o alcança | `financial-procurement-hardening.sql` |
| 17 | **RLS bypass via REST direta** | `revoke all from anon, authenticated` + grants explícitos + `force row level security` | `financial-procurement.sql` |
| 18 | **Uso da service role** | o domínio financeiro só usa `userSupabaseRequest` (JWT do usuário) | `test-finance-api.mjs` verifica a apikey de cada chamada |
| 19 | **Enumeração** | RFQ inexistente e RFQ proibida devolvem o mesmo 404; convite inválido, expirado, usado e revogado devolvem a mesma resposta | `test-finance-api.mjs` |
| 20 | **XSS em notas/observações** | o cliente monta tudo por `textContent`; nenhum `innerHTML` com dado de usuário | revisão de `finance/app.js` |
| 21 | **URL maliciosa** | `website`, `reference_url`, `document_reference` e `regulator_evidence_url` exigem `^https://` no banco **e** na API | schema + `test-finance-api.mjs` |
| 22 | **Payload gigante** | `readBody` com limite de 128 KB, herdado do core | `test-api-core.mjs` |
| 23 | **Abuso de rate limit** | três escopos: catálogo anônimo (120/10min), conta (240/10min), escrita (60/10min) | revisão de `finance.mjs` |
| 24 | **Escritas concorrentes** | `for update` em proposta, RFQ e decisão; unicidade `(proposal_id, version)` | `financial-procurement-hardening.sql` |
| 25 | **Vazamento por mensagem de erro** | erros do upstream são mapeados para mensagens fixas; nada de nome de tabela, SQL, constraint ou stack | `test-finance-api.mjs` |
| 26 | **Provedor lendo a comparação do comprador** | a rota de comparação exige organização compradora | `test-finance-api.mjs` |
| 27 | **Provedor lendo notas internas** | `fin_providers` é do comprador; o provedor não tem policy de leitura, nem depois do vínculo canônico | `financial-procurement-hardening.sql` |

## O que continua sendo risco aceito e declarado

* **Um membro legítimo com papel de escrita pode agir mal dentro da própria
  organização.** Mitigação atual: trilha em `fin_events` com autor e horário.
  Não há aprovação em dois passos para decisão ou contrato.
* **O comprador pode editar a demanda com a RFQ aberta.** É intencional (erro
  de digitação acontece), e agora deixa evento próprio na trilha.
* **Não há verificação externa de CNPJ nem de registro regulatório.** O produto
  declara isso na interface em vez de fingir verificação.
* **Sem upload de documento**, então não há superfície de storage — e também
  não há antivírus, varredura ou quarentena, porque não há arquivo.

## Fora do modelo

Comprometimento da conta Supabase, do provedor de e-mail, do DNS ou do CI. Esses
são tratados pelos controles gerais do Arandu, não por esta vertical.
