# ADR 0006: Bounded themes, responsive containers and explicit data states

Status: accepted, 18 September 2026.

Use semantic colors, spacing, typography, radii, borders, elevation, icon intent, motion and layering. Light/dark modes and comfortable/compact density resolve independently. Brand color, approved font and radius are bounded overrides. Text/brand foreground pairs must meet 4.5:1 contrast. Native theme and modern-control compatibility still require Studio checks.

Compose containers rather than absolute coordinates. Compact is below 600 px, medium 600–1023, wide at least 1024. Navigation becomes bottom, collapsed sidebar and full sidebar respectively. Rows wrap and compact content stacks. Breakpoints are semantic rules, not assertions that the HTML approximation has native Canvas equivalence.

Data components define loading, loaded, empty, error and forbidden explicitly. DS1 supports ordinary declared columns and prefix search on text only. Queries remain Dataverse expressions; no hidden `ClearCollect`, `FirstN` or aggregate count is emitted. `maxVisible` is a presentation bound and does not claim complete pagination. Permission errors must map to forbidden at the native adapter, without treating hidden controls as authorization.

Derived theme values belong in named formulas; generated screen search/load state belongs to prefixed screen variables; component-local selections have isolated identities. The compiler emits intent templates; native formula/version validation is required before applying. Generic edits/mutations and master-detail are DS2 work.
