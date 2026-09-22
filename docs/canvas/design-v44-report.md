# PowerCanvas Design Engine V4.4 report

Public copy: live account, app, environment and session identifiers are redacted. Original evidence remains local.

**V4 DESIGN SYSTEM NOT YET ACCEPTED.** The native recovery gate still fails. No new native certificate or live reconnect-cycle success is claimed, and Unified Solution Compiler work has not started.

## HTTP 422 investigation

Two justified official connection attempts were made on 22 September 2026:

| UTC time | Context | Result |
| --- | --- | --- |
| 02:43:19 | Original Studio draft; coauthoring on, autosave off | HTTP 422, signed in, correct app/environment |
| 03:02:47 | Newly opened same-app Studio session after explicit editor override; settings reverified | HTTP 422, signed in, correct app/environment |

Client epochs were `<identity-redacted>` and `<identity-redacted>`. Returned server diagnostic session IDs were `<identity-redacted>` and `<identity-redacted>`. The original browser's Studio session ID was separately captured. No orphan authoring server process was found before the fresh-session experiment.

Observed classification is AUTHORING_REJECTED. **Cause remains UNDETERMINED.** The fresh UI session was editing the saved two-screen version without the temporary harness, while the original retained its unsaved three-screen draft. Failure persisted after that session transition. This does not prove whether Microsoft selected that new backend session or establish a particular coauthoring/backend defect.

Microsoft's [external authoring guidance](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/create-canvas-external-tools) requires an active Studio/coauthoring session; its [copresence guidance](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/copresence-power-apps-studio) documents editing ownership. Neither identifies the cause of this 422. No repeated blind reconnects, undocumented backend calls or source-write retries followed the second failure.

Diagnostics: `output/design-v44/initial-diagnosis/` and `output/design-v44/fresh-editor-diagnosis/connection-diagnostics.json`.

## Protected draft and recovery

The original Studio tab remains open with `pc_certification_preview`. The additional diagnostic tab was closed. Neither the two focus corrections nor the temporary screen were saved/published.

At 02:54:58 UTC, Studio View code / Copy code and App property reads produced a full local backup of all three screens and App properties. With only Control version suffix normalization, the semantic hash exactly matches the last V4.3 readback:

`c651f5168a90fdd3d7b4d197bb84ea54e6bb9d5f95f57c81465ae697ac51bc26`

Both approved Cancel/Discard focus handlers remain in that backup. It does not substitute for a healthy official doctor or authorize source changes. Download a copy was also attempted through the UI; no downloadable file arrived, so it was not accepted as backup evidence.

The protected post-cleanup target remains:

`8621d2d343ae9889afc0e966a847085a97e3b922da2f3eeddb1c388760bd34e0`

**Harness removed: no. Protected draft restored without harness: not verified. Temporary screens remaining: 1.** Fresh official acquisition is blocked before the required source-bound cleanup sequence. No manual deletion bypassed that gate.

Backup witness: `output/design-v44/ui-backup/backup-witness.json`. Ownership receipt: `output/design-v44/verified-core/v43-harness-ownership.json`.

## Implemented local reliability work

- Explicit eight-state lifecycle, fresh connection epochs, identity/inventory checks, stale-source rejection and failure invalidation.
- Exact owned-subtree recovery plans, idempotent already-restored handling, protected semantic restoration and no completed batch without verified zero additions.
- A reversible transaction around the existing official compiler with preflight reacquisition and readback. A compiler that retains the omitted screen fails cleanup in transport tests.
- Read-only `canvas authoring recover`, bounded diagnostics and classified CLI errors.
- A V4.4 certification runner retaining independent PAC agreement, approved focus deltas, ownership and checker gates. Its live execution is unproven because connect fails.
- Evidence-backed production-core restriction, dependency closure, cycle rejection, certified fallback rules and scoped readiness output.

See [operating guide](design-v44.md). Legacy V4.3 artifacts and the V1–V3 flow/compiler paths were not redesigned.

## Certification and maturity

New V4.4 native batches attempted: **0**. Promoted variants: **none**. Recovery was a prerequisite, not an optional step.

All six existing native/preview certificates were independently reverified:

`PageHeader.standard`, `RecordHeader.standard`, `SectionHeader.standard`, `DetailPanel.standard`, `EmptyState.standard`, `LoadingState.standard`.

The [machine-readable core](canvas-production-core-v1.json) contains exactly those six entries. Hierarchy has four entries; feedback has two. Navigation/data/forms/overlays/commands are empty, typed fields have no accepted production certification, and status is INCOMPLETE. Factory, capability and evidence hashes remain bound. Existing unknown control-version limitations remain explicit.

| Metric | Count |
| --- | ---: |
| Implemented factory families | 41 |
| Implemented variants | 65 |
| Native validated | 6 |
| Preview validated | 6 |
| Production benchmarked | 0 |

Deferred requested batches, all because recovery/doctor is unavailable:

| Batch | Variants/patterns deferred |
| --- | --- |
| Navigation and commands | CompactSidebar.standard, TopNavigation.standard, BottomNavigation.standard; CommandBar, SearchBox, FilterBar, FilterChips, OverflowMenu |
| Data | DataTable, RichList.compact, GroupedList.compact, ActivityTimeline |
| Forms | TaskForm.single-column, two-column, sectioned, wizard; FormSection, Stepper |
| Overlays | ConfirmationDialog, SideSheet.standard, BottomSheet.standard, FullScreenTask.standard, ContextPanel.standard |
| Feedback | Snackbar, ErrorState, Skeleton.content, Skeleton.table |

No failed native render was relabeled as certification. The [V4.3 65-variant matrix](design-v43-support.md) remains applicable. The twelve accepted breakpoint samples were preserved without recapture because responsive source was unchanged.

## Typed fields and accessibility

| Type | Retained V4.3 evidence | V4.4 status |
| --- | --- | --- |
| text | Required/value/disabled interaction | Read-only/theme/binding completion blocked |
| multiline | Required, newline value, disabled | Same |
| number | Numeric 25 → 42, disabled | Range/read-only/binding completion blocked |
| percentage | Numeric 25 → 75, disabled | Range/read-only completion blocked |
| boolean | Typed false → true, disabled, dark label fix | Complete read-only/required/theme suite blocked |
| toggle | Typed false → true, disabled, dark label fix | Same |
| date | Date Only calendar-day display/output fix | Read-only/validation/locale coverage blocked |
| singleChoice | Record default/selection shape, disabled | **Runtime Form.Updates remains unproven** |
| currency, email, phone, url, datetime, multiChoice, lookup, person | Implemented mappings, bounded offline contracts | No new native proof; production gate closed |

New source-contract tests cover the eight prioritized types' read-only property, theme binding and empty-help omission. They are not native runtime tests. No Form.Updates experiment was run; no before/after ETag experiment is claimed. No SubmitForm or business mutation was invoked.

The empty-help fix remains locally tested but not natively compiled. Last accepted field-source checker result remains **4 accessibility errors + 1 unrelated Screen1 suggestion**. The six static certificates have zero errors plus that known suggestion. No new checker result replaces either record. Screen1 was not renamed.

## Reconnect stress and scoped readiness

| V4.4 live lifecycle measure | Result |
| --- | ---: |
| Connect attempts | 2 |
| Successful official doctor | 0 |
| Fresh official source acquisitions | 0 |
| HTTP 422 responses | 2 |
| Observed official source mismatches | 0 (no acquisition possible) |
| Cleanup write attempts | 0 |
| Verified cleanup successes | 0 |
| Unresolved cleanup obligations | 1 |
| Completed live stress cycles | 0 / 3 required |

Local synthetic transport tests are excluded from these counts.

Three distinct structural profiles are modeled: desktop operations (sidebar/table/sectioned form), desktop read-oriented (top navigation/lists/detail), mobile task (bottom navigation/single-column/full-screen task). **All three are blocked by missing certified dependencies.** Their explicit missing lists are in the manifest. They are not three supported production designs. Charts were not falsely certified to fill that gap.

| Scope | Readiness |
| --- | --- |
| General business apps | NOT READY |
| Mobile task apps | NOT READY |
| Analytics-heavy apps | LIMITED; no certified complete analytical composition |
| Document workspaces | LIMITED; no certified complete document workspace |
| Advanced interactions | NOT READY |

## Validation

Final checks: lint, typecheck and build; **539 tests / 36 files**, preserving all previous 500 tests / 35 files. **20 structural Chromium tests** pass without baseline replacement. V4.3 artifact verification retains six certificates and rejects nine negative cases. V4.4 artifact checks pass 13 checks including backup equality, certified selection/fallback rejection, dependency closure rejection and honest incomplete readiness. Schemas generated for ownership and production-core requests.

## Tenant effects during V4.4

| Effect | Count |
| --- | ---: |
| Authoring source compile/write attempts | 0 |
| Source modifications | 0 |
| Temporary screens added | 0 |
| Temporary screens removed | 0 |
| Temporary screens remaining from V4.3 | 1 |
| Apps saved / published / created | 0 / 0 / 0 |
| Flows invoked / created / changed | 0 / 0 / 0 |
| Business rows created / updated / deleted | 0 / 0 / 0 |
| New tables, connectors, environment variables | 0 |

One editor-ownership override was performed in a temporary diagnostic tab after verified backup. It made no app source change. The original tab remains open. Read-only browser rendering and discovery are not counted as business writes. No independent tenant-wide audit is claimed.

## Concrete remaining gates

1. Resolve official authoring connect rejection, pass doctor and acquire the current draft.
2. Verify the receipt, remove only the owned screen, restore the protected semantic hash and rerun both checkers.
3. Complete three restored native reconnect cycles.
4. Native-certify the requested broad navigation/data/form/overlay/command/feedback subset in reversible batches.
5. Prove read-only/theme/validation field behavior, native empty-help accessibility and typed singleChoice Form.Updates without committing data.
6. Earn enough current evidence for the production manifest and three diverse structural profiles to pass.

**V4 DESIGN SYSTEM NOT YET ACCEPTED.** Do not begin Unified Solution Compiler work from this provisional core.
