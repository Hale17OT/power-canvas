# Taste V2: design memory, judgment and native refinement

V3 extends this workflow with [device composition and cross-product benchmarks](taste-devices.md), without replacing these V2 authorities or gates.

V2 extends the V1 schema, registry, composition renderer, native compiler, audits and safety boundary. Existing projects without `taste.memory` retain V1 behavior. No web runtime or external design detector is installed.

## Authorities

PRODUCT.md describes users and jobs, not visual styling. DESIGN.md is the app's visual contract. `skills/powerapps-taste/SKILL.md` describes how to reason and validate. Each Markdown file has exactly one fenced `powercanvas-product` or `powercanvas-design` YAML contract. Prose supplies rationale; the block supplies validated values. `design.json` is derived from both documents with SHA-256 bindings. `loadProject` recomputes the same companion in memory and passes its normalized design to the existing compiler; it never trusts a stale cached companion. `taste design sync` emits a fresh reviewable companion to a new evidence directory.

```yaml
taste:
  memory:
    product: design/complaintPortal/PRODUCT.md
    design: design/complaintPortal/DESIGN.md
```

An app may instead supply an inline normalized design. Supplying both authorities is rejected. Existing `taste.intent`, personalities and dials remain compatible. Contradictory personality or trait choices are rejected.

## Commands

```text
powercanvas taste reference list
powercanvas taste reference inspect operations-ledger
powercanvas taste reference normalize extracted-reference.md --out output/reference-run
powercanvas taste design generate --product PRODUCT.md --out output/design-run
powercanvas taste design sync --product PRODUCT.md --design DESIGN.md --out output/memory-run
powercanvas taste strategies
powercanvas taste critique native-source --review reviewed-images.json --out output/critique-run
powercanvas taste refine native-source --design DESIGN.md --focus layout --out output/layout-run
powercanvas taste audit native-source --design DESIGN.md --out output/audit-run
```

All output directories should be fresh. Critique verifies every screenshot's bytes and the exact source hash, requires each finding to name a reviewed state, sorts P0–P3 and makes no source or remote mutation. The agent or human reviewer actually inspects the screenshots and writes the review. The CLI is not a hidden vision service. Measured source findings remain labeled separately from design observations.

## Strategies, modes and resolution

Five personalities now carry context, hierarchy, surface, border, navigation, form, data, action, type, radius, elevation and color strategies, plus recommended/discouraged traits. Product purpose infers operate/review/analyze/configure/enter/approve/explore. Synthetic briefs resolve into different compositions and information exposure. The mode determines the composition recommendation; the existing typed slot composition renderer remains responsible for building it. The native application compiler currently supports its existing dashboard/list/master-detail host contracts, not arbitrary production apps inferred from prose.

Resolver context adds mode, personality, traits, density and device alongside required capabilities. A quiet status can resolve to ModernText in dense operation/review mode; an unknown required capability still blocks that choice. `StatusBadge` now exposes an actual `treatment: quiet` factory input. The operational pass also provides summary-strip, record-first detail, open chronology and quiet command treatments using existing factories. No new registry names were added to inflate coverage.

## Refinement and safety

The native compiler applies layout, typeset, distill, color and polish. Bolder/quieter can report no justified change under the established contract. Each pass clones input, compares all existing behavioral formulas and parents, and rejects functional drift. Distill rejects removal when the target has behavioral properties or any control references. New recent-record selection is explicit, typed, read-only navigation; it never calls Patch, Remove or SubmitForm.

Source audit covers source surfaces, nesting, literal styles, radius/spacing/type drift, row actions, unnamed icons, visible required markers, color-only badges, fixed layout, primary competition, parent touch constraints, equal-weight metric groups and generated-direction repetition. Uncertain intent-dependent findings remain `review`; provable drift remains blocking. A scoped exception requires exact rule/control/property and a substantive reason. It cannot suppress an unrelated violation or existing V1 blocker.

Rendered measurements capture native control geometry, visible button count, horizontal overflow, potential text overflow, computed type sizes, borders, alignment columns and mobile target sizes. Counts include declared caveats about scroll regions, virtualization and truncation. They cannot determine beauty, arbitrary semantic color misuse, a chart's usefulness or whether grouping reflects the user's mental model.

## Extension workflow

- Trait: add an abstract value to a mutually exclusive group in `memory.ts`; test conflicts and its concrete rendering effect before recommending it.
- Reference: preserve provenance, extract a reviewed `powercanvas-reference` block using the exported schema, distinguish supported/translated/unsupported concepts, and use an abstract ID. No brand style switches.
- Personality: add strategy data, a reasoned selection rule and differentiation fixtures; map each claimed treatment to an implemented native factory/pass.
- Critique: add a reviewer question/category plus a screenshot-backed fixture. Do not turn a qualitative observation into a deterministic error without a measurable trigger.
- Detector: add a source signal to `judgment.ts`, keep V1 rules intact, test positive/negative cases and scoped exceptions. Add runtime geometry checks when source cannot prove the condition.
- Component treatment: extend the existing factory's strict input contract and resolver mapping, discover supported native properties, compare dependencies and test the rendered result at three widths.
- Refinement: implement a focused immutable transformation in `refine.ts`, preserve domain formulas, record meaningful changes/no-op reasoning, and validate native output. Structural removal still uses the reviewed owned-app migration, not a weakened general sync planner.

The operational and executive directions now have live native benchmarks; see the V3 report in `experiments/taste3-20260918/report.md`. Approval, document and inspection directions still need their own rendered product benchmarks before claiming equivalent polish.


Application boundary correction: Complaint Desk is the single active reference app. Any earlier two-live-product benchmark requirement is withdrawn. Device strategies, critique and screenshots never imply another application; see [device and application rules](taste-devices.md). The historical briefing experiment remains untouched.
