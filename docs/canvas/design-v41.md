# Design Engine V4.1: implementation and evidence boundaries

V4.1 is **not complete or native certified**. The composition-driven generation path, typed input generation and migration/evidence gates are implemented locally. The existing application's legacy binding compiler remains until its behavior can be migrated safely.

## Generation authority

`planDesign → createCompositionIR → validateCompositionIR → compileDesignCandidate → existing pattern factories → native YAML` is the new source path. `canvas native` uses this same path when an app declares `nativeDesign: { product, host, stability }`. It checks the pinned application, solution, discovered controls and declared Dataverse field identities. It refuses to discard existing screen definitions or flow-source bindings. The old schema's shell envelope remains for compatibility; it does not choose the new source layout.

The hash-bound IR declares semantic slots, layout contracts, component preferences, explicit fallbacks, variants, responsive navigation, host requirements and stability. Invalid/missing slots, unsupported layout combinations, unavailable factories, stale hashes and incompatible components fail before source emission. Focused-task composition omits persistent global navigation. Default experimental generation is explicitly uncertified. Production generation/exploration rejects the current implemented-only library; a certificate for one source does not promote every use of its factory.

Supported slots are published in `schemas/powercanvas-composition.v4.1.schema.json`. The current host is one primary screen plus an optional dedicated task screen. Arbitrary multi-screen business migration is not implemented.

## Fields and validation

Sixteen field types emit native source: text, multiline, number, currency, percentage, email, phone, URL, boolean, toggle, singleChoice, multiChoice, date, datetime, lookup and person. Discovered properties are archived in `references/native-control-contracts.v41.json` and tested against generated input properties.

- Text/email/phone/URL use modern TextInput. Email/phone-specific keyboard modes are **not** supported by the discovered contract. Format validation is explicit.
- Number/currency/percentage use NumberInput. Currency requires a currency code; percentage uses 0–100 units.
- Boolean/toggle use CheckBox/Toggle. These controls have no discovered native ValidationState; visible error text communicates invalidity.
- Choice/lookup/person use ComboBox with host-supplied typed record tables. No user inference, directory search, polymorphic lookup resolution, or production Dataverse binding proof is implied. Single selections remain records; multiple selections remain tables. DefaultSelectedItems requires a table.
- Date uses DatePicker. Datetime composes DatePicker and hour/minute NumberInputs and requires UTC/Local intent. Timezone/DST round-trip behavior remains unverified.

Structured validation supports required, length, range, date bounds and bounded read-only Power Fx predicates using `{value}`. Predicate functions/identifiers are allowlisted; arbitrary behavior functions and external references are rejected. This is not a full Power Fx parser/type checker. Host event formulas remain explicit trusted inputs requiring Studio validation.

`ValidationSummary` is a reusable native composition helper with field names and text errors, not an extra registry factory. It claims no focus-jump behavior. Typed forms gate commit, wizard progression and review. Read-only/disabled use native DisplayMode. Hidden wizard containers suppress their children. Native focus and keyboard behavior remain unproven.

## Task and document contracts

An explicit `DedicatedPage` composition requires `host.taskContext`: origin screen, record and navigation state; dirty expression; return action; discard action. It emits a separate screen in the **same app**, captures context before navigation, and guards return with an unsaved decision. It does not own SubmitForm. The automatic planner still excludes dedicated pages until the host contract is supplied through an explicit composition; no silent overlay substitution occurs.

`host.documentPreview` currently accepts only `kind: external-link`, title, description and URL. It emits a labeled external-open action, with blank URLs disabled. There is no embedded PDF, Word or image viewer claim.

## Migration

```text
powercanvas taste migration-plan --before <source-dir> --after <candidate-dir> --mapping <yaml-file> --out <fresh-dir>
```

Mappings contain `from`, `to`, `slot`. Planning performs no writes outside the local artifact directory. It reports hashes, retained/moved/replaced/removed controls, original formulas, state dependencies and functional changes. It rejects lost/stale references, changed behavioral properties, ambiguous mappings and changes in Parent/ThisItem/form-card scopes. Quoted identities require an explicit typed migration; string literals are never rewritten. This conservative comparison is not runtime proof and does not authorize apply.

The seven original suffix rules in `taste/engine.ts` now consume producer-authored presentation roles. Shared typography, navigation/filter/quiet-action color and status treatments live in `semantic-treatments.ts` and work with arbitrary identities. The Complaint Desk compatibility adapter retains application role mappings and layout/content rules. Its full separation is unfinished; `mobile.ts`/`judgment.ts` also retain legacy name-dependent logic. Do not claim zero name coupling across the whole repository.

## Evidence and certification

```text
powercanvas components certify <native-source-dir> --evidence <evidence.json> --plan <design-plan.json> --out <fresh-dir>
powercanvas taste generate --product <PRODUCT.md> --host <host.yaml> --stability experimental --out <fresh-dir>
npm run design:v41
```

Certification requires source/design hashes; successful official compile verdict; clean App Checker and accessibility responses; artifact hashes; PNG captures at 390, 640, 834, 1024 and 1440 in light/dark; recorded control versions; and component-specific runtime cases. Production benchmark evidence additionally requires representative-data, regression and quality-review artifacts. Missing/stale/failed evidence fails certification. Operator-recorded evidence is not independent screen-reader certification and does not globally update factory maturity.

`components lab` emits native development fragments with local state, reversible navigation/overlay/snackbar controls and typed TaskForm examples. These are not a tenant app. The report lists required lifecycle cases; it does not mark them executed.

The official authoring service can mutate drafts during compile, including failed compiles. Existing-app compile still requires a reviewed identity/source manifest and fresh source hash. The wrapper now reports an empty sync as failure even if `isError` is false. No benchmark source was submitted to the existing business app.

## Dimensions

`dimension-execution.ts` is the machine-readable execution audit. Density, warmth, surfaceDepth, radiusCharacter, typographyExpression, navigationPresence, dataEmphasis and decorativeIntensity have source effects. Formality, contrast, brandExpression and motion remain INTENT_ONLY. No dimension has current-source native visual certification. Explicit typographyExpression binds the header scale; decorativeIntensity changes border weight while respecting border:none. These are bounded treatments, not new decoration families.

## Known boundaries

No native candidate tournament, mobile keyboard/focus test, safe-area test, current control-version certification, native component promotion, or Complaint Desk V4 binding migration has completed. BottomSheet is anchored, not draggable. DataTable remains a bounded identity/status gallery, not an editable/virtualized grid. Full-screen reader, delegation, persona authorization and production ALM claims remain out of scope of these checks.
