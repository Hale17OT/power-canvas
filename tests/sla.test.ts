import { expect, it } from 'vitest';
import { evaluateSla, type SlaPolicy } from '../src/sla/rules.js';
const policy: SlaPolicy = { apiVersion: 'powercanvas.sla/v1alpha1', name: 'pfx_ComplaintSla', version: 1, clock: 'elapsedUtcHours', hours: { low: 72, normal: 24, high: 4 } };
const input = { id: '55555555-5555-4555-8555-555555555555', createdAt: '2026-09-18T00:00:00Z', priority: 'high' as const };
it('escalates at the exact deadline once and remains idempotent on later runs', () => {
  const before = evaluateSla(policy, input, '2026-09-18T03:59:59Z'); expect(before.escalatedAt).toBeNull();
  const at = evaluateSla(policy, input, '2026-09-18T04:00:00Z', before); expect(at.events.filter(e => e.kind === 'escalated')).toHaveLength(1);
  expect(evaluateSla(policy, input, '2026-09-18T05:00:00Z', at)).toEqual(at);
});
it('handles resolution before/after deadline, priority changes, bad clocks and explicit policy migrations', () => {
  expect(evaluateSla(policy, { ...input, resolvedAt: '2026-09-18T03:00:00Z' }, '2026-09-19T00:00:00Z').escalatedAt).toBeNull();
  expect(evaluateSla(policy, { ...input, resolvedAt: '2026-09-18T05:00:00Z' }, '2026-09-19T00:00:00Z').events.map(e => e.kind)).toEqual(['created', 'escalated', 'resolved']);
  const initial = evaluateSla(policy, { ...input, priority: 'low' }, '2026-09-18T01:00:00Z');
  expect(evaluateSla(policy, input, '2026-09-18T04:00:00Z', initial).events.map(e => e.kind)).toEqual(['created', 'updated', 'escalated']);
  expect(() => evaluateSla(policy, input, '2026-09-17T00:00:00Z')).toThrow('clock');
  expect(() => evaluateSla({ ...policy, hours: { ...policy.hours, high: 5 } }, input, '2026-09-18T02:00:00Z', initial)).toThrow('migration');
});
