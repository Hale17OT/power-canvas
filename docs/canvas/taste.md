# PowerApps Taste

For the offline decision-first V4 engine, executable component expansion and benchmarks, see the [V4 guide](design-v4.md). Existing V1–V3 generation remains supported.

For PRODUCT.md, DESIGN.md, screenshot-bound critique, native refinements and design drift, see the [V2 design-memory guide](taste-memory.md). V1 contracts below remain supported.

Taste is PowerCanvas's workflow-to-design subsystem for native Canvas generation. The agent reasons about the workflow and writes a structured intent. The deterministic CLI resolves personality/dials, selects compositions, resolves component capabilities, emits PFDS source, inventories dependencies and rejects static failures. Runtime evidence remains a separate completion gate.

It extends `src/canvas/native.ts` and PFDS 0.2. It does not replace the existing Dataverse compiler, own data mutations, install React libraries or imply production solution ALM support.

## Use

Add `taste` under a Canvas app in `powercanvas.yaml`:

```yaml
taste:
  personality: dense-operations
  dials:
    designVariance: 2
    visualDensity: 8
    brandExpression: 3
    componentComplexity: 7
    motionIntensity: 0
  reducedMotion: true
  intent:
    audience: Service agents
    workflow: Find, inspect, edit, review and save a record
    frequency: daily
    purpose: operations
    primaryAction: New record; edit selected record
    secondaryInformation: Notes and history in the detail panel
    rationale: Repeated triage needs compact rows and quiet chrome
```

All dials are finite numbers from 0 to 10. Unknown properties fail validation. Personalities are `fluent-enterprise`, `clean-saas`, `dense-operations`, `executive-dashboard`, `minimal-workspace`. If omitted, the resolver uses purpose/frequency, recording the result. Presets share the same controls; they differ through token/layout decisions. Existing apps without `taste` retain the prior generation path.

| Dial | Emitted effect |
|---|---|
| Density | Desktop 64/76/96 rows, 36/44 controls, 16/24/32 page padding, 8/16/24 gaps; phone controls remain 44 |
| Variance | Radius, detail width and chart/detail proportions |
| Brand expression | Restrained neutral rail versus explicit brand rail with contrast-derived foreground |
| Complexity | Secondary row metadata exposure; core record fields/actions remain available |
| Motion | None or bounded native Fade navigation; reduced motion always forces None |

Native behavior uses discrete bands, not ten arbitrary animated styles. `config.ts` owns those bands. PFDS owns semantic color, surface, border, typography and radius tokens; Taste adds density, composition and elevation decisions. Only one named formula is emitted for each token.

```powershell
node dist/cli/index.js --project examples/canvas-native-complaints taste plan --app complaintPortal
node dist/cli/index.js components list
node dist/cli/index.js components info DataTable
node dist/cli/index.js taste compositions
node dist/cli/index.js taste audit output/canvas/native/redesign-v11 --out output/my-audit
node dist/cli/index.js --project examples/canvas-native-complaints taste redesign output/canvas/native/redesign-v11 --app complaintPortal --bindings examples/canvas-native-complaints/bindings.json --out output/my-candidate
```

`canvas native` also invokes Taste automatically and writes `taste-report.json`. Artifact writes use exclusive creation. `taste redesign` always saves a before audit, rejects changed/removed business formulas, and emits a local candidate. It does not publish.

## Recipes and resolution

`taste/registry.ts` validates every recipe: purpose, use/non-use cases, implementation type, native controls, composition/PCF choices, inputs/outputs, variants, states, responsive/accessibility rules, tokens and dependencies. The vocabulary exceeds 100 names. Executable PFDS recipes have actual strict input contracts. Planned entries are intentionally rejected by the resolver; a vocabulary entry is not a shipped implementation.

Resolution checks required capabilities against discovered modern capabilities first, then composition capabilities, then a justified PCF evaluation. PCF results are non-executable until a package is selected and validated; supplying a justification never installs a dependency. Mixed row templates use the existing Gallery composition with a recorded technical reason. A simple modern table can win when its discovered capabilities are sufficient.

Add a native recipe by implementing a factory and its strict contract in `patterns.ts`, then recording its mapping/use limits in the registry and testing real behavior. Do not list an editable/grouped variant as rendered unless its editing/grouping contract and implementation exist. Variant vocabulary describes design options; capability resolution is still required.

## Compositions

Fourteen composition contracts define purpose, hierarchy, primary/secondary actions, recommended components, semantic slots, responsive behavior and states. `taste compose --spec <yaml> --out <fresh-dir>` renders actual native slot compositions. Each slot contains existing pattern requests. Unknown/missing slots and duplicate control identities fail. Hosts supply reviewed formulas and data sources. The native bound compiler shares the responsive work-queue region renderer.

To add a composition, add its name and contract in `taste/compositions.ts`, define its slots and hierarchy, and test populated/missing slots, narrow reflow and action preservation. Slot output still requires host bindings and official native validation; it is not an automatically deployed app.

## Audits and gates

`taste audit` reads real `.pa.yaml` source (excluding editor state). Findings point to control paths and exact evidence. Counts include modern controls, legacy visual controls, auto-layout containers, token-governed style properties and per-screen state evidence. No aesthetic quality percentage is invented.

The dependency inventory includes formulas, known control references, writes to variables/collections, flow calls, form operations, data sources and screen handlers. It is lexical, not a full Power Fx parser or a Dataverse/SharePoint permission test. Redesign compares existing behavioral formulas, allowing only the explicitly generated navigation-transition substitution. New additive controls are not treated as lost behavior.

Rules detect modern-equivalent misuse, missing interactive names, arbitrary style values, hardcoded colors, excessive shadows/nested surfaces/primary gallery actions, suspicious fixed layouts and missing empty/loading/error source evidence. Each rule has a stable ID, path, evidence and remedy. Extend `audit.ts` with a measured rule and positive/negative fixtures. Keep heuristic findings explicit; do not label source scans as visual or screen-reader certification.

Static warnings/errors block Taste generation. Gallery template review findings require the resolver's technical justification and visual review. `taste preflight <candidate> --before <baseline> --evidence <json> --out <fresh-dir>` also requires exact source-hash-bound runtime evidence:

```json
{"sourceHash":"<64-character candidate native hash>","desktop":true,"tablet":true,"narrow":true,"accessibility":true,"behavior":true,"visualReview":true}
```

Evidence is an explicit reviewer attestation backed by test artifacts, not a cryptographic proof. Do not mark a field true without those checks. Incomplete preflight exits nonzero and lists pending checks. Official App Checker/accessibility checks, behavioral browser tests and independently captured screenshots supply the native acceptance evidence. A clean source audit alone cannot complete generation.

## Delivery and limitations

Use the existing three-way sync planner against the last generated intent, last published server receipt and fresh observation. It preserves manual edits and blocks name collisions/removals. Default environment remains non-disposable: owned app/solution only, no unrelated resource adoption, no destructive API tests, no managed upgrade/removal experiments. Authoring validation can mutate drafts even when validation fails; read back before retrying.

The current bound native app supports dashboard, record list and editable master/detail. Other compositions generate configurable native layout blocks; they do not invent document storage, approval permissions, user administration or services. Several advanced vocabulary entries remain planned. The semantic HTML showcase is a different older layer, not a native quality certificate. Large-data delegation, separate-user authorization, standalone licensing and production ALM remain separate gates.

See the [repository skill](../../skills/powerapps-taste/SKILL.md) and [research decisions](../../skills/powerapps-taste/references/research.md).

For fresh native acquisition, source agreement, behavioral migration and evidence gates, see [Design Engine V4.2](design-v42.md) and its [execution report](design-v42-report.md).

For source-bound authoring recovery, reversible certification batches and the provisional production-core manifest, see [Design Engine V4.4](design-v44.md) and its [blocked acceptance report](design-v44-report.md).
