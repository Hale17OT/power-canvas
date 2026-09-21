# Power Automate compiler V3: recipes and orchestration

V3 expands declarative business workflows into the existing V1/V2 action AST. Schema parsing, scoped expression typing, providers, metadata checks, risk policy, ownership, collision detection, plan/apply, explicit activation, Canvas preservation, and export verification remain the same delivery path. There is no recipe runtime. Complaint Desk has no new behavior.

## Authoring and inspection

`resources.workflowRecipes` maps a stable key to `purpose`, `flow` (the existing flow contract without actions), `steps`, explicit `idempotency` intent, optional `correlation`, and an optional typed `response`. Each step has a stable `name` and a strict `recipe` family. Generated flow keys cannot collide with declared flows. Cross-stage references use the existing `{op: output, name, path}` AST and are type checked after expansion. Branch outputs remain scoped. A `primitive` step permits an existing typed action, never raw workflow JSON.

```sh
node dist/cli/index.js flows recipe list
node dist/cli/index.js --project examples/flows-v3 flows recipe explain
node dist/cli/index.js --project examples/flows-v3 flows compile --out output/v3-review
node dist/cli/index.js flows advise approval
node dist/cli/index.js flows metadata word-template --file template.docx --out template-fields.json
```

The compile-only example includes eight workflows covering nine recipe families, including approval -> typed document child -> PDF identifier notification. It is deliberately unbound to a live environment. Neither its illustrative tables nor its library is provisioned. The separately isolated child-proof example has two connector-free flows.

Recipe explanation includes purpose, lifecycle, primitive AST, generated flow identities, dependencies, outputs, effective risk/effects (including children), connectors, correlation, retry guidance, and activation status. Compilation also emits an external-dependency manifest. More than 30 expanded actions recommends extracting reusable child work; recipe nesting is bounded to six levels and existing primitive bounds still apply. Child synthesis is not automatic.

## Families and contracts

| Family | Behavior and bounds |
| --- | --- |
| approval | Explicit create, create/persist/wait, or startAndWait; outcome branches and failure/unknown handling |
| notification | Existing Outlook sendEmail plus recipient/subject/content, optional condition, idempotency intent, and stop-on-error semantics |
| documentGeneration | External Word template -> binary -> uniquely named DOCX; PDF conversion/save only if explicitly requested |
| auditLog | Explicit Dataverse add or SharePoint item destination; distinct mappings for source, event, actor, reason, before/after, timestamp, correlation |
| reminder | Recurrence, bounded query/top, maxItems no greater than top, serial loop, explicit eligibility and recipient expressions |
| escalation | Reminder semantics plus optional typed Dataverse update under WRITE_INTERNAL policy |
| fileRouting | SharePoint read -> route condition -> uniquely named copy -> optional metadata update; no move/delete |
| postSaveAutomation | Explicit Dataverse event or caller-after-commit contract; secondary steps do not replace Canvas save |
| childWorkflow | Typed invocation of an existing child in this project's solution |

Audit before/after literals must be serialized valid JSON. Dynamic values are typed strings; their JSON meaning is an application contract, not a claim of validated native audit data. Application history does not replace Dataverse native auditing. Post-save caller sequencing and recipient/business authorization still require runtime/persona validation.

## Approvals

`approvals.create` uses `CreateAnApproval` and exposes `name` only. It cannot supply outcome/responses. `approvals.wait` uses `WaitForAnApproval`, takes an existing approval ID, and returns completed outcome/responses after success. `approvals.startAndWait` uses `StartAndWaitForAnApproval`, combines creation and blocking wait, and returns the completed contract. Wait operations compile as `OpenApiConnectionWebhook`, with explicit 1–672 hour timeouts. Create uses `OpenApiConnection`.

The bounded approval types are `firstToRespond` (Basic) and `everyoneMustApprove` (BasicAwaitAll). Read-only tenant discovery also confirmed both Basic and BasicAwaitAll parameter variants; only enums and parameter names are retained in observed-contracts.json. This is definition evidence, not approval execution. Custom/quorum/sequential types are rejected. Approvers must be typed email/UPN or Entra user GUID expressions. Display names are rejected. Literal identities require an intentional configuration rationale. Notifications are an explicit boolean; reassignment is disabled in this bounded adapter. Environment variables and typed inputs are preferred for portable approvers.

`approvals.responses` normalizes optional responder/comment fields through a Select action. `approvals.result` exposes `{approvalId, outcome, responses}`, where response entries contain responderId, responderName, responderEmail, comments and response. Decisions become approved/rejected/cancelled/unknown; unrecognized responses never become approval or rejection. Raw connector fields remain action-specific, and potentially absent values need coalesce as in V2.

The approval recipe compiles an explicit scope, normalized decision branch, failed/timed-out recovery scope, and success continuation. An unknown decision fails the run. Recovery cannot recreate an approval, send mail, create a file or invoke a child; it can record internal reconciliation state, then terminates failed. A timeout does not cancel an existing approval. Create/persist/wait requires an explicit internal persistence action; author it using the request's `name` plus the correlation/source inputs. No polling/later-completion service is silently invented.

Long-running state is reported transitively through child calls. A conservative combined 28-day wait budget is enforced. Synchronous Canvas bindings to blocking approval flows are rejected. Use create/persist with later processing for app experiences that must return quickly. Power Automate service lifetime/connection limits remain applicable.

## Word documents, PDF and conflict behavior

`resources.documentTemplates` holds provider `word`, configured source/drive/file expressions, and a content-control field contract. These are external assets, not arbitrary binary values in flow definitions. V3 supports plain-text controls only, with unique friendly names and exact numeric control IDs. Date picker, rich text, image, repeating, and other controls are rejected by template inspection in this bounded version. Format dates into text before passing them; a declared date does not imply Word date-picker support.

`word.populateTemplate` emits `CreateFileItem`, maps declared fields to `dynamicFileSchema/<controlId>`, and returns binary. `word.convertToPdf` emits `GetFilePDF`, takes an existing source/drive/file identity, and returns binary. String substitution for binary is rejected. Actual DOCX contents are inspected before deployment using authenticated read-only Graph access to the explicitly configured SharePoint item. Field identity/count/control mismatches block deployment. Bounded ZIP/XML parsing rejects unsupported packages and DTDs. Local discovery alone does not establish a live file identity.

A document recipe returns fileName, fileIdentifier and location, plus pdfIdentifier/pdfLocation only when generated. A file path is not claimed to be a shareable URL. The recipe inserts a 60-second availability delay before requested conversion. Output naming requires `conflict: uniqueSuffix`; the generated name contains a GUID before the extension. This makes collision unlikely; it does not establish exactly-once behavior. replaceOwned/fail/version/timestamp modes are not advertised or silently approximated.

**Remaining deployment boundary:** the Word connector's Graph file identity is not assumed equivalent to SharePoint CreateFile's returned identifier. A generated-file PDF locator currently compiles for inspection but is explicitly BLOCKED in planning/metadata validation. Existing immutable Word file identities can pass read-only validation. A verified locator adapter is still needed for deployable end-to-end generated DOCX -> PDF recipes. No document/PDF was produced in the live V3 proof. Binary validators check DOCX structure or PDF signature/end marker; they do not certify visual rendering.

## Child flows and activation

A child is `role: child`, `flowType: instant`, `trigger: {type: manual}`, required scalar input/output ports, and one final `flows.respond`. It is solution-aware by being resolved inside the enclosing project solution. Parents use `role: parent` and `flows.invoke` with exact named typed arguments. Children can invoke other children. Missing outputs, wrong input/output types, non-child targets, foreign-solution identifiers, direct self-calls, cycles and unused dependencies fail validation.

The planner orders children before parents and replaces declared child logical identities with exact owned/deterministic workflow GUIDs. Connection references use embedded connections. A parent inherits all child effects and must meet the corresponding controlledWrite and execution policy. Activation additionally requires each transitive child to be owned, unchanged, deployed and active. Deployment always leaves flows disabled; no automatic child activation occurs.

`workflowAuthorizations` in deployment configuration records the exact environment ID, configurationHash (connections and environment values), compiled definitionHash, plus invoker, connection ownership and business-authorization evidence; approval creation additionally requires approver evidence. Use `flows authorization-context --deployment <file>` to obtain the exact hashes without granting permission. Changing recipient configuration invalidates prior evidence. These are explicit operator attestations, not certified runtime persona tests. Where independent accounts are unavailable, report **RUN-ONLY / PERSONA AUTHORIZATION UNPROVEN**. Connector access alone does not authorize business data access or communications.

## Correlation, ledger and uncertain outcomes

The optional correlation contract has GUID correlationId/sourceRecordId and string parentRunContext. Typed `newGuid`, `utcNow`, and `runId` expressions are available. Passing a correlation value to a child and writing it into an explicit history destination makes it durable; a Compose alone does not persist state. Never use display names as identity.

Intent modes are none, naturalKey, targetIdentity and operatorReviewed. They document design intent without adding durable guarantees. The optional `ledger` mode uses `resources.workflowLedgers`: an explicitly configured existing Dataverse table, metadata contract, connection, GUID primary key, status/workflow/source columns. A stable caller/trigger operation GUID is mandatory. A newly generated run GUID or fixed literal cannot serve as a deduplication key.

Expansion emits CreateRecord with that primary key before effects. Only successful creation unlocks subsequent actions. A duplicate key fails creation and skips effects. An uncertain claim also stops; a prior claim that succeeded remotely is not adopted/retried. Completion uses UpdateOnlyRecord after successful effects. Timeouts/failures leave Claimed unresolved for manual investigation. Explicit runAfter/recovery branches are rejected in ledger recipes so they cannot bypass the claim or mark an unknown result complete. Live metadata must confirm a standard, non-virtual table and the exact primary-key attribute. No ledger table is provisioned.

This is an at-most-one successful claim gate, **not exactly-once execution**. A service can retry/replay, an operator can change keys or ledger rows, and a crash can leave Claimed after the effect completed. The ledger has no automatic takeover, expiry, cleanup, result replay, or retry of unknown external effects. Primary keys should contain no sensitive information. A shared operation-key namespace requires an application-level stable-key policy.

## ALM and evidence

Flows, connection references and environment-variable definitions are solution resources. Current environment values and authenticated connection bindings are deployment data. SharePoint templates/libraries and existing ledger destinations are external/environment requirements. The manifest exposes these distinctions. Export verification checks both parent and child exact definitions/identities, refs/env/Canvas dependencies, and separately reports table definition inclusion. It does not claim external templates are inside the ZIP or cross-environment import succeeded.

V1/V2 artifacts and tests are retained. V3 schemas/catalogs use `.v3` filenames; the main project schema also includes V3. See [the V3 evidence report](../experiments/flows-v3-20260921/report.md) for the precise Schema/Compile/Deploy/Live matrix and resource counts.

## Microsoft references

- [Approvals connector](https://learn.microsoft.com/en-us/connectors/approvals/) — separate action contracts and recipient forms.
- [Microsoft Goal Tracking workflow export](https://github.com/microsoft/Templates-for-Power-Platform/blob/main/Solutions/mpa_GoalTracking/src/Workflows/GoalTracking-ApprovalNotification-C8B6DB70-3313-EF11-9F89-0022482C6025.json) — Basic approval webhook parameters and timeout.
- [Microsoft Hardware Request wait workflow](https://github.com/microsoft/Templates-for-Power-Platform/blob/main/Solutions/mpa_HardwareRequestAndManagement/src/Workflows/WaitforApprovalResponse-ACAF0E9A-6069-EE11-9AE7-00224808117C.json) — WaitForAnApproval identity.
- [Word Online Business](https://learn.microsoft.com/en-us/connectors/wordonlinebusiness/) — CreateFileItem/GetFilePDF, binary responses and template limitations.
- [Child flows](https://learn.microsoft.com/en-us/power-automate/create-child-flows) — same-solution/manual trigger/embedded-connection requirements.
- [Dataverse primary-key creation](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-entity-web-api#setting-the-primary-key-value) — explicit primary-key creation and elastic-table exception.
- [Graph drive item](https://learn.microsoft.com/en-us/graph/api/driveitem-get?view=graph-rest-1.0) — immutable file identity and download metadata.
