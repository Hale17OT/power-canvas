# Native Canvas and selected feature implementation

Public copy: live account, app, environment and session identifiers are redacted. Original evidence remains local.

All remote work targets the non-disposable Default environment and PowerCanvas-owned resources in `pfx_PowerForgeExperiment`. No existing third-party resources, managed upgrades, removal tests, broad role grants or notification flows were changed.

## Native Canvas

App `<identity-redacted>` now contains a native dashboard and Complaint master-detail form. `canvas native` generates live-discovered `.pa.yaml`; the official Microsoft Canvas authoring server applies reviewed source to the open coauthoring session. This is not offline MSAPP compilation.

The complaint page has search, selection, New/Edit, Show/Hide details, Save and Cancel. Description and Resolution Notes appear on request. SubmitForm owns persistence; LastSubmit supplies the receipt. Dirty navigation is guarded, invalid forms cannot submit, and failures retain edits. Dataverse choice values are retained separately from display labels; live tests verified a Normal default on create and High on existing-record selection. Native tests created and edited synthetic Dataverse rows, independently read back saves, and verified cancellation and dirty navigation.

Synchronization keeps both generated intent and normalized Studio receipts. It preserves independent Studio edits, blocks competing changes and name collisions, blocks missing owned controls/removals, and rechecks the remote source hash immediately before compile. A live Studio subtitle edit survived reconciliation; a competing generator edit was blocked with zero compile calls. Explicit card MaxLength avoids a Microsoft exported-template placeholder. Inspect the validation text: the official tool can return `isError:false` with failed validation.

Use fresh directories:

```powershell
node dist/cli/index.js --project examples/canvas-native-complaints canvas native --app complaintPortal --bindings examples/canvas-native-complaints/bindings.json --out output/canvas/native/next-generated
node scripts/plan-native-sync.mjs <previous-generated> <previous-receipt> <next-generated> <fresh-Studio-sync> <reviewed-output>
node scripts/canvas-authoring-session.mjs <identity-redacted>
```

The authoring session accepts explicit JSON-line tool requests. Source generation never applies implicitly. Keep manifests, plans, validation results and post-sync receipts together. Studio preview works; the standalone player currently reports **You need a Power Apps plan**. No trial or purchase was initiated. Restricted personas, large-data delegation, offline use and production ALM remain unverified. The accessibility checker reports 27 missing-tab-stop errors on static classic labels plus one screen-name suggestion; these remain open pending screen-reader review.

## YAML model-driven commands

`apps.<app>.commands` declares the label, target reveal form, action, tooltip and sequence. Creation binds the app, table and generated JavaScript library, passes PrimaryControl, adds solution membership and publishes scoped resources. The table context is create-only in this tenant. `visible:false` writes the owned command hidden metadata without deletion; runtime suppression is not yet proven. `bindingVersion:1` retains the original experiment command; new unbound creation is blocked. Version 2 is the default for newly generated commands. The original generated duplicate received `hidden:true` through a guarded owned-property plan (execution `<identity-redacted>`), followed by scoped publication and a fresh no-op. The bound button passed mouse reveal and keyboard hide, but two generated buttons remained visible after reload despite verified hidden metadata. Do not treat metadata-only verification as proof of runtime suppression; cleanup remains open. Existing Maker-created commands are not adopted.

## Real image API

TVmaze was selected because the user requested a free media API separate from existing TMDB. `examples/connectors/tvmaze.yaml` generates the `SearchShows(q)` GET operation, root-array responses, nested show/image objects and nullable images. The connector is `pfx_PowerCanvasTVMaze`, ID `<identity-redacted>`, verified as solution component 372. A no-auth connection was created through Maker. Power Platform returned HTTP 200 and ten shows for `girls`; the first poster URL separately returned image/jpeg. The connection was added to the native Canvas app as `PowerCanvasTVmazemediatest` for further tests.

Example future formula: `PowerCanvasTVmazemediatest.SearchShows("girls")`; a result's poster is `show.image.medium`. Handle blank images and keep attribution to [TVmaze](https://www.tvmaze.com/api). The API is free; Power Platform custom-connector playback licensing is separate. Never send complaint/customer fields as media searches. Existing TMDB and other connectors were not modified.

`scripts/deploy-tvmaze.mjs` is a bounded one-time pilot, not a generic deployment provider. Its exclusive plan file prevents accidental re-creation. Retain the creation receipt and journal; never delete them to retry an uncertain request.

## SLA and escalation

`examples/sla/complaints.yaml` defines High=4, Normal=24, Low=72 **elapsed UTC hours**, not working hours or holidays. The evaluator uses an explicit clock, deterministic event IDs, resolution timing and explicit policy migration. The worker verifies table/column ownership and the known synthetic record, saves its plan, uses ETag conditional PATCH, verifies the write and checks a repeat no-op. It never retries write conflicts or sends notifications.

The additive `pfx_ExperimentSlaState` memo stores due date, escalation/resolution timestamps, policy hash and bounded timeline events in one atomic update. The synthetic complaint was escalated and repeat evaluation was a no-op. `node scripts/run-sla.mjs` previews; append `--apply` to run this bounded pilot. This is an executable worker, **not an installed cloud flow or continuously running service**. Resolution/reopen orchestration and deployment scheduling remain separate work.

## Reusable PCF timeline and tests

`pcf/Timeline` contains the actual StandardControl, manifest, styles and locked dependencies. It renders at most 200 validated UTC events as text, supports light/dark themes, keyboard selection, focus retention, disabled mode and teardown. It has no external-service dependency. `eventsJson` is the event array; `theme` is light/dark; `selectedEventId` is output. To show an SLA record, supply its state object's `events` array.

The official PAC/.NET build produced `pcf/TimelineSolution/bin/Release/TimelineSolution.zip`, an unmanaged package scoped to the dedicated experiment solution/publisher. The package has not been imported or bound to a live form; host integration remains a separate step. No managed package is produced.

`npm run test:visual` runs six timeline snapshots at 390/768/1440 in light/dark, plus functional keyboard/focus/disabled/error/text/cleanup coverage. Baselines were inspected and a second comparison run passed. `npm run test:visual:update` explicitly replaces baselines; ordinary test runs do not. These tests exercise the actual control class in a browser harness, not a certified Power Apps PCF host. Native Studio screenshots are runtime evidence; automated native-player visual comparison remains limited by the player license gate.

## Validation

The final local gate passed 129 unit/CLI tests, lint, typecheck, build and JSON Schema generation. Seven actual-PCF browser/visual tests passed. Native v7 compiled with explicit Validation PASSED, zero App Checker issues and a subsequent no-op. Studio saved and published it on 18 September at 14:07:06 EAT. See `experiments/native-canvas-20260918` for independent save/create/choice readbacks and native screenshots.

## Useful next choices

1. Host the built PCF on the complaint form and connect its timeline to SLA events.
2. Add a native TVmaze media gallery with image fallback, attribution, retry and cache behavior.
3. Deploy the SLA worker on a chosen schedule; add resolution/reopen transitions and business calendars.
4. Complete licensed-player visual baselines and non-admin access tests.
5. Expand YAML commands beyond reveal actions, using typed parameters and explicit permission predicates.
