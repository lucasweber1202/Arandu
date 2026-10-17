# Contract lifecycle API: additive list scope

`GET /api/finance/implementations` and `GET /api/finance/covenants` accept one
optional UUID `contract_id`. It is combined with organization, provider and
legal-entity filters, never substituted for authorization. All reads use the
caller JWT and existing RLS; a hidden or unknown contract returns an empty list.
Malformed/empty IDs return `400 invalid_id`; duplicate contract filters return
`400 invalid_query`. The filter is list-only: implementation detail and covenant
summary/detail reject it with `400 invalid_query` rather than implying a filtered
summary. Existing callers without the parameter retain their contract.

Pages retain 25 items, lookahead 26 and numeric `after` offset (0–5000). Existing
primary ordering is retained with ID tie-breaks. Offset pagination is deterministic
for an unchanged dataset; concurrent updates can move records between pages.
This change does not promise a snapshot across requests.

Implementation detail resolves its exact contract, decision, institution and
entity under the caller JWT, including an authorized historical contract. Missing
or hidden references receive neutral labels with no privileged fallback. Additive
`origin` contains `contract_id`, `decision_id`, `source_reference`,
`template_version`, `contract_title`, `decision_label`, `provider_name`,
`entity_name`, `template_label`. IDs remain machine provenance; human date and
source lines use the shared presentation helpers. Action IDs and optimistic
versions retain their existing semantics. Frontend may use the list parameter
for contract navigation and the named origin fields; no frontend edit is included.

Task creation only confirms `201` after exactly one returned row with a UUID ID.
An empty or malformed success representation returns `409 task_creation_unknown`:
reload/reconcile instead of assuming persistence or generating a fresh key.
Retry with the same idempotency key and intent retains the existing replay
contract (`200` for a confirmed existing row); a different payload conflicts.
This response is uncertainty, not proof that an insert was rolled back.
