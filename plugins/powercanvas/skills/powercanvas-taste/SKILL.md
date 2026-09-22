---
name: powercanvas-taste
description: Select and critique PowerCanvas Canvas UI/UX using PRODUCT.md, DESIGN.md, design directions, responsive composition and verified component maturity. Use for redesign, navigation, overlays, layout and themes. Route source mutations through powercanvas-canvas; not for generic website styling or flow-only work.
metadata:
  version: "1.0.0"
  agent-contract: "1.0"
---

# Taste workflow

Negotiate CLI capabilities through the root skill. Read PRODUCT.md for users/jobs/devices and DESIGN.md for this application's design contract. Inspect the rendered baseline when available; unseen screenshots cannot support critique. Establish missing design memory with `taste design generate`; synchronize the companion with `taste design sync`. Never maintain a competing edited design.json.

Use `taste decisions`, `taste plan`, and where alternatives matter `taste explore`. Inspect `patterns info`, `components variants` and certificate-backed `canvas production-core` before selecting a pattern. Match workflow, information hierarchy, density, device needs and accessible interactions; do not invent business data for visual fullness.

Resolve maturity before generation. A requested BottomSheet, PCF candidate or drag/drop pattern must pass the actual capability contract at the requested maturity. Do not hand-build an equivalent to bypass a blocked registry selection. Mobile/tablet/desktop remain same-app compositions unless the application requirement explicitly differs.

Read [retained design workflow](references/workflow.md) for generation/redesign and native review details; [reference decisions](references/research.md) only when evaluating an unfamiliar pattern. The retained workflow is migrated from the repository's original Taste skill, not a second independent design system.

Create local candidates and migration plans through the CLI. `taste critique` validates a reviewer-authored source/screenshot-bound report; it does not see or rate images by itself. `taste preflight` separates static validity from runtime completion. For authoring writes, load [Canvas](../powercanvas-canvas/SKILL.md). Authoring-unavailable mode permits local exploration, not a claim of native completion.
