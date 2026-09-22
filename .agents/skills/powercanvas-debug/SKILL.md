---
name: powercanvas-debug
description: Diagnose PowerCanvas compiler, Power Fx, source/plan/ownership and Power Platform integration failures, especially Canvas authoring MCP and flow deployment. Use when existing PowerCanvas work is broken or blocked. Diagnose before mutation; do not use for unrelated MCP servers without PowerCanvas context.
metadata:
  version: "1.0.0"
  agent-contract: "1.0"
---

# Bounded diagnosis

Identify subsystem → collect current facts/artifacts → read-only diagnostics → classify failure → one justified supported recovery after material state change → stop if unresolved externally. Do not replay identical requests until they pass. [Debugging reference](references/debugging.md) describes evidence and result interpretation.

Negotiate commands and risk through the root skill. Start with local `doctor`, `validate`, saved plan/source/ownership and provider-health artifacts. Live discovery requires actual configured access, but routine reads need no repeated confirmation within the task. Do not call a live authoring doctor merely to inspect an already recorded blocker during unrelated work.

Separate MCP startup, authentication evidence, Studio attachment, control/API discovery and fresh source. HTTP 422 and connection timeout are different observations; neither proves a specific root cause. PAC download does not prove native authoring health. BLOCKED/CONFLICT/STALE/UNSUPPORTED requires changed premises, not forced apply.

When authoring is unavailable, preserve unsaved source/reconstruction evidence and existing certificates. Continue safe offline planning. Do not close protected tabs, delete global credentials, call undocumented endpoints or mutate source to test connectivity. UNKNOWN writes require reconciliation. Produce sanitized diagnostics and a precise blocker; no automatic support-message submission.
