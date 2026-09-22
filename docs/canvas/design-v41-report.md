# V4.1 work report — 22 September 2026

**Status: partial implementation; native completion gates remain open.** No tenant mutation was performed. This report must not be read as V4.1 acceptance.

## Delivered

- Hash-bound composition IR, semantic slots, compatible component resolution, explicit fallback trace and production maturity rejection.
- `canvas native` routes explicit nativeDesign contracts through the same composition/factory compiler used by candidates; it refuses silent replacement of legacy screens and typed flow bindings.
- Sixteen typed input source mappings, Dataverse metadata mapping, structured validation, native error-state properties where discovered, ValidationSummary, wizard validation/review gates.
- Same-app dedicated task screen with origin/return/unsaved contract; explicitly limited external document preview.
- All seven suffix presentation rules removed from `engine.ts`; producer-owned role maps replace them. Generic typography/color/status treatments extracted from the Complaint Desk adapter.
- Read-only migration planner, source-bound certification gate, schemas, CLI commands and reproducible benchmark/report script.

See [migration map](design-v41-migration-map.md) and [implementation details](design-v41.md). The old business binding/form compiler and part of the Complaint Desk visual adapter remain. The full target architecture has therefore not yet replaced the legacy authority for that app.

## Native evidence and failures

The official Microsoft authoring server 1.1.5 connected to the owned existing Canvas app in the non-disposable Default environment. Seven input-control contracts were discovered read-only. Exact installed control versions were not returned; the server version is not a control version.

Three sync attempts returned `No files returned from server. Nothing written.` despite `isError` being absent/false. No fresh native baseline was captured. The wrapper now checks actual local YAML before reporting sync success. Official App Checker returned `No app checker issues found`; accessibility returned `No accessibility errors found`. Those responses were **not bound to fresh source** and cannot certify the current app or candidates.

The existing app was opened in Studio and previewed without save/publish. Baseline-only screenshots were inspected at browser widths 1440 and 390 using Window size. The wide view has a large sparse chart region and clipped right-hand content; the narrow Studio preview is clipped and is **not a responsive pass**. These images are not attached to a new-source critique or certification. Remaining target widths/themes and current-source native interactions are untested.

No candidate was compiled remotely. Under the requested tenant constraints, benchmark source cannot replace Complaint Desk just to obtain screenshots, and no extra app may be created. A fresh source baseline and a reviewed behavior-preserving existing-app migration are still required.

## Certification counts

| Evidence level | Factories |
|---|---:|
| Implemented | 41 |
| Native validated for current source | 0 |
| Production benchmarked | 0 |

There are 65 existing executable variants, plus 16 typed-field mappings and composition helpers; these are not inflated into new factory counts. Every native certification remains pending rather than passed. [Full component/variant support matrix](design-v41-support.md) lists all families and limitations. No component failed a remote compile in this turn because no remote compile was attempted.

## Local benchmarks

Eleven native-source candidates passed static preflight. All use local synthetic data.

| Product | Source composition | Controls (each theme) | Maximum depth | Native compile/runtime |
|---|---|---:|---:|---|
| Operational queue | command-filter-data | 122 | 7 | Pending |
| Executive analytics | lead-comparison-evidence | 89 | 7 | Pending |
| Document review | document-context-index | 92 | 7 | Pending |
| Field inspection | task-progress-fields-dock | 105 | 5 | Pending |

Both light and dark sources were generated. Same-product data-first/workspace-first/content-first candidates contain 122/133/133 controls and three distinct structural hashes ignoring colors and branding. This is native **source** diversity, not a native-rendered tournament. Gallery template complexity/formula inventories are in `output/design-v41/report.json`; no runtime load-performance claim is made.

Operational scanning, analytical hierarchy, document dominance and mobile task quality still need native candidate review. The document benchmark is a content workspace unless an explicit external preview contract is supplied; no embedded document viewer is inferred.

## Complaint Desk migration

The comparison uses the historical `taste-receipt-v4` source, explicitly not a fresh live baseline. It reports 173 retained controls, 8 moved, 0 explicit replacements, 5 removed and 36 functional differences. The planner blocks apply. Differences include normalization/scope/source differences; they are not all asserted to be business regressions.

The contextual recommendation is CompactSidebar, SideSheet, DataTable, single-column form and CommandBar. Keep the current app until these are reconciled with its typed priority, filtering/sorting/selection, reason/review gates, SubmitForm, success/failure, unsaved state and Automation Check. SideSheet, filter chips, revised header and snackbar remain review options, not approved product changes. A contextual recommendation is not enough to discard the existing form architecture.

## Design execution audit

| Dimension | Stored | Token effect | Structure/selection effect | Classification | Native visible proof |
|---|---|---|---|---|---|
| density | Yes | Row/section rhythm | List variant | EXECUTABLE | No |
| formality | Yes | No | No | INTENT_ONLY | No |
| warmth | Yes | Canvas background | No | EXECUTABLE | No |
| contrast | Yes | No | No | INTENT_ONLY | No |
| surfaceDepth | Yes | Elevation | No | EXECUTABLE | No |
| radiusCharacter | Yes | Radius when explicit | No | EXECUTABLE | No |
| typographyExpression | Yes | Explicit header scale | Header height | EXECUTABLE | No |
| navigationPresence | Yes | No | Navigation weighting | EXECUTABLE | No |
| dataEmphasis | Yes | No | Data-view weighting | EXECUTABLE | No |
| brandExpression | Yes | No | No | INTENT_ONLY | No |
| motion | Yes | No | No | INTENT_ONLY | No |
| decorativeIntensity | Yes | Bounded border weight | No | EXECUTABLE | No |

## Verification

`npm run check`: lint, type checking and 417 tests across 33 files passed. The V4.1 file contains 44 semantic tests, including all input types against discovered properties, metadata mappings, invalid contracts, source composition, fallbacks, maturity rejection, wizard gates, migration scope/dependency failures and 0/1/4/24-record fixtures. All prior V1–V4 suites remain green.

`npm run test:design-visual`: 20 structural Chromium tests passed with existing baselines. These are not native Canvas evidence. Generated schemas were rebuilt. No new native interaction tests are claimed as executed.

## Tenant mutations

| Resource operation | Count |
|---|---:|
| Canvas apps created | 0 |
| Canvas apps updated | 0 |
| Flows created | 0 |
| Flows updated | 0 |
| Business rows created | 0 |
| Business rows updated | 0 |
| Business rows deleted | 0 |

No save, publish, approval, email or business record operation was invoked. Studio navigation, preview, read-only discovery and failed source syncs are not application updates.

## Remaining work

Recover a verifiable fresh source export; finish lowering legacy business bindings into the new IR without changing write paths; remove remaining compatibility-adapter layout coupling; complete discovered-control version verification and native compile/runtime/visual evidence for the requested families, devices, themes and states; then review a specific migration before apply. Certification currently generates scoped verdicts but does not globally promote factories. Automatic dedicated-page selection remains disabled until its host context can be supplied safely.
