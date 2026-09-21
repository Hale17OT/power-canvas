import { expect, it } from 'vitest';
import { parseTimeline } from '../src/timeline/model.js';
const event = { id: 'c1-created', timestamp: '2026-09-18T10:00:00Z', actor: 'Service team', kind: 'created', title: 'Complaint created', description: '<script>plain text</script>' };
it('bounds and validates event data, sorts deterministically and preserves text for safe DOM rendering', () => {
  expect(parseTimeline(JSON.stringify([event, { ...event, id: 'c2', timestamp: '2026-09-18T11:00:00Z' }])).map(e => e.id)).toEqual(['c2', 'c1-created']);
  expect(parseTimeline(JSON.stringify([event]))[0]!.description).toBe('<script>plain text</script>');
  for (const invalid of [[event, event], [{ ...event, timestamp: 'yesterday' }], [{ ...event, url: 'javascript:bad' }], Array(201).fill(event), [{ ...event, kind: 'delete' }]]) expect(() => parseTimeline(JSON.stringify(invalid))).toThrow();
  expect(parseTimeline('')).toEqual([]);
});
