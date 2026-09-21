# Taste V3: product and device composition

V3 extends V2 memory, generation, critique and validation. Existing memory without `devices` retains its prior behavior. A device strategy specifies information order, navigation, persistent and contextual controls, action placement, detail presentation, command visibility, list/detail relationship, Back behavior and form behavior. It is not a list of widths.

`strategiesFor` selects a dedicated mobile task composition for operate, review, enter and approve. Analysis keeps its overview-to-evidence job across devices and reflows its reading order. These are reasoned defaults: PRODUCT.md selects the direction, and the validated DESIGN.md contract remains authoritative.

## One application, device-specific compositions

`deviceStrategy.scope` is `within-application`. Desktop, tablet, mobile, forms, details, alternate layouts, screenshots and Taste critique operate inside the existing app. `application.requiresNewApplication` defaults to false. Pin `application.existingAppId`; compilation rejects a different bindings ID and authoring rejects a different session ID. `canvas application-plan --operation create-new` fails without an explicit application-level requirement, and always fails for device, benchmark or critique purposes. This is a local plan; no provisioning/publishing endpoint is exposed. Multiple app declarations cannot be implicit device copies.

Complaint Desk is the sole active reference app. All views share its typed selected record, one edit form, data source and commit path. Narrow tablets use focused record navigation; tablets from 960px use a compact split; desktop retains full queue/detail context; mobile uses a full-height task. Device transitions do not remount a second form.

The previous requirement to create a separate Service Performance Briefing is withdrawn. Its code and existing tenant resource remain historical experiments, untouched and outside the required workflow. Optional offline generalization tests do not authorize app creation.

## Implemented compositions

Complaint Desk retains the desktop queue/detail composition. On mobile, selecting a record hides the queue and exposes a dedicated record surface and explicit Back command. Editing occupies the screen with a scrolling body and persistent review/save footer. The native compiler migrates one existing form; it does not duplicate form state or introduce another selected identity.

The historical Service Performance Briefing experiment uses an analytical screen: one lead question and measure, supporting comparisons, a measure drilldown, and read-only record evidence. It has no navigation rail, operational edit form or grid of equal-weight KPI cards. It reads the existing complaint contract to answer a management question; it does not pretend that priority is lifecycle status or that a current snapshot is a historical trend.

`AnalyticalOverview` and `MetricDrilldown` are executable slot compositions. The analytical native screen is a typed benchmark adapter over those architectural decisions and existing native primitives. Its business-specific priority semantics remain in the adapter, not the general component recipes.

## Actual reusable additions

`MobileTaskForm` takes body controls followed by an action region. It creates a scrolling body and a separate fixed footer. `MobileBottomActions` gives that footer touch-sized controls and a bottom inset. Both are native GroupContainer compositions, not PCF controls. Their registry entries describe modes, compatible personalities, device strategy, states, variants and accessibility. List, record, tabs, filters and dialogs reuse existing recipes; potential patterns such as MobileApproval and MobileWizard were not added just to increase counts.

Native authoring can preserve existing sibling order when applying reordered YAML. The separate footer wrapper is intentional: it gave reliable body/footer order in the official runtime.

## CLI

```text
powercanvas --project examples/canvas-native-complaints taste plan --app complaintPortal --device mobile
powercanvas taste compose --device mobile --spec composition.yaml --out output/composition
powercanvas taste critique output/native --device mobile --review reviewed.json --out output/critique
powercanvas taste fixtures output/native --bindings bindings.json --source complaint --count 24 --out output/fixtures
```

Mobile split-slot compositions require explicit `mobileContext.selected` and `mobileContext.back` formulas. The compiler emits `device-composition.json` with architectural decisions and preservation results. Design memory retains its compatible 2.0 schema with optional device contracts; synchronize the derived companion after editing DESIGN.md.

## Preservation and evidence

Ordinary V2 formula and parent comparison stays strict. A device migration is a separate, opt-in deterministic transformation. Its checker independently computes the expected transformation, compares all behavioral properties, rejects unexpected new behaviors and checks native static blockers. Form cards and inputs retain their parent scopes. SubmitForm, typed choices, validation, reason, review, success/failure and discard formulas remain unchanged. There is no blanket parent-change allowlist.

Critique binds reviewed images and source hashes, includes product, personality, screen mode and device strategy, and accepts observed mobile action visibility, simultaneous list/detail and desktop chrome facts. The same whitespace can be appropriate for periodic analysis and excessive for repeated queue work. Composition-specific findings remain labeled review signals rather than aesthetic scores.

Fixtures are explicitly nonpersistent, nonpublishable native variants. They contain 0, 1, 4 or 24 local records, long titles/names, typed priorities and empty values. New/edit/save and form events are disabled; business mutation formulas are removed. Synthetic statuses appear only as labeled fixture prose because the real contract has no lifecycle-status field. They prove layout resilience, not Dataverse integration, delegation or permissions. Restore the exact reviewed live candidate and verify its source before saving/publishing.

Use separate native runtime reports for live binding and fixture rendering. Keep independent screenshot repeats, source-bound preflight, App Checker and accessibility results. A reduced browser viewport checks layout under lost vertical space; it does not certify physical mobile keyboards, safe-area hardware or screen readers. A Default-environment experiment is not production ALM evidence.

When repeatedly switching fixture/live named formulas, a long-running Studio session may show blank calculations even after successful compilation. Use a fresh Studio session, assert the expected denominator or zero-data message, and only then accept captures. Compilation success alone is not fixture evidence. The final briefing volume run reconciled 8 High-priority records out of 24 after this recovery.
