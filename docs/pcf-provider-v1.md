# PCF Provider V1 — local implementation and evidence

PCF extends the Unified Solution Compiler through `pcf.components` and `pcf.bindings`. Component identity is namespace + constructor; version is independent. PCF resources use the existing ResourceIR, solution/publisher dependency graph, requirements, source hashes, saved plans, audit and ALM manifest. Every live deployment remains blocked. `pcf compile`, `pcf inspect` and `pcf catalog` are classified in the agent command inventory. `npm run pcf:certify -- --record-evidence` is a local build/package/browser benchmark. It restores npm dependencies but never authenticates to a tenant.

## Native-first selection

All 41 accepted native families are recorded in Taste decisions. Ordinary status, buttons, inputs, forms, cards, themes and layout select native. A PCF proposal for these is a deterministic unified-audit error. The existing StatusBadge made StatusIndicator redundant. The three examples are:

- **ColorContrastField**: bound hexadecimal color, foreground contrast calculation and preview, invalid-input feedback, read-only state and output notification. This is a specialized color measurement interaction, not a replacement text field.
- **AdvancedDataGrid**: dataset column metadata, keyboard-operable column resizing, selection, sorting requests and host paging requests. Native DataTable remains preferred without these requirements.
- **CalendarDataset**: date-mapped records, month navigation and selection. It performs no scheduling workflow or business writes.

Rendering is bounded to the first 200 loaded records and discloses truncation. There is no claim of virtualization, delegation or production dataset performance. Dataset feature flags describe the contract, not host certification.

## Typed manifest subset

| PowerCanvas | Manifest |
|---|---|
| string | SingleLine.Text |
| multiline | Multiple |
| integer | Whole.None |
| decimal | Decimal |
| currency | Currency |
| boolean | TwoOptions |
| date | DateAndTime.DateOnly |
| datetime | DateAndTime.DateAndTime |
| choice | OptionSet |
| lookup | Lookup.Simple (model-driven only) |

Properties support bound/input/output. Output properties cannot require an input binding. Dataset columns compile to property-set entries. A field requires a bound property; this V1 dataset contract requires one dataset. Dataset lookup columns stay inside that dataset. Arbitrary XML, unknown types, resource traversal, duplicate identity, duplicate features, Canvas lookup and Canvas WebAPI declarations are rejected. React/platform-library builds and external HTTP access are deliberately rejected. Features are explicit and produce review warnings; examples request none.

Sources: Microsoft [property contract](https://learn.microsoft.com/en-us/power-apps/developer/component-framework/manifest-schema-reference/property), [property-set contract](https://learn.microsoft.com/en-us/power-apps/developer/component-framework/manifest-schema-reference/property-set), [host limitations](https://learn.microsoft.com/en-us/power-apps/developer/component-framework/limitations), and [code-component ALM](https://learn.microsoft.com/en-us/power-apps/developer/component-framework/code-components-alm).

## Build, package and provenance

The provider emits manifests and standard TypeScript projects using the pinned Microsoft PCF toolchain already in the repository (pcf-scripts 1.51.1, framework types 1.3.18, TypeScript 5.9.3). Each certification restores the lockfile and performs three builds in separate fresh directories. Manifest and artifact inventories must match byte hashes without normalization. Unknown differences fail the run. The Microsoft PAC solution pack command produces an unmanaged package with a synthetic local publisher/solution, separate from the tenant experiment. ZIP verification checks all three identities, versions, manifest resources, solution, publisher, prefix and unmanaged state.

Evidence records input/source/CSS/lock/artifact/package hashes and observed toolchain versions. Local source ownership is distinct from tenant ownership. Package evidence never authorizes overwrite of an existing namespace/constructor. An unowned target collision is CONFLICT. External inspection reads source and reports EXTERNAL_SOURCE; it does not rewrite or adopt it. Patch bump is permitted only for an implementation-only contract change; property/dataset/identity changes need explicit review.

## Local runtime and accessibility

The repository lifecycle harness loads the actual Microsoft-built bundles in Chromium and supplies explicit fake framework contexts. It tests init/updateView/getOutputs/destroy, output notification, selection, sorting/paging requests, resize, loading/empty/error/disabled/dark states at 360/768/1280 widths. All network requests are denied. Screenshots remain ignored evidence.

Controls consume existing PowerCanvas color/typography/spacing/radius/focus tokens. Light/dark is an explicit input, not inferred by DOM scraping. Controls respect reduced motion. Semantic labels, table headers/caption, focusability, keyboard navigation, pressed state and status/alert roles are checked. This is bounded automated accessibility coverage, not manual screen-reader certification.

Security checks cover direct eval/Function, cookie/credential storage, unsafe HTML, remote script injection, secrets and network calls. This is bounded static analysis, not security certification. No runtime framework dependencies are shipped; dev dependency versions/licenses and bundle sizes are recorded. A 100 KiB local review warning is not a Microsoft platform limit.

## Binding boundaries

Canvas symbolic references use `pcf.component:<key>` in the existing Composition IR. Slot, kind, target, native sufficiency and experimental-profile gates are checked. Production/native lowering and live binding remain unproven. A PCF selection never silently retains a native candidate and calls it a PCF implementation.

Model-driven property bindings resolve logical tables/columns/forms and check actual source types. Dataset bindings validate semantic column contracts. Native model-driven form/subgrid lowering is not yet certified; no generated XML is applied and no existing form is changed. This is an outstanding V1 completion gate, not merely a deferred live test.

## Evidence and maturity

`output/pcf-v1/run-*/` contains toolchain, manifests, builds, package-membership, ownership, runtime/accessibility/security/dependency results and saved-byte integrity indexes. `tests/pcf/certification.json` is a small public certificate with no tenant identifiers. Capability maturity is derived from its source hashes and integrity hash; changed source invalidates it. Build/package/local runtime evidence is never promoted into live host evidence.

SharePoint simulation source and certificates remain unchanged. The V2 Dataverse/model-driven/security certification remains unchanged. This work creates no tenant resource and runs no SharePoint authentication or certification.

## Later live certification (not authorized here)

Use one owned field component and the existing experiment solution, excluding Complaint Desk. First perform fresh read-only discovery and ownership/collision checks. Review an exact import plan and source/package hashes. Only separately authorized import and binding may proceed, with journaled readback and uncertain-outcome reconciliation. Publishing requires separate authorization. Runtime smoke/persona testing, fresh discovery and convergence are independent gates. No live import, publication, authentication changes or business data writes are included in V1.

## Current acceptance report

Verdict: **PCF PROVIDER V1 PARTIAL**. The offline manifest/build/package/local-runtime path passes. Full V1 completion is withheld because native model-driven field/subgrid binding lowering is not verified. The model-driven dataset binding explicitly blocks that unsupported lowering. This is not a live-authentication problem and does not justify importing a component.

| Capability | Schema | Compile | Build | Package | Local runtime | Live Power Apps |
|---|---|---|---|---|---|---|
| Field PCF | Verified | Verified | Verified | Verified | Verified | Unproven |
| Dataset PCF | Verified | Verified | Verified | Verified | Verified | Unproven |
| Standard control | Verified | Verified | Verified | Verified | Verified | Unproven |
| React/platform-library control | Explicitly rejected | No | No | No | No | Unproven |
| Model-driven field binding | Typed intent | Partial: source/type checks | — | — | — | Unproven |
| Model-driven dataset binding | Typed intent | Blocked: host lowering | — | — | — | Unproven |
| Canvas binding | Verified | Bounded Composition IR | — | — | — | Unproven |
| Solution packaging | Verified | Verified | Verified | Verified | — | Unproven |

Test baseline preserved: **1,436 passed, 7 skipped**, including **65 new PCF unit tests**. Browser benchmark: **9 component/width cases**, plus state transitions, callbacks and accessibility checks. Agent evaluation: **26 routing cases and 4 result interpretation cases passed**. Automated checks do not establish manual assistive-technology certification.

Tenant effects: PCF imports **0**; solution imports **0**; Dataverse changes **0**; model-driven changes **0**; Canvas changes **0**; Flow changes/runs **0**; SharePoint changes **0**; business rows **0**; authentication changes **0**; environment-binding changes **0**; publication **0**.

Remaining gates include native model-driven binding lowering, live import, live model-driven binding, live Canvas binding, Power Apps runtime, runtime paging/delegation, performance and cross-browser Power Apps host behavior. Package membership does not prove import success or host behavior.

Final local evidence run: `output/pcf-v1/run-2026-09-26T13-52-28.738Z/`. Independent integrity recheck found **24 indexed files, zero hash mismatches**. Three clean builds per component produced identical artifact inventories. Toolchain: Node **22.18.0**, npm **10.9.3**, PCF scripts **1.51.1**, TypeScript **5.9.3**, framework types **1.3.18**, PAC **2.12.2**. PCF MSBuild **1.52.1** is pinned in the generated project; packaging in this benchmark uses PAC, not MSBuild.

Production bundle sizes: ColorContrastField **8,465 bytes**, AdvancedDataGrid **8,453 bytes**, CalendarDataset **8,447 bytes**. No runtime npm dependencies; no local bundle-budget warnings. The public capability command accepts the current PCF certificate as VERIFIED for its recorded dimensions. SharePoint still exposes SIMULATED_CONTRACT_CERTIFIED with its original 15 simulated capabilities; the V2 boundary still exposes COMPLETE_FOR_COMPILER_PROVIDER_SCOPE.

The remaining model-driven gate requires a verified current field/subgrid serialization contract. Microsoft's [FormXML schema](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/form-xml-schema) permits arbitrary content under custom-control parameters (`processContents="skip"`). Passing that XML schema alone would therefore not prove correct PCF parameter binding. This implementation does not substitute a guessed XML fragment or an import attempt for that missing proof.
