# Design Engine V4.3 certification

V4.3 keeps the 41 factories, 65 variants, Composition IR, native compiler and authoring providers. It adds evidence-derived selection rather than changing global maturity flags.

## Certification contract

`nativeCertificationV43Schema` extends V4.2. Each certificate identifies one `family.variant`, the generated instance, source, design plan, registry, app, environment, session, implementation fingerprint and discovered capability contract. Factory lineage is reproduced through the existing `pattern()` function. Only explicitly observed default-property omissions are permitted during that comparison.

Required evidence includes official compile, exact source readback, source-bound App Checker/accessibility, runtime captures at exact logical widths 390/640/834/1024/1440 in both themes, and applicable interactions. Static text does not need overlay actions. Navigation needs destination and selected-state tests; overlays need close, background, focus and transformation tests; forms need typed values, validation and read-only/disabled evidence. Interactive descendants of an otherwise static component need interaction evidence.

Certificates describe observed evidence, not full screen-reader or physical-device certification. The official discovery contract currently reports **CONTROL VERSION UNVERIFIED**. V4.3 permits that explicit limitation only for actually discovered controls; it does not invent versions. Certificates apply to that observed contract and exact native source. V4.1/V4.2 version rules remain unchanged.

An unrelated pre-existing `ReadableScreenNameNeeded` suggestion can be recorded explicitly. This exception cannot admit errors, extra findings, or a suggestion on the certified component's own screen. Documenting the exception does not make the whole app accessibility-clean.

Implementation/capability changes invalidate certificates; documentation edits do not. `factoryFingerprint` includes executable factory/token/native type dependencies, plus typed fields for form families. Future dependency changes must update this explicit dependency list. A certificate does not certify arbitrary property combinations, child content, bindings, locales or control upgrades.

## Selection

`loadCertifiedSelection()` verifies artifact bytes, source, lineage and current hashes before issuing a frozen selection context. Manually supplied `passed: true` objects cannot grant production selection. Both Composition IR resolution and every emitted factory in `compileDesignCandidate()` require the exact certified variant in production mode. Uncertified siblings remain experimental. No fallback silently upgrades maturity.

The CLI accepts a verified manifest through:

```powershell
node dist/cli/index.js taste generate --help
```

Use the `--certifications` option with the generation command's normal product/host inputs and production stability. A manifest contains `capabilities`, `confidence` (`native` or `published`), and certificate entries pointing to `evidence`, `source`, and `metadata`. Paths resolve relative to the manifest. The actual local manifest is `output/design-v43/static-certification/selection-manifest.json`.

Six static variants currently satisfy native confidence. This is insufficient to generate a complete production application: required navigation, form, data and overlay variants still fail closed. Published confidence also requires actual publication and product regression evidence. The existing `nativeDesign` compatibility entry does not accept a certificate manifest and therefore continues to fail closed in production mode; the explicit V4 generation command is the certificate-aware entry.

## Safe native harness

`scripts/design-v43-harness.mjs` calls existing factories and `compileField()`. `validateHarnessCandidate()` allows one namespaced, local-state screen while requiring every original file to remain unchanged. It rejects external calls, nonlocal state changes, protected control targets and collisions. Existing budgets remain 240 controls, depth 12 and gallery template 16.

`scripts/canvas-certification-batch.mjs` reuses the official V4.2 client. Each batch checks fresh Studio settings, doctor, independent PAC acquisition, saved/draft lifecycle, exact revision review, immediate preflight, official compile, source readback and both checkers. It never saves or publishes. `inspect-harness` is read-only. Native omissions and later coauthoring reorders are reviewable differences, never automatic acceptance or blind mutation retries.

Saved PAC and unsaved authoring hashes remain distinct. `compareSourceStates()` accepts only the exact user-approved focus delta after projecting its two authorized handlers. It does not relabel the two lifecycle states as identical.

## Reproduction and limitations

```powershell
npm run check
npm run schema
npm run test:design-visual
node scripts/design-v43-certify-static.mjs
node scripts/design-v43-check-evidence.mjs
```

The last two commands require the local native evidence under `output/design-v43`; they do not contact the tenant. The evidence guard proof checks nine negative cases against the actual certificates, including stale implementation, missing runtime, altered logical width and an unpublished product claim. CI unit tests do not depend on ignored local evidence.

Native captures use a sized outer Studio iframe because browser zoom changed CSS-to-Canvas dimensions. No Canvas styles or formulas are overridden. Accept a width only after screen and relevant child geometry settle; a stable outer screen alone proved insufficient.

See [execution report](design-v43-report.md) and [all-variant support matrix](design-v43-support.md). The final live service failure and unsaved harness recovery instructions are part of the report, not a completed cleanup claim.
