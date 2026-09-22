# Design Engine V4.3 execution report

Public copy: live account, app, environment and session identifiers are redacted. Original evidence remains local.

Recorded 22 September 2026. **V4 DESIGN SYSTEM NOT YET ACCEPTED.** Six current-factory variants now have accepted native evidence. The certified subset is not yet broad enough for a normal business application. Official authoring reconnects ended with HTTP 422, blocking further batches and verified harness cleanup.

## Source state and final Studio state

Only existing app `<identity-redacted>` in `Default-<identity-redacted>` was used. Solution: `pfx_PowerForgeExperiment`. This is a non-disposable Default environment; no UAT/production ALM claim is made.

| Lifecycle | Source hash / result |
| --- | --- |
| Independently acquired saved PAC source | `eca7c63eb8c199ef02c45f11a53e646478342b893948320eb6c32869e3b23432` |
| Original saved authoring semantic baseline | `88fe7e3910bbd10bae5c699a3bb2d933bd0302cb96e1fa92269c30c4efd10cfd` |
| Protected unsaved V4.2 focus-fixed draft | `8621d2d343ae9889afc0e966a847085a97e3b922da2f3eeddb1c388760bd34e0` |
| Accepted six-component static harness | `74385a3d1e6d4d8b4bd15a13d2fc3229039fdccd9b670da18502e613573565b9` |
| Date-corrected field runtime / breakpoint source | `5cbdb2498e3d2cbdba8059f8d10dcb197fb124ef7a9fe7aa9789db51d9f79480` |
| Last exact source readback, with themed field harness | `c651f5168a90fdd3d7b4d197bb84ea54e6bb9d5f95f57c81465ae697ac51bc26` |
| Published source hash | Not independently acquired; do not equate saved PAC with published proof |

Every harness compile retained all original files exactly. Saved/draft comparison resolved the two authorized Cancel/Discard focus handlers as `APPROVED_DRAFT_DELTA`; it did not label different lifecycle states as MATCH. The 192 original controls, 240 behavior bindings, SubmitForm path and Automation Check path remain protected.

**Studio still contains the unsaved focus correction plus `pc_certification_preview`.** The final themed source has immediate exact readback; subsequent source acquisition failed at connect, so post-runtime verification/restoration is not claimed. No further source mutation was attempted after the failure. The browser returned to the original dashboard in authoring mode and its temporary iframe sizing was removed.

Do not save/publish the test screen. Do not reload Studio merely to clear it, since that may lose the authorized draft. Recovery: re-establish doctor and fresh source, verify the exact protected source plus the owned harness, remove only `pc_certification_preview`, then verify the protected draft hash and rerun both checkers. Local recovery status: `output/design-v43/recovery-status.json`. Reproducible focus source and authorization remain in `output/canvas/native/v42-focus-review/`.

**KEEP CURRENT PUBLISHED VERSION. MIGRATION READY FOR REVIEW applies only to the already-reviewed focus patch; the temporary harness is not a product migration.** No publishing authority is inferred.

## Certification summary

| Measure | Count |
| --- | ---: |
| Implemented factory families | 41 |
| Implemented variants | 65 |
| Native validated variants | 6 |
| Preview validated variants | 6 |
| Production benchmarked variants | 0 |

Promoted exact variants: `PageHeader.standard`, `RecordHeader.standard`, `SectionHeader.standard`, `DetailPanel.standard`, `EmptyState.standard`, `LoadingState.standard`.

Each has generation lineage, official compile, exact readback, later matching source acquisition after runtime, source-bound checkers, and native light/dark captures at logical widths 390, 640, 834, 1024 and 1440. Certificates are in `output/design-v43/static-certification/`. The static DetailPanel contains text only; LoadingState certifies its visual state, not real backend latency. Arbitrary content, physical devices and assistive technologies are not certified.

Official discovery did not expose control versions. Certificates explicitly retain **CONTROL VERSION UNVERIFIED** and bind to the observed capability contract instead of manufacturing version evidence. One unrelated Screen1 naming suggestion is recorded; the generated static screen has no findings.

The [complete 65-variant matrix](design-v43-support.md) keeps all 59 other variants IMPLEMENTED. Core navigation, commands/filters, lists/tables/timeline, forms/wizard and overlays lack complete current-factory runtime suites. Existing Complaint Desk controls are not automatically credited as current-factory instances. No app UX was replaced to force coverage.

## Typed field results

Capability support and generated-instance validation are separate. No typed-field mapping receives full native certification in this run.

| Mapping | Capability status | Generated native compile | Runtime evidence | Remaining limitation |
| --- | --- | --- | --- | --- |
| text | SUPPORTED | PASS | Empty required error; string value; disabled; error clears | Read-only, mobile/light and binding integration incomplete |
| multiline | SUPPORTED | PASS | Required error; preserved newline string; disabled; error clears | Same; fixture initially had an erroneous USD label, corrected locally |
| number | SUPPORTED | PASS | Default 25; typed numeric 42; disabled | Invalid/custom range, read-only and real binding incomplete |
| percentage | SUPPORTED | PASS | Default 25; typed numeric 75; disabled | Out-of-range and read-only runtime incomplete |
| boolean | SUPPORTED | PASS | false → true, typed boolean, disabled | Read-only/required edge cases and full theme suite incomplete |
| toggle | SUPPORTED | PASS | false → true, typed boolean, disabled | Same |
| date | SUPPORTED | PASS | Date Only default/display/output September 22 after fix | Other locales/timezones and date validation incomplete |
| singleChoice | SUPPORTED_WITH_LIMIT | PASS | Normal default record; High selection preserves GUID and record shape; disabled | Real Dataverse Form.Updates readout and read-only incomplete |
| email | SUPPORTED_WITH_LIMIT | Not run | None | TextInput with semantic validation; no native email-keyboard claim |
| phone | SUPPORTED_WITH_LIMIT | Not run | None | TextInput with semantic validation; no native phone-keyboard claim |
| url | SUPPORTED_WITH_LIMIT | Not run | None | TextInput with HTTP(S) validation |
| currency | SUPPORTED_WITH_LIMIT | Not run | None | Numeric mapping; locale/currency formatting unproven |
| datetime | SUPPORTED_WITH_LIMIT | Not run | None | DatePicker plus time inputs; explicit timezone, DST unproven |
| lookup | SUPPORTED_WITH_LIMIT | Not run | None | No live reference binding proof; records must not be flattened |
| person | SUPPORTED_WITH_LIMIT | Not run | None | No live user-reference binding proof |
| multiChoice | SUPPORTED_WITH_LIMIT | Not run | None | SelectedItems table semantics tested offline; native selection/deselection unproven |

Local generated values were inspected through a fixture button using `JSON` in a behavior formula. No business SubmitForm was used. Basic required errors appeared for both empty text fields and cleared after valid values. There is no focus-to-invalid-field claim. Runtime updates propagate asynchronously; early reads were not accepted as final outputs.

Native testing found and fixed two mapping defects: Date Only using UTC displayed the preceding day while returning the correct date; it now uses Local calendar-day display. Checkbox/toggle label text was unreadable in dark mode; discovered `FontColor` now binds to `PF_text`. Native preview confirms September 22 and label color `rgb(237, 242, 250)`.

The field harness checker additionally reports four missing accessible labels on empty, hidden help controls. The generator now omits empty help controls, with a unit regression. **That correction has not been natively compiled** because connection failed. The unapplied, bounded candidate is `output/canvas/native/v43-fields-choice-accessible-pending/`; do not treat it as accepted evidence.

## Choice and business regression

Complaint Desk's existing Priority choice default was Normal. High was clicked, then independently observed with `aria-selected=true`; Review displayed `Priority: High`. Source inspection confirms Choices records, record-based defaults and the card's typed `.Selected.Value` update expression. The isolated singleChoice fixture also returned `{Id: ...0044, Value: "High"}` after starting from `...0043 / Normal`.

**The direct Dataverse form `Updates` object was not read at runtime.** Selected value and source update typing are established; complete choice/form-update proof remains a blocking gap. No Save was clicked. Required change reason kept Save changes disabled in the reviewed product state. Edit, Review, Cancel and Discard were exercised without committing. A later focus query landed on the Studio host, so V4.3 does not claim a new complete focus/keyboard certification; the approved handlers are source-preserved.

Automation Check remained idle and its binding was preserved. The original four accessible records remained visible. This is bounded preview regression, not complete functional/persona certification.

## Exact breakpoint proof

All twelve settled samples passed on the date-corrected source, followed by matching post-runtime source acquisition. Raw results/screenshots: `output/design-v43/boundaries.json` and `output/playwright/v43-boundary-settled-*.png`.

| Logical widths tested | Observed composition | Navigation | Queue/detail |
| --- | --- | --- | --- |
| 638, 639 | Mobile focused | Dock visible; sidebar hidden | Selected detail only |
| 640, 641, 958, 959 | Tablet focused | 64px sidebar; dock hidden | Selected detail only |
| 960, 961, 1098, 1099 | Compact split | 64px sidebar | Both visible; detail 52% of content |
| 1100, 1101 | Desktop split | 168px sidebar | Both visible; detail 400px |

Browser viewport was 1440×1000; browser zoom yielded CSS dimensions different from Canvas logical dimensions. The outer Studio iframe alone was sized to logical target + 1; each row records browser, CSS and actual Canvas width. Screen and child geometry required three stable samples with expected detail width. Early lagged captures, including a 638px screen with a stale 1240px detail child, were excluded. This proves the tested selected-record composition, not every possible form/overlay state at those boundaries.

## Checkers, performance and critique

Static certified source: App Checker clean; accessibility zero errors plus the known unrelated Screen1 suggestion. Last exact field source: App Checker clean; accessibility **4 errors + 1 suggestion** as described above. No stale V4.2 checker was substituted.

The official Screen lookup did not expose a separate readable-name property. Microsoft's [Screen reference](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/control-screen) and [accessible app structure guidance](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/accessible-apps-structure) tie readable names to screen identity. Internal Screen1 was retained to protect bindings; no fabricated accessibility property was added.

| Source | Controls | Maximum depth | Gallery template | Formula inventory |
| --- | ---: | ---: | ---: | ---: |
| Protected draft | 192 | 8 | 5 | 2828 |
| Static harness | 211 | 8 | 5 | 3101 |
| Final field harness | 227 | 8 | 5 | 3318 |

Budgets remain 240/12/16. No FPS, latency or large-dataset performance claim. Native screenshot `v43-final-dashboard-dark.png` shows the sparse lower desktop area: only four accessible records, three recent items and three priority groups populate fixed upper content. The lower blank space is primarily limited content plus viewport height. Recent-item titles truncate; this deserves a separate compact-width review, not decorative content or a hidden certification migration. No product visual fix was applied.

## Design authority and tests

The V4 native path consumes decisions → Composition IR → existing factories. The regression test changes CompactSidebar to TopNavigation and verifies different native output and resolutions. Production mode now verifies both planned selections and every emitted factory. Native manifest proof selects certified `RecordHeader.standard` and rejects `RecordHeader.editorial`; nine negative evidence cases also reject stale implementations, missing runtime, altered artifacts/widths and unpublished product claims.

`native.ts` retains an explicit legacy compatibility branch. Its `nativeDesign` branch returns V4 output directly, and the legacy branch refuses a V4 design without an explicit host migration. The Complaint adapter supplies semantic/binding compatibility; it does not silently replace V4 selection. Legacy generation still exists outside the opted-in V4 path and is not represented as certified production generation.

Validation: **500 tests / 35 files**, including the prior 451/34; lint, typecheck and build pass. **20 structural Chromium tests pass** and remain labeled structural. Four product archetypes retain distinct compositions. Schemas regenerated. Real-artifact integration: six certificates accepted, nine negative cases rejected, certified standard selected, uncertified sibling rejected. No tests or baselines were removed to obtain these results.

## Tenant effects

| Effect during V4.3 | Count |
| --- | ---: |
| Official authoring compile attempts | 7 |
| Immediate exact readbacks | 4 |
| Preflight-blocked candidate attempts, no compile | 3 |
| Existing apps with unsaved test source changes | 1 |
| Temporary owned screens added / remaining | 1 / 1 |
| Apps saved / published / created | 0 / 0 / 0 |
| Flows invoked / changed | 0 / 0 |
| Business rows created / updated / deleted | 0 / 0 / 0 |

Three first-pass compilations needed explicit review of native default omissions; delayed coauthoring child reorders also blocked revision preflight. Four accepted immediate readbacks are static normalized, basic fields reordered, date-corrected choice fields and themed choice fields. The final HTTP 422 diagnostics were read-only reconnect attempts, not source retries. No connectors, environment variables, tables or other tenant resources were created.

## Acceptance blockers

1. Core current-factory navigation, form/wizard, overlay and data variants lack the native suites needed for a useful production subset.
2. Typed field read-only/validation/theme coverage and direct Dataverse Form.Updates choice proof remain incomplete; empty-help accessibility correction needs native validation.
3. Official authoring reconnect HTTP 422 blocks fresh post-runtime readback and verified removal of the owned test screen. The authoring lifecycle is therefore not yet stable enough for acceptance.

No published benchmark is claimed. Publication is not required to invent progress, and its absence does not authorize unsafe tenant operations. Unified Solution Compiler work remains gated.
