# Backend architecture v7 — material scoped batch

Baseline c72e6868940b2685b45f0f2728edab1763301679. Codex owns API handlers,
automation and package commands. CC retains frontend/views and E2E contents.
No frontend, hosted configuration, migration, budget or auth policy changed.

`finance.mjs` delegates task operations and public/private document operations
to coherent handlers. Authentication, account/write throttling, session and
no-store headers remain in the facade, before dispatch. Dependencies are
explicit and operation-local: tasks receive session/token; documents receive
storage, admin finalization RPC and document throttle. No shared service object
or second router. Task projection is reused by the overview, not duplicated.
Unsupported methods retain the existing final 404 envelope. All operation
bodies are extracted from the baseline, with one processing optimization below.

Document listing still performs the same RLS-scoped queries with the user JWT.
The existing 100-document/500-version limits are unchanged. A per-request Map
groups versions in one pass, preserving order, orphan exclusion and empty
arrays. There is no cache or service-role read. Before: up to 100*500 version
comparisons. After: 500 indexing visits plus 100 lookups. Synthetic reproducible
benchmark: `node scripts/benchmark-document-projection.mjs`; results in
evidence/backend-projection-v7.json. These are local CPU timings, not hosted
API/database latency, production throughput or an SLA. Query count is unchanged.

Tasks retain the existing cursor scope, keyset ordering, role preflight and
transactional database authorization, optimistic concurrency, idempotency
and uncertain-create result handling. Storage remains signed only after the
same authorization RPCs and completion verification. No financial validation
was relocated to the browser.

Three npm commands now share scripts/e2e-suites.mjs and one runner. The current
29-suite product set is preserved; test:e2e:list previously omitted SSO and now
lists it too. Separate demo/presentation configs and builds remain separate.
CI v6.2's import graph uses this same product manifest for its full financial
fallback (28 financial suites; one demo persona product-entry suite). No new
tests are included by discovery. Missing manifest files fail closed.

`test-backend-architecture.mjs` verifies static domain imports are acyclic and
suite commands use the canonical runner. Existing API contracts exercise old
URLs/methods, JWT authorization, task isolation/cursors, conflicts, document
uploads/downloads and unavailable upstreams after extraction. This remains
fixture transport evidence, distinct from database/ephemeral CI execution.

Local evidence: full API contracts, architecture check, v6.2's 36 risk scenarios,
product suite listing, build/budget and check:all. CI on the final SHA remains
required; classification is D because selection policy/package scripts change.
No claim of faster real CI from this batch yet. M1 after local checks; M2 only
after required checks succeed; M3–M6 not established.

Next priorities: extract RFQ/proposal/decision cohorts with the same contract
suite; measure overview/assignments query fan-out and independent reads; audit
fee receipt/history pagination and projections; profile check:all by group.
No speculative SQL indexes, streaming rewrite of bounded 64KiB imports or new
shared private-data caches were introduced. Deploy/recovery gates remain.
