# PCF V1.0C: Microsoft-authored host contracts

This continuation resolves the V1.0B field ambiguity and captures a separate related-subgrid oracle. Both bounded serializers pass semantic and PAC package round-trips. Generated FormXML has **not** been applied to Dataverse. Published Power Apps host runtime remains unproven.

## Save-only lifecycle

[Microsoft's form designer contract](https://learn.microsoft.com/power-apps/maker/model-driven-apps/create-and-edit-forms) distinguishes saving from saving and publishing. The observed Maker operations were Save only. Network evidence contains four field-form PATCH requests and one dataset-form POST; no explicit Publish, PublishXml, Save-and-Publish or AppModule publication was observed. Batch request bodies were inspected separately from their POST envelopes.

The result is `makerAction: SAVE_ONLY`, `publicationAction: NONE_OBSERVED`, `runtimeVisibility: UNPROVEN`. Internal `componentstate` is recorded diagnostically; ordinary SystemForm visibility is not publication proof. This supersedes the over-strong unpublished-only interpretation in the historical V1.0B report. Neither runtime invisibility nor runtime publication is certified.

## Field oracle

The existing Field Binding Lab was reused. No component was reinstalled and no field lab was created. The designer requires selecting a client on the replacement native control; merely clearing a PCF checkbox did not transfer selection.

Four saves captured Web-only, Phone-only, Tablet-only, then restored Web-only. The selected identity, rather than the presence of a numeric entry, establishes this mapping:

| Numeric factor | Maker client | Final selected control |
|---|---|---|
| 0 | Mobile/Phone | Native single-line text |
| 1 | Tablet | Native single-line text |
| 2 | Web | `pfx_PowerCanvas.ColorContrastField` |

`controlDescription.forControl` resolves to exactly one base `control.uniqueid`. The base host retains its field column, control ID, disabled state and wrapper class `{F9A8A302-114E-466A-B582-6771B2AE0D92}`. Native fallback entries use class `{4273EDBD-AC1D-40D3-9FB2-095C621B552D}`. These are distinct identities.

The PCF entry uses `customControl.name`, matching the already installed component's observed name. It contains no `customControl.id` or `version`. Installed version remains separate evidence; the serializer does not invent either attribute.

The verified parameter grammar is:

```xml
<parameters>
  <theme static="true" type="SingleLine.Text">light</theme>
  <value type="SingleLine.Text">logical_text_column</value>
</parameters>
```

Native entries retain `<parameters><datafieldname>logical_text_column</datafieldname></parameters>`. This proves a bound text property and static text input only. Decimal, choice, lookup, date and Boolean field-host parameter serialization is not promoted by the broader manifest type support. All-native removal is outside this lowering subset.

## Dataset oracle

Microsoft Maker created exactly one **PowerCanvas PCF Dataset Binding Lab** on the existing certification Category table. Its standard related Probe subgrid uses the existing Category–Probe relationship and certification Active view. No schema or business rows were created. The lab and binding have Maker-authored provenance, not compiler-created live ownership.

AdvancedDataGrid was deliberately selected for Mobile, Tablet and Web. The designer supplied its `records` dataset, `status` mapped to the existing State choice column, `title` mapped to the existing Name text column, and static `theme=light`. Optional `readOnly` was left unset and is not emitted by the bounded serializer.

The base subgrid has `indicationOfSubgrid="true"` and the same wrapper class as the field host. `forControl` resolves exactly to its `uniqueid`. Its native grid fallback `{E7A81278-8635-4D9E-8D4D-59480B391C5B}` has no form factor and preserves RecordsPerPage, AutoExpand, quick-find/view/chart settings, relationship, target table, ViewId and ViewIds.

Each selected PCF entry uses this structure:

```xml
<parameters>
  <data-set name="records">
    <ViewId>{resolved-view-id}</ViewId>
    <TargetEntityType>logical_probe_table</TargetEntityType>
    <IsUserView>false</IsUserView>
    <EnableViewPicker>false</EnableViewPicker>
    <RelationshipName>logical_relationship</RelationshipName>
    <FilteredViewIds>{resolved-view-inventory}</FilteredViewIds>
    <status>logical_choice_column</status>
    <title>logical_text_column</title>
  </data-set>
  <theme static="true" type="SingleLine.Text">light</theme>
</parameters>
```

Property-set mappings are children of `data-set`, without field-style `type` attributes. The serializer preserves the separately captured native fallback and checks that its context agrees with the resolved table, view and relationship. It does not synthesize a base subgrid. V1.0C certifies the observed all-client, related-subgrid configuration; other grid settings, client subsets, dashboard/main-grid surfaces and CalendarDataset host contracts remain outside this proof.

The exact experiment-solution membership query returned no rows for the two lab-form IDs. No membership was added or inferred from the Maker solution URL. Form solution membership therefore remains unverified. This does not invalidate the observed serialization, but it is not ALM/deployment proof.

## Compiler boundary and tests

`modelDrivenHost` is an optional strict contract on existing PCF bindings. It uses logical component/form/host/column or table/view/relationship references. `lowerResolvedPCFHost` routes it through separate field and dataset serializers using explicit resolution data. The existing solution graph includes dataset table/view/relationship dependencies. The live form-write executor remains disabled.

The neutral parser remains loss-preserving. Semantic parsers reject unknown parameter shapes, component identities, host mismatches, missing mappings and unverified static types. Only known factor-entry order differences are canonicalized; unknown differences are significant. Changed host GUIDs must still resolve exactly within each form.

Both Microsoft captures pass parse → typed semantic state → PowerCanvas serialization → parse equality. Matching desired state is `NO_OP`; a local-only light-to-dark change is `UPDATE`; an unowned change or different component is `CONFLICT`. No local change fixture was applied live.

Both full local oracle form fixtures passed PAC 2.12.2 pack → unpack → pack with unchanged binding semantic hashes. `npm run pcf:binding:certify` repeats this against sanitized fixtures and writes a fresh ignored output directory. `-- --record-evidence` records a public, source-bound certificate. Package acceptance is `PACKAGE_SERIALIZATION_VERIFIED`, not an import/runtime or XSD semantic guarantee.

The public fixtures replace tenant-specific host/view GUIDs and table/column/relationship names. They preserve actual control/parameter structures. Provenance includes capture hashes and source hashes, with no credentials or tenant identifiers. Existing build/local-runtime certification remains separate; no internal custom-control API is required by lowering or planning.

## Evidence and maturity

| Dimension | Field | Dataset |
|---|---|---|
| Microsoft-authored host oracle | Verified | Verified |
| Base host/installed-name resolution | Verified | Verified |
| Typed lowering and semantic round-trip | Verified, text subset | Verified, bounded related-subgrid subset |
| Desired NO_OP/local UPDATE/conflict | Verified | Verified |
| PAC package round-trip | Verified | Verified |
| PowerCanvas-generated live apply | Unproven/disabled | Unproven/disabled |
| Published Power Apps host runtime | Unproven | Unproven |

Promotions are independently source-bound `pcf.modelDriven.fieldBinding.compile` and `pcf.modelDriven.datasetBinding.compile`. The older undifferentiated live-binding dimensions are not promoted. Source changes invalidate this certificate independently of component build/runtime evidence.

Validation: `npm run check` passed **1511 tests**, with **7 skipped**; `npm run agent:eval`, `npm run pcf:certify`, and `npm run pcf:binding:certify` are recorded in the ignored run evidence. The PCF source-schema integration requires a refreshed component certificate; component implementations themselves are unchanged.

## Tenant effects

| Operation | Count |
|---|---:|
| Component imports / new components | 0 / 0 |
| New field labs | 0 |
| Field-lab Save-only updates | 4 |
| Dataset lab forms created | 1 |
| Dataset Maker bindings (included in create) | 1 |
| Explicit form/AppModule publications | 0 / 0 |
| Existing V2 forms/apps updated | 0 / 0 |
| Tables/columns/relationships created or updated | 0 |
| Business rows created/updated/deleted | 0 |
| Canvas/Flow/SharePoint changes | 0 |
| Authentication profile/environment-binding changes | 0 |
| Generated binding writes | 0 |

All five protected resource hashes match preflight. The existing two installed component identities were re-read without reinstallation. No compensating cleanup occurred; both lab assets remain available for regression capture. SharePoint and V2 certification boundaries remain unchanged.

Remaining gaps: generated binding live apply, published model-driven host runtime, Canvas live binding, runtime dataset paging/delegation, production performance and cross-browser Power Apps host behavior.

PCF PROVIDER V1 COMPLETE
— OFFLINE BUILD / PACKAGE / LOCAL RUNTIME / MODEL-DRIVEN BINDING COMPILE CERTIFIED
— LIVE POWERCANVAS BINDING APPLY / PUBLISHED HOST RUNTIME UNPROVEN
