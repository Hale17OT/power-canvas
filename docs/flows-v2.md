# Power Automate compiler V2

V2 extends the existing `src/flows` compiler. Complaint Desk remains the existing application, with the same read-only V1 pilot. Connector features below are compiler capabilities, not a claim that every connector has been deployed or executed in this tenant. See `../experiments/flows-v2-20260921/report.md` for exact evidence and mutations.

## Architecture and contracts

The existing schema, expression engine, registry, compiler, metadata, remote, planner, state, apply, Canvas and native modules remain the delivery path. `providers.ts` centralizes connector identities, operation contracts, parameter encoding, output types and risks. `safety.ts` provides risk analysis, execution policy, portability, dependencies and test-context validation. `connections.ts` supplies read-only discovery/metadata adapters; `export.ts` verifies an indexed solution archive against a source-bound plan.

Sources continue using `name` / `use`, not a second parallel DSL. Valid V1 projects remain accepted. Projects containing flows can omit Dataverse table declarations (`dataverse.tables: {}`). V2 schemas are `schemas/powercanvas-flows.v2.schema.json` and `powercanvas-flow-deployment.v2.schema.json`. Historical V1 schema files remain available.

## Implemented operations

| Provider | Actions | Risk |
| --- | --- | --- |
| Dataverse | getRow, listRows | READ |
| Dataverse | addRow, updateRow | WRITE_INTERNAL |
| SharePoint | getItems, getFileMetadata, getFileContent | READ |
| SharePoint | createItem, updateItem, createFile, updateFileProperties | WRITE_INTERNAL |
| Office 365 Outlook | sendEmail | WRITE_EXTERNAL |

Names use provider prefixes, e.g. `dataverse.updateRow`. The update action uses **UpdateOnlyRecord**, never the upsert operation UpdateRecord. GUID row identity is required. Alternate-key addressing and upsert are not implemented.

All V1 core data/control/variable/response actions remain available. Conditions isolate output scopes; serial loops require maxItems and compile a `take` bound. Nested effects contribute to flow risk. Automatic retries of writes are rejected; reads accept `retry: {policy: default}` or `none`. A write with `retry: {policy: none}` does not guarantee the service can never replay a request.

Dataverse event triggers compile SubscribeWebhookTrigger for rowAdded (1), rowDeleted (2), rowModified (3), and rowAddedOrModified (4), with user/business-unit/parent-child/organization scope. `table` is the entity set; the metadata contract supplies its logical name. `selectColumns` maps to filteringattributes, a modification filter rather than an output projection. Optional `filter` supports typed literal eq/ne predicates and verified column names. Raw filterExpression strings, additional webhook knobs and unrestricted query syntax are rejected. A deletion event trigger observes deletion; it does not authorize or generate a delete action.

## Metadata and typed values

`resources.flowDataSources` contains portable, reviewable metadata contracts. A contract identifies connector, table/entity type, kind and columns with shape, required, readable, create, update and optional choices. Dataverse contracts also identify the logical table name. Dataverse discovery uses EntityDefinitions/Attributes, choice options and DateTime formats. SharePoint discovery uses immutable list GUIDs and REST internal column names. A declared subset is accepted only if every declared column matches live metadata and no writable required live field is omitted.

Writes require a metadata contract; it is checked locally and revalidated against the environment before apply/activation. Dataverse reads can retain the V1 explicit shape or derive selected field types from `metadata`. SharePoint item outputs derive from their contract. File operations distinguish integer list-item IDs from string file identifiers. Binary content can flow from getFileContent to createFile; arbitrary strings are not silently treated as bytes. Paths/names must be constrained literals or environment configuration; traversal and encoded/query paths fail validation. Folder existence is checked with the same authorized SharePoint site before deployment.

Dataverse choices use discovered integer values; SharePoint choices use discovered strings. Choice writes currently require validated literals. Boolean, numeric, string, date/datetime and GUID values retain their types. Dataverse lookups, polymorphic references, SharePoint person/lookup/multichoice, attachments and unsupported complex fields are explicitly rejected for writes. Dataverse lookup properties are not advertised as simple logical-name output fields. Metadata-derived types do not guarantee non-null values or complete webhook payloads: flows must handle absent values with coalesce or obtain a full row where required. Schema tests do not certify runtime service behavior.

## Connections and environment configuration

A connector definition, a solution connection reference, and an authenticated connection are distinct. The compiler verifies each action/trigger against its declared connection reference provider. The planner requires a connector-matching, environment-matching authenticated connection declaration with `authorizationVerified`, `principalId` (the current Dataverse caller UserId), and `authorizationEvidence`. Evidence is an explicit operator attestation; it is not presented as provider-certified authorization. Apply checks the current caller against that declaration; activation checks WhoAmI. Service-side authorization can still reject an operation. Missing verification is BLOCKED, never implicit adoption.

`flows connections list` reports IDs, underlying connection IDs, connector, solution memberships, owner, managed state and PowerCanvas ownership. Authorization is UNVERIFIED unless independently established. `--authenticated` attempts the documented Power Platform connection inventory using silent authentication, without exposing tokens or treating list access as permission to execute. SharePoint metadata requests also use the selected account's protected token cache; missing consent/access blocks the request. No passwords or API keys belong in YAML. No connector connection is created or silently selected.

Environment variables compile as definition parameters with `metadata.schemaName`; expressions compile as `parameters(...)`. Target values live in deployment configuration, separate from portable source. Text variables can add `format: email | guid | date | datetime`. Secret and dataSource providers remain blocked. JSON variables use serialized JSON strings. The live V2 proof verifies two parameter references, definitions, current values, readback and solution export. It does not prove cross-environment import. Direct changes to environment values can require saving/restarting a flow, as documented by Microsoft; they are not assumed to take effect instantly.

## Write and execution safety

```yaml
resources:
  executionPolicy:
    allowRead: true
    allowInternalWrite: false
    allowExternalWrite: false
    allowDestructive: false
```

Write flows additionally require `runPolicy.mode: controlledWrite` and manual activation. Definitions may compile/deploy disabled while execution policy denies activation. Apply never activates or executes a flow. Unknown/destructive actions fail the strict schema; allowDestructive cannot be set true in V2.

Plans include action-level effects/targets/columns, flow risk, execution blockers, retry/idempotency warnings, dependencies and portability findings. Same-table insert cycles and updates overlapping monitored columns are blocked, including nested writes. Non-overlapping writes still warn about plugins/other flows; static analysis is not a global cycle proof.

`idempotency` accepts naturalKey, targetIdentity or operatorReviewed plus a rationale. This is design guidance; it does not synthesize a durable deduplication store or promise exactly-once delivery. Uncertain execution results must be reconciled before retry.

`flows test-context` validates an environment/flow/definition-hash-bound proposal describing each write target, expected mutation, rollback strategy and operator authorization. Email proposals require every recipient to be an explicit approved safe literal. This command **does not execute anything**. V2 has no generic write-test runner; dynamic target identities require additional operator review. Without a safe context, report **LIVE WRITE EXECUTION NOT PERFORMED**.

## Canvas lifecycle

The V1 typed contract/signature/snapshot guards remain intact. A write binding requires explicit command lifecycle labels, response-based completion and `retry: manualReconcile`. Generated commands capture inputs, guard busy state, show response-driven status and latch an attempted write to prevent automatic resubmission in that app session. Errors say that the outcome is unknown, rather than suggesting an immediate repeat. This is not server-side deduplication and does not prevent a fresh session from initiating another operation.

No V2 capability is automatically added to Complaint Desk. Initial flow attachment remains an explicit Studio preparation step. Reviewed official Studio and PAC documentation did not establish a reliable supported command to attach an arbitrary existing flow to an existing native Canvas app. No undocumented package editing or fragile Maker UI attachment was introduced. Existing nonempty Power Fx behavior cannot be overwritten implicitly.

## Commands and examples

```powershell
node dist/cli/index.js --project examples/flows-v2 flows validate
node dist/cli/index.js --project examples/flows-v2 flows compile --out output/flows-v2
node dist/cli/index.js --project examples/flows-v2 flows providers
node dist/cli/index.js --project examples/flows-v2 flows dependencies
node dist/cli/index.js --project examples/flows-v2 flows portability
node dist/cli/index.js --project examples/canvas-native-complaints flows connections list --env experiment-default --authenticated
node dist/cli/index.js --project examples/canvas-native-complaints flows metadata dataverse --table pfx_experimentcategories --env experiment-default --out output/categories.json
```

The connector examples are compile fixtures with no authorized connection/test recipient. SharePoint metadata is illustrative and must be replaced by discovery from the intended site. `examples/flows-v2/configuration-proof` is the separate, no-connector live proof. Neither project creates a Canvas app.

Existing plan/apply/activate/deactivate/list/inspect/advise commands remain. Advice adds backgroundSync and multiSystemProcess; it creates nothing. New `verify-export` consumes the index produced by:

```powershell
python scripts/index-flow-export.py solution.zip index.json
node dist/cli/index.js --project <project> flows verify-export --plan plan.json --index index.json
```

The indexer reads without extracting/modifying the ZIP. Verification checks exact workflow identity/definition (only the observed export-added null templateName is normalized), connection references, environment definitions/current values, Canvas attachments and available table definitions. Table dependency evidence is reported separately when definitions need not be bundled. Canvas attachment matching uses a unique exported solution logical name, not the internal authoring document GUID. It does not certify sharing/run-only access or ALM import.

## Concurrency and remaining boundaries

Exact ETag is the default. `verifiedSource` remains an explicit weaker mode with a warning in every plan. Live workflow metadata reports IsOptimisticConcurrencyEnabled true, but this does not resolve V1's solution-layer exact-ETag update failure. No automatic fallback, force overwrite, existing-resource adoption or managed removal was added. Interrupted uncertain writes retain their journal. The live V2 rejected environment-value request was a known HTTP 400; its specific journal was reconciled only after verifying absence and the owned parent. No uncertain created resource was adopted.

Not implemented/certified: delete actions; approval workflows; document generation; arbitrary HTTP/raw expressions; advanced retries; alternate keys/upsert; complex connector fields; unattended connector consent; durable idempotency; general write-test execution; restricted-user sharing/run-only checks; cross-environment import; production ALM. New connector runtime execution remains unproven in this tenant.

## Primary references reviewed 21 September 2026

- [Dataverse operations](https://learn.microsoft.com/en-us/connectors/commondataserviceforapps/): CreateRecord versus UpdateOnlyRecord and webhook parameters.
- [Callback registration options](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/callbackregistration): exact change/scope constants.
- [Microsoft's exported workflow example](https://github.com/microsoft/Templates-for-Power-Platform/blob/main/Solutions/mpa_TrainingAndRegistration/src/Workflows/TrainingandRegistration-NoShowAttendance-FE1A7BCC-0E0D-EF11-9F89-0022482C6025.json): trigger/action envelope and authentication placement.
- [SharePoint connector](https://learn.microsoft.com/en-us/connectors/sharepoint/) and [Outlook connector](https://learn.microsoft.com/en-us/connectors/office365/): operation IDs and parameter contracts.
- [Environment variables in flows](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/environmentvariables-power-automate) and [environmentvariablevalue API](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/environmentvariablevalue): usage and case-sensitive navigation binding.
- [Power Platform connection inventory](https://learn.microsoft.com/en-us/rest/api/power-platform/connectivity/connections/list-connections).
- [Studio flow attachment](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/working-with-flows) and [PAC Canvas commands](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/canvas).
- [Optimistic concurrency](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/optimistic-concurrency).
