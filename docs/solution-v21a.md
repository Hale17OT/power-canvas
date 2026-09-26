# V2.1a — certification scope isolation

**CERTIFICATION PLAN READY FOR REVIEW.** The native and unified plans contain only the certification subtree and two verified existing dependencies. No tenant writes occurred. This verdict is planning evidence, not provider certification or permission to apply.

## Architecture and command

```text
powercanvas --project examples/default-environment-experiment --json 
  solution certification-plan
  --spec examples/solution-v2-live-provider/certification.json
  --env experiment-default
  --out output/solution-v21a/<fresh-directory>
```

This command uses the existing binding and named MSAL profile. It reads the original project only for target, full receipts and historical discovery context. A GET-only transport boundary protects all subsequent provider reads. No profiles, environment bindings, receipts or original desired source are copied or changed. The output directory must not already exist.

The minimal fixture compiles through the same `createPlan` and unified compiler. A strict `PROVIDER_CERTIFICATION` manifest binds the canonical fixture/project hashes, target, stable solution/publisher IDs and receipt hashes, namespace, requirement-linked resource definitions/dependencies, allowed action categories and empty expected publication scope. Its evidence state is **ATTEMPT_INTENT_ONLY**. Historical Experiment 1 evidence remains attached to its original schema hash; it is neither rewritten nor accepted as proof of the new fixture.

Global `defaultExperiment` behavior is unchanged. The additional planning class validates only the exact manifest, additive roots and verified dependencies. It rejects Canvas/Flow resources, commands/web resources, arbitrary historical updates, deletes, business data, broad privileges, source/target mismatch, collisions, omitted owned certification resources and manifest tampering. A missing graph dependency or drift in a required dependency blocks the plan.

V2.1a intentionally has **no certification apply entry point**. Both existing native and unified executors reject certification manifests before mutation. Capability output retains `deploy: false`, `runtime: false` and `production: false` for this review-only route. A future separately authorized execution task must implement/review that boundary and refresh expired observations/plans; no plan hash is permanent authorization.

## Historical context classification

All 22 historical resource nodes were reviewed:

| Classification | Count |
| --- | ---: |
| REQUIRED_EXISTING_DEPENDENCY | 2 |
| CONTEXT_ONLY | 12 |
| OUT_OF_SCOPE_DRIFT / source difference | 8 |

The dependencies are the existing `pfx_PowerForgeExperiment` solution and `PowerForgeExperimentPublisher`/`pfx` publisher. The explicit bound solution has `displayNamePolicy: preserveExisting`. Source still says **PowerCanvas Experiment**, while live and receipt remain **PowerForge Experiment**. Stable identity, unmanaged status, publisher and all owned baseline properties must match; only this bound container's desired friendly name is preserved. No solution update is generated. New resources retain PowerCanvas branding.

Twenty historical nodes were removed from certification desired state; all remain observed context. Exact native paths (after provider/kind) are:

| Historical resource | Path | Classification |
| --- | --- | --- |
| Table | `category` | CONTEXT_ONLY |
| Table | `complaint` | CONTEXT_ONLY |
| Column | `complaint/description` | CONTEXT_ONLY |
| Column | `complaint/priority` | CONTEXT_ONLY |
| Column | `complaint/resolutionNotes` | CONTEXT_ONLY |
| Column | `complaint/slaState` | CONTEXT_ONLY |
| Relationship | `complaintCategory` | CONTEXT_ONLY |
| Role | `complaintAgent` | OUT_OF_SCOPE_DRIFT: source label difference |
| Role permissions | `complaintAgent` | CONTEXT_ONLY |
| Form | `complaintDesk/categoryMain` | OUT_OF_SCOPE_DRIFT: source label difference |
| Web resource | `complaintDesk/complaintMain` | OUT_OF_SCOPE_DRIFT: source identity/content difference |
| Form | `complaintDesk/complaintMain` | OUT_OF_SCOPE_DRIFT: normalized reveal mismatch and source label difference |
| View | `complaintDesk/activeComplaints` | OUT_OF_SCOPE_DRIFT: source label difference |
| View | `complaintDesk/categories` | OUT_OF_SCOPE_DRIFT: source label difference |
| Sitemap | `complaintDesk` | CONTEXT_ONLY |
| Model app | `complaintDesk` | CONTEXT_ONLY |
| Command | `complaintDesk/generatedDetails` | OUT_OF_SCOPE_DRIFT: source identity/function difference |
| Command | `complaintDesk/generatedDetailsBound` | OUT_OF_SCOPE_DRIFT: source identity/function difference |
| App components | `complaintDesk` | CONTEXT_ONLY |
| App-role access | `complaintDesk` | CONTEXT_ONLY |

The report separates source differences from receipt baseline differences. The main form still normalizes to `reveal: null`, versus the historical reveal library/namespace in its receipt. This is unresolved diagnostic evidence, not adoption, repair or proof of an unauthorized remote edit. There is no dependency edge from the certification subtree to that form. A synthetic test proves that drift does block when the historical component is an actual required dependency.

## Exact certification desired resources

There are 21 logical desired nodes and 21 proposed planner operations:

| Kind/action | Exact identity |
| --- | --- |
| Global choice | `pfx_ExperimentCertificationState` |
| Category table | `pfx_ExperimentCertificationCategory` |
| Probe table | `pfx_ExperimentCertificationProbe` |
| Decimal column | `pfx_ExperimentCertificationAmount` |
| Integer column | `pfx_ExperimentCertificationCount` |
| Date-only column | `pfx_ExperimentCertificationDate` |
| Boolean column | `pfx_ExperimentCertificationEnabled` |
| Text column | `pfx_ExperimentCertificationExternalCode` |
| Memo column | `pfx_ExperimentCertificationNotes` |
| User-local datetime column | `pfx_ExperimentCertificationOccurredAt` |
| Global-choice column on Probe | `pfx_ExperimentCertificationState` |
| Alternate key | `pfx_ExperimentCertificationExternalCodeKey` |
| Relationship | `pfx_ExperimentCertificationCategoryProbe` |
| Role | `PowerCanvas Experiment Certification Reader` |
| Privilege aggregate | `rolePermissions:certificationReader` |
| Main form | `PowerCanvas Experiment Certification Main` |
| Public view | `PowerCanvas Experiment Certification Active` |
| Sitemap | `pfx_ExperimentCertificationNav` |
| Model app | `pfx_ExperimentCertification` |
| Component aggregate | `appComponents:certification` |
| App-role aggregate | `appAccess:certification` |

The table operations include primary-name columns `pfx_ExperimentCertificationName` and `pfx_ExperimentCertificationCategoryName`. The relationship includes lookup `pfx_ExperimentCertificationCategoryLookup`, with restrictive delete and no cascading assign/share/unshare/reparent/merge. These are not extra planner operations. The global choice retains numeric values Draft `731420100`, Active `731420101`, Closed `731420102`. All roots carry requirement traceability and deterministic dependencies.

The fixture now makes both tables user/team-owned. Proposed role privileges are exactly Probe Read **Basic** and Category Read **Basic**. Global access is unnecessary. Role creation, privilege addition and app-role association are three `securityWrite` operations. No user/team assignment exists. These logical operation counts are not claimed API-request counts; provider execution can involve membership calls and readback. Actual mutation requests in V2.1a: zero.

## Publication

Calculated PublishScope is **empty**. No historical or certification table, choice, form, sitemap or app is published by this plan. The model app retains manual publication.

Microsoft documents automatic publication for newly created customizations and publication requirements for UI-affecting updates. The create-only certification path therefore emits no automatic PublishXml. The existing non-certification path remains unchanged. The scope helper traces UI updates to affected components and explicit app publication to the app; an audit rejects resources outside the dependency closure or without a requiring operation. Tests cover a certification form update, app-only publication and injected historical publication. This scope calculation does not authorize updates in the create-only certification policy. [Microsoft publication guidance](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/publish-customizations).

## Validation and evidence

Fresh GET-only target/permission/Dataverse/model discovery and exact native/unified planning were performed. Zero certification-name collisions were found. Both plans have zero blockers. The full receipts were retained, and the original source and receipts were checked unchanged after planning.

The final ignored evidence directory is `output/solution-v21a/review-final-20260923/`. It contains `target.json`, `permissions.json`, `observation.json`, `ownership.json`, `fixture.json`, `manifest.json`, `native.json`, `unified.json`, `historical.json`, `summary.json`, `read-only-audit.json` and a SHA-256 artifact index. Earlier preflight and authentication-recovery evidence remains historical and unchanged.

Native plan content hash: `ff9731e6edfd40caaf793ba7594f1a8aacc286508cab45db4cc0a8933534cf5f`. Unified plan content hash: `c72f9433607c0354ff292347888cec70dd588f722974851f234992d49266764e`. These plans expire at **2026-09-23 12:47:34.571 UTC** and must be reacquired/replanned after expiry.

The optional-description normalizer fix remains narrowly scoped and its strict-label tests still pass. The evidence writer now accepts only four enumerated nonsecret values under the exact `authorization` field (`NOT_REQUESTED`, `REQUIRED`, `PENDING_REVIEW`, `DENIED`); arbitrary strings, objects, bearer credentials and all other sensitive fields still fail closed. Agent interpretation routes certification blockers to planning/scope diagnosis, never automatic apply retries. No skill architecture or capability maturity was changed.

Validation: **753 tests passed, 7 skipped**; lint, type checking and build passed. Agent evaluation passed **25 routing cases and 4 interpretation cases**, with all **24 packaged skill files** verified. The 24 new certification tests use synthetic metadata; they do not mutate a tenant.

## Actual mutation report and verdict

Tables, columns, choices/options, relationships, keys, views, forms, sitemaps, model apps, roles, privileges, app-role associations, business rows, Canvas apps, flows, authentication profiles and bindings changed: **0 each**. PublishXml, model publication, user/team assignment, exports, Checker uploads and destructive operations: **0 each**. Existing source and ownership receipt edits: **0**. Capability promotions: **0**.

**CERTIFICATION PLAN READY FOR REVIEW.** Stop here. Apply/readback/no-op convergence, export, Checker and runtime/persona access remain unproven.
