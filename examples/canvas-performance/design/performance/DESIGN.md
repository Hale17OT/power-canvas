# Service performance briefing design contract

One lead measure, then supporting comparisons.

This contract is authoritative. The JSON companion is generated; edit this file, then synchronize.

## Native visual rules

- Use semantic tokens
- Keep task actions visible and context intact
- Preserve typed data and review before save

## Avoid

- Do not create equal-weight unrelated KPI cards
- Do not wrap every section in a card
- Do not rely on color alone

## Validated contract

```powercanvas-design
devices:
  desktop:
    approach: responsive-adaptation
    composition: AnalyticalOverview
    informationOrder:
      - decision question
      - lead measure
      - comparisons
      - drilldown
      - data limitations
    navigation: overview → measure drilldown; return to overview
    persistentControls:
      - data scope
      - return from drilldown
    contextualControls:
      - record commands
    actionPlacement: comparison-adjacent drilldown
    detailPresentation: measure evidence replaces overview
    commandVisibility: one dominant contextual command
    listDetailRelationship: aggregate then evidence; no work queue
    backBehavior: return to previous context without changing data
    formBehavior: read-only inspection; no business editing
    reason: The comparison and drilldown job stays the same across devices, so
      reading order can reflow without introducing a separate work queue.
  tablet:
    approach: responsive-adaptation
    composition: AnalyticalOverview
    informationOrder:
      - decision question
      - lead measure
      - comparisons
      - drilldown
      - data limitations
    navigation: overview → measure drilldown; return to overview
    persistentControls:
      - data scope
      - return from drilldown
    contextualControls:
      - record commands
    actionPlacement: comparison-adjacent drilldown
    detailPresentation: measure evidence replaces overview
    commandVisibility: one dominant contextual command
    listDetailRelationship: aggregate then evidence; no work queue
    backBehavior: return to previous context without changing data
    formBehavior: read-only inspection; no business editing
    reason: The comparison and drilldown job stays the same across devices, so
      reading order can reflow without introducing a separate work queue.
  mobile:
    approach: responsive-adaptation
    composition: AnalyticalOverview
    informationOrder:
      - decision question
      - lead measure
      - comparisons
      - drilldown
      - data limitations
    navigation: overview → measure drilldown; return to overview
    persistentControls:
      - data scope
      - return from drilldown
    contextualControls:
      - filters
      - secondary metadata
      - record commands
    actionPlacement: comparison-adjacent drilldown
    detailPresentation: measure evidence replaces overview
    commandVisibility: one dominant contextual command
    listDetailRelationship: aggregate then evidence; no work queue
    backBehavior: return to previous context without changing data
    formBehavior: read-only inspection; no business editing
    reason: The comparison and drilldown job stays the same across devices, so
      reading order can reflow without introducing a separate work queue.
version: "2.0"
personality: executive-dashboard
primary:
  id: executive-dashboard-native
  atmosphere:
    - calm
    - purposeful
  visualCharacter:
    - One lead measure, then supporting comparisons
  density:
    level: 2
    notes: "occasional executive work on desktop: One lead measure, then supporting
      comparisons"
  color:
    strategy: neutral ground with comparative accent
    roles:
      canvas: PF_canvas
      surface: PF_surface
      text: PF_text
      muted: PF_muted
      accent: PF_accentText
    semanticRoles:
      danger: PF_danger
      success: PF_success
      warning: PF_warning
  typography:
    hierarchy:
      - role: title
        token: PF_typeTitle
        size: 30
      - role: section
        token: PF_typeSection
        size: 16
      - role: body
        token: PF_typeBody
        size: 14
      - role: metadata
        token: PF_typeCaption
        size: 12
      - role: lead measure
        token: PF_typeLead
        size: 56
    philosophy: large measure, compact labels
  spacing:
    scale:
      - 0
      - 4
      - 8
      - 12
      - 16
      - 24
      - 32
    philosophy: Group by task and reading sequence
  radius:
    scale:
      - 0
      - 8
    philosophy: medium
  surfaces:
    strategy: layered
  borders:
    strategy: sectionless
  elevation:
    strategy: overlay-only
  navigation:
    characteristics:
      - spacious destinations
  components:
    treatments:
      StatusBadge: standard
      DataTable: comparisons
      KpiCard: lead-measure
      DetailPanel: record-first
      ActivityTimeline: open-chronology
      AnalyticalOverview: One large measure with denominator, then aligned comparison
        labels and contextual evidence action
  layout:
    principles:
      - AnalyticalOverview
      - One lead measure, then supporting comparisons
      - lead measure and comparisons
  responsive:
    principles:
      - "Below 640: touch targets at least 44, stacked reading order, fixed task
        dock"
      - "640–1099: compact navigation and stacked detail"
      - "1100+: split queue and record context"
  dos:
    - Use semantic tokens
    - Keep task actions visible and context intact
    - Preserve typed data and review before save
  donts:
    - Do not create equal-weight unrelated KPI cards
    - Do not wrap every section in a card
    - Do not rely on color alone
  powerAppsAdaptation:
    supported:
      - Modern text, buttons, containers, semantic Power Fx tokens
    translated:
      - CSS grid becomes responsive AutoLayout
      - Quiet status becomes modern text with explicit priority
      - Hover disclosure becomes explicit touchable action
    unsupported:
      - Backdrop blur
      - CSS selectors and web detector
      - Custom brand fonts or assets
      - Hover-only navigation
secondaryTraits: []
traits:
  - low-density
  - layered-surfaces
  - strong-type-hierarchy
  - spacious-navigation
  - data-first
  - restrained-accent
modes:
  default: analyze
exceptions: []
```

## Rendered refinement

The first native render gave the lead measure the same size as the question. Increase the lead measure to 56px, align the inspection action with the measure, and keep comparison labels aligned with their bars. These changes strengthen the decision hierarchy without adding metrics or decorative cards. Mobile preserves the question → measure → comparison → evidence reading order.
