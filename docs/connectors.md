# Bounded custom connectors

The new `connector-compile` command emits Swagger 2, `apiProperties.json`, a provenance manifest and deployment prerequisites. The example is `examples/connectors/complaint-catalog.yaml`. Its `.invalid` hostname intentionally prevents accidental deployment. The separate TVmaze pilot uses a real free media API: a new connector and connection returned HTTP 200 with show images in Power Platform and were added to the native Canvas app. See the [live pilot details](selected-features-2026-09-18.md#real-image-api).

```sh
node dist/cli/index.js connector-compile --spec examples/connectors/complaint-catalog.yaml --out output/connectors/review-1
```

Strict contracts allow HTTPS endpoints without embedded credentials/query/fragment, GET operations, bounded integer query parameters, simple response objects/collections, optional explicit cursor paging and none/API-key/OAuth2 authentication intent. Unknown properties, secrets, aliases, duplicate identities/routes and malformed cursor contracts fail validation. OAuth definitions are a starting artifact; configure app/redirect/scopes and secrets securely through platform connection setup before use.

The GET operation harness accepts an injected transport so authentication remains outside YAML/artifacts. It validates arguments before requests, limits responses to 1 MiB/100 rows, validates JSON types, enforces timeout/cancellation, rejects redirects and reports loaded/empty/unauthorized/forbidden/throttled/unavailable/invalid-response states. Cursor continuation is explicit; it never loops through all pages or automatically retries. Numeric Retry-After up to one hour is exposed to the caller. HTTP-date retry headers and write operations are not implemented.

`checkConnectorDeployment` rejects namespace mismatch, case-insensitive collision, fixture host and unapproved host. Even a valid target remains non-executable pending supported transport, DLP/permissions and connection checks. This does not certify OAuth flows, licensing, DLP or a Power Platform runtime connection.

Tests cover deterministic artifacts, secret/URL rejection, duplicate operations, cursor contract, namespace/collision protection, two fixture pages, empty response, out-of-range query, 401/403/429/503, malformed/oversized response and timeout. These are injected synthetic HTTP fixtures, not a deployed backend.

For another API, the acceptance path is: choose a reachable API; inspect its published contract/auth model; review DLP and permissions; verify a new connector name; create in the dedicated solution through supported PAC/Maker; establish the connection interactively; test success/pagination/authorization/throttling in the platform. Default remains non-disposable and additive-only.

References: [Microsoft OpenAPI connector definition](https://learn.microsoft.com/en-us/connectors/custom-connectors/define-openapi-definition), [Maker custom connector workflow](https://learn.microsoft.com/en-us/connectors/custom-connectors/define-blank), [PAC connector commands](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/connector).
