# V2 provider boundary: complete

**Dataverse / Model-Driven / Security Provider V2 — COMPLETE FOR COMPILER/PROVIDER SCOPE.**

The accepted boundary is a validated unpublished model-driven application. Its twenty owned certification roots converge to NO_OP; app access remains `DEFERRED_REQUIRES_PUBLICATION` under source `publishPolicy: manual`. There are no executable mutations, blockers, conflicts or unresolved outcomes. The existing assets are retained as provider regression fixtures. Publication is not required to close this engineering phase.

## Readiness dimensions

- **Provider convergence:** all roots are owned NO_OP or the one supported, source-derived V2 app-access publication deferral. The app must be independently observed as draft, its role/publication dependency chain explicit, and ValidateApp passing. Other blockers, conflicts, stale observations and unknown outcomes cannot qualify.
- **Deployment convergence:** additionally requires published apps, applied access, resolved environment configuration and completed deployment checks.
- **Production readiness:** additionally needs applicable persona authorization, licensing, human/team assignments, published runtime, managed import, cross-environment ALM and native Canvas authoring evidence. Neither of the preceding levels proves production readiness.

`solution inspect` and `solution audit` expose these under `readiness`. Other resource providers, including Canvas and Flow, keep their own current states. Deterministic audit reports a pending publication prerequisite for correctly deferred access. Qualitative critique can still question manual publication and the Category form/view warning.

## Evidence and capability registry

`src/providers/native-provider-evidence.ts` is a generated, sanitized projection of the accepted private evidence manifest. It contains only capability identities, tested contracts, proof/manifest hashes, verified dimensions and limits. `capabilities --json` exposes it through `nativeProviders`; the agent does not infer certification from skill prose.

Private immutable evidence is stored in `output/solution-v2/provider-certification/manifest.json`. Each proof references saved-byte hashes of its source-bound creation plan/journal, historical readback/recovery, ownership receipt, and fresh convergence plan. Environment and stable IDs remain there, outside public source. This closure manifest is not an ownership receipt or mutation authorization. Existing resource ownership remains unchanged.

Only the following bounded dimensions are promoted. Updates are not implicitly promoted by successful creates.

| Capability | Bounded proof |
| --- | --- |
| dataverse.choice.create | Global Picklist; three exact option numbers and canonical-name recovery |
| dataverse.table.create | Two user/team-owned tables and generated primary-name attributes |
| dataverse.column.create | Eight reviewed columns: text, memo, integer, decimal, boolean, date-only, user-local datetime, global choice |
| dataverse.key.create | One external-code alternate key, independently Active |
| dataverse.relationship.create | One many-to-one relationship, generated lookup and restricted cascades |
| dataverse.form.create | One bounded native main form |
| dataverse.view.create | One public typed FetchXML/LayoutXML view |
| modelDriven.navigation.create | One app-specific certification sitemap |
| modelDriven.app.create | One solution-owned Unified Interface draft AppModule |
| modelDriven.component.add | Five exact intended component associations |
| modelDriven.validate | Passing ValidateApp with retained warning |
| security.role.create | One root-business-unit role |
| security.privilege.configure | Exactly two Basic Read grants using stable metadata IDs |

The evidence comes from one isolated, non-disposable Default environment. It does not establish general UAT/production or managed ALM behavior. Publication, app-role association, runtime, revoke/depth reduction, user/team assignment, effective persona access, managed import and cross-environment ALM remain unproven. App access is supported with a published-AppModule prerequisite, not unsupported.

## Validation and packaging

ValidateApp false or any Error blocks. True with warnings passes with warnings; unknown/malformed severity fails closed. The accepted result is `PASS_WITH_WARNINGS` with zero errors and one retained warning:

> Provider certification category doesn’t reference a form or view. App users will see all forms and views.

No extra forms/views were created to hide this warning. The app remains unpublished.

[Microsoft documents that unmanaged exports contain only published components](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/export-solutions). Export/Checker therefore remain `DEFERRED_WITH_PUBLICATION_ALM` for this draft app. No export or Checker run was performed for closure, and prior published Dataverse package evidence does not prove this draft AppModule's package membership.

## Read-only regression

Use the existing CLI with the same configured environment/profile binding and a fresh private output directory:

```sh
powercanvas --project <bound-project> solution certification-plan --spec <reviewed-certification-fixture> --env <existing-binding> --out <fresh-private-output> --regression
```

This performs fresh GET-only discovery, checks source-bound ownership and strict defining metadata, inspects local journal outcomes, re-plans and enforces the exact accepted draft boundary. It fails if convergence differs. It never applies, recreates fixtures, publishes, changes authentication, exports or uploads to Checker. Ordinary plans remain the same native plans; the acceptance rule does not bypass an apply gate.

## Separate deployment track and next phase

V2 feature/certification work is closed at this boundary. Do not continue a V2.1 series merely to chase publication proof. A future, separately authorized deployment track can validate, publish only the intended app, verify publication, associate the intended role, verify access, test an explicitly authorized persona, and evaluate managed export/import. Role association itself does not assign a user or team.

The next major phase is **SharePoint Solution Provider**: existing-site bindings and first-class planning/provisioning for lists, document libraries, columns, content types, lookups, choice fields, folders, views, permission boundaries, Canvas/Flow bindings and external-resource lifecycle. It is recorded here only; no SharePoint provider or resources were implemented by V2 closure.
