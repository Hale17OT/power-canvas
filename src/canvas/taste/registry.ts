import { z } from 'zod';
import { patternCatalog } from '../patterns.js';

export const recipeSchema = z.strictObject({ name: z.string(), modes: z.array(z.string()).default([]), personalityCompatibility: z.array(z.string()).default([]), deviceStrategy: z.string().optional(), category: z.string(), purpose: z.string(), appropriateUseCases: z.array(z.string()).min(1), inappropriateUseCases: z.array(z.string()).min(1), implementationType: z.enum(['modern', 'composition', 'pcf', 'planned']), nativeControls: z.array(z.string()), canvasComponents: z.array(z.string()), optionalPCF: z.array(z.string()), inputs: z.record(z.string(), z.unknown()), outputs: z.array(z.string()), variants: z.array(z.string()), states: z.array(z.string()), responsiveRules: z.array(z.string()), accessibilityRules: z.array(z.string()), themeTokens: z.array(z.string()), dependencies: z.array(z.string()), compositionRules: z.array(z.string()), classicReason: z.string().optional() });
export type Recipe = z.infer<typeof recipeSchema>;
const groups: Record<string, string> = {
  navigation: 'AppShell Sidebar CollapsibleSidebar NavigationRail TopNavigation Breadcrumb Tabs VerticalTabs SegmentedNavigation MobileNavigation BackHeader',
  data: 'DataTable CompactTable SelectableTable EditableTable GroupedTable RecordList RichList CardList KPICard MetricCard ComparisonCard ProfileCard EntitySummaryCard MetadataList DescriptionList KeyValuePanel Timeline ActivityFeed AuditHistory StatusHistory Stepper ProgressTracker CalendarView KanbanBoard',
  forms: 'StandardField InputWithIcon PrefixInput SuffixInput CurrencyInput PercentageInput SearchInput PersonPicker EntityPicker MultiSelect TagPicker DateRange Rating Slider ToggleGroup SegmentedControl InlineEdit EditableRow FormSection CollapsibleSection WizardForm MultiStepForm AdvancedFilterPanel',
  actions: 'PrimaryButton SecondaryButton SubtleButton IconButton ButtonGroup SplitButton Toolbar CommandBar BulkActionBar ContextMenu OverflowMenu RowActions',
  overlays: 'Dialog ConfirmationDialog DestructiveDialog FormDialog ReviewDialog SidePanel Drawer DetailPanel FullScreenDialog ContextualPanel',
  feedback: 'Toast MessageBar InlineMessage ValidationMessage SuccessState WarningState ErrorState EmptyState NoResultsState Skeleton Spinner ProgressBar StepProgress SavingState UnsavedChangesState',
  content: 'Avatar AvatarGroup Badge StatusBadge Tag Chip MetadataRow InfoCard Callout HelpPanel Accordion Disclosure',
  analytics: 'KPIStrip MetricComparison TrendIndicator Sparkline BarChart LineChart DonutChart ProgressVisualization DistributionChart DashboardCard ChartCard ChartWithDetails',
};
const modern: Record<string, string> = { SearchBox: 'TextInput', StatusBadge: 'Badge', UserAvatar: 'Avatar', LoadingState: 'Spinner', Tabs: 'TabList', PrimaryButton: 'Button', SecondaryButton: 'Button', SubtleButton: 'Button', IconButton: 'Button', StandardField: 'TextInput', Badge: 'Badge', Avatar: 'Avatar', Spinner: 'Spinner' };
const categories = Object.fromEntries(Object.entries(groups).flatMap(([category, names]) => names.split(' ').map(name => [name, category])));
const guidance: Record<string, [string, string, string]> = {
  PageHeader: ['Establish screen purpose and immediate context', 'One heading per task surface with concise supporting context', 'Repeated decorative headings inside every card'],
  KpiCard: ['Summarize one actionable measure with scope', 'Operational counts or executive measures tied to the current filter and access scope', 'Fabricated statistics, unexplained trends or unrelated card grids'],
  Sidebar: ['Provide stable destinations across a workspace', 'Two to six persistent destinations that collapse to a rail and mobile dock', 'Independent navigation logic invented separately for each screen'],
  CommandBar: ['Group commands by task priority', 'One primary action with quiet secondary commands', 'Every command rendered as a large primary button'],
  FilterBar: ['Expose a small set of mutually exclusive criteria', 'A bounded category or status set with a visible all/reset path', 'Dozens of unbounded options or filter choices encoded as business permissions'],
  SearchBox: ['Locate records by an explicitly supported query', 'Named search over a declared field with delegation-aware host formula', 'Implying global or full-text search while only matching a title prefix'],
  StatusBadge: ['Show a compact textual state with supporting color', 'Status or priority in rows and detail headers', 'Color-only status or using danger color for every ordinary state'],
  UserAvatar: ['Provide recognizable person context', 'Current user or an explicitly bound person', 'Treating avatar visibility as an access-control check'],
  DataTable: ['Scan and select mixed-template records', 'Rows with a primary title, secondary metadata, status and contextual selection', 'Spreadsheet editing, grouping or pagination that the supplied host contract does not implement'],
  ActivityTimeline: ['Read chronological evidence', 'Real timestamped events or explicitly labeled created/modified metadata', 'Invented audit entries or claiming full history from two record timestamps'],
  ConfirmationDialog: ['Confirm a consequential scoped action', 'Discarding unsaved input with a safe cancel path and restored focus', 'Interrupting routine navigation or using a confirm prompt instead of authorization'],
  EditDialog: ['Keep a bounded edit in context', 'A short grouped form with validation, review and unsaved handling', 'Long multi-task workspaces crammed into a modal'],
  FormSection: ['Group fields that belong to one decision', 'Related inputs under a meaningful heading and help text', 'One decorative card around every individual field'],
  EmptyState: ['Explain absence and a useful next step', 'No records or no matching filter results with accurate recovery guidance', 'Showing empty and error simultaneously for a failed request'],
  LoadingState: ['Explain bounded work in progress', 'A named busy region while fetching or saving, with duplicate commands guarded', 'Unbounded ornamental animation or a spinner without useful context'],
  ErrorState: ['Explain a failure and preserve recovery', 'A useful message with retry that retains unsaved input', 'Clearing fields, hiding the failure or retrying mutations automatically'],
  Tabs: ['Switch peer sections while retaining context', 'Two to six sections with selection controlled by host state', 'Using a tab as a submit action or letting the selected indicator diverge from content'],
  Stepper: ['Orient users in a bounded sequence', 'A form with explicit current step, validation and review', 'Implying completion before validation or hiding required steps'],
  ChartCard: ['Compare related measures for a decision', 'A small labeled bar comparison with actual values and a meaningful denominator', 'Unrelated chart decoration or assuming the bar renderer implements a line/donut chart'],
  MobileBottomActions: ['Keep task actions reachable', 'A fixed action region outside scrolling fields, with bottom inset and host-owned commands', 'Hiding validation or adding a second save path'],
  MobileTaskForm: ['Complete one mobile task', 'Scrollable fields and review with a separate persistent command region', 'A scrolling footer or desktop multi-column task chrome'],
  DetailPanel: ['Inspect a selected entity without losing the queue', 'Secondary record information beside a list, stacked on narrower screens', 'Displaying a stale selection after filters remove the selected item'],
};
const categoryGuidance: Record<string, [string, string]> = {
  navigation: ['Stable destinations or peer sections with predictable current-state indication', 'Replacing task actions with navigation or changing destinations across breakpoints'],
  data: ['Choose a representation that supports scanning, comparison or chronological inspection', 'Implying editing, audit provenance or scale guarantees without a data contract'],
  forms: ['Capture typed input with labels, validation, ownership and explicit commit behavior', 'Cosmetic input variants without keyboard, validation or data-type semantics'],
  actions: ['Expose an operation with clear priority, scope and disabled/busy behavior', 'Client-side visibility used as authorization or automatic mutation retries'],
  overlays: ['A focused temporary task with safe dismissal and restored context', 'Stacked dialogs or obscured mobile actions'],
  feedback: ['Explain current state and a concrete recovery or continuation', 'Status that relies on color alone or falsely claims completion'],
  content: ['Present secondary information with an appropriate disclosure level', 'Decorative wrappers and redundant visual labels'],
  analytics: ['Real scoped measures that support a comparison or decision', 'Invented numbers, misleading axes or missing text alternatives'],
};
export function recipes(): Recipe[] {
  const native = patternCatalog();
  const all = [...new Set([...Object.keys(categories), ...native.map(r => r.name)])];
  return all.map(name => {
    const p = native.find(r => r.name === name); const m = modern[name];
    const category = categories[name] ?? 'content'; const policy = categoryGuidance[category]!; const advice = guidance[name];
    return recipeSchema.parse({ name, modes: name === 'MobileTaskForm' || name === 'MobileBottomActions' ? ['enter', 'review', 'approve'] : [], personalityCompatibility: name.startsWith('Mobile') && p ? ['dense-operations', 'minimal-workspace', 'fluent-enterprise'] : [], ...(name.startsWith('Mobile') && p ? {deviceStrategy:'Full-screen task; body scrolls independently; action region remains visible with bottom inset'} : {}), category, purpose: advice?.[0] ?? `${name}: ${policy[0]}`,
      appropriateUseCases: [advice?.[1] ?? policy[0]],
      inappropriateUseCases: [advice?.[2] ?? policy[1]],
      implementationType: m ? 'modern' : p ? 'composition' : 'planned', nativeControls: m ? [m] : p ? ['GroupContainer', 'ModernText', ...(p.classicExceptions.length ? ['Gallery'] : [])] : [],
      canvasComponents: p && !m ? [p.name] : [], optionalPCF: ['CalendarView', 'KanbanBoard', 'EditableTable', 'Timeline'].includes(name) ? ['Requires explicit capability gap, ownership, licensing and accessibility evaluation'] : [],
      inputs: p?.propsSchema ?? {}, outputs: p ? Object.keys((p.propsSchema as { properties?: Record<string, unknown> }).properties ?? {}).filter(k => /action|onSelect|onChange|confirm|cancel|retry/i.test(k)) : [],
      variants: name === 'StatusBadge' ? ['standard', 'quiet'] : name.includes('Table') ? ['compact', 'standard', 'comfortable', 'selectable', 'editable', 'grouped'] : name.includes('Dialog') ? ['information', 'confirmation', 'destructive', 'form', 'review', 'success'] : name.includes('Card') ? ['standard', 'compact', 'interactive', 'selected', 'metric', 'warning', 'profile'] : ['standard'],
      states: ['default', 'disabled', 'empty', 'loading', 'error'], responsiveRules: ['Below 640: single column and touch targets', '640–1099: navigation rail', '1100+: side-by-side content where appropriate'],
      accessibilityRules: ['Meaningful names', 'Status text in addition to color', 'Logical focus order; overlays restore focus'], themeTokens: ['PF_text', 'PF_surface', 'PF_gap', 'PF_radius', 'PF_controlHeight'], dependencies: p ? [`PFDS/${p.version}`] : [], compositionRules: ['Host owns mutations and data scope', 'Do not nest decorative surfaces more than twice'], ...(p?.classicExceptions.length ? { classicReason: p.classicExceptions.join('; ') } : {}),
    });
  });
}
export interface ResolutionRequest { name: string; requiredCapabilities?: string[] | undefined; modernCapabilities?: string[] | undefined; compositionCapabilities?: string[] | undefined; allowPCF?: boolean | undefined; pcfJustification?: string | undefined; variant?: string | undefined; designContext?: { mode: string; personality: string; traits: string[]; density: number; device: 'desktop' | 'tablet' | 'mobile' } | undefined }
export function resolveRecipe(request: ResolutionRequest) {
  const recipe = recipes().find(r => r.name === request.name);
  if (!recipe) throw new Error(`Unknown Taste recipe: ${request.name}`);
  if (request.variant && !recipe.variants.includes(request.variant)) throw new Error('Unknown recipe variant.');
  if (request.variant && request.variant !== 'standard' && !(request.name === 'StatusBadge' && request.variant === 'quiet') && !(request.requiredCapabilities?.length)) throw new Error('Variant needs an explicit capability contract; vocabulary alone does not implement it.');
  const needs = request.requiredCapabilities ?? [];
  if (request.name === 'StatusBadge' && !needs.length && (request.variant === 'quiet' || request.designContext?.traits.includes('data-first') && request.designContext.density >= 7 && ['operate', 'review'].includes(request.designContext.mode))) return { recipe, level: 'modern', nativeControl: 'ModernText', treatment: 'quiet', reason: 'Dense operational priority stays textual and scannable without a filled badge competing with the record.', rejected: ['filled-badge', 'color-only-dot'], dependencies: [] };
  // Capabilities are supplied by live discovery, never inferred from a name alone.
  const fits = (available: string[] | undefined) => available !== undefined && needs.every(n => available.includes(n));
  if (fits(request.modernCapabilities) || (!needs.length && recipe.implementationType === 'modern')) return { recipe, level: 'modern', reason: 'Discovered modern control satisfies the required capabilities.', dependencies: [] };
  if (fits(request.compositionCapabilities) || (!needs.length && recipe.implementationType === 'composition')) return { recipe, level: 'composition', reason: recipe.classicReason ?? 'Reusable composition is needed beyond a single modern control.', dependencies: recipe.dependencies };
  if (request.allowPCF && needs.length && request.pcfJustification?.trim()) return { recipe, level: 'pcf', reason: request.pcfJustification, dependencies: ['Explicit package selection, licensing, solution ownership and runtime validation required'], executable: false };
  throw new Error(`${request.name}: no sufficient native implementation; provide a composition or justify PCF. Planned vocabulary is not executable.`);
}
