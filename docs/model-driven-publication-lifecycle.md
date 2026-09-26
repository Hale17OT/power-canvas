# Model-driven publication and access

App creation and deployment are separate lifecycle boundaries. PowerCanvas observes `PUBLISHED` only from the published AppModule surface with verified identity; an app found only through unpublished retrieval is `DRAFT_UNPUBLISHED`. An intersect row's component state does not establish AppModule publication.

Microsoft's [documented sequence](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/create-manage-model-driven-apps-using-code) places validation and publication before role association. PowerCanvas uses that sequence. No supported unpublished association mutation route has been established. The [AppModuleRoles reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/appmoduleroles?view=dataverse-latest) supports collection retrieval only. Its FetchXML evidence can identify associations and component layers, but cannot authorize mutation or prove published access.

App access depends on the AppModule, configured roles/privileges, and an explicit `appPublication` prerequisite in Solution IR. The prerequisite is not another certification logical root.

- `manual`: publication is not inserted, even with the older generic publication flag. Unsatisfied access is retained as `DEFERRED_REQUIRES_PUBLICATION` and removed from executable operations. It is not unsupported, satisfied, or forgotten.
- `afterValidation`: the planner produces `publishModelApp`, then access association. Publication carries mutable risk and `USER_VISIBILITY_CHANGE`; its XML contains exactly one AppModule GUID. The provider validates, publishes, checks the published identity, and only then permits access. Broader metadata publication remains a separate operation, never hidden in this action.
- Already published apps may plan access without another publication when their app/component definitions are unchanged.

A draft-only plan with no executable changes can report `PROVIDER_CONVERGED_WITH_DEFERRED_PUBLICATION`. Deferred requirements cannot satisfy full semantic NO_OP certification. Source-bound certification manifests retain those requirements and bind the reduced executable set; existing closed receipt/revision gates remain. This does not authorize a new continuation, publication, or access write.

## Validation

The shared ValidateApp policy retains the full response:

| Response | Result |
| --- | --- |
| Success true, no issues | PASS |
| Success true, warnings only | PASS_WITH_WARNINGS |
| Success false or any Error | APP_VALIDATION_ERROR; block |
| Unknown or malformed severity/response | VALIDATION_UNRECOGNIZED; block |

Warnings stay in evidence, native plans, unified audit issues and reports. Warning suppression or invented forms/views are not remediation. Publication and certification execution use the same policy.

## Read and execution safety

A published association 404 paired with independent verification of the same stable app solely in unpublished state is `APP_NOT_PUBLISHED`. Do not recreate the app, change authentication, adopt resources, or retry writes. Planned deferral prevents that premature request; the access provider and pre-write attestation also guard publication. Other 404s and failed reads are not generalized into this diagnosis.

GET retries remain unchanged. Writes retain the journaled, nontransactional executor and never inherit automatic read retries. Scoped publication implementation has offline provider tests; that is not live publication proof.

## Acceptance boundary

Draft provider convergence proves the created resources and their defining metadata, not deployment or user access. Publication, role association, export, Checker, licensing and persona runtime retain separate evidence dimensions. A future continuation must independently authorize the exact app-only publication and role association, validate again, verify both, discover independently and reach full NO_OP. Associating a role does not assign it to humans or teams.

The operator may accept the draft provider boundary or request separate deployment certification. Neither choice is inferred from successful planning.
