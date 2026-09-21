# Complaint Desk design contract

Record identity before commands; urgency before totals.

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

The visual character is a calm operations ledger. The record title leads the detail panel; its priority and edit action form one local command area. The overview leads with high-priority workload, followed by supporting totals, a priority comparison and recent changes. It does not invent unresolved counts, SLA states or ownership that the data contract does not expose.

Navigation uses a quiet, compact light/dark-aware rail and a visible current destination. On phones it becomes a fixed bottom dock. Queue rows retain their dense desktop rhythm; full record identity remains available in the detail panel and accessible labels when a narrow row truncates text. Tablet below 960px uses a focused record with Back; wider tablets use a compact queue/detail split. All devices share one existing application, typed selection and form. Mobile uses mutually exclusive list and record surfaces with an explicit Back action.

Typography carries hierarchy through title, section, body, metadata and lead measure roles. Borders belong to inputs and selected navigation, rather than every content group. Content stays flat; the selected record and temporary edit/review dialogs provide meaningful surface boundaries. Priority remains explicit text. Color supports selection and feedback without being the only signal.

Forms group complaint and response fields, retain a separate review step and show the required change reason beside the save decision. Errors retain input. Empty states explain the active search/filter scope. Dark mode retains the same hierarchy and semantic roles. Touch tabs and actions require actual native measurements, not only source heights.

```powercanvas-design
version: "2.0"
personality: dense-operations
primary:
  id: dense-operations-native
  source: https://github.com/VoltAgent/awesome-design-md
  atmosphere:
    - calm
    - purposeful
  visualCharacter:
    - Record identity before commands; urgency before totals
  density:
    level: 8
    notes: "daily operations work on desktop: Record identity before commands;
      urgency before totals"
  color:
    strategy: restrained semantic accent
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
        size: 24
      - role: section
        token: PF_typeSection
        size: 16
      - role: body
        token: PF_typeBody
        size: 14
      - role: metadata
        token: PF_typeCaption
        size: 12
    philosophy: strong stable hierarchy
  spacing:
    scale:
      - 0
      - 4
      - 8
      - 12
      - 16
      - 24
      - 32
    philosophy: Tight within records; clear section rhythm
  radius:
    scale:
      - 0
      - 4
    philosophy: low
  surfaces:
    strategy: flat
  borders:
    strategy: hairline
  elevation:
    strategy: overlay-only
  navigation:
    characteristics:
      - compact rail
  components:
    treatments:
      StatusBadge: quiet
      DataTable: dense-table
      KpiCard: summary-strip
      DetailPanel: record-first
      ActivityTimeline: open-chronology
  layout:
    principles:
      - WorkQueue
      - Record identity before commands; urgency before totals
      - primary data with progressive detail
  responsive:
    principles:
      - "Below 640: touch targets at least 44, stacked reading order, fixed task
        dock"
      - "640–959: focused record with Back; 960–1099: compact split"
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
  - data-first
  - high-density
  - flat-surfaces
  - compact-navigation
  - dense-table
  - operational-spacing
  - quiet-secondary-actions
  - restrained-accent
  - strong-type-hierarchy
  - low-radius
  - hairline-borders
  - minimal-elevation
  - progressive-disclosure
modes:
  default: operate
  dashboard: analyze
  complaints: operate
  detail: review
  editor: enter
exceptions: []
devices:
  desktop:
    approach: responsive-adaptation
    composition: WorkQueue
    informationOrder:
      - record identity
      - priority
      - next action
      - secondary metadata
    navigation: stable destinations
    persistentControls:
      - navigation
    contextualControls:
      - record commands
    actionPlacement: local command group
    detailPresentation: adjacent detail
    commandVisibility: one dominant contextual command
    listDetailRelationship: simultaneous
    backBehavior: return to previous context without changing data
    formBehavior: review before explicit commit
    reason: Available space supports preserving the current job and information
      hierarchy through responsive adaptation.
  tablet:
    scope: within-application
    recordPresentation: focus-or-split
    approach: device-specific-composition
    composition: WorkQueue
    informationOrder:
      - record identity
      - priority
      - next action
      - secondary metadata
    navigation: stable destinations
    persistentControls:
      - navigation
    contextualControls:
      - record commands
    actionPlacement: local command group
    detailPresentation: focused record below 960; adjacent detail at 960 and above
    commandVisibility: one dominant contextual command
    listDetailRelationship: exclusive below 960; simultaneous on wider tablets
    backBehavior: return to previous context without changing data
    formBehavior: review before explicit commit
    reason: Portrait tablet uses a focused record to avoid travel below a long queue;
      wider tablet keeps the queue alongside detail without duplicating state.
  mobile:
    approach: device-specific-composition
    composition: MobileTaskFlow
    informationOrder:
      - record identity
      - priority
      - next action
      - secondary metadata
    navigation: list → record → task; explicit back
    persistentControls:
      - record identity
      - task actions
    contextualControls:
      - filters
      - secondary metadata
      - record commands
    actionPlacement: fixed footer outside the scroll body with bottom inset
    detailPresentation: dedicated full-height surface; task form replaces the surface
    commandVisibility: only current-task commands; background disabled during edit
    listDetailRelationship: mutually exclusive surfaces with stable selected identity
    backBehavior: record returns to list; editor cancel checks unsaved changes before return
    formBehavior: single column; scroll fields independently; persistent
      review/save; explicit discard
    reason: Simultaneous queue and record context creates excessive travel;
      completing one task at a time preserves identity and reachable actions.
```

## Mobile task composition

List and record detail occupy separate surfaces. Selection retains the original typed record. Editing uses a full-screen task with independently scrolling fields and persistent review/save controls above a bottom inset. Cancellation retains the existing unsaved-change check. Desktop retains its queue/detail architecture.
