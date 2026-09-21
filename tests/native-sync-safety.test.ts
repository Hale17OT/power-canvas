import { expect, it } from 'vitest';
import { planNativeSync } from '../src/canvas/sync.js';
it('blocks disappearance of an owned control even when generated intent did not change', () => {
  const base = { 'Screen1.pa.yaml': { Children: [{ pf_button: { Control: 'Button', Properties: { Text: '="Owned"' } } }] } };
  const live = { 'Screen1.pa.yaml': { Children: [] } };
  expect(planNativeSync(base, base, base, live)).toMatchObject({ executable: false, noOp: false });
  expect(planNativeSync(base, base, base, {}).conflicts).toContain('/Screen1.pa.yaml: owned screen or control is missing');
});
