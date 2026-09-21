import { z } from 'zod';
import { evaluateSla, slaStateSchema, type SlaPolicy, type SlaState } from './rules.js';
import { parseTimeline } from '../timeline/model.js';
import { hashJson } from '../core/json.js';
const digest = (value: unknown) => hashJson(z.json().parse(value));
import type { DataverseHttp } from '../dataverse/http.js';
export interface SlaBinding { table: string; recordId: string; createdField: string; priorityField: string; stateField: string; priorityValues: Record<'low' | 'normal' | 'high', number> }
function validBinding(binding: SlaBinding) {
  z.guid().parse(binding.recordId);
  for (const name of [binding.table, binding.priorityField, binding.stateField]) if (!/^pfx_experiment[a-z0-9_]+$/.test(name)) throw new Error('SLA target must be an isolated PowerCanvas experiment resource.');
  if (binding.createdField !== 'createdon') throw new Error('Use the platform creation clock.');
  if (new Set(Object.values(binding.priorityValues)).size !== 3) throw new Error('Priority values must be unique.');
}
export async function planSla(http: DataverseHttp, binding: SlaBinding, policy: SlaPolicy, now: string) {
  validBinding(binding);
  const row = (await http.request(`${binding.table}(${binding.recordId})?$select=${binding.createdField},${binding.priorityField},${binding.stateField}`)).data as Record<string, unknown>;
  const priority = (Object.entries(binding.priorityValues).find(([, v]) => v === row[binding.priorityField])?.[0]) as 'low' | 'normal' | 'high' | undefined;
  if (!priority) throw new Error('Unknown remote priority; no SLA changes planned.');
  const old = row[binding.stateField];
  const parsed = old ? slaStateSchema.parse(JSON.parse(z.string().max(100000).parse(old))) : undefined;
  const previous: SlaState | undefined = parsed ? { ...parsed, events: parseTimeline(JSON.stringify(parsed.events)) } : undefined;
  // Preserve chronological storage; the PCF sorts its display independently.
  if (previous) previous.events.reverse();
  const state = evaluateSla(policy, { id: binding.recordId, createdAt: z.string().parse(row[binding.createdField]), priority, resolvedAt: previous?.resolvedAt ?? null }, now, previous);
  const noOp = Boolean(previous && digest({ ...previous, events: [...previous.events].sort((a,b) => a.id.localeCompare(b.id)) }) === digest({ ...state, events: [...state.events].sort((a,b) => a.id.localeCompare(b.id)) }));
  return { binding, policyHash: digest(policy), observedHash: digest(row), etag: z.string().regex(/^W\/"\d+"$/).parse(row['@odata.etag']), evaluatedAt: now, state, noOp };
}
export async function applySla(http: DataverseHttp, plan: Awaited<ReturnType<typeof planSla>>, policy: SlaPolicy) {
  if (Date.now() - Date.parse(plan.evaluatedAt) > 300000 || Date.parse(plan.evaluatedAt) > Date.now() + 60000) throw new Error('SLA plan is stale.');
  const fresh = await planSla(http, plan.binding, policy, plan.evaluatedAt);
  if (digest(fresh) !== digest(plan)) throw new Error('SLA record or plan changed; replan without writing.');
  if (plan.noOp) return { remoteWrites: 0, verified: true };
  const serialized = JSON.stringify(plan.state); if (serialized.length > 100000) throw new Error('SLA state exceeds its column capacity.');
  await http.request(`${plan.binding.table}(${plan.binding.recordId})`, 'PATCH', { [plan.binding.stateField]: serialized }, { 'If-Match': plan.etag });
  const row = (await http.request(`${plan.binding.table}(${plan.binding.recordId})?$select=${plan.binding.stateField}`)).data as Record<string, unknown>;
  if (row[plan.binding.stateField] !== serialized) throw new Error('SLA write requires inspection; do not retry blindly.');
  return { remoteWrites: 1, verified: true };
}
