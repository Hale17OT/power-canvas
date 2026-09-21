# Implementation status

Updated 18 September 2026. Milestones 0�5 remain experimentally verified in the authorized Default tenant. Native Canvas authoring is now connected and tested, including editable forms and synchronization. The selected features and precise limits are documented in the [implementation report](selected-features-2026-09-18.md). Independent restricted/denied-user security criteria remain deferred.

| Scope | Status | Evidence / remaining work |
|---|---|---|
| M0–1: architecture, IR, validation, state | Implemented; Verified locally | Existing foundation retained |
| M2: interactive authentication and discovery | Implemented; Verified locally; Verified against tenant | MSAL browser sign-in, Windows DPAPI cache, Global Discovery, WhoAmI, Default environment, privilege presence and scoped metadata queries succeeded |
| M3: three-way Dataverse planner | Implemented; Verified locally; Verified against tenant | Real target-bound initial plan; collisions, stale plans, destructive changes and drift block execution |
| M4: saved-plan executor | Implemented; Verified locally; Verified against tenant; Experimental | Real creation, publish, fresh no-op, additive field and second no-op passed; retained partial failures and read-only recovery evidence |
| Experiment 1 | Verified against tenant | Both no-ops passed; Resolution Notes verified; choice-to-text blocked with PF-SAFETY-001 and zero mutation attempts |
| M5 / revised Experiment 2 | Implemented; Verified locally; Verified against tenant; Experimental | Exact seven components, role association, publication, validation, saved queries and fresh no-op verified. Current-account Playwright navigation/forms/views/create/edit/reopen passed; two synthetic records retained. Dedicated solution publisher and Active-layer publisher distinguished. Independent restricted/denied users deferred; the follow-up resolved the original legacy warning |
| Managed ALM / UAT / production | Unsupported in this environment | Default is non-disposable; no managed upgrade/removal experiments |
| Modern client / reveal behavior | Verified against tenant; experimental | Published client type 4; fresh runtime has no legacy warning; command reveals optional fields and saved notes persist. Keyboard focus transfer remains inconsistent. [Report](../experiments/model-driven-behavior/report-2026-09-18.md) |
| Custom connectors | Live bounded pilot verified | New solution-owned TVmaze connector, Maker connection, HTTP 200 with ten shows/posters, Canvas source added. Generic connector deployment remains unavailable. [Guide](connectors.md) |
| Canvas/PFDS DS1 | Local implementation verified; experimental | 17 contracts, tokens/themes, dashboard/list/custom patterns, deterministic semantic IR, three-way property planning and interactive HTML showcase. [Overview](canvas/overview.md) |
| Native Canvas authoring | Live Studio verified; experimental | Native dashboard/master-detail/reveal/edit/create/cancel; independent Dataverse readbacks; manual edit preservation, conflict block and no-op. Player license gate remains. [Report](selected-features-2026-09-18.md) |
| SLA rules | Live bounded worker verified | Elapsed UTC deadlines, conditional escalation write and repeat no-op; no deployed scheduler or notification flow |
| PCF timeline / visual tests | Built and tested | Unmanaged package, actual StandardControl, six responsive/theme baselines plus functional test. Not imported/bound in Power Apps |

## Implemented boundaries

- `auth add/list/show/remove`, `env list/use/show`, read-only `inspect`, live `doctor`, `plan`, saved-plan `apply`, and explicitly confirmed read-only `recover-create`.
- Per-profile MSAL protected persistence; no passwords/secrets in flags, PAC cache scraping, plaintext fallback or automatic permission grants. Public-cloud interactive authentication only; CI federation remains an interface.
- Normalization for ordinary Dataverse columns, stable numeric choice identities, table primary attributes, 1:N lookup relationships, publisher/solution and component inclusion.
- Ownership-aware semantic comparison, operation graph, before/after and verification strategy, source/target/version/fingerprint/hash/expiry binding, deterministic recompilation before apply.
- Exclusive local target lock, durable operation and mutation journals, bounded propagation reads, postcondition verification and ownership checkpoints; unknown writes are never retried automatically.
- Dedicated Default experiment policy: `pfx_PowerForgeExperiment`, `PowerForgeExperimentPublisher`, `pfx_Experiment*`, additive-only, no implicit adoption or broad publish. One separately approved repair removed only two mistaken references inside the new app; the general policy still blocks removal.

## Verification limits

Local tests are synthetic and do not establish tenant behavior. The selected-feature gate passed 129 unit/CLI tests plus lint, typecheck and build; seven PCF browser tests passed. The original baseline was 96. JSON Schema regeneration includes the optional Canvas app section and separate connector/theme/component contracts. Read-only tenant acceptance scripts are separate from normal CI. Six phone/tablet/desktop theme combinations passed the HTML showcase checks. Hosted CI and Linux/Node 24 have not run. No Git repository/remote is configured here.

Live discoveries corrected assumptions: Default environment IDs use `Default-<GUID>`; Dataverse GUIDs need not satisfy RFC UUID version bits; solution membership can include primary columns through root subcomponent inclusion; a table create can outlast 30 seconds and become visible later. Original unknown-outcome evidence is retained. Future writes allow 180 seconds and still do not retry automatically.

## Manual prerequisites and interventions

The user supplied an approved Entra public-client app and authorized a strictly isolated Default environment experiment. Initial sign-in returned AADSTS7000218 until the user registered `http://localhost` under Mobile and desktop applications. The user also explicitly confirmed recovery of the Category created by the timed-out request. Known service-acknowledged role grants, sitemap and app creates were recovered read-only after strict re-verification. No schema designer repair or credential secret was used.

The failed app assembly referenced the built-in Entity table instead of the two custom tables. The platform table itself was not modified or recorded as owned. The user explicitly approved removing just those app references and adding the intended ones; the separately journaled repair verified the exact final set and preserved all five other references. The subsequent role association passed. Publication succeeded remotely, then normalization stopped on the app's changed publisher. Read-only checks established its published unmanaged Active layer and unchanged dedicated solution membership/publisher. Strict normalization now retains both identities; read-only recovery verified two complete published observations before recording the publication checkpoint. Original failures remain intact. See the [Experiment 2 report](../experiments/model-driven-generation/report-2026-09-17.md) and [approved repair record](../experiments/model-driven-generation/repair-proposal-2026-09-17.md).

The user restarted Codex, resolving the local browser initialization error. Existing signed-in Edge access worked for Power Apps, but launching the app reached an Edge `ERR_BLOCKED_BY_CLIENT` sign-in callback. No security setting was weakened. The user signed in to the authorized Playwright fallback, after which generated navigation/forms/views/create/edit/reopen passed. Independent GETs confirmed persisted title, multiline text, choice and lookup values. Two clearly labeled synthetic records remain. The original `clienttype: 2` warning was subsequently resolved by the owned conversion to 4, publication and a fresh browser load. Existing unrelated command labels were not modified; the new PowerCanvas details command is app scoped.
