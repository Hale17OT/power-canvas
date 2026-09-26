# Credential acquisition and discovery reproof (V2.1d)

The existing `dataverse transport-doctor` command initializes an independent credential context for each of three read-only certification preflights. Its CLI and existing named-profile binding remain unchanged. It never creates, selects, copies or migrates an authentication profile, uses PAC credentials, changes a binding, applies a plan or promotes a capability.

## Credential lifecycle

The profile and binding are loaded once at cycle initialization. The existing OS-protected MSAL cache and public-client application are used. Silent acquisition for the exact stored home account obtains credentials for Dataverse, then global discovery, sequentially before target discovery and WhoAmI. A missing account never falls back to another cached account. Initialization and silent-acquisition errors preserve allowlisted class, code, suberror, correlation GUID and AADSTS number without raw provider messages or causes.

Subsequent reads reuse private in-memory grants bound to profile alias, tenant, client, home account, allowed environment, binding and exact audience. Reuse ends after five minutes, below 60 seconds remaining lifetime, or when MSAL's `refreshOn` is due. Expiry/refresh boundaries request `forceRefresh`; an age-only recheck lets MSAL use its normal cache policy. The provider validates account, tenant and expiry on every new grant. WhoAmI must match the expected principal. In-memory identity changes invalidate context immediately; configuration and ownership are checked again from disk before accepting the cycle. No context or observation is reused across cycles.

Concurrent requests for the same context/audience/refresh requirement share one pending acquisition. All waiters receive its outcome. Pending state clears on success or failure. Generic provider failures are not retried automatically; a later explicitly new request can acquire again. Interaction, consent and missing-account errors stop that cycle, with a new explicit cycle required after diagnosis. No interactive fallback or browser launch occurs. Normal write clients do not opt into this read-only cycle context.

This follows Microsoft's [silent/cache acquisition guidance](https://learn.microsoft.com/en-us/entra/msal/javascript/node/caching) and [interactive-required boundary](https://learn.microsoft.com/en-us/entra/identity-platform/msal-acquire-cache-tokens). The installed MSAL `AuthenticationResult.fromCache`, `expiresOn`, `refreshOn` and correlation ID provide the observable result facts. `fromCache: false` on completed silent acquisition is reported as a silent refresh success; internal refresh attempts, intermediate HTTP calls and provider-internal retries are not independently measured.

## Evidence and budgets

`auth-events.ndjson` records provider starts/completions and successful context reuse/single-flight deliveries. `auth-health.json` counts provider calls, measured maximum overlap, cache/silent/refresh outcomes, application-level auth retries (zero), reuse and failures. Provider calls include exact-account lookup plus silent acquisition; an account-lookup failure counts as a provider call even though `acquireTokenSilent` was never reached. `auth-events.json` is the finalized structured copy. Startup configuration/cache failures are separate initialization events. Expiry is logged only in coarse buckets. No runtime grant, cache contents, token, authorization header, secret, raw exception or account display name enters evidence.

The original instrumented baseline used per-request acquisition, with no context reuse, before changing behavior. The internal `credentialMode: observe` option remains available for controlled regression tests, not as an automatic fallback. Normal certification planning and the doctor use cycle mode.

The V2.1c HTTP policy remains unchanged: allowlisted discovery GET only, at most three dispatch attempts, 1/2-second backoff or validated Retry-After within existing budgets. Authentication has zero application-level retries; it is not part of the HTTP retry budget. POST/PATCH/DELETE and security writes receive neither automatic GET retries nor implicit discovery context opt-in. Read-only clients reject mutations before acquiring a credential.

Both NDJSON writers serialize all pending records, seal against further appends, flush and close before hashing actual saved bytes. Local indexes use these hashes. Failure support bundles add sanitized `auth-events.json` to the existing strict transport allowlist. Private full observations and plans remain outside support bundles and under ignored `output/`.

## Stability gate

The doctor requires three complete cycles with healthy authentication, complete observations, compatible ownership, semantic plans, historical classifications and the exact reviewed manifest. Each plan must contain 21 certification roots, two existing dependencies, zero blockers, no historical updates and empty publication scope. Volatile plan IDs/timestamps are excluded from comparison. It separately reports authentication health and read health; unfinished discovery cannot count as healthy complete reads.

Three clean cycles yield `STABLE`; completed cycles with recovered GET transients yield `OPERATIONAL_WITH_RECOVERED_TRANSIENT`. Any authentication failure or missing auth evidence blocks the gate. Unrecovered reads or incompatible plans also block it. A stable verdict only permits replanning a separately authorized certification. No provider certification, persona certification, mutation authorization or capability promotion follows from this evidence.
