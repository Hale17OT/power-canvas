import { z } from 'zod';
import { controls, auditNative, type Finding } from './audit.js';
import type { NativeFiles } from '../native-types.js';
import { designSchema, productSchema, type DesignMemory } from './memory.js';
import { devices } from './devices.js';
import { selectDirection } from './strategies.js';

export function auditDesign(files: NativeFiles, design: DesignMemory) {
  const audit = auditNative(files); const nodes = controls(files); const findings: Finding[] = [];
  const add = (rule: string, control: string, property: string, evidence: string, severity: Finding['severity'] = 'warning') => {
    const exception = design.exceptions.find(e => e.rule === rule && e.control === control && e.property === property);
    findings.push({ rule, path: `${control}.${property}`, severity: exception ? 'review' : severity, evidence, remedy: exception ? `Scoped exception: ${exception.reason}` : 'Reconcile source with DESIGN.md; keep exceptions scoped and justified.' });
  };
  const source = (files['App.pa.yaml'] as { App: { Properties: { Formulas: string } } }).App.Properties.Formulas;
  const numericTokens = new Map([...source.matchAll(/(PF_\w+)\s*=\s*(\d+)\s*;/g)].map(m => [m[1]!, Number(m[2])]));
  const radii = new Set<number>(); const sizes = new Set<number>(); let borders = 0; let surfaces = 0; let badges = 0;
  const mode = design.modes.default;
  if (mode === 'analyze' && nodes.some(n => /_sidebar$/.test(n.name)) && nodes.filter(n => /_kpi\d$/.test(n.name)).length >= 3 && nodes.some(n => /_tablePanel$/.test(n.name))) add('analytical-queue-disguise', 'App', 'Composition', 'Analytical job inherited a rail, KPI grid and operational table; justify the decision architecture', 'review');
  if (mode === 'analyze' && !nodes.some(n => /drilldown|comparison|chart/i.test(n.name))) add('analytical-no-decision-evidence', 'App', 'Composition', 'Measures have no explicit comparison or supporting evidence path', 'review');
  if (mode === 'approve' && !nodes.some(n => /evidence|context|description/i.test(n.name))) add('approval-without-context', 'App', 'Composition', 'Decision composition exposes no supporting context', 'review');
  if (design.devices?.mobile.approach === 'device-specific-composition' && nodes.some(n => n.node.Control === 'Form') && !nodes.some(n => /fixedFooter$/.test(n.name))) add('mobile-form-scrolling-actions', 'App', 'Composition', 'Device contract requires persistent actions outside scrolling fields; inspect native task composition', 'review');
  for (const n of nodes) {
    const p = n.node.Properties; const kind = n.node.Control?.split('@')[0];
    if (kind === 'Badge') badges++;
    if (p.BorderThickness && p.BorderThickness !== '=0') borders++;
    if (kind === 'GroupContainer' && p.Fill === '=PF_surface') surfaces++;
    for (const [property, value] of Object.entries(p)) {
      const number = /^=\d+$/.test(value) ? Number(value.slice(1)) : numericTokens.get(value.slice(1));
      if (/Radius/.test(property) && number !== undefined) { radii.add(number); if (!design.primary.radius.scale.includes(number)) add('drift-radius', n.name, property, `Off-scale radius ${number}`); }
      if (/Padding|Gap/.test(property) && number !== undefined && !design.primary.spacing.scale.includes(number)) add('drift-spacing', n.name, property, `Off-scale spacing ${number}`);
      if (/^(FontSize|Size)$/.test(property) && number !== undefined) { sizes.add(number); if (number < 12) add('type-readable-metadata', n.name, property, `Text size ${number}`); }
    }
    if (/Button/.test(kind ?? '') && /IconOnly/.test(p.Layout ?? '') && !p.AccessibleLabel) add('action-icon-label', n.name, 'AccessibleLabel', 'Unnamed icon action', 'error');
    if (kind === 'Gallery') {
      const descendants = nodes.filter(c => c.path.startsWith(n.path + '/'));
      if (descendants.filter(c => c.node.Control?.split('@')[0] === 'Button').length > 2) add('action-row-count', n.name, 'Children', 'More than two row actions');
    }
    const localButtons = nodes.filter(c => c.parent === n.name && c.node.Control?.split('@')[0] === 'Button');
    const unconditionalPrimary = localButtons.filter(c => /^='ButtonCanvas.Appearance'.Primary$/.test(c.node.Properties.Appearance ?? '') && !c.node.Properties.Visible);
    if (unconditionalPrimary.length > 1) add('action-competing-primary', n.name, 'Children', `${unconditionalPrimary.length} simultaneous primary actions`, 'review');
    if (kind === 'GroupContainer' && localButtons.some(c => /PF_controlHeight/.test(c.node.Properties.Height ?? '')) && /^=\d+$/.test(p.Height ?? '') && Number(p.Height!.slice(1)) < 44) add('spacing-touch-parent', n.name, 'Height', 'Fixed parent can constrain the 44px mobile target', 'review');
    if (n.depth > 10) add('layout-nesting', n.name, 'Children', `Container depth ${n.depth}`, 'review');
    if (kind === 'Badge' && !p.Content) add('color-only-state', n.name, 'Content', 'Status has no text', 'error');
    if (kind === 'Form') {
      const required = nodes.filter(c => c.parent === n.name && c.node.Properties.Required === '=true');
      for (const field of required) if (!nodes.some(c => c.parent === field.name && /\*/.test(c.node.Properties.Text ?? ''))) add('form-required-label', field.name, 'Required', 'Required field lacks visible marker');
      if (!nodes.some(c => /formHeading/.test(c.name))) add('form-task-group', n.name, 'Children', 'No explicit task heading; inspect schema order', 'review');
    }
    if (/_metrics$/.test(n.name) && (n.node.Children?.length ?? 0) >= 3) {
      const widths = n.node.Children!.map(c => Object.values(c)[0]!.Properties.Width);
      if (new Set(widths).size === 1) add('dashboard-equal-emphasis', n.name, 'Children', 'Three or more metrics share identical width; decision hierarchy needs review', 'review');
    }
    if (design.primary.components.treatments.StatusBadge === 'quiet' && /_status$|_priority$/.test(n.name) && kind === 'Badge') add('drift-component-treatment', n.name, 'Control', 'Dense operational priority requests quiet text, found Badge');
    if (design.primary.surfaces.strategy === 'flat' && p.DropShadow && !/None|PF_elevation/.test(p.DropShadow)) add('drift-elevation', n.name, 'DropShadow', 'Flat system uses no raised content surfaces');
  }
  for (const role of design.primary.typography.hierarchy) if (numericTokens.get(role.token) !== role.size) add('drift-type-role', 'App', role.token, `${role.role} must use ${role.size}`);
  const rowHeight = source.match(/PF_rowHeight\s*=\s*If\(PF_mobile,\s*96,\s*(\d+)\)/)?.[1];
  if (rowHeight && design.primary.density.level >= 7 && Number(rowHeight) > 64) add('drift-density', 'App', 'PF_rowHeight', `Dense contract emitted ${rowHeight}px desktop rows`);
  if (sizes.size > 8) add('type-scale-variance', 'App', 'Formulas', `${sizes.size} numeric type sizes`);
  if (borders > nodes.length / 3) add('surface-border-density', 'App', 'Controls', `${borders} of ${nodes.length} source controls declare borders`, 'review');
  return { ...audit, designId: design.primary.id, findings: [...audit.findings, ...findings], signals: { sourceBorders: borders, sourceSurfaces: surfaces, sourceBadges: badges, numericTypeSizes: [...sizes], radiusValues: [...radii] }, limitations: [...audit.limitations, 'Source counts include hidden states. Surface necessity, semantic grouping, color meaning and mobile squeezing require rendered critique.'] };
}

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const critiqueInputSchema = z.strictObject({
  device: z.enum(devices).default('desktop'),
  rendered: z.array(z.strictObject({state:z.string(), primaryActionInViewport:z.boolean(), simultaneousListAndDetail:z.boolean(), visibleFieldCount:z.number().nonnegative(), desktopChromeInTask:z.boolean()})).default([]),
  sourceHash: digest, product: productSchema, design: designSchema,
  reviewer: z.string().min(1), reviewedAt: z.string().datetime(),
  screenshots: z.array(z.strictObject({ state: z.string().min(1), path: z.string().min(1), sha256: digest, width: z.number().positive(), height: z.number().positive() })).min(1),
  strengths: z.array(z.string().min(1)).min(1),
  findings: z.array(z.strictObject({ priority: z.enum(['P0', 'P1', 'P2', 'P3']), category: z.enum(['task', 'hierarchy', 'layout', 'typography', 'surfaces', 'actions', 'color', 'responsive', 'polish']), state: z.string(), observation: z.string().min(10), consequence: z.string().min(10), recommendation: z.string().min(10), focus: z.enum(['layout', 'typeset', 'distill', 'color', 'polish', 'bolder', 'quieter']) })),
  notRecommended: z.array(z.string()).min(1),
});
/** Pure read-only synthesis. A reviewer must actually inspect the supplied rendered images. */
export function critique(files: NativeFiles, raw: unknown, verifiedImages: Record<string, string>) {
  const input = critiqueInputSchema.parse(raw); const audit = auditDesign(files, input.design);
  if (input.sourceHash !== audit.sourceHash) throw new Error('Critique source binding is stale');
  for (const shot of input.screenshots) if (verifiedImages[shot.path] !== shot.sha256) throw new Error('Rendered evidence missing or changed');
  for (const fact of input.rendered) if (!input.screenshots.some(s => s.state === fact.state)) throw new Error('Rendered fact has no reviewed screenshot');
  for (const finding of input.findings) if (!input.screenshots.some(s => s.state === finding.state)) throw new Error('Finding has no reviewed rendered state');
  const mode = input.design.modes.default;
  const contextualSignals = input.rendered.flatMap(f => [
    ...(input.device === 'mobile' && !f.primaryActionInViewport ? [{state:f.state, rule:'mobile-action-below-fold', consequence:'Required task action is not reachable without scrolling'}] : []),
    ...(input.device === 'mobile' && mode === 'operate' && f.simultaneousListAndDetail ? [{state:f.state, rule:'mobile-desktop-stacking', consequence:'Record work requires travel past the queue'}] : []),
    ...(input.device === 'mobile' && f.desktopChromeInTask ? [{state:f.state, rule:'mobile-task-chrome', consequence:'Navigation competes with field completion'}] : []),
  ]);
  return { ...input, contextualSignals, context: {mode, personality:input.design.personality, deviceStrategy:input.design.devices?.[input.device], spacingJudgment: mode === 'analyze' ? 'Check whether measures and comparisons have sufficient separation for periodic executive scanning.' : mode === 'operate' ? 'Check whether excess row spacing impedes repeated operational scanning.' : 'Check reading measure, evidence and action proximity for the current task.'}, findings: input.findings.slice().sort((a, b) => a.priority.localeCompare(b.priority)), direction: selectDirection(input.product), implementationAudit: audit, method: 'Reviewer-authored visual judgment plus independently labeled native source signals; no aesthetic score', mutations: 0 };
}
export function detectGeneratorSignature(products: z.infer<typeof productSchema>[]) {
  const decisions = products.map(selectDirection);
  const signatures = decisions.map(d => JSON.stringify([d.composition, d.density, d.surface, d.navigation, d.typography, d.variants, d.informationExposure, d.deviceStrategies, d.actionHierarchy]));
  return { decisions, repeatedAcrossDifferentJobs: signatures.flatMap((s, i) => signatures.flatMap((other, j) => i < j && s === other && products[i]!.purpose !== products[j]!.purpose ? [{ first: i, second: j, reason: 'Distinct product jobs resolved to the same design decisions' }] : [])) };
}

