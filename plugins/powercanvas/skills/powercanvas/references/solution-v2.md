# Dataverse-native solution delivery

Use the existing `powercanvas.solution/v1` schema. V2 extends it; there is no second compiler. Prefer a model-driven experience for relational administration when the audience/job justifies it. Use Canvas for tailored self-service/mobile work. Distinct jobs may justify both; viewport differences do not.

Inspect `docs/solution-v2.md`, `capabilities` and `agent commands` for exact support. Compile the requested schema/forms/views/navigation/roles through `solution plan`. Global choices have stable numeric identities; keys need business reasons. Main forms currently support text, memo, choice and lookup controls. Other types can exist in data/views but must not be silently substituted on forms.

Specify persona table scopes, model app access and flow access separately. Static role checks do not prove effective user/run-only access. Do not assign people or create teams implicitly. Reductions/revocations and destructive schema changes are blocked; never bypass ownership or adopt a collision.

For authorized native deployment, use the resolved project with existing `inspect --model-driven-experiment` and `plan --unified-dataverse`. This preserves native target, source, journal, ownership and readback gates. Default environments retain the original isolated experiment policy. Model publish defaults to manual under unified planning; `afterValidation` plans ValidateApp and exact-app publication before access. The generic publication flag cannot override `manual`; access remains a supported deferred requirement.

`solution apply --stages DATA` selects the existing atomic native plan (data and model components together). `--stages AUTOMATION` selects existing Flow apply when its dependencies are satisfied. Unselected prerequisites must be verified no-ops/external resources; a blocked Canvas provider never authorizes skipping a required dependency. Unknown outcomes stop for reconciliation without retry.

`solution dependencies` performs scoped platform reads using exact discovered IDs. `solution check` actually invokes PAC; the selected ZIP is uploaded to Microsoft and therefore needs an authorized `--allow-upload` invocation. Keep the existing PAC authentication profile. Do not repair authentication or create tenant resources merely to obtain proof.

Index exports using `python scripts/index-flow-export.py <zip> <index.json> --solution`, then `solution verify-export`. Native definition presence is not full semantic equivalence or import proof. Report runtime/persona/Checker/export evidence separately. Offline compiler work may legitimately report zero tenant mutations and pending live validation.

V2 provider engineering closes at validated draft convergence. Query the actual `nativeProviders` capability registry for bounded proof; do not infer all operations from a provider-level label. Publication/access deployment certification is a separate track. Recheck existing frozen assets with `solution certification-plan --spec <reviewed-fixture> --env <existing-binding> --out <fresh-private-directory> --regression`. This is GET-only and creates local evidence; it verifies ownership, strict metadata, journal outcomes, 20 NO_OP roots and the accepted manual publication deferral. It never provisions replacements or changes authentication.
