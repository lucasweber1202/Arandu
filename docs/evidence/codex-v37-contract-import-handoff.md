# B — persistent contract import and owner handoff

Base initial 78e3bb36221c6ef4b7bfc3ea450a144bf790ab39. Separate worktree/PR.
This is a functional backend implementation pending migration registration after
A integration. No company.js/contract-center.js/intents.mjs or common migration
manifest/doctor/core validator/runner was changed. Do not merge or deploy B
before the integration delta below is completed.

## UI contract for Claude

POST `/api/finance/contract-import`: existing request fields remain unchanged.
Add UUID `request_key` (or `x-arandu-request-key`, identical if both), optional
UUID `owner_id`. Generate the key once per draft intent; retain the exact request
and entity across transport failures. Never search overview by name/date to
infer success. `owner_id` without key gives 400 request_key_required, rather
than silently ignoring an assignment. Omitted owner defaults to the creator.
Legacy requests without key retain their RPC signature and duplicate guard;
they cannot promise recoverable keyed retries. New keyed requests permit two
legitimate contracts with identical attributes using distinct keys.

Example additive request fields:
`{"organization_id":"<uuid>","legal_entity_id":"<uuid or null>","request_key":"<uuid>","owner_id":"<uuid>"}`
plus provider_id/product/title/starts_on/ends_on and existing terms/options.
Response 201 first write / 200 replay:
`{ok:true,id,replayed,creation_version:1,owner_id,current_version,status,next_task}`.
Creation identity/version remains original; owner/status/version/task are current
RLS projections. A failure during these reads may follow a committed write:
reconcile using the receipt, never discard the key.

GET `/api/finance/contract-import-result?organization_id=<uuid>&legal_entity_id=<uuid>&request_key=<uuid>`
works independently of overview pagination. Entity must match original scope
(omit only for group/unscoped contract). Result 200:
- `state:"confirmed"`, id, creation_version, current_version, owner_id, owner_eligible;
- `state:"pending"`, id:null while a matching intent transaction holds the lock;
- `state:"unconfirmed"`, id:null when no committed receipt is visible. This
  is not proof of rejection and is never a misleading 404.

A receipt belongs to organization + original actor + key. Another actor cannot
use it to probe a contract. Current buyer membership/entity access is rechecked;
access denial is 403. Once confirmed, use existing authorized
GET `/api/finance/contract-detail?id=<uuid>`; its 404 deliberately means absent
or inaccessible, preserving tenant non-disclosure. Query failure/5xx means
unknown/temporary failure. A definitive rejected POST (validation/409/403)
remains a rejected command in UI; receipt lookup alone cannot infer why no write
exists. Keep pending/unconfirmed/rejected/query-error as distinct UI states.

POST `/api/finance/contract-owner`:
`{contract_id,expected_owner_id,owner_id}` -> `{ok:true,changed:boolean}`.
Admin/finance_manager with entity access may assign only current authorized
admin/finance_manager/analyst, with an eligible Auth account and entity access.
Viewer/provider/other tenant/unreachable entity are refused. Same current owner
is a no-op; concurrent owner change conflicts. Assignment has its own audit
event. This does not change contract terms/version or task assignee. Existing
fin_tasks assignee APIs remain the explicit route to assign the renewal action.
When the owner leaves, historical identity remains and owner_eligible becomes
false; existing receipt replay does not undo later changes or create a task.

Stable errors: 409 contract_import_conflict (key reused with other material),
403 contract_owner_unavailable, 409 contract_owner_conflict, existing validation,
forbidden, schema-unavailable and temporary upstream errors. UI must show
conflict and reload; never silently replace payload, owner or version.

## Persistence, retention and rollout

Columns on canonical fin_contracts: import_request_key/hash/actor; partial unique
organization/actor/key; all-or-none/hex constraint; immutable receipt trigger.
Fingerprint uses normalized canonical JSONB material (scope/actor/owner and
payload), not display labels or overview attributes. Advisory lock serializes
same intention; contract/version/task/event commit together. Owner validation
locks current membership/grants. Receipt is part of FINANCIAL_RECORD contract
retention/export/legal-hold, not an expiring cache or separate data store. No
new business table or external logs containing contract payloads.

Pending artifacts: docs/pending/contract-import-integrity/migration.sql and
rollback.sql. Standalone gate: ARANDU_CONTRACT_INTEGRITY_TEST_URL=<exclusive
loopback disposable DB> bash scripts/test-contract-import-integrity.sh. This
applies the current clean manifest, B, pre-use rollback, B twice, SQL and real
concurrency. It does not alter the common runner or claim CI applied B.

After A is integrated, the integrator must move the pending SQL to
`docs/supabase-financial-contract-import-integrity.sql` and its rollback to
`docs/rollback/supabase-financial-contract-import-integrity.rollback.sql`,
register B after A in both manifest flows, extend marker recognition in doctor,
backup/preflight/canary/probes and migration-bundle tests, add B rollback before
A in rollback chains, and invoke these B tests for clean/upgrade/fresh. Preserve
all prior checks for the new marker. Update this standalone runner's file paths.
The marker is financial-contract-import-integrity-1; rollback restores the saved
previous marker and refuses any receipt/assignment event (forward-fix required).
Re-run common database and four gates on the integrated exact HEAD.
