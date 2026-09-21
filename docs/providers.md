# Providers and capabilities

`src/providers/contracts.ts` defines typed domain-operation lifecycle contracts without a generic create/update/delete API. The coordinator supplies an immutable verified target, credential broker, cancellation signal and journal context. Discovery/observe results explicitly declare coverage. Missing metadata is unknown unless the adapter proves absence.

Lifecycle: discover → validate capabilities/prerequisites → plan from desired/observed/ownership → apply a reviewed operation → observe and verify. Provider results distinguish available, unsupported, preview, experimental and manual-prerequisite outcomes. A successful HTTP response alone is not verified completion.

The capability registry separates:

- `support`: supported, preview, constrained, semi-supported, unsupported.
- `provenance`: Microsoft or community; this is independent of support.
- `implementation`: implemented, planned, experimental, unavailable.
- Requirements, evidence URL and provider version.

Local validation is implemented; Dataverse schema operations have bounded live Experiment 1 evidence. Model-driven generation and bounded role grants have experimental adapters gated by recorded Experiment 1 evidence. Managed ALM remains planned; Canvas live authoring is experimental/constrained, offline compilation is unavailable/unsupported. No catalog entry alone certifies tenant or runtime readiness.

## Service routing and planned extensions

| Operation | Interface | Reason |
|---|---|---|
| Table, attribute, relationship metadata reads/creates and supported updates | Dataverse Web API v9.2 adapter | Public typed metadata contracts, direct Node HTTPS |
| Publisher, unmanaged solution, membership and publishing | Dataverse Web API | Solution-aware development writes; verify component membership |
| Identity/organization verification | Dataverse WhoAmI plus documented environment discovery | Bind identity, organization, environment and tenant together |
| AppModule, forms, views, sitemap, roles/privileges | Documented Dataverse APIs; supported XML via an XML library | No arbitrary internal solution XML rewriting |
| Token acquisition | Microsoft MSAL Node plus protected persistence extension | Correct audience and tenant; no PAC cache access |
| Environment discovery | Documented Global Discovery v2.0 Instances | Immutable tenant/environment/organization/API URL; authenticated WhoAmI cross-check |
| Export/import/checker | Versioned PAC process adapter | Argument arrays, explicit executable/version/target, timeouts and sanitized results |
| SDK-heavy functionality/Power Fx | Deferred .NET SDK worker | Introduce only when a proven need warrants another runtime |

The linked [table API](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api), [relationship API](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-relationships-using-web-api), and [model-driven API](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/create-manage-model-driven-apps-using-code) are the research's implementation baseline. Recheck exact payloads and versions when implementing each adapter.

Provider contracts do not load arbitrary third-party code or expose unrestricted URL/method requests to future AI. The model-driven adapter emits a fixed standard FormXML/FetchXML/LayoutXML/SiteMap subset; existing components are never adopted and XML is not patched in place. It captures create receipt GUIDs, reobserves published/unpublished components, verifies solution membership, validates apps and checks published metadata after scoped PublishXml.

New roles carry nine Microsoft-created default privileges. Discovery verifies their exact names and Global depths separately as `platformDefaultGrants`; the owned `grants` projection contains the explicitly requested table rights. Missing/changed defaults stop discovery; any other unexpected grant remains in the owned projection and blocks verification. This is structural verification, not effective-access proof. See the [Microsoft sample](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/web-api-functions-actions-sample#section-8-bound-action-addprivilegesrole) and Experiment 2 report.

Live creation retained local service unique names for both sitemap and app module. PowerCanvas separately records the actual `serviceUniqueName`. Sitemap identity requires its qualified display name and `isappaware`; new app identity requires the verified dedicated publisher GUID and a matching local or qualified name. After publication this tenant exposes the shared unmanaged Active layer's publisher on the app row. That exception requires an already verified exact app ID, dedicated solution membership, published/unmanaged state and a separately queried Active solution with the exact observed publisher. `servicePublisherId`, `publisherSource` and `solutionPublisherUniqueName` retain the distinction. Unknown apps or other mismatches still fail; no remote publisher is changed or silently relabeled. The normalized prefix is never presented as raw metadata. Published sitemap discovery uses separate equality queries because OR identity filters failed in the live tenant. Both qualified and local names are checked for collisions; no failed query is treated as absence.

New apps in this tenant automatically associate the root System Administrator and System Customizer roles. Their [standard role-template GUIDs](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/security-roles) identify these defaults; display labels alone cannot qualify an arbitrary role. The provider requires both, retains them as `platformDefaultRoles`, and exposes any additional unknown role in the compared access set. It only adds the requested experiment role and never assigns roles to users. Administrative/maker visibility is broader than app-role membership; see [Microsoft's app visibility rules](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/app-visibility-privileges).
