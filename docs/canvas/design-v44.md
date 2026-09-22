# Native authoring lifecycle and production core (V4.4)

V4.4 adds local reliability and evidence gates. Live authoring recovery remains blocked by HTTP 422; see [the run report](design-v44-report.md). These mechanisms are not proof that native certification is repeatable yet.

## Lifecycle

`AuthoringLifecycle` records app/environment, connection epoch, source hash, state and UTC time. The states are DISCONNECTED, RECONNECT_REQUIRED, CONNECTED_CLEAN, CONNECTED_UNSAVED_SOURCE, CONNECTED_VALIDATED, CONNECTED_RUNTIME_PREVIEW, RECOVERY_REQUIRED and BLOCKED.

Connect always issues a new epoch. Doctor prerequisites must pass, then a fresh official source acquisition must match app, environment, epoch, contents and inventory hashes. A reconnect discards prior source/checker authority. Failed acquisition also invalidates authority. A serialized event log cannot be loaded as write permission.

A batch declares an exact ownership receipt before writing. Ownership includes owner `PowerCanvasCertification`, purpose, ephemeral flag, protected draft/candidate/subtree hashes and the complete control inventory. A matching screen name alone is insufficient. Recovery subtracts only that subtree and requires the remaining source to equal the protected draft. Extra screens, changed business formulas or unexpected harness controls block cleanup. An absent harness produces `ALREADY_RESTORED` with no repeated removal.

Semantic recovery normalizes only the observed `Control@version` suffix. It does not ignore formulas, properties, children or ordering. Control-version compatibility remains a separate certificate capability concern.

`CertificationTransaction` uses the existing `AuthoringMcpProvider` and `compile_canvas` action. It reacquires source immediately before a write, rejects concurrent changes, reads back even after a compiler failure, and requires the expected semantic source. Checker acceptance and cleanup verification remain explicit. A batch cannot complete while any owned addition remains. This is a verified reversible workflow, **not atomic rollback**.

The V4.4 runner is `scripts/canvas-certification-v44.mjs`. It validates current autosave/coauthoring observations, runs discovery/doctor, checks independent PAC lineage, persists ownership and the proposed effects, then uses that transaction. It supports install and cleanup, never save/publish. An installation remains incomplete until runtime evidence and later cleanup are linked. The V4.3 runner remains a historical compatibility tool; use the V4.4 runner for new certification batches.

No official screen-deletion tool has been established. If compiling a directory without the harness leaves the screen present, readback fails and recovery remains required. Do not treat file omission as proven deletion or retry blindly. Any UI removal still needs the fresh official recovery plan and exact ownership proof first.

## Read-only recovery command

```powershell
node dist/cli/index.js canvas authoring recover `
  --studio-url '<existing app Studio URL>' `
  --bindings examples/canvas-native-complaints/bindings.json `
  --coauthoring-evidence '<fresh hash-bound settings observation>' `
  --protected-source output/canvas/native/v42-focus-review `
  --ownership output/design-v44/verified-core/v43-harness-ownership.json `
  --out '<new empty output directory>'
```

This command connects, runs doctor, acquires source and emits a recovery plan. It **never removes or compiles anything**. The V4.3 receipt is derived from its recorded exact readback, with a fresh UI backup corroborating the entire draft. It still requires a fresh official acquisition before use.

Connection errors have bounded classifications: SESSION_NOT_READY, SESSION_STALE, AUTHORING_REJECTED, SOURCE_EMPTY, SOURCE_MISMATCH, CLEANUP_REQUIRED and UNKNOWN. Diagnostic records include HTTP status and server session ID where returned, and a hash of the original diagnostic. Raw server bodies, authentication URLs and credentials are not exported. HTTP 422 does not establish backend cause. Public CLI errors now preserve the classification rather than reporting a generic local failure.

## Production confidence policy

`canvas-production-core-v1` accepts evidence-verified NATIVE_VALIDATED variants; publishing is not required and PRODUCTION_BENCHMARKED remains separate. The checked-in manifest is currently **INCOMPLETE**. Its six entries retain source, factory, capability and evidence hashes. Navigation, data, forms, overlays and commands are empty because no corresponding V4.4 certificates were earned.

```powershell
node dist/cli/index.js canvas production-core `
  --request examples/design-v4/production-core-v1.request.json `
  --certificates output/design-v43/static-certification/selection-manifest.json `
  --out '<new output file>.json'
```

The existing evidence loader verifies native artifacts and current factory/capability fingerprints before issuing a production selection context. A core restriction can narrow that context but cannot promote maturity. Capability groups reject duplicate or unrelated variants. Dependency closure rejects missing/stale variants and cycles. Factory/capability hashes bind primitive implementations without separately certifying identical text/container primitives repeatedly. Embedded DataTable status badges additionally require StatusBadge certification. Explicit critical pattern dependencies must be included in the request graph.

Use the returned restricted context with the existing composition/generation pipeline. `selectCoreVariant` accepts an exact certified preferred variant or a documented certified fallback, and otherwise blocks. Existing production emission guards remain intact; experimental output is not promoted by this manifest.

Three structural requirement profiles cover desktop operations, desktop read-oriented work and mobile tasks. They currently report their missing dependencies rather than producing falsely certified designs. ChartCard is not required for the read-oriented profile. General-business/mobile readiness remains NOT READY; analytics and documents are LIMITED; advanced interaction is NOT READY / PCF_CANDIDATE where appropriate.

Typed field certificate issuance and complete native Form.Updates evidence remain unfinished. Therefore field production gates are deliberately closed. Completing that evidence/format is still required before this provisional manifest can be accepted; do not replace the gate with caller-supplied `nativeValidated` flags.

## Evidence boundaries

The six V4.3 static certificates and twelve app-specific breakpoint samples are retained. No responsive/factory implementation changed in V4.4. The breakpoint results do not automatically certify untested form/overlay layouts. Screen1's existing readable-name suggestion remains documented; no internal screen was renamed.

Unit tests cover transport/lifecycle behavior using synthetic local source. Structural Chromium tests cover offline layouts. Neither proves a successful Microsoft reconnect, physical keyboard/screen-reader access, business authorization, Dataverse Form.Updates, or cross-environment ALM.
