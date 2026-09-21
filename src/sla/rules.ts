import { z } from 'zod';
import { hashJson } from '../core/json.js';
import type { TimelineEvent } from '../timeline/model.js';
export const slaPolicySchema = z.strictObject({ apiVersion: z.literal('powercanvas.sla/v1alpha1'), name: z.string().regex(/^pfx_[A-Za-z0-9]+$/), version: z.literal(1), clock: z.literal('elapsedUtcHours'), hours: z.strictObject({ low: z.number().positive().max(8760), normal: z.number().positive().max(8760), high: z.number().positive().max(8760) }) });
export type SlaPolicy = z.infer<typeof slaPolicySchema>;
export const slaStateSchema = z.strictObject({ policyHash: z.string().length(64), dueAt: z.iso.datetime(), escalatedAt: z.iso.datetime().nullable(), resolvedAt: z.iso.datetime().nullable(), events: z.array(z.unknown()).max(200) });
export interface SlaInput { id: string; createdAt: string; priority: 'low' | 'normal' | 'high'; resolvedAt?: string | null }
export interface SlaState { policyHash: string; dueAt: string; escalatedAt: string | null; resolvedAt: string | null; events: TimelineEvent[] }
/** An explicit as-of clock makes boundary behavior reproducible. No calendar/business-hours claims. */
export function evaluateSla(policy: SlaPolicy, input: SlaInput, now: string, previous?: SlaState): SlaState {
  slaPolicySchema.parse(policy); z.iso.datetime().parse(input.createdAt); z.iso.datetime().parse(now); z.guid().parse(input.id);
  if (!['low', 'normal', 'high'].includes(input.priority)) throw new Error('Unknown SLA priority');
  if (input.resolvedAt) z.iso.datetime().parse(input.resolvedAt);
  const created = Date.parse(input.createdAt), asOf = Date.parse(now);
  if (asOf < created || (input.resolvedAt && (Date.parse(input.resolvedAt) < created || Date.parse(input.resolvedAt) > asOf))) throw new Error('Invalid SLA clock or resolution timestamp.');
  const policyHash = hashJson(policy);
  if (previous && previous.policyHash !== policyHash) throw new Error('Policy migration must be explicit.');
  if (previous?.resolvedAt && previous.resolvedAt !== input.resolvedAt) throw new Error('Reopening requires an explicit new SLA cycle.');
  const dueAt = new Date(created + policy.hours[input.priority] * 3600000).toISOString();
  const events = [...(previous?.events ?? [])];
  const add = (kind: TimelineEvent['kind'], title: string, description: string, suffix: string) => { const id = `${input.id}:${suffix}`; if (!events.some(e => e.id === id)) events.push({ id, timestamp: now, actor: 'PowerCanvas SLA worker', kind, title, description }); };
  if (!previous) add('created', 'SLA started', `Due ${dueAt}; ${input.priority} priority; elapsed UTC hours.`, 'sla-start');
  if (previous && previous.dueAt !== dueAt) { if (previous.escalatedAt) throw new Error('Escalated SLA deadlines cannot be silently reset.'); add('updated', 'SLA deadline changed', `Before: ${previous.dueAt}; after: ${dueAt}`, `due-${dueAt}`); }
  const resolution = input.resolvedAt ?? null;
  // Resolution before the deadline suppresses escalation even when the worker runs late.
  const breached = asOf >= Date.parse(dueAt) && (!resolution || Date.parse(resolution) >= Date.parse(dueAt));
  const escalatedAt = previous?.escalatedAt ?? (breached ? now : null);
  if (breached && !previous?.escalatedAt) add('escalated', 'Complaint escalated', `SLA deadline ${dueAt} reached. No notification was sent.`, 'sla-escalated');
  if (resolution && !previous?.resolvedAt) add('resolved', 'Complaint resolved', `Resolved ${resolution}.`, 'sla-resolved');
  if (events.length > 200) throw new Error('Timeline capacity reached; archive explicitly before applying.');
  return { policyHash, dueAt, escalatedAt, resolvedAt: resolution, events };
}
