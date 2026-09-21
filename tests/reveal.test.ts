import { it, expect, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { revealIdentity, revealScript, addRevealToForm, observeReveal } from '../src/model-driven/reveal.js';
import { modelResources } from '../src/model-driven/desired.js';
import { formXml, elements } from '../src/model-driven/xml.js';
import { fixture } from './helpers.js';
import { validateSemantics } from '../src/ir/validate.js';
import { safeUpdate } from '../src/planner/dataverse.js';

it('hides on load, reveals all copies, focuses the first, toggles off and resets on reopen without data mutation', () => {
  const config = revealIdentity('pf', 'desk', 'main', ['pf_description', 'pf_notes']);
  const controls = Array.from({ length: 3 }, () => {
    let visible = true;
    return { setVisible: vi.fn((value: boolean) => { visible = value; }), getVisible: () => visible, setFocus: vi.fn() };
  });
  const attributes = { pf_description: { controls: controls.slice(0, 2) }, pf_notes: { controls: controls.slice(2) } };
  const form = { getAttribute: (name: keyof typeof attributes) => attributes[name] };
  const api = runInNewContext(`${revealScript(config)}; ${config.namespace}`) as { onLoad(context: unknown): void; toggle(form: unknown): void };
  api.onLoad({ getFormContext: () => form }); expect(controls.every(c => !c.getVisible())).toBe(true);
  api.toggle(form); expect(controls.every(c => c.getVisible())).toBe(true); expect(controls[0]!.setFocus).toHaveBeenCalledTimes(1);
  api.toggle(form); expect(controls.every(c => !c.getVisible())).toBe(true);
  api.toggle(form); api.onLoad({ getFormContext: () => form }); expect(controls.every(c => !c.getVisible())).toBe(true);
  expect(() => api.toggle(null)).not.toThrow(); expect(() => api.onLoad(null)).not.toThrow();
  expect(() => api.toggle({ getAttribute: () => null })).not.toThrow();
  expect(revealScript(config)).not.toMatch(/Xrm.Page|document\.|fetch\(|setValue|\.save\(/);
});

it('merges only new field rows/library/onload binding and detects altered bindings', () => {
  const project = fixture(); const spec = modelResources(project).find(item => item.kind === 'form')!;
  const fields = spec.properties.fields as string[];
  const attributes = [...fields, 'pf_notes'].map(LogicalName => ({ LogicalName, AttributeType: 'String', DisplayName: { LocalizedLabels: [{ LanguageCode: 1033, Label: LogicalName }] } }));
  const original = formXml(spec, attributes).replace('</form>', '<formLibraries><Library name="unrelated.js" libraryUniqueId="original"/></formLibraries><events><event name="onsave" application="false" active="true"><Handlers><Handler functionName="existingSave" libraryName="unrelated.js" handlerUniqueId="keep" enabled="true"/></Handlers></event></events></form>');
  const reveal = revealIdentity('pf', 'desk', 'main', ['pf_notes']);
  const changed = { ...spec, properties: { ...spec.properties, fields: [...fields, 'pf_notes'], reveal } };
  const merged = addRevealToForm(original, changed, attributes);
  expect(elements(merged, 'control').map(e => e.getAttribute('datafieldname'))).toEqual([...fields, 'pf_notes']);
  expect(merged).toContain('existingSave'); expect(merged).toContain('libraryUniqueId="original"');
  expect(observeReveal(original, reveal)).toBeNull(); expect(observeReveal(merged, reveal)).toEqual(reveal);
  expect(() => observeReveal(merged.replace('passExecutionContext="true"', 'passExecutionContext="false"'), reveal)).toThrow('conflicts');
  expect(() => addRevealToForm(merged, changed, attributes)).toThrow('conflicts');
  expect(() => addRevealToForm(original.replace('name="onsave"', 'name="onload"'), changed, attributes)).toThrow('conflicts');
  expect(() => observeReveal(merged.replace('name="onload" application="false" active="true"', 'name="onload" application="false" active="false"'), reveal)).toThrow('conflicts');
  expect(safeUpdate('form', spec.properties, changed.properties)).toBe(true);
  expect(safeUpdate('form', changed.properties, spec.properties)).toBe(false);
  expect(safeUpdate('form', spec.properties, { ...changed.properties, fields: ['pf_notes'] })).toBe(false);
});

it('rejects reveal of required, absent and duplicate fields', () => {
  const project = fixture(); const app = Object.values(project.apps)[0]!; const form = Object.values(app.forms)[0]!;
  form.reveal = { fields: [form.fields[0]!, form.fields[0]!, 'missing'] };
  expect(validateSemantics(project).length).toBeGreaterThan(0);
});
