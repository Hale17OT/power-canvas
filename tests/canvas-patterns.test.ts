import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { pattern, patternCatalog, patternRequestSchema, patternRequestJsonSchema, designFormulas } from '../src/canvas/patterns.js';
import { contrast } from '../src/canvas/tokens.js';
import { compileNativeCanvas } from '../src/canvas/native.js';
import { parseProject } from '../src/config/load.js';
it('instantiates a versioned generic component without embedding complaint data or mutation logic', () => {
  const names = patternCatalog().map(p => p.name);
  expect(names).toHaveLength(41); expect(new Set(names).size).toBe(names.length);
  const request = { version: '0.2.0', key: 'stockMetric', component: 'KpiCard', props: { label: '"Inventory"', value: 'Text(stockCount)', caption: '"Current stock"' } };
  expect(patternRequestSchema.safeParse(request).success).toBe(true);
  expect(patternRequestSchema.safeParse({ ...request, props: { ...request.props, x: 400 } }).success).toBe(false);
  expect(patternRequestSchema.safeParse({ ...request, version: '0.9.0' }).success).toBe(false);
  const generated = JSON.stringify(pattern('stockMetric', 'KpiCard', request.props));
  expect(generated).toContain('stockCount'); expect(generated).not.toMatch(/Complaint|pfx_|Patch|SubmitForm/);
  expect(generated).toContain('PF_typeMetric');
});
it('publishes component-specific JSON schemas and accessible dark/light text colors', () => {
  const schema = patternRequestJsonSchema();
  expect(schema.oneOf).toHaveLength(patternCatalog().length);
  expect(schema.oneOf.find(p => p.properties.component.const === 'KpiCard')!.properties.props.required).toContain('value');
  for (const [foreground, background] of [['#172033', '#FFFFFF'], ['#5D677A', '#F5F6FA'], ['#EDF2FA', '#1B2535'], ['#B8C4D6', '#253247'], ['#C4BEFF', '#1B2535'], ['#FFFFFF', '#4F46A5']]) expect(contrast(foreground!, background!)).toBeGreaterThanOrEqual(4.5);
});
it('requires an explicit reason destination and blocks invalid form bindings', () => {
  const p = parseProject(readFileSync('examples/canvas-native-complaints/powercanvas.yaml', 'utf8'));
  const b = JSON.parse(readFileSync('examples/canvas-native-complaints/bindings.json', 'utf8'));
  const screen = p.canvasApps!.complaintPortal!.screens.complaints!;
  if (screen.pattern !== 'masterDetail') throw new Error('Fixture changed');
  screen.detail.reasonField = 'title';
  expect(() => compileNativeCanvas(p, 'complaintPortal', b)).toThrow();
  screen.detail.reasonField = 'resolutionNotes';
  const yaml = compileNativeCanvas(p, 'complaintPortal', b).yaml['pf_screen_complaints.pa.yaml'];
  expect(yaml).toContain('Len(pf_ds2_complaints_card_resolutionNotes.Update) > 4000');
  expect(yaml).toContain('IsBlank(Trim(pf_ds2_complaints_input_title.Value))');
  expect(yaml).toContain('pf_ds2_complaints_editor && !pf_ds2_complaints_discard');
});
it('emits modern form bindings, responsive shell and guarded review workflow without legacy UI controls', () => {
  const p = parseProject(readFileSync('examples/canvas-native-complaints/powercanvas.yaml', 'utf8'));
  const b = JSON.parse(readFileSync('examples/canvas-native-complaints/bindings.json', 'utf8'));
  const r = compileNativeCanvas(p, 'complaintPortal', b); const yaml = Object.values(r.yaml).join('\n');
  expect(yaml).not.toMatch(/Control: (Label|Classic\/TextInput|Classic\/DropDown)/);
  expect(yaml).toContain('Variant: Modern'); expect(yaml).toContain('Variant: TextualEdit');
  expect(yaml).toContain('Review changes'); expect(yaml).toContain('Discard unsaved changes?');
  expect(yaml).toContain('FormMode.New, "Normal"'); expect(yaml).toContain('Set(pf_ds2_complaints_busy, false)');
  expect(yaml).toContain('ResetForm'); expect(yaml).toContain('Self.LastSubmit');
  expect(yaml).not.toMatch(/Remove\(|ClearCollect\(|Delete\(/);
  expect(yaml).toContain('LayoutDirection.Horizontal'); expect(yaml).toContain('LayoutDirection.Vertical');
  expect(r.manifest.patterns).toContain('DataTable@0.2.0');
  expect(compileNativeCanvas(p, 'complaintPortal', b)).toEqual(r);
});
it('centralizes the theme and breakpoint decisions for every pattern', () => {
  const t = designFormulas({ density: 'compact', brand: { primary: '#4F46A5' } });
  expect(t.PF_mobile).toBe('App.Width < 640'); expect(t.PF_wide).toBe('App.Width >= 1100');
  expect(t.PF_brand).toContain('#4F46A5'); expect(t.PF_controlHeight).toBe('36');
  const table = JSON.stringify(pattern('records', 'DataTable', { label: 'Records', items: 'Items', title: 'ThisItem.Name', onSelect: 'SelectRecord(ThisItem)' }));
  expect(table).toContain('Gallery'); expect(table).toContain('View ');
  expect(patternCatalog().find(p => p.name === 'DataTable')!.classicExceptions).toHaveLength(1);
});
