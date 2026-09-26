# Dataverse discovery transport (V2.1c)

`dataverse transport-doctor` runs three fresh certification preflights using an existing PowerCanvas binding and its named MSAL profile. It never selects PAC authentication, changes profiles, applies a plan, publishes, uploads or promotes a provider capability.

```sh
powercanvas --project <bound-project> --non-interactive --json dataverse transport-doctor \
  --env <existing-binding> \
  --spec <reviewed-certification.json> \
  --reviewed-manifest <previous-review/manifest.json> \
  --expected-principal <Dataverse-user-guid> \
  --out <fresh-private-output-directory>
```

The parent output directory must exist; the run directory must not exist. Keep all evidence under ignored `output/`. Full observations, ownership and fixture files are private tenant evidence. A support bundle should include only the sanitized transport files, not the cycle observations or credentials.

## Request contract

The existing `DataverseHttp` records STARTED before credential acquisition and a completion record for each attempt. An optional sink persists NDJSON immediately. Certification preflight supplies this sink to startup environment discovery and WhoAmI as well as schema/model discovery. A failed request retains phase, safe resource/function path, query structure, page index, continuation presence, request fingerprint, client request ID, any recognized service correlation GUIDs, HTTP status, normalized cause and elapsed time. Incomplete STARTED records are not successes.

Path argument values, filter literals, GUID filter values, opaque continuations and full URLs are omitted. Query evidence retains select/expand names and filter fields/operators. Request fingerprints and continuation hashes distinguish requests without storing literal values. Raw exception names/messages/causes, headers, cookies and response bodies are not persisted. Only known exception names/codes are admitted. Service messages in discovery errors are replaced by a fixed safe explanation; bounded service error codes are retained.

Categories cover target/WhoAmI, permissions, publisher, solution, solution components, tables, attributes, choices, relationships, keys, forms, views, apps/components, sitemaps, roles, app-role access, commands and web resources. Unknown operations are visible as unclassified and do not receive retry eligibility.

## Retry policy

Retries require both GET and a recognized discovery resource/function path. Business-record GETs and arbitrary bound functions are excluded. POST, PATCH, PUT and DELETE never receive automatic retries, including table/AppModule creation, role grants and publication. Their uncertain-outcome behavior is preserved.

There are at most three attempts per logical read/page, with no outer cycle replay. Retryable responses are 429, 500, 502, 503 and 504. Recognized temporary network causes are EAI_AGAIN, ECONNRESET, EPIPE, UND_ERR_SOCKET, ETIMEDOUT and Undici connect/header/body timeout codes. Unknown exceptions, malformed JSON, permanent DNS failures, TLS failures, connection refused, caller abort, 400, 401, 403, 404 and 412 stop without retry.

Backoff is 1 then 2 seconds when no server hint exists. Valid Retry-After seconds or HTTP dates take precedence. A malformed hint or a delay exceeding either the 60-second single-wait or total-wait budget stops discovery; it is never clamped to an earlier retry. Successful recovery is recorded as RECOVERED_TRANSIENT. SIGINT/SIGTERM cancel the doctor's requests and retry waits; authentication library calls retain their existing cancellation behavior.

Microsoft documents seconds in Dataverse's [Retry-After response](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/api-limits). HTTP and transport failures remain distinct; code matching follows the [Undici error contract](https://github.com/nodejs/undici/blob/main/docs/docs/api/Errors.md).

## Client configuration and timing

The existing Node built-in fetch/global Undici dispatcher remains in use. No dispatcher, proxy, VPN, DNS, IPv4/IPv6 or socket configuration is changed. The application deadline remains 30 seconds per GET attempt and 180 seconds per write, spanning fetch and body consumption but excluding credential acquisition. Connect/header/body timeout defaults belong to the active dispatcher and are not claimed as independently verified. Timeout phase is reported only when the cause identifies it; a general deadline before headers is `unknown`, not an invented connect timeout.

Schema discovery is serial. Model resources are visited in provider order with concurrent published/unpublished reads. Sitemap identity filters produce up to eight concurrent reads for an owned sitemap. This bounded fan-out is unchanged. Read groups now drain all their outstanding promises before raising a failure, so evidence cannot finish while sibling requests are still running. STARTED/completion timestamps expose overlap and bursts. Requests over five seconds are diagnostic slow requests, not automatically failures. Connection pooling/keep-alive remains the dispatcher's behavior; actual socket reuse is not measured.

Each cycle creates fresh HTTP/discovery instances. Table memoization is local to a single observation; no previous cycle's metadata satisfies a read. MSAL's existing protected authentication cache remains in use and is not copied, deleted or reconfigured.

Provider order begins with target and permissions, all table identities, publisher/solution/membership, scoped schema metadata, then model membership/root business unit and typed model resources. The authoritative exact order is the run's phase timeline, including both published/unpublished and each sitemap identity read. V2.1b retained only successful calls, so its exact failed endpoint/cause cannot be retroactively established.

## Three-cycle gate

Each cycle authenticates, verifies the target/principal, discovers a full observation and generates the existing native/unified certification plans. A failed required read throws before observation completion and prevents planning. Diagnostic partial evidence is not a planner input.

The gate requires all three cycles, complete observations with compatible semantic fingerprints, unchanged ownership, equivalent source/target/policy/operations/blockers, exact reviewed manifest, and zero native/unified planning blockers. Plan IDs and freshness timestamps may differ. Authentication/permission failure or cancellation stops early without substituting a profile.

- Three clean compatible cycles: HEALTHY.
- Three compatible cycles with bounded successful recovery: DEGRADED_RECOVERED, requiring review before certification.
- Any unrecovered failure, incomplete cycle or material difference: UNSTABLE (or BLOCKED_AUTH/BLOCKED_PERMISSION where proven).

Even HEALTHY proves transport only. A subsequent separately authorized certification task must generate one final fresh plan and pass the existing execution review gate. Ordinary and unified apply still reject review-only certification manifests. Historical ownership, solution labels, Complaint resources and capability maturity are unchanged.

## Evidence and tests

Each cycle retains requests.ndjson, transport-summary.json, client configuration and, only after full discovery, observation/native/unified/manifest artifacts. The aggregate report compares fingerprints and summarizes clean/recovered/failed requests, retry counts/delays, HTTP 429/5xx and transport failures, slowest request and duration. SHA-256 indexes protect the local evidence.

Tests cover status/cause classification, correlation retention, hostile secret-bearing inputs, page-local attempt budgets, Retry-After dates and bounded delays, body failures, interrupted waits, nonretryable reads, write-negative cases, partial discovery, concurrent-read draining and semantic three-cycle acceptance. Agent routing sends discovery transport failures to diagnosis, never automatically to authentication repair or apply retry.
