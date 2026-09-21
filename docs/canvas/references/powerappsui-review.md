# PowerAppsUI benchmark review — 18 September 2026

The user selected PowerAppsUI as the minimum visual and compositional benchmark. We reviewed the component library, responsive layouts, template YAML, interactive record-browser preview, dashboard template, DocRouter app documentation and design-system documentation before changing native source.

| Reference | Findings translated into PowerCanvas requirements |
| --- | --- |
| [Record Browser](https://www.powerappsui.com/templates/record-browser) | Compact rows, responsive metadata, a contextual detail panel, filters and one clear primary action; no oversized row buttons |
| [Dashboard](https://www.powerappsui.com/templates/kpi-dashboard) | Coordinated KPI/chart/table composition; navigation reorganizes at smaller widths; distinguish real data from fixture metrics |
| [Data Table](https://www.powerappsui.com/components/data-table) | Configuration separates columns, data, themes and selection callbacks; row actions belong to the host |
| [Sidebar](https://www.powerappsui.com/components/sidebar) | Active item, collapsed rail, user context and an explicit width contract with the content pane |
| [Dialog](https://www.powerappsui.com/components/dialog) | Coherent overlay, title, body, actions and caller-owned confirm/cancel behavior |
| [Timeline](https://www.powerappsui.com/components/activity-timeline) | Explicit event input, empty/loading states and event selection; no invented history |
| [KPI Cards](https://www.powerappsui.com/components/kpi-cards) | Value/label/context hierarchy, consistent spacing and configurable inputs |
| [DocRouter](https://www.powerappsui.com/apps/docrouter) | A complete app joins navigation, record review, task steps and responsive content rather than displaying an isolated component catalog |
| [Design system](https://www.powerappsui.com/docs/design-system) | Named formulas centralize semantic colors, spacing, typography and breakpoints |

The record-browser screen YAML was inspected: its layout uses auto-layout containers, modern text/search/buttons and component instances. Data seeding is deliberately demo-specific; PowerCanvas retains real Dataverse bindings and does not copy sample collections or placeholder actions into the app.

PFDS 0.2 is an independently implemented native composition library. We have not copied their branding or component source. If later changes adapt substantial source, retain the copyright and MIT license text from the [license page](https://www.powerappsui.com/license). Optional public attribution does not remove that notice requirement.

Visual criteria: restrained neutral surfaces; compact 36-pixel desktop controls; consistent 6-pixel corners; 14-pixel body and 12-pixel supporting text; 16/24-pixel content spacing; modern interactive controls; desktop sidebar, tablet rail, mobile bottom navigation; forms regroup into one column; no disabled placeholder buttons. User-authored business labels remain outside the component factories.

Screenshots of the reference review are under `output/playwright/redesign`. Native app screenshots and functional results must be reviewed separately; an HTML reference or local preview does not prove native Canvas quality.
