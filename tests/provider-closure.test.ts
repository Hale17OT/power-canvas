import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { resolveSolution } from '../src/solution/resolve.js';
import { certificationPlan } from '../src/solution/certification.js';
import { solutionReadiness } from '../src/solution/readiness.js';
import { acceptV2ProviderBoundary, providerContracts, readHashedEvidence, publicProviderPromotions } from '../src/solution/provider-certification.js';
import { unresolvedProviderOutcomes } from '../src/solution/provider-outcomes.js';
import { matchingState } from './planner-fixtures.js';
import { modelResources, MODEL_KINDS, MODEL_VERSION } from '../src/model-driven/desired.js';
import { hashJson } from '../src/core/json.js';
import type { JournalEvent } from '../src/state/models.js';
import { capabilities } from '../src/providers/capabilities.js';
import { nativeProviderEvidence } from '../src/providers/native-provider-evidence.js';

function setup(){
 const raw=JSON.parse(readFileSync('examples/solution-v2-live-provider/certification.json','utf8')),{project}=resolveSolution(raw),{observation,ownership}=matchingState(project);
 observation.coverage=[...new Set([...observation.coverage.map(c=>c.kind),'choice','key',...MODEL_KINDS])].map(kind=>({kind,status:'complete' as const}));observation.providerVersions['model-driven']=MODEL_VERSION;ownership.revision=57;
 for(const r of modelResources(project).filter(r=>r.kind!=='appAccess')){const remoteId=randomUUID();observation.resources.push({resourceId:r.resourceId,kind:r.kind,schemaName:r.schemaName,provider:'model-driven',remoteId,properties:{...r.properties,isManaged:false,customizable:true,...(r.kind==='app'?{lifecycle:'DRAFT_UNPUBLISHED',validationResponse:{AppValidationResponse:{ValidationSuccess:true,ValidationIssueList:[{ErrorType:'Warning',Message:'Retained Category warning'}]}}}:{})}});ownership.resources.push({resourceId:r.resourceId,remoteId,provider:'model-driven',baseline:r.properties,ownedPaths:Object.keys(r.properties),lastVerifiedHash:hashJson(r.properties)});}
 const s=observation.resources.find(r=>r.kind==='solution')!,o=ownership.resources.find(r=>r.resourceId===s.resourceId)!;s.properties.displayName='PowerForge Experiment';o.baseline.displayName='PowerForge Experiment';o.lastVerifiedHash=hashJson(o.baseline);
 return certificationPlan(raw,observation,ownership,undefined,{unknown:[],journalHashes:['a'.repeat(64)]});
}
it('accepts only the reviewed manual draft boundary, not full deployment or production',()=>{
 const x=setup(),a=acceptV2ProviderBoundary(x.unified);
 expect(a.readiness.provider).toMatchObject({converged:true,noOp:20,roots:21,acceptedDeferrals:['appAccess:certification'],executableOperations:0});
 expect(a.readiness.deployment.converged).toBe(false);expect(a.productionReady).toBe(false);expect(a.tenantMutationAuthorized).toBe(false);
});
it.each(['BLOCKED','CONFLICT','UNSUPPORTED','ORPHANED'] as const)('does not accept %s as provider convergence',state=>{
 const x=setup(),ir=x.unified.ir;ir.resources.find(r=>r.kind==='table')!.state=state;
 expect(solutionReadiness(ir.project,ir.resources,x.unified.evidence,[],new Date()).provider.converged).toBe(false);
});
it('does not accept an unknown outcome even when every resource looks satisfied',()=>{
 const x=setup(),ir=x.unified.ir;x.unified.evidence.executionOutcomes!.unknown=['uncertain-operation'];
 expect(solutionReadiness(ir.project,ir.resources,x.unified.evidence,[]).provider.converged).toBe(false);
});
it('does not accept an unrelated blocker, missing dependency or nonmanual policy as a deferral',()=>{
 for(const mode of ['blocker','dependency','policy','kind']){const x=setup(),ir=x.unified.ir,a=ir.resources.find(r=>r.kind==='appAccess')!;
 if(mode==='dependency')a.dependencies=[];if(mode==='policy')ir.project.apps.certification!.publishPolicy='afterValidation';if(mode==='kind')a.kind='table';
 expect(solutionReadiness(ir.project,ir.resources,x.unified.evidence,mode==='blocker'?[{code:'UNKNOWN'}]:[]).provider.converged).toBe(false);}
});
it('requires deployment configuration and checks beyond published app and 21 NO_OP',()=>{
 const x=setup(),ir=x.unified.ir;ir.resources.find(r=>r.kind==='appAccess')!.state='NO_OP';ir.resources.find(r=>r.kind==='appAccess')!.ownership='POWERCANVAS_OWNED';
 x.unified.evidence.dataverse!.observation.resources.find(r=>r.kind==='app')!.properties.lifecycle='PUBLISHED';delete x.unified.evidence.dataverse!.plan.deferred;
 expect(solutionReadiness(ir.project,ir.resources,x.unified.evidence,[]).deployment.converged).toBe(false);
 x.unified.evidence.deploymentChecks={configurationResolved:true,checksComplete:true};const r=solutionReadiness(ir.project,ir.resources,x.unified.evidence,[]);
 expect(r.provider.converged).toBe(true);expect(r.deployment.converged).toBe(true);expect(r.production.ready).toBe(false);
});
it('retains unpublished export/Checker limits without making them provider blockers',()=>{
 const r=setup().unified.ir.readiness;expect(r.provider.converged).toBe(true);expect(r.packaging.export).toBe('DEFERRED_WITH_PUBLICATION_ALM');expect(r.packaging.checker).toBe('DEFERRED_WITH_PUBLICATION_ALM');
});
it('does not accept stale observations for regression closure',()=>{
 const x=setup();expect(()=>acceptV2ProviderBoundary(x.unified,new Date(Date.now()+7200000))).toThrow();
});
it('tracks unresolved journal attempts without manufacturing success from fresh metadata',()=>{
 const x=setup(),owned=x.evidence.dataverse.ownership,root=owned.resources.find(r=>r.resourceId.includes(':table:'))!;
 const event:JournalEvent={schemaVersion:1,projectId:owned.projectId,target:owned.target,eventId:randomUUID(),executionId:randomUUID(),planId:randomUUID(),operationId:'create',timestamp:new Date().toISOString(),provider:'dataverse',resourceId:root.resourceId,status:'outcomeUnknown'};
 expect(unresolvedProviderOutcomes([event],owned,new Set([root.resourceId]))).toHaveLength(1);
 expect(unresolvedProviderOutcomes([event,{...event,status:'verified'}],owned,new Set([root.resourceId]))).toEqual([]);
});
it('requires exact saved-byte hashes for evidence and rejects tampering',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pc-provider-proof-'));try{const path=join(dir,'proof.json'),bytes='{"proof":true}\n';await writeFile(path,bytes);const ref={path,sha256:createHash('sha256').update(bytes).digest('hex')};expect(await readHashedEvidence(ref)).toEqual({proof:true});await writeFile(path,'{}');await expect(readHashedEvidence(ref)).rejects.toThrow('hash mismatch');}finally{await rm(dir,{recursive:true,force:true});}
});
it('limits promotions to existing bounded create/readback contracts',()=>{
 expect(providerContracts).toHaveLength(13);
 for(const id of ['modelDriven.publish','security.appAccess.configure','security.role.revoke','security.userAssignment','security.teamAssignment','solution.alm'])expect(providerContracts.some(c=>c.capability===id)).toBe(false);
 expect(()=>publicProviderPromotions({proofs:[],acceptance:{status:'COMPLETE_FOR_COMPILER_PROVIDER_SCOPE'},unknownOutcomes:[]} as never,'a'.repeat(64))).toThrow();
});
it('does not expose live publication/access/ALM claims through the capability registry',()=>{
 for(const id of ['modelDriven.publish','security.appAccess.configure','solution.alm'])expect(capabilities.find(c=>c.id===id)?.verification?.liveProviderVerified).not.toBe(true);
 expect(capabilities.find(c=>c.id==='security.appAccess.configure')?.requirements.join(' ')).toContain('Published AppModule');
});
it('derives exactly the bounded registry promotions from the sanitized evidence projection',()=>{
 expect(nativeProviderEvidence).toHaveLength(providerContracts.length);
 for(const contract of providerContracts){
  const proof=nativeProviderEvidence.find(p=>p.capability===contract.capability)!,entry=capabilities.find(c=>c.id===contract.capability)!;
  expect(proof.contract).toBe(contract.contract);expect(proof.dimensions).toEqual(contract.dimensions);
  expect(proof.manifestHash).toMatch(/^[a-f0-9]{64}$/);expect(proof.proofHash).toMatch(/^[a-f0-9]{64}$/);
  expect(entry.implementation).toBe('implemented');expect(entry.verification).toMatchObject({liveProviderVerified:true,manifestHash:proof.manifestHash,proofHash:proof.proofHash,testedContract:contract.contract});
 }
 expect(capabilities.filter(c=>c.verification?.liveProviderVerified)).toHaveLength(13);
 expect(capabilities.find(c=>c.id==='dataverse.table.update')?.verification?.liveProviderVerified).toBe(false);
});
it('rejects a changed deferral or unknown outcome at the actual closure boundary',()=>{
 for(const kind of ['dependency','unknown']){const x=setup();
  if(kind==='dependency')x.unified.evidence.dataverse!.plan.deferred![0]!.dependency='invented';else x.unified.evidence.executionOutcomes!.unknown=['uncertain'];
  expect(()=>acceptV2ProviderBoundary(x.unified)).toThrow();
 }
});
