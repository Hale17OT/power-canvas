# Agent Skill and Plugin V1 implementation report

Implemented on 22 September 2026. PowerCanvas remains the deterministic execution authority; the skills provide routing, workflow guidance and evidence interpretation. No live tenant operation or authoring recovery was attempted.

## Skills and progressive disclosure

| Skill | Scope | Main file words / bytes |
| --- | --- | ---: |
| powercanvas | Root intent routing, capability negotiation, architecture | 316 / 2,650 |
| powercanvas-canvas | Same-app source generation, migration, native boundary | 231 / 1,911 |
| powercanvas-taste | Product/design memory, direction, critique and maturity | 270 / 2,237 |
| powercanvas-flows | Typed primitives/recipes and controlled delivery | 216 / 1,796 |
| powercanvas-debug | Bounded diagnosis, stale/unknown outcomes, offline mode | 233 / 1,875 |

The authoritative source is `.agents/skills/`. Main files link to shared capability/safety/resume/architecture references and specialist workflow references. Host details load only when needed. All five have version 1.0.0, contract 1.0, precise descriptions and implicit-invocation UI metadata.

The existing Taste workflow/research was moved into `powercanvas-taste/references/`; old paths now forward to the new authority. Four plugin specialist briefs cover planner, Canvas worker, flow worker and reviewer. Native session work is serialized; offline role delegation is optional.

## Routing and compiler integration

Root routing prioritizes Debug for failures, Taste before Canvas for redesign, and Flows for automation. Mixed requests combine these. `agent route` exposes bounded deterministic hints and never executes its suggestions. General Dataverse explanation and unrelated programming cases avoid a heavy workflow.

`version --json`, `capabilities --json` and `agent commands --json` provide contract negotiation and **94 actual registered commands** with flags, arguments, aliases, purpose and risk. Inventory fails closed for a newly unclassified command. Capabilities read existing component/action/provider/recipe registries, optionally verify certificate artifacts, and assess recorded authoring evidence without connecting. Six existing certificates reverified; none were added or promoted.

Canvas uses existing application/source/migration/generation commands, Taste uses existing memory/decision/critique commands, Flows uses existing typed compile/plan/apply and separate activation, and Debug uses inspection/diagnostic evidence. Exact workflow mappings are in [architecture and usage](agent-v1.md). No raw flow clientdata generator, general Canvas apply command, Unified Solution Compiler or PowerCanvas MCP runtime was added.

Four formerly silent Taste JSON-mode operations now report artifact summaries. Authoring recovery avoids emitting two JSON documents. A planned component without native variants returns `PF-CAPABILITY-UNSUPPORTED` instead of an internal/file-access error. Existing compiler and write-gate behavior stays intact.

## Safety, state and degraded operation

Command risk remains code-owned. Manifest data distinguishes local outputs, remote reads, plan-bound deployment and activation that may initiate business effects. Native Microsoft compile is an authoring-session write; local Canvas compile is not. Skills cannot override source hashes, ownership, collisions, maturity, controlled writes or plan/activation gates.

Optional immutable journal revisions under `.powercanvas/agent/` record facts, goal/workflow/phase, planned command IDs, blockers, mutation state and artifact hashes/expiry. Resume checks selected project, containment, actual hashes and expiry. STALE requires replan; UNKNOWN requires reconciliation. Even matching files grant no mutation authorization. No model reasoning or credentials belong in these files.

Offline capabilities, design plans, local compilation, static validation, project inspection and journal checks remain usable without native authoring. PAC remains read-only. The V4.5 transport blocker and original diagnostics were not edited or retried; V4 acceptance remains blocked.

## Packaging and host support

`plugins/powercanvas/` contains validated Codex and minimal Claude manifests, README/maintenance guidance and specialist briefs. `npm run agent:package` generates 23 skill/support files from the authoritative source; digest and link tests prevent divergence. No symlink-dependent packaging is required.

Codex repository discovery is configured through `.agents/skills/` with `$powercanvas`; host documentation covers fresh-session pickup. Claude uses the same content via `claude --plugin-dir ./plugins/powercanvas` or operator-managed project skills. ChatGPT/other hosts require a compatible CLI and filesystem/process tools to execute; prose-only access is not enough.

Microsoft's existing Canvas plugin and official configure/data-source workflows remain the conditional native provider. No binaries or competing configuration workflow were bundled. Optional native dependencies are documented because the validated local Codex dependency schema does not expose an optional-tool flag. No global plugin/marketplace was installed or changed. Public redistribution remains subject to the repository's missing license grant.

## Evaluation evidence

All 18 deterministic fixtures passed:

1. Existing Canvas redesign.
2. Mobile-first form redesign.
3. Typed form field.
4. Approval after Submitted.
5. MCP connection timeout.
6. Unsupported drag/drop Kanban.
7. Same-workflow mobile version without a second app.
8. Stale-plan bypass request.
9. Overwrite despite different hashes.
10. Redesign with AUTHORING_UNAVAILABLE.
11. Redesign with RECOVERY_REQUIRED.
12. PAC-only DEGRADED_READ_ONLY.
13. Combined Canvas redesign and notification.
14. Broad system architecture with future unified boundary.
15. General Dataverse explanation negative case.
16. JavaScript sorting negative case.
17. Unrelated website negative case.
18. Approval/document recipe.

Four structured-result cases (BLOCKED, CONFLICT, STALE, UNSUPPORTED) passed. Command selection is checked against the real inventory, and capability honesty uses the existing adapter registry. Unit/integration tests also cover risk differences, JSON output, expired/missing/outside artifacts, unknown outcomes, secret-bearing journal fields, version incompatibility, package integrity and PAC health.

An independent agent forward-test read the skills and actual local CLI/schema artifacts for three realistic tasks: authoring-blocked mobile redesign, approval with missing approvers/connections, and production Kanban plus forced hash overwrite. It selected safe bounded steps in all three, and compiled the existing V3 reference fixture locally with `remoteWrites:0`. It found a wrong flow-documentation path and the misleading planned-component error; both were fixed. The reference now explicitly distinguishes status-filtered modification from guaranteed previous-value transition/exactly-once behavior.

Final repository validation: **lint, typecheck, build; 606 tests / 38 files pass** (previous 569 preserved, 37 new tests). **18 routing cases + 4 interpretation cases pass**; plugin generation/drift check passes; five skills and the Codex plugin pass their supplied validators. The validators used an ignored local PyYAML 6.0.3 dependency because neither available Python runtime initially included it. Existing six certificate artifacts pass verification. No visual implementation changed, so no browser-baseline update was performed.

Machine-readable evaluation output: `output/agent-v1/evaluation.json`; capability evidence: `output/agent-v1/verified-capabilities.json`; read-only wrapper output: `output/agent-v1/discovery.json`. These are ignored local artifacts.

## Tenant effects and remaining gaps

| Effect | Count |
| --- | ---: |
| Canvas apps created / updated / saved / published | 0 / 0 / 0 / 0 |
| Flows created / updated / activated / invoked | 0 / 0 / 0 / 0 |
| Business rows created / updated / deleted | 0 / 0 / 0 |
| Other tenant resources changed | 0 |
| Live Canvas reconnect attempts | 0 |

The deterministic router is intentionally limited; natural-language judgment still belongs to the agent. The independent forward-test demonstrates useful skill behavior, not a statistical reliability score. Native implicit selection/installation has not been exercised end-to-end in every host; Claude manifest compatibility is documented, not a live Claude certification. V4 native authoring remains blocked. No new live connector/persona/production ALM proof is claimed. Risk metadata must be maintained as commands evolve; fail-closed inventory tests catch missing classifications, not every semantic error in a classification.

Future `@powercanvas/core` and MCP extraction seams are documented in [architecture and usage](agent-v1.md), without a broad refactor. The CLI remains available directly to humans and CI.
