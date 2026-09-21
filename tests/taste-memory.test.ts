import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stringify, parse } from 'yaml';
import { parseMemory, productSchema, designSchema, referenceSchema, companion, inferMode, sha256 } from '../src/canvas/taste/memory.js';
import { generateDesign, selectDirection } from '../src/canvas/taste/strategies.js';
import { auditDesign, critique, detectGeneratorSignature } from '../src/canvas/taste/judgment.js';
import { refineNative, refinementPasses } from '../src/canvas/taste/refine.js';
import { compareBehavior, auditNative, controls } from '../src/canvas/taste/audit.js';
import { resolveRecipe } from '../src/canvas/taste/registry.js';
import { loadProject } from '../src/config/load.js';
import { compileNativeCanvas } from '../src/canvas/native.js';
import { control } from '../src/canvas/patterns.js';
import { resolveTaste } from '../src/canvas/taste/config.js';
const productMd = readFileSync('examples/canvas-native-complaints/design/complaintPortal/PRODUCT.md', 'utf8');
const product = parseMemory(productMd, 'product', productSchema);
const memory = generateDesign(product);
const markdown = (value: unknown) => '```powercanvas-design\n' + stringify(value) + '```';
const baseline = () => Object.fromEntries(['App.pa.yaml', 'Screen1.pa.yaml', 'pf_screen_complaints.pa.yaml'].map(name => [name, parse(readFileSync('tests/fixtures/native-taste-v1/' + name, 'utf8'))]));

it('parses product truth separately from visual memory and infers operational mode', () => {
  expect(product.name).toBe('Complaint Desk'); expect(inferMode(product)).toBe('operate');
  expect(productSchema.safeParse({ ...product, radius: 4 }).success).toBe(false);
  expect(productSchema.safeParse({ ...product, users: [] }).success).toBe(false);
});
it('rejects missing, duplicate and invalid memory contracts', () => {
  expect(() => parseMemory('# Only prose', 'design', designSchema)).toThrow('exactly one');
  expect(() => parseMemory(markdown(memory) + markdown(memory), 'design', designSchema)).toThrow('exactly one');
  expect(() => parseMemory(markdown({ ...memory, primary: {} }), 'design', designSchema)).toThrow();
  expect(() => parseMemory('```powercanvas-design\nx: 1\nx: 2\n```', 'design', designSchema)).toThrow();
});
it('generates a companion from one human authority and binds both documents', () => {
  const result = companion(productMd, markdown(memory)); expect(result.design).toEqual(memory);
  expect(result.designHash).not.toBe(companion(productMd, markdown(memory) + '\nNew reasoning').designHash);
});
it('rejects incompatible primary and secondary traits and density mismatch', () => {
  expect(designSchema.safeParse({ ...memory, secondaryTraits: ['low-density'] }).success).toBe(false);
  expect(designSchema.safeParse({ ...memory, traits: ['brand-linear'] }).success).toBe(false);
  expect(designSchema.safeParse({ ...memory, primary: { ...memory.primary, density: { level: 2, notes: 'Mismatch' } } }).success).toBe(false);
});
it('requires reference adaptation distinctions; normalizes abstract traits without brand cloning', () => {
  const reference = parseMemory('```powercanvas-reference\n' + stringify(memory.primary) + '```', 'reference', referenceSchema);
  expect(reference.powerAppsAdaptation.unsupported).toContain('Backdrop blur');
  expect(reference.powerAppsAdaptation.translated).toContain('CSS grid becomes responsive AutoLayout');
  expect(referenceSchema.safeParse({ ...reference, powerAppsAdaptation: {} }).success).toBe(false);
  expect(reference.id).not.toMatch(/linear|notion|stripe/);
});
it('differentiates five jobs on composition and information exposure, not pixels', () => {
  const products = ['operations', 'executive', 'approval', 'document-review', 'inspection'].map(purpose => productSchema.parse({ ...product, purpose, devices: purpose === 'inspection' ? ['mobile'] : ['desktop'] }));
  const result = detectGeneratorSignature(products);
  expect(result.repeatedAcrossDifferentJobs).toHaveLength(0);
  expect(new Set(result.decisions.map(d => d.composition)).size).toBe(5);
  expect(new Set(result.decisions.map(d => d.informationExposure)).size).toBe(5);
  expect(selectDirection(products[4]!).navigation).toBe('bottom task dock');
});
it.each(refinementPasses)('%s preserves every behavior and leaves input untouched', focus => {
  const before = baseline(); const original = JSON.stringify(before);
  const result = refineNative(before, memory, focus);
  expect(JSON.stringify(before)).toBe(original); expect(compareBehavior(before, result.files).preserved).toBe(true);
  if (focus === 'bolder' || focus === 'quieter') expect(result.outcome).toBe('No justified change');
  if (focus === 'typeset') expect(JSON.stringify(result.files)).toContain('PF_typeTitle = 24');
});
it('distills redundant labels while retaining inputs, validation and SubmitForm', () => {
  const before = baseline(); const result = refineNative(before, memory, 'distill');
  expect(controls(result.files).length).toBe(controls(before).length - 4);
  expect(JSON.stringify(result.files)).toContain('SubmitForm'); expect(JSON.stringify(result.files)).toContain('Reason for change');
  expect(controls(result.files).find(n => n.name.endsWith('_detail_title'))!.node.Properties.Text).toBe(controls(before).find(n => n.name.endsWith('_selectedTitle'))!.node.Properties.Text);
});
it('rejects distillation of a label that acquires a dependent formula', () => {
  const before = baseline(); const node = controls(before).find(n => n.name.endsWith('_recordLabel'))!;
  node.node.Properties.OnSelect = '=Set(important, true)';
  expect(() => refineNative(before, memory, 'distill')).toThrow('dependent');
});
it('quiet priority retains textual meaning and does not change choice expressions', () => {
  const result = refineNative(baseline(), memory, 'polish'); const status = controls(result.files).find(n => n.name.endsWith('_list_status'))!;
  expect(status.node.Control).toBe('ModernText'); expect(status.node.Properties.Text).toContain('Text(ThisItem');
});
it('detects drift and applies only an exact scoped reasoned exception', () => {
  const files = baseline(); const n = controls(files).find(n => n.name.endsWith('_tablePanel'))!;
  n.node.Properties.RadiusTopLeft = '=11'; n.node.Properties.PaddingLeft = '=17';
  const report = auditDesign(files, memory); expect(report.findings.some(f => f.rule === 'drift-radius' && f.severity === 'warning')).toBe(true);
  const excepted = auditDesign(files, { ...memory, exceptions: [{ control: n.name, property: 'RadiusTopLeft', rule: 'drift-radius', reason: 'Reviewed legacy host boundary needs this local geometry.' }] });
  expect(excepted.findings.find(f => f.rule === 'drift-radius')!.severity).toBe('review');
  expect(excepted.findings.find(f => f.rule === 'drift-spacing')!.severity).toBe('warning');
});
it('detects source signals across typography, surfaces, forms, color, spacing and dashboard categories', () => {
  const files = baseline(); const nodes = controls(files);
  nodes.find(n => n.name.endsWith('_list_metadata'))!.node.Properties.Size = '=9';
  nodes.find(n => n.name.endsWith('_detail'))!.node.Properties.DropShadow = '=DropShadow.Bold';
  const badge = nodes.find(n => n.name.endsWith('_list_status'))!; delete badge.node.Properties.Content;
  const required = nodes.find(n => n.name.endsWith('_card_title_label'))!; required.node.Properties.Text = '="Title"';
  const rules = auditDesign(files, memory).findings.map(f => f.rule);
  for (const rule of ['type-readable-metadata', 'drift-elevation', 'color-only-state', 'form-required-label', 'dashboard-equal-emphasis']) expect(rules).toContain(rule);
});
it('resolver uses design context while refusing to bypass required capabilities', () => {
  const context = { mode: 'operate', personality: 'dense-operations', traits: memory.traits, density: 8, device: 'desktop' as const };
  expect(resolveRecipe({ name: 'StatusBadge', designContext: context })).toMatchObject({ treatment: 'quiet', nativeControl: 'ModernText' });
  expect(() => resolveRecipe({ name: 'StatusBadge', designContext: context, requiredCapabilities: ['unknown-state-event'] })).toThrow();
});
it('critique is read-only, priority ordered and bound to rendered evidence and source', () => {
  const files = baseline(); const original = JSON.stringify(files); const imageHash = sha256('rendered-test-fixture');
  const input = { sourceHash: auditNative(files).sourceHash, product, design: memory, reviewer: 'test reviewer', reviewedAt: '2026-09-18T14:00:00Z', screenshots: [{ state: 'queue', path: 'queue.png', sha256: imageHash, width: 1440, height: 900 }], strengths: ['Typed edit workflow'], findings: ['P2', 'P1'].map(priority => ({ priority, category: 'hierarchy', state: 'queue', observation: 'Title competes with chrome', consequence: 'Slower repetitive triage', recommendation: 'Reduce chrome emphasis', focus: 'layout' })), notRecommended: ['Removing review before save'] };
  expect(critique(files, input, { 'queue.png': imageHash }).findings[0]!.priority).toBe('P1');
  expect(JSON.stringify(files)).toBe(original);
  expect(() => critique(files, input, {})).toThrow('Rendered evidence');
  expect(() => critique(files, { ...input, sourceHash: sha256('stale') }, { 'queue.png': imageHash })).toThrow('stale');
});
it('loads authoritative memory into the existing native generation and drift audit path', async () => {
  const { project } = await loadProject('examples/canvas-native-complaints');
  const generated = compileNativeCanvas(project, 'complaintPortal', JSON.parse(readFileSync('examples/canvas-native-complaints/bindings.json', 'utf8')));
  expect(generated.taste!.version).toBe('2.0'); expect(generated.taste!.designAudit!.findings.filter(f => f.severity !== 'review')).toHaveLength(0);
  const v2Project = structuredClone(project); delete v2Project.canvasApps!.complaintPortal!.taste!.design!.devices;
  const v2 = compileNativeCanvas(v2Project, 'complaintPortal', JSON.parse(readFileSync('examples/canvas-native-complaints/bindings.json', 'utf8')));
  expect(compareBehavior(baseline(), v2.files).preserved).toBe(true);
  expect(generated.devicePreservation!.preserved).toBe(true);
  const recent = controls(generated.files).find(n => n.name.endsWith('_recent_select'))!;
  expect(recent.node.Properties.OnSelect).toContain('Navigate');
  expect(recent.node.Properties.OnSelect).not.toMatch(/ResetForm|ViewForm|Patch|SubmitForm|Remove/);
});
it('protects selected tab defaults and input value bindings during refinements', () => {
  const before = baseline(); const changed = structuredClone(before);
  controls(changed).find(n => n.name.endsWith('_detailTabs'))!.node.Properties.DefaultSelectedItems = '=["Activity"]';
  controls(changed).find(n => n.name.endsWith('_input_title'))!.node.Properties.Value = '=""';
  expect(compareBehavior(before, changed).changed.map(d => d.property).sort()).toEqual(['DefaultSelectedItems', 'Value']);
});
it('detects action excess, deep layout and touch-parent constraints without declaring beauty scores', () => {
  const files = baseline(); const row = controls(files).find(n => n.name.endsWith('_detailCommand'))!;
  row.node.Properties.Height = '=32';
  row.node.Children!.push(control('pf_extra_action', 'Button', { OnSelect: '=false', Height: '=PF_controlHeight', Appearance: "='ButtonCanvas.Appearance'.Primary", AccessibleLabel: '="Another command"' }));
  const report = auditDesign(files, memory);
  expect(report.findings.map(f => f.rule)).toContain('spacing-touch-parent');
  const gallery = controls(files).find(n => n.name.endsWith('_list'))!;
  gallery.node.Children!.push(...[1, 2, 3].map(i => control(`pf_noise_${i}`, 'Button', { AccessibleLabel: '="Noise"', OnSelect: '=false' })));
  expect(auditDesign(files, memory).findings.map(f => f.rule)).toContain('action-row-count');
});
it('rejects density drift rather than allowing contradictory dial and memory values', async () => {
  const { project } = await loadProject('examples/canvas-native-complaints');
  project.canvasApps!.complaintPortal!.taste!.dials.visualDensity = 2;
  expect(() => compileNativeCanvas(project, 'complaintPortal', JSON.parse(readFileSync('examples/canvas-native-complaints/bindings.json', 'utf8')))).toThrow('drift-density');
});
it('uses the memory personality when no legacy override is present and rejects conflicting authorities', async () => {
  const { project } = await loadProject('examples/canvas-native-complaints');
  const taste = project.canvasApps!.complaintPortal!.taste!;
  const executive = generateDesign({ ...product, purpose: 'executive' });
  const intent = { intent: taste.intent, design: executive };
  expect(resolveTaste(intent).personality).toBe('executive-dashboard');
  expect(() => resolveTaste({ ...intent, personality: 'dense-operations' })).toThrow('conflicts');
});

