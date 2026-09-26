# Unified Solution Compiler V2

V2 extends the existing `powercanvas.solution/v1` contract and native providers. It does not replace Solution IR, add a second planner, expand Canvas components or add workflow recipe families. The preimplementation [inventory](solution-v2-inventory.md) distinguishes the existing adapters from this increment.

## Implemented path

Requirements → existing solution resolver → typed project → existing Dataverse/model-driven desired resources → native three-way plan → exact saved-plan gates → existing journaled executor → scoped discovery/membership/postconditions → semantic no-op. Unified planning continues to include Canvas/Taste and Flow compilers.

`src/dataverse/` remains the authoritative schema provider. `src/model-driven/` owns AppModule, form/query/navigation XML and security API compilation. `src/solution/` composes those resources and never manufactures alternate mutation payloads inside CLI commands.

## Authoring

Explicit projects retain `dataverse.tables`, `dataverse.relationships`, `apps`, and `security.roles/appAccess`. New optional declarations are `dataverse.choices`, `dataverse.keys`, structured form `layout`, view `filters`, navigation `area`, and model app `publishPolicy`. Currency and local multi-choice extend the existing column union. Generated JSON schemas document exact allowed fields; unknown properties remain errors.

```yaml
dataverse:
  choices:
    status:
      schemaName: pcn_RequestStatus
      displayName: Request status
      options:
        - {label: Draft, value: 745120000}
        - {label: Submitted, value: 745120001}
  # Within an existing table's columns:
  # status: {schemaName: pcn_Status, displayName: Status,
  #          type: choice, globalChoice: status}
  keys:
    externalIdentity:
      schemaName: pcn_ExternalIdentity
      displayName: External identity
      table: requests
      columns: [externalId]
      reason: External integration identifies requests by its stable key.
```

Choice numbers are persistent identities within the publisher's range. Label changes and new options use documented option actions; removals and identity changes are blocked. Globals are dependencies of their columns and appear in scoped publication XML. Local multi-choice is create/readback only for option sets; no global multi-choice contract is claimed.

Alternate keys use supported text/integer/decimal/date/choice columns, a bounded index-width budget, an explicit display name and business reason. Legacy v1alpha1 source without a display name remains readable with an exact SchemaName fallback; new source should declare the label. The provider emits the shared English (1033) Label representation and validates it before HTTP. Their asynchronous index must reach `Active` before ownership verification. Pending/failed indexes stop execution; they do not authorize a second create. Primary GUID identity remains platform-provided. See [the key contract and index lifecycle](solution-v21j-alternate-key.md).

Table ownership is explicit and immutable. Description and auditing are verifiable table properties. Allowed updates include labels, descriptions, auditing and increasing text lengths. Type, logical identity, required-level changes, truncation, key changes and destructive removals return a destructive-change blocker. Removed owned resources remain orphans. Relationships remain internal many-to-one / inverse one-to-many, with restrict-delete and no cascade for assign/share/unshare/reparent/merge. System/external lookup targets and many-to-many provisioning are not implemented in this increment.

Currency uses attribute precision (`PrecisionSource=0`); currency/organization precision modes are not silently normalized. Dataverse currency infrastructure and exchange rates remain environmental prerequisites. GUID is a system row identity, not a new arbitrary GUID-column factory.

## Model-driven composition

Main forms can declare tabs, sections, one/two-column placement and static read-only/visibility. The bounded native control mappings are text, memo, choice and lookup. Dates/numbers/booleans/currency can exist in data and public views but their main-form controls are rejected until verified mappings are added. Quick-create/quick-view/card forms are not claimed. Static visibility is not security.

Structured form updates require the generated prior XML baseline to match current XML. Unknown events, libraries, custom controls or other XML changes block replacement. Legacy JavaScript reveal/command behavior retains its existing separate safeguards. V2 adds no decorative web resources or scripts.

Views compile typed columns, sorting and bounded AND filters to FetchXML/LayoutXML. Values are checked against column types, choice filters use numeric identities, and `eq-userid` is bounded to `ownerid`. Navigation compiles ordered Area → Group → Table pages; source order expresses work priorities. Do not expose every table merely because it exists.

AppModule Web API remains the provider: it already supports exact identities, dedicated publisher checks, solution membership, components and role associations in the native journal. `pac model create` is available, but a second creation path would duplicate those gates without improving readback. No Maker UI automation is used.

Under unified planning, model publication defaults to manual. Explicit `publishPolicy: afterValidation` for all included apps, or a separately reviewed native `--publish-model` plan, adds ValidateApp → scoped PublishXml → published readback. A validation issue prevents publication. App creation never establishes runtime/persona certification. Mixed per-app publish policies conservatively defer all model publication unless explicitly requested.

## Security and app selection

Roles support explicit read/create/write/append/appendTo/delete/assign/share scopes: none, user/Basic, businessUnit/Local, parentChildBusinessUnit/Deep, organization/Global. Creating a role is a tenant write; grants and app-role associations are security writes. Removing roles/grants, reducing depth, or removing app access is blocked. Existing exact platform-created role/app defaults remain independently verified.

`personas` declare requirements, roles, `app:<key>` / `canvas:<key>` access, table scopes and flow access. Effective role union is compared with declared persona needs. The audit detects excess/missing privileges, write-without-read, app access without data read, missing app access, unresolved roles/tables/flows, and unproven run-only connections. Persona requirements propagate to roles/apps and through the resource graph. No users are assigned. Team lifecycle is planned, not implemented. Static checks cannot prove sharing, business-unit hierarchy, licensing, field security or a person's effective access.

Intent experiences support `delivery: canvas | modelDriven | auto`, optional workload and a job boundary. `auto` + `administration` selects model-driven; existing unspecified experiences retain Canvas compatibility. Explicit model-driven experiences require a job boundary. The returned `appDecisions` explains each decision. One adaptive Canvas app handles employee device variants; a separate administrative app must serve a distinct audience/job.

## Independent execution

```text
powercanvas solution plan --spec solution.json --out output/review/plan.json
powercanvas solution inspect --plan output/review/plan.json
powercanvas solution graph --plan output/review/plan.json
powercanvas solution audit --plan output/review/plan.json
```

Use the emitted resolved project with the existing native `inspect --model-driven-experiment` and `plan --unified-dataverse` commands to obtain current target-bound evidence. A solution evidence document contains that exact observation, ownership and native plan, with the same target. Flow evidence remains the existing separate plan/snapshot/ownership/deployment contract. Evidence refresh never implies adoption.

`solution apply ... --stages DATA` selects the existing atomic native plan, including its model components. `--stages AUTOMATION` selects the existing Flow executor. The conceptual IR lists DATA and MODEL_APP separately, but this version does **not** split the native transaction/journal into separate DATA and MODEL_APP executor calls. For schema-only native work use the established `--scope dataverse` lifecycle. Unselected dependencies must already be verified no-ops or resolved external requirements. The default apply remains all-or-nothing preflight for backward compatibility.

Canvas `AUTHORING_UNAVAILABLE`/`DEGRADED_READ_ONLY` produces `EXTERNAL_BLOCKED` for native apply, while offline source generation remains available. Independent native resources can proceed with exact native evidence. Source, capability, environment, observation, ownership revision and full native operation hashes are rechecked. Unknown outcomes stop; no create retry, grants retry or compensating delete is inferred.

The Default environment retains its dedicated namespace, non-disposable additive policy and historical experiment gates. Unified policy does not bypass Default isolation. Developer/sandbox unified planning no longer requires a project-specific historical Experiment 1 success merely to plan a new project. Production/trial schema writes remain blocked.

## Checker and dependencies

```text
powercanvas solution check --archive reviewed.zip --environment https://example.crm.dynamics.com --pac <pac-executable> --geo Europe --out output/new-check --allow-upload
powercanvas solution dependencies --plan output/review/plan.json --env <existing-alias> --out output/dependencies.json
```

Checker executes fixed `pac solution check` arguments with the existing authentication profile. `--allow-upload` explicitly authorizes sending the reviewed ZIP to Microsoft. It creates an exclusive fresh output directory and records archive SHA-256, command, timestamps and exit code. Only fresh SARIF (including bounded report ZIPs) satisfies the run. Nonzero exit, incomplete SARIF invocation or configured severities block; critical findings always block. Default policy blocks errors. Missing reports yield `CHECKER_UNPROVEN`. There are no automatic sign-ins, auth-profile changes, retries, rule exclusions or `--saveResults` writes. Imported SARIF remains distinguishable from an executed run and never establishes production certification.

Dependency discovery calls read-only RetrieveRequiredComponents for known component GUID/type pairs and RetrieveMissingDependencies for the exact solution. Results preserve unmodeled platform identities, missing dependencies, target identity, freshness and coverage. Components without discovered IDs remain unresolved. Local conceptual edges need not equal platform component edges. Imported evidence without verified target/freshness is unverified; it cannot authorize deployment.

## Export verification and ALM boundaries

```text
python scripts/index-flow-export.py reviewed.zip output/index.json --solution
powercanvas solution verify-export --plan output/review/plan.json --index output/index.json
```

The existing read-only ZIP indexer gains optional native component indexing; its default Flow index contract is unchanged. V2 checks native table/column/choice/key/relationship/form/view/role/app/navigation definition presence, scoped identities and root listings where available. Unknown export layouts fail as missing; the indexer does not invent component evidence. An independently observed component GUID is stronger evidence than a name.

Full native semantic equivalence, role privilege/app-role associations, generated scripts and Canvas source still require provider/source readback. Export identity/presence is not runtime or cross-environment import proof. Required unresolved native definitions yield `INCOMPLETE`. Existing exact Flow definition and Canvas-flow attachment verification remains authoritative.

Solution assets, environment configuration and external dependencies stay separate. Human/team membership, current connection ownership and environment values require target configuration. SharePoint Word templates are external assets, not magically solution-contained.

## Offline benchmarks and proof

Run `npm run solution:v2`. Outputs are ignored under `output/solution-v2/benchmarks/`.

* Service Administration: three related tables, a global choice, two lookups, a natural integration key, structured main form, typed public view, operations/configuration navigation, dispatcher/admin roles and personas.
* Leave Management: one employee Canvas app, a distinct HR model-driven app, shared request/type tables, manager approval and separate notification recipes, employee/basic, manager/local and HR/global roles. Connections/approvers remain unresolved deployment configuration. Canvas host fixtures disable business commits and do not claim a functioning deployed app.

Tests assert payload types, stable option identities, destructive blockers, graph edges, layout/filter roundtrips, security scope union, separate app access, manual publication, failed ValidateApp, stale plans, independent native execution, real Checker invocation arguments with a fake process runner, required fresh SARIF and platform dependency normalization. They do not contact Microsoft or use static full-export snapshots as a substitute for behavior.

Validation completed on 22 September 2026: `npm run check` passed lint, type checking and **698 tests**, with seven pre-existing private-evidence tests intentionally skipped. `npm run agent:eval` passed 24 routing and four result-interpretation cases, including byte-identical packaged skills. Both V2 benchmarks compiled without semantic errors. The Python export indexer passed a synthetic ZIP check covering seven native component kinds and preserved its legacy Flow-only output contract. JSON schemas were regenerated and `git diff --check` passed.

## Support matrix

“Apply adapter” means implemented existing journaled path, not deployment evidence. All V2 live proof is pending; older bounded experiments are historical only.

| Resource | Schema | Compile | Plan | Apply adapter | V2 live proof |
| --- | --- | --- | --- | --- | --- |
| Dataverse table | Yes | Yes | Yes | Create; labels/description/auditing | No |
| Column | Yes | Yes | Yes | Create; labels/length increases; bounded choices | No |
| Global/local choice | Yes | Yes | Yes | Create; label/add option; no remove/renumber | No |
| Relationship | Yes, internal 1:N | Yes | Yes | Create; no cascade/target migration | No |
| Alternate key | Yes, bounded | Yes | Yes | Create; verify Active index | No |
| Public view | Yes | Yes | Yes | Create/update bounded query/layout | No |
| Main form | Yes, bounded controls | Yes | Yes | Create; strict generated-layout update | No |
| Model-driven app | Yes | Yes | Yes | Create/name/client conversion; validate/publish separately | No |
| Navigation | Yes | Yes | Yes | Create/update typed sitemap | No |
| Security role | Yes | Yes | Yes | Create/name update | No |
| Role privileges | Yes | Yes | Yes | Add/widen; reduce/revoke blocked | No |
| App-role access | Yes | Yes | Yes | Add; removal blocked | No |
| Human assignments / teams | Requirements only | No | Prerequisite | No | No |
| Solution Checker | Yes | Fixed CLI invocation | Explicit upload policy | Process adapter, fixture tested | Not executed against service |
| Platform dependencies | Yes | Typed normalization | Comparison/coverage | GET adapter, fixture tested | Not requested |
| Canvas | Existing | Existing source generation | Existing | Separate authoring lifecycle blocked | No new proof |
| Power Automate | Existing | Existing | Existing | Existing Flow adapter | No new proof |

## Mutation and readiness report

This V2 implementation run made **zero** tenant mutations, uploads, live discovery calls or authentication-profile changes. Complaint Desk and historical Canvas authoring evidence were not touched.

| Resource/action | Created | Updated | Deleted |
| --- | ---: | ---: | ---: |
| Tables | 0 | 0 | 0 |
| Columns | 0 | 0 | 0 |
| Choices | 0 | 0 | 0 |
| Relationships | 0 | 0 | 0 |
| Keys | 0 | 0 | 0 |
| Views | 0 | 0 | 0 |
| Forms | 0 | 0 | 0 |
| Model-driven apps | 0 | 0 | 0 |
| Navigation/sitemaps | 0 | 0 | 0 |
| Security roles | 0 | 0 | 0 |
| Canvas apps | 0 | 0 | 0 |
| Flows | 0 | 0 | 0 |
| Connection references | 0 | 0 | 0 |
| Environment variables | 0 | 0 | 0 |
| Business rows / SharePoint files/items | 0 | 0 | 0 |

Privilege grants/revokes: 0/0. App-role associations/removals: 0/0. Human/team assignments: 0. Apps published: 0. Flows activated: 0. Approvals/emails/documents/PDFs: 0 each. Checker service uploads: 0. Solution exports/imports executed: 0.

Readiness: offline architecture and provider-contract proof; **not production ready**. Live discovery was not requested, so authentication availability is unknown rather than falsely reported as failed. Persona/run-only authorization, live new payloads, independent native export equivalence and cross-environment import remain unproven.

## Microsoft references reviewed

* [Global/local choice metadata and option mutation](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-optionsets)
* [Alternate-key definitions and asynchronous indexing](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/define-alternate-keys-entity)
* [AppModule creation and management](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/create-manage-model-driven-apps-using-code)
* [PAC model commands](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/model)
* [PAC solution/check commands](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/solution)
* [AddPrivilegesRole](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addprivilegesrole?view=dataverse-latest)
* [RetrieveRequiredComponents](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieverequiredcomponents?view=dataverse-latest), [RetrieveMissingDependencies](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrievemissingdependencies?view=dataverse-latest), [dependency fields](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/dependency?view=dataverse-latest)
* [Form XML structure](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/customize-dev/form-xml-schema?view=op-9-1): structural reference only, not proof of unverified online control GUIDs.
