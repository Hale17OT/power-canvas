# Reference decisions · 18 September 2026

These are architectural references, not installed dependencies or copied component source.

| Reference | Observed pattern | PowerCanvas decision |
|---|---|---|
| [Taste Skill](https://www.tasteskill.dev/) and its [source](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md) | Brief inference, three dials, audit-first preservation, block contracts and mandatory completion gate. Its current skill explicitly targets landing pages/portfolios. | Adopt the decision process; replace web aesthetics, React/motion stack and landing-page rules with operational Canvas decisions. Use five user-requested dials. |
| [PowerAppsUI record browser](https://www.powerappsui.com/templates/record-browser), [components](https://www.powerappsui.com/components), [design system](https://www.powerappsui.com/docs/design-system) | Native-control YAML, configurable component properties, compact navigation/filter/data composition and shared tokens. | Preserve PFDS's own strict contracts and native factories. Mixed row templates justify Gallery; do not transplant app-specific formulas or claim every classic control is required. |
| [Fluent 2 tokens](https://fluent2.microsoft.design/design-tokens) and [accessibility](https://fluent2.microsoft.design/accessibility) | Separate raw values from semantic aliases; hierarchy, focus, readable contrast and reflow. | Named Power Fx semantic tokens, predictable action hierarchy, touch-sized mobile controls and explicit runtime review. No claim that using Fluent-inspired colors certifies accessibility. |
| [Creator Kit](https://learn.microsoft.com/en-us/power-platform/guidance/creator-kit/overview) | Canvas library, templates, PCF components and theme editor; distributed as managed solutions, with sample implementation caveats. | Separate reusable composition from platform control. Evaluate PCF dependencies deliberately; do not install Creator Kit into the Default experiment as a shortcut. |
| [shadcn registry](https://ui.shadcn.com/docs/registry) and [registry item schema](https://ui.shadcn.com/docs/registry/registry-item-json) | Ownable source, dependency-aware recipes and CLI distribution; not limited to React. | Schema-validated recipes, explicit implementation status and dependency records. Keep native artifacts and host-owned actions. |
| [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility) and [dialog](https://www.radix-ui.com/primitives/docs/components/dialog) | Labels, keyboard behavior, focus entry/restoration and interaction states belong to primitives. | Preserve guarded dialogs, focus restoration, disabled background and unsaved confirmation. Do not port DOM/ARIA implementation into Canvas. |

No third-party component implementation was copied. Existing PFDS remains the source library. If a future recipe adapts MIT source, retain its license/provenance in that recipe and redistribution output.

## Architecture inspection before changes

`config/load.ts` parses the strict project IR and validates provider capabilities. `canvas/schema.ts` owns intent, `compile.ts` expands the older semantic layer, `patterns.ts` emits the tested PFDS 0.2 native compositions, and `native.ts` binds Dataverse names/choice types discovered from the app. Theme and Power Fx generation are deterministic; there is no embedded LLM or prompt runner. The agent supplies design intent, then the CLI implements it.

`canvas/sync.ts` is a three-way property merge with collision/removal/manual-conflict protection. The authoring session binds an existing owned app and solution, checks fresh source hashes, journals attempts and asks the official Canvas MCP server to validate source. It is not an atomic import. Save/publish/readback remain separate. PAC managed-solution ALM is planned in provider capabilities; Taste does not turn this into a production packaging pipeline.

Baseline inspection covered native form/review/reason/submit behavior, semantic templates, modern control discovery, PFDS contracts, source receipts, ownership checks, CLI artifact writes, native test suite and visual evidence. The redesign extends those components and keeps the existing app/screen/control identities.
