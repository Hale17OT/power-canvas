# V4.1 legacy migration map

The current `native.ts` owns screen identities, discovered Dataverse names, typed choices, selected-record state, sorting, filtering, Form/TypedDataCard scopes, review/reason gates, SubmitForm, success/failure, unsaved cancellation, responsive layouts and flow injection. Those responsibilities cannot be replaced by the V4 synthetic host fixture.

| Existing responsibility | Destination | Preservation constraint |
| --- | --- | --- |
| Sidebar/content shell and screen layout | Design plan → Composition IR → native factories | Existing application identity retained; explicit structural migration |
| Variant/overlay selection | Component resolver with maturity and fallback trace | No silent fallback; production requires native evidence |
| Seven suffix presentation rules | Producer-authored semantic slot metadata | Same formulas and geometry for compatibility source |
| Dataverse field names and record selection | Native typed host bindings | Metadata identity checked; never convert Choice/lookup records to display strings for writes |
| Form/cards, review, reason, SubmitForm, unsaved and flow binding | Business binding adapter pending mapped migration | Preserve parent record scopes and exact behavioral formulas |
| Complaint-specific labels/policy | Explicit application compatibility adapter | General presentation rules must not become app policy |
| Existing source layout | Retained compatibility path until approved migration | No automatic live replacement |

Tests in native-canvas, native-sync-safety, Taste, device migration and flow Canvas bindings depend on the exact legacy control/form ownership. V4.1 must prove equivalent bindings before replacing that path. Official `compile_canvas` can alter an app draft even when validation fails; benchmark compilation is a mutation and must use the reviewed existing-app mechanism.
