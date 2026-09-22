# Canvas authoring diagnostics

V4.5 adds diagnostics to the existing official stdio client and source providers. It does not replace V4.4 lifecycle/recovery safeguards. See [observed result](design-v45-report.md).

Observe the existing app in Studio first: current complete edit URL, loaded tree, Editing role, coauthoring enabled, autosave disabled and support/session details. Keep the tab open. The current runner is intentionally scoped to `examples/canvas-native-complaints/bindings.json` and the known same-tenant login hint; it is not a generic tenant discovery tool. It verifies URL app/environment against that binding.

Write a fresh local observation JSON:

```json
{
  "studioUrl": "<complete URL copied from the current Studio tab>",
  "observedAt": "<current ISO UTC observation timestamp>",
  "loaded": true,
  "role": "Editing",
  "coauthoringEnabled": true,
  "autoSaveDisabled": true,
  "expectedSemanticHash": "<reviewed protected draft semantic hash>"
}
```

Then, only when a new diagnostic is justified:

```powershell
npm run build
node scripts/canvas-authoring-diagnose.mjs current-observation.json output/new-diagnostic-directory
```

The runner uses the existing workspace .NET SDK and official MCP 1.1.5, validates the observation freshness, configures from the URL, then initializes, connects, lists controls, describes Button, discovers APIs/data sources, syncs source and runs the source doctor. It never compiles, saves, publishes, removes accounts or retries. It closes only its own MCP process and records its exit. Output files use exclusive creation; choose a new output directory.

The ladder records an affirmative authentication observation separately from successful Studio attachment. A timeout without a signed-in result means authentication is UNPROVEN, not necessarily failed. Downstream discovery remains NOT_REACHED when session resolution fails. A source mismatch after successful transport yields recovery-required health.

Provider `health()` reflects acquisition evidence plus current doctor/recovery information; it supplements static capabilities. `HEALTHY` is not independent write authorization. Existing source freshness, identity, exact migration, independent PAC, ownership and explicit preview-review checks still apply. PAC never has write capability or write-eligible health. Transport health alone does not revoke evidence-bound certificates.

`reconnectStability` requires exactly three fresh acquisitions in distinct epochs, doctor/control success, the same app/environment and the protected semantic hash. Do not omit a failed attempt to turn 2/3 into 3/3, and do not count saved-baseline cycles as protected-draft cycles.

`buildAuthoringSupportBundle` selects metadata explicitly, sanitizes nested credential shapes, bounds text/arrays/depth and hashes the sanitized content. Feed curated configuration, identities, diagnostics, outcomes and limitations. Do not attach source formulas, business data, account caches, HTTP cookies or raw logs. Preserve diagnostic IDs and error codes; mark unavailable historical response bodies/headers as unavailable. Bundles are local artifacts and are not submitted automatically.
