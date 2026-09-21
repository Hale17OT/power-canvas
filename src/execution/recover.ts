import { randomUUID } from 'node:crypto';
import type { Project } from '../ir/schema.js';
import type { Plan, Ownership, JournalEvent } from '../state/models.js';
import { LocalStateStore } from '../state/local.js';
import { PowerCanvasError } from '../core/errors.js';
import { hashJson } from '../core/json.js';
import { createPlan, fingerprint } from '../planner/dataverse.js';
import { verifyPostcondition } from './apply.js';
import type { ExecutionAdapter } from './apply.js';
import { guidValue } from '../dataverse/normalize.js';

/** Explicit, read-only recovery of one confirmed creation. This is not general resource adoption. */
export async function recoverCreate(project: Project, plan: Plan, store: LocalStateStore,
  adapter: Pick<ExecutionAdapter, 'verifyTarget' | 'observe'>,
  request: { executionId: string; operationId: string; remoteId: string; confirmedCreatedByThisRun: boolean }) {
  const fail = () => new PowerCanvasError('PF-SAFETY-006', 'Interrupted creation cannot be reconciled from the supplied evidence.', 'Keep writes stopped. Verify the original plan, journal, exact resource ID, creation provenance and complete postcondition; never adopt a pre-existing resource.');
  const { contentHash, ...body } = plan;
  if (contentHash !== hashJson(body) || plan.sourceHash !== hashJson(project) ||
      plan.projectId !== project.project.id || store.projectId !== project.project.id || hashJson(plan.target) !== hashJson(store.target) || plan.blockers.length) throw fail();
  const operation = plan.operations.find(item => item.id === request.operationId);
  if (!operation || !['createTable', 'createColumn', 'createRelationship', 'createForm', 'createView', 'createSitemap', 'createRole', 'createApp', 'grantRolePrivileges'].includes(operation.action) || operation.before !== null || !operation.after) throw fail();
  const desired = operation.after;
  const grantsOnly = operation.action === 'grantRolePrivileges';
  await adapter.verifyTarget();
  return store.withLock(async writer => {
    await adapter.verifyTarget();
    const journal = await store.readJournal(request.executionId);
    const prior = journal.filter(item => item.planId === plan.planId && item.operationId === operation.id && item.resourceId === operation.resourceId);
    const mutation = journal.filter(item => item.planId === plan.planId && item.operationId === `${operation.id}/${grantsOnly ? 'grant' : 'create'}` && item.resourceId === operation.resourceId);
    const unknownCreate = prior.at(-1)?.status === 'outcomeUnknown' && mutation.length === 2 && mutation[1]?.status === 'outcomeUnknown' && Boolean(mutation[1].requestId);
    const exactReceipt = mutation[1]?.remoteId === guidValue(request.remoteId);
    const acknowledgedCreate = prior.at(-1)?.status === 'failed' && mutation.length === 3 && mutation[1]?.status === 'remoteSucceeded' && Boolean(mutation[1].requestId) &&
      mutation[2]?.status === 'failed' && (exactReceipt || ((operation.provider === 'dataverse' || grantsOnly) && prior.at(-1)?.errorCode === 'PF-DV-007' && mutation[2].errorCode === 'PF-DV-007'));
    if (mutation[1]?.remoteId && !exactReceipt) throw fail();
    if (prior[0]?.status !== 'started' || mutation[0]?.status !== 'started' || (!unknownCreate && !acknowledgedCreate) || (unknownCreate && !request.confirmedCreatedByThisRun) ||
        journal.some(item => item.resourceId === operation.resourceId && item.status === 'outcomeUnknown' && acknowledgedCreate)) throw fail();
    const ownership = await store.readOwnership();
    if (!ownership || ownership.resources.some(item => item.resourceId === operation.resourceId)) throw fail();
    if (grantsOnly && (unknownCreate || !ownership.resources.some(item => item.resourceId === desired.role && item.provider === 'model-driven' && item.remoteId === guidValue(request.remoteId)))) throw fail();
    const observed = await adapter.observe(ownership);
    if (hashJson(observed.target) !== hashJson(plan.target) || observed.projectId !== project.project.id) throw fail();
    const current = observed.resources.find(item => item.resourceId === operation.resourceId);
    if (!current || current.remoteId !== guidValue(request.remoteId) || !verifyPostcondition(operation, observed)) throw fail();
    const review = createPlan(project, observed, ownership, plan.scope ?? 'all', new Date(), plan.executionPolicy);
    if (review.blockers.length !== 1 || review.blockers[0]?.code !== 'PF-PLAN-005' || review.blockers[0].resourceId !== operation.resourceId) throw fail();
    const executionId = randomUUID();
    const event = (status: JournalEvent['status'], verified: boolean): JournalEvent => ({ schemaVersion: 1, projectId: project.project.id, target: plan.target,
      eventId: randomUUID(), executionId, recoveryOfExecutionId: request.executionId, planId: plan.planId, operationId: operation.id,
      timestamp: new Date().toISOString(), provider: operation.provider, resourceId: operation.resourceId, remoteId: current.remoteId,
      status, verificationResult: verified ? 'passed' : 'notRun', remediation: unknownCreate ? 'Explicit creation-provenance confirmation; read-only recovery. Original unknown-outcome journal retained.' : 'Service-acknowledged create reverified read-only after postcondition failure. Original failure journal retained.' });
    await writer.appendJournal(event('started', false));
    // A fresh observation confirms the original remote create result; no new request is issued.
    await writer.appendJournal(event('remoteSucceeded', false));
    const fresh = await adapter.observe(ownership);
    if (fingerprint(fresh) !== fingerprint(observed) || !verifyPostcondition(operation, fresh)) {
      await writer.appendJournal({ ...event('failed', false), errorCode: 'PF-SAFETY-006' }); throw fail();
    }
    await writer.appendJournal(event('verified', true));
    const next: Ownership = { ...ownership, revision: ownership.revision + 1, updatedAt: new Date().toISOString(),
      resources: [...ownership.resources, { resourceId: current.resourceId, provider: current.provider, remoteId: current.remoteId,
        ownedPaths: Object.keys(desired), baseline: desired, lastVerifiedHash: hashJson(desired) }] };
    await writer.saveOwnership(next); await writer.saveObservation(fresh);
    return { ok: true, executionId, recoveredExecutionId: request.executionId, operationId: operation.id, remoteId: current.remoteId, remoteMutations: 0 };
  });
}
