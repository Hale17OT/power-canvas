import { z } from 'zod';
import type { modes } from './memory.js';

export const devices = ['desktop', 'tablet', 'mobile'] as const;
export const deviceStrategySchema = z.strictObject({
  scope: z.literal('within-application').default('within-application'),
  recordPresentation: z.enum(['stacked', 'focus-or-split']).optional(),
  approach: z.enum(['responsive-adaptation', 'device-specific-composition']),
  composition: z.string().min(1), informationOrder: z.array(z.string()).min(1),
  navigation: z.string().min(1), persistentControls: z.array(z.string()), contextualControls: z.array(z.string()),
  actionPlacement: z.string().min(1), detailPresentation: z.string().min(1),
  commandVisibility: z.string().min(1), listDetailRelationship: z.string().min(1),
  backBehavior: z.string().min(1), formBehavior: z.string().min(1), reason: z.string().min(20),
});
export const deviceStrategiesSchema = z.strictObject({ desktop: deviceStrategySchema, tablet: deviceStrategySchema, mobile: deviceStrategySchema });
export type Device = typeof devices[number];
export type DeviceStrategy = z.infer<typeof deviceStrategySchema>;

/** Job semantics select architecture; breakpoints only activate that architecture. */
export function deviceStrategy(mode: typeof modes[number], composition: string, device: Device): DeviceStrategy {
  const mobile = device === 'mobile';
  const task = ['operate', 'review', 'enter', 'approve'].includes(mode);
  const order = mode === 'analyze' ? ['decision question', 'lead measure', 'comparisons', 'drilldown', 'data limitations']
    : mode === 'enter' ? ['record identity', 'progress', 'current fields', 'validation', 'review and save']
      : mode === 'approve' ? ['record identity', 'decision context', 'supporting evidence', 'reason', 'decision']
        : mode === 'review' ? ['record identity', 'summary', 'chronology', 'related actions'] : ['record identity', 'priority', 'next action', 'secondary metadata'];
  return {
    scope: 'within-application',
    approach: mobile && task ? 'device-specific-composition' : 'responsive-adaptation',
    composition: mobile && task ? mode === 'enter' ? 'MobileTaskForm' : mode === 'approve' ? 'MobileApproval' : mode === 'review' ? 'MobileRecord' : 'MobileTaskFlow' : composition,
    informationOrder: order,
    navigation: mobile && task ? 'list → record → task; explicit back' : mode === 'analyze' ? 'overview → measure drilldown; return to overview' : 'stable destinations',
    persistentControls: mobile && task ? ['record identity', 'task actions'] : mode === 'analyze' ? ['data scope', 'return from drilldown'] : ['navigation'],
    contextualControls: mobile ? ['filters', 'secondary metadata', 'record commands'] : ['record commands'],
    actionPlacement: mobile && task ? 'fixed footer outside the scroll body with bottom inset' : mode === 'analyze' ? 'comparison-adjacent drilldown' : 'local command group',
    detailPresentation: mobile && task ? 'dedicated full-height surface; task form replaces the surface' : mode === 'analyze' ? 'measure evidence replaces overview' : device === 'desktop' ? 'adjacent detail' : 'context below list',
    commandVisibility: mobile && task ? 'only current-task commands; background disabled during edit' : 'one dominant contextual command',
    listDetailRelationship: mobile && task ? 'mutually exclusive surfaces with stable selected identity' : mode === 'analyze' ? 'aggregate then evidence; no work queue' : device === 'desktop' ? 'simultaneous' : 'sequential reflow',
    backBehavior: mobile && task ? 'record returns to list; editor cancel checks unsaved changes before return' : 'return to previous context without changing data',
    formBehavior: mobile && task ? 'single column; scroll fields independently; persistent review/save; explicit discard' : mode === 'analyze' ? 'read-only inspection; no business editing' : 'review before explicit commit',
    reason: mobile && task ? 'Simultaneous queue and record context creates excessive travel; completing one task at a time preserves identity and reachable actions.' : mode === 'analyze' ? 'The comparison and drilldown job stays the same across devices, so reading order can reflow without introducing a separate work queue.' : 'Available space supports preserving the current job and information hierarchy through responsive adaptation.',
  };
}
export function strategiesFor(mode: typeof modes[number], composition: string) {
  return { desktop: deviceStrategy(mode, composition, 'desktop'), tablet: deviceStrategy(mode, composition, 'tablet'), mobile: deviceStrategy(mode, composition, 'mobile') };
}
