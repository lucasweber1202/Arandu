# Financial Spend Intelligence — SI-01

M1/E1 local slice, stacked after Provider Performance. Independent CI, executed browser tests and hosted staging remain gates.

## Financial meaning

Spend is evidence of contracted, observed, estimated or verified charges. These types are displayed and totaled separately. A spend difference is never savings: savings remain in Value Realization. Currency totals remain separate; no reporting currency, FX rate or conversion is invented. Contract financing principal, limits and unstructured cost prose are not treated as spend.

Sources are existing fee observations, comparable contractual charges computed by Fee Intelligence for those observed cohorts, and declared/imported records. The contractual projection is **not the entire contract spend**: its formula and cohort remain explicit. Verified observations are classified as verified, not duplicated into observed totals. Unverified fee observations remain observed. Rejected evidence is excluded. There is no ERP, TMS, bank-statement or provider API connector in this slice; an imported record is a manual evidence entry.

The time filter requires complete containment before an amount enters totals. A charge whose period partially overlaps is shown in evidence/coverage but excluded from totals. No daily allocation or invented prorating. Empty evidence and no reconciled evidence return unavailable amounts, not fabricated zero spend. Totals group currency, value kind, entity, provider and product; source and observation time are displayed. Product identifies the financial service category; configurable allocation categories and splits are not implemented.

## Deduplication and correction

`fin_spend_records` is append-only. Stable source reference plus stable source line identifies a financial row across the organization. Another contract cannot silently reuse the identity. Correcting requires the exact prior record and a reason; only the latest revision is projected. Corrections never inherit a prior reconciliation.

`fin_spend_reconciliations` is append-only. An independent admin/finance manager confirms or rejects evidence, explicitly attesting that they compared it with other sources for duplicates. Declared/imported evidence enters totals only after confirmation. Matching references already present in Fee Intelligence are rejected at write time; the projection also excludes a manual row if the fee source arrives later. This conservative rule can exclude legitimate additional lines sharing a statement reference; they require source normalization/reconciliation rather than automatic inclusion. Changing source references can evade mechanical matching, so cross-source duplicate detection remains a human gate. No fuzzy matching is claimed.

## Scope and flow

`/finance/spend.html`: list evidence, filter provider/entity/dates, see source-separated totals, record a declared/imported charge, inspect provenance, reconcile independently and correct without overwriting history. Fee-derived records are read-only and link back to their source. The API uses caller JWT, RLS and RPC-only writes; organization/provider/entity/product derive from the authorized contract. Histories and configuration lists fail explicitly beyond 500 rows; evidence pages paginate at 25.

Search and Financial Graph project Spend evidence under caller RLS. Executive Portfolio adds a card with source-separated amounts and coverage, without replacing existing screens. Provider Relationship and Provider Performance link to scoped Spend. Spend links to Fee Intelligence, contracts and Value Realization, keeping the ledgers distinct. Audit events record creation and reconciliation. Governed export includes both immutable tables. Hold/offboarding remain the existing governance lifecycle.

## Migration and remaining work

Apply `supabase-financial-spend-intelligence.sql` after Provider Performance; marker `financial-spend-intelligence-1`. Empty rollback restores prior export/Search/Graph definitions before dropping Spend. Rollback refuses recorded customer evidence.

This slice does not implement bulk ingestion, allocation splits, formal spend periods, wallet/concentration policy rules, Spend-derived Opportunity candidates, reconciliation task/reminder scheduling, statistical trends, FX conversion, executive export or external integrations. These are explicit depth gaps, not simulated completion. Browser execution remains blocked by a truncated Chromium download in the environment. CI and hosted evidence are pending.

## Local verification

`check:all` passed. PostgreSQL 16 integration covers clean/upgrade/reapply/empty rollback/fresh installation, source identity, independent reconciliation, corrections, missing and partial-period evidence, currency/type separation and tenant/entity isolation. Production JavaScript: 429,626/800,000 bytes; demo: 799,669/800,000 bytes. Dist asset references passed. E2E discovery: 510 cases in 18 files; browser execution is unproven. The Provider Performance parent CI database job failed with no executed steps; the connector did not expose its check-run error message, so the cause is not asserted.
