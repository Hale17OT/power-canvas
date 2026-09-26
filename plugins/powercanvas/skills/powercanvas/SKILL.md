---
name: powercanvas
description: Plan, inspect and orchestrate PowerCanvas projects for Microsoft Power Platform, routing Canvas, UI/Taste, Power Automate and debugging work through the deterministic CLI. Use for PowerCanvas application or automation build/change requests. Do not invoke a heavy workflow for general Dataverse explanations or unrelated programming.
metadata:
  version: "1.0.0"
  agent-contract: "1.0"
---

# PowerCanvas

The skill interprets intent; PowerCanvas Core determines validity, capability maturity, source identity, risk and permitted mutations. Unified Solution Compiler V2 extends the same Solution IR with bounded Dataverse/model-driven delivery, security personas and Checker/dependency evidence. Native Canvas apply and production readiness remain separately gated.

Start in the selected project. Run the installed CLI's `version --json`, `capabilities --json` and `agent commands --json`; in a source checkout use `node dist/cli/index.js`. Contract major 1 is required. If missing/incompatible, stop command guessing and follow [capability negotiation](references/capabilities.md). No sign-in or native MCP is needed for these offline commands.

Route using this precedence; combine specialists for mixed work:

| Intent | Load |
| --- | --- |
| Failure, stale source/plan, ownership conflict, authoring timeout | [Debug](../powercanvas-debug/SKILL.md) first |
| UI direction, redesign, responsive composition, theme, navigation | [Taste](../powercanvas-taste/SKILL.md), then Canvas for source changes |
| Canvas screens, forms, fields, Power Fx, source/migration | [Canvas](../powercanvas-canvas/SKILL.md) |
| Approval, notification, document, reminder, child flow | [Flows](../powercanvas-flows/SKILL.md) |
| Broad business app or multi-resource system/solution | [Architecture](references/architecture.md): core `solution plan`, inspect, graph, audit and critique before supported specialists |
| Model-driven administration, Dataverse schema, roles or app access | [Native solution delivery](references/solution-v2.md), through the same architecture compiler; do not route model-driven forms/navigation into Canvas |

`agent route "<request>" --powercanvas-context --json` provides bounded routing hints for a confirmed PowerCanvas project. It does not execute or authorize a workflow. Use context to resolve ambiguous generic words; unrelated requests stay outside PowerCanvas.

Inspect â†’ plan â†’ validate â†’ review/apply within existing authorization. Read [safety](references/safety.md) before any mutation boundary and [resume](references/resume.md) for longer tasks. Do useful offline work when authoring is blocked. Load only the chosen references, not the full architecture.

Read `capabilities --json` → `nativeProviders` for evidence-derived bounded live provider dimensions and pending publication/access proof. Inspect Solution IR `readiness.provider`, `readiness.deployment`, and `readiness.production` separately. Provider convergence may accept the explicit manual-publication app-access deferral; it never authorizes publication or establishes production readiness.

Report outcomes, exact evidence level, blockers and user action needed. Distinguish schema/compile/deploy/runtime proof. Never describe an implemented factory, HTML preview or planned PCF candidate as a native production certificate.

For installation/discovery only, read the [Codex adapter](references/hosts/codex.md) or [Claude/other hosts adapter](references/hosts/claude-code.md).
