# Pilot stabilization after #103 — 2026-10-03

## Baseline and scope

Live `pilot`: `742fc1f9ba88007d0f0bbeb37819620824c1046c`, merge of #103.
No subsequent commit was observed at investigation time. Existing P0.2 and P0.4–P0.6
are retained. Passport entity scope (P0.3-02), Graph (P0.3-03) and P0.7 remain pending
until the baseline and Pilot deployment are verified healthy.

## Presentation root cause

Actions run [37148718617](https://github.com/lucasweber1202/Arandu/actions/runs/37148718617),
job `111278044673`, tested merge `f1b3b9c` with the same application content as #103.
Result: 294 passed, 44 existing skips, one failed Mobile Safari layout test and
one WebKit performance test that passed on retry (route p95 1674 ms on first attempt,
budget 1500 ms unchanged). The supplemental Safari smoke passed; it did not cover
the failing contract action.

The actual failure was **31 px**, not the earlier 52 px. Reproduced locally using
Playwright 1.63 / WebKit 2359, iPhone 15 (393 px), spacious density. Card content
was 255 px; “Abrir contrato: termos, aditivos e marcos” was 355.14 px wide and
ended at x=424.14. The inherited `.btn { white-space: nowrap }` made its long label
overflow. Timeline and saved-view descendants in the diagnostic were inside
legitimate scroll containers, so their right coordinates did not identify the cause.
Changing grid tracks or wrapping page-header actions alone left the 31 px unchanged;
wrapping the contract lifecycle action reduced document overflow to zero.

At 320 px, Chromium also reproduced a 10 px overflow from “Iniciar nova concorrência”.
The scoped correction lets contract-card and contract-page-header buttons wrap,
with bounded width and a shrinkable label. It retains full text, focus styling,
touch height and timeline horizontal scrolling. No global overflow hiding,
threshold/retry changes, removed checks or browser skips.

Regression coverage uses 320/393 px, light/dark, spacious density; verifies button
bounds, document overflow, timeline scroll, keyboard opening of the contract center,
Escape and focus restoration in every configured engine.

## Vercel — observed failures and external blocker

All three statuses below were read for exact merged SHA `742fc1f`.

| Project | Deployment | Branch / commit | Build | Environment | Root cause | Action |
| --- | --- | --- | --- | --- | --- | --- |
| arandu | `dpl_52FTrYpoTqjyL74vgPxMt4aip1az` | pilot / 742fc1f | GitHub Vercel status failure | not attested | logs/settings inaccessible; application/build/config cause unproven | inspect with authorized scope; no production change |
| arandu-demo | `dpl_7V2nDzGdNNweMN38VWKNF9Kv3NRf` | pilot / 742fc1f | GitHub Vercel status failure | not attested | logs/settings inaccessible; cause unproven | inspect separately; do not promote pilot to main |
| arandu-pilot | `dpl_DwZgqGxtWTybrDLtV2jXX3Xgyjot` | pilot / 742fc1f | GitHub Vercel status failure | not attested | logs/settings inaccessible; cause unproven | priority: authorize scope and inspect Pilot |

**BLOCKER:** connected Vercel identity cannot access `lucas-projects467`
(`team_BBpDcLVx5izJjXz5qBEq2cRy`). `get_project` and `get_deployment` returned
403 “Not authorized … re-authenticate to this scope or use a token with access”.
Team enumeration returned no teams. The advertised build-log tool was also unavailable.
This proves an investigation access blocker, not the deployment root cause.

**WHO MUST ACT:** account/team owner or authorized Vercel administrator.

**EXACT ACTION:** reconnect Vercel with access to this team, or inspect in an
already authorized local CLI session:

```sh
npx vercel inspect dpl_DwZgqGxtWTybrDLtV2jXX3Xgyjot --scope lucas-projects467 --logs
npx vercel inspect dpl_7V2nDzGdNNweMN38VWKNF9Kv3NRf --scope lucas-projects467 --logs
npx vercel inspect dpl_52FTrYpoTqjyL74vgPxMt4aip1az --scope lucas-projects467 --logs
```

Check the first failing command, project production branch, Node 24, root directory,
`npm ci --include=optional`, `npm run vercel-build`, output `dist`, and variable scopes.
Existing `scripts/vercel-build.mjs` and `npm run finance:env:check` already fail closed
on wrong branch, missing credentials, mismatched Supabase, or sandbox in a real environment.
Use those preflights with safely injected configuration; do not paste secrets in chat/logs.
Pilot requires `ARANDU_ENV=pilot`, production branch `pilot`, dedicated Supabase,
`ARANDU_SITE_URL`, anon/server service keys and independent `CRON_SECRET`.
Real-environment variables belong to the matching project's Production scope;
do not expose Pilot service credentials to arbitrary feature previews.
Only change settings supported by actual failing logs/preflight results.

**WHAT IS READY:** localized CSS fix, cross-browser regression test, existing
environment/build preflights, explicit deployment IDs and reproduction evidence.

**HOW TO VERIFY:** relevant Actions gates green for the PR SHA, authorized Pilot
build READY for the intended SHA, environment/branch/Supabase attested, public
boundary smoke and authenticated Pilot doctor/canary. A preview or an older READY
deployment is not proof that this Pilot SHA is healthy.

## Local validation

Source reconstructed from a previous local checkout plus GitHub files pinned to
`742fc1f`; runtime code/text synchronized against the live tree. Historical binary
visual evidence was not redownloaded and is not asserted as an exact Git clone.

- `npm ci --include=optional`: passed.
- `npm run audit:ci`: zero vulnerabilities.
- `npm run sbom:ci`: passed, 21 components.
- `npm run check:all`: passed.
- Presentation build, dist assets and size budgets: passed.
- `npm run test:e2e:list`: passed.
- `npm run test:database`: attempted, blocked locally by absent `psql`; no SQL changed.
- Targeted cross-browser/mobile verification and full suites: results recorded in PR.
- `git diff --check`: passed.

Browser downloads and system dependency installation required local recovery;
Firefox needs its content sandbox disabled only inside this already isolated local
runner because user-namespace creation fails with EPERM. Repository/CI settings
are unchanged. Remote CI remains authoritative for the standard runner matrix.

## Risk and rollback

Only contract action layout and regression coverage change. Long labels can make
buttons taller on small screens. Revert the stabilization PR to roll back; no
database migration, data change or environment mutation is involved. Do not merge
or mark Pilot healthy without the relevant CI and deployment evidence.
