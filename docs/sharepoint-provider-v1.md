# SharePoint Solution Provider V1

SharePoint metadata is compiled into the existing Unified Solution IR. This release implements offline schema, compilation, planning, discovery contracts and bounded execution adapters. It does **not** establish live provisioning, runtime access or production readiness. There is no SharePoint tenant-write route in the CLI in V1.

## Architecture and provider selection

`solutionSpecSchema` → existing intent/explicit resolver → SharePoint typed definitions → existing ResourceIR, dependency ordering, ownership comparison and saved-plan validation. Canvas and Flow compilation consume the same identity/field contract. There is no alternate project format or generic JSON payload escape hatch.

| Resource | Selected API | Reason |
| --- | --- | --- |
| Existing site binding | Graph v1.0 | Exact configured URL lookup and stable site identity |
| List / document library | Graph v1.0 | Typed list metadata; library additionally resolves its drive |
| List columns / site columns | Graph v1.0 | Typed columnDefinition facets |
| Choice, lookup, person/group | Graph v1.0 | Dedicated facets, never generic string substitutions |
| Site content type / site-column links | Graph v1.0 | Explicit parent and source-column contracts |
| List/library content-type attachment | Graph v1.0 | `contentTypes/addCopy` |
| Folder | Graph v1.0 | DriveItem folder, explicit parent and conflict strategy `fail` |
| Public view | SharePoint REST | Typed ordered fields/CAML and bounded view configuration |
| Classic permission observation | SharePoint REST | Inheritance and role assignments are SharePoint security concepts |
| Site creation / permission writes | Not implemented | Deliberately blocked |

Selection is deterministic, recorded in capabilities, and never falls back following a failed write. Source references: Microsoft [list creation](https://learn.microsoft.com/en-us/graph/api/list-create?view=graph-rest-1.0), [column definitions](https://learn.microsoft.com/en-us/graph/api/resources/columndefinition?view=graph-rest-1.0), [site columns](https://learn.microsoft.com/en-us/graph/api/site-post-columns?view=graph-rest-1.0), [content types](https://learn.microsoft.com/en-us/graph/api/site-post-contenttypes?view=graph-rest-1.0), [column links](https://learn.microsoft.com/en-us/graph/api/contenttype-post-columns?view=graph-rest-1.0), [content-type attachment](https://learn.microsoft.com/en-us/graph/api/contenttype-addcopy?view=graph-rest-1.0), [folders](https://learn.microsoft.com/en-us/graph/api/driveitem-post-children?view=graph-rest-1.0), and [classic permissions](https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins/set-custom-permissions-on-a-list-by-using-the-rest-interface). The REST view adapter follows the primary [PnP implementation](https://github.com/pnp/pnpjs/blob/version-4/packages/sp/views/types.ts); its contract remains experimental until live verification.

## Source, sites and stable identity

The optional `sharepoint` section supports `sites`, `lists`, `libraries`, `columns`, `contentTypes`, `contentTypeBindings`, `views`, `folders`, `permissions` and `bindings`. Both solution modes use this schema. Generated JSON schemas cover source, target configuration and observation/ownership evidence. See the three complete examples in `examples/solutions/sharepoint-v1/`.

Sites reference configuration keys, not hardcoded tenant URLs. Explicit target configuration supplies tenant ID, environment label, site URL and optionally expected stable site ID. Read-only discovery resolves and checks hostname, path, composite Graph site ID, siteCollection GUID and web GUID. Only configured commercial SharePoint sites are accepted. Root web/site identity is not interchangeable with a display name.

Lists/libraries may explicitly bind existing stable IDs. Such bindings are read-only dependencies, not ownership adoption. A same-name unowned resource is a conflict. Missing owned resources block replacement. Receipts bind project, target hash, stable ID, parent/site, source hash, operation, revision, baseline, ETag and readback hash. Duplicate ownership identities are rejected.

## Typed metadata

Lists emit `list.template: genericList`; libraries emit `documentLibrary`. A library's list ID and drive ID are different identities; readback verifies `drive.sharepointIds.listId` before permitting convergence. Documents are not provisioned with infrastructure.

Columns distinguish internal `name` from mutable display labels. V1 compiles text, multiline text, number, currency, Boolean, date, datetime, choice, multichoice, lookup, person, multiperson and hyperlink facets. One facet is emitted per column. Required/indexed/unique flags are explicit. Choice ordering is preserved; duplicate values are rejected. Changes are classified as add, remove, reorder or rename/replace, but choice updates remain blocked in V1.

Lookup references add source list/source column and target dependencies. Cross-site lookups and absent source columns are rejected. Person/group columns expose `peopleOnly` versus `peopleAndGroups` and multiplicity, without resolving display names or inventing users. Complex person/lookup values remain object/array Flow contracts. Person subfields are intentionally opaque until operation-specific connector metadata is supplied; the compiler does not assume lookup Id/Value semantics for people. Canvas complex-field rendering is subject to its existing bounded field capabilities.

`Title`, `ID`, `Created`, `Modified`, `Author` and `Editor` are platform fields; they are not created or adopted. Title's default use is supported. Alternate Title modes are represented but blocked until their provider behavior is verified.

Content types depend on independently observed built-in Item/Document parents or a declared custom parent. Site columns are separate resources. Each site-column link is a graph root; attachment waits for those links and verifies source identity. Propagation updates are blocked. Public views accept typed fields, comparisons, sorting and bounded row limits, compile XML with escaping, and compare normalized query structure plus ordered field identities. Raw CAML is not accepted as source.

Folders are optional explicit library resources. Nested paths require explicit parent folders. Empty/traversal/encoded/separator-ambiguous paths are rejected. Discovery fetches only the exact declared folder metadata, never enumerates business documents. Creates fail on collisions; no rename, overwrite, move or delete strategy is hidden in the adapter.

## Planning, execution and ownership

SharePoint participates in the existing unified DAG, audit, traceability, manifest, critique, capability fingerprint and source/evidence-bound plan hashing. Desired/baseline/observed comparison shares the same helper as Dataverse. Platform extras are projected narrowly, while missing type facets cannot produce false `NO_OP`.

An observation must be complete, scoped, target-matched, covered and fresh (one hour, with bounded clock skew). REST health is independent of Graph health. Collisions, missing dependencies, unowned changes, stale evidence and owned drift block. Allowlisted list/library/local-column label or description updates require an exact ETag. Site-column updates, type conversions, lookup changes, permission changes and deletion are blocked. Orphans are retained.

The internal execution adapter is tested through injected ports. Before dispatch it acquires a lock, rediscovers, validates the existing unified plan and requires a short-lived authorization bound to exact plan hash, target hash and changed resource set. It follows the unified dependency order, journals before mutation, reads back defining metadata and records source-bound receipts before dependent work. REST view creation needs a second configuration request; planner roots are not HTTP request counts.

Writes have no automatic retry. An uncertain write or failed post-write verification seals the journal, stops dependent work and performs read-only reconciliation. No rollback or exactly-once claim is made. A successful adapter result still requires independent fresh discovery and a new `NO_OP` plan. V1's offline test demonstrates this lifecycle with synthetic ports, not tenant evidence. A production port must supply durable locking, saved-byte journal sealing and receipt persistence; the CLI intentionally supplies no SharePoint mutation ports.

## Authentication and permissions

Credentials are injected and ephemeral. Graph uses audience `https://graph.microsoft.com`; REST uses the configured SharePoint origin. Tenant, audience, expiry and required scopes are checked before dispatch. No token is logged, no auth profile is created/selected/rebound, and no automatic consent occurs. Read-only transport is the default. Graph metadata reads request Sites.Read.All; metadata writes request Sites.Manage.All; folder writes request delegated Files.ReadWrite (application deployments require the corresponding Files.ReadWrite.All configuration). REST uses AllSites.Read, AllSites.Manage or, for role-assignment observation, AllSites.FullControl. These contracts are not proof the operator has the necessary business authorization.

GET retries reuse the existing transient classification with bounded attempts and Retry-After waits. POST/PATCH do not inherit that policy. Redirects and unbound sites/drives are refused. Metadata pagination is bounded and must complete; errors are not converted into absence. Business item/file reads are outside discovery. Sovereign clouds, selected-resource grant negotiation and a live credential adapter remain future work.

Classic role assignments are distinct from Graph application permissions. Inherited boundaries can be observed; unique inheritance and requested assignments are visible high-risk blocked operations. No role, human, team or group assignment is implemented. Effective access, persona behavior and licensing remain unproven.

## Canvas, Flow and ALM integration

Canvas `bindings.canvas` connects an app/source alias to `sharepoint.list:key` or `sharepoint.library:key`. Compilation preserves exact SharePoint internal field names and rejects ambiguous Dataverse/source aliases. Native data-source registration, delegation at runtime and end-user access are not certified.

Flow's typed `sharepointResource` expression references the same resource with `siteUrl`, `listId` or `driveId`. Unified compilation resolves it from target evidence and derives connector metadata from the same columns. Missing identities remain explicit compilation blockers; direct primitive compilation cannot bypass this step. Conflicting site/list references and duplicate metadata authorities fail. Existing Flow action policy, typing and activation gates remain authoritative. Neither mechanism executes business actions during provisioning.

SharePoint entries are `EXTERNAL_DEPLOYMENT_RESOURCE` in deployment manifests. They are excluded from Dataverse solution ZIP contents. Cross-environment resolution requires new target configuration, observed identities and ownership evidence; a Dataverse import does not provision external infrastructure.

## Architecture advice and benchmarks

Critique favors SharePoint for document collaboration and bounded simple trackers, and Dataverse for complex relational models, row security and transactional requirements. It surfaces lookup chains, content-type propagation, folder complexity, granular permissions and external-dependency questions. Advice does not silently migrate storage or grant authorization.

`npm run solution:sharepoint` writes fresh offline plans, deployment manifests and critiques for:

1. **Document approval:** library, site status column, content type/attachment, explicit folders, approval and notification composition. The generated DOCX-to-PDF requirement remains an explicit unsupported need.
2. **Team request tracker:** intent-generated lists, status/person/lookup columns, typed view, a Canvas master-detail source and bounded Flow read/notification references.
3. **Contract library:** suppliers list, contract library, site metadata, content-type column links/attachment, typed view and archive folder.

Graphs differ structurally and preserve their own constraints. Synthetic examples do not identify a real tenant or authorize provisioning.

## Support matrix

“Adapter” means offline-tested code, not deploy certification. No row below has live deployment, live readback, runtime or production evidence.

| Capability | Schema | Compile/plan | Adapter | Live/runtime |
| --- | --- | --- | --- | --- |
| Existing site binding | Yes | Yes | Read-only | Not run |
| Site creation | Rejected | Blocked | No | No |
| Lists | Yes | Yes | Experimental | Not run |
| Libraries / dual identities | Yes | Yes | Experimental | Not run |
| Columns / site columns | Yes | Yes | Experimental | Not run |
| Choices / multichoices | Yes | Yes; updates blocked | Create | Not run |
| Lookups | Yes | Same-site only | Create | Not run |
| Person/group | Yes | Yes | Create | Not run |
| Content types | Yes | Yes | Create | Not run |
| Column links / CT attachment | Yes | Yes | Create | Not run |
| Folders | Yes | Explicit parents | Create | Not run |
| Public views | Yes | Typed CAML | Experimental REST | Not run |
| Permission read | Yes | Yes | Read-only REST | Not run |
| Break inheritance | Yes | Blocked | No | No |
| Role assignment | Yes | Blocked | No | No |
| Canvas source bindings | Yes | Symbolic | No native registration | Not run |
| Flow resource references | Yes | Typed/resolved | Existing Flow compiler | Not run |

Machine-readable records are in `src/sharepoint/capabilities.ts`, exposed through CLI capabilities and the core provider registry. Implementation and maturity remain distinct; no live maturity is promoted by these tests.

## Validation and remaining gaps

Semantic tests cover facets, type presence, identity, target scope, dependencies, lookup constraints, XML normalization, library linkage, ownership, drift, ETags, authorization tampering/expiry, retry boundaries, discovery completeness, uncertain writes and synthetic apply/readback/replan convergence. Existing V2 tests must remain green. Generated skills are packaged from `.agents/skills`; authoritative copies are never edited in the plugin directory.

Live Graph/REST discovery, metadata create/readback behavior, REST view normalization, content-type propagation, permission observation, native Canvas registration, deployment credentials, durable production journal ports, persona access, throttling under load and scale limits remain unverified. This V1 deliberately does not provide destructive operations or broad default-environment exceptions.

Tenant effects for this implementation: sites **0**, lists **0**, libraries **0**, columns **0**, content types **0**, folders **0**, views **0**, permission changes **0**, business rows **0**, files **0**. Live discovery calls **0**. Dataverse/V2 certification assets, Canvas apps, Flow resources/runs and authentication bindings were not mutated.

Final offline validation: `npm run check` passed **1,310 tests with 7 skipped**, including the unchanged 1,217-test V2 baseline and 92 SharePoint semantic tests. Agent evaluation passed **26 routing cases and 4 result-interpretation cases**. Packaged skills match authoritative sources. No live tests were run.
