# Typed workflow commands

Use `flows advise <job>` for bounded jobs such as `uiValidation`, `singleRowUpdate`, `approval`, `notification`, `documentGeneration` or `scheduledWork`; arbitrary prose is not a valid enum argument. UI validation and simple saves may remain Power Fx.

Offline: `flows actions`, `flows providers`, `flows recipe list`, `flows recipe explain [key]`, `flows validate`, `flows compile --out <dir>`, `flows dependencies`, `flows portability`, `flows metadata word-template --file <docx> --out <file>`. Explanation compiles the selected project and exposes business and primitive plans. It is not deployment.

Read-only remote metadata: `flows discover`, `flows inspect <identity>`, `flows connections list`, `flows metadata dataverse`, `flows metadata sharepoint`. These need configured access and may create local outputs. `flows deployment-template` creates local nonsecret configuration scaffolding; placeholders are not verified connections.

Deployment: `flows plan --deployment <file> --out <file>`, then `flows apply --deployment <file> --plan <file>` only with current authorization and unchanged reviewed target/source. `flows authorization-context` reports hashes, not permission. `flows activate <key> --deployment <file>` is separate and may trigger communications or business effects. Reconcile UNKNOWN before retry. Do not infer an activation from a successful apply.

`flows canvas-plan` creates local typed Canvas binding candidates after checking live flow dependencies; it does not modify the Canvas draft. `flows export` downloads an unmanaged package. `flows verify-export --plan <file> --index <file>` checks the supplied export index, not the success of an unperformed cross-environment deployment.

For lifecycle, correlation, idempotency and external-resource contracts, consult the selected checkout's `src/flows/recipes.ts`, `src/flows/schema.ts`, `src/flows/orchestration.ts`, `docs/flows.md`, `docs/flows-v2.md` and `docs/flows-v3.md`. The compiler owns the exact contract; never infer dynamic connector outputs. A status-filtered modified event does not alone prove a previous-value transition or exactly-once creation; define repeat/idempotency semantics explicitly.
