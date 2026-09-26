import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { hashJson } from '../core/json.js';
import { projection, createPlan } from '../planner/dataverse.js';
import { certificationResources } from '../planner/certification.js';
import type { SolutionPlan } from './plan.js';
import { validateSolutionPlan } from './plan.js';
import { solutionReadiness } from './readiness.js';
import { REVIEWED_REMAINING_FIXTURE, REVIEWED_REMAINING_PROJECT } from '../execution/certification.js';
import type { JsonInput } from '../core/json.js';

const digest=(v:unknown)=>hashJson(v as JsonInput);
export const providerContracts = [
  {capability:'dataverse.choice.create',kind:'choice',contract:'One global Picklist; exact three numeric option identities; canonical service-name recovery',dimensions:['liveCreate','liveReadback','liveNoOp']},
  {capability:'dataverse.table.create',kind:'table',contract:'Two user/team-owned custom tables with generated text primary names',dimensions:['liveCreate','primaryNameCreate','primaryNameReadback','liveReadback','liveNoOp']},
  {capability:'dataverse.column.create',kind:'column',contract:'Eight reviewed Probe columns: decimal, integer, date-only, boolean, text, multiline text, user-local datetime and global choice',dimensions:['liveCreate','liveReadback','liveNoOp']},
  {capability:'dataverse.key.create',kind:'key',contract:'One external-code alternate key; Active async index and explicit managed-property recovery',dimensions:['liveCreate','activeIndex','liveReadback','liveNoOp']},
  {capability:'dataverse.relationship.create',kind:'relationship',contract:'One many-to-one relationship and generated lookup; restrict delete, no assign/share/unshare/reparent/merge cascade',dimensions:['liveCreate','lookupCreate','lookupReadback','liveReadback','liveNoOp']},
  {capability:'dataverse.form.create',kind:'form',contract:'One bounded Probe main form; only reviewed native controls/layout',dimensions:['liveCreate','liveReadback','liveNoOp']},
  {capability:'dataverse.view.create',kind:'view',contract:'One public Probe view compiled from typed FetchXML/LayoutXML',dimensions:['liveCreate','liveReadback','liveNoOp']},
  {capability:'modelDriven.navigation.create',kind:'sitemap',contract:'One certification-only app-specific sitemap',dimensions:['liveCreate','liveReadback','liveNoOp']},
  {capability:'modelDriven.app.create',kind:'app',contract:'One solution-owned Unified Interface AppModule; draft/unpublished identity',dimensions:['liveCreate','liveReadback','liveNoOp']},
  {capability:'modelDriven.component.add',kind:'appComponents',contract:'Five reviewed table/form/view/sitemap associations',dimensions:['liveApply','liveReadback','liveNoOp']},
  {capability:'modelDriven.validate',kind:'app',contract:'ValidateApp true, zero errors, retained Category warning',dimensions:['liveValidation','liveReadback']},
  {capability:'security.role.create',kind:'role',contract:'One root-business-unit certification role; no human/team assignment',dimensions:['liveCreate','liveReadback','liveNoOp']},
  {capability:'security.privilege.configure',kind:'rolePermissions',contract:'Exactly two custom-table Basic Read grants resolved by stable metadata IDs; no broader depths or revocation',dimensions:['liveApply','liveReadback','liveNoOp']},
] as const;

export const evidenceReferenceSchema=z.strictObject({path:z.string().min(1),sha256:z.string().regex(/^[a-f0-9]{64}$/)});
export type EvidenceReference=z.infer<typeof evidenceReferenceSchema>;
export async function readHashedEvidence(reference:EvidenceReference):Promise<unknown>{
  const ref=evidenceReferenceSchema.parse(reference),bytes=await readFile(ref.path);
  if(createHash('sha256').update(bytes).digest('hex')!==ref.sha256)throw Error('Evidence saved-byte hash mismatch: '+ref.path);
  return JSON.parse(bytes.toString('utf8')) as unknown;
}

/** Closed V2 draft boundary, not a mechanism for accepting arbitrary blockers. */
export function acceptV2ProviderBoundary(plan:SolutionPlan,now=new Date()){
  validateSolutionPlan(plan,plan.spec,plan.evidence,now,plan.flowEvidence);
  const native=plan.evidence.dataverse;if(!native)throw Error('Native evidence required');
  const result=solutionReadiness(plan.ir.project,plan.ir.resources,plan.evidence,plan.ir.validation.blockers,now);
  if(native.plan.certification?.manifest.fixtureHash!==REVIEWED_REMAINING_FIXTURE||native.plan.sourceHash!==REVIEWED_REMAINING_PROJECT||
    native.ownership?.revision!==57||!plan.evidence.executionOutcomes?.journalHashes.length||
    !result.provider.converged||result.provider.roots!==21||result.provider.noOp!==20||result.provider.acceptedDeferrals.length!==1||
    result.provider.acceptedDeferrals[0]!=='appAccess:certification'||native.plan.certification.publishScopes.length||native.plan.certification.closure.resourcesToPublish.length)
    throw Error('V2 draft provider boundary not satisfied');
  const app=native.observation.resources.find(r=>r.resourceId.endsWith(':app:certification'))!;
  if(app.properties.lifecycle!=='DRAFT_UNPUBLISHED'||result.provider.validation[0]?.status!=='PASS_WITH_WARNINGS'||result.provider.validation[0].warnings.length!==1)throw Error('Reviewed app lifecycle/validation changed');
  return {status:'COMPLETE_FOR_COMPILER_PROVIDER_SCOPE',boundary:'VALIDATED_UNPUBLISHED_MODEL_APP',readiness:result,tenantMutationAuthorized:false,ownershipMutationAuthorized:false,publicationAccess:'DEFERRED_BY_SOURCE_POLICY',export:'DEFERRED_WITH_PUBLICATION_ALM',checker:'DEFERRED_WITH_PUBLICATION_ALM',productionReady:false} as const;
}

export interface CreationChain {journal:EvidenceReference;plan:EvidenceReference;readback:EvidenceReference;recovery?:EvidenceReference}
/** Promotions are derived from actual matching journals, receipts and independent native NO_OP. */
export async function buildProviderProof(plan:SolutionPlan,chains:Record<string,CreationChain>,convergence:EvidenceReference){
  const acceptance=acceptV2ProviderBoundary(plan),n=plan.evidence.dataverse!,project=plan.ir.project;
  const rawConvergence=await readHashedEvidence(convergence);
  if(digest(rawConvergence)!==digest(n.plan))throw Error('Final native plan evidence differs');
  const rebuilt=createPlan(project,n.observation,n.ownership,n.plan.scope,new Date(n.plan.createdAt),n.plan.executionPolicy,n.plan.certification!.manifest);
  if(rebuilt.operations.length||rebuilt.blockers.length||digest(rebuilt.deferred)!==digest(n.plan.deferred))throw Error('Independent planner no longer converges');
  const desired=certificationResources(project),proofs=[];
  for(const contract of providerContracts){
    const resources=[];
    for(const root of desired.filter(r=>r.kind===contract.kind)){
      const live=n.observation.resources.find(r=>r.resourceId===root.resourceId),owned=n.ownership!.resources.find(r=>r.resourceId===root.resourceId),chain=chains[root.resourceId];
      if(!live||!owned||!chain||owned.remoteId!==live.remoteId||digest(projection(live,root.properties))!==digest(root.properties)||digest(owned.baseline)!==digest(root.properties)||owned.lastVerifiedHash!==digest(owned.baseline))throw Error('Incomplete owned NO_OP evidence');
      const journal=await readHashedEvidence(chain.journal),oldPlan=await readHashedEvidence(chain.plan) as {contentHash?:string;planId?:string;sourceHash?:string;operations?:{id:string;resourceId:string}[]},readback=await readHashedEvidence(chain.readback) as {resources?:{resourceId:string;remoteId:string}[]};
      const origin=owned.certificationEvidence,recovery=owned.recoveryEvidence;
      const operationId=origin?.creationOperationId??recovery?.originalOperationId;
      if(oldPlan.contentHash!==(origin?.planHash??recovery?.originalPlanHash)||oldPlan.sourceHash!==(origin?.sourceHash??recovery?.sourceHash)||!oldPlan.operations?.some(o=>o.id===operationId&&o.resourceId===root.resourceId))throw Error('Creation plan is not receipt-bound');
      if(!Array.isArray(journal)||!journal.some(e=>e.resourceId===root.resourceId&&e.planId===oldPlan.planId&&e.remoteId===live.remoteId&&
        (e.operationId===operationId||e.operationId===operationId+'/create')&&e.status===(recovery?'remoteSucceeded':'verified')))throw Error('Creation journal lacks exact verified/acknowledged identity');
      if(!readback.resources?.some(r=>r.resourceId===root.resourceId&&r.remoteId===live.remoteId))throw Error('Historical readback identity missing');
      if(recovery){if(!chain.recovery)throw Error('Recovery evidence required');const r=await readHashedEvidence(chain.recovery) as {status?:string;receipt?:unknown};if(r.status!=='RECOVERY_VERIFIED'||digest(r.receipt)!==digest(owned))throw Error('Recovered ownership differs from accepted recovery');}
      if(root.kind==='key'&&live.properties.indexStatus!=='Active')throw Error('Alternate key must be Active');
      resources.push({resourceId:root.resourceId,stableId:live.remoteId,definitionHash:digest(root.properties),receiptHash:digest(owned),receiptReadbackHash:origin?.readbackHash??recovery?.readbackHash,creationSourceHash:oldPlan.sourceHash,operationId,chain,convergence});
    }
    if(!resources.length)throw Error('Capability has no tested resources');
    const body={...contract,resources,environment:n.plan.target,fixtureHash:n.plan.certification!.manifest.fixtureHash,sourceHash:n.plan.sourceHash,limitations:['Bounded reviewed fixture in a non-disposable Default environment only','No publication, app-role association, persona runtime, managed import or cross-environment ALM proof','No destructive operations, update/revoke/depth-reduction or assignment promotion']};
    proofs.push({...body,proofHash:digest(body)});
  }
  return {version:1,purpose:'V2_PROVIDER_BOUNDARY_CLOSURE',acceptance,ownershipRevision:57,ownershipHash:digest(n.ownership),sourceHash:n.plan.sourceHash,fixtureHash:n.plan.certification!.manifest.fixtureHash,planHash:n.plan.contentHash,convergence,proofs,unknownOutcomes:plan.evidence.executionOutcomes!.unknown,mutationAuthorized:false,notAnOwnershipReceipt:true};
}

export function publicProviderPromotions(manifest:Awaited<ReturnType<typeof buildProviderProof>>,manifestHash:string){
  if(createHash('sha256').update(JSON.stringify(manifest,null,2)+'\n').digest('hex')!==manifestHash||!manifest.acceptance.readiness.provider.converged||manifest.acceptance.status!=='COMPLETE_FOR_COMPILER_PROVIDER_SCOPE'||manifest.unknownOutcomes.length||manifest.proofs.length!==providerContracts.length)throw Error('Unaccepted promotion manifest');
  return providerContracts.map(contract=>{
    const matches=manifest.proofs.filter(p=>p.capability===contract.capability),p=matches[0];
    if(matches.length!==1||!p?.resources.length||p.contract!==contract.contract||digest(p.dimensions)!==digest(contract.dimensions))throw Error('Unproven capability or contract');
    const {proofHash,...body}=p;if(digest(body)!==proofHash)throw Error('Proof content hash changed');
    return {capability:p.capability,contract:p.contract,manifestHash,proofHash,dimensions:p.dimensions,limitations:p.limitations};
  });
}
