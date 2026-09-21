import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPlan, fingerprint, validateSavedPlan } from '../src/planner/dataverse.js';
import { fixture } from './helpers.js';
import { emptyObservation, matchingState } from './planner-fixtures.js';
import { hashJson } from '../src/core/json.js';
import { executionPolicy, experimentIsolation } from '../src/dataverse/isolation.js';

it('orders dependencies, embeds primary names once and requires explicit schema-only scope', () => {
  const project = fixture(); const empty = emptyObservation(project);
  expect(createPlan(project, empty, undefined).blockers[0]?.code).toBe('PF-CAPABILITY-001');
  const plan = createPlan(project, empty, undefined, 'dataverse');
  expect(plan.blockers).toEqual([]);
  expect(plan.operations.filter(item => item.action === 'createTable')).toHaveLength(2);
  expect(plan.operations.filter(item => item.action === 'createColumn')).toHaveLength(2);
  expect(plan.operations.at(-1)?.action).toBe('publish');
  const completed = new Set<string>();
  for (const operation of plan.operations) { expect(operation.dependsOn.every(id => completed.has(id))).toBe(true); completed.add(operation.id); }
});
it('produces a semantic no-op independent of snapshot time, IDs of snapshots and resource order', () => {
  const project = fixture(); const { observation, ownership } = matchingState(project);
  const hash = fingerprint(observation);
  observation.snapshotId = randomUUID(); observation.observedAt = '2026-01-01T00:00:00.000Z'; observation.resources.reverse();
  expect(fingerprint(observation)).toBe(hash);
  const plan = createPlan(project, observation, ownership, 'dataverse');
  expect(plan.operations).toEqual([]); expect(plan.blockers).toEqual([]);
});
it('plans one new multiline column plus publication and a bounded safe label update', () => {
  const project = fixture(); const { observation, ownership } = matchingState(project);
  project.dataverse.tables.complaint!.columns.resolutionNotes = { schemaName: 'pf_ResolutionNotes', displayName: 'Resolution Notes', type: 'multilineText', maxLength: 4000, required: 'none', lifecycle: { deletionPolicy: 'retain' } };
  const plan = createPlan(project, observation, ownership, 'dataverse');
  expect(plan.operations.map(item => item.action)).toEqual(['createColumn', 'publish']);
  const original = fixture(); const state = matchingState(original); original.dataverse.tables.complaint!.displayName = 'Complaints Inbox';
  expect(createPlan(original, state.observation, state.ownership, 'dataverse').operations[0]?.classification).toBe('safeUpdate');
});
it('blocks deletion, type changes, renaming, ownership changes, collisions and drift', () => {
  for (const change of ['delete', 'type', 'rename', 'ownership', 'drift', 'identity', 'managed']) {
    const project = fixture(); const state = matchingState(project);
    const complaint = project.dataverse.tables.complaint!;
    if (change === 'delete') delete complaint.columns.description;
    if (change === 'type') complaint.columns.priority = { schemaName: 'pf_Priority', displayName: 'Priority', type: 'text', maxLength: 100, required: 'none', lifecycle: { deletionPolicy: 'retain' } };
    if (change === 'rename') complaint.schemaName = 'pf_Renamed';
    if (change === 'ownership') complaint.ownership = 'organization';
    if (change === 'drift') state.observation.resources.find(item => item.kind === 'table')!.properties.displayName = 'Manual edit';
    if (change === 'identity') state.observation.resources[0]!.remoteId = randomUUID();
    if (change === 'managed') state.observation.resources[0]!.properties.isManaged = true;
    expect(createPlan(project, state.observation, state.ownership, 'dataverse').blockers.length, change).toBeGreaterThan(0);
  }
  const project = fixture(); const state = matchingState(project);
  expect(createPlan(project, state.observation, undefined, 'dataverse').blockers.some(item => item.code === 'PF-PLAN-005')).toBe(true);
});
it('never calls missing or incomplete observation a no-op', () => {
  const project = fixture(); const state = matchingState(project);
  state.observation.coverage[0]!.status = 'partial';
  expect(createPlan(project, state.observation, state.ownership, 'dataverse').blockers.some(item => item.code === 'PF-PLAN-003')).toBe(true);
  state.observation.resources = [];
  expect(createPlan(project, state.observation, state.ownership, 'dataverse').blockers.some(item => item.code === 'PF-PLAN-004')).toBe(true);
});
it('rejects source/target drift, expiry and a malicious plan even after its hash is recomputed', () => {
  const project = fixture(); const observed = emptyObservation(project); const plan = createPlan(project, observed, undefined, 'dataverse');
  expect(() => validateSavedPlan(plan, project, observed)).not.toThrow();
  expect(() => validateSavedPlan(plan, project, { ...observed, target: { ...observed.target, tenantId: randomUUID() } })).toThrow('stale');
  expect(() => validateSavedPlan(plan, project, observed, undefined, new Date(Date.parse(plan.expiresAt) + 1))).toThrow('stale');
  const tampered = structuredClone(plan); tampered.operations[0]!.after = { bad: 'payload' };
  const { contentHash: _hash, ...body } = tampered; void _hash; tampered.contentHash = hashJson(body);
  expect(() => validateSavedPlan(tampered, project, observed)).toThrow('deterministic');
});
it('requires publication evidence even if all schema resources were already verified', () => {
  const project = fixture(); const { observation, ownership } = matchingState(project);
  delete ownership.publicationHash;
  expect(createPlan(project, observation, ownership, 'dataverse').operations.map(item => item.action)).toEqual(['publish']);
});
it('blocks Default use without the dedicated namespace and additive-only policy', () => {
  const project = fixture();
  expect(() => experimentIsolation(project)).toThrow('isolation');
  const plan = createPlan(project, emptyObservation(project), undefined, 'dataverse', new Date(), executionPolicy(12, false));
  expect(plan.executionPolicy).toMatchObject({ environmentType: 'Default', nonDisposable: true });
  expect(plan.blockers.some(item => item.code === 'PF-SAFETY-005')).toBe(true);
});
