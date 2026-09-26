# V2.1 native provider certification candidate

`certification.json` is a strict, explicit `powercanvas.solution/v1` fixture. It declares only the proposed certification resources and the historical experiment solution/publisher identity. It has no environment binding, authentication profile, credentials or business records. It does not authorize provisioning.

The stable `pfx_ExperimentCertification` namespace proposes:

- Two user/team-owned tables: a probe and a category. This permits Basic-depth read grants for both.
- Two primary names and eight additional columns: text, memo, integer, decimal, boolean, date-only, user-local datetime and global choice.
- One global choice with Draft/Active/Closed values `731420100`–`731420102`.
- One restrictive category lookup relationship and one alternate key on `ExternalCode`.
- One public view and one main form using text, memo, choice and lookup controls. Numeric/date/boolean columns are not placed on the form.
- One model-driven app, two navigation groups, explicit components, a read-only role and an app-role association. Both Read grants use Basic depth. No user/team assignment is declared.

The app publication policy is `manual`. Currency, multichoice, data seeding, flows and Canvas changes are excluded.

V2.1a uses this minimal fixture directly as desired state. Run `solution certification-plan --spec examples/solution-v2-live-provider/certification.json --env experiment-default --out <fresh-directory>` with the original experiment project selected through `--project`. The command reads that project's binding, full ownership receipts and historical context, but never merges historical resources into certification desired state. The existing native and unified compilers remain authoritative. Authentication profiles are never copied or created.

The source solution display name remains `PowerCanvas Experiment`. The explicit existing bound container uses `displayNamePolicy: preserveExisting`, retaining live/receipt `PowerForge Experiment` without an update. This narrowly scoped policy never ignores actual receipt drift or stable identity mismatches. The historical Experiment 1 evidence remains unchanged and invalid for this fixture. The distinct `PROVIDER_CERTIFICATION` manifest records attempt intent, not proof or approval.

Create-only certification emits no PublishXml and the app stays on manual publication. Historical resources are context, not certification targets. Before future execution, require fresh target/ownership checks, collision discovery, an exact source-bound plan and explicit authorization. V2.1a intentionally provides no certification apply entry point: existing executors reject certification manifests. Do not edit a saved plan to bypass that boundary.
