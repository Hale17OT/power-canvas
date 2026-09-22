# Design Engine V4.2 execution report

Public copy: live account, app, environment and session identifiers are redacted. Original evidence remains local.

Recorded 22 September 2026. **The native acquisition/preview pipeline now works, and the authorized focus correction is verified in the unsaved preview. Full V4.2 acceptance remains pending.** No save, publish, new app, business write or flow invocation was performed.

## Scope and identity

Only existing app `<identity-redacted>`, bound as `pfx_PowerForgeCanvasDS1`, in environment `Default-<identity-redacted>`, solution `pfx_PowerForgeExperiment`, was used. This is a non-disposable Default environment; these results are not production/UAT ALM certification.

Official authoring package: `Microsoft.PowerApps.CanvasAuthoring.McpServer@1.1.5`; .NET SDK 10.0.401; PAC 2.12.2. The server version is not a control version.

## Source acquisition and diagnosis

Fresh official MCP synchronization succeeded after reconnecting to the open, coauthoring-enabled Studio app. Independent authenticated PAC download/extraction also succeeded. Both pathways were repeated before the focus correction; the pre-apply doctor passed.

The three historical zero-file syncs exposed a definite wrapper defect: it accepted a non-error tool response without verifying source files. That is fixed and regression tested. The earlier connection preceded the open Studio session; reconnecting after verifying readiness fixed the observed synchronization problem. Session readiness/handshake is the likely operational cause, but Microsoft's internal failure cause was not exposed. We cannot claim a proven backend root cause. Explicit `prod` routing was added, but it is also the documented default and is not established as the cause. The server itself reported no files, so local YAML parsing/destination code did not cause those empty responses. No retry loop was substituted for diagnosis.

| Pre-apply comparison | Result |
| --- | --- |
| Independent providers, app/environment | MATCH |
| Screen identities | MATCH: 2 |
| Control identity/type/parent inventory | MATCH: 192 |
| Behavioral formula inventory | MATCH: 240 |
| Dataverse data sources | MATCH: Complaints |
| Connector identities | MATCH: Automation Check and TVmaze |

Authoring source SHA-256: `88fe7e3910bbd10bae5c699a3bb2d933bd0302cb96e1fa92269c30c4efd10cfd`.

Independent PAC source SHA-256: `eca7c63eb8c199ef02c45f11a53e646478342b893948320eb6c32869e3b23432`.

Raw hashes differ because PAC includes native control version serialization. Semantic comparison passed. This agreement describes the pre-change baseline. The unsaved focus-corrected Studio draft intentionally differs from the saved PAC package now; a future migration must reacquire and resolve agreement.

## Migration and selected design

Candidate zero retained the current navigation, queue, detail, task form and review sequence. It was lowered into separate presentation/behavior IR, rebuilt without the legacy visual generator, officially compiled, and read back exactly. A SideSheet replacement was not selected because no evidence established an improvement over the current review workflow. This retention is not evidence of wholesale V4 factory adoption.

Native interaction testing found that discarding an existing-record edit focused New complaint. The user explicitly authorized: **“Apply the focus correction in preview only.”** The reviewed successor changes only Cancel and Discard-confirm `OnSelect`: capture whether the form is New before resetting it, then return focus to New complaint or Edit as appropriate.

| Migration measure | Result |
| --- | --- |
| Controls retained | 192 |
| Moved / replaced / removed / added | 0 / 0 / 0 / 0 |
| Behavioral bindings represented | 240 |
| Intentional approved handler changes | 2 |
| Unapproved differences / unresolved blockers | 0 / 0 |
| Protected mutation paths before / after | 2 / 2, unchanged |
| New / removed / duplicated commit paths | 0 / 0 / 0 |

Both SubmitForm and Automation Check invocation retain their targets, arguments and validation gates. The exact source readback equals the approved candidate:
`8621d2d343ae9889afc0e966a847085a97e3b922da2f3eeddb1c388760bd34e0`.

Presentation rules formerly embedded in the Complaint adapter now consume semantic roles in the generic refinement module. A search for `Complaint`, `CASEWORK`, and complaint-specific control IDs in `src/canvas` outside explicit adapters returns zero matches. The retained-native IR is a migration bridge; it does not eliminate all non-V4 compatibility generation or certify typed Power Fx semantics independently of Microsoft.

## Native validation and runtime

| Evidence | Result and scope |
| --- | --- |
| Official compile | PASS, 3 YAML files, both candidate-zero and focus successor |
| Exact source readback | PASS for both candidates |
| App Checker | No issues for focus successor |
| Accessibility checker | **1 Suggestion: Screen1 / ReadableScreenNameNeeded** |
| New factory variants NATIVE_VALIDATED | **0** |
| New factory variants PRODUCTION_BENCHMARKED | **0** |

Native runtime observations on the retained baseline established: four records; High filter narrows to one and Reset restores four; detail disclosure and Activity tab work; background commands are disabled during editing; a blank title disables Review changes; drafts survive desktop-to-mobile resizing; review focuses the Reason field; missing reason disables Save; Keep editing preserves the draft; Discard restores the original multiline value. The Automation Check panel and idle contract state were inspected without running it.

After the approved correction, separate native tests exercised dirty existing-record and new-record drafts through Cancel → Discard. Focus returned to **Edit** and **New complaint**, respectively. All drafts were discarded; the queue still contained four records. A first fast attempt did not wait for modern input state propagation; the completed tests waited before exercising the dirty branch. These are recorded browser observations, not newly added reusable browser test scripts.

The choice option was clicked, but its selected-value assertion was inconclusive. That check remains **UNPROVEN**. Save success/failure against the business backend and flow execution were intentionally not exercised.

Ten native overview captures were taken for each source at five sizes in both themes. The corrected source has its own images; older screenshots and the original focus failure were not relabeled.

| Requested width | Measured Canvas logical width | Themes |
| --- | --- | --- |
| 390 | 391 | Light, dark |
| 640 | 639 | Light, dark |
| 834 | 834 | Light, dark |
| 1024 | 1024 | Light, dark |
| 1440 | 1441 | Light, dark |

The existing browser zoom is 80%, DPR approximately 0.8. Three stable geometry samples preceded each capture. Logical width tolerance is two pixels; the 639 capture does not certify the exact 640 breakpoint. Native mobile navigation/scrolling and desktop composition rendered, but these overview images do not prove every modal, error, empty, loading or factory-variant state. Current design retains a comparatively sparse desktop lower area; this is not presented as a new aesthetic benchmark.

## Field capability support

Discovery inspected 17 control types. All 16 field mappings were checked against actual properties:

| Status | Mappings |
| --- | --- |
| SUPPORTED (7) | text, multiline, number, percentage, boolean, toggle, date |
| SUPPORTED_WITH_LIMIT (9) | currency, email, phone, url, singleChoice, multiChoice, datetime, lookup, person |
| FALLBACK_REQUIRED / UNSUPPORTED | 0 / 0 in this discovery |

These are capability results. All 16 generated-field mapping `nativeCompile` and `nativeRuntime` flags remain false: testing existing text/multiline controls does not certify newly generated field factories. Limits include currency formatting contract, formula-based semantic input validation, typed records/defaults for choice/lookup/person, and timezone/DST behavior for datetime.

PAC exposed versions of installed controls, including TextInput 0.0.54, Button 0.0.45, Form 2.4.4 and ModernDropdown 1.0.2. Authoring descriptions did not expose all actual versions. Controls without independently observed versions remain **CONTROL VERSION UNVERIFIED**.

## Validation and artifact index

`npm run check`: lint, typecheck, build and **451 tests across 34 files passed**. The 34 V4.2 tests cover freshness, identity, zero-file sync failure, semantic agreement, preview guards, conservative formula comparison, immutable writes, exact approved changes, IR preservation, actual capability parsing and evidence lifecycle.

`npm run test:design-visual`: **20 tests passed**, without updating baselines. These are structural Chromium projections and are not counted as native Canvas tests.

Local evidence is intentionally under ignored `output`/`.powercanvas` directories; it is not a committed source fixture:

| Artifact | Location relative to repository |
| --- | --- |
| Latest pre-apply source A, doctor, capabilities | `output/design-v42/focus-authoring/` |
| Latest independent source B | `output/design-v42/focus-pac/` |
| Candidate-zero IR and migration | `output/canvas/native/v42-retained-candidate/` |
| Approved plan, manifest and focus candidate | `output/canvas/native/v42-focus-review/` |
| Exact focus source readback | `output/canvas/native/v42-focus-readback/` |
| Source-bound native compiler/checkers | `output/design-v42/focus-*-bound.json` |
| Source-bound captures and focus tests | `output/design-v42/focus-runtime-bound.json`, `focus-interactions-bound.json` |
| Earlier functional checks, including original failure | `output/design-v42/interactions-bound.json` |
| Corrected-source screenshot set | `output/design-v42/runtime/focus-overview-*.png` |
| Registry and installed versions | `output/design-v42/registry-evidence.json`, `installed-control-versions.json` |
| Machine-readable final summary | `output/design-v42/final-summary.json` |
| Exact mutation counts | `output/design-v42/tenant-effects.json` |

Evidence binds source, plan, registry, app/environment and the client authoring connection epoch. Microsoft's native Studio session ID was not exposed. Corrected-source screenshots use immediate post-compile source readback; this successor did not perform another remote sync after browser interaction. Evidence age is recorded, not reset to make expired acquisition reusable.

## Resource mutation report

| Action | Count |
| --- | --- |
| Native compile/coauthoring attempts | 2 |
| Effective app source-change operations | 1 |
| Handler properties changed in unsaved preview | 2 |
| Apps saved / published / created | 0 / 0 / 0 |
| Flows changed / run | 0 / 0 |
| Business rows created / updated / deleted | 0 / 0 / 0 |
| Connection references changed | 0 |
| Environment variables changed | 0 |

Autosave was disabled and the browser preview usage tip dismissed. Theme, filters, navigation and unsaved form inputs were exercised; all form drafts were discarded. Studio remains open with the source correction unsaved and unpublished.

## Remaining acceptance gates

The preview focus request is complete. Full V4.2 is not claimed complete: the accessible screen-name suggestion remains; core V4 factory variants still need their own applicable source-bound native compile/runtime evidence; generated field mappings need instance-level native tests; choice-value and exact breakpoint assertions need completion. Retained-source IR round-trip proof does not establish that all V4 design decisions generate production-ready native app compositions. No component maturity was promoted to conceal these gaps.
