import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {desiredResources} from '../dataverse/desired.js';
import {journalEventSchema,observationSchema,ownershipSchema,planSchema} from '../state/models.js';
import type {LocalStateStore} from '../state/local.js';
import {digest} from '../solution/compile.js';
import {projection} from '../planner/dataverse.js';
import {verifyPostcondition} from './apply.js';
import {executionManifestSchema,executionReceiptSchema,REVIEWED_REMAINING_FIXTURE,REVIEWED_REMAINING_PROJECT} from './certification.js';
import {savedBytesHash,type ConfirmedCreateRecoveryInput} from './confirmed-create-recovery.js';
import {PowerCanvasError} from '../core/errors.js';

const same=(a:unknown,b:unknown)=>digest(a)===digest(b);
const sealed=(v:{contentHash:string})=>{const {contentHash,...body}=v;return contentHash===digest(body);};
function fail(message:string):never{throw new PowerCanvasError('PF-SAFETY-006','RECOVERY_BLOCKED: '+message,'Preserve the key and original journal; no tenant write or generic adoption is authorized.');}

/** Closed V2.1l local recovery policy for the one confirmed V2.1k key create. */
export function reviewConfirmedKeyRecovery(input:ConfirmedCreateRecoveryInput,now=new Date()){
 const {project,request}=input,plan=planSchema.parse(input.plan),ownership=ownershipSchema.parse(input.ownership);
 const manifest=executionManifestSchema.parse(input.bundle.manifest),receipt=executionReceiptSchema.parse(input.bundle.receipt);
 if(request.executionId!=='5626100b-6011-40e8-8e56-4d25f0401834'||request.remoteId!=='c86cc458-b4b8-f111-aaaf-70a8a57ac7d9'||request.operationId!=='op-8d66822a41c09863ef2e19f0')fail('original execution/operation/MetadataId differs');
 if(input.fixtureHash!==REVIEWED_REMAINING_FIXTURE||digest(project)!==REVIEWED_REMAINING_PROJECT||manifest.fixtureHash!==input.fixtureHash||manifest.projectHash!==digest(project)||plan.sourceHash!==digest(project))fail('source/fixture differs');
 if(!sealed(plan)||!sealed(manifest)||!sealed(receipt)||manifest.planHash!==plan.contentHash||receipt.planHash!==plan.contentHash||receipt.manifestHash!==manifest.contentHash||receipt.targetHash!==digest(plan.target)||receipt.environmentId!==plan.target.environmentId||receipt.solutionId!==manifest.solutionId||receipt.publisherId!==manifest.publisherId)fail('historical evidence integrity differs');
 if(ownership.revision!==48||!same(plan.target,ownership.target)||!same(plan.target,manifest.target)||plan.projectId!==project.project.id||ownership.projectId!==project.project.id||plan.ownershipRevision!==ownership.revision||manifest.ownershipRevision!==ownership.revision||manifest.ownershipHash!==digest(ownership)||receipt.ownershipHash!==digest(ownership)||receipt.ownershipRevision!==ownership.revision)fail('ownership baseline/target differs');
 if(!same(manifest.ownershipReceiptHashes,ownership.resources.map(r=>({resourceId:r.resourceId,hash:digest(r)}))))fail('prior receipts differ');
 const operation=plan.operations.find(o=>o.id===request.operationId),desired=desiredResources(project).find(r=>r.resourceId===operation?.resourceId);
 if(!operation||operation.action!=='createKey'||operation.provider!=='dataverse'||operation.before!==null||desired?.kind!=='key'||desired.schemaName!=='pfx_ExperimentCertificationExternalCodeKey'||!same(operation.after,desired.properties)||!manifest.desiredResources.some(r=>r.resourceId===desired.resourceId&&r.identity===desired.schemaName)||!manifest.operations.some(o=>o.id===operation.id&&o.definitionHash===digest(operation))||!receipt.authorizedOperationIds.includes(operation.id))fail('exact key CREATE contract differs');
 if(ownership.resources.some(r=>r.resourceId===operation.resourceId||r.remoteId===request.remoteId))fail('conflicting receipt already exists');
 if(savedBytesHash(input.journalBytes)!==request.journalHash||savedBytesHash(input.reconciliationBytes)!==request.reconciliationHash||!input.journalBytes.endsWith('\n'))fail('saved evidence bytes differ');
 const events=input.journalBytes.trim().split('\n').map(line=>journalEventSchema.parse(JSON.parse(line)));
 if(events.length!==6||events.some(e=>e.executionId!==request.executionId||e.planId!==plan.planId||e.resourceId!==operation.resourceId||e.projectId!==project.project.id||!same(e.target,plan.target)||e.provider!=='dataverse'))fail('journal provenance differs');
 for(const id of [operation.id,operation.id+'/create']){
  const sequence=events.filter(e=>e.operationId===id);
  if(sequence.length!==3||sequence[0]?.status!=='started'||sequence[1]?.status!=='remoteSucceeded'||sequence[1]?.remoteId!==request.remoteId||sequence[2]?.status!=='failed'||sequence[2]?.errorCode!=='PF-DV-007'||sequence[2]?.verificationResult!=='failed'||id.endsWith('/create')&&!sequence[1]?.requestId||sequence.some((e,i)=>i>0&&e.timestamp<sequence[i-1]!.timestamp))fail('missing confirmed create then verification stop');
 }
 const old=observationSchema.parse(JSON.parse(input.reconciliationBytes)),fresh=observationSchema.parse(input.observation);
 const kinds=['publisher','solution','table','column','relationship','choice','key','form','view','sitemap','app','role','rolePermissions','appComponents','appAccess'];
 for(const observed of [old,fresh]){
  if(!same(observed.target,plan.target)||observed.projectId!==project.project.id||observed.coverage.some(c=>c.status!=='complete')||kinds.some(kind=>!observed.coverage.some(c=>c.kind===kind&&c.status==='complete')))fail('observation incomplete or wrong target');
  const key=observed.resources.find(r=>r.resourceId===operation.resourceId);
  if(!key||key.remoteId!==request.remoteId||key.kind!=='key'||key.provider!=='dataverse'||key.schemaName!==desired.schemaName||key.properties.isManaged!==false)fail('key identity/managed state differs');
  const expected=observed===fresh?desired.properties:{...desired.properties,indexStatus:'Pending'};
  if(!same(projection(key,expected),expected))fail('defining metadata, membership or index status differs');
  for(const previous of ownership.resources){
   const live=observed.resources.find(r=>r.resourceId===previous.resourceId);
   // Historical form diagnostics are preserved; only the reviewed prerequisites bind recovery.
   const required=manifest.ownedPrerequisites?.some(r=>r.resourceId===previous.resourceId)||[manifest.solutionId,manifest.publisherId].includes(previous.remoteId);
   if(required&&(!live||live.remoteId!==previous.remoteId||!same(projection(live,previous.baseline),previous.baseline)||live.properties.isManaged!==false||live.properties.customizable!==true))fail('existing owned dependency differs');
  }
  const solution=observed.resources.find(r=>r.kind==='solution'&&r.remoteId===manifest.solutionId),publisher=observed.resources.find(r=>r.kind==='publisher'&&r.remoteId===manifest.publisherId);
  if(solution?.schemaName!==project.solution.uniqueName||publisher?.schemaName!==project.solution.publisher.uniqueName||publisher.properties.prefix!==manifest.publisherPrefix||manifest.publisherPrefix!=='pfx')fail('solution/publisher identity differs');
 }
 if(fresh.snapshotId===old.snapshotId||Date.parse(fresh.observedAt)<=Date.parse(old.observedAt)||now.getTime()-Date.parse(fresh.observedAt)>300000||Date.parse(fresh.observedAt)>now.getTime()+60000)fail('readback stale or not independent');
 if(!verifyPostcondition(operation,fresh))fail('strict defining verification failed');
 const key=fresh.resources.find(r=>r.resourceId===operation.resourceId)!,parent=fresh.resources.find(r=>r.kind==='table'&&r.schemaName===desired.properties.tableSchemaName),ownedParent=ownership.resources.find(r=>r.resourceId===parent?.resourceId);
 if(!parent||!ownedParent||parent.remoteId!==ownedParent.remoteId||key.properties.parentMetadataId!==parent.remoteId||key.properties.parentEntityLogicalName!==desired.properties.entityLogicalName)fail('exact parent MetadataId differs');
 const isCustomizable=z.strictObject({Value:z.boolean(),CanBeChanged:z.boolean(),ManagedPropertyLogicalName:z.string()}).parse(key.properties.isCustomizable);
 const recovered={resourceId:operation.resourceId,remoteId:request.remoteId,provider:'dataverse',ownedPaths:Object.keys(desired.properties),baseline:desired.properties,lastVerifiedHash:digest(desired.properties),origin:'CREATE_RECOVERY' as const,
  recoveryEvidence:{reason:'POSTCONDITION_PLATFORM_MANAGED_PROPERTY' as const,metadataId:request.remoteId,authoringIdentity:desired.schemaName,displayName:String(desired.properties.displayName),keyAttributes:z.array(z.string()).parse(desired.properties.columns),indexStatus:'Active' as const,isManaged:false as const,parentMetadataId:parent.remoteId,parentSchemaName:parent.schemaName,entityLogicalName:String(desired.properties.entityLogicalName),solutionMember:true as const,isCustomizable,solutionId:manifest.solutionId,publisherId:manifest.publisherId,publisherUniqueName:project.solution.publisher.uniqueName,publisherPrefix:manifest.publisherPrefix,sourceHash:plan.sourceHash,fixtureHash:input.fixtureHash,originalExecutionId:request.executionId,originalOperationId:operation.id,originalPlanHash:plan.contentHash,journalHash:request.journalHash,reconciliationHash:request.reconciliationHash,readbackHash:digest(key),recoveredAt:now.toISOString(),previousRevision:ownership.revision}};
 return {status:'RECOVERY_VERIFIED' as const,classification:'CONFIRMED_SURVIVING_CREATE' as const,tenantMutations:0,receipt:recovered};
}

/** Acquires fresh evidence under the existing writer lock; only local ownership is written. */
export async function recoverConfirmedKey(store:LocalStateStore,acquire:()=>Promise<ConfirmedCreateRecoveryInput>){
 return store.withLock(async writer=>{
  const input=await acquire(),ownership=await store.readOwnership();
  if(!ownership||!same(ownership,input.ownership)||store.projectId!==input.project.project.id||!same(store.target,input.plan.target))fail('locked state differs');
  const bytes=await readFile(join(store.root,`journal-${z.uuid().parse(input.request.executionId)}.jsonl`),'utf8');
  if(bytes!==input.journalBytes||!same(await store.readJournal(input.request.executionId),bytes.trim().split('\n').map(l=>JSON.parse(l))))fail('durable journal differs');
  const review=reviewConfirmedKeyRecovery(input);
  await writer.saveOwnership(ownershipSchema.parse({...ownership,revision:ownership.revision+1,updatedAt:new Date().toISOString(),resources:[...ownership.resources,review.receipt]}));
  return {...review,ownershipRevision:ownership.revision+1,localOwnershipReceiptsCreated:1};
 });
}
