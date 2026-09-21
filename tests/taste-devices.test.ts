import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadProject } from '../src/config/load.js';
import { compileNativeCanvas } from '../src/canvas/native.js';
import { controls, dependencies, compareBehavior } from '../src/canvas/taste/audit.js';
import { compareDeviceMigration } from '../src/canvas/taste/mobile.js';
import { deviceStrategy } from '../src/canvas/taste/devices.js';
import { parseMemory, productSchema } from '../src/canvas/taste/memory.js';
import { selectDirection } from '../src/canvas/taste/strategies.js';
import { composeScreen } from '../src/canvas/taste/compositions.js';
import { pattern } from '../src/canvas/patterns.js';
import { visualFixtureVariant } from '../src/canvas/taste/fixtures.js';

const bindings = JSON.parse(readFileSync('examples/canvas-native-complaints/bindings.json', 'utf8'));
const { project } = await loadProject('examples/canvas-native-complaints');
const design = project.canvasApps!.complaintPortal!.taste!.design!;
const v2Project = structuredClone(project); delete v2Project.canvasApps!.complaintPortal!.taste!.design!.devices;
const before = compileNativeCanvas(v2Project, 'complaintPortal', bindings).files;
const after = compileNativeCanvas(project, 'complaintPortal', bindings).files;

it('selects mobile task architecture for operate, review, enter and approve, but reflows an analytical briefing', () => {
  for (const mode of ['operate', 'review', 'enter', 'approve'] as const) {
    expect(deviceStrategy(mode, 'WorkQueue', 'mobile').approach).toBe('device-specific-composition');
    expect(deviceStrategy(mode, 'WorkQueue', 'desktop').approach).toBe('responsive-adaptation');
  }
  expect(deviceStrategy('analyze', 'AnalyticalOverview', 'mobile').approach).toBe('responsive-adaptation');
  expect(deviceStrategy('enter', 'Wizard', 'mobile').informationOrder).toContain('validation');
  expect(deviceStrategy('approve', 'ApprovalQueue', 'mobile').informationOrder).toContain('supporting evidence');
});
it('keeps typed record identity, card scopes and every commit formula unchanged through mobile restructuring', () => {
  expect(compareBehavior(before, after).preserved).toBe(false); // Old literal-parent gate still works.
  expect(compareDeviceMigration(before, after, design).preserved).toBe(true);
  const current = new Map(dependencies(after).map(d => [d.control + '.' + d.property, d]));
  for (const d of dependencies(before).filter(d => d.behavioral && !['Visible','DisplayMode'].includes(d.property) && /SubmitForm|LastSubmit|Choices\(|OnFailure|Unsaved/.test(d.formula + d.property))) {
    expect(current.get(d.control + '.' + d.property)?.formula).toBe(d.formula);
  }
  for (const n of controls(before).filter(n => /_card_|_input_/.test(n.name))) expect(controls(after).find(a => a.name === n.name)?.parent).toBe(n.parent);
});
it('rejects changing save guards, reparenting input scope, or adding a new mutation during a device migration', () => {
  for (const attack of ['save', 'scope', 'new-mutation']) {
    const changed = structuredClone(after); const nodes = controls(changed);
    if (attack === 'save') nodes.find(n => n.name.endsWith('_save'))!.node.Properties.OnSelect = '=SubmitForm(pf_ds2_complaints_form)';
    if (attack === 'new-mutation') nodes.find(n => n.name.endsWith('_recordBack'))!.node.Properties.OnHidden = '=Remove(Complaints, First(Complaints))';
    if (attack === 'scope') {
      const card = nodes.find(n => n.name.endsWith('_card_title'))!;
      const input = card.node.Children!.find(c => Object.keys(c)[0]!.endsWith('_input_title'))!;
      card.node.Children = card.node.Children!.filter(c => c !== input);
      nodes.find(n => n.name.endsWith('_review'))!.node.Children!.push(input);
    }
    expect(compareDeviceMigration(before, changed, design).preserved).toBe(false);
  }
});
it('places task actions outside scrolling fields and keeps a single form and explicit list return', () => {
  const nodes = controls(after); const actions = nodes.find(n => n.name.endsWith('_editorActions'))!;
  expect(actions.parent).toMatch(/fixedFooter$/);
  expect(nodes.filter(n => n.node.Control === 'Form')).toHaveLength(1);
  expect(nodes.find(n => n.name.endsWith('_recordBack'))!.node.Properties.OnSelect).toContain('Set(pf_ds2_complaints_selected, Blank())');
  expect(nodes.find(n => n.name.endsWith('_tablePanel'))!.node.Properties.Visible).toContain('PF_tablet && App.Width < 960');
  expect(nodes.find(n => n.name.endsWith('_editDialog_panel'))!.node.Properties.Height).toContain('If(PF_mobile, Parent.Height');
});
it('requires identity/back bindings for mobile context slots and renders exclusive surfaces instead of a split', () => {
  const spec = {key:'tasks', composition:'WorkQueue', device:'mobile', title:'Tasks', primaryAction:{label:'New',action:'false'}, slots:{filters:[{key:'find',component:'SearchBox',props:{label:'Find'}}],body:[{key:'emptyBody',component:'EmptyState',props:{title:'"None"',description:'"No data"'}}],context:[{key:'detail',component:'DetailPanel',props:{title:'"Record"'}}]},states:{empty:'false',loading:'false',error:'""',retry:'false'}};
  expect(() => composeScreen(spec)).toThrow('selected identity');
  const output = JSON.stringify(composeScreen({...spec,mobileContext:{selected:'!IsBlank(chosen)',back:'Set(chosen, Blank())'}}));
  expect(output).toContain('Back to list'); expect(output).not.toContain('tasks_split');
  expect(output).toContain('=!(!IsBlank(chosen))');
});
it('supports optional offline generalization without provisioning applications', async () => {
  const operation = parseMemory(readFileSync('examples/canvas-native-complaints/design/complaintPortal/PRODUCT.md','utf8'),'product',productSchema);
  const executive = parseMemory(readFileSync('examples/canvas-performance/design/performance/PRODUCT.md','utf8'),'product',productSchema);
  const a=selectDirection(operation), b=selectDirection(executive);
  for (const key of ['personality','mode','composition','density','surface','variants','actionHierarchy','deviceStrategies'] as const) expect(a[key]).not.toEqual(b[key]);
  const {project: second}=await loadProject('examples/canvas-performance');
  const generated=compileNativeCanvas(second,'performance',bindings);
  const nodes=controls(generated.files);
  expect(nodes.some(n=>n.name.endsWith('_leadValue'))).toBe(true);
  expect(nodes.some(n=>n.name.endsWith('_drilldown'))).toBe(true);
  expect(nodes.some(n=>n.name.endsWith('_sidebar')||n.node.Control==='Form')).toBe(false);
  expect(dependencies(generated.files).flatMap(d=>d.writes).some(w=>['SubmitForm','Patch','Remove'].includes(w.operation!))).toBe(false);
});
it('rejects a task form without distinct body and action slots', () => {
  expect(()=>pattern('task','MobileTaskForm',{},[])).toThrow('requires body');
});
it('builds separately labeled, nonpersistent volume fixtures with no save or mutation path', () => {
  for (const count of [0,1,4,24] as const) {
    const result=visualFixtureVariant(after,bindings.sources.complaint,count);
    expect(result.evidence.publishable).toBe(false);
    expect(result.evidence.count).toBe(count);
    expect(dependencies(result.files).some(d=>/\b(SubmitForm|Patch|Remove|RemoveIf)\s*\(/.test(d.formula))).toBe(false);
    expect(controls(result.files).find(n=>n.node.Control==='Form')!.node.Properties.Item).toBe('=Blank()');
    expect(dependencies(result.files).some(d=>/Set\(\s*(false|""),/.test(d.formula))).toBe(false);
    expect(controls(result.files).find(n=>n.name.endsWith('_save'))!.node.Properties.DisplayMode).toBe('=DisplayMode.Disabled');
    expect(JSON.stringify(result.files)).toContain('VISUAL FIXTURES');
    expect(JSON.stringify(result.files)).toContain('Montgomery-Wellington');
  }
  expect(dependencies(after).some(d=>d.calls.includes('SubmitForm'))).toBe(true);
});
