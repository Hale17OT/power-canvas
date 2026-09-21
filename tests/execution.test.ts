import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { applyPlan } from '../src/execution/apply.js';
import type { ExecutionAdapter } from '../src/execution/apply.js';
import { LocalStateStore } from '../src/state/local.js';
import { createPlan, publicationHash } from '../src/planner/dataverse.js';
import { desiredResources } from '../src/dataverse/desired.js';
import { ApiError } from '../src/dataverse/http.js';
import { recoverCreate } from '../src/execution/recover.js';
import type { PlannedOperation } from '../src/state/models.js';
import { clean, fixture, temporary } from './helpers.js';
import { emptyObservation, matchingState, target } from './planner-fixtures.js';
import { modelResources, MODEL_KINDS, MODEL_VERSION } from '../src/model-driven/desired.js';
import { executionPolicy } from '../src/dataverse/isolation.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(clean)); });
async function harness() {
  const directory = await temporary(); dirs.push(directory);
  const project = fixture(); const store = new LocalStateStore(directory, project.project.id, target);
  const state = { observed: emptyObservation(project), writes: 0, failAt: 0, propagate: true, identities: 0 };
  let active: PlannedOperation;
  const adapter: ExecutionAdapter = {
    verifyTarget: async () => { state.identities++; },
    observe: async () => structuredClone(state.observed),
    apply: async (operation, _observed, mutate) => { active = operation; await mutate(operation.action === 'publish' ? 'publish' : 'create', 'synthetic', 'POST', {}); },
    membership: async () => undefined,
    request: async () => {
      state.writes++;
      if (state.writes === state.failAt) throw new ApiError(0, randomUUID(), true);
      if (state.propagate && active.action !== 'publish') {
        const desired = desiredResources(project).find(item => item.resourceId === active.resourceId)!;
        state.observed.resources = state.observed.resources.filter(item => item.resourceId !== active.resourceId);
        state.observed.resources.push({ resourceId: active.resourceId, remoteId: randomUUID(), kind: desired.kind, schemaName: desired.schemaName,
          provider: 'dataverse', properties: { ...active.after!, isManaged: false, customizable: true } });
      }
      return { requestId: randomUUID() };
    },
  };
  const apply = () => applyPlan(project, createPlan(project, state.observed, undefined, 'dataverse'), store, adapter, async () => undefined);
  return { project, store, state, adapter, apply };
}

it('synthetic executor verifies each creation, records terminal mutation evidence, then applies a zero-write no-op and additive column', async () => {
  const h = await harness();
  const result = await h.apply();
  expect(result.ok).toBe(true);
  const owned = await h.store.readOwnership();
  expect(owned?.resources).toHaveLength(desiredResources(h.project).length);
  const journal = await h.store.readJournal(result.executionId);
  for (const operationId of new Set(journal.map(item => item.operationId))) {
    expect(journal.filter(item => item.operationId === operationId).map(item => item.status)).toEqual(['started', 'remoteSucceeded', 'verified']);
  }
  expect(journal.filter(item => item.operationId.includes('/') && item.status === 'remoteSucceeded').every(item => item.requestId)).toBe(true);
  const noOp = createPlan(h.project, h.state.observed, owned, 'dataverse');
  expect(noOp.operations).toEqual([]); expect(noOp.blockers).toEqual([]);
  const writes = h.state.writes;
  expect((await applyPlan(h.project, noOp, h.store, h.adapter)).ok).toBe(true);
  expect(h.state.writes).toBe(writes);
  h.project.dataverse.tables.complaint!.columns.resolution = { schemaName: 'pf_ResolutionNotes', displayName: 'Resolution Notes', type: 'multilineText', maxLength: 4000, required: 'none', lifecycle: { deletionPolicy: 'retain' } };
  const additive = createPlan(h.project, h.state.observed, owned, 'dataverse');
  expect(additive.operations.map(item => item.action)).toEqual(['createColumn', 'publish']);
  expect((await applyPlan(h.project, additive, h.store, h.adapter, async () => undefined)).ok).toBe(true);
  expect(createPlan(h.project, h.state.observed, await h.store.readOwnership(), 'dataverse').operations).toEqual([]);
});

it('does not claim ownership when a success response has no observable postcondition', async () => {
  const h = await harness(); h.state.propagate = false;
  const result = await h.apply();
  expect(result.ok).toBe(false); expect(result.error?.code).toBe('PF-DV-007');
  expect(result.completed).toEqual([]); expect(h.state.writes).toBe(1);
  expect(await h.store.readOwnership()).toBeUndefined();
  expect((await h.store.readJournal(result.executionId)).at(-1)).toMatchObject({ status: 'failed', verificationResult: 'failed' });
});

it('does not claim a same-name resource whose identity differs from the create receipt', async () => {
  const h = await harness(); const request = h.adapter.request;
  h.adapter.request = async (...args) => ({ ...await request(...args), remoteId: randomUUID() });
  const result = await h.apply();
  expect(result.ok).toBe(false); expect(result.error?.code).toBe('PF-DV-007');
  expect(h.state.writes).toBe(1); expect(await h.store.readOwnership()).toBeUndefined();
  expect((await h.store.readJournal(result.executionId)).find(item => item.status === 'remoteSucceeded')?.remoteId).toBeDefined();
});

it('retains only verified ownership after an uncertain partial write and never retries it', async () => {
  const h = await harness(); h.state.failAt = 3;
  const result = await h.apply();
  expect(result.ok).toBe(false); expect(result.completed).toHaveLength(2); expect(h.state.writes).toBe(3);
  expect((await h.store.readOwnership())?.resources).toHaveLength(2);
  expect((await h.store.readJournal(result.executionId)).at(-1)?.status).toBe('outcomeUnknown');
});

it('rejects stale observations and target failures before any mutation', async () => {
  const h = await harness(); const plan = createPlan(h.project, h.state.observed, undefined, 'dataverse');
  h.state.observed.coverage[0]!.status = 'partial';
  await expect(applyPlan(h.project, plan, h.store, h.adapter)).rejects.toMatchObject({ code: 'PF-PLAN-008' });
  expect(h.state.writes).toBe(0);
  h.adapter.verifyTarget = async () => { throw new Error('Identity mismatch'); };
  await expect(h.apply()).rejects.toThrow('Identity mismatch'); expect(h.state.writes).toBe(0);
});

it('blocks a choice-to-text change in the planner and executor before any remote mutation', async () => {
  const h = await harness(); const existing = matchingState(h.project); h.state.observed = existing.observation;
  await h.store.withLock(writer => writer.saveOwnership(existing.ownership));
  h.project.dataverse.tables.complaint!.columns.priority = { schemaName: 'pf_Priority', displayName: 'Priority', type: 'text', maxLength: 100, required: 'none', lifecycle: { deletionPolicy: 'retain' } };
  const plan = createPlan(h.project, h.state.observed, existing.ownership, 'dataverse');
  expect(plan.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PF-SAFETY-001', classification: 'destructiveBlock' })]));
  await expect(applyPlan(h.project, plan, h.store, h.adapter)).rejects.toMatchObject({ code: 'PF-SAFETY-004' });
  expect(h.state.writes).toBe(0);
  expect(h.state.observed.resources.find(item => item.schemaName === 'pf_Priority')?.properties.type).toBe('choice');
});

it('recovers only an explicitly confirmed timed-out creation with the original journal, exact GUID and full postcondition', async () => {
  const h = await harness(); h.state.failAt = 3;
  const plan = createPlan(h.project, h.state.observed, undefined, 'dataverse');
  const result = await applyPlan(h.project, plan, h.store, h.adapter, async () => undefined);
  const operation = plan.operations.find(item => item.id === result.failedOperation)!;
  const resource = matchingState(h.project).observation.resources.find(item => item.resourceId === operation.resourceId)!;
  h.state.observed.resources.push(resource);
  const request = { executionId: result.executionId, operationId: operation.id, remoteId: resource.remoteId, confirmedCreatedByThisRun: true };
  await expect(recoverCreate(h.project, plan, h.store, h.adapter, { ...request, confirmedCreatedByThisRun: false })).rejects.toMatchObject({ code: 'PF-SAFETY-006' });
  await expect(recoverCreate(h.project, plan, h.store, h.adapter, { ...request, remoteId: randomUUID() })).rejects.toMatchObject({ code: 'PF-SAFETY-006' });
  resource.properties.solutionMember = false;
  await expect(recoverCreate(h.project, plan, h.store, h.adapter, request)).rejects.toMatchObject({ code: 'PF-SAFETY-006' });
  resource.properties.solutionMember = true;
  const writes = h.state.writes;
  const recovered = await recoverCreate(h.project, plan, h.store, h.adapter, request);
  expect(recovered.remoteMutations).toBe(0); expect(h.state.writes).toBe(writes);
  expect((await h.store.readOwnership())?.resources).toHaveLength(3);
  expect((await h.store.readJournal(result.executionId)).at(-1)?.status).toBe('outcomeUnknown');
  expect((await h.store.readJournal(recovered.executionId)).at(-1)).toMatchObject({ status: 'verified', recoveryOfExecutionId: result.executionId });
  await expect(recoverCreate(h.project, plan, h.store, h.adapter, request)).rejects.toMatchObject({ code: 'PF-SAFETY-006' });
});

it('does not recover a colliding resource from a plan without the matching create journal', async () => {
  const h = await harness(); const plan = createPlan(h.project, h.state.observed, undefined, 'dataverse');
  const operation = plan.operations.find(item => item.action === 'createTable')!;
  h.state.observed = matchingState(h.project).observation;
  await expect(recoverCreate(h.project, plan, h.store, h.adapter, { executionId: randomUUID(), operationId: operation.id,
    remoteId: h.state.observed.resources.find(item => item.resourceId === operation.resourceId)!.remoteId, confirmedCreatedByThisRun: true })).rejects.toMatchObject({ code: 'PF-SAFETY-006' });
  expect(h.state.writes).toBe(0); expect(await h.store.readOwnership()).toBeUndefined();
});

it('can reverify a service-acknowledged create after delayed postconditions without reissuing any write', async () => {
  const h = await harness(); h.state.propagate = false;
  const original = matchingState(h.project);
  const publisherAndSolution = original.ownership.resources.slice(0, 2);
  await h.store.withLock(writer => writer.saveOwnership({ ...original.ownership, resources: publisherAndSolution }));
  h.state.observed.resources = original.observation.resources.slice(0, 2);
  const plan = createPlan(h.project, h.state.observed, await h.store.readOwnership(), 'dataverse');
  const result = await applyPlan(h.project, plan, h.store, h.adapter, async () => undefined);
  const operation = plan.operations.find(item => item.id === result.failedOperation)!;
  const resource = original.observation.resources.find(item => item.resourceId === operation.resourceId)!;
  h.state.observed.resources.push(resource);
  expect((await recoverCreate(h.project, plan, h.store, h.adapter, { executionId: result.executionId,
    operationId: operation.id, remoteId: resource.remoteId, confirmedCreatedByThisRun: false })).remoteMutations).toBe(0);
  expect(h.state.writes).toBe(1);
});

it('recovers acknowledged role grants only on the already owned role with an exact postcondition', async () => {
  const directory = await temporary(); dirs.push(directory);
  const project = fixture(); const store = new LocalStateStore(directory, project.project.id, target);
  const { observation, ownership } = matchingState(project);
  observation.providerVersions['model-driven'] = MODEL_VERSION;
  observation.coverage.push(...MODEL_KINDS.map(kind => ({ kind, status: 'complete' as const })));
  ownership.experiment1Evidence = { schemaHash: publicationHash(project), firstNoOpHash: 'a'.repeat(64), secondNoOpHash: 'b'.repeat(64), destructiveCheckHash: 'c'.repeat(64), completedAt: new Date().toISOString() };
  await store.withLock(writer => writer.saveOwnership(ownership));
  let writes = 0; let active: PlannedOperation; const roleId = randomUUID();
  const adapter: ExecutionAdapter = {
    verifyTarget: async () => undefined, observe: async () => structuredClone(observation), membership: async () => undefined,
    apply: async (operation, _observed, mutate) => { active = operation; await mutate(operation.action === 'grantRolePrivileges' ? 'grant' : 'create', 'synthetic', 'POST', {}); },
    request: async () => {
      writes++; const spec = modelResources(project).find(item => item.resourceId === active.resourceId)!;
      observation.resources.push({ resourceId: spec.resourceId, provider: 'model-driven', remoteId: roleId, kind: spec.kind, schemaName: spec.schemaName,
        properties: { ...spec.properties, ...(spec.kind === 'rolePermissions' ? { grants: [] } : {}), isManaged: false, customizable: true } });
      return { requestId: randomUUID(), ...(spec.kind === 'role' ? { remoteId: roleId } : {}) };
    },
  };
  const policy = executionPolicy(5, false, true);
  const plan = createPlan(project, observation, ownership, 'all', new Date(), policy);
  const result = await applyPlan(project, plan, store, adapter, async () => undefined);
  expect(result.completed).toHaveLength(1); expect(result.error?.code).toBe('PF-DV-007');
  const request = { executionId: result.executionId, operationId: result.failedOperation!, remoteId: roleId, confirmedCreatedByThisRun: false };
  await expect(recoverCreate(project, plan, store, adapter, request)).rejects.toMatchObject({ code: 'PF-SAFETY-006' });
  observation.resources.find(item => item.kind === 'rolePermissions')!.properties.grants = modelResources(project).find(item => item.kind === 'rolePermissions')!.properties.grants!;
  await expect(recoverCreate(project, plan, store, adapter, { ...request, remoteId: randomUUID() })).rejects.toMatchObject({ code: 'PF-SAFETY-006' });
  expect((await recoverCreate(project, plan, store, adapter, request)).remoteMutations).toBe(0);
  expect(writes).toBe(2);
});

