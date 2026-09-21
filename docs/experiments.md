# Experiment protocols

## Experiment 1: exact implementation slice

Status: bounded live sequence passed; see [the live report](../experiments/dataverse-generation/report-2026-09-17.md). Use the complaint-derived isolated experiment project and compiled CLI. A local fixture is not a tenant result.

The current template also contains future app/role intent. For Experiment 1, create an explicit schema-only test project from that template by omitting its optional `apps` and `security` sections; record that scope in the experiment evidence. Do not silently ignore unavailable resources during planning. Restore those sections for Experiment 2 after the schema gate passes.

1. Resolve approved developer/sandbox target (or the specifically authorized isolated Default experiment) and authenticated tenant, environment, organization and Dataverse URL; verify required customization privileges and absence of managed/protected write restrictions. Record versions and manual prerequisites.
2. Read publisher, solution, custom table/attribute/relationship metadata and solution membership through documented Dataverse Web API contracts, following pagination. Normalize only supported fields and represent incomplete discovery as unknown.
3. Create the declared new publisher and unmanaged solution after checking unique-name collisions and ownership. Do not adopt an existing component merely because its name matches.
4. Plan Category and Complaint table creates with their primary name attributes embedded. Include explicit schema names, labels, plural labels, ownership and supported auditing properties.
5. Plan ordinary Description and Priority columns on Complaint. Priority values are 731420000/1/2; Normal is the default. Do not reorder/reallocate values on label changes.
6. Plan the Complaint → Category one-to-many relationship with owned lookup `category`, schema `pf_Category`, and explicit noncascading/restrict-delete behavior, after both tables exist. Use relationship APIs/eligibility checks; do not separately create the lookup column.
7. Attach created components to the intended solution using documented solution-aware creation/membership operations. Read membership to verify it. Publish only the affected customizations using the documented publish contract.
8. Persist operation intent/outcomes, requery actual metadata, verify each owned property and recorded GUID, then advance ownership. Record schema evidence separately from runtime CRUD/persona checks in Experiment 2.
9. Run a fresh plan: require a genuine semantic no-op. In a disposable developer/sandbox, label updates are a separate test; in Default they are blocked. Add Resolution Notes multiline column, plan one additive change, apply and verify another no-op.
10. Request Priority choice → text conversion, table ownership change, lookup retarget, and removal of a populated column. Assert a preflight block and zero remote writes.
11. Exercise manual drift, collision, stale/wrong-target and failure paths with synthetic local fixtures. Do not deliberately mutate or interrupt resources to provoke failures in Default. If a real request times out, stop, retain the unknown outcome and require explicit provenance confirmation before read-only recovery of that exact new creation.

Exit: supported API-only creation; stable identities/choices; real repeated no-op; safe additive change; pre-mutation destructive blocks; actionable partial-failure record; observed state rebuilt; no manual schema designer repairs. Store sanitized captured metadata only after actual tenant execution. Alternate keys are a separate later readiness test.

## Tenant verification boundary

Experiment 1 established its bounded metadata payloads/defaults, relationships, solution inclusion and repeated no-op behavior in one Default environment. It did not establish application-user authentication, other locales/environment types, all column variants, effective least-privilege CRUD, managed ALM or production behavior. Throttling and deliberately injected failure paths remain synthetic. No local test proves tenant behavior.

## Experiment 2 and ALM gate

Begin only after Experiment 1 passes. Create the standard app with Complaint Main Form, Active Complaints and Category views, Work navigation, AppModule/component associations and bounded Complaint Agent role. Use documented APIs and XML libraries for supported FormXml/FetchXML/LayoutXML/sitemap. The user revised this run to current-account runtime checks plus structural role/app-access checks because a second person is unavailable; see the [revised protocol](../experiments/model-driven-generation/README.md). Effective restricted/denied-user behavior remains unverified and must not be inferred from administrator success. Second run must be a no-op without designer repairs.

The 17 September live run **passed the revised current-account experiment**. The user approved the [bounded repair](../experiments/model-driven-generation/repair-proposal-2026-09-17.md), which removed only two mistaken app references and added the intended tables. Role association and scoped publication succeeded. A published Active-layer publisher discrepancy required strict normalization and read-only checkpoint recovery; the dedicated solution publisher and component membership remain verified. Both generated queries execute and validation has no issues. After Edge blocked the Dynamics callback, the user signed in to the authorized Playwright fallback. Navigation, generated forms/views, synthetic record create/edit/reopen, independent persisted-value checks and another no-op passed. Two synthetic records remain. The app's legacy-client warning, unknown source of nonstandard command labels, and deferred independent security personas are explicit limitations; see the [report](../experiments/model-driven-generation/report-2026-09-17.md).

In a separately approved disposable/UAT environment only, export one managed artifact with PAC, record source/tool/provider versions and SHA-256, import the same artifact to clean UAT targets with explicit settings, and repeat API/browser/persona verification. Import success is not app readiness.

## Canvas research

Keep in `experiments/canvas-authoring/`. Existing saved app, coauthoring, open Studio and prepared data sources are prerequisites. Test bounded UI intent through official live compile/sync, including save/reopen/manual edit preservation. Closing Studio must produce a prerequisite failure. No deprecated pack/unpack fallback and no headless claim.
