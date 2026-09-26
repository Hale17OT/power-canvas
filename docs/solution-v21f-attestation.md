# Scope-bound pre-write attestation

V2.1f adds an exact pre-write read contract for the reviewed 21-root provider certification fixture. It does not authorize provisioning. The Default environment remains non-disposable, and provider maturity remains unchanged.

## Lifecycle and boundary

The initial full observation, native/unified planning, exact fixture manifest and conditional authorization remain authoritative. Under the existing writer lock, the certification executor validates its authorization against that planning evidence, then runs a separate scope-bound attestation. It no longer invokes full discovery as its initial or between-operation precondition. Generic apply still uses `FULL_OBSERVATION_REVALIDATION`.

Each certification operation receives a fresh attestation before mutation. Newly created dependencies must have verified source-bound receipts from the same plan. Incremental readback uses the existing providers restricted to the certification project and owned closure; independent final full discovery and NO_OP reconciliation remain unchanged. Readback is not replaced by the pre-write absence check.

The dependency DAG, mutation providers, journal and ownership verification remain authoritative. This is staged execution, not a transaction. A failed or unknown write is never automatically replayed or rolled back.

## Read contracts

`src/execution/attestation.ts` owns strategy selection, deterministic read-set generation, evaluation and evidence validation. Unknown kinds, updates, different fixtures and different operation sets do not qualify. There is no targeted-to-broad fallback after a read failure.

| Fact previously supplied by broad discovery | Exact pre-write check |
| --- | --- |
| Target/principal | Existing `verifyTarget` and named credential context under lock; Default identity, organization URL, WhoAmI and healthy authentication |
| Solution/publisher | Exact IDs plus unique names/prefix; unmanaged solution, preserved label, version and publisher binding |
| Ownership | Entire expected receipt hash and revision before and after attestation; expected progression after successful owned operations |
| Caller privileges | Filtered required privilege names plus current verified principal's privileges; no new grants |
| Table absence | Exact LogicalName/SchemaName metadata filter |
| Choice absence | Documented GlobalOptionSetDefinitions Name key; recognized service metadata 404 is absence, not a transport success |
| Column/key absence | Exact name within the exact parent table; no historical attributes or keys |
| Relationship absence | Exact relationship SchemaName and relationship-owned lookup collision check |
| Form/view absence | Exact generated name AND exact table, in published and unpublished state |
| Sitemap absence | Exact canonical and service-local unique names, separately in published/unpublished state |
| AppModule absence | Exact canonical and service-local uniquenames in both states |
| Role absence | Exact generated role name, conservatively rejecting any matching role; one root business unit required |
| Privilege aggregate | Verified owned role/table IDs, exact privilege definitions and table privilege IDs, requested Basic depth; preserve the existing nine documented platform defaults |
| App component aggregate | Verified owned app/component IDs, exact component layer and association absence |
| App-role aggregate | Verified owned app/role IDs, exact published association plus existing app-scoped FetchXML intersect reader for unpublished access |
| Publication | Exact empty reviewed publication scope; no normalization or implicit publishing |
| Source/plan/operation set | Existing compiler-derived manifest and authorization checks plus immutable plan hash and expiry |

When the exact parent table is absent, a child metadata resource cannot exist. Initial evidence records `PARENT_ABSENT` rather than issuing an invalid child request or interpreting an arbitrary 404 as absence. Its exact child query remains in the read set and executes at the dependency-local operation boundary after the parent is created and owned. Aggregate absence similarly follows from the absent parent; role/app association checks run again against actual owned IDs when executable.

Unrelated historical Complaint forms, views, roles, commands and navigation remain visible in full planning discovery but are not write preconditions for this independent certification subtree. Their receipts are not repaired or adopted.

## Supported API syntax

The existing provider's sitemap unique service name is publisher-local: `ExperimentCertificationNav`; its canonical PowerCanvas identity is `pfx_ExperimentCertificationNav`. Both exact unique values are collision-probed, never guessed from friendly text. AppModule likewise checks both exact names accepted by the existing provider contract.

Example queries, with values encoded by the existing Web API client's URL handling:

```text
sitemaps?$select=sitemapid,sitemapnameunique,componentstate,solutionid&$filter=sitemapnameunique eq 'ExperimentCertificationNav'
sitemaps/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()?$select=sitemapid,sitemapnameunique,componentstate,solutionid&$filter=sitemapnameunique eq 'ExperimentCertificationNav'
appmodules?$select=appmoduleid,uniquename,componentstate,solutionid&$filter=uniquename eq 'pfx_ExperimentCertification'
appmodules/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()?$select=appmoduleid,uniquename,componentstate,solutionid&$filter=uniquename eq 'pfx_ExperimentCertification'
GlobalOptionSetDefinitions(Name='pfx_ExperimentCertificationState')
```

Microsoft documents [composable unpublished retrieval](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveunpublishedmultiple?view=dataverse-latest), [Sitemap fields](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/sitemap), [AppModule unpublished retrieval](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/appmodule?view=dataverse-latest), and [metadata queries](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api). GlobalOptionSetDefinitions does not support `$filter`; the documented Name key is required.

A rejected filtered query is `UNSUPPORTED_TARGETED_QUERY`. Other missing read evidence is `READ_INCOMPLETE`; neither can authorize mutation. The three-attempt GET policy and timeouts are unchanged. Writes do not inherit read retries. Scoped attestation expires after at most five minutes and never extends the plan.

## Read-only proof command

```text
powercanvas --project <bound-project> --non-interactive --json solution certification-attest
  --spec <reviewed-fixture>
  --env <existing-binding>
  --reviewed-evidence <accepted-preflight-directory>
  --expected-principal <existing-principal-guid>
  --out <fresh-private-output-directory>
```

This command performs one full fresh certification preflight, then three independent credential/attestation cycles using the still-fresh plan. Every cycle acquires the existing writer lock. The command has a GET-only client, no mutation adapter and no execution receipt. It stops at the first failed cycle. It does not recreate or select authentication profiles.

Evidence includes a plan-bound `pre-write-read-set.json`, per-cycle `pre-write-attestation.json`, target/auth facts, exact filtered collision results, per-query attempts/timing, raw sealed GET audits, interpreted expected metadata absence responses, ownership/profile/binding integrity and saved-byte hashes. An expected Name-key 404 is explicitly identified separately from an unrecovered read; the raw transport audit is preserved.

Three PASS dry runs establish only the pre-write architecture. Future execution requires new authorization, a fresh plan and a fresh in-lock attestation. Nothing in the V2.1f artifact is a reusable authorization token or live provider certificate. Execution evidence binds each attestation to the same plan/manifest as the execution receipt; neither alone suffices.

Live results belong in ignored `output/` evidence, not in this source document. No tenant identifiers, credentials, receipts or source exports should be committed with these changes.
