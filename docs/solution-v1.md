# Unified Solution Compiler V1

The solution layer builds a reviewable architecture through the existing compilers. It does not execute arbitrary natural language, replace subsystem safety checks, or create a second Canvas/Flow runtime.

```text
Structured intent → explicit Project → SolutionIR → dependency graph
                                    ├─ desiredResources / createPlan
                                    ├─ Canvas / Taste / Composition IR
                                    └─ compileFlows / recipes / planFlows
                                     ↓
                         exact saved unified plan
                                     ↓
                         existing subsystem apply gates
```

## Authoring and traceability

Use `apiVersion: powercanvas.solution/v1`. Both modes require stable requirement IDs, statements, concerns and explicit resource associations:

- `mode: explicit`: embeds the existing strict `powercanvas.dev/v1alpha1` project, plus optional app PRODUCT contexts.
- `mode: intent`: declares project/solution identity, business entities and typed fields, experiences with PRODUCT context, and configured automation recipes. It resolves into the same strict Project schema. It does not parse arbitrary prose or invent recipients, storage locations, save handlers or business authorization.

`processes` selects responsibility through the existing Flow advisor: `singleRowUpdate` and `uiValidation` stay in Power Fx; approval, notification, document generation and scheduled work must reference a configured matching recipe. Missing recipe configuration remains a blocker. Full connection, recipient, template and lifecycle configuration uses the existing typed Flow schema.

Every generated node has a stable logical ID, definition hash, physical name where known, requirement IDs, dependencies, ownership, proposed state and capability evidence. Shared dependencies inherit the requirements of their consumers. Ordinary column resources inherit the table requirement. Primary-name columns remain inside the existing table resource; the solution layer does not duplicate that native operation.

Selectors include `table:requests`, `column:requests.note`, `relationship:requestOwner`, `canvas:workspace`, `flow:approval`, `connection:approvals`, `environment:approver`, `template:report`, `security:reviewers`, and `external:library`. Cross-resource references use `{ resource, column, expectedType }`; GUIDs and physical field names are resolved separately. Unknown references, missing columns, type mismatches, physical collisions and dependency cycles block apply.

See the four complete offline specs under `examples/solutions/`. Their native hosts are explicitly **fixtures** with commit disabled. They prove native candidate generation and architecture differentiation, not working production business saves. Real hosts must provide their explicit data, validation, save, navigation and unsaved-state contracts through the existing Canvas tools.

## Types and minimal architecture

`src/solution/types.ts` is the cross-subsystem type vocabulary. It distinguishes native provisioning, Canvas fields and Flow values. String, multiline, integer, decimal, percentage, boolean, choice, date and datetime map to existing Dataverse operations. Lookups use declared relationships. Email retains its conceptual meaning above text storage. Currency, multi-choice, person, custom GUID, file and file-reference provisioning stay explicitly unavailable where the data provider has no implementation; they are never silently changed into strings.

Dataverse/SharePoint choices record rationale against relationships, security/ownership, auditing, scale/delegation, business rules, document orientation, licensing and integration. V1 honors explicit storage selection; it does not estimate licensing or scale. SharePoint provisioning is external. Alternate-key provisioning also remains external/planned.

Architecture audit flags missing traceability, duplicate concepts/configuration/choices, physical collisions, serialized relationships, excessive lookup fan-out, duplicate device apps, unnecessary synchronous flows and target-specific defaults. These are bounded deterministic checks, not a comprehensive domain model review. Connection references are shared by declared logical key; the compiler never merges connections belonging to potentially different principals just because their connector name matches.

One experience produces one adaptive app. PRODUCT context feeds `planDesign` and `createCompositionIR`; an explicit host uses `compileDesignCandidate`. Production profiles pass through existing maturity enforcement and fail without accepted selections. Multiple apps require explicit job boundaries and the existing application contract. Authoring failure blocks native writes and certification while allowing offline planning and candidate generation.

## Evidence and saved plans

Each resource independently reports schema, compile, deploy, runtime and production booleans plus `SUPPORTED`, `SUPPORTED_WITH_LIMITS`, `COMPILE_ONLY`, `EXTERNAL_BLOCKED`, `BLOCKED` or `PLANNED`. Compiler availability never supplies runtime evidence. Overall states are `FULLY_IMPLEMENTABLE`, `PARTIALLY_IMPLEMENTABLE`, `PLAN_ONLY` and `BLOCKED`. Even a fully implementable development plan does not certify production readiness.

Resource operations are `CREATE`, `UPDATE`, `NO_OP`, `BLOCKED`, `CONFLICT`, `EXTERNAL`, `ORPHANED`, `UNSUPPORTED`. With no discovery, remote operations remain blocked; the planner does not assume names are absent. Dataverse operations come from `createPlan`, including scoped publication. Flow operations come from `planFlows`, including environment current values. No new permissive diff policy is introduced.

Ownership is `POWERCANVAS_OWNED`, `ADOPTED`, `EXTERNAL` or `UNKNOWN`. Native writes require the existing ownership files. Explicit read-only bindings can represent adopted/external resources, but cannot authorize changes or manufacture native Dataverse ownership. Removed owned resources are retained as orphans.

An evidence JSON may contain `target`, `observedAt`, `dataverse: { observation, ownership, plan }`, `readOnlyBindings`, and `authoring`. These retain the original native schemas and IDs. Flow evidence separately contains `{ plan, snapshot, ownership, deployment }`; the existing planner must reproduce it exactly. Historical evidence is labeled and never grants deploy readiness.

Saved plans bind normalized source, resolved project, capability registry, target, observation/ownership evidence, resource definitions, native plans and deployment configuration. Apply verifies the content hash and **rebuilds the canonical plan**, so rehashing arbitrary operations cannot authorize them. Plans expire after one hour. Source whitespace changes alone are not semantic drift.

## Commands and effects

```powershell
npm run build
node dist/cli/index.js solution plan --spec examples/solutions/leave-management.json --out output/leave.plan.json
node dist/cli/index.js solution inspect --plan output/leave.plan.json
node dist/cli/index.js solution graph --plan output/leave.plan.json
node dist/cli/index.js solution audit --plan output/leave.plan.json
node dist/cli/index.js solution critique --plan output/leave.plan.json
node dist/cli/index.js solution diff --before output/old.plan.json --after output/new.plan.json
npm run solution:benchmarks
```

`--json` is available globally. `solution plan` writes a saved plan, resolved project YAML, deployment manifest and an immutable existing agent task journal under `.powercanvas/agent/`. Keep its `--out` inside the selected project so the journal can bind the artifact. Existing paths are never overwritten. Inspect/graph/diff/critique/audit/verify-export are read-only. `solution apply` is classified TENANT_WRITE and requires a saved plan; the actual mutation authority stays with subsystem executors.

Deterministic `audit` reports compiler/architecture blockers. `critique` offers qualitative review questions and architecture warnings; it cannot authorize execution. The agent routes broad systems to the core solution commands, while simple UI redesign and flow-only work retain their specialist routes.

## Staged apply and limits

The deployment view has DATA, CONFIGURATION, AUTOMATION, APPLICATION, BINDINGS, VALIDATION and ACTIVATION phases. Topological resource order is also provided. Configuration and automation execute together through the existing Flow executor, which already orders those operations and owns its journal. This V1 does not split one native saved plan into a new runtime.

```powershell
node dist/cli/index.js solution apply --plan output/reviewed.plan.json --spec solution.json --evidence evidence.json --flow-evidence flows.evidence.json --env approved-alias --out output/apply-run
```

The selected project's resolved source must exactly match the plan. Before the first mutation, allowlisted subprocess calls obtain fresh existing Dataverse and Flow plans and compare target, policy, source, observations, ownership and operation graphs. Native `apply`/`flows apply` repeat their own checks immediately before writes. No shell command or user-generated PAC command is executed.

Unsupported/unresolved stages block the whole request before writes. V1 can execute verified Dataverse and Flow/configuration stages; there is no unified Canvas/BINDINGS/security grant/import adapter. DATA followed by AUTOMATION can still fail as external state changes. The top journal records before/intended/result/verification, plan/project hashes and native execution IDs/results. It reports `PARTIALLY_APPLIED` with UNKNOWN where appropriate and never claims transactional rollback or retries uncertain effects. Native Flow ownership pending state remains authoritative.

Activation is never automatic. The existing manual activation, connector authorization, controlled-write, external-effect, persona and source-preservation checks remain separate. Planned mutation counts differ from actual results; no business rows, emails or approvals are created by planning.

## ALM boundaries

Flow, app, table and configuration definitions are solution resources. Current environment values, connector owners and authorizations are environment data. SharePoint sites/libraries/templates, mailboxes and external APIs remain external. Security requirements model personas, record access and connection ownership, but actual persona testing is required for readiness.

`solution audit --plan ... --checker-report report.sarif` imports and normalizes PAC Checker SARIF 2.1.0 into severity/component/rule/message. It reports `IMPORTED_REPORT`, never claims the service ran. V1 does not automatically invoke Checker or certify report target/freshness. Without a report: `NOT_RUN`.

`--platform-dependencies` accepts explicitly normalized read-only results from `RetrieveRequiredComponents`, `RetrieveDependentComponents` or `RetrieveMissingDependencies`. It compares local/platform edges and reports missing components; automatic live collection remains pending. Microsoft documents these supported messages in [dependency checks](https://learn.microsoft.com/en-us/power-platform/alm/check-solution-dependencies).

`solution verify-export --plan ... --index ...` consumes the existing independently extracted unmanaged archive index, verifies required table/app/config/flow membership, and delegates exact flow definition verification to `verifyFlowExport` when its native plan is supplied. Column, relationship, security and Canvas source verification remain explicit limitations; this is not full package certification. An arbitrary JSON declaration is not trusted export provenance. The CLI does not acquire or independently authenticate that index.

Existing `flows export`, deployment-settings output and native PAC tooling remain available. The manifest documents bounded PAC `solution check` and `solution create-settings` usage; no import/publish is inferred. See Microsoft's [PAC solution reference](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/solution). No UAT environment is created, no import is run, and external assets/security/runtime proof are required before cross-environment readiness can be claimed.
