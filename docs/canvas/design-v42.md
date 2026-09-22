# Design Engine V4.2: source and native evidence

V4.2 adds fresh-source acquisition, conservative behavior preservation, retained-source Composition IR, and source-bound native evidence. The [execution report](design-v42-report.md) separates implemented mechanisms from live proof and outstanding certification.

## Supported authoring path

Open the existing saved app in Studio, verify coauthoring, and disable autosave before any preview source change. Configure the official Microsoft Canvas authoring MCP with the complete Studio edit URL. Discover controls, APIs and data sources; synchronize actual `.pa.yaml` files before proposing changes. `compile_canvas` can update the live draft: it is a mutation, even when described as validation.

This follows Microsoft's [external-tools workflow](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/create-canvas-external-tools) and [Canvas plugin workflow](https://github.com/microsoft/power-platform-skills/tree/main/plugins/canvas-apps). [Copresence](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/copresence-power-apps-studio) is not proof of coauthoring. Independent retrieval uses supported [PAC Canvas download](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/canvas); deprecated pack/unpack and package rewriting are not introduced.

The source provider contract separates capabilities:

| Provider | Read | Validate | Write live draft | Purpose |
| --- | --- | --- | --- | --- |
| `authoringMcp` | Yes | Through guarded preview compile | Yes | Current Studio source |
| `pacDownload` | Yes | No | No | Independent saved-app baseline |

`authoring-client.ts` uses the official server over stdio JSON-RPC, verifies its connected app/environment identity, and assigns a new client connection epoch. That epoch is not claimed to be a Microsoft-native Studio session identifier. Live nonempty source is the additional liveness check.

## CLI

Run `node dist/cli/index.js canvas <command> --help` for exact options. Added commands:

```text
canvas authoring doctor
canvas source sync --provider authoringMcp|pacDownload
canvas source compare --authoring <directory> --pac <directory> --out <file>
canvas composition-lower --authoring <directory> --pac <directory> --out <fresh-directory>
canvas migration-validate --authoring <directory> --pac <directory> --candidate <directory> --out <file>
```

Authoring acquisition requires bindings, full Studio URL, .NET executable, explicit server version, and a current observation artifact proving coauthoring/autosave settings. The observation is bound to app/environment, timestamp, artifact path and SHA-256. PAC requires its executable, Dataverse URL, and expected owned app name. PAC downloads by the exact app GUID with `--extract-to-directory`. Its package `Id`/`FileID` identifies an internal document, not the Canvas resource GUID.

These CLI commands do not save or publish. Source acquisition uses a fresh empty directory. A missing/empty App or screen, duplicate filenames/control identities, symlink, explicit zero-file server response, stale source, wrong identity, or changed inventory/hash fails closed. A tool response without `isError` is insufficient.

Each source snapshot includes app/environment/connection epoch, acquisition mode/time, source hash, screen hashes, behavioral formula hashes, data sources and connectors. Source freshness expires after 15 minutes. Studio setting observations expire after 30 minutes. Historical receipts cannot replace acquisition.

Source comparison checks both provider roles, app/environment, screens, control names/types/parents/variants, behavioral formulas, data sources and connectors. Version suffix and platform serialization differences need not be byte-identical. A material mismatch returns `FRESH SOURCE UNRESOLVED`. PAC metadata currently supports the observed Dataverse/service/option-set/view/static kinds; unknown kinds fail rather than disappearing from the inventory.

## Presentation and behavior separation

`existing-composition.ts` lowers current source into a strict retained-native presentation graph plus `behavior-ir.ts` bindings. Presentation includes native types, variants, layout properties and ordered children. Behavioral references carry the original expression, scope, dependencies, role, token hash and effect inventory. Recompilation rejects missing, duplicated or shadowed bindings and malformed node placement.

The retained source is candidate zero. It can round-trip without calling the legacy visual generator. This is a conservative migration bridge, not proof that the app now instantiates every V4 factory. The existing business form compiler and non-opted-in compatibility paths remain. Behavioral expressions have `NATIVE_CHECK_REQUIRED` type status: lexical analysis is not a complete Power Fx typechecker.

Formula comparison normalizes token whitespace outside strings, known Self/Parent scope and mapped control identifiers. It does not prove arbitrary algebraic equivalence. Unknown syntax and unsafe scope changes remain unresolved. Dynamic Text, Content and AccessibleLabel formulas are behavioral bindings; quoted constant copy is presentation.

Mutation paths are separately immutable, including full handler guards and call arguments. New, removed or duplicated commits and changed targets/gates block migration. Intentional noncommit changes require explicit approval bound to the exact control/property and before/after formula hashes. Unused or stale approvals fail; approval does not bypass mutation immutability. Approval artifacts record an operator decision; they are not cryptographic authorization credentials.

General layout/refinement rules now live in `operational-refinement.ts`. Application adapters supply business identities, role mappings, relationships and copy. The generic analytical layout also receives an explicit application contract instead of embedding Complaint Desk fields.

## Guarded preview

`AuthoringMcpProvider.preview` requires fresh A/B agreement, reviewed candidate/baseline hashes and disabled autosave. Immediately before compile it reads Studio again and requires the same source hash. After compile it reads back and requires successful official validation, preserved behavior and exact candidate hash. An uncertain result is not automatically retried or rolled back.

The existing session wrapper applies the same migration and source-agreement guards for V4 manifests. It accepts exact approved behavior changes without authorizing saves/publishes. A preview makes the Studio draft differ from the independent saved package; a subsequent migration must resolve that difference rather than reuse an expired pre-change agreement.

## Capabilities and evidence

Control creation names, available properties, variants and versions are discovered from actual authoring metadata. Server version is never substituted for control version. All 16 field mappings receive `SUPPORTED`, `SUPPORTED_WITH_LIMIT`, `FALLBACK_REQUIRED` or `UNSUPPORTED` results. Property availability does not prove a generated field compiled or ran.

Certification is per component and variant, in three tiers: core production patterns first, secondary patterns next, remaining patterns when required. Applicable checks differ for static content, forms, wizard steps and modal surfaces.

V4.2 certification requires source/plan/registry/app/environment/connection binding on compile, App Checker, accessibility and runtime artifacts. Captures also bind theme, measured logical viewport and image hash. Browser pixels and Canvas logical pixels can differ with zoom; geometry must settle before capture. Changing the source invalidates subsequent evidence states. V4.1 input remains supported without silently promoting it to V4.2 proof.

Evidence states are `UNVERIFIED`, `SOURCE_ACQUIRED`, `SOURCE_AGREED`, `PLANNED`, `NATIVE_VALIDATED`, `PREVIEWED`, `CERTIFIED`. Passing source acquisition or compilation alone does not certify runtime interaction, accessibility, a factory variant, or production suitability.
