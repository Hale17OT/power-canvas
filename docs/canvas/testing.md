# DS1 verification

The 18 September 2026 local gate passed 118 tests across 12 files, plus lint, typecheck, build and schema generation. This count includes retained schema/model-driven tests, not 118 Canvas-only tests.

| Area | Verification | Boundary |
| --- | --- | --- |
| Configuration | Existing specs unchanged; strict Canvas schema, unknown fields/components/versions rejected | No live readiness implied |
| Composition | Child policy, shell/page placement, duplicate keys, absent navigation/data fields, unsupported search type | Dashboard/list/custom only |
| Theme | Deterministic light/dark resolution; brand and foreground contrast; approved density/overrides | Native control themes pending |
| Responsive | 599/600/1023/1024 boundaries; phone/tablet/desktop showcase | Canvas layout must be tested separately |
| Identity | Labels/reorder preserve IDs; insertion adds one identity | Reparenting requires migration |
| Reconciliation | Manual-only edits retained; collisions, concurrent changes and removals blocked; second unchanged merge produces no changes | Local property planner, no remote sync guarantee |
| Data | Prefix-search intent, bounded display, explicit five-state contract, no hidden collection/aggregate | >2,000-row delegation and persona access pending |
| Authoring | Exact ownership/solution/revision/source/control prerequisites; no adapter writes after failed preflight | Native service workflow recorded separately |
| Preview | Escaped embedded JSON and DOM labels; malicious title cannot close the payload script | No arbitrary HTML/code props |

The release browser showcase was exercised at 390, 768 and 1440 px, light and dark. All six combinations returned one row for `Invoice` and had no document-level horizontal overflow. State controls, retry, Enter-key navigation and 36 px compact controls were checked. Screenshots are in `output/playwright/canvas-release-<width>-<theme>.png`. Phone and desktop images were visually inspected. A table may scroll locally when content requires it; no overflow hiding is used to conceal broken page width.

Native acceptance remains: save/reopen, native app checker and accessibility checker, phone/tablet/desktop keyboard and touch, real state transitions and permission failures, display settings, source mapping and >2,000-record delegation; a second sync/no-op and controlled manual-edit conflict. Do not mark a component stable until its relevant tests have native evidence.
