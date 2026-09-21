import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseProject } from '../src/config/load.js';
import { compileNativeCanvas } from '../src/canvas/native.js';
import { planNativeSync } from '../src/canvas/sync.js';
const project = () => parseProject(readFileSync('examples/canvas-native-complaints/powercanvas.yaml', 'utf8'));
const bindings = JSON.parse(readFileSync('examples/canvas-native-complaints/bindings.json', 'utf8'));
it('generates native button and guarded form mutations using discovered field names', () => {
  const result = compileNativeCanvas(project(), 'complaintPortal', bindings);
  const yaml = result.yaml['pf_screen_complaints.pa.yaml']!;
  expect(yaml).toContain('Show details'); expect(yaml).toContain('SubmitForm'); expect(yaml).toContain('Self.LastSubmit'); expect(yaml).toContain('Unsaved'); expect(yaml).toContain('Parent.Error'); expect(yaml).toContain('Choices(\'Complaints\'.\'Priority\')');
  expect(yaml).toContain('Control: ModernDropdown'); expect(yaml).toContain('Selected.Value'); expect(yaml).toContain('FormMode.New, "Normal", Text(Parent.Default)');
  expect(yaml).not.toMatch(/Remove\(|ClearCollect|FirstN/); expect(result.yaml['Screen1.pa.yaml']).not.toContain('pf_ds2_complaints_form');
  expect(result).toEqual(compileNativeCanvas(project(), 'complaintPortal', bindings));
  expect(() => compileNativeCanvas(project(), 'complaintPortal', { ...bindings, controls: ['Button'] })).toThrow('discovery');
});
it('reconciles normalized defaults, retains manual edits, blocks conflicts and a second sync is a no-op', () => {
  const generated = { 'Screen1.pa.yaml': { Properties: { Text: '="original"', X: '=0' } } };
  const receipt = { 'Screen1.pa.yaml': { Properties: { Text: '="original"' } } };
  const current = { 'Screen1.pa.yaml': { Properties: { Text: '="manual"', Fill: '=Color.Red' } } };
  expect(planNativeSync(generated, receipt, generated, current)).toMatchObject({ noOp: true, files: current });
  const desired = { 'Screen1.pa.yaml': { Properties: { Text: '="generated"', X: '=0' } } };
  expect(planNativeSync(generated, receipt, desired, current).executable).toBe(false);
  const first = planNativeSync(generated, receipt, desired, receipt); expect(first.changes).toHaveLength(1);
  expect(planNativeSync(desired, first.files, desired, first.files).noOp).toBe(true);
  expect(planNativeSync(generated, receipt, {}, receipt).executable).toBe(false);
});
it('does not adopt a new control colliding with a Studio-created control', () => {
  const base = { 'Screen1.pa.yaml': { Children: [] } };
  const desired = { 'Screen1.pa.yaml': { Children: [{ pf_button: { Control: 'Button', Properties: { Text: '="Generated"' } } }] } };
  const current = { 'Screen1.pa.yaml': { Children: [{ pf_button: { Control: 'Button', Properties: { Text: '="Manual"' } } }] } };
  expect(planNativeSync(base, base, desired, current).executable).toBe(false);
});
