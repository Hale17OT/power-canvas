# PCF V1.0A: observed binding boundary

Verdict: **PCF PROVIDER V1 PARTIAL — MODEL-DRIVEN HOST LOWERING CONTRACT REMAINS UNVERIFIED**.

This investigation adds a neutral, loss-preserving parameter-tree parser and observation serializer. It does not add a field/dataset lowering rule or change provider maturity. Use `powercanvas pcf inspect <FormXML-file> --binding --json` locally. The serializer is for observation round-trips, not production form authoring. Unknown parameters remain opaque and explicitly unverified.

## Evidence, 26 September 2026

The existing experiment binding and named profile were used without changes. Two bounded metadata scans queried only account/contact/task main SystemForms, first up to three and then up to twelve per table. They returned 9 and 18 rows, including repeated forms; this was not a tenant-wide search. No business rows or historical Complaint forms were queried. Internal-only customcontrol/customcontroldefaultconfig APIs were not consulted or made dependencies.

Observed CardFeed configuration contained a `data-set` named SubGrid with view/table settings and static Decimal parameters. Observed OptionSet configuration contained a `value` column reference alongside an ID-based fallback containing `datafieldname`. Separate entries had formFactor values 0, 1, and 2. Their device meanings are not certified here. Neither component was an independently installed, source-owned PCF example. The inspected form's two forControl identities had no matching base control identity, so these fragments do not establish host resolution. No version mapping, publisher-qualified identity mapping, or property-set host mapping was established.

The sanitized minimal fixture preserves both configurations, their fallback, entry order and parameter structure. GUIDs are replaced consistently and the field is renamed. Provenance and saved-byte fixture hash accompany it under `tests/pcf/binding/`. It is an observation fixture, **not a golden PCF lowering fixture**.

Microsoft PowerApps-Samples was inspected at commit `ce139158966e085cc8e0d7ee2c81f9ff893ec69e`: LinearInputControl, LookupSimpleControl and PropertySetTableControl manifests demonstrate component-side contracts. The CodeInterpreterSample managed ZIP's customizations.xml contains no controlDescriptions. This bounded sample inspection did not establish the missing host contract.

## Public contract versus semantic proof

[Microsoft FormXML documentation](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/form-xml-schema) describes the outer configuration structure. Its linked downloadable schema permits arbitrary parameter children without validating their semantics. The downloaded 9.0.0.2090 schema marks customControl.id optional, whereas the displayed documentation marks it required. Neither is a reason to fabricate an ID.

Validation of the actual observed form against that downloaded schema failed on the undeclared `headerdensity` attribute. Minimal wrappers also failed required form/tab structure. These failures are recorded, not suppressed. No generated production FormXML is claimed XSD-valid. [Manifest properties](https://learn.microsoft.com/en-us/power-apps/developer/component-framework/manifest-schema-reference/property) and [property sets](https://learn.microsoft.com/en-us/power-apps/developer/component-framework/manifest-schema-reference/property-set) describe accepted values, not their complete form-host serialization.

## Implementation and limits

The parser retains forControl, all custom-control attributes, separate form factors, parameter names, namespace URIs, attributes, ordered content and native fallback entries. It canonicalizes attribute ordering and inter-element indentation only. Unknown parameter differences remain significant. DTDs, entity declarations, oversized input, excessive parameter nesting and ambiguous outer structure are rejected. ID/name/version values remain distinct and uninterpreted.

Field mappings for string, multiline, integer, decimal, currency, boolean, date, datetime, choice and lookup remain **unverified at the host boundary**. The first-party choice observation does not promote arbitrary PCF choice support. Static input, column input, output-property configuration, dataset property-set mappings and installed component identity remain blocked.

| Dimension | Result |
| --- | --- |
| Neutral observation parsing / serialization | Tested |
| Observed fragment round-trip | Passed |
| Production field lowering | Unverified / blocked |
| Production dataset lowering | Unverified / blocked |
| Semantic desired-binding NO_OP / UPDATE | Not implemented without grammar |
| Collision ownership behavior | Existing gates retained; no adoption |
| Binding PAC pack/unpack/pack | Not attempted: no verified lowering output |
| Field/dataset binding maturity promotion | None |
| Prior PCF build/package/local runtime certificate | Still hash-valid |

Package preservation cannot fill the missing semantic evidence. No new public binding certificate was issued. The three representative components, SharePoint certification and closed Dataverse V2 provider were not changed.

Validation: `npm run check` passed **1458 tests, 7 skipped** (22 new parser tests); `npm run agent:eval` passed 26 routing and 4 result-interpretation cases. Existing PCF evidence remains VERIFIED.

Tenant effects: PCF imports, solution imports, form updates, form publishes, AppModule changes, metadata writes, business-row reads/writes, Canvas changes, Flow changes/runs, SharePoint changes, auth changes and binding changes are all **zero**.

Remaining evidence needed: a supported/public-surface field and dataset PCF host configuration with resolvable base controls, installed component identity and manifests, including property mappings. Live import, binding apply, publication/runtime behavior, Canvas live binding, delegation/performance and host behavior remain unproven. Obtaining such evidence must not silently authorize a live import or form edit.
