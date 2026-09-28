# Evidência técnica — fechamento autônomo do piloto financeiro (28/09/2026)

Base: `main` em `64a9bdccd71ce2a14c45605d43ddfe3f49978ade` (merge da #74), sem
commits posteriores. PR #76 (`codex/pilot-advisor-hardening`, `9470493`) e
PR #77 (Vite 8.3.1) abertas. Nenhuma credencial de Supabase, Vercel ou Resend
existia nesta sessão (`api.supabase.com` 401, `api.vercel.com` 403): o ensaio
usou a stack real da Supabase em contêineres (`scripts/pilot-local`), o mesmo
Postgres 15, GoTrue, PostgREST e Storage do projeto hospedado.

## Segurança

| Finding | Exploit / teste | Correção | Regressão | Estado |
| --- | --- | --- | --- | --- |
| Enumeração da allowlist do piloto | `POST /rest/v1/rpc/fin_pilot_access_allowed` com JWT de conta externa → `true` para domínio da allowlist | `revoke` de anon/authenticated (só `fin_create_organization`, SECURITY DEFINER, usa) | `financial-surface-hardening.sql` §3; jornada: 403 `42501` | FIXED |
| Oráculo objeto → organização | `rpc/fin_comment_object_org` com UUID de RFQ de outro tenant → UUID da organização dona | `revoke` de anon/authenticated | idem | FIXED |
| Funções de gatilho executáveis pelo cliente (4 financeiras, 7 de arte) | inventário no Postgres da Supabase | `revoke` | inventário exato no teste | FIXED |
| `artwork_events` sem RLS e com ALL para anon (advisor) | anon lia/escrevia | RLS + `revoke` (absorve a PR #76) | teste §1/§3 | FIXED |
| `api_rate_limits`, `crm_notes`, `media_assets`, `tasks` sem RLS (advisor) | — (sem grant, mas expostos ao schema) | RLS ligado | "tabela sem RLS" = 0 | FIXED |
| 18 views legadas de arte com privilégio do dono (advisor `security_definer_view`, 17 legíveis por anon) | `GET /rest/v1/v_commercial_pipeline` com anon → 200 | `security_invoker=on` + `revoke` | teste §1; jornada: 401 | FIXED |
| 3 funções com `search_path` mutável (advisor) | `set_updated_at`, `operational_transition_allowed`, `arandu_safe_audit_state` | `search_path=''` | "search_path mutável" = 0 em todo `public` | FIXED |
| Gatilho de e-mail de pedido quebrado no Supabase | `digest()` do pgcrypto (schema `extensions`) com `search_path=public` → erro, visto ao emular o Supabase | `sha256()` do núcleo no arquivo de origem; `search_path=public, extensions` em bancos instalados | `orders.sql` sob o bootstrap fiel | FIXED |
| Convite de membro aceito com e-mail não confirmado | conta com e-mail igual, `email_confirmed_at` nulo | exige confirmação, como o convite de provedor | teste §3 | FIXED |
| Rotas de arte vivas no piloto gravando no banco do piloto | `POST /api/forms` anônimo → 201, lead com nome e e-mail em `public.leads` | `ARANDU_ENV=pilot` fecha 31 rotas de arte com 404 antes de tocar o banco | `test-legacy-surface.mjs`; jornada: 404, `leads` 0→0 | FIXED |
| Restore lógico reabre funções a anon | `pg_restore` num projeto Supabase novo → todas as funções de `public` executáveis por anon | procedimento suspende default privileges e recria gatilho de `auth.users` | `pilot:restore:drill` compara grants origem × destino | FIXED |

Matriz adversarial nova (`tests/database/financial-surface-hardening.sql`):
43 ataques diretos às RPCs — comprador B, provedor B, externo, viewer, gestor
sem papel de admin — contra RFQ, propostas, rascunhos, decisão, aprovação,
comentário, documento, perfil, busca, política, avisos, console. Todos
recusados, sem efeito colateral. Leitura por RLS: 23 combinações ator × tabela
sem linha vazada. Inventário exato das 46 RPCs executáveis por `authenticated`
e das 2 por `anon` (funções puras): função nova exposta quebra o teste.

Revisão das RPCs financeiras (46): cada uma confere papel na organização dona
do objeto a partir do próprio objeto (não do parâmetro do cliente), ou é
autoconsulta (`fin_has_role`, `fin_is_operator`, `fin_platform_role`,
`fin_jwt_aal`, `fin_can_read_document`). Observações sem risco explorável,
mantidas: `fin_record_client_event` aceita `entity_id` arbitrário dentro da
própria organização (só métrica interna); `p_client_id` de comentário revela
colisão de UUID (inviável).

## Supabase — advisors

| Advisor | Itens | Classificação |
| --- | --- | --- |
| `rls_disabled_in_public` | 5 tabelas | FIXED |
| `security_definer_view` | 18 views | FIXED |
| `function_search_path_mutable` | 3 funções | FIXED |
| Funções SECURITY DEFINER executáveis por anon/authenticated | 11 gatilhos + 2 auxiliares | FIXED |
| 46 RPCs financeiras executáveis por authenticated | revisadas uma a uma | ACCEPTED_WITH_JUSTIFICATION: são a API do produto, chamadas com o JWT do usuário, e cada uma autoriza pelo dono do objeto; inventário travado no teste |
| Tabelas de arte com SELECT para anon (`artists`, `artworks` etc.) | políticas "publicado" / "próprio" | ACCEPTED_WITH_JUSTIFICATION: RLS com política própria; vazias no piloto; API de arte fechada no piloto |
| Performance advisor | não executável sem credencial | OWNER_ACTION_REQUIRED (rodar no painel após aplicar a migration 35) |

## Backup / restore

`npm run pilot:restore:drill` contra o piloto local com a jornada completa
executada: 24/24 comparações origem × restaurado (fingerprint do schema, linhas
de cada `fin_*`, funções, gatilhos, gatilhos de `auth`, políticas, constraints,
grants, RLS forçado nas 33 `fin_*`, bucket privado, `schema_version`) e canário
de isolamento OK no restaurado. Tempos: backup 0,6 s; destino novo 6,2 s;
restore 1,8 s; probes 0,7 s; canário 0,1 s.

## Testes

| Teste | Resultado | Evidência |
| --- | --- | --- |
| `npm ci` / `npm audit` | PASS | 0 vulnerabilidades |
| `npm run check:all` | PASS | inclui `test-legacy-surface`, `test-finance-env`, doctor |
| `npm run build` | PASS | |
| `npm run test:database` (bootstrap fiel ao Supabase) | PASS | limpa, upgrade, reaplicação, rollback do hardening e matriz adversarial |
| Hardening por cima do estado real do piloto (34 + PR #76), 2× | PASS | idempotente |
| `financial-surface-hardening.sql` no Postgres da Supabase | PASS | |
| Jornada real `pilot:local:journey` | PASS | 24 passos, 60 ataques, 0 falhas |
| `pilot:local:doctor` (4 cenários) | PASS | GO 0 / NO-GO 1 / UNSAFE 2 / UNSAFE 2 |
| `pilot:canary` (e injeção de vazamento) | PASS | detecta policy vazada |
| Playwright finance (chromium desktop + mobile) | PASS | 40/40 |
| Playwright apresentação (chromium desktop + mobile) | PASS | 27 passed, 1 skipped |
| Playwright firefox/webkit | BLOCKED | navegadores não instaláveis nesta sessão; o CI instala |
| Varredura 375/390/768/1280 px (buyer, provider, finance_ops, dados reais) | PASS | 0 rolagem horizontal, campos rotulados, 1 h1 |
| Erro canário por request ID | PASS (local) | 503 `upstream_unavailable` com o mesmo `requestId` na resposta e no log estruturado |
| Vite 8.3.1 (#77) | PASS | `dist/` byte-idêntico ao 8.3.0 (56 arquivos), `check:all`, audit 0 |
| CI remoto | QUOTA_BLOCKED | jobs terminam em 1–3 s sem steps (runner não inicia) |

## Reconciliação pós-merge (`main` = `1bab2b0`: #78 → #76 → #77)

- O merge tardio da #76 trouxe de volta `docs/supabase-financial-pilot-advisor-hardening.sql`, fora do manifesto. Os 6 comandos dele estão contidos em `docs/supabase-financial-pilot-surface-hardening.sql`, e nenhum teste, script ou runbook o referenciava. O arquivo foi removido. `check:migrations` agora recusa SQL em `docs/` fora do manifesto e rollback sem migration correspondente.
- Vite 8.3.1 (#77): o `dist/` da `main` é byte-idêntico ao do head da #78 com Vite 8.3.0 (55 arquivos).
- Validação clean-room da `main`, sem reaproveitar o banco local:
  - todos os gates locais, `test:database` (clean, upgrade, reapply, rollback, matriz adversarial) e Playwright Chromium (finance 40/40, apresentação 27 + 1 skip);
  - `pilot:local` do zero, com 35 migrations: jornada de 24 passos e 60 ataques, sem falhas;
  - doctor GO/NO-GO/UNSAFE/UNSAFE, restore 24/24 e canário OK;
  - `schema_version = financial-surface-hardening-1`.
