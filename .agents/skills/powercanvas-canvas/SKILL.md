---
name: powercanvas-canvas
description: Generate, inspect and safely migrate native Power Apps Canvas source through PowerCanvas. Use for screens, controls, forms, typed fields, galleries, Power Fx, responsive composition or authoring workflows. For UI direction consult powercanvas-taste; do not use for Power Automate-only work.
metadata:
  version: "1.0.0"
  agent-contract: "1.0"
---

# Canvas workflow

Follow root [capability negotiation](../powercanvas/references/capabilities.md). Read project YAML, PRODUCT.md/DESIGN.md, app binding and current provider health. Do not reuse an example's app/environment IDs.

For existing apps: inspect → acquire fresh source with independent saved witness → design/change plan → migration/preservation validation → local candidate → guarded native preview → exact readback/checkers → critique/test → report/apply only within authorization. See [command workflow](references/canvas.md) and [official authoring boundary](references/authoring.md).

Desktop/tablet/mobile are normally compositions in the same app, with one business-binding/validation/save contract. A request for a “mobile version” does not itself imply a second product. Clarify only a genuine distinct-application requirement; use `canvas application-plan` to enforce its contract.

Resolve components and typed fields through existing registries, host adapters and maturity checks. For redesign load Taste first. Do not manually implement an uncertified requested pattern to evade a production gate. Local HTML rendering is not native Canvas proof.

If MCP is SESSION_REJECTED, AUTHORING_UNAVAILABLE, RECOVERY_REQUIRED, or stability is unproven, preserve artifacts and do offline work. PAC is a saved-source witness only. Route diagnosis to Debug without starting a reconnect loop. `compile_canvas` can mutate the draft; obey root [safety](../powercanvas/references/safety.md).

For SharePoint-backed solutions, load [SharePoint infrastructure](../powercanvas/references/sharepoint-v1.md). Use the unified symbolic identity and field contract; unresolved IDs, native registration and live access remain explicit prerequisites. Do not provision infrastructure through business-row/file actions.
