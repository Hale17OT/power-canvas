import { randomUUID } from 'node:crypto';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashJson } from '../src/core/json.js';
import { LocalStateStore } from '../src/state/local.js';
import type { StateWriter } from '../src/state/local.js';
import { planSchema, targetSchema } from '../src/state/models.js';
import type { JournalEvent, Observation, Ownership, Plan, PlannedOperation, Target } from '../src/state/models.js';
import { clean, temporary } from './helpers.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(clean)); });
const projectId = '81b7a3f7-6a48-4be1-9e23-71eab2a5a152';
const target: Target = { tenantId: 'ebaf65c1-ff98-47d4-a82c-8f90f907bd5a', environmentId: 'dd5845b7-ea22-415a-91c3-a656783532f6',
  organizationId: 'ef8b44b6-7507-40ea-b4f9-de6c6b780b6f', dataverseUrl: 'https://synthetic.crm.dynamics.com' };
const ownership = (): Ownership => ({ schemaVersion: 1, projectId, target, revision: 0, updatedAt: '2026-09-17T00:00:00.000Z', resources: [] });
const event = (): JournalEvent => ({ schemaVersion: 1, projectId, target, eventId: randomUUID(), executionId: randomUUID(), planId: randomUUID(),
  operationId: 'create-complaint', timestamp: '2026-09-17T00:00:00.000Z', provider: 'dataverse', resourceId: `pf:${projectId}:dataverse:table:complaint`, status: 'started' });
const plan = (): Plan => {
  const body = { schemaVersion: 1 as const, projectId, target, planId: randomUUID(), createdAt: '2026-09-17T00:00:00.000Z', expiresAt: '2026-09-17T01:00:00.000Z',
    powercanvasVersion: '0.1.0-dev.1', providerVersions: { dataverse: 'test-only' }, sourceHash: 'a'.repeat(64), observationHash: 'b'.repeat(64), ownershipRevision: 0, operations: [], blockers: [] };
  return { ...body, contentHash: hashJson(body) };
};
async function store(): Promise<LocalStateStore> { const dir = await temporary(); dirs.push(dir); return new LocalStateStore(dir, projectId, target); }

describe('local state boundary', () => {
  it('atomically persists only matching state with sequential revisions', async () => {
    const state = await store();
    expect(await state.readOwnership()).toBeUndefined();
    await state.withLock(writer => writer.saveOwnership(ownership()));
    expect(await state.readOwnership()).toEqual(ownership());
    await expect(state.withLock(writer => writer.saveOwnership(ownership()))).rejects.toThrow('revision');
    await state.withLock(writer => writer.saveOwnership({ ...ownership(), revision: 1 }));
    expect((await state.readOwnership())?.revision).toBe(1);
    await expect(state.withLock(writer => writer.saveOwnership({ ...ownership(), target: { ...target, tenantId: randomUUID() } }))).rejects.toThrow('another project or target');
    expect((await state.readOwnership())?.revision).toBe(1);
  });
  it('isolates targets and projects and rejects noncanonical service origins', async () => {
    const dir = await temporary(); dirs.push(dir);
    const a = new LocalStateStore(dir, projectId, target);
    const b = new LocalStateStore(dir, projectId, { ...target, tenantId: randomUUID() });
    const c = new LocalStateStore(dir, randomUUID(), target);
    expect(new Set([a.root, b.root, c.root]).size).toBe(3);
    for (const url of ['http://synthetic.crm.dynamics.com', 'https://evil.test', 'https://user:pass@synthetic.crm.dynamics.com', 'https://synthetic.crm.dynamics.com/path']) {
      expect(targetSchema.safeParse({ ...target, dataverseUrl: url }).success).toBe(false);
    }
  });
  it('serializes competing writes within one lease without losing a revision', async () => {
    const state = await store();
    await state.withLock(async writer => {
      await Promise.all([writer.saveOwnership(ownership()), writer.saveOwnership({ ...ownership(), revision: 1 })]);
    });
    expect((await state.readOwnership())?.revision).toBe(1);
  });
  it('does not ignore a write failure caught by the caller or continue later writes', async () => {
    const state = await store();
    await expect(state.withLock(async writer => {
      await writer.saveOwnership({ ...ownership(), revision: 4 }).catch(() => undefined);
      await writer.saveOwnership(ownership()).catch(() => undefined);
    })).rejects.toThrow('revision');
    expect(await state.readOwnership()).toBeUndefined();
  });
  it('rejects competing locks and releases on failure; an expired writer cannot mutate', async () => {
    const state = await store();
    let lease: StateWriter | undefined;
    await expect(state.withLock(async writer => {
      lease = writer;
      await expect(state.withLock(async () => undefined)).rejects.toThrow('writer lock');
      throw new Error('simulated failure');
    })).rejects.toThrow('simulated failure');
    await expect(lease!.saveOwnership(ownership())).rejects.toThrow('lease has ended');
    await state.withLock(writer => writer.saveOwnership(ownership()));
  });
  it('fails closed on corrupt state and retains the corrupt file', async () => {
    const state = await store();
    await state.withLock(writer => writer.saveOwnership(ownership()));
    const path = join(state.root, 'ownership.json');
    await writeFile(path, '{truncated');
    await expect(state.readOwnership()).rejects.toThrow('corrupt');
    await expect(state.withLock(writer => writer.saveOwnership(ownership()))).rejects.toThrow('corrupt');
    expect(await readFile(path, 'utf8')).toBe('{truncated');
  });
  it('rejects credential-shaped state, including nested managed property keys', async () => {
    const state = await store();
    const resource = { resourceId: 'complaint', remoteId: randomUUID(), provider: 'dataverse', ownedPaths: ['displayName'], baseline: { access_token: 'secret' }, lastVerifiedHash: 'c'.repeat(64) };
    await expect(state.withLock(writer => writer.saveOwnership({ ...ownership(), resources: [resource] }))).rejects.toThrow('Credential');
    await expect(state.withLock(writer => writer.saveOwnership({ ...ownership(), resources: [{ ...resource, baseline: { displayName: 'Bearer do-not-store' } }] }))).rejects.toThrow('Sensitive');
  });
  it('refuses a linked state directory', async () => {
    const dir = await temporary(); dirs.push(dir);
    const destination = join(dir, 'redirect'); await mkdir(destination);
    await symlink(destination, join(dir, '.powercanvas'), process.platform === 'win32' ? 'junction' : 'dir');
    const state = new LocalStateStore(dir, projectId, target);
    await expect(state.withLock(async () => undefined)).rejects.toThrow('links');
  });
});

describe('journal and plan records', () => {
  it('persists observed coverage separately and rejects duplicate identities', async () => {
    const state = await store();
    const observed: Observation = { schemaVersion: 1, projectId, target, snapshotId: randomUUID(), observedAt: '2026-09-17T00:00:00.000Z',
      providerVersions: { dataverse: 'fixture-only' }, coverage: [{ kind: 'table', status: 'partial' }], resources: [] };
    await state.withLock(writer => writer.saveObservation(observed));
    expect(await state.readObservation(observed.snapshotId)).toEqual(observed);
    expect(await state.readOwnership()).toBeUndefined();
    await expect(state.withLock(writer => writer.saveObservation({ ...observed, coverage: [...observed.coverage, ...observed.coverage] }))).rejects.toThrow('invalid');
  });
  it('persists partial execution evidence and refuses duplicate/truncated events', async () => {
    const state = await store(); const start = event();
    const failed = { ...start, eventId: randomUUID(), status: 'outcomeUnknown' as const, errorCode: 'PF-DV-001' };
    await state.withLock(async writer => { await writer.appendJournal(start); await writer.appendJournal(failed); });
    expect(await state.readJournal(start.executionId)).toEqual([start, failed]);
    await expect(state.withLock(writer => writer.appendJournal(start))).rejects.toThrow('unique');
    const path = join(state.root, `journal-${start.executionId}.jsonl`);
    await writeFile(path, `${JSON.stringify(start)}\n{"truncated":`);
    await expect(state.readJournal(start.executionId)).rejects.toThrow('incomplete');
    await expect(state.withLock(writer => writer.appendJournal(failed))).rejects.toThrow('incomplete');
  });
  it('checks target-bound plan hashes and expiration ordering', async () => {
    const state = await store(); const proposed = plan();
    await state.withLock(writer => writer.savePlan(proposed));
    expect(await state.readPlan(proposed.planId)).toEqual(proposed);
    await expect(state.withLock(writer => writer.savePlan({ ...proposed, sourceHash: 'f'.repeat(64) }))).rejects.toThrow('hash');
    expect(planSchema.safeParse({ ...proposed, expiresAt: proposed.createdAt }).success).toBe(false);
  });
  it('rejects missing, cyclic and duplicate operation dependencies', () => {
    const operation: PlannedOperation = { id: 'a', provider: 'dataverse', resourceId: 'complaint', action: 'createTable', dependsOn: [],
      capability: 'dataverse.schema', risk: 'additive', support: 'supported', requiredIdentity: { audience: 'dataverse', privileges: [] },
      before: null, after: { schemaName: 'pf_Complaint' }, preconditions: [{ property: 'exists', expected: false }], postconditions: [{ property: 'exists', expected: true }] };
    expect(planSchema.safeParse({ ...plan(), operations: [operation] }).success).toBe(true);
    expect(planSchema.safeParse({ ...plan(), operations: [operation, operation] }).success).toBe(false);
    expect(planSchema.safeParse({ ...plan(), operations: [{ ...operation, dependsOn: ['missing'] }] }).success).toBe(false);
    expect(planSchema.safeParse({ ...plan(), operations: [{ ...operation, dependsOn: ['b'] }, { ...operation, id: 'b', dependsOn: ['a'] }] }).success).toBe(false);
  });
});
