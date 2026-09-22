import type { NativeFiles } from '../native-types.js';
import type { CanvasApp } from '../schema.js';
import { patternCatalog } from '../patterns.js';
import { resolveTaste, tasteFormulas } from './config.js';
import { controls, preflight, auditNative } from './audit.js';
import { selectComposition, compositions } from './compositions.js';
import { resolveRecipe } from './registry.js';
import { refineNative, refinementPasses } from './refine.js';
import { auditDesign } from './judgment.js';

/** Deterministic presentation pass. Stable identities and domain formulas stay owned by the native compiler. */
export type PresentationRole='record-metadata'|'detail-region'|'chart-region'|'supporting-region'|'page-content'|'command-region'|'list-identity';
export function applyTaste(files: NativeFiles, app: CanvasApp, roles:Record<string,PresentationRole>={}) {
  if (!app.taste) return undefined;
  const intent = resolveTaste(app.taste); const before = structuredClone(files);
  const formulas = { ...tasteFormulas(intent), PF_spaceSm: '8', PF_spaceInset: '12', PF_typeEyebrow: '12', PF_typeBrand: '18', PF_scrim: 'RGBA(10, 18, 32, 0.48)' };
  const appFile = files['App.pa.yaml'] as { App: { Properties: { Formulas: string } } };
  // Replace named formula definitions rather than emitting duplicate names.
  const original = appFile.App.Properties.Formulas.slice(1).split(';').map(v => v.trim()).filter(Boolean);
  appFile.App.Properties.Formulas = '=' + [...original.filter(line => !Object.hasOwn(formulas, line.split('=')[0]!.trim())), ...Object.entries(formulas).map(([k, v]) => `${k} = ${v}`)].join(';\n') + ';';
  const spacing: Record<string, string> = { '=4': '=PF_spaceXs', '=8': '=PF_spaceSm', '=12': '=PF_spaceInset', '=16': '=PF_spaceMd', '=24': '=PF_spaceLg', '=32': '=PF_spaceXl' };
  const type: Record<string, string> = { '=10': '=PF_typeCaption', '=11': '=PF_typeEyebrow', '=12': '=PF_typeCaption', '=14': '=PF_typeBody', '=16': '=PF_typeSection', '=18': '=PF_typeBrand', '=26': '=PF_typeTitle', '=30': '=PF_typeMetric' };
  for (const { name, node } of controls(files)) {
    const p = node.Properties;
    for (const [key, value] of Object.entries(p)) {
      if (/^(Padding|LayoutGap)/.test(key) && spacing[value]) p[key] = spacing[value];
      if (/^(Size|FontSize)$/.test(key) && type[value]) p[key] = type[value];
      if (value === '=RGBA(10, 18, 32, 0.48)') p[key] = '=PF_scrim';
      if (key.startsWith('On')) p[key] = value.replaceAll('ScreenTransition.None', 'PF_navigationTransition');
      if (value === '=If(PF_mobile, 96, 76)') p[key] = '=PF_rowHeight';
      if (value === '=If(PF_mobile, 84, 64)') p[key] = '=PF_rowHeight - 12';
    }
    if (roles[name]==='record-metadata') p.Height = '=If(PF_showMetadata, 22, 0)';
    if (roles[name]==='detail-region') p.Width = '=If(PF_wide, PF_detailWidth, Parent.Width)';
    if (roles[name]==='chart-region') p.Width = '=If(PF_mobile, Parent.Width, (Parent.Width - PF_spaceMd) * PF_chartShare)';
    if (roles[name]==='supporting-region') p.Width = '=If(PF_mobile, Parent.Width, (Parent.Width - PF_spaceMd) * (1 - PF_chartShare))';
    if (roles[name]==='page-content') p.LayoutGap = '=PF_gap';
    if (p.Height === '=40') p.Height = '=Max(40, PF_controlHeight)';
    if (roles[name]==='command-region') p.Height = '=If(PF_mobile, 152, If(PF_tablet, 88, 44))';
    // Center compact row contents without shrinking the 44px touch layout on phones.
    if (roles[name]==='list-identity') p.LayoutJustifyContent = '=LayoutJustifyContent.Center';
  }
  const refinements = [];
  if (app.taste.design) for (const focus of refinementPasses) {
    const result = refineNative(files, app.taste.design, focus); Object.assign(files, result.files);
    refinements.push({ focus, changes: result.changes, outcome: result.outcome, behavior: result.behavior });
  }
  const screenDecisions = Object.entries(app.screens).map(([key, screen]) => ({ key, mode: app.taste?.design?.modes[key] ?? app.taste?.design?.modes.default ?? (screen.pattern === 'dashboard' ? 'analyze' : 'operate'), composition: selectComposition(screen.pattern), definition: compositions().find(c => c.name === selectComposition(screen.pattern)), primaryInformation: screen.title, primaryAction: app.taste!.intent.primaryAction, secondaryInformation: app.taste!.intent.secondaryInformation }));
  const resolutions = patternCatalog().map(p => resolveRecipe({ name: p.name, ...(app.taste?.design ? { designContext: { mode: app.taste.design.modes.default ?? 'operate', personality: intent.personality, traits: app.taste.design.traits, density: app.taste.design.primary.density.level, device: 'desktop' as const } } : {}) }));
  const gate = preflight(files, before);
  if (!gate.staticPassed) throw new Error(`Taste static preflight failed: ${gate.blockers.map(b => `${b.rule}: ${b.evidence}`).join('; ')}`);
  const designAudit = app.taste.design ? auditDesign(files, app.taste.design) : undefined;
  if (designAudit?.findings.some(f => f.severity !== 'review')) throw new Error(`Design drift: ${designAudit.findings.filter(f => f.severity !== 'review').map(f => f.rule + ': ' + f.evidence).join('; ')}`);
  const decisions = app.taste.design ? [
    { decision: 'record-priority', selected: app.taste.design.primary.components.treatments.StatusBadge, rejected: ['color-only-state', 'large-filled-status'], reason: 'Priority must remain scannable without competing with record identity; explicit text remains.' },
    { decision: 'summary-composition', selected: app.taste.design.modes.default === 'analyze' ? 'question-lead-measure-comparison-drilldown' : app.taste.design.traits.includes('data-first') ? 'lead-priority-summary-and-recent-records' : 'contextual-summary', rejected: ['three-equal-cards', 'instruction-card'], reason: app.taste.design.modes.default === 'analyze' ? 'Periodic decisions need a scoped lead measure, comparison and inspectable supporting evidence.' : 'Operational overview should direct the next review using real accessible records.' },
    { decision: 'record-context', selected: 'record-title-first', rejected: ['generic-heading-before-title'], reason: 'The selected record is the subject of the panel, including the activity state.' },
    { decision: 'commit-workflow', selected: app.taste.design.modes.default === 'analyze' ? 'read-only-evidence' : 'existing-reviewed-form', rejected: ['inline-auto-save', 'remove-confirmation'], reason: app.taste.design.modes.default === 'analyze' ? 'The analytical job inspects evidence; business editing remains in the operational app.' : 'Design refinement preserves typed input, required reason and explicit review before save.' },
  ] : [];
  return { version: app.taste.design ? '2.0' : '1.0', intent, screens: screenDecisions, resolutions, decisions, refinements, designAudit, beforeAudit: auditNative(before), afterAudit: auditNative(files), preflight: gate };
}
