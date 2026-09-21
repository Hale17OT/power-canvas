# PFDS DS1

**Design intelligence:** [PowerApps Taste](taste.md) now drives native generation with workflow intent, personalities/dials, recipe resolution, composition contracts, audits and runtime completion gates. See the [published reference-app comparison](../../experiments/taste-engine-20260918/report.md).

**Current native architecture:** [PFDS 0.2](pfds-0.2.md) replaces the original native presentation with 20 reusable native patterns, modern forms, light/dark tokens, responsive navigation and a guarded review workflow. The sections below describe the older semantic/HTML layer; use the 0.2 guide for native generation and visual acceptance.

Native Canvas generation, live synchronization and master-detail forms are now implemented; see the [current feature report](../selected-features-2026-09-18.md). The HTML showcase described below remains a separate local preview.

PowerCanvas now compiles Canvas intent into a deterministic semantic design system. It contains 17 original component contracts, dashboard/list patterns, custom container composition, themes, responsive rules, typed references, bounded Power Fx templates and a standalone interactive HTML showcase. These are implemented local capabilities. Native synchronization, native rendering, full accessibility and delegation certification are separate gates.

```sh
npm run check
npm run schema
node dist/cli/index.js --project examples/canvas-complaints validate
node dist/cli/index.js --project examples/canvas-complaints canvas compile --app complaintPortal --out output/canvas/my-review
node dist/cli/index.js --json canvas catalog
node scripts/serve-showcase.mjs output/canvas/my-review/showcase.html
```

Output files are created exclusively; use a new directory to preserve manual edits. Open http://127.0.0.1:4178 for the local preview. The showcase uses synthetic records and explicitly labels itself an HTML approximation.

## Architecture and contracts

The project `canvasApps` section is optional. Existing model-driven specs keep their schema, hashes and provider routing. A Canvas app declares its qualified name, theme, component maturity policy, navigation and screens. Semantic patterns include `dashboard`, `list`, `masterDetail` and `custom`; native compilation supports the first three through the PFDS 0.2 library.

The [example](../../examples/canvas-complaints/powercanvas.yaml) is the executable design-system specification. Its table declarations support local reference validation; do not apply that separate project to the Default tenant or adopt tables from the live experiment.

`src/canvas/registry.ts` is authoritative for AppShell, Page, Stack, Row, Column, Sidebar, PageHeader, Button, TextInput, Dropdown, Card, MetricCard, Badge, SimpleList, LoadingState, EmptyState and ErrorState. Each entry has version, maturity, introduced PowerCanvas version, JSON-schema props, events, child policy, states, native control requirement and capability flags. Catalog output can be consumed by future AI planning without supplying arbitrary control code.

Only containers accept children. Pages and Sidebar belong directly to AppShell. Keys are stable, case-insensitively unique among siblings and limited to project identifier syntax. Navigation and source/column references are validated. Limits are 500 nodes, 20 nested levels, 6 navigation destinations and 6 displayed columns. `stableOnly` rejects every current experimental contract.

## Themes, layout and accessibility

Colors are semantic (`canvas`, `surface`, `text`, `muted`, `border`, `brand`, `onBrand`, `focus`, `danger`, `success`). Spacing is 0/4/8/16/24/32/48. Typography uses approved Segoe UI/Arial, body 16, caption 14, heading 28, metric 32. Radii are 0/8/16. Border, elevation, icon intent, reduced-motion duration and layering are tokenized. Controls are 44 px comfortable and 36 px compact; use comfortable for touch.

Light/dark and density vary independently. Theme resolution checks contrast for brand foreground; automated tests also check body and muted text. Arbitrary overrides and absolute positioning fail validation. Container gaps/padding reference tokens. Compact (<600) stacks with bottom navigation; medium (600–1023) uses a collapsed sidebar; wide (≥1024) uses a full sidebar. Native app display settings must disable scaling/aspect locks as required by the Microsoft responsive-layout guidance.

The showcase has native HTML labels, heading hierarchy, visible focus, DOM-order keyboard navigation, status/error announcements, contrast tokens and reduced-motion CSS. Native Canvas must independently validate AccessibleLabel, heading roles, focus order, keyboard/touch behavior, high contrast and actual modern controls. No screen-reader/native conformance claim is made from the HTML tests.

## Data and Power Fx

Data-bound lists carry loading, loaded, empty, error and forbidden states. DS1 searches declared text fields with `StartsWith` and sorts by primary name. No arbitrary Power Fx escape hatch, collection materialization, nondelegable aggregate or fake total count is emitted. Dashboard values are clearly illustrative static values in the example.

`canvas-ir.json` contains named theme formula intent and generated behavior/query templates. The adapter must bind discovered source identifiers, modern-control property versions and permission errors before native validation. `maxVisible` describes bounded presentation, not server pagination or a complete dataset. The authoring acceptance test must include >2,000 records, Studio delegation diagnostics and permission behavior before claiming complete queries. Generic CRUD, multi-select, virtualized tables and offline mutation queues are outside DS1.

## Ownership and authoring

IDs hash project UUID + app key + semantic path. Text/theme edits and sibling reorder preserve IDs; reparenting changes identity. `planCanvasMerge` preserves manual properties when generation did not change them and blocks concurrent edits, removal and collisions. This is a tested local planning primitive; it has no remote apply command yet.

`CanvasAuthoringAdapter` defines inspect and native validation/synchronization boundaries. Prerequisites bind exact app/solution/revision, saved coauthoring session, prepared sources, discovered controls and Default non-disposability. Microsoft `compile_canvas` can apply changes even though its short tool description says validates; never treat it as a read-only schema linter. Use fresh synced directories and review the generated changes before any call.

See [research and licensing](research.md), [ADRs](../adr/0005-pfds-semantic-system.md), [testing](testing.md), and [live authoring evidence](../../experiments/canvas-authoring/report-2026-09-18.md).
