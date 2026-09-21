import { z } from 'zod';
import { pattern, patternRequestSchema, stack, row, fxText } from '../patterns.js';
import type { Control } from '../patterns.js';
import { strategiesFor, devices } from './devices.js';
import { resolveRecipe } from './registry.js';

export const compositionNames = ['AnalyticalOverview', 'MetricDrilldown', 'Dashboard', 'RecordList', 'RecordDetail', 'RecordDetailWithTimeline', 'WorkQueue', 'ApprovalQueue', 'DocumentWorkspace', 'Wizard', 'Settings', 'Administration', 'ReportingDashboard', 'UserManagement', 'Configuration', 'SearchResults'] as const;
const definitions: Record<typeof compositionNames[number], [string, string, string[], string[]]> = {
  AnalyticalOverview: ['Decide where attention is needed using scoped evidence', 'Inspect a comparison', ['ChartCard', 'PageHeader'], ['metrics', 'body']],
  MetricDrilldown: ['Inspect records contributing to a selected measure', 'Return to overview', ['DataTable', 'DetailPanel'], ['body']],
  Dashboard: ['Decide the next operational action', 'Open work queue', ['KpiCard', 'ChartCard'], ['metrics', 'body']],
  RecordList: ['Find and select a record', 'New record', ['SearchBox', 'DataTable'], ['filters', 'body']],
  RecordDetail: ['Understand and edit a selected record', 'Edit', ['DetailPanel', 'FormSection'], ['body']],
  RecordDetailWithTimeline: ['Review facts alongside real history', 'Edit', ['DetailPanel', 'ActivityTimeline'], ['body', 'context']],
  WorkQueue: ['Triage and process frequent work', 'New record', ['SearchBox', 'FilterBar', 'DataTable', 'DetailPanel'], ['filters', 'body', 'context']],
  ApprovalQueue: ['Review evidence before a decision', 'Review decision', ['DataTable', 'DetailPanel', 'ConfirmationDialog'], ['filters', 'body', 'context']],
  DocumentWorkspace: ['Locate documents and inspect metadata', 'Add document', ['SearchBox', 'DataTable', 'DetailPanel'], ['filters', 'body', 'context']],
  Wizard: ['Complete a bounded sequence with review', 'Next', ['Stepper', 'FormSection', 'EditDialog'], ['progress', 'body']],
  Settings: ['Change personal preferences safely', 'Save preferences', ['Tabs', 'FormSection'], ['sections', 'body']],
  Administration: ['Inspect configuration and perform scoped changes', 'New configuration', ['Tabs', 'DataTable', 'DetailPanel'], ['sections', 'filters', 'body']],
  ReportingDashboard: ['Compare measures to support a decision', 'View details', ['FilterBar', 'KpiCard', 'ChartCard'], ['filters', 'metrics', 'body']],
  UserManagement: ['Inspect membership and scoped access', 'Add member', ['SearchBox', 'DataTable', 'DetailPanel'], ['filters', 'body', 'context']],
  Configuration: ['Edit grouped system configuration', 'Save configuration', ['Tabs', 'FormSection', 'ConfirmationDialog'], ['sections', 'body']],
  SearchResults: ['Find relevant records and refine a query', 'Open result', ['SearchBox', 'FilterBar', 'DataTable', 'EmptyState'], ['filters', 'body']],
};
export function compositions() {
  return compositionNames.map(name => { const [purpose, primaryAction, recommendedComponents, slots] = definitions[name]; const mode = /Reporting|Analytical|Drilldown/.test(name) ? 'analyze' : /Wizard|TaskForm/.test(name) ? 'enter' : /Approval/.test(name) ? 'approve' : /Detail|Document/.test(name) ? 'review' : 'operate'; const devicePlans = strategiesFor(mode, name); return { applicationScope: 'within-application', requiresNewApplication: false, name, purpose, modes: [mode], desktopStrategy: devicePlans.desktop, tabletStrategy: devicePlans.tablet, mobileStrategy: devicePlans.mobile, primaryAction, secondaryActions: ['Refresh', 'Cancel or return'], recommendedComponents, slots, requiredSlots: slots, optionalSlots: [], actionHierarchy: [primaryAction, 'contextual inspection', 'safe return'], informationHierarchy: ['PageHeader', 'primary action', ...slots, 'feedback'], layout: slots.includes('context') ? 'responsive split' : 'vertical flow', responsiveBehavior: 'Context follows body below 1100; filters wrap below 640.', mobileBehavior: 'Single column, touch targets, bottom navigation; keep actions available.', emptyState: 'Explain why no records match and offer a useful next action', loadingState: 'Label busy region and disable duplicate actions', errorState: 'Preserve input and expose retry', execution: 'Native slot composition; host supplies validated data/action formulas' }; });
}
export const compositionRequestSchema = z.strictObject({ applicationScope: z.literal('within-application').default('within-application'), device: z.enum(devices).default('desktop'), mobileContext: z.strictObject({ selected: z.string().min(1), back: z.string().min(1) }).optional(), key: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/), composition: z.enum(compositionNames), title: z.string().min(1), subtitle: z.string().default(''), primaryAction: z.strictObject({ label: z.string().min(1), action: z.string().min(1) }), slots: z.record(z.string(), z.array(patternRequestSchema).min(1)), states: z.strictObject({ empty: z.string(), loading: z.string(), error: z.string(), retry: z.string() }) });
/** Real renderer shared by the CLI and generator: slot contracts keep domain logic out of recipes. */
export function composeScreen(input: unknown): Control {
  const r = compositionRequestSchema.parse(input); const spec = compositions().find(c => c.name === r.composition)!;
  for (const key of Object.keys(r.slots)) if (!spec.slots.includes(key)) throw new Error(`Unsupported ${r.composition} slot: ${key}`);
  for (const key of spec.slots) if (!r.slots[key]) throw new Error(`Missing ${r.composition} slot: ${key}`);
  const taskMobile = r.device === 'mobile' && spec.slots.includes('context');
  if (taskMobile && !r.mobileContext) throw new Error('Mobile list/detail requires selected identity state and explicit back action');
  const names = new Set<string>();
  const slots = Object.fromEntries(spec.slots.map(slot => [slot, stack(`${r.key}_${slot}`, r.slots[slot]!.map(p => {
    if (names.has(p.key)) throw new Error('Duplicate recipe identity'); names.add(p.key); resolveRecipe({ name: p.component });
    return pattern(`${r.key}_${p.key}`, p.component, p.props);
  }), { Height: slot === 'metrics' ? '=If(PF_mobile, 480, 160)' : ['body', 'context'].includes(slot) ? '=Max(320, Parent.Height - 220)' : '=If(PF_mobile, 144, 88)', FillPortions: ['body', 'context'].includes(slot) ? '=1' : '=0', Width: '=Parent.Width', LayoutOverflowY: '=LayoutOverflow.Scroll', ...(slot === 'metrics' || slot === 'filters' ? { LayoutDirection: '=If(PF_mobile, LayoutDirection.Vertical, LayoutDirection.Horizontal)', LayoutWrap: '=true' } : {}) })]));
  const children: Control[] = [pattern(`${r.key}_header`, 'PageHeader', { title: fxText(r.title), subtitle: fxText(r.subtitle) }), pattern(`${r.key}_actions`, 'CommandBar', { actions: [{ ...r.primaryAction, primary: true }] })];
  if (taskMobile) {
    for (const [slot, node] of Object.entries(slots)) Object.values(node)[0]!.Properties.Visible = slot === 'context' ? `=${r.mobileContext!.selected}` : `=!(${r.mobileContext!.selected})`;
    children.push(pattern(`${r.key}_back`, 'CommandBar', {actions: [{label: 'Back to list', action: r.mobileContext!.back}]}, [], {Visible: `=${r.mobileContext!.selected}`}), ...Object.values(slots));
  }
  for (const slot of spec.slots) if (!taskMobile && slot !== 'context') {
    children.push(slot === 'body' && slots.context ? row(`${r.key}_split`, [slots.body!, slots.context], { Height: '=Max(480, Parent.Height - 220)', LayoutDirection: '=If(PF_wide, LayoutDirection.Horizontal, LayoutDirection.Vertical)' }) : slots[slot]!);
  }
  children.push(pattern(`${r.key}_empty`, 'EmptyState', { title: '"Nothing to show"', description: '"Change the filters or add a record."', visible: r.states.empty }), pattern(`${r.key}_loading`, 'LoadingState', { visible: r.states.loading }), pattern(`${r.key}_error`, 'ErrorState', { title: '"Unable to load"', description: r.states.error, visible: `!IsBlank(${r.states.error})`, retry: r.states.retry }));
  return stack(r.key, children, { Height: '=Parent.Height', PaddingLeft: '=PF_pagePadding', PaddingRight: '=PF_pagePadding', LayoutOverflowY: '=LayoutOverflow.Scroll' });
}
export function selectComposition(patternName: string) { return patternName === 'analytical' ? 'AnalyticalOverview' : patternName === 'dashboard' ? 'Dashboard' : patternName === 'masterDetail' ? 'WorkQueue' : 'RecordList'; }

/** Used by data-bound native generation as well as the slot renderer. */
export function composeRegions(name: string, composition: typeof compositionNames[number], children: Control[], properties: Record<string, string> = {}) {
  const spec = compositions().find(c => c.name === composition)!;
  return stack(name, children, { LayoutDirection: spec.layout === 'responsive split' ? '=If(PF_wide, LayoutDirection.Horizontal, LayoutDirection.Vertical)' : '=LayoutDirection.Vertical', LayoutGap: '=PF_gap', ...properties });
}
