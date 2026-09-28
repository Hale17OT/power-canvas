# SharePoint V1.1S simulated contract certification

V1.1S uses the existing SharePoint HTTP transport, discovery, response parser, Unified Solution Compiler and internal execution adapter. The external account/tenant blocker remains. This phase performs no SharePoint sign-in, consent recovery, tenant discovery or real provisioning.

## Running it

`npm run sharepoint:simulate` builds the provider, runs the stateful local HTTP suite, launches Microsoft Dev Proxy separately for each benchmark, stops every process and writes a fresh ignored `output/sharepoint-v11s/run-*` evidence bundle. The command fails if Dev Proxy cannot run or a contract fails; it never silently replaces missing Dev Proxy evidence with unit-test evidence.

Use a portable Microsoft Dev Proxy **3.3.1** at `.powercanvas/tooling/devproxy-v3.3.1/devproxy.exe`, or set `POWERCANVAS_DEVPROXY_PATH` to the executable. Obtain it from the official [Microsoft Dev Proxy releases](https://github.com/dotnet/dev-proxy/releases). No system installation is needed. The command explicitly disables `asSystemProxy` and `installCert`, binds loopback, disables update notifications and skips first-run setup. It does not change OS proxy settings or trust certificates.

`node scripts/sharepoint-simulate.mjs --unit` runs the deterministic suite without Dev Proxy and without writing an evidence bundle. It is used by the normal test suite. `--refresh-mocks` regenerates the reviewable static response files; use it intentionally and review the diff. Normal runs use the committed mocks unchanged. `--record-evidence` records simulated capability dimensions only after the entire integration run succeeds.

## Boundaries and isolation

The provider generates its normal HTTPS Graph/REST URLs and validates audience, tenant, scope and expiry normally. A test-only transport sends those complete URLs as HTTP proxy requests to `127.0.0.1`; it has no DNS resolution, live forwarding or fallback. Deterministic credentials exist only in the test harness. No production MSAL profile or environment binding is read or changed.

The fictional hostname is `powercanvas-simulation.sharepoint.com`, site path `/sites/PowerCanvasProviderLab`. Target configuration requires explicit `SHAREPOINT_SIMULATION` mode for this reserved identity. The HTTP constructor rejects this identity without an isolated transport. The execution adapter rejects simulation evidence in a production execution context. Synthetic receipts are held only in isolated test state and ignored evidence bundles.

Dev Proxy uses **GraphMockResponsePlugin** for Graph and **MockResponsePlugin** for SharePoint REST, both with `blockUnmockedRequests: true`. Client origin restrictions and plugin URL scopes cover both permitted origins; unmapped endpoints are tested and return blocked errors. See Microsoft's [Graph plugin](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/technical-reference/graphmockresponseplugin) and [unmocked request behavior](https://learn.microsoft.com/en-us/microsoft-cloud/dev/dev-proxy/how-to/mock-responses).

Dev Proxy proves the static HTTP/read contracts. A separate stateful, loopback-only service proves creation and failure transitions that static response files cannot faithfully model. Both use the same production provider code. The service implements a bounded Microsoft-shaped API contract, not SharePoint Online itself. No certification test returns manufactured observation objects directly to the planner.

## Profiles and read cycles

| Profile | Metadata | Principal checks |
| --- | --- | --- |
| Team tracker | Categories/Requests, text/choice/person/lookup/date columns, Active requests view | Internal identities, pagination, platform fields, Canvas binding and compiled Flow reference |
| Document management | Suppliers, Contracts and Review Documents libraries, distinct drives, site columns, Item/Document/custom types, attachments, Incoming/Approved/Archive folders | List/drive linkage, source-column links, content-type lineage and exact-folder identity |
| Mixed edge cases | Duplicate Requests labels with different IDs, system list, unique permissions, multichoice/multiperson, multiple libraries and different ETags | Explicit-ID binding, conflicts, privacy, Graph/classic security separation |

Each existing benchmark—Document Approval, Team Request Tracker and Contract Library—runs three independent provider discovery/plan cycles against the local service and three more against Dev Proxy. The edge profile also runs three independent local read cycles. Every cycle reacquires a synthetic credential context and reissues the required HTTP requests. Semantic comparisons exclude acquisition timestamps; no complete observation is cached. Document Approval's generated DOCX/PDF blocker remains visible.

The JSON fixtures preserve Graph OData collections/continuations, list facets, column facets, SharePoint IDs, drive identities and REST response envelopes. Default fields are classified `PLATFORM_DEFAULT` without receipts. List inventory is shallow; deep reads target source-declared/bound metadata. Folder lookup is exact; there are no business files or list items.

## Endpoint contract

The full exact URL/method/status inventory, including Dev Proxy requests, is saved in `endpoint-inventory.json`. The bounded families are:

| Surface | Requests |
| --- | --- |
| Graph | Exact `/sites/{hostname}:/{path}`; `/sites/{id}/lists` with pagination |
| Graph | `/sites/{id}/lists/{listId}` and `/columns`, individual columns, `/drive`, `/contentTypes`, `/permissions` |
| Graph | `/sites/{id}/columns`, `/contentTypes`, `/contentTypes/{typeId}` and `/columns` |
| Graph | `/drives/{driveId}/root` and `root:/{explicit-folder}` |
| REST | `/_api/web` and `/_api/site` identity |
| REST | `/_api/web/lists(guid'{id}')/views`, exact view `/viewfields` |
| REST | Exact list inheritance and `/roleassignments` |
| Simulated writes only | Graph POST list; POST text/choice/date columns; negative PATCH |

DELETE is rejected before dispatch. Tenant-wide search, list-item access, document content and folder-child enumeration are blocked. Multiple libraries resolve through their exact list-to-drive relationship, never a shared display label.

## Failure and reconciliation evidence

| Scenario | Result |
| --- | --- |
| Graph/REST site mismatch | `SITE_TARGET_MISMATCH`; stop |
| Wrong library drive linkage | `LIBRARY_IDENTITY_MISMATCH`; stop |
| Missing lookup target | Blocked; no fabricated dependency |
| Missing bound resource | `BOUND_RESOURCE_MISSING`; no same-name fallback |
| Wrong content-type attachment source | `CONTENT_TYPE_SOURCE_MISMATCH`; no false absence |
| Missing attachment | Explicitly absent, distinct from wrong source |
| Duplicate unbound display names | Conflict |
| Failed second page | No complete observation or executable plan |
| GET 403/404 | One attempt, no retry |
| GET 429 | Retry-After 2,000 ms; actual wall-clock delay verified |
| GET 500/502/503/504 | Bounded recovery; scheduled delay recorded |
| Socket reset / injected connect timeout | Separate transport scenarios; bounded recovery |
| POST accepted then dropped | `UNKNOWN_OUTCOME`; one POST, fresh read-only reconciliation, existing unowned conflict, no receipt/adoption |
| POST 400 | `CREATE_REJECTED`; no state/receipt |
| Create returns unexpected metadata | `CREATED_UNVERIFIED`; no receipt or dependent columns |
| Changed ETag at execution attestation | `DEPENDENCY_CHANGED` semantics via existing stale-plan rejection; zero additional mutations |
| PATCH failure | One attempt; no GET-style retry |
| DELETE | Never dispatched |
| Unmocked endpoint | Blocked by both the local service and Dev Proxy |

The positive mutation fixture is exactly **one generic list plus three columns: text, choice and date**. The real request builder dispatches four POSTs to simulated state, the real response parser verifies each readback, four source-bound synthetic receipts are written, and fresh independent discovery yields **four `NO_OP` resources plus the external site**. This is staged/reconcilable, not transactional or exactly-once execution.

## Provider corrections found

1. Fresh execution observations naturally have different acquisition timestamps. Attestation now excludes only that timestamp; all metadata, ETags, target identity, coverage, auth and ownership remain exact-plan bound.
2. Explicit deep metadata inspection captures default fields even when a library uses only site/content-type columns.
3. Explicit missing list bindings fail before same-name substitution. Hidden/system inventory stays distinct from normal unbound collision matching.
4. Wrong-source content-type attachments are rejected rather than reported absent.
5. Graph and REST identities correlate by URL and site/web GUIDs. Graph site `name` remains distinct from display name.
6. Classic permission evidence strips personal names/emails and keeps bounded principal/role IDs. Graph permissions remain a distinct application-permission shape.

No global retry policy was changed. No mutation route was added to the CLI.

## Bindings

Canvas source aliases resolve to observed list IDs and exact internal field names. The team-tracker Flow is compiled with the same site/list identity and derived field metadata. Library contracts carry distinct list/drive identities. Person subfields stay opaque; they are not falsely represented as lookup `Id/Value` fields. These are `SIMULATED_BINDING_RESOLUTION_VERIFIED` results, not native registration, Flow execution, delegation or end-user access proof.

## Support matrix

| Capability | Offline | Simulated read | Simulated write | Simulated NO_OP | Live read/write | Runtime |
| --- | --- | --- | --- | --- | --- | --- |
| Existing site | Yes | Verified | Not applicable | External binding | External account blocked | Unproven |
| Lists | Yes | Verified | One generic list | Verified | External account blocked | Unproven |
| Libraries / drives | Yes | Verified | Unproven | Unproven | External account blocked | Unproven |
| Columns | Yes | Verified | Text, choice, date only | Same three types | External account blocked | Unproven |
| Lookup / person / multichoice | Yes | Verified | Unproven | Unproven | External account blocked | Unproven |
| Site columns / content types / links | Yes | Verified | Unproven | Unproven | External account blocked | Unproven |
| Content-type attachment | Yes | Verified | Unproven | Unproven | External account blocked | Unproven |
| Explicit folders | Yes | Verified | Unproven | Unproven | External account blocked | Unproven |
| Public views / CAML | Yes | Verified | Unproven | Unproven | External account blocked | Unproven |
| Permission observation | Yes | Verified | Blocked | Not applicable | External account blocked | Unproven |
| Site creation | Blocked | Not applicable | Not implemented | Not applicable | Not performed | Not applicable |
| Canvas / Flow symbolic bindings | Yes | Local resolution verified | No deployment | Not applicable | External account blocked | Unproven |

Capability dimensions are read from `tests/sharepoint-simulation/certification.json` only while its provider/harness source hashes still match. Changing those files invalidates the simulated dimensions until recertification. They cannot promote live maturity. Raw evidence stays ignored; the public certificate contains fictional contract metadata, source hashes and an integrity hash only.

## Tenant effects and next phase

**Real SharePoint calls: 0. Real SharePoint writes: 0. Real business data: 0.** No Canvas/Flow deployment or run, authentication-profile change, environment rebind, permission write or V2 certification mutation occurred.

The bounded provider implementation can move forward as `PROVIDER_IMPLEMENTATION_READY`, `SIMULATED_CONTRACT_CERTIFIED`, with `LIVE_CERTIFICATION_EXTERNAL_BLOCKED`. This does not promise actual Microsoft behavior outside the modeled contracts. Real throttling, permission scope/access, tenant-specific serialization, content-type propagation and runtime behavior still need live evidence.

Continue PowerCanvas development without waiting for SharePoint access. Once an explicitly configured suitable site/account is available, reuse this provider for a compact separate certification: live read cycle, reviewed tiny owned list with 3–4 fields, readback, fresh discovery and `NO_OP`. That future task needs its own exact provisioning authorization; simulation does not authorize it.

## Acceptance result

`npm run check`: **1,371 passed, 7 skipped**, preserving all 1,310 baseline tests. The added tests cover **58 HTTP lifecycle scenarios and 3 Dev Proxy configuration contracts**. Integration certification passed all three Dev Proxy benchmark profiles (9 independent cycles), plus 12 local read cycles across the benchmarks and edge profile. Agent evaluation remains 26 routing cases and 4 interpretation cases.

**SHAREPOINT SIMULATED CONTRACT CERTIFICATION PASSED — LIVE CERTIFICATION DEFERRED BY EXTERNAL ACCOUNT ACCESS**
