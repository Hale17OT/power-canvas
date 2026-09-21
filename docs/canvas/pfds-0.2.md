# PFDS 0.2: native Canvas reference architecture

PowerCanvas's reference app is the owned `pfx_PowerForgeCanvasDS1` app in the dedicated unmanaged experiment solution. Its source is generated from `examples/canvas-native-complaints`. [PowerAppsUI's record browser](https://www.powerappsui.com/templates/record-browser), dashboard, dialogs and design-system documentation established the benchmark; the implementation and tokens are PowerCanvas's. The [reference review](references/powerappsui-review.md) records the specific comparisons. No third-party component source was copied.

## Generate a pattern

```powershell
node dist/cli/index.js canvas patterns
node dist/cli/index.js canvas component --spec examples/canvas-patterns/kpi.yaml --out output/my-kpi
node dist/cli/index.js canvas component --spec examples/canvas-patterns/table.yaml --out output/my-table
node dist/cli/index.js --project examples/canvas-native-complaints canvas native --app complaintPortal --bindings examples/canvas-native-complaints/bindings.json --out output/my-native-source
```

These commands generate local artifacts. They do not deploy, connect data sources, adopt components or write records. Every output directory must be fresh. `canvas catalog` distinguishes native 0.2 patterns from the older semantic 0.1 contracts; the HTML showcase is still an approximation of that older semantic representation, **not** the native acceptance target.

The native catalog and request JSON Schema are under `schemas/pfds-patterns.v0.2.json` and `schemas/pfds-pattern-request.v0.2.schema.json`. Unknown properties and unsupported versions fail validation. Power Fx inputs are intentional expressions, not untrusted text to execute automatically. Names and data/action bindings belong to the caller. Plain labels are escaped by the compiler.

| Group | Standard patterns |
| --- | --- |
| Shell | Sidebar, PageHeader, CommandBar, UserAvatar |
| Browse | DataTable, FilterBar, SearchBox, StatusBadge, Tabs, DetailPanel |
| Insight | KpiCard, ChartCard, ActivityTimeline |
| Editing | FormSection, EditDialog, ConfirmationDialog, Stepper |
| Feedback | LoadingState, EmptyState, ErrorState |

`src/canvas/patterns.ts` owns these control compositions and property contracts. `src/canvas/native.ts` supplies application bindings and workflows. Applications instantiate these factories; they do not invent their own control styling. FormSection, DetailPanel and EditDialog accept child compositions through the TypeScript factory. The standalone CLI pattern command emits a single template; it does not yet accept arbitrary nested pattern requests or import a Canvas component library into Studio. These are source-generation abstractions, not independently installed Power Apps component-library packages.

## Tokens and layout

Named `PF_*` formulas centralize canvas, surface, text, muted text, borders, control borders, brand, contrast text, state colors, spacing, type scale and breakpoints. The reference uses a restrained violet accent, neutral surfaces, 12/14/16/26/30 typography and 4/8/16/24 spacing. Light and dark modes use explicit foreground colors. The phone navigation has one anchored container; screen content reserves its height. This avoids coauthoring insertion order moving it above the header.

| Width | Native composition |
| --- | --- |
| Below 640 | Bottom navigation, stacked KPI cards, wrapping commands/filters, concise table titles, stacked detail panel and single-column form |
| 640–1099 | Collapsed navigation rail, wrapping filters, stacked list/detail and two-column form when the form itself is at least 580 wide |
| 1100 and above | Full sidebar, KPI row, table alongside the detail panel, two-column form |

Auto-layout containers own spacing and flow. Absolute coordinates are restricted to the anchored mobile dock, modal overlays, data-card internals required by the Form API, and the small chart bar inside its gallery template.

## Modern control mappings

Buttons, text inputs, badges, avatars, spinners and tabs use the live-discovered modern controls. Text uses ModernText, choice editing uses ModernDropdown with typed `Selected.Value`, and the form uses the Modern variant. Required labels, data-card errors and two-column grouping are generated consistently.

Gallery remains a documented exception for DataTable, ActivityTimeline and ChartCard. The currently discovered modern grid does not expose the mixed row template needed for badges, record actions and secondary metadata. Galleries use modern child controls. Form data cards retain the host's typed card variants while their editable children are modern. No classic text input, classic dropdown or classic Label is emitted.

## Data and workflow contract

The record query uses StartsWith, typed choice filtering and SortByColumns. The footer reports **loaded** items, not a claim about the total number of remote rows. Dashboard counts use CountIf; large-data delegation remains a separate certification gate. Activity shows real creation and last-modification timestamps, not a fabricated audit history.

The workflow is Details → Review → required reason → SubmitForm → success receipt. `detail.reasonField: resolutionNotes` explicitly binds the reason to an owned multiline field. Invalid destinations fail compilation; the generator never infers a destination from a field name. The reason and notes together must fit the field's maximum length. Blank and whitespace-only required titles are blocked. Save failures retain the entered values and display the server error; there is no automatic write retry.

Editing disables navigation, filters, selection and background actions. The discard dialog hides the underlying editor, restores it on Keep editing, and writes nothing on Discard. Focus moves into the workflow and returns to New complaint. Native browser checks exercise these transitions. Screen-reader and touch-device testing outside Studio remain additional acceptance work; a clean app checker is not a complete accessibility audit.

## Synchronization and migration

Ordinary synchronization still uses generated source, the applied receipt, desired source and freshly observed remote source. It preserves manual edits, blocks conflicting changes and does not silently remove controls. The first whole-app redesign used `prepare-native-redesign.mjs` as an explicit, app-bound UI migration with a backup and a zero-data-source-delete constraint. New controls use the stable `pf_ds2_` namespace to avoid an observed authoring-service issue when changing a control type under an existing name. Later updates use ordinary synchronization.

Every remote compile has a fresh hash preflight and a journal entry. **Validation FAILED can still mutate the coauthored draft.** Never assume a failed compile was rolled back. Inspect fresh source, retain the previous published version, and reconcile before another attempt. Read back the completed draft, check native rendering, save/publish through Studio, then retain a new receipt and verify a no-op plan.

## Native verification

`scripts/check-native-preview.mjs` exports a UI-only suite for an already signed-in Studio preview. It checks filtering, sorting, empty states, themes, detail reveal, timestamps, validation, focus, discard, and desktop/tablet/phone composition. It never clicks Save or Publish. Screenshots require two identical rendered frames and exclude Studio chrome. Run it through the existing browser adapter; no token or password is stored by the script.

Review a candidate set before using it as a baseline. Capture a separate second run and compare with:

```powershell
python scripts/compare-native-snapshots.py <reviewed-baseline-directory> <new-capture-directory>
```

The comparator requires matching dimensions and fails if more than 0.1% of pixels differ by more than 12 channel levels. It emits difference images, never updates baselines implicitly, and must not compare a directory with itself. Data changes can legitimately alter a screenshot; inspect and explain them before accepting a new baseline. The existing PCF browser tests are separate from these native Canvas checks.

Live save verification uses only an existing synthetic PowerCanvas-owned complaint, followed by a read-only Dataverse readback. The Default environment is non-disposable; this work does not certify production ALM, non-admin permissions, managed upgrades or removals. The external player still requires the appropriate Power Apps license, independently of Studio preview.
