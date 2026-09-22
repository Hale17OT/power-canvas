# PowerCanvas V4.5 connection recovery report

Public copy: live account, app, environment and session identifiers are redacted. Original evidence remains local.

**EXTERNAL AUTHORING PLATFORM BLOCKER — V4 ACCEPTANCE REMAINS BLOCKED.**

22 September 2026. Official authoring became intermittently available, and the two explicitly authorized focus handlers were restored in unsaved preview. The required post-restoration reconnect gate failed **2/3**. The last failure was a connection timeout, not HTTP 422. Its underlying cause remains undetermined. Live attempts stopped; component certification and Unified Solution Compiler work did not resume.

## Current draft

The original V4.4 browser session was already absent at the first V4.5 inventory. It was not closed by this task. The reopened existing app contained its saved two-screen baseline, without the harness or focus correction. Independent PAC download and fresh MCP source agreed on that baseline.

The first three read-only diagnostic cycles passed against the saved baseline. They do **not** count as protected-draft stability evidence. After inspecting `output/design-v45/focus-restoration-plan.json`, the user expressly authorized: “Restore the two focus handlers in preview only”. This superseded the initial harness-removal-only write restriction for these two handlers:

- `pf_ds2_complaints_cancel.OnSelect`
- `pf_ds2_complaints_discardDialog_confirm.OnSelect`

Exactly one successful authoring write restored the candidate. Existing-record Cancel/Discard returns focus to Edit; new-record Cancel/Discard returns focus to New complaint. Commit paths and save/validation gates remain unchanged. Source preflight, independent saved witness, reviewed formula hashes and exact readback guarded the write.

Protected semantic/readback hash:

`8621d2d343ae9889afc0e966a847085a97e3b922da2f3eeddb1c388760bd34e0`

**Temporary screens remaining: 0. Removed by V4.5: 0.** The old harness was already absent; no manual deletion or unowned-screen adoption occurred. Two subsequent independent acquisitions verified the protected hash and expected two screens. The failed third connection provides no newer source evidence. The preview remains unsaved and unpublished; local reconstruction artifacts remain available if the browser session is lost.

Source-bound App Checker: **0 issues**. Accessibility Checker: **0 errors, 1 existing suggestion**, `Screen1 / ReadableScreenNameNeeded`. Screen1 was not renamed. No new runtime focus-interaction certification is claimed.

The V4.5 brief contains a transcription discrepancy in the old full-draft hash. The reverified V4.4 backup and V4.3 readback both give `c651f5168a90fdd3d7b4d197bb84ea54e6bb9d5f95f57c81465ae697ac51bc26`, rather than the different suffix in the brief. The protected post-cleanup hash above agrees with the brief.

## Working versus failing configuration

Historical command evidence and the original source patch were recovered from this task's recorded tool calls, restricted to relevant commands. This establishes the actual successful V4.2 doctor launch; a different legacy helper was not substituted as its configuration.

| Item | V4.2 successful doctor | V4.4 rejected connections | V4.5 diagnostic |
| --- | --- | --- | --- |
| MCP | 1.1.5 | 1.1.5 | 1.1.5 |
| .NET SDK / PAC | 10.0.401 / 2.12.2 | Same | Same; runtime 10.0.12 |
| Launch | Workspace `dotnet.exe dnx Microsoft.PowerApps.CanvasAuthoring.McpServer@1.1.5 --yes` | Same | Same |
| Explicit environment | `DOTNET_ROOT` points to workspace SDK; rest inherited | Same | Same |
| Authentication | Default official flow; same explicit login hint | Same | Same; no account removal or forced authentication reset |
| URL | Edit URL, bare GUID app-id | Same app/environment | Complete current URL, provider-qualified app-id |
| Routing | `make.powerapps.com` → `prod` | Same | Same; no separate cluster argument in official contract |
| Wrapper | Existing stdio client | Added diagnostic callback/classification | Added sanitized phase/process evidence and awaited process closure |
| Studio | Coauthoring verified, doctor passed | Coauthoring enabled; original and fresh editor failed | Editing, coauthoring enabled, autosave disabled; one known Studio tab |
| Studio version | Not captured in successful doctor | Client 3.26091.9; server v3.26091.9.381733538 | Same as V4.4 |
| Browser state | Playwright session; historical build/profile not retained | Protected original plus temporary diagnostic session | Original absent at start; existing saved app reopened in Chromium 153.0.8010.53 |

App: `<identity-redacted>`. Environment: `Default-<identity-redacted>`. Account hint: `<account-redacted>`. Tenant: `<identity-redacted>`. No app/environment change occurred.

The original successful doctor command ran at **2026-09-21 23:18:23.774 UTC**; doctor passed at **23:18:34.934**, epoch `<identity-redacted>`. A second V4.2 focus doctor passed at 23:37:15.172.

The legacy `canvas-authoring-session.mjs` helper has different `dotnet exec` and cache overrides, but the successful V4.2 doctor used the same generic DNX route as V4.4. Current workspace/user package copies match byte-for-byte. Historical inherited environment and package-resolution bytes were not archived, so complete historical equivalence cannot be asserted. No package upgrade, SDK change or speculative version A/B was performed: the official NuGet index still lists 1.1.5 as the newest stable release.

Fresh configuration followed Microsoft's [external authoring workflow](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/create-canvas-external-tools) and current [configure-canvas-mcp skill](https://raw.githubusercontent.com/microsoft/power-platform-skills/main/plugins/canvas-apps/skills/configure-canvas-mcp/SKILL.md). URL parsing preserves environment/app identity and derives environment category from the observed hostname. No undocumented routing/session endpoint was called. UI readiness was observed before connection; arbitrary delays were not used as a fix.

## Current Studio support details

| Detail | Observed value |
| --- | --- |
| Studio session | `<identity-redacted>` |
| Coauthoring session | `<identity-redacted>` |
| Embedded correlation | `<identity-redacted>` |
| Client / server | `3.26091.9` / `v3.26091.9.381733538` |
| Editing role | Editing; coauthoring on; autosave off |
| Known Studio tabs | 1; connected Chrome/Edge inventories contained no additional Studio tab |
| Telemetry location | `eu` |

No stale local Canvas MCP process was observed in inventories. Owned diagnostic processes were closed, with PID/start/exit evidence where retained; unrelated processes and global credentials were untouched. Known tab inventory cannot establish tenant-wide backend participation.

## Capability ladder and failures

| Layer | Protected cycle 1 | Protected cycle 2 | Protected cycle 3 |
| --- | --- | --- | --- |
| MCP initialize | PASS | PASS | PASS |
| Authentication evidenced | PASS | PASS | UNPROVEN in returned error |
| Studio session resolution | PASS | PASS | FAIL: connection timeout |
| Control listing | PASS | PASS | NOT REACHED |
| Button description | PASS | PASS | NOT REACHED |
| API discovery | PASS | PASS | NOT REACHED |
| Data-source discovery | PASS | PASS | NOT REACHED |
| Full source / doctor / protected hash | PASS | PASS | NOT REACHED |

Cycle epochs: `<identity-redacted>`, `<identity-redacted>`, `<identity-redacted>`. **Gate: 2/3, rejected.** Earlier baseline passes cannot replace the failed protected cycle.

| UTC timestamp | Evidence | Result / server diagnostic ID |
| --- | --- | --- |
| 2026-09-22 02:43:19.654 | V4.4 original session | HTTP 422; `<identity-redacted>` |
| 2026-09-22 03:02:47.746 | V4.4 fresh editor | HTTP 422; `<identity-redacted>` |
| V4.5 restoration preparation | Bounded terminal evidence; exact timestamp not retained in artifact | UNKNOWN connect failure, signed in; `<identity-redacted>` |
| 2026-09-22 15:02:20.360 | Protected cycle 3 | Connection timeout; `<identity-redacted>` |

The final returned text reports that the connected host failed to respond at `<environment-host-redacted>:443`. It exposes no HTTP status or headers. That is not evidence of an authentication failure or another HTTP 422. The server diagnostic IDs differ; this does not establish backend session allocation/reuse semantics.

V4.4 retained status, timestamp, diagnostic hash and session IDs, but not the detailed response body/headers. Those cannot now be reconstructed. **No V4.5 HTTP 422 was observed.** Across ten V4.5 connect attempts, eight connected and two failed. These include initial three baseline cycles, restoration preparations, one diagnostic capture, final restoration, and the three protected cycles. One separate PAC refresh failed before any write; the previously successful independent PAC witness was still within the existing freshness bound when restoration succeeded. The one-off failed restoration runner did not persist detailed connect/process evidence because connect occurred outside its finally block; the production diagnostic runner covers this path.

The current health is **AUTHORING_UNAVAILABLE**, with historical V4.4 **SESSION_REJECTED** evidence. No evidence establishes a specific routing, cache, authentication, network or service root cause. Successful source writes in one session do not satisfy repeatable transport availability.

## Implemented local diagnostics

The existing stdio client now emits sanitized phase, response and process records. A read-only runner tests the ordered capability ladder and stops at first failure. Support metadata retains service error/inner-error details and diagnostic IDs while redacting credential shapes. The support bundle builder explicitly selects bounded JSON metadata; it does not copy source directories, raw transport logs or business records.

Source providers expose health alongside their static capabilities. PAC remains read-only, including after a successful acquisition. Missing doctor/source evidence, rejected sessions and target mismatch cannot become write-eligible. Health is diagnostic evidence, not a replacement for freshness, ownership, independent-source, migration or activation guards. Existing V4.4 lifecycle and factory behavior remain intact. See [operating guide](design-v45.md).

## Validation, maturity and effects

Lint, typecheck and build pass. **569 tests / 37 files**, including 30 V4.5 tests, preserve the prior 539 tests. **20 structural Chromium tests pass**, without baseline replacement. Six prior certificate artifacts and nine negative evidence cases verify unchanged. Local browser tests are not live Canvas certification.

| Metric | Count |
| --- | ---: |
| Implemented families / variants | 41 / 65 |
| Native / preview validated | 6 / 6 |
| Production benchmarked | 0 |
| New certification batches / certificates | 0 / 0 |
| Apps created / saved / published | 0 / 0 / 0 |
| Authoring source writes | 1 (two approved focus handlers, unsaved preview) |
| Temporary screens added / removed / remaining | 0 / 0 / 0 |
| Flows invoked / created / changed | 0 / 0 / 0 |
| Business rows created / updated / deleted | 0 / 0 / 0 |
| New tables / connectors / environment variables | 0 / 0 / 0 |

Counts describe actions performed in this task, not a tenant-wide audit. The production-core manifest and acceptance verdict are unchanged. The Default environment remains non-disposable; no UAT/production ALM proof is claimed.

## Support package and next boundary

Local package: `output/design-v45/support/`. It contains `canvas-authoring-diagnostics.json`, `configuration-comparison.json`, `reproduction.md` and a SHA-256 manifest. It includes current/historical timestamps, exact identities, Studio/MCP diagnostic IDs, phase results, sanitized current failure, launch comparison, restoration evidence, mutation counts and explicit evidence gaps. No support message has been sent.

After a material supported transport/session change, reacquire the current draft and rerun three read-only protected-hash cycles. Do not reuse these now-historical snapshots as write authority. Preserve the preview or its hash-bound reconstruction; do not save/publish to fix connectivity. Resume V4.4 certification only after **3/3**. Until then: **EXTERNAL AUTHORING PLATFORM BLOCKER — V4 ACCEPTANCE REMAINS BLOCKED.**
