# PFDS research and licensing — 18 September 2026

PFDS is first-party code. No third-party component source, design assets or branding were copied.

| Reference | Finding | PowerCanvas decision |
| --- | --- | --- |
| [PowerLibs library](https://www.powerlibs.com/library?view=custom) and [license](https://www.powerlibs.com/license) (updated 9 February 2026) | End-product use differs from redistribution. The license prohibits standalone distribution, building tools for others from components, and competing libraries. | Use only general observations about business UI categories. Do not embed, derive or redistribute PowerLibs components. |
| [PowerApps UI components](https://www.powerappsui.com/components), [design system](https://www.powerappsui.com/docs/design-system), [license](https://www.powerappsui.com/license) | Component code generally MIT; retain copyright/license, check component-specific exceptions. Website/design/branding/docs are excluded. Named formulas, shared tokens and semantic variants are useful architectural patterns. | Independent implementation. Any future source reuse requires per-component provenance and notices. |
| [Modern controls](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/controls/modern-controls/overview-modern-controls), [Fluent 2](https://fluent2.microsoft.design/) | Controls/theme support evolves and depends on app settings. | Record control assumptions and maturity; discover exact controls/versions through the authoring adapter before native emission. |
| [Responsive layout](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/create-responsive-layout) | Containers, flexible dimensions and app display settings determine reflow. | Semantic compact/medium/wide modes, container composition, no free X/Y layout contract. |
| [Accessibility](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/accessible-apps) | Labels, meaningful headings, keyboard order, contrast and touch layout require actual testing. | Semantic checks plus runtime acceptance; no component marked stable from source-only tests. |
| [Named formulas](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/object-app#formulas-property) | App.Formulas defines reusable declarative values. | Prefixed `PF_*` semantic color, spacing, radius, control-height and breakpoint formulas; component/screen state kept separate from derived theme values. |
| [Delegation](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/delegation-overview) | Nondelegable queries can return incomplete subsets of large data. | No silent collection materialization; bounded prefix-search templates only, adapter/Studio delegation check still mandatory. |
| [External authoring](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/create-canvas-external-tools) (31 August 2026) | Requires .NET SDK 10+, saved app, open Studio coauthoring session and Microsoft's Canvas authoring MCP. Data sources are added through Studio. | Replaceable live adapter; no offline universal compiler. |
| [Source files](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/power-apps-yaml) | Extracted source is a review format; retired fx.yaml packing is not the current authoring path. | Do not fabricate msapp archives or treat local YAML as a deployed app. Use the newer dedicated live-authoring workflow. |

## Comparison translated into PFDS

PowerApps UI demonstrates coherent shared theme conventions; PowerLibs demonstrates demand for reusable navigation, cards, inputs and states. PFDS adds a strict semantic contract, deterministic composition, typed references, maturity policy and explicit transport boundary. Enterprise interfaces inform restrained color, scannable density and clear action hierarchy. Interactions requiring web-only DOM/ARIA/CSS capabilities are not promised for Canvas.

Initial scope is DS-1 dashboard/list composition. Advanced dialogs, timeline, files, charts, arbitrary formulas, generic editable forms and universal DataTable behavior remain later capabilities. Local HTML previews are visual approximations, never Canvas runtime evidence.
