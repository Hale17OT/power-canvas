import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseProject } from '../src/config/load.js';
import { compileNativeCanvas } from '../src/canvas/native.js';
import { tasteSchema, resolveTaste, personalityNames } from '../src/canvas/taste/config.js';
import { recipes, recipeSchema, resolveRecipe } from '../src/canvas/taste/registry.js';
import { compositions, composeScreen } from '../src/canvas/taste/compositions.js';
import { auditNative, compareBehavior, dependencies, preflight, controls } from '../src/canvas/taste/audit.js';
import { control } from '../src/canvas/patterns.js';
const fixture = () => parseProject(readFileSync('examples/canvas-native-complaints/powercanvas.yaml', 'utf8'));
const bindings = JSON.parse(readFileSync('examples/canvas-native-complaints/bindings.json', 'utf8'));
const generate = () => compileNativeCanvas(fixture(), 'complaintPortal', bindings);
const config = () => fixture().canvasApps!.complaintPortal!.taste!;

it('validates normalized dials and rejects unknown configuration without coercion', () => {
  for (const value of [-1, 11, NaN, '8']) expect(tasteSchema.safeParse({ ...config(), dials: { visualDensity: value } }).success).toBe(false);
  expect(tasteSchema.safeParse({ ...config(), unknown: true }).success).toBe(false);
  expect(resolveTaste({ ...config(), dials: { visualDensity: 0 } }).dials.visualDensity).toBe(0);
});
it('selects a personality from workflow and keeps every personality observably distinct', () => {
  const input = config(); delete input.personality;
  expect(resolveTaste({ ...input, intent: { ...input.intent, purpose: 'executive' } }).personality).toBe('executive-dashboard');
  expect(resolveTaste({ ...input, intent: { ...input.intent, frequency: 'continuous' } }).personality).toBe('dense-operations');
  expect(new Set(personalityNames.map(personality => JSON.stringify(resolveTaste({ ...input, personality, dials: {} }).tokens))).size).toBe(5);
});
it('all five dials affect emitted native presentation and reduced motion wins', () => {
  for (const dial of ['designVariance', 'visualDensity', 'brandExpression', 'componentComplexity', 'motionIntensity'] as const) {
    const p = fixture(); const app = p.canvasApps!.complaintPortal!; app.taste!.reducedMotion = false;
    app.taste!.dials[dial] = 0; const a = compileNativeCanvas(p, 'complaintPortal', bindings);
    app.taste!.dials[dial] = 10; const b = compileNativeCanvas(p, 'complaintPortal', bindings);
    expect(a.yaml['App.pa.yaml']).not.toBe(b.yaml['App.pa.yaml']);
    expect(compareBehavior(a.files, b.files).preserved).toBe(true);
  }
  expect(resolveTaste({ ...config(), reducedMotion: true, dials: { motionIntensity: 10 } }).tokens.transition).toBe('ScreenTransition.None');
});
it('changes native row density while retaining mobile touch dimensions and editable bindings', () => {
  const p = fixture(); p.canvasApps!.complaintPortal!.taste!.dials.visualDensity = 2;
  const spacious = compileNativeCanvas(p, 'complaintPortal', bindings);
  p.canvasApps!.complaintPortal!.taste!.dials.visualDensity = 9;
  const dense = compileNativeCanvas(p, 'complaintPortal', bindings);
  expect(spacious.yaml['App.pa.yaml']).toContain('PF_rowHeight = If(PF_mobile, 96, 96)');
  expect(dense.yaml['App.pa.yaml']).toContain('PF_rowHeight = If(PF_mobile, 96, 64)');
  expect(dense.yaml['App.pa.yaml']).toContain('PF_controlHeight = If(PF_mobile, 44, 36)');
  expect(controls(dense.files).find(n => n.name.endsWith('_pageActions'))!.node.Properties.Height).toBe('=Max(40, PF_controlHeight)');
  expect(compareBehavior(spacious.files, dense.files).preserved).toBe(true);
});
it('loads a broad validated vocabulary without presenting planned recipes as executable', () => {
  expect(recipes().length).toBeGreaterThan(100);
  for (const recipe of recipes()) expect(recipeSchema.safeParse(recipe).success).toBe(true);
  expect(() => resolveRecipe({ name: 'KanbanBoard' })).toThrow('not executable');
  expect(() => resolveRecipe({ name: 'Unknown' })).toThrow('Unknown');
});
it('prefers sufficient modern capabilities before compositions or PCF and justifies Gallery', () => {
  expect(resolveRecipe({ name: 'DataTable', requiredCapabilities: ['read'], modernCapabilities: ['read'], compositionCapabilities: ['read'], allowPCF: true, pcfJustification: 'Unnecessary' }).level).toBe('modern');
  expect(resolveRecipe({ name: 'DataTable' }).reason).toContain('Gallery');
  expect(resolveRecipe({ name: 'StandardField' }).level).toBe('modern');
  expect(() => resolveRecipe({ name: 'EditableTable', requiredCapabilities: ['spreadsheet'], allowPCF: true })).toThrow();
  expect(resolveRecipe({ name: 'EditableTable', requiredCapabilities: ['spreadsheet'], modernCapabilities: ['read'], compositionCapabilities: ['edit'], allowPCF: true, pcfJustification: 'Keyboard cell navigation and virtualization exceed discovered controls.' })).toMatchObject({ level: 'pcf', executable: false });
});
it('renders all fourteen compositions through mandatory semantic slots and rejects missing slots', () => {
  for (const spec of compositions()) {
    const input = { key: 'workspace', composition: spec.name, title: 'A "quoted" title', primaryAction: { label: 'Continue', action: 'Set(continued, true)' }, slots: Object.fromEntries(spec.slots.map((slot, i) => [slot, [{ key: `section${i}`, component: 'FormSection', props: { title: '"Section"' } }]])), states: { empty: 'IsEmpty(records)', loading: 'busy', error: 'loadError', retry: 'Refresh(Records)' } };
    const rendered = JSON.stringify(composeScreen(input));
    expect(rendered).toContain('Set(continued, true)'); expect(rendered).toContain('Spinner');
    expect(rendered).toContain('LayoutOverflow.Scroll'); expect(rendered).not.toContain('Classic/');
    expect(() => composeScreen({ ...input, slots: {} })).toThrow('Missing');
  }
});
it('audits native code and identifies actual token, control, accessibility and state failures', () => {
  const files = { 'Screen.pa.yaml': { Screens: { Screen: { Children: [control('old', 'Label', { Size: '=17' }), control('input', 'TextInput', { FontSize: '=23' })] } } } };
  const r = auditNative(files);
  expect(r.metrics.classicVisual).toBe(1);
  expect(r.findings.map(f => f.rule)).toEqual(expect.arrayContaining(['modern-equivalent', 'accessible-name', 'token-style', 'state-error']));
  expect(preflight(files).staticPassed).toBe(false);
});
it('blocks undefined tokens and duplicate identities instead of accepting plausible-looking source', () => {
  const r = generate(); const invalid = structuredClone(r.files);
  controls(invalid)[0]!.node.Properties.Fill = '=PF_unknown';
  expect(preflight(invalid).blockers.some(f => f.rule === 'undefined-token')).toBe(true);
  const duplicate = { 'Screen.pa.yaml': { Screens: { Screen: { Children: [control('same', 'ModernText', {}), control('same', 'ModernText', {})] } } } };
  expect(auditNative(duplicate).findings.some(f => f.rule === 'duplicate-identity')).toBe(true);
  expect(() => resolveRecipe({ name: 'DataTable', variant: 'editable' })).toThrow('capability contract');
});
it('traces references, writes, flows, screen handlers and nested form behavior without string false positives', () => {
  const files = { 'Screen.pa.yaml': { Screens: { Screen: { Properties: { OnVisible: '=ClearCollect(cache, Orders)' }, Children: [control('input', 'TextInput', { Value: '="Patch(fake)"' }), control('save', 'Button', { OnSelect: '=Set(selected, input.Value); MyFlow.Run(input.Value); SubmitForm(form)' })] } } } };
  const d = dependencies(files); const save = d.find(x => x.control === 'save')!;
  expect(save.references).toContain('input'); expect(save.calls).toContain('MyFlow.Run'); expect(save.writes.map(w => w.operation)).toContain('SubmitForm');
  expect(d.find(x => x.control === 'Screen')!.writes[0]!.operation).toBe('ClearCollect');
  expect(d.find(x => x.control === 'input')!.calls).toEqual([]);
});
it('blocks removed/changed business formulas, including changes to SubmitForm and screen OnVisible', () => {
  const r = generate(); const broken = structuredClone(r.files);
  controls(broken).find(n => n.name.endsWith('_save'))!.node.Properties.OnSelect = '=false';
  expect(preflight(broken, r.files).blockers.some(b => b.rule === 'functional-preservation')).toBe(true);
  expect(compareBehavior(r.files, broken).changed.some(d => d.calls.includes('SubmitForm'))).toBe(true);
});
it('requires fresh source-bound runtime evidence even after static checks pass', () => {
  const r = generate(); const gate = preflight(r.files);
  expect(gate.staticPassed).toBe(true); expect(gate.complete).toBe(false);
  const evidence = { sourceHash: gate.sourceHash, desktop: true, tablet: true, narrow: true, accessibility: true, behavior: true, visualReview: true };
  expect(preflight(r.files, undefined, evidence).complete).toBe(true);
  expect(preflight(r.files, undefined, { ...evidence, sourceHash: 'stale' }).complete).toBe(false);
});
it('integrates Taste into native generation without losing existing workflows or inventing scores', () => {
  const r = generate(); expect(r.taste!.afterAudit.findings.filter(f => f.severity !== 'review')).toEqual([]);
  expect(r.taste!.preflight.behavior!.preserved).toBe(true);
  expect(r.taste!.screens.find(s => s.key === 'complaints')!.composition).toBe('WorkQueue');
  const source = Object.values(r.yaml).join('\n');
  for (const behavior of ['SubmitForm(', 'Self.LastSubmit', 'Choices(', 'ResetForm(', 'Reason for change', 'No complaints yet']) expect(source).toContain(behavior);
  expect(r.taste!.resolutions.find(c => c.recipe.name === 'DataTable')!.level).toBe('composition');
});
