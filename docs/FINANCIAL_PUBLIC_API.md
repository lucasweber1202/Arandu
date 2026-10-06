# Public API v1 & Webhooks

Guideline §31.1 e addendum v2.1 F.1/H.1 item 9 (`P0.8` da
[`IMPLEMENTATION_MATRIX.md`](IMPLEMENTATION_MATRIX.md)). Fundação de integração
**máquina-a-máquina** para ERP, TMS, plataformas de dados e workflows
corporativos. **Código e testes em CI; rollout hospedado pendente.**

| Peça | Onde |
| --- | --- |
| Migration | [`supabase-financial-public-api.sql`](supabase-financial-public-api.sql) (`schema_version = financial-public-api-1`) |
| Rollback | [`rollback/supabase-financial-public-api.rollback.sql`](rollback/supabase-financial-public-api.rollback.sql) |
| Borda v1 | `lib/api/domains/public-api.mjs` (rota `/api/v1/*`) |
| Administração (sessão humana) | `lib/api/domains/finance-integrations.mjs`, Configurações → Integrações (`finance/src/views/integrations.js`) |
| Primitivas | `lib/finance/public-api.mjs` (token, assinatura, cifragem, SSRF), `lib/finance/api-catalog.mjs` |
| Worker | `lib/finance/webhook-dispatch.mjs`, `GET /api/jobs/webhooks` (CRON_SECRET) |
| Contrato | [`openapi/arandu-public-api-v1.json`](openapi/arandu-public-api-v1.json) |
| Testes | `tests/database/financial-public-api.sql`, `tests/database/financial-public-api-rollback.sql`, `scripts/test-finance-public-api.mjs`, `scripts/test-finance-integrations.mjs`, E2E `tests/e2e/finance-integrations.spec.js` |

## Versionamento, compatibilidade e deprecação

* Caminho versionado: `https://<host>/api/v1/...`. Toda resposta traz
  `Arandu-Api-Version: v1`.
* **Compatível dentro de v1**: adicionar campos de resposta, novos endpoints,
  novos eventos de webhook e novos valores de enum *documentados como abertos*.
  Clientes devem ignorar campos desconhecidos.
* **Incompatível (exige v2)**: remover/renomear campo, mudar tipo ou semântica,
  tornar parâmetro opcional obrigatório, mudar ordenação, mudar o envelope de
  erro/página, endurecer autenticação de forma que quebre cliente válido.
* **Deprecação**: endpoint/campo descontinuado recebe `Deprecation: true` e
  `Sunset: <data HTTP>` com **no mínimo 180 dias** de aviso, registro em
  `docs/FINANCIAL_PUBLIC_API.md` (seção Histórico) e no OpenAPI (`deprecated:
  true`). Remoção só em versão nova, após o Sunset. Correção de segurança pode
  encurtar o prazo, com comunicação explícita.

## Autenticação e autorização

1. Admin da compradora cria uma **conta de serviço** (Configurações →
   Integrações) com **escopos** e **alcance** (grupo inteiro ou entidades).
2. Emite um **token** (`arnd_<ambiente>_<43 base62>`, ~256 bits) com validade de
   1 a 365 dias (padrão 90). O token aparece **uma vez**; o banco guarda só
   `sha256` e um prefixo de identificação. Até 2 credenciais ativas por conta
   (rotação sem janela).
3. O cliente envia `Authorization: Bearer <token>`. O servidor calcula o hash e
   chama funções `fin_api_*` (service role, **nunca** no navegador), que conferem
   no banco: **credencial válida** (não revogada/expirada, conta ativa)
   **AND organização** (compradora da conta) **AND entidade** (alcance da conta)
   **AND escopo** **AND objeto** (pertence à organização e à entidade).

Escopo funcional nunca substitui tenant/entidade. Revogar a conta revoga todas
as credenciais e desativa os webhooks que ela criou. Último uso fica registrado
(no máximo uma escrita por minuto por credencial).

| Escopo | Permite |
| --- | --- |
| `rfqs:read` | listar/ler solicitações (sem termos de proposta; só id, provedor, estado, versão) |
| `rfqs:write` | criar **rascunho** de solicitação (demanda validada pelo catálogo do produto) |
| `contracts:read` | listar/ler contratos |
| `providers:read` | diretório de provedores do grupo |
| `portfolio:read` | facilities |
| `approvals:read` | status e progresso de aprovações (sem comentários) |
| `webhooks:manage` | criar, listar, desativar webhooks; listar e reenviar entregas |

## Contrato de resposta

* Sucesso de item: `{ "data": {...} }`. Página: `{ "data": [...], "page": { "limit", "has_more", "next_cursor" } }`.
* Erro: `{ "error": { "code", "message", "correlation_id", "details?" } }`.
* `X-Correlation-Id`: o cliente pode enviar (8–80 caracteres `[A-Za-z0-9._:-]`);
  senão o servidor gera. Volta em toda resposta e fica gravado em escritas.

| HTTP | `code` |
| --- | --- |
| 400 | `invalid_query`, `invalid_json`, `idempotency_key_required` |
| 401 | `unauthorized` (+ `WWW-Authenticate: Bearer realm="arandu"`) |
| 403 | `insufficient_scope`, `entity_forbidden` |
| 404 | `not_found` (inclusive objeto de outro tenant/entidade), `route_not_found` |
| 409 | `webhook_limit`, `delivery_not_replayable`, `webhook_disabled` |
| 413 | `payload_too_large` (64 KB em escrita de RFQ; 16 KB em webhook) |
| 422 | `invalid_payload`, `invalid_owner`, `idempotency_key_reuse`, `invalid_webhook` |
| 429 | `rate_limited` (+ `Retry-After: 60`) |
| 500 | `internal_error` (sem detalhe; use o `correlation_id`) |
| 503 | `service_unavailable`, `rate_limit_unavailable`, `webhook_secrets_unconfigured` |

## Paginação, filtros e ordenação

* **Keyset** (cursor opaco), `limit` 1–100 (padrão 25). Nunca há exportação do
  tenant inteiro numa chamada.
* Ordem **determinística**: `created_at desc, id desc` (provedores: `name, id`;
  aprovações: `requested_at desc, id desc`).
* **Filtros fechados**: parâmetro desconhecido é `400 invalid_query` (um filtro
  ignorado em silêncio poderia virar exportação acidental).

| Endpoint | Escopo | Filtros |
| --- | --- | --- |
| `GET /v1/me` | — | contexto da credencial (conta, organização, escopos, alcance) |
| `GET /v1/rfqs` · `GET /v1/rfqs/{id}` | `rfqs:read` | `status`, `legal_entity_id`, `updated_since` |
| `POST /v1/rfqs` | `rfqs:write` | corpo: `product`, `title`, `description?`, `demand`, `response_deadline?`, `legal_entity_id?`, `owner_id` |
| `GET /v1/contracts` · `GET /v1/contracts/{id}` | `contracts:read` | `status`, `legal_entity_id`, `ends_before` |
| `GET /v1/providers` | `providers:read` | — |
| `GET /v1/portfolio/facilities` | `portfolio:read` | `legal_entity_id` |
| `GET /v1/approvals` | `approvals:read` | `status` |
| `GET/POST /v1/webhooks` · `DELETE /v1/webhooks/{id}` | `webhooks:manage` | — |
| `GET /v1/webhooks/{id}/deliveries` · `POST /v1/webhooks/{id}/deliveries/{delivery}/replay` | `webhooks:manage` | — |

`POST /v1/rfqs` cria **rascunho**: a abertura para provedores, convites,
decisão e aprovação continuam humanas, na interface. `owner_id` precisa ser uma
pessoa da compradora com papel `admin`/`finance_manager` e acesso à entidade.

## Idempotência

Escritas exigem `Idempotency-Key` (8–200 caracteres). O banco guarda, por conta
de serviço: chave, impressão do pedido (sha256 do método + rota + JSON canônico),
operação, status e resultado, por 24 h. Repetição com o mesmo conteúdo devolve
o **mesmo resultado** (`200` + `Idempotent-Replayed: true`); mesma chave com
conteúdo diferente é `422 idempotency_key_reuse`. Pedidos concorrentes com a
mesma chave serializam (advisory lock). Chaves vencidas são limpas pelo job.

## Limites

Por credencial: `ARANDU_API_RATE_LIMIT_PER_MINUTE` (padrão 120/min). Em
ambiente hospedado o contador é o do banco (`consume_rate_limit`); se ele
falhar, a API responde `503` (**falha fechada**), nunca libera.

## Webhooks

**Eventos** (`rfq.created`, `rfq.status_changed`, `proposal.submitted`,
`decision.recorded`, `approval.required`, `approval.completed`,
`contract.created`, `contract.renewal_due`) são gerados a partir de
`fin_events` por gatilho, com **payload mínimo**:

```json
{
  "id": "<event id>", "type": "rfq.created", "api_version": "v1", "created_at": "...",
  "organization_id": "...", "legal_entity_id": "... | null",
  "object": "rfq", "data": { "rfq_id": "...", "status": "draft" },
  "delivery": { "id": "<delivery id>", "attempt": 1 }
}
```

Sem termos financeiros, nomes ou texto livre: para detalhe, o receptor consulta
a API com os escopos dele. Endpoint pode filtrar entidades; conta de serviço
restrita só cria webhook filtrado às próprias entidades.

**Registro**: só `https://` pública, porta 443, sem usuário/senha, sem IP
literal, sem `localhost`/`.local`/`.internal` (banco e API). Na entrega o host
é **resolvido de novo** e qualquer endereço privado, loopback, link-local, CGNAT,
multicast ou ULA bloqueia o envio (`ssrf_blocked`). Redirecionamento não é
seguido. Até 10 webhooks ativos por organização.

**Segredo**: `whsec_…` gerado pelo servidor, mostrado **uma vez**, cifrado com
AES-256-GCM (`ARANDU_WEBHOOK_SECRET_KEY`, 32 bytes base64) antes de ir ao banco.
Nem admin lê o cifrado (privilégio por coluna). Rotação da chave mestra:
configure a nova em `ARANDU_WEBHOOK_SECRET_KEY` e a antiga em
`ARANDU_WEBHOOK_SECRET_KEY_PREVIOUS` até recriar os segredos.

**Cabeçalhos**: `Arandu-Event-Type`, `Arandu-Delivery-Id`, `Arandu-Timestamp`,
`Arandu-Signature: t=<unix>,v1=<hex>`, onde
`v1 = HMAC-SHA256(segredo, "<t>.<delivery_id>.<corpo bruto>")`.

### Verificação no receptor (obrigatória)

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
export function verify(secret, signatureHeader, deliveryId, rawBody, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries(signatureHeader.split(',').map((item) => item.split('=')));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || Math.abs(nowSeconds - t) > 300) return false;          // janela de 5 min
  const expected = createHmac('sha256', secret).update(`${t}.${deliveryId}.${rawBody}`).digest();
  const given = Buffer.from(parts.v1 || '', 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
// E deduplique `Arandu-Delivery-Id` (já processado = responda 2xx e ignore).
```

Use o **corpo bruto** (antes de parsear JSON). A janela de tempo + dedupe do
`delivery_id` são a proteção contra replay; a mesma rotina está em
`verifyWebhook` (`lib/finance/public-api.mjs`) e é testada.

**Entrega**: `2xx` em até 10 s = sucesso. Falha → retry com backoff
1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h; após a **8ª** tentativa, **dead-letter**
(`dead`). Lease com fencing: só o worker com o token de lease atual conclui; lease
vencido volta para a fila. **20 falhas seguidas** desativam o endpoint
(`disabled_failing`) e cancelam a fila. **Replay manual** (admin na interface ou
`webhooks:manage`) cria nova entrega ligada à original (`replay_of`); a original
fica no histórico. Entrega guarda só código HTTP e código curto de erro — nunca
corpo de resposta.

**Cadência**: o worker roda em `GET /api/jobs/webhooks` (cron diário do Vercel
`45 9 * * *`) e pelo botão "Enviar pendentes agora" (admin, só a própria
organização). Ver blocker abaixo para cadência de minutos.

## Operação

* **Migration**: aditiva, idempotente, depois do Policy Engine
  (`check-migrations` exige a ordem); clean install, upgrade, reaplicação e
  rollback em `npm run test:database`; canário cobre as tabelas novas a partir
  de `financial-public-api-1`.
* **Doctor**: espera `financial-public-api-1` e as RPCs `fin_api_whoami`,
  `fin_webhook_claim`, `fin_webhook_complete`, `fin_create_service_account`.
* **Observabilidade**: `fin_job_runs` (`job = webhooks`), estado/código de cada
  entrega, `last_used_at` por credencial, eventos `service_account_*`,
  `api_credential_*`, `webhook_endpoint_*`, `webhook_delivery_replayed` em
  `fin_events`; erros 5xx da API vão para `reportError` com `correlation_id`
  (sem token, sem corpo).
* **Modo degradado da captura**: se gerar o evento de webhook falhar, a ação de
  negócio (RFQ, decisão, contrato) **não** é desfeita; o banco registra
  `WARNING fin_webhook_capture skipped event <id>: <sqlstate>` e o evento de
  origem permanece em `fin_events` para reprocessamento manual.
* **Incidente — token vazado**: revogar a credencial (ou a conta) em
  Configurações → Integrações; efeito na próxima chamada. Conferir
  `last_used_at` e eventos. Emitir nova credencial.
* **Incidente — receptor fora do ar**: entregas ficam em retry até dead-letter;
  depois de corrigir, reativar o endpoint (se `disabled_failing`) e reenviar.
* **Incidente — chave mestra comprometida**: gerar nova chave, mover a antiga
  para `_PREVIOUS`, recriar webhooks (novos segredos) e remover `_PREVIOUS`.

## Rollback e forward-fix

O rollback **aborta** se existir conta de serviço, endpoint, evento ou chave de
idempotência — apagar trilha de integração em silêncio não é aceitável. Em
ambiente com uso real, prefira **forward-fix**: revogar contas e desativar
webhooks derruba todo o acesso sem apagar histórico.

## Blockers externos

| BLOCKER | WHY | WHO MUST ACT | EXACT ACTION | WHAT IS ALREADY READY | HOW TO VERIFY |
| --- | --- | --- | --- | --- | --- |
| Chave de cifragem de webhooks nos ambientes | sem `ARANDU_WEBHOOK_SECRET_KEY`, criar/entregar webhook falha fechado (503) | responsável pelos projetos Vercel pilot/production | gerar 32 bytes aleatórios (comando no `.env.example`) e definir a variável por ambiente; nunca reutilizar entre ambientes | código, testes e mensagem de erro | Configurações → Integrações não mostra o aviso de chave ausente; criar webhook de teste devolve `secret` |
| Cadência de entrega em minutos | o plano atual de cron do Vercel roda diariamente | responsável pela plataforma | agendar `GET /api/jobs/webhooks` com `Authorization: Bearer $CRON_SECRET` a cada 1–5 min (cron do Vercel em plano que permita, Supabase `pg_cron` + `pg_net`, ou agendador externo) | endpoint idempotente com lease, budget de 45 s e registro em `fin_job_runs` | `fin_job_runs` com `job = webhooks` na cadência configurada; entregas saindo de `pending` em minutos |
| Rollout hospedado da migration | banco do piloto atrasado em relação ao código | owner com acesso ao Supabase do piloto | backup, restore drill em destino descartável, aplicar bundle, doctor, canário, jornada autenticada | migration, rollback, canário e doctor atualizados | `npm run finance:pilot:doctor` com `financial-public-api-1` |

## Limites declarados

* DNS rebinding: o endereço validado é fixado no socket (`pinnedWebhookRequest`,
  sem segunda resolução, sem reaproveitar conexão, sem redirecionamento, só
  porta 443) — coberto por `scripts/test-operational-resilience.mjs`.
* Escrita v1 cobre só rascunho de RFQ; demais ações materiais permanecem humanas.
* Sem SLA de entrega declarado; cadência depende do agendador (blocker acima).

## Histórico

* `v1` — 2026-10: primeira versão (este documento).


### Resiliência do worker (P0.10)

DNS tem limite de 2 s; conexão TLS usa o endereço público validado, preserva
hostname/SNI e não segue redirects. Request tem limite de 10 s e o cron
orçamento de 45 s. Completion com lease vencido é recusada; erro ao persistir
conclusão aparece em `completion_failed`, e itens sem orçamento em `deferred`.
Entrega segue at-least-once e receptor deve deduplicar delivery ID. 4xx
semântico vira dead letter sem retry automático (408/429 permanecem elegíveis);
backoff persistido recebe jitter de até 20%. Replay é ação explícita do admin.
Cron tem lease global e registra início/fim, processed/failed e correlação,
retornando falha em lote parcial ou telemetria indisponível. Ver
`FINANCIAL_OPERATIONAL_RESILIENCE.md`; não há claim de disponibilidade real.
