import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import type {Project} from '../ir/schema.js';
import {desiredResources} from '../dataverse/desired.js';
import {canonicalGlobalChoiceName} from '../dataverse/global-choice.js';
import {journalEventSchema,observationSchema,ownershipSchema,planSchema,type Observation,type Ownership,type Plan} from '../state/models.js';
import type {LocalStateStore} from '../state/local.js';
import {digest} from '../solution/compile.js';
import {projection} from '../planner/dataverse.js';
import {executionManifestSchema,executionReceiptSchema,REVIEWED_CERTIFICATION_FIXTURE,REVIEWED_CERTIFICATION_PROJECT,type CertificationExecutionBundle} from './certification.js';
import {PowerCanvasError} from '../core/errors.js';

function fail(message:string):never{throw new PowerCanvasError('PF-SAFETY-006','RECOVERY_BLOCKED: '+message,'Keep remote writes stopped. Recovery requires journal-bound identity and exact independent readback; never retry CREATE or adopt by name.');};
const same=(a:unknown,b:unknown)=>digest(a)===digest(b);
const sealed=(v:{contentHash:string})=>{const {contentHash,...body}=v;return contentHash===digest(body);};
export const savedBytesHash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export interface ConfirmedCreateRecoveryInput {
 project:Project;fixtureHash:string;plan:Plan;bundle:CertificationExecutionBundle;ownership:Ownership;
 journalBytes:string;reconciliationBytes:string;observation:Observation;
 request:{executionId:string;operationId:string;remoteId:string;journalHash:string;reconciliationHash:string};
}

/** Closed recovery policy: one confirmed certification global-choice create, never arbitrary adoption. */
export function reviewConfirmedCreateRecovery(input:ConfirmedCreateRecoveryInput,now=new Date()){
 const {project,request}=input,plan=planSchema.parse(input.plan),ownership=ownershipSchema.parse(input.ownership);
 const manifest=executionManifestSchema.parse(input.bundle.manifest),authorization=executionReceiptSchema.parse(input.bundle.receipt);
 z.uuid().parse(request.executionId);z.guid().parse(request.remoteId);
 if(input.fixtureHash!==REVIEWED_CERTIFICATION_FIXTURE||digest(project)!==REVIEWED_CERTIFICATION_PROJECT||manifest.fixtureHash!==input.fixtureHash||manifest.projectHash!==digest(project)||plan.sourceHash!==digest(project))fail('source / fixture hash differs');
 // Expired historical execution evidence proves provenance, not permission to execute again.
 if(!sealed(plan)||!sealed(manifest)||!sealed(authorization)||manifest.planHash!==plan.contentHash||authorization.planHash!==plan.contentHash||authorization.manifestHash!==manifest.contentHash||authorization.targetHash!==digest(plan.target)||authorization.solutionId!==manifest.solutionId||authorization.publisherId!==manifest.publisherId)fail('original plan or authorization integrity differs');
 if(!same(plan.target,ownership.target)||!same(plan.target,manifest.target)||plan.projectId!==project.project.id||ownership.projectId!==project.project.id||plan.ownershipRevision!==ownership.revision||manifest.ownershipRevision!==ownership.revision||manifest.ownershipHash!==digest(ownership)||authorization.ownershipHash!==digest(ownership)||authorization.ownershipRevision!==ownership.revision)fail('target or ownership baseline differs');
 if(!same(manifest.ownershipReceiptHashes,ownership.resources.map(r=>({resourceId:r.resourceId,hash:digest(r)}))))fail('ownership receipts differ');
 const op=plan.operations.find(o=>o.id===request.operationId),spec=desiredResources(project).find(r=>r.resourceId===op?.resourceId);
 if(!op||op.action!=='createChoice'||op.provider!=='dataverse'||op.before!==null||!op.after||spec?.kind!=='choice'||!manifest.desiredResources.some(r=>r.resourceId===spec.resourceId&&r.identity===spec.schemaName)||!manifest.operations.some(o=>o.id===op.id&&o.definitionHash===digest(op))||!authorization.authorizedOperationIds.includes(op.id))fail('operation is not the evidenced global choice CREATE');
 const operation=op!,desired=spec!;
 const oldExpected={...desired.properties};delete oldExpected.optionSetType;delete oldExpected.isGlobal;oldExpected.schemaName=desired.schemaName;
 if(!same(operation.after,oldExpected))fail('original defining metadata differs beyond reviewed Name normalization');
 if(ownership.resources.some(r=>r.resourceId===operation.resourceId||r.remoteId===request.remoteId))fail('conflicting ownership already exists');
 if(savedBytesHash(input.journalBytes)!==request.journalHash||savedBytesHash(input.reconciliationBytes)!==request.reconciliationHash||!input.journalBytes.endsWith('\n'))fail('saved evidence bytes differ or journal is incomplete');
 const journal=input.journalBytes.trim().split('\n').filter(Boolean).map(line=>journalEventSchema.parse(JSON.parse(line)));
 if(journal.length!==6||journal.some(e=>e.executionId!==request.executionId||e.planId!==plan.planId||e.resourceId!==operation.resourceId||e.projectId!==project.project.id||!same(e.target,plan.target)||e.provider!=='dataverse'||!['started','remoteSucceeded','failed'].includes(e.status)))fail('journal provenance differs');
 for(const id of [operation.id,operation.id+'/create']){
  const events=journal.filter(e=>e.operationId===id);
  if(events.length!==3||events[0]?.status!=='started'||events[1]?.status!=='remoteSucceeded'||events[1]?.remoteId!==request.remoteId||events[2]?.status!=='failed'||events[2]?.errorCode!=='PF-DV-007'||events[2]?.verificationResult!=='failed'||id.endsWith('/create')&&!events[1]?.requestId)fail('missing confirmed CREATE / verification-failure sequence');
  if(events.some((e,i)=>i>0&&e.timestamp<events[i-1]!.timestamp))fail('journal chronology differs');
 }
 const reconciliation=observationSchema.parse(JSON.parse(input.reconciliationBytes)),fresh=observationSchema.parse(input.observation);
 const expectedKinds=plan.certification?.manifest?['publisher','solution','table','column','relationship','choice','key','form','view','sitemap','app','role','rolePermissions','appComponents','appAccess']:[];
 if(!expectedKinds.length)fail('certification coverage contract missing');
 for(const observation of [reconciliation,fresh]){
  if(!same(observation.target,plan.target)||observation.projectId!==project.project.id||observation.coverage.some(c=>c.status!=='complete')||expectedKinds.some(k=>!observation.coverage.some(c=>c.kind===k&&c.status==='complete')))fail('independent observation incomplete or wrong target');
  const current=observation.resources.find(r=>r.resourceId===operation.resourceId);
  if(!current||current.provider!=='dataverse'||current.kind!=='choice'||current.remoteId!==request.remoteId||current.schemaName!==desired.schemaName||current.properties.isManaged!==false||current.properties.customizable!==true)fail('stable identity or managed/customizable state differs');
  const expected=observation===fresh?desired.properties:{...oldExpected,schemaName:canonicalGlobalChoiceName(desired.schemaName)};
  if(!same(projection(current!,expected),expected))fail('defining metadata or membership differs');
  for(const [kind,id]of [['solution',manifest.solutionId],['publisher',manifest.publisherId]]){
   const resource=observation.resources.find(r=>r.kind===kind&&r.remoteId===id),receipt=ownership.resources.find(r=>r.remoteId===id);
   if(!resource||!receipt||!same(projection(resource,receipt.baseline),receipt.baseline)||resource.properties.isManaged!==false||resource.properties.customizable!==true)fail('solution/publisher dependency differs');
   if(kind==='solution'&&(resource.schemaName!==project.solution.uniqueName||resource.schemaName!=='pfx_PowerForgeExperiment'))fail('solution identity differs');
   if(kind==='publisher'&&(resource.schemaName!==project.solution.publisher.uniqueName||resource.properties.prefix!==project.solution.publisher.prefix||resource.properties.prefix!==manifest.publisherPrefix))fail('publisher identity differs');
  }
 }
 if(fresh.snapshotId===reconciliation.snapshotId||Date.parse(fresh.observedAt)<=Date.parse(reconciliation.observedAt)||now.getTime()-Date.parse(fresh.observedAt)>300000||Date.parse(fresh.observedAt)>now.getTime()+60000)fail('fresh readback is stale or not independent');
 const current=fresh.resources.find(r=>r.resourceId===operation.resourceId)!;
 const receipt={resourceId:operation.resourceId,remoteId:request.remoteId,provider:'dataverse',ownedPaths:Object.keys(desired.properties),baseline:desired.properties,lastVerifiedHash:digest(desired.properties),origin:'CREATE_RECOVERY' as const,
  recoveryEvidence:{reason:'POSTCONDITION_PLATFORM_NORMALIZATION' as const,metadataId:request.remoteId,canonicalName:canonicalGlobalChoiceName(desired.schemaName),authoringIdentity:desired.schemaName,displayName:String(desired.properties.displayName),options:z.array(z.object({value:z.int(),label:z.string()})).parse(desired.properties.options),optionSetType:'Picklist' as const,isGlobal:true as const,solutionId:manifest.solutionId,publisherId:manifest.publisherId,publisherUniqueName:project.solution.publisher.uniqueName,publisherPrefix:project.solution.publisher.prefix,sourceHash:plan.sourceHash,fixtureHash:input.fixtureHash,originalExecutionId:request.executionId,originalOperationId:operation.id,originalPlanHash:plan.contentHash,journalHash:request.journalHash,reconciliationHash:request.reconciliationHash,readbackHash:digest(current),recoveredAt:now.toISOString(),previousRevision:ownership.revision}};
 return {status:'RECOVERY_VERIFIED' as const,classification:'CONFIRMED_SURVIVING_CREATE' as const,tenantMutations:0,receipt};
}

/** Local-only transaction. Reacquire fresh evidence inside the ordinary ownership lock. */
export async function recoverConfirmedCreate(store:LocalStateStore,acquire:()=>Promise<ConfirmedCreateRecoveryInput>){
 return store.withLock(async writer=>{
  const input=await acquire(),ownership=await store.readOwnership();
  if(!ownership||!same(ownership,input.ownership)||store.projectId!==input.project.project.id||!same(store.target,input.plan.target))fail('locked state differs');
  const journalBytes=await readFile(join(store.root,`journal-${z.uuid().parse(input.request.executionId)}.jsonl`),'utf8');
  if(journalBytes!==input.journalBytes||!same(await store.readJournal(input.request.executionId),journalBytes.trim().split('\n').map(l=>JSON.parse(l))))fail('durable local journal differs');
  const review=reviewConfirmedCreateRecovery(input);
  const next=ownershipSchema.parse({...ownership,revision:ownership.revision+1,updatedAt:new Date().toISOString(),resources:[...ownership.resources,review.receipt]});
  await writer.saveOwnership(next);
  return {...review,ownershipRevision:next.revision,localOwnershipReceiptsCreated:1};
 });
}
