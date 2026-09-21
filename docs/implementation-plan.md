# PowerCanvas implementation plan

Baseline: the complete attached research report dated 17 September 2026 and the master implementation prompt. The workspace initially contained only `research/`; it was not a Git repository. Existing research is retained unchanged.

## Immediate delivery: milestones 0 and 1

1. Record architecture, IR v1alpha1, capability/provider contracts, identity, four data models, credential boundary, and the exact Experiment 1 protocol before writing the core.
2. Create a single private npm package with strict TypeScript and internal modules. Split packages only when a second consumer or runtime justifies it.
3. Implement safe project initialization, bounded YAML loading, strict structural and semantic validation, stable identities, capability reporting, typed errors, redacted logging, and local state/journal primitives.
4. Ship `--version`, `init`, `validate`, and an explicitly local `doctor`. Do not register nonfunctional auth, plan, apply, test, build, or deploy commands.
5. Exercise the real compiled CLI using the complaint-management template; test invalid input, identities, safety boundaries, state isolation/locking, and machine output. Run lint, typecheck, tests, and build in CI.

## Subsequent milestones and gates

| Milestone | Work | Exit evidence |
|---|---|---|
| 2 | Secure MSAL credential adapter, nonsecret auth profiles, explicit environment discovery and identity verification | Correct audience, wrong-tenant denial, useful live doctor; no plaintext fallback |
| 3 | Dataverse metadata reads/normalization, desired-resource compiler, three-way semantic diff and saved plans | Read-only planning, ownership conflicts, safe additive and blocked destructive examples |
| 4 | Dependency-ordered metadata creates, solution membership, publishing, postcondition reads and journaling | Experiment 1 passes against a disposable tenant, including apply → fresh plan → no changes |
| 5 | Forms/views/navigation/AppModule, explicit role privileges and app-role association | Experiment 2 works for limited and denied personas without designer repair |
| 6 | PAC adapter, validation, managed export and UAT import of identical artifact | Clean-target verification with version/hash evidence |
| 7 | API/browser/persona/recovery acceptance suite | Declared v0.1 gates pass; manual actions enumerated |

The original first deliverable was milestones 0 and 1. The continuation has since implemented the bounded M2–M5 experiments and PFDS DS1/connector local capabilities; see current status and experiment reports. This is not completion of the full v0.1 application factory. Remote milestones are never marked complete from mocks or generated files.

## Reconciliation with the research

No unsupported production path is adopted. The following deliberate refinements resolve differences in illustrative examples:

- The report recommends a small .NET worker eventually; the core remains TypeScript. The Canvas authoring experiment uses the official Microsoft .NET MCP server with a workspace-local SDK; it does not introduce a second application framework.
- Alternate keys appear in research Experiment 1, but both scope discussions condition support on live readiness tests. They are excluded from the first schema slice and must be added behind an explicit capability later.
- The research's broad YAML example includes flows, SharePoint, email columns and deployment settings. This first schema rejects those sections/types rather than silently accepting unimplemented semantics. `text` can describe an email string without claiming specialized email behavior.
- A primary name column is embedded in the table-create payload, not created a second time as an independent operation. A lookup is owned by its relationship definition, not duplicated as an ordinary column create.
- Model-driven intent may be structurally validated before its provider exists. Platform support and PowerCanvas implementation availability are separate fields; offline validity does not imply deployability.
- `required: application` is an application requirement, not a universal data-layer constraint. Auditing metadata also depends on organization settings.
- Choice values are explicit integers; presentation order and label changes never allocate replacement values.
- No Canvas packing, private PAC assemblies/cache scraping, specialized expression authoring, Test Engine, ALM Accelerator, automatic consent, or generic rollback is introduced.

Library choices were checked against [Commander](https://github.com/tj/commander.js), [Zod](https://zod.dev/json-schema), [YAML](https://eemeli.org/yaml/), and [Vitest](https://vitest.dev/guide/). Zod is the authoritative structural schema and emits JSON Schema; reference, capability and platform-semantic rules remain a separate validation pass.
