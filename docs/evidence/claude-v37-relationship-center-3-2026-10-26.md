# Claude v3.7 — Central de Relacionamentos 3.0 (2026-10-26)

- SHA inicial: `71c6398534ad9199ffca9150ade2cc137395f63c` (#272–#277 integradas).
- Branch: `claude/practical-turing-s07mn2` (branch designada da sessão, recriada da `main`). Nenhum arquivo do Codex tocado (`lib/api/**`, SQL, runner, `rfq.js`, `external-proposals.js`, build/Vercel, `package.json`).
- Maturidade: M1 até CI verde no HEAD exato. Nenhuma validação com pessoas reais.

## Auditoria (código real + E2E com API simulada)

| # | Ruptura comprovada | Onde | Correção |
|---|---|---|---|
| 1 | Tarefa de contrato fora do recorte carregado (overview lê até 200 contratos) sumia da fila | `relationshipWorkItems` (`if (!contract?.provider_id) continue`) | Item aparece com "Instituição do contrato não carregada", "Entidade não carregada" e link ao contrato pelo deep link autorizado (`?abrir=contrato#contract-…`), sem botão de relacionamento |
| 2 | Responsável fora da lista de membros virava "Membro"; a própria pessoa não era identificada; "Responsável" igual para contrato, tarefa e negociação | `memberName` na fila e no cartão de contrato | "Responsável pela relação contratual / pela tarefa / pela negociação", "(você)", "pessoa sem acesso atual à organização", "Tarefa sem responsável" |
| 3 | Entidade legal não aparecia por item; filtro de entidade excluía unidades filhas (o seletor de contexto as inclui) | `queueItem`, filtro `byEntity` | Entidade no cabeçalho de cada item; filtro pela entidade-mãe inclui unidades |
| 4 | Limites do overview (200 contratos, 100 tarefas abertas, 200 solicitações/instituições) nunca declarados: contagem e "Nada pendente" pareciam completas | `relationshipWorkQueue` | Nota de recorte quando um limite é atingido; contagem diz "nos registros carregados"; estado vazio não vira garantia |
| 5 | Sem indicação de quem pode agir | `queueItem` | "Você pode agir neste item." ou o papel que pode agir (a UI não substitui o servidor) |
| 6 | Tarefa sem prazo podia ser lida como pendência atrasada | detalhe da tarefa | "Sem prazo definido (não é atraso)." |
| 7 | Convite com prazo informado já passado aparecia como prazo comum | Portal, `provider.js` | Diz que o prazo passou e que o aceite depende de o convite ainda estar válido |

Verificado sem ruptura nova: deep link e refresh do relacionamento (`providers.html?provider_id=`), retorno contrato → relacionamento (link em "Trabalho deste contrato"), negociação com várias instituições como um item, ordenação estável (rank + prazo), confidencialidade no portal (fronteira já testada).

## Recusa de convite (Portal)

Ainda **sem endpoint** (`lib/api` só tem `invites/accept`). Nada foi simulado. Contrato mínimo para o Codex:
`POST /api/finance/invites/decline { token, provider_organization_id, reason_code?, note? }` — mesma verificação de membro do aceite; idempotente por convite (repetição devolve o mesmo resultado); estados `declined | already_responded | invalid` sem revelar destinatário ou existência a terceiros; evento auditável; comprador vê "Recusou" (rótulo já existe em `rfq.js`).

## Testes

`tests/e2e/finance-relationship-center.spec.js` (+6) e `finance-provider-draft.spec.js` (+1): responsável por tipo/você/sem acesso/tarefa sem responsável, tarefa fora do recorte com link, entidade e unidade filha, recorte no limite, leitor (quem pode agir), 390 px e teclado, convite com prazo passado. Uma assertion existente mudou porque o rótulo mudou ("Responsável:" → "Responsável pela relação contratual: … (você)").

| Execução | Resultado |
|---|---|
| relationship-center, provider-draft, contracts, procurement — Chromium desktop + Pixel 7 | 361/361 PASS (+2 do teste novo) |
| `npm run check:all`, `npm run build`, `npm run build:demo` | PASS |
| Rota RFQ: financeiro / Demo | 247.792 / 249.664 B (iguais à `main`) |
| Firefox, WebKit locais | NOT_RUN (gate `validate`) |
| Jornada com API/Auth/RLS reais | NOT_RUN (sem Supabase local) |

## Fora de escopo / limitações

- O overview não informa `has_more`; o recorte é inferido pelo limite atingido. Contrato para o Codex: devolver `limits`/`truncated` por coleção no `overview`.
- Navegação de negociação → relacionamento depende de `rfq.js` (reservado).
- Sem capturas visuais nesta rodada.
