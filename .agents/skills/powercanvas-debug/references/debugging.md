# Evidence before recovery

Local `doctor --json` checks prerequisites; `doctor --live` or `--env` reads the target. `canvas authoring doctor` connects to official MCP and writes local evidence; it requires current Studio observation. `canvas authoring recover` also connects and acquires live source, then emits an owned-harness removal plan. It is not offline and does not perform the source write. Consult command options rather than guessing them.

Read `capabilities --authoring-evidence <directory> --json` to assess recorded diagnostic/source artifacts without connecting. Fresh artifacts still do not authorize a write. Old evidence is historical; a task journal cannot make it fresh. The existing repository `docs/canvas/design-v45.md` describes source-bound diagnostic capture. Its task-specific runner is not a generic environment configuration utility.

Collect version/commit, sanitized launch overrides, current URL identity, Studio support IDs, connection epoch, capability ladder, timestamps, HTTP status if exposed, safe response details and request IDs. Use `buildAuthoringSupportBundle` for a curated local package. Missing historical response bodies remain missing. Never attach source formulas, business data, cookies or auth caches.

Interpret errors semantically: STALE → reacquire/replan; CONFLICT → compare manual/owned changes and stop adoption; UNSUPPORTED → report exact capability/maturity and a validated alternative if suitable; BLOCKED → identify failed gate; UNKNOWN side effect → reconcile. A changed source hash or stale plan cannot be fixed by changing the expected hash.

At an external platform blocker, state what passed, where execution stopped, what could not be verified, and the material condition needed for a new bounded attempt. Do not change acceptance/certification because transport availability changed.
