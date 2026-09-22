# Retained Taste design workflow

Read the app's project YAML and existing native source first. Use the existing PowerCanvas CLI, PFDS factories and safe synchronization boundary. This skill does not install web UI frameworks or authorize tenant-wide changes.

## Decide before generating

Read PRODUCT.md for users, jobs, frequency, devices and constraints. Read DESIGN.md for this app's visual contract; read this skill for the reasoning workflow. Do not combine the three into one prompt. Establish missing memory with `taste design generate --product <PRODUCT.md> --out <fresh-directory>`. The validated `powercanvas-design` block is authoritative; `design.json` is generated, never edited in parallel. A prose reference needs explicit reviewed normalization, not guessed tokens.

Understand product → establish design memory → select one primary direction and at most three compatible secondary traits → compose → render → critique → refine → audit → validate. Use V2 workflow and extension guide (repository `docs/canvas/taste-memory.md`). Native web-reference adaptation must distinguish supported, translated and unsupported ideas.

Keep these judgments separate: **correct** means functional and valid; **good** means clear hierarchy and usable composition; **appropriate** means suited to the product's job; **distinctive** means meaningful design choices beyond a repeated generator template. Appropriateness comes first. A sparse operational dataset does not justify inventing business records to fill whitespace.

Write `canvasApps.<key>.taste.intent`: audience, workflow, frequency, purpose, primaryAction, secondaryInformation and rationale. Distinguish repeated operational work from executive summaries; distinguish entry from consumption. Consider device needs, brand and accessibility. Choose one personality and explain each dial in relation to that workflow.

Run `powercanvas taste plan --app <key>` to inspect the resolved direction. The five 0–10 dials select discrete native layout bands; higher motion is still restrained and `reducedMotion` wins. Don't use density to shrink mobile targets.

For device work, read V3 device and generalization guide (repository `docs/canvas/taste-devices.md`). Compare `taste plan --device mobile` with desktop. Decide whether the job needs responsive adaptation or a different mobile task composition; record navigation, information order, actions, detail and form behavior in DESIGN.md. Device strategies and alternate layouts are compositions inside the existing application. A second-product benchmark is optional offline experimental code, not a workflow requirement.

Read engine and extension guide (repository `docs/canvas/taste.md`) for schema, commands, recipe/composition extension points and capability limits. Read [reference decisions](research.md) when choosing an unfamiliar pattern.

## Application boundary

Default `requiresNewApplication` to false. Pin `application.existingAppId` for an existing application; desktop/tablet/mobile, alternate layouts, critique, screenshots and benchmarks must retain that ID. Keep one shared data model, typed selected record, form, validation and mutation logic. Run `canvas application-plan` before generation. Only an explicit user application-level requirement can authorize `requiresNewApplication: true` with a documented `explicit-application` requirement; design or device work cannot do so. Native bindings and authoring sessions must match the pinned ID. The CLI does not provision apps or publish them. Do not create another app through Maker UI as a workaround. Preserve existing experimental tenant resources.

## Create

1. Choose a composition with `taste compositions`. Use the registry (`components list`, `components info <name>`) before inventing controls. Planned vocabulary is not an implementation.
2. Resolve required capabilities: modern control, reusable native composition, then justified PCF. A PCF decision is a package evaluation, not permission to install it. Record the real missing capability, dependency and accessibility cost.
3. Generate through `canvas native` or instantiate a typed slot composition with `taste compose`. Supply domain formulas explicitly; components don't own tenant operations.
4. Review the generated `taste-report.json`, native YAML and preflight. Fix warnings rather than asserting that the app looks polished.

## Redesign

Inspect the rendered baseline before reading detector counts. Record strengths, prioritized P0–P3 findings, consequences, recommendations and changes deliberately rejected. `taste critique` takes a reviewer-authored report and verifies source and screenshot hashes; it does not call a vision model, inspect unseen screenshots or mutate the app. Audit counts are separate implementation signals and never a beauty score.

Use focused layout/typeset/distill/color/polish passes only for justified findings. Bolder and quieter are direction checks, not mandatory churn. Preserve every behavioral formula and parent identity; distillation may remove only unreferenced, nonbehavioral display controls. Keep SubmitForm, typed choice defaults, validation, reason, review, success/failure, filtering, selection and unsaved handling intact. A visual change does not authorize business data mutation.

An explicit device composition may use the deterministic device-migration checker; ordinary preservation remains strict. Never replace that checker with a blanket parent or formula exception. Keep product-specific field semantics in typed host adapters. Add general recipes only for patterns actually exercised by the benchmark.

Review screenshot geometry and actual native controls: authoring preview must use **Window size**, not a scaled device simulator. Check mobile detail tabs as well as form buttons. A 44px container does not prove its nested interactive control is 44px. New native ModernText replacements must explicitly set padding and height; inherited defaults can create tiny scrollbars.

Run `taste audit <native-directory> --out <fresh-directory>` before replacement. Inspect dependency formulas, control references, variables/collections, flow calls, navigation, form ownership and data operations. The lexical inventory is not a Power Fx parser and cannot prove server permissions or flow behavior.

Use `taste redesign` to produce a local candidate against the current generated baseline. It blocks changed/removed business formulas. Keep live server normalization separate from generated intent and use the existing three-way sync planner with the last published receipt. Stop on unowned collisions or manual conflicts. Source hashes are mandatory; don't overwrite artifacts to manufacture a pass.

## Completion gate

Static preflight blocks rule violations. Runtime completion separately requires evidence bound to the exact candidate source hash: desktop, tablet, narrow, accessibility, behavior and visual review. Test no-results, loading/error presentation, disabled actions, validation, unsaved cancellation, save failure recovery, dark mode and focus restoration where applicable. Unsupported or untested paths remain stated limitations.

Review actual native rendering, not only the HTML showcase. Compare independent captures; intentionally changed visuals need review before a new baseline. Do not claim Power Apps licensing, delegation, separate-user permissions or production ALM from a Default-environment preview.

Exercise mobile list, record, secondary content, edit, validation, review, unsaved and empty states where relevant. Use `taste fixtures` for local 1/4/24-record volume checks and long/empty values; never populate business tables for screenshots. Fixture evidence is separate from live integration. Restore and verify the live candidate before publishing. Inspect action position, focus, scrolling and reduced-height behavior; disclose physical-keyboard and safe-area limits.

Assert fixture counts or zero-data feedback before accepting screenshots. Repeated fixture/live named-formula swaps can leave stale calculations in a long-running Studio session despite successful compilation; recover in a fresh Studio session and keep failed captures excluded.

If the authorized target is the non-disposable Default experiment, retain the owned app ID, dedicated solution/publisher, no adoption, no destructive API experiments and no managed-solution upgrades/removals. The official authoring validation can mutate a draft before returning failure: inspect fresh source and journal before retrying.
