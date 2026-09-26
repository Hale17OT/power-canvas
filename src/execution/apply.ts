import { plannedPrivileges } from '../model-driven/table-privileges.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Project } from '../ir/schema.js';
import type { Observation, Ownership, Plan, PlannedOperation, JournalEvent } from '../state/models.js';
import { LocalStateStore } from '../state/local.js';
import { hashJson } from '../core/json.js';
import {digest} from '../solution/compile.js';
import { PowerCanvasError, publicError } from '../core/errors.js';
import { createPlan, fingerprint, projection, publicationHash, topological, validateSavedPlan } from '../planner/dataverse.js';
import { assertJournalTransition } from '../state/journal.js';
import type { Mutation } from '../dataverse/mutations.js';
import { ApiError } from '../dataverse/http.js';
import { modelPublicationHash } from '../model-driven/desired.js';
import {validateCertificationExecution,type CertificationExecutionBundle,type CertificationExecutionContext} from './certification.js';
import type {CertificationExecutionInput} from './certification.js';
import {derivePreWriteReadSet,requireAttestationPass,type PreWriteAttestation,type PreWriteReadSet} from './attestation.js';

export interface ExecutionAdapter {
  scopeAttestation?: {input:CertificationExecutionInput;run(ownership:Ownership,operation?:PlannedOperation,current?:Observation):Promise<{readSet:PreWriteReadSet;attestation:PreWriteAttestation}>};
  verifyTarget(): Promise<void>;
  observe(ownership?: Ownership): Promise<Observation>;
  observeReadback?(ownership?:Ownership):Promise<Observation>;
  apply(operation: PlannedOperation, observed: Observation, mutate: Mutation): Promise<void>;
  membership(operation: PlannedOperation, observed: Observation, mutate: Mutation): Promise<void>;
  request(path: string, method: string, body: unknown, headers?: Record<string, string>): Promise<{ requestId: string; remoteId?: string }>;
}
export interface ApplyResult { ok: boolean; executionId: string; planId: string; completed: string[]; failedOperation?: string; error?: { code: string; message: string; remediation: string }; finalObservationHash?: string; keyIndexEvidence?:{remoteId:string;indexStatus:string;state:'CREATED_PENDING_INDEX'|'CREATED_INDEX_FAILED'|'CREATED_UNVERIFIED'} }

export function verifyPostcondition(operation: PlannedOperation, observation: Observation): boolean {
  if (operation.action === 'publishModelApp') return observation.resources.some(r=>r.resourceId===operation.after?.app&&r.properties.lifecycle==='PUBLISHED');
  if (operation.action === 'publish') return true; // Publish requires a successful action response plus final full reconciliation below.
  const resource = observation.resources.find(item => item.resourceId === operation.resourceId);
  if (operation.action === 'grantRolePrivileges' && operation.preconditions.some(p => p.property === 'resolvedTablePrivileges')) {
    const readback = z.object({ roleId: z.guid(), privileges: z.array(z.object({ privilegeId: z.guid(), depth: z.string() })) }).safeParse(resource?.properties.rolePrivilegeReadback);
    const role = observation.resources.find(r => r.resourceId === operation.after?.role && r.kind === 'role');
    if (!readback.success || !role || readback.data.roleId !== role.remoteId || resource?.remoteId !== role.remoteId) return false;
    if (!plannedPrivileges(operation).every(p => readback.data.privileges.filter(g => g.privilegeId === p.privilegeId && g.depth === p.depth).length === 1)) return false;
  }
  if (operation.action === 'createKey') {
    // EntityKeyMetadata.IsCustomizable is observed, not authored by keyResourceSchema.
    return Boolean(resource?.kind === 'key' && resource.provider === 'dataverse' && operation.after &&
      resource.properties.isManaged === false && resource.properties.indexStatus === 'Active' &&
      hashJson(projection(resource, operation.after)) === hashJson(operation.after));
  }
  return Boolean(resource && operation.after && hashJson(projection(resource, operation.after)) === hashJson(operation.after) && resource.properties.isManaged !== true && resource.properties.customizable !== false);
}

export async function applyPlan(project: Project, plan: Plan, store: LocalStateStore, adapter: ExecutionAdapter,
  delay: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),certification?:CertificationExecutionContext&{bundle:CertificationExecutionBundle}): Promise<ApplyResult> {
  if (hashJson(store.target) !== hashJson(plan.target) || store.projectId !== project.project.id) throw new PowerCanvasError('PF-ENV-003', 'Executor state target differs from the reviewed plan.', 'Select the plan target explicitly.');
  const scoped=adapter.scopeAttestation;
  if(scoped){if(!certification)throw Error('Scope attestation requires the exact certification authorization');validateCertificationExecution(certification.bundle,{...scoped.input,project,plan});derivePreWriteReadSet({...scoped.input,project,plan});}
  await adapter.verifyTarget();
  return store.withLock(async writer => {
    await adapter.verifyTarget();
    let ownership = await store.readOwnership();
    let observed = scoped?structuredClone(scoped.input.observation):await adapter.observe(ownership);
    if(certification){if(!ownership)throw new PowerCanvasError('PF-CERT-003','Certification ownership is missing.','Stop before mutation.');validateCertificationExecution(certification.bundle,{...certification,project,plan,observation:observed,ownership});}
    else validateSavedPlan(plan, project, observed, ownership);
    const attest=async(operation?:PlannedOperation)=>{
      if(!scoped)return;
      if(!ownership)throw Error('Certification ownership required');
      const result=await scoped.run(ownership,operation,observed);
      const expected=derivePreWriteReadSet({...scoped.input,project,plan});
      if(result.readSet.contentHash!==expected.contentHash||result.attestation.operationId!==(operation?.id??null))throw Error('Attestation read set differs from the exact authorized plan');
      requireAttestationPass(result.attestation,expected);
      if(digest(result.attestation.target)!==digest(plan.target)||result.attestation.ownership.hash!==digest(ownership)||result.attestation.ownership.revision!==ownership.revision)throw Error('Attestation target or ownership differs from the current execution boundary');
      return result.attestation;
    };
    let latestAttestation=await attest();
    const authorizationHash=certification?hashJson(certification.bundle):undefined;
    const assertLease=()=>{if(!certification)return;const {contentHash,...body}=plan;if(hashJson(certification.bundle)!==authorizationHash||contentHash!==certification.bundle.receipt.planHash||hashJson(body)!==contentHash||hashJson(project)!==plan.sourceHash||Date.now()>=Date.parse(certification.bundle.receipt.expiresAt))throw new PowerCanvasError('PF-CERT-003','Certification plan/receipt changed or expired during execution.','Stop before further mutation.');};
    const result: ApplyResult = { ok: false, executionId: randomUUID(), planId: plan.planId, completed: [] };
    const transitions = new Map<string, JournalEvent>();
    const event = async (operation: PlannedOperation, id: string, status: JournalEvent['status'], extra: Partial<JournalEvent> = {}) => {
      const entry: JournalEvent = { schemaVersion: 1, projectId: project.project.id, target: plan.target, eventId: randomUUID(), executionId: result.executionId,
        planId: plan.planId, operationId: id, timestamp: new Date().toISOString(), provider: operation.provider, resourceId: operation.resourceId, status, ...extra };
      assertJournalTransition(transitions.get(id), entry); await writer.appendJournal(entry); transitions.set(id, entry);
    };
    for (const operation of topological(plan.operations)) {
      try {
        assertLease();
        if(certification&&hashJson(await store.readOwnership()??null)!==hashJson(ownership??null))throw new PowerCanvasError('PF-CERT-003','Ownership changed between certification operations.','Stop and re-plan; do not resume this receipt.');
        if(scoped)latestAttestation=await attest(operation);
        else {const fresh = await adapter.observe(ownership);
        if (fingerprint(fresh) !== fingerprint(observed)) throw new PowerCanvasError('PF-PLAN-008', 'Target changed between operations.', 'Execution stopped; inspect the partial journal and review a fresh plan.');}
        await adapter.verifyTarget(); // Identity and developer/sandbox policy are rechecked before each planned operation.
        await event(operation, operation.id, 'started', { verificationResult: 'notRun' });
        let acknowledgedId: string | undefined;
        const mutate: Mutation = async (step, path, method, body, headers) => {
          assertLease();
          if(scoped&&(!latestAttestation||Date.now()>=Date.parse(latestAttestation.expiresAt)||latestAttestation.operationId!==operation.id))throw Error('Operation attestation expired before mutation');
          if(certification&&(Date.now()>=Date.parse(certification.bundle.receipt.expiresAt)||!certification.bundle.receipt.authorizedOperationIds.includes(operation.id)))throw new PowerCanvasError('PF-CERT-003','Mutation is outside the current exact certification receipt.','Stop before mutation.');
          const id = `${operation.id}/${step}`;
          await event(operation, id, 'started', { verificationResult: 'notRun' });
          try {
            const response = await adapter.request(path, method, body, headers);
            if (step === 'create' && response.remoteId) acknowledgedId = response.remoteId;
            await event(operation, id, 'remoteSucceeded', { requestId: response.requestId, verificationResult: 'notRun', ...(response.remoteId ? { remoteId: response.remoteId } : {}) });
          } catch (error) {
            const safe = publicError(error);
            await event(operation, id, error instanceof ApiError && error.uncertain ? 'outcomeUnknown' : 'failed', { errorCode: safe.code, remediation: safe.remediation, verificationResult: 'notRun', ...(error instanceof ApiError ? { requestId: error.requestId } : {}) });
            throw error;
          }
        };
        await adapter.apply(operation, observed, mutate);
        await event(operation, operation.id, 'remoteSucceeded', { verificationResult: 'notRun', ...(acknowledgedId ? { remoteId: acknowledgedId } : {}) });
        // Poll propagation with bounded reads; never retry creates after timeouts.
        for (let attempt = 0; attempt < 5; attempt++) {
          observed = await (adapter.observeReadback??adapter.observe)(ownership);
          if (!['publish','publishModelApp'].includes(operation.action) && observed.resources.some(item => item.resourceId === operation.resourceId)) break;
          if (['publish','publishModelApp'].includes(operation.action)) break;
          await delay(500 * 2 ** attempt);
        }
        await adapter.membership(operation, observed, mutate);
        let verified = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          observed = await (adapter.observeReadback??adapter.observe)(ownership);
          if (verifyPostcondition(operation, observed) && (!acknowledgedId || observed.resources.find(item => item.resourceId === operation.resourceId)?.remoteId === acknowledgedId)) { verified = true; break; }
          if(operation.action==='createKey'&&observed.resources.find(r=>r.resourceId===operation.resourceId)?.properties.indexStatus==='Failed')break;
          await delay(500 * 2 ** attempt);
        }
        if(!verified&&operation.action==='createKey'){
          const key=observed.resources.find(r=>r.resourceId===operation.resourceId);
          if(key){const indexStatus=String(key.properties.indexStatus);result.keyIndexEvidence={remoteId:key.remoteId,indexStatus,state:indexStatus==='Failed'?'CREATED_INDEX_FAILED':['Pending','InProgress'].includes(indexStatus)?'CREATED_PENDING_INDEX':'CREATED_UNVERIFIED'};}
        }
        if (!verified) throw new PowerCanvasError('PF-DV-007', 'Remote response succeeded, but the metadata postcondition was not verified.', 'Inspect the journal and live metadata. Do not assume the operation is absent or retry its create blindly.');
        const resource = observed.resources.find(item => item.resourceId === operation.resourceId);
        for (const [id, entry] of transitions) {
          if (id.startsWith(`${operation.id}/`) && entry.status === 'remoteSucceeded') await event(operation, id, 'verified', { verificationResult: 'passed', ...(resource ? { remoteId: resource.remoteId } : {}) });
        }
        await event(operation, operation.id, 'verified', { verificationResult: 'passed', ...(resource ? { remoteId: resource.remoteId } : {}) });
        if (resource && operation.after) {
          const owned = { resourceId: resource.resourceId, remoteId: resource.remoteId, provider: resource.provider, ownedPaths: Object.keys(operation.after), baseline: operation.after, lastVerifiedHash: hashJson(operation.after),...(certification?{certificationEvidence:{purpose:'PROVIDER_CERTIFICATION' as const,solutionId:certification.bundle.manifest.solutionId,publisherId:certification.bundle.manifest.publisherId,publisherPrefix:'pfx' as const,sourceHash:plan.sourceHash,planHash:plan.contentHash,creationOperationId:operation.id,readbackHash:hashJson(resource),revision:(ownership?.revision??-1)+1,verifiedAt:new Date().toISOString()}}:{}) };
          ownership = { schemaVersion: 1, projectId: project.project.id, target: plan.target, revision: ownership ? ownership.revision + 1 : 0,
            ...(ownership?.publicationHash ? { publicationHash: ownership.publicationHash } : {}),
            ...(ownership?.modelDrivenPublicationHash ? { modelDrivenPublicationHash: ownership.modelDrivenPublicationHash } : {}),
            ...(ownership?.experiment1Evidence ? { experiment1Evidence: ownership.experiment1Evidence } : {}),
            updatedAt: new Date().toISOString(), resources: [...(ownership?.resources.filter(item => item.resourceId !== resource.resourceId) ?? []), owned] };
          await writer.saveOwnership(ownership);
        }
        if (operation.action === 'publish') {
          ownership = { ...ownership, schemaVersion: 1, projectId: project.project.id, target: plan.target, revision: ownership ? ownership.revision + 1 : 0,
            ...(operation.provider === 'model-driven' ? { modelDrivenPublicationHash: modelPublicationHash(project) } : { publicationHash: publicationHash(project) }), updatedAt: new Date().toISOString(), resources: ownership?.resources ?? [] };
          await writer.saveOwnership(ownership);
        }
        await writer.saveObservation(observed);
        result.completed.push(operation.id);
      } catch (error) {
        const safe = publicError(error); const previous = transitions.get(operation.id);
        for (const [id, entry] of transitions) {
          if (id.startsWith(`${operation.id}/`) && entry.status === 'remoteSucceeded') await event(operation, id, 'failed', { errorCode: safe.code, remediation: safe.remediation, verificationResult: 'failed' });
        }
        if (previous && ['started', 'remoteSucceeded'].includes(previous.status)) await event(operation, operation.id,
          error instanceof ApiError && error.uncertain ? 'outcomeUnknown' : 'failed', { errorCode: safe.code, remediation: safe.remediation, verificationResult: 'failed' });
        return { ...result, failedOperation: operation.id, error: { code: safe.code, message: safe.message, remediation: safe.remediation } };
      }
    }
    try {
      observed = await adapter.observe(ownership);
      const final = createPlan(project, observed, ownership, plan.scope ?? 'all', new Date(), plan.executionPolicy,certification?plan.certification?.manifest:undefined);
      if (final.deferred?.length || final.operations.length || final.blockers.length) return { ...result, error: { code: 'PF-DV-007', message: 'Final reconciliation is not a semantic no-op.', remediation: 'Inspect current observations and blockers before another apply.' } };
      return { ...result, ok: true, finalObservationHash: fingerprint(observed) };
    } catch (error) {
      const safe = publicError(error);
      return { ...result, error: { code: safe.code, message: safe.message, remediation: safe.remediation } };
    }
  });
}
