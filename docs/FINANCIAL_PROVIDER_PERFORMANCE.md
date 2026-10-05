# Provider Performance — PP-01

Status: M1 local implementation; CI, browser execution and hosted staging remain gates. Base: pilot `a2face3f6f4cabb7c4dbeabe8be3e6988c97cdca`. No merge or deployment is authorized by this document.

## Customer-defined facts

Five systems of record: versioned dimensions, contract periods, period targets, immutable observations, immutable independent reviews. Organization, provider, product, entity and contract version derive from the authorized contract. The customer defines metric methodology and contractual targets. No universal provider score, ranking, automatic recommendation or invented financial threshold.

Supported metric catalog: implementation timeliness, response time, SLA adherence, proposal completeness, issue resolution, fee accuracy, renewal responsiveness, obligation fulfillment, obligation responsiveness, operational incidents, service availability. Units are checked against the metric. Numerical values and targets preserve PostgreSQL numeric precision through text projections.

The method is immutable and versioned. Targets are fixed when the period opens. A new observation references its predecessor, requires a correction reason and invalidates the prior review for the current period. Review is limited to an independent admin/finance manager. A period closes only after its end, explicit human confirmation, optimistic version validation and a non-rejected review for every dimension. A closed period cannot receive observations or reviews; correction creates a new period explicitly referencing the closed original, preserving the same contract and date range.

## Internal evidence adapters

| Metric | Cohort and formula | Limitation |
| --- | --- | --- |
| Implementation timeliness | Contract milestones due within period; completed by due / due milestones × 100 | Delivery timing, not acceptance quality |
| Issue resolution | Contract issues opened within period; mean elapsed days for resolved issues | Shows resolved/total coverage; unresolved issues are not zero days |
| Fee accuracy | Verified comparable observations within period; zero variance / verified comparable × 100 | Not a claim of improper billing; unverified/non-comparable records remain outside the numerator |
| Obligation responsiveness | Non-financial contract obligation periods due within period; evidence recorded by due / periods due × 100 | Evidence delivery timing only; company financial covenant breach is not provider performance |
| Other metrics | Declared/imported observation with provenance and customer methodology | Automatic source returns `not_available`; never fabricates a score |

Internal observations persist source IDs, formula version, coverage and extraction time. Qualification contributes scoped context, not a performance score. No ERP, bank, open-finance or external SLA integration is claimed. Manual imports are evidence records, not connectors. Cohorts above 5,000 source rows fail with a coverage error. Histories/configuration beyond the UI limit fail explicitly and point to governed export.

## Product flow and integrations

`/finance/performance.html`: define dimensions, open contract period, enter measurements or record unavailable data, review independently, close period. Detail displays source/method, coverage, target comparison, author, reviewer, correction history and chronological observations across periods without consolidating different method versions. Provider relationship links to performance; detail links to contract, issues, qualification, implementation, fees and obligations.

JWT-only API `/api/finance/performance`: list/detail/summary and dimension/open/measure/review/close. All writes are RPCs. No service key or scheduled job is called from the user route. RLS is forced on all five tables; mutation grants are revoked from authenticated users. Tenant/entity role and offboarding authorization is checked inside each write RPC.

Search and Financial Graph project existing records, with invoker views and caller RLS. Executive summary reports only registered periods and measurement coverage. Opportunity rules are opt-in, versioned customer configuration: `performance_review_due` and `performance_sla_issue` (independently confirmed SLA/availability observation outside the customer target). Neither decides what to buy. Daily leased contract job sends idempotent review reminders; opening creates a contract-scoped task, closing completes it. Audit events record opening, measurements, reviews and closing. Governed export includes all five datasets; legal hold and tenant lifecycle follow the existing governance controls.

## Migration and recovery

Apply `docs/supabase-financial-provider-performance.sql` after Covenants through the canonical manifest. Marker: `financial-provider-performance-1`. Reapplication is supported. Rollback restores prior shared Search/Graph/export/opportunity/job definitions and marker, then removes the empty capability. It refuses if dimensions, periods or related rules are recorded; it never deletes customer evidence to make rollback succeed. Hosted migration/recovery and independent CI are required before M2.

## Verification and remaining gates

Database tests cover tenant/entity isolation, factual target deviation, unsupported-source unavailability, correction history, independent review, stale version, closed-period writes and all four internal adapters with empty cohorts. The canonical database harness covers clean install, upgrade, reapplication, empty rollback and fresh install. Node tests cover presenter choices, unavailable/closed states, bounded inputs, JWT and server-derived tenant. Browser specifications cover unavailable review options, viewer permissions, closed-period actions and responsive overflow.

Local evidence: `check:all` passed; canonical PostgreSQL 16 harness passed with 7,124 canary checks and zero leaks; production JavaScript 429,004/800,000 bytes; demo JavaScript 799,569/800,000 bytes; dist references passed; npm audit reported zero vulnerabilities; E2E discovery found 495 tests across 17 files (including 15 PP-01 cases across five browser/device projects).

Browser download currently returns a truncated archive in this environment. Browser execution and hosted staging are unproven. Aggregate customer-weighted scoring, statistical trend deltas, bulk ingestion and external integrations are not part of this slice. Financial Spend now has a stacked M1/E1 evidence slice; its depth gaps and gates are recorded in FINANCIAL_SPEND_INTELLIGENCE.md.
