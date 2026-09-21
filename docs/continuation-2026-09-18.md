# PowerCanvas continuation audit and working plan

Completion checkpoint: the legacy client conversion and field-reveal behavior are published and live verified; local connector compilation and PFDS DS1 are implemented, with 118 tests passing. The supported native Canvas experiment created an isolated app, verified solution membership and prepared Studio; the official MCP connection timed out before authentication/session establishment. Native generation remains pending that user sign-in step. See the detailed behavior/Canvas reports and `docs/next-steps.md`.

Research and implementation began 18 September 2026. Existing architecture, ADRs, IR, provider contracts, planner, executor, ownership/journals and implementation status were inspected. Baseline: lint, TypeScript and all 96 tests passed. One private TypeScript package remains appropriate. There is no Git repository configured in this checkout.

Completed before this phase: M0–M5 implementation, live schema Experiment 1, and the user-revised current-account model-driven Experiment 2. Restricted/denied personas remain deferred. Canvas authoring and custom connectors were not implemented. The published app had clienttype 2 and displayed a legacy-client warning even with forceUCI=1.

Work sequence:
1. Explicit Unified Interface creation and owned Web→UCI conversion; journal, published readback and browser check.
2. Optional-field reveal contract, deterministic JavaScript, additive form merge, app-scoped modern command, behavioral and live persistence tests.
3. Bounded connector contract/compiler, synthetic API fixture and error/auth/deployment prerequisites. No guessed real service or credentials.
4. PFDS research/licensing, semantic schemas, tokens/themes, component registry, compiler, DS-1 dashboard/list example and local visual preview; then supported live authoring feasibility.
5. Evidence, limitations and concrete next-feature choices.

All live work remains in the non-disposable Default environment and the dedicated unmanaged PowerCanvas experiment solution. Ownership and collision checks remain mandatory. No existing tenant resources, security-role assignments, tenant-wide settings, managed upgrades or destructive API experiments are authorized by this phase. The user expressly authorized fixes/extensions to resources created by PowerCanvas in the earlier phase.

## Modern client findings

[Microsoft's AppModuleType enum](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.unifiedservicedesk.commonutility.appmodulemanager.appmoduletype?view=dynamics-usd-3) identifies Web=2 and UnifiedInterface=4. The [AppModule reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/appmodule) exposes ClientType as a writable integer. New app creation now sets 4 explicitly.

The live PATCH created an unpublished Active layer, preserving the published Web layer until publication. Initial readback correctly stopped under the older published-only publisher rule. Recovery checks the acknowledged request, exact owned GUID, complete postcondition and two identical observations using GET only. The observer accepts an unpublished Active layer only when the already-owned app's published counterpart independently passes publisher/membership checks. Original failure evidence remains intact.

## Form interaction decisions

Use the supported [setVisible Client API](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference/controls/setvisible), executionContext on load and PrimaryControl for the command. Optional fields only: hiding a required control can change client validation. Visibility is not access control. The generated script has no network calls, DOM access, field-value mutations or automatic saves. Repeat selection hides fields; reopening resets visibility and preserves saved values.

The [modern command designer](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/use-command-designer) scopes commands to an app. Use it for the experimental command binding rather than rewriting existing ribbon commands. The existing unrelated New/Save command labels are outside PowerCanvas ownership.
