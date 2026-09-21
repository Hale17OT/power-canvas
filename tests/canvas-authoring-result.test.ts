import { expect, it } from 'vitest';
import { compileSucceeded } from '../src/canvas/authoring-result.js';
it('rejects a validation failure even if the transport reports isError false', () => {
  expect(compileSucceeded({ isError: false, content: [{ type: 'text', text: 'Validation FAILED\nerror: invalid card formula' }] })).toBe(false);
  expect(compileSucceeded({ content: [{ type: 'text', text: '✓ Validation PASSED\nFiles validated: 3' }] })).toBe(true);
  expect(compileSucceeded({ content: [{ type: 'text', text: 'Connected' }] })).toBe(false);
});
