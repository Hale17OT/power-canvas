# V2.1 resumed read-only preflight — 23 September 2026

**READ_ONLY_PREFLIGHT_COMPLETE_CERTIFICATION_BLOCKED**. No tenant mutation, authentication-profile change or capability promotion occurred. This is discovery and planning evidence, not provider certification. The earlier blocked V2.1 report and authentication-recovery evidence remain unchanged.

## Verified scope

The original `experiment-default` binding and named MSAL profile `experiment` passed fresh target/WhoAmI checks. PAC remained informational. The Default environment is non-disposable; English base language and all 25 privileges checked by the current preflight passed. The historical unmanaged solution and publisher/prefix match their stable ownership receipts.

Fresh native discovery covered Dataverse and model-driven resource kinds. The candidate preserves 22 existing resources with receipts as planning context and proposes 21 absent certification resources. No certification identity collision was observed. Aggregate resources such as app components and role permissions are included in those counts; they are not 21 independent platform object creations. Lookup and primary-name columns are created with their parent relationship/table operations.

The strict local candidate is documented in [the certification fixture](../examples/solution-v2-live-provider/README.md). The existing source and ownership receipts were checked again after planning and remained unchanged. No binding or protected authentication profile was copied into the candidate.

## Exact native plan

The final fresh evidence directory is `output/solution-v21/preflight-bb4b0d7f-466d-49e5-97f1-7bf90c6dc977/` (ignored). It contains:

- `authentication.json`, `permissions.json`, full normalized `observation.json`, unchanged `ownership.json`, and `solution-components-before.json`.
- `native-plan.json`: exact existing planner output, including ten blockers and all 22 proposed operations.
- `existing-source-native-plan.json`: current source planned against the same fresh observation, without adding certification resources.
- `data-stage-native-plan.json`: schema-only diagnostic plan, still blocked; not permission to bypass the full plan.
- `unified-plan.json`: existing unified compiler output using that exact native evidence, including static security audit and dependency graph.
- `resource-inventory.json`, `mutation-review.json`, `preflight-completed.json`, and an artifact hash index.

No plan operations were removed or rewritten. Offline replay verified the saved native operations, blockers and content hash. A fact journal under ignored `.powercanvas/agent/` records the stop boundary and hashed artifacts.

| Proposed native operation | Count | Scope/risk |
| --- | ---: | --- |
| Global choice creation | 1 | Certification; additive |
| Table creation, including primary names | 2 | Certification; additive |
| Additional column creation | 8 | Certification; additive |
| Alternate-key creation | 1 | Certification; additive; Active state unproven |
| Relationship/lookup creation | 1 | Certification; additive; restrictive cascade |
| Role creation | 1 | Certification; additive |
| Role privilege grant operation | 1 | Security write: probe Read Basic, category Read Global; no human assignment |
| Main-form creation | 1 | Certification; additive |
| Public-view creation | 1 | Certification; additive |
| Sitemap creation | 1 | Certification; additive |
| Model-driven app creation | 1 | Certification; additive; manual publication |
| App component membership operation | 1 | Certification; additive |
| App-role association operation | 1 | Certification; security write |
| Dataverse scoped publication | 1 | Mutable; includes historical tables and is out of scope |

These are proposed planner operations, not executed API requests. Provider execution can involve additional membership and readback requests. The exact identities, values, dependencies and before/after definitions are in the saved plan and mutation review.

## Policy and review blockers

The native policy is `Default / defaultExperiment / nonDisposable`, with unified model-driven planning enabled and model publication not requested. The whole plan is blocked; individually additive operations are not authorization to execute a subset.

1. **Solution display label:** live and receipt are `PowerForge Experiment`; desired source is `PowerCanvas Experiment`. This is an unapplied desired-source change, with no solution ownership drift. The Default update guard rejects it (`PF-SAFETY-005`), so no solution-update operation is scheduled.
2. **Schema evidence:** Experiment 1 evidence does not match the candidate schema (`PF-CAPABILITY-003`). Adding certification resources does not permit replacing or forging this evidence.
3. **Other existing source differences:** role, category-form and view label changes are blocked by the Default update guard. Historical JavaScript web-resource identity/content and command identity/function changes are outside the update allowlist (`PF-SAFETY-001`). None are certification targets.
4. **Existing main-form observation:** normalized `reveal` is `null`, while the receipt contains the historical PowerForge reveal library/namespace (`PF-PLAN-007`). This is a baseline mismatch reported by the current observer, not proof of who changed anything remotely. Its cause requires separate diagnosis; no form, source baseline or receipt was repaired or adopted here.
5. **Publication scope:** the native publish operation includes `pfx_experimentcategory` and `pfx_experimentcomplaint` alongside the two proposed certification tables and global choice. Publishing historical Complaint metadata is outside the request. This additional scope blocker is recorded even though the native planner emits the operation.

The native planner reports ten blockers in total. Source-only branding differences are kept separate from the normalized main-form baseline mismatch. The static security audit records zero human assignments and unproven production readiness; its existing Complaint-role warning is retained, not suppressed.

## Discovery bug corrected

The first new attempt stopped at `PF-DV-003`. A bounded read confirmed that an existing table's optional Description was `{ LocalizedLabels: [], UserLocalizedLabel: null }`, while its display labels contained English. The normalizer had incorrectly required English text in that empty optional field.

The fix maps only this observed empty optional description to an empty string. Required display labels, nonempty non-English descriptions and ambiguous label objects still block. A regression test covers all those cases. No general ignore-drift rule or policy exception was added. The failed attempt remains in `output/solution-v21/preflight-f9b37de6-a1e1-428d-b53b-608e86b5cacc/`.

The second attempt successfully saved discovery and native/unified plans. Its final report writer initially rejected a credential-shaped field name containing a nonsecret status. The completed report uses a different field name, preserves the failed report, and replays the unchanged plan offline; no tenant retry was needed for that local reporting correction.

Validation: `npm run check` passed lint, type checking, build and **729 tests**, with **7 skipped**. No agent/skill architecture was changed. The fixture passed strict schema, semantic and experiment-isolation validation.

## Stop state and mutation report

Actual tables/columns/choices/choice options/relationships/keys/views/forms/apps/navigation/roles created or updated: **0 each**. Privilege grants/revokes, app-role associations/removals and user/team assignments: **0 each**. Publication, exports, Checker uploads, business-row creation/update/deletion, Canvas changes, flow changes/runs and authentication-profile changes: **0 each**.

Create/update/readback/no-op convergence, key Active state, certification app ValidateApp, certification-component platform dependencies, export verification, Checker results and runtime/persona/licensing remain **unproven**. These later stages were not run after planning blockers. No capability maturity was promoted.

The next gate is review and resolution of the concrete source, ownership, schema-evidence and publication-scope blockers. Any subsequent apply needs a fresh exact plan and explicit authorization; approval cannot override Default-environment policy. This preflight stops here.
