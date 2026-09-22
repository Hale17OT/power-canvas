# Unified Solution Compiler V1 implementation report

Public copy: live account, app, environment and session identifiers are redacted. Original evidence remains local.

Research and verification date: 22 September 2026. No tenant mutation was performed. Complaint Desk source, saved native source evidence, flows and business data were not changed.

## Architecture delivered

`src/solution/` contains strict authoring schemas, structured-intent resolution, shared types, canonical SolutionIR, cross-resource references, traceability, dependency ordering, resource/capability/ownership resolution, saved-plan validation, architecture audit/critique, staged delegation and ALM evidence ingestion. `src/cli/solution-commands.ts` exposes eight commands.

The implementation reuses `desiredResources`, `modelResources`, `createPlan`, `compileFlows`, recipe expansion, `planFlows`, `compileCanvas`, `planDesign`, `createCompositionIR`, `compileDesignCandidate`, `verifyFlowExport`, existing agent journals and native apply commands. Existing Flow/Dataverse executors still own target, source, ownership, collision, controlled-write, locking, pending-write and readback safeguards. No second payload compiler, arbitrary PAC runner or PowerCanvas MCP server was added.

A native-design validation integration bug was fixed: project validation now uses the existing V4 candidate validator for `nativeDesign`; it still rejects mixed native/legacy business screens. Legacy semantic `canvas compile` explicitly directs native-design callers to the native compiler instead of emitting an empty legacy app.

Authoring supports an explicit existing Project or structured entities/experiences/process intent. Process responsibility uses the existing advisor and configured recipe registry. Intent resolves into the existing Project schema. Arbitrary prose interpretation remains agent work, not an invented parser.

## Offline benchmark evidence

Generated artifacts: `output/solution-v1/benchmarks/`. Every benchmark has exactly one adaptive Canvas declaration, typed native fixture-host generation, a requirement/resource graph and zero remote mutations. Fixture hosts deliberately disable commit: these are compiler proofs, not deployed business applications.

| Benchmark | Requirements | Resource nodes | Tables / relationships | Flows | Taste archetype | Material limits |
| --- | ---: | ---: | --- | ---: | --- | --- |
| Leave Management | 4 | 14 | 1 / 0 | 1 | inbox-workspace | Approver/connection configuration, deployment and persona proof |
| Supplier Quote Management | 3 | 11 | 2 / 1 | 0 | operational-console | Live data bindings, native apply and record access proof |
| Document Approval | 5 | 16 | 1 / 0 | 1 | document-workspace | External library/template; newly generated DOCX-to-PDF explicitly blocked |
| Field Inspection | 4 | 12 | 2 / 1 | 0 | field-companion | Offline photo capture/storage/synchronization explicitly unsupported |

Nodes include configuration, external resources, security and unsupported requirements, not just tenant objects. Primary-name columns are included within native table resources. Approval plus notification expands through the existing typed recipe compiler. Quote and inspection saves stay in the Power Fx responsibility boundary; no gratuitous flows were added. Document and inspection cases retain unmet requirements rather than substitute weaker behavior.

All four are `PARTIALLY_IMPLEMENTABLE`: local schema/candidate/flow compilation is not target readiness. Three composition families and four archetypes are selected by existing Taste decisions. Desktop/tablet/mobile use the same app declaration. No production component certificates were created or promoted.

## Traceability and deployment

Examples in the generated plans:

```text
REQ-approval → flow:approval → connection:approvals
                            → connection:mail
                            → environment:approver
                            → external:approver
                            → solution → publisher

REQ-data → quotes → supplier lookup → suppliers
REQ-ui   → adaptive workspace → quotes
REQ-pdf  → external template/library + explicit unsupported conversion need
```

Resources expose logical and physical identities, typed references, requirement reasons, ownership and source hashes. The resource graph rejects missing dependencies and cycles, including existing child-flow checks. Proposed stages are DATA → CONFIGURATION → AUTOMATION → APPLICATION → BINDINGS → VALIDATION → ACTIVATION. The native Flow executor keeps configuration/automation ordering together; unified orchestration does not split its saved plan.

Apply is implemented for supported, fully resolved Dataverse and Flow/configuration plans. It first rebuilds the exact saved plan, verifies source/capability/environment/discovery/resource/configuration bindings, and obtains fresh native plans before the first mutation. Native executors repeat their checks. Canvas writes, binding writes, security grants and activation are not added to this unified adapter. Partial/unknown results stop and link native journal/ownership evidence; no automatic retry or rollback claim is made.

## Complaint Desk reference

The existing project was inspected read-only. A fresh discovery attempt stopped at `PF-AUTH-001` because the selected `experiment` authentication profile was unavailable. Authentication was not changed, and no Studio or authoring transport retry was attempted.

The report uses the retained Dataverse observation from **18 September 2026, 11:03:57 UTC**, associated ownership and existing native planner. Exact saved witness hashes were verified locally. These observations are historical, not fresh tenant claims.

| Scope | Result |
| --- | --- |
| Publisher, Complaint/Category tables, three ordinary columns, category relationship | 7 historical `NO_OP` nodes |
| Solution label/policy, out-of-scope model/security components, Canvas, flow/binding and publication | 16 `BLOCKED` nodes |
| Owned SLA column absent from this selected project specification | 1 retained `ORPHANED` node; no deletion |
| Canvas app | Existing ID `<identity-redacted>`; saved witness only |
| Automation Check | Existing ID `<identity-redacted>`; retained ownership evidence only |
| Saved native source | Hash `eca7c63eb8c199ef02c45f11a53e646478342b893948320eb6c32869e3b23432` still matches local source |

The solution display label differs from the historical state, so the existing Default-environment policy blocks an update. The model/security resources were not covered by the native Dataverse-only plan and remain blocked. No ownership was invented to turn these into no-ops. Full details are in `output/solution-v1/complaint-reference-report.json` and `complaint.plan.json`.

## Support and evidence matrix

| Capability | Schema / core | Offline proof | Unified apply adapter | Live proof this phase |
| --- | --- | --- | --- | --- |
| Structured intent → explicit project | Yes | Four benchmarks | Via resolved existing project | No |
| Canonical IR, types, traceability, graph | Yes | Semantic tests | Gates all adapters | No |
| Dataverse planning/ownership | Existing planner | Create/update/no-op/conflict/orphan tests | Existing `apply` | No |
| Canvas/Taste/Composition IR | Existing compilers | Four native fixture candidates | Separate authoring lifecycle required | No |
| Flow recipes/configuration | Existing compiler/planner | Recipe and stage integration tests | Existing `flows apply` | No |
| Stale-plan and partial-stage handling | Yes | Injected executor tests | Exact native plans, preflight and journals | No |
| Security/persona requirements | Yes | Explicit planned requirements | Manual/separate existing tooling | No |
| Checker | SARIF report normalization | Parser test | Service invocation stays with PAC | Not run |
| Platform dependency evidence | Normalized evidence comparison | Imported evidence contract | Automatic live collection pending | Not run |
| Export verification | Existing archive-index contract | Membership/flow verifier integration | No new export/import executor | No new export |
| Cross-environment readiness | Manifest with external boundaries | Explicit prerequisites | Import not implemented here | Not tested |

All new commands are classified: `solution plan` is LOCAL_WRITE; `inspect`, `graph`, `diff`, `critique`, `audit`, `verify-export` are READ_ONLY; `apply` is TENANT_WRITE with an exact saved plan. Root routing and plugin mirrors route broad business systems to core planning and preserve UI-only/flow-only specialist routes. Journals contain plan/project hashes, phase, blockers and mutation state without chain-of-thought or credentials.

## Validation

- `npm run check`: lint, strict TypeScript, build and **670 tests across 39 files passed**. The prior 606-test baseline remains green; 62 solution tests and two additional routing cases were added.
- Semantic tests cover intent decomposition, unsupported needs, existing compilers, typed references, dependency order/cycles, maturity, all four ownership classes, native plan states, drift, zero-execution gates, Flow current values, partial stages, external boundaries, CLI artifacts and routing.
- Four benchmark plans generated with existing native candidate compilers. Native UI runtime and visual regression were not claimed from these offline fixtures.
- `npm run agent:eval`: **20 routing cases and 4 result-interpretation cases passed**; five-skill plugin mirror verified.
- Real CLI smoke run saved a plan/resolved project/manifest/journal and successfully inspected its graph, deterministic audit, critique and self-diff. It made zero remote calls.
- Updated root skill passed the skill-creator validator.

## Exact tenant mutation report

| Mutation | Count |
| --- | ---: |
| Flows created / updated / deleted / activated | 0 / 0 / 0 / 0 |
| Approvals created / emails sent | 0 / 0 |
| SharePoint items created / updated / deleted | 0 / 0 / 0 |
| SharePoint files created / updated / deleted | 0 / 0 / 0 |
| Documents generated / PDFs generated | 0 / 0 |
| Dataverse rows created / updated / deleted | 0 / 0 / 0 |
| Dataverse tables / columns / relationships created or changed | 0 / 0 / 0 |
| Canvas apps created / updated / saved / published | 0 / 0 / 0 / 0 |
| Model-driven apps / roles / permissions changed | 0 / 0 / 0 |
| Connection references created / changed | 0 / 0 |
| Environment variables created / changed | 0 / 0 |
| Solutions created / imported / published | 0 / 0 / 0 |
| Environments, sites or libraries created | 0 |

Local source code, schemas, fixtures, documentation, ignored output plans and agent journals were written. No commit, push, plugin installation or account configuration change was performed.

## Remaining boundaries

V1 is a bounded orchestration layer, not complete Power Platform provisioning. Production readiness remains unproven. Native Canvas apply requires the existing recovery/source/certification workflow; model/security execution remains gated by its native experimental scope. Unsupported types/alternate keys, SharePoint provisioning, offline media, generated-file PDF identity, external assets and persona/run-only proof remain explicit. Checker execution, authenticated archive provenance/full component verification, live platform dependency collection and cross-environment import are pending. The support matrix intentionally does not turn schema/compile success into live certification.
