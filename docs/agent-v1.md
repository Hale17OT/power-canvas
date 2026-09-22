# PowerCanvas Agent Skill and Plugin V1

The agent layer routes intent into the existing deterministic CLI/core. It does not implement another compiler, bypass plan/apply, or turn maturity into a prose judgment. Skills/plugin version is **1.0.0**, agent contract **1.0**, current CLI **0.1.0-dev.1**.

## Authoritative content and packaging

`.agents/skills/` contains five automatically eligible portable skills: `powercanvas`, `powercanvas-canvas`, `powercanvas-taste`, `powercanvas-flows`, `powercanvas-debug`. Name/description metadata supports host selection. The root routes failure diagnosis first; design work loads Taste before Canvas; mixed requirements combine relevant specialists. `agent route` is a bounded deterministic helper, not a general-language classifier or execution engine.

Each main skill is below 600 words. Shared capability, safety, architecture, resume and host references live with the root. Canvas/authoring, flow, debugging and retained design details are loaded on demand. Existing repository documentation is referenced by checkout-relative paths rather than copied into the package.

The former `skills/powerapps-taste/SKILL.md` workflow and research are retained under `.agents/skills/powercanvas-taste/references/`. The old paths forward to that authority so existing documentation/callers do not break. There are no divergent full Taste copies.

`npm run agent:package` copies authoritative skills into `plugins/powercanvas/skills/` and creates a digest manifest. `node scripts/package-agent-plugin.mjs --check` detects content drift and extra files. The package has Codex and Claude manifests plus four bounded specialist briefs. It deliberately has no marketplace registration, auto-install hooks, bundled Microsoft binary or new PowerCanvas MCP server. Before public distribution, the repository still needs a license grant.

## Negotiation and command inventory

```powershell
node dist/cli/index.js version --json
node dist/cli/index.js capabilities --json
node dist/cli/index.js agent commands --json
node dist/cli/index.js agent route "Redesign the mobile form" --powercanvas-context --json
```

Capabilities derive from existing Canvas/component, flow/action/provider and recipe registries. Optional `--certifications <selection-manifest>` uses the existing certificate verifier. Absence of that evidence is NOT_CHECKED, never zero capability or implicit production proof. Optional `--authoring-evidence <directory>` reads recorded artifacts; it does not connect. A failed/missing/expired authoring acquisition cannot authorize mutation, and PAC remains DEGRADED_READ_ONLY.

The CLI-owned inventory walks the real Commander tree, exposing names, positional arguments, options, aliases, purpose and explicit risk metadata. Unknown/unclassified additions fail inventory generation and tests. Risk is the conservative maximum across options. `mutatesLocalSource` includes local artifacts/state, not only handwritten source. Network access and remote mutation are separate: flow plans and source acquisition can read remotely while writing only local evidence.

`apply` and `flows apply` require saved plans. `flows activate` can initiate business/external effects and has distinct activation checks rather than a fictional `--plan` option. Microsoft's `compile_canvas` remains an authoring-session write outside the local `canvas compile` command. There is no newly invented `canvas apply` endpoint.

Four previously silent Taste handlers now emit structured artifact summaries in JSON mode: reference normalization, design generation, design sync and refinement. Existing human output and artifact behavior are retained. Authoring recovery now emits one final JSON report rather than a doctor report followed by a second JSON document. Unsupported component variants return a capability error instead of an internal failure.

## Workflow command mapping

| Workflow | Command families and boundary |
| --- | --- |
| Root architecture | version, capabilities, agent commands/route, validate; split supported subsystems |
| Canvas | application-plan, source sync/compare, composition-lower, native/component, migration-validate, Taste migration-plan/preflight; native preview uses existing guarded provider/transaction |
| Taste | design generate/sync, decisions/plan/explore, patterns/components, migration-plan, critique/refine/audit/preflight |
| Flows | advise, recipe list/explain, providers/actions, validate/compile, dependencies/portability, metadata, saved plan/apply, separate activation/export verification |
| Debug | local doctor/validate, recorded provider-health and source/plan inspection, justified bounded live diagnostics only when in scope |

Read-only inspection/local compilation need no ritual permission. Missing actual business choices or remote authorization remain distinct questions. The skills never infer approvers, overwrite hashes, accept ownership collisions, provision demo resources or execute an unknown outcome again without reconciliation.

## Resume artifacts

`agent journal --spec <json> --out .powercanvas/agent/<task>-<revision>.json` validates and exclusively creates a local fact journal. It records project, goal, phase/workflow, planned command IDs, blockers, facts, mutation state and project-contained artifact paths/raw-file hashes/optional expiry. Credentials and private reasoning do not belong in it. New revisions avoid overwriting history.

`agent resume --journal <file>` checks project identity, path containment, hashes and expiry. Changed/missing evidence returns STALE; UNKNOWN mutation outcome returns BLOCKED. Matching files still require current source/provider/plan validation and never grant mutation authorization. Core schemas remain the authority for the referenced artifacts.

## Host and Microsoft boundaries

Codex uses repository `.agents/skills/` discovery with explicit `$powercanvas` or implicit intent routing. This follows [official skill guidance](https://learn.chatgpt.com/docs/build-skills). The generated plugin may be installed separately; avoid loading both copies into one workspace. File layout/metadata are validated locally; automatic live host selection is a separate test.

Claude can load the same packaged skills with `claude --plugin-dir ./plugins/powercanvas`, using `/powercanvas:powercanvas`; its [plugin reference](https://code.claude.com/docs/en/plugins-reference) defines the shared directory layout and optional specialist agents. Other [Agent Skills hosts](https://agentskills.io/specification) can load the same content, but need local filesystem/process access and a compatible CLI to execute. No claim is made that ChatGPT without those tools can operate the checkout.

Microsoft's `canvas-app`, `configure-canvas-mcp` and `add-data-source` workflows remain the native provider interface. PowerCanvas neither bundles their binaries nor recreates setup. The official Canvas MCP and .NET are conditional requirements for native work; PAC is a separate saved witness. The validated Codex dependency metadata has no optional-tool field, so those requirements are documented instead of forced at installation.

The V4.5 authoring blocker and its evidence remain unchanged. Skill construction makes no attempt to reconnect. Offline design exploration, compilation, static validation, capability discovery and project/journal inspection remain usable.

## Evaluation

`npm run agent:eval` runs 18 routing/workflow/capability fixtures and four structured-result interpretations, checks the actual command inventory, and verifies package drift. Tests also exercise command risk, unsupported capability errors, strict journals, stale/expired/outside artifacts, PAC health, JSON output, plugin file integrity and the version-first discovery wrapper. These are deterministic evaluations, not a substitute for live model/host evaluations.

Independent agent forward-testing uses the installed skill content plus raw local CLI/schema evidence for realistic requests, with no target access. Keep model observations separate from deterministic fixture counts. Report omissions/limitations and fix demonstrated defects rather than teaching the exact evaluation answers.

## Future core/MCP seams

`src/agent/capabilities.ts`, `routing.ts`, `journal.ts` and `eval.ts` expose host-independent functions. `src/cli/program.ts` builds the existing Commander tree without running it; `index.ts` retains the public parsing/error boundary. This small seam enables inventory/testing without a CLI rewrite.

A future `@powercanvas/core` can export existing project loading, Canvas generation/migration, flow compilation/planning and these agent contracts. Remote CLI handlers still combine authentication, stores, filesystem writes and rendering; extract typed service requests/results and injected providers incrementally. Do not duplicate schemas in host adapters.

Future MCP tools could map `capabilities`, `inspect_project`, `validate_project`, `taste_decisions`, `migration_plan` and `plan_flow` to those core APIs. They should use typed inputs/results, no shell-output parsing, and the same risk/ownership/source gates. The MCP server and Unified Solution Compiler are **not implemented by this V1 task**.
