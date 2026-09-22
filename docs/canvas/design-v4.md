# PowerCanvas Design Engine V4

V4 adds an offline, decision-first composition path through the existing PFDS native factories. It does not replace V1–V3, alter Complaint Desk, or publish benchmark apps. Native runtime validation is pending: the HTML previews are structural projections, not Power Apps screenshots or a Power Fx interpreter.

## Generate a reviewable candidate

```sh
npm run design:benchmarks
node dist/cli/index.js taste decisions --product output/design-v4/operations-queue/PRODUCT.md
node dist/cli/index.js taste explore --product output/design-v4/operations-queue/PRODUCT.md --host output/design-v4/operations-queue/host.yaml --out output/my-directions
node dist/cli/index.js taste generate --product output/design-v4/operations-queue/PRODUCT.md --host output/design-v4/operations-queue/host.yaml --variance 5 --out output/my-candidate
node dist/cli/index.js components variants SideSheet
node dist/cli/index.js components lab --out output/my-lab --theme dark
node dist/cli/index.js patterns list
node dist/cli/index.js patterns info HoverCard
```

Use fresh output directories: CLI generation refuses to overwrite existing artifacts. The benchmark script intentionally regenerates its ignored output directory. `taste explore` works without a host file to produce plans alone.

The pipeline is PRODUCT.md → context and explicit assumptions → alternative decisions → selected plan and hash → validated host contract → existing `pattern()` factories → native YAML, semantic metadata, existing source preflight, complexity report and local structural preview. Factory constants are promoted to named style tokens. Source-state detection accepts verified controls referenced by semantic metadata, so error handling is not inferred solely from control names. A changed plan hash or inconsistent host counts blocks generation.

`taste generate` is deliberately an offline candidate command. The existing publication compiler rejects `design.v4` rather than silently ignoring it or replacing an existing business screen. A reviewed binding migration is still needed to publish V4 designs into an existing application. Device candidates and Component Lab fragments do not create application identities.

## Contextual decisions

The strict optional `product.context` records destination count, hierarchy, switching frequency, user familiarity, persistent context, duration, field count/dependencies, validation burden, record count, comparison, visual content, scan key, sorting, editing, workflow, overlay purpose, destructive intent, action count and bulk actions. Missing values become visible assumptions, not concealed facts about the application.

Each decision contains eligible and ineligible candidates, ordinal fit values, reasons, rejected alternatives and limitations. Scores are deterministic policy weights, not aesthetic accuracy percentages. Explicit preferences add weight only to feasible candidates; bans remove candidates. No feasible candidate is an error.

| Decision | Executable choices | Principal constraints |
| --- | --- | --- |
| Navigation | CompactSidebar, TopNavigation, Tabs, NavigationDrawer, BottomNavigation | Destination capacity, hierarchy, switching frequency, persistent context, available width |
| Overlay | ConfirmationDialog, ContextPanel, SideSheet, BottomSheet, FullScreenTask | Destructiveness, inspect/filter/edit, fields, duration, viewport |
| Data | Existing DataTable gallery, RichList, cards through RichList, ActivityTimeline, ChartCard | Record count, comparison, visual content, chronological scanning, analysis |
| Form | Single column, two columns, sectioned, wizard | Field count, dependent inputs, available width |
| Actions | CommandBar, OverflowMenu, BulkActionBar, mobile action dock | Action count, selection scope, viewport |

Dedicated task pages and Kanban appear as rejected alternatives because no corresponding executable factory exists. The current DataTable is an identity/status gallery, not a sortable multicolumn grid. Navigation is flat; hierarchy influences selection but does not synthesize a nested navigation tree. The generator rejects menu capacities it cannot render instead of dropping commands.

## Dimensions and exploration

Twelve independent dimensions replace the five-personality ceiling: density, formality, warmth, contrast, surface depth, radius character, typography expression, navigation presence, data emphasis, brand expression, motion and decorative intensity. Existing personalities remain shorthand presets in `resolveTaste`; explicit V4 dimensions can override them.

Implemented effects include density-based spacing/list variants, contextual navigation/data emphasis, radius tokens, typography scales, warm canvas treatment and surface elevation. Explicit color, border, radius and surface strategies produce native tokens/treatments. Scrim strength follows the task independently from surface color; overlay surfaces support flat, standard, elevated, bordered, inset, dark and high-contrast treatments.

Formality, contrast, brand expression, motion and decorative intensity are recorded intent rather than fully independent rendering policies in this version. Readable baseline colors remain fixed safeguards. Reduced motion forces the resolved motion value to zero; there is no animation engine. These descriptive fields must not be marketed as implemented visual variants.

Six composition families are executable: command/filter/data, queue/inspector, record-led sections, lead/comparison/evidence, document/context/index and task/progress/fields/dock. The sixteen-archetype vocabulary selects or describes those families; it is not sixteen unique layouts. Analysis and reading requirements take precedence over conflicting archetype hints.

Exploration produces two to four deterministic plans. Variance selects structural branches: low=data-first, medium=workspace-first, high=content-first; the fourth explicit branch is task-first. One operational brief proves three distinct compositions with names and colors hidden. Some constrained jobs converge on the same structure; CLI output reports `distinctStructures` and `converged` instead of claiming every named direction is novel. `signatureRisk` detects three differently named products with the same composition and selected families.

## Host ownership and semantics

The host contract supplies navigation/event formulas, record sources, fields and changes, selected-record context, chart and timeline sources, state formulas, filters, primary commands, validation, commit, selection count and clear-selection behavior. No writes, recipients, audit history, statistics or permissions are inferred. Synthetic rows require `fixture: true` and remain bounded. Gallery sources are bounded, which does not prove delegation or large-dataset correctness.

`component-metadata.json` records recipe, variant, role, composition and slot for emitted controls. Audit, preflight and refinement automatically load the semantic sidecar when present. Refinement checks that references exist and compares behavioral formulas before returning changes:

```sh
node dist/cli/index.js taste refine output/my-candidate --design path/to/DESIGN.md --focus typeset --metadata output/my-candidate/component-metadata.json --out output/refined-candidate
```

Background buttons and inputs are disabled while task surfaces are open. Sheets expose explicit close and desktop/mobile return-focus targets. Native focus entry, focus trapping, screen-reader announcements and Escape behavior remain unverified. HTML preview focus behavior is a separate implementation used only for offline inspection.

The old Complaint Desk refinement is isolated in `taste/adapters/complaint-refine.ts`, selected only when both its existing screen and form identities match. The generic refiner contains no Complaint copy or suffix dispatch. The old Taste pass still has seven generic suffix rules for metadata/detail/chart/next/content/toolbar/list-identity; eliminating those from the legacy generation path is remaining migration work. The original native compiler remains application-specific in places and is not presented as the new generic composer.

## Component architecture and evidence

Nineteen new strict prop contracts and factories live in `expressive.ts` and are dispatched by the existing `pattern()` function. Their events and data remain host-owned. Variants come from executable schema enums. The registry distinguishes mappings without factories, planned vocabulary, implemented factories, native validation and production benchmarking. No current-source entry is elevated to native-validated merely because an earlier app used a related pattern.

Pattern adapters record intent, native translation, mobile treatment, unsupported behavior, accessibility, complexity and deliberate PCF escalation. They are reusable translation records, not an automatic browser-to-Power-Apps converter. Drag/drop Kanban, advanced calendar and complex grid remain PCF candidates; no package was installed. Native backdrop blur is rejected. Snackbar uses explicit dismissal, not a copied timer implementation; BottomSheet has no swipe gesture; grouped lists require a sorted flat host table and group-start flags.

The Component Lab emits all 42 new variant fixtures in light and dark with source audits. They are standalone native screen fragments with configurable hosts, not 42 tenant apps. It does not certify native rendering or every interaction state.

## Validation and limits

Run `npm run check`, `npm run schema`, and `npm run test:design-visual`. The visual script regenerates ignored benchmark artifacts before comparing checked-in Chromium baselines. Screenshots are sensitive to operating-system font rendering. Tests cover semantic decisions, infeasible options, bounded factories, determinism, source identity, preservation, complexity, responsive preview navigation, wizard progression, focus restoration, readable preview colors and browser errors.

Complexity gates count controls, containers, depth, gallery-template controls, selected expensive formula patterns and cross-screen references. Limits are 240 controls, depth 12 and 16 controls per gallery template. This is static evidence, not measured frame time or delegation certification.

See [research](references/design-v4-research.md), the [exact support matrix](design-v4-support.md), and the [implementation report](design-v4-report.md). Native Studio import, host Power Fx evaluation, keyboard/persona testing and production-quality visual certification remain separate gates. No benchmark required a tenant mutation.
