# Power Automate compiler V1

This documents the historical V1 boundary. See [Power Automate compiler V2](flows-v2.md) for the current connector/write capabilities and remaining limitations.

PowerCanvas treats cloud flows as typed, solution-owned resources. The flow compiler lives in `src/flows`, independently of Canvas generation. The Canvas adapter consumes contracts; it never creates or activates flows. This is an experimental, bounded provider, not a general workflow designer.

## Source and compilation

`resources` contains keyed maps of `flows`, `connectionReferences`, and `environmentVariables`, plus `canvasBindings`. See `examples/canvas-native-complaints/powercanvas.yaml` for the executable pilot and `schemas/powercanvas-flows.v1.schema.json` for the strict input contract.

Flow properties are `logicalName`, `displayName`, `description`, `flowType`, `trigger`, `inputs`, `outputs`, `actions`, `connectionReferences`, `environmentVariables`, `dependencies`, `runPolicy`, and `activationPolicy`. Unknown fields and unsupported action names fail validation. Names must use the project's publisher prefix. Canvas aliases are unique per app.

Compilation is deterministic: strict schema → typed scoped expression/action AST → centralized workflow definition → `clientdata` → category 5/type 1 Dataverse workflow payload. Clientdata schemaVersion is **1.0.0.0**. A definition hash covers the trigger, ordered actions, expressions, parameters and connection references.

Supported triggers:

* `powerAppsV2`: instant, required scalar inputs, exactly one final typed response.
* `recurrence`: scheduled, Minute/Hour/Day, positive bounded interval and explicit UTC start time. No Canvas inputs/outputs. Compiled and locally tested; not live-created in the pilot.

Dataverse automated triggers are deliberately rejected. A live webhook shape was observed, but message/scope combinations and deployment/runtime semantics have not been fully verified.

Supported actions (exact list):

| Action | Bounds |
| --- | --- |
| `data.compose` | Typed expression |
| `data.parseJson` | String input, declared strict schema |
| `data.select` | Typed array and projected fields |
| `data.filterArray` | Typed array and Boolean predicate |
| `control.condition` | Boolean expression, isolated branch scopes |
| `control.applyToEach` | `maxItems` 1–1000, sequential, nested scope |
| `variables.initialize` | Once at top level |
| `variables.set` | Same declared type, no direct self-reference |
| `variables.append` | Array element of declared type |
| `powerApps.respond` | Exact declared outputs, final top-level action |
| `dataverse.getRow` | Explicit connection, entity set, GUID and selected scalar columns |
| `dataverse.listRows` | Explicit connection, selected scalar columns, top 1–500 |

Registry recipes expose operation/parameter metadata, connection requirements, input/output contracts, compiler/validator identifiers and risk. All exposed V1 actions are READ. WRITE and DESTRUCTIVE actions are rejected by the schema before deployment. There is no remote execution command for business-write testing. Connector reads check entity-set and selected-column metadata during live planning, apply and activation; unreadable/unsupported types fail closed. This does not establish effective access for another persona.

## Types and expressions

Value types: string, number, integer, boolean, date, datetime, object, array, recordRef, email, guid. Objects require named typed fields; arrays require typed items. Integer may widen to number. `recordRef` is currently a GUID string, not an entity-qualified reference.

Structured expressions: literal, input, output, variable, environment, item, concat, coalesce, equals, not, and, or, empty, length, first, last. Arity, operand types, initialization, field paths and lexical scope are checked. Forward references and branch/loop output leakage fail. Literal `@...` text remains literal. No raw-expression escape hatch is exposed.

Power Apps input positions are derived from declaration order, with stable wire names (`text`, `text_1`, etc.). Required scalar inputs and scalar outputs are supported. Complex or optional Power Apps ports are rejected; explicit JSON strings are available. Semantic types such as GUID/email/date map to JSON formats and Canvas-compatible scalar representations; Power Fx's local type checker is not a runtime GUID validator. The native authoring checker remains mandatory.

## Lifecycle and safety

```powershell
node dist/cli/index.js --project examples/canvas-native-complaints flows validate
node dist/cli/index.js --project examples/canvas-native-complaints flows actions
node dist/cli/index.js --project examples/canvas-native-complaints flows deployment-template --environment <environment-id> --out output/deployment.json
node dist/cli/index.js --project examples/canvas-native-complaints flows plan --env experiment-default --deployment output/deployment.json --out output/flow-plan.json
node dist/cli/index.js --project examples/canvas-native-complaints flows apply --env experiment-default --deployment output/deployment.json --plan output/flow-plan.json
node dist/cli/index.js --project examples/canvas-native-complaints flows activate complaintChangeContract --env experiment-default --deployment output/deployment.json
```

`validate`, `audit`, `compile`, `binding` and `deployment-template` are local. `list`, `discover`, `inspect`, `plan`, `canvas-plan` and journal reconciliation perform zero remote mutations. `apply`, `activate`, and `deactivate` are separate explicit commands. `export` downloads an unmanaged solution using Microsoft's ExportSolution action; it does not mutate resources.

Planning classifies every declaration as CREATE, UPDATE, NO-OP, BLOCKED or CONFLICT. Removed owned declarations become ORPHANED and remain remotely. There is no delete or adoption command. A preexisting logical **or display** name collision blocks creation; display-name matching never establishes ownership.

Ownership records bind project, tenant/environment/organization/URL, stable workflow ID, logical name, solution membership, owner and verified source hash. New IDs are deterministic within the project/target/resource key. Apply verifies the saved plan against fresh source/settings/discovery and repeats checks before each mutation. Flow creation is off; updates require off state. Readback verifies identity, definition, state and solution association. Missing membership can be added only after verifying the newly written owned component. App and business-data writes are absent from the flow deployment adapter.

The default concurrency mode is exact ETag. The live Default-environment workflow rejected matching ETags on definition updates; activation still accepted them. The pilot therefore explicitly uses deployment setting `flowUpdateConcurrency: verifiedSource`, matching Microsoft's documented `If-Match: *` workflow-update example. That mode rechecks source/owner/off-state immediately before update and verifies readback, but **does not provide atomic protection against a concurrent edit between the check and write**. It is never an automatic fallback or retry. Use exclusive editing for this experimental mode; retain exact ETags where the provider supports them.

A write-ahead pending journal blocks retries after uncertain failures. `flows reconcile-state` can clear an activation/deactivation journal against the exact owned baseline, or a failed UPDATE only when the source is unchanged and the flow is still off. It cannot adopt a CREATE, reconcile changed source, or clear an unknown ownership outcome. Such cases require explicit investigation.

Both activation policies (`manual`, `afterValidation`) require an explicit activation command in V1. There is no automatic activation. Activation requires unchanged deployed source and resolved dependencies. Deactivation remains possible after a local source edit, provided the remote owned baseline has not changed.

Default is non-disposable: only `pfx_PowerForgeExperiment` with its dedicated publisher/prefix may receive V1 mutations. Developer/Sandbox targets are also eligible after identity verification. No managed upgrade/removal or production/UAT claims follow from the Default experiment.

## Connections, variables and ALM

Connection references are distinct from authenticated connections. V1 supports `shared_commondataserviceforapps` only. The project declares logical name/connector and explicit `allowCreate`; deployment settings supply the existing authorized connection ID. Missing authorization blocks planning. `authorizationVerified` is an operator/provider attestation, **not** an independent OAuth consent or effective-access test. PowerCanvas never creates credentials or bypasses consent. Existing unowned connection references are not adopted. Previously created and verified project references can be reused as NO-OP.

Environment definitions support text, number, Boolean and JSON (serialized JSON string), with optional source defaults and environment-specific current values. Secret/data-source types are recognized but provisioning and values are rejected pending dedicated providers. Secret values are not accepted in deployment overrides. Known credential keys/token markers are rejected recursively, including JSON configuration. This is a guard, not comprehensive secret discovery in arbitrary text.

Flow source uses logical parameter names with environment-variable metadata. Target IDs/connection IDs/current values live in environment-scoped deployment artifacts. `deployment-template` also emits PAC-compatible solution settings. Definition and value resources use solution component types 380 and 381; connection references use 10035; flows use 29.

`flows export --env experiment-default --out output/experiment.zip` exports the existing unmanaged solution. Export participation is verified in the pilot. Import, connection rebinding in another tenant, managed upgrades/removal, service-principal CI, sharing/run-only access and rollback need separate environments/tests. No additional environment or app is implicitly created.

## Native Canvas integration

`canvasBindings` maps a pinned existing app to a flow and alias. Optional `command` declares an existing auto-layout parent, stable command name, labels, typed host formulas, string input fields and named Boolean/string response outputs. `bindings.json.flowSources` maps that alias to the environment-scoped workflow ID, actual Studio symbol and contract hash. No positional or output-name guessing is used.

The official Canvas authoring server currently cannot attach a new flow connector. Prepare that one connection using Studio's documented **Power Automate pane → Add flow**. Export source immediately before/after and reject unexpected formula changes. Do not use the legacy flow attachment UI that overwrites the selected formula. The pilot's attachment produced identical source hashes.

```powershell
node dist/cli/index.js --project examples/canvas-native-complaints flows canvas-plan --app complaintPortal --bindings examples/canvas-native-complaints/bindings.json --before output/canvas/native/fresh-export --out output/canvas/native/reviewed-flow --deployment experiments/flows-v1-20260921/deployment.json --env experiment-default
```

This read-only command verifies active owned flow identity/dependencies, emits a source-hash-bound native plan, and preserves all preexisting behavior. Native compilation through the guarded authoring session is separate. The ordinary `canvas native` compiler also instantiates these standardized command patterns for future generation. Existing nonempty OnSelect formulas cannot be replaced implicitly; command-name collisions fail. The scoped refresh script checks a prior generated receipt before changing its owned command subtree.

Commands capture argument values, show busy/error/response states, invalidate results after input changes, and tie responses to the input/record signature. Mobile targets use at least 44px. The existing SubmitForm path is untouched. App Checker, readback, runtime tests and explicit save/publish complete delivery; local binding generation alone is not a live integration claim.

## Responsibility and remaining boundaries

`flows advise singleRowUpdate` and `uiValidation` recommend existing synchronous Power Fx. External integration, documents, notifications, approvals and scheduled work recommend a separate automation resource when useful; this advice does not imply those connector actions are implemented.

Unsupported: Dataverse automated triggers; desktop/RPA/BPF/Copilot/AI Builder; SharePoint/Outlook actions; arbitrary HTTP; write/delete actions; switch; child flows; raw workflow JSON/expressions; optional/complex Power Apps ports; advanced recurrence; arbitrary retry/catch/parallel graphs; automatic sharing; arbitrary existing-flow adoption; reverse compilation of remote JSON into YAML; unattended connector authorization; secret/data-source providers; production ALM certification. Source synchronization means verified compiled definition/readback hashes with drift conflicts, not a generic bidirectional designer merge.

## Microsoft references (reviewed 21 September 2026)

* [Manage solution-aware flows with code](https://learn.microsoft.com/en-us/power-automate/manage-flows-with-code): workflow representation, state, sharing and solution export/import.
* [Workflow Web API](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/workflow): identity and fields.
* [Canvas Power Automate pane](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/working-with-flows): attachment and formula preservation.
* [Dataverse connector](https://learn.microsoft.com/en-us/connectors/commondataserviceforapps/): GetItem/ListRecords operation contracts.
* [Workflow definition actions/triggers](https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-workflow-actions-triggers) and [expressions](https://learn.microsoft.com/en-us/azure/logic-apps/expression-functions-reference): bounded compiler target.
* [Environment variables](https://learn.microsoft.com/en-us/power-automate/environment-variables) and [deployment settings](https://learn.microsoft.com/en-us/power-platform/alm/conn-ref-env-variables-build-tools): environment portability.

Live evidence and exact mutation counts: `experiments/flows-v1-20260921/report.md`.
