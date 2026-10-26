# Real provider receipt composition

35 checks PASS. Real Auth, HTTP API, PostgreSQL and RLS. Storage/browser/hosted NOT_RUN in this focused gate.

- Synthetic Auth account created
- Real login cookie issued
- Organization created through real API
- Creation confirmed by persistent intent API
- Receipt recovers a discarded create response
- Concurrent real HTTP retries return one identity
- One persisted counterparty
- One creation audit event
- Changed material conflicts safely
- Distinct intentions never merge by name
- Counterparty does not become authenticated institution
- analyst cannot create in buyer scope
- viewer cannot create in buyer scope
- provider cannot create in buyer scope
- other cannot create in buyer scope
- Another authorized actor cannot enumerate receipt
- other cannot read buyer receipt
- provider cannot read buyer receipt
- Authorized actor can create before revocation
- Revoked actor denied despite valid GoTrue session
- Malformed intent rejected before database write
