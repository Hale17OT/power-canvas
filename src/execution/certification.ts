import {plannedPrivileges,resolvedPrivilegeSchema,resolveObservedPrivileges} from '../model-driven/table-privileges.js';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Project} from '../ir/schema.js';
import {planSchema,targetSchema,ownershipSchema,type Plan,type Observation,type Ownership} from '../state/models.js';
import {digest} from '../solution/compile.js';
import {createPlan,fingerprint,projection} from '../planner/dataverse.js';
import {certificationResources,evaluateCertification} from '../planner/certification.js';
import {PowerCanvasError} from '../core/errors.js';

// This is the reviewed V2.1 fixture, not a general Default-environment exception.
export const REVIEWED_CERTIFICATION_FIXTURE='fe458a2acedeb7976cbcfe573e5f28092be818c4ff30f4839701b3b441abaa36';
export const REVIEWED_CERTIFICATION_PROJECT='48351de930c81c819734397639c7fc3bbc698af9b2e47f526c996827d483ed8d';
export const REVIEWED_REMAINING_FIXTURE='ad793eb37812773c04967548a82d4f16f49886ceb8c46cc66059c199657fc4e0';
export const REVIEWED_REMAINING_PROJECT='1379e8d05a8a517bf18cb121a4b483d848f8f093b5566a4469c77c54626d8bc5';
const hash=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1),time=z.iso.datetime();
const deny=(message:string):never=>{throw new PowerCanvasError('PF-CERT-003',message,'Stop certification. Obtain fresh complete evidence and an exact reviewed plan; no wider mutation or automatic retry is authorized.');};
const ownedBase={resourceId:id,remoteId:z.guid(),receiptHash:hash,definitionHash:hash,state:z.literal('OWNED_EXPECTED_STATE')};
const ownedPrerequisiteSchema=z.union([z.strictObject({...ownedBase,canonicalName:z.literal('pfx_experimentcertificationstate')}),z.strictObject({...ownedBase,kind:z.enum(['table','column','key','relationship','role']),schemaName:id,lookupMetadataId:z.guid().optional(),businessUnitId:z.guid().optional()})]);
export const executionManifestSchema=z.strictObject({
 version:z.literal(1),purpose:z.literal('PROVIDER_CERTIFICATION'),evidenceState:z.literal('ATTEMPT_INTENT_ONLY'),
 intentManifestHash:hash,fixtureHash:hash,projectHash:hash,target:targetSchema,solutionId:z.guid(),publisherId:z.guid(),publisherPrefix:z.literal('pfx'),namespace:z.literal('pfx_ExperimentCertification'),
 ownershipRevision:z.int().nonnegative(),ownershipHash:hash,ownershipReceiptHashes:z.array(z.strictObject({resourceId:id,hash})),
 desiredResources:z.array(z.strictObject({resourceId:id,definitionHash:hash,kind:id,identity:id})).length(21),
 operations:z.array(z.strictObject({id,resourceId:id,action:id,risk:z.enum(['additive','securityWrite']),definitionHash:hash,dependsOn:z.array(id)})).min(6).max(21),
 deferred:z.array(z.strictObject({resourceId:id,state:z.literal('DEFERRED_REQUIRES_PUBLICATION'),dependency:id,app:id,reason:z.string()})).max(1).optional(),
 ownedPrerequisites:z.array(ownedPrerequisiteSchema).refine(v=>[1,11,12,14].includes(v.length)).optional(),
 requiredDependencies:z.array(z.strictObject({resourceId:id,remoteId:z.guid(),baselineHash:hash})).length(2),forbiddenResources:z.array(id),
 forbiddenEffects:z.literal('historicalUpdates,deletes,Canvas,Flow,businessData,connectionReferences,environmentVariables,publication,humanAssignments,teamAssignments,authentication,bindingChanges'),
 resolvedTablePrivileges:z.array(resolvedPrivilegeSchema).length(2).optional(),
 expectedPublication:z.array(id).max(0),planHash:hash,planExpiresAt:time,historicalHash:hash,contentHash:hash,
}).refine(v=>v.operations.length===21-(v.ownedPrerequisites?.length??0)-(v.deferred?.length??0),'Operation count must match satisfied roots');
export const executionReceiptSchema=z.strictObject({version:z.literal(1),purpose:z.literal('PROVIDER_CERTIFICATION'),receiptId:z.uuid(),manifestHash:hash,planHash:hash,environmentId:id,targetHash:hash,solutionId:z.guid(),publisherId:z.guid(),ownershipRevision:z.int().nonnegative(),ownershipHash:hash,authorizedOperationIds:z.array(id).min(6).max(21),ownedPrerequisitesHash:hash.optional(),resolvedTablePrivileges:z.array(resolvedPrivilegeSchema).length(2).optional(),authorizedRisks:z.array(z.enum(['additive','securityWrite'])),issuedAt:time,expiresAt:time,contentHash:hash}).refine(v=>v.ownedPrerequisitesHash?[6,7,8,9,10,19,20].includes(v.authorizedOperationIds.length):[20,21].includes(v.authorizedOperationIds.length),'Authorization count must match prerequisite binding');
export type CertificationExecutionBundle={manifest:z.infer<typeof executionManifestSchema>;receipt:z.infer<typeof executionReceiptSchema>};
export interface CertificationExecutionContext {fixtureHash:string;reviewedPlan:Plan;historical:unknown;reviewedHistorical:unknown;authHealth:string;readHealth:string}
export interface CertificationExecutionInput extends CertificationExecutionContext {project:Project;plan:Plan;observation:Observation;ownership:Ownership}
export const certificationPlanSemantics=(plan:Plan)=>({projectId:plan.projectId,target:plan.target,sourceHash:plan.sourceHash,executionPolicy:plan.executionPolicy,operations:plan.operations,deferred:plan.deferred??[],warnings:plan.warnings??[],blockers:plan.blockers,certification:plan.certification});
const hashValid=(value:{contentHash:string})=>{const {contentHash,...body}=value;return contentHash===digest(body);};
export function certificationExecutionManifest(input:CertificationExecutionInput,now=new Date()){
 const {project,observation,ownership}=input,plan=planSchema.parse(input.plan),reviewed=planSchema.parse(input.reviewedPlan),intent=plan.certification?.manifest;
 if(![[REVIEWED_CERTIFICATION_FIXTURE,REVIEWED_CERTIFICATION_PROJECT],[REVIEWED_REMAINING_FIXTURE,REVIEWED_REMAINING_PROJECT]].some(([fixture,source])=>input.fixtureHash===fixture&&digest(project)===source)||!intent||intent.fixtureHash!==input.fixtureHash)deny('Unreviewed certification fixture or resolved source');
 if(!hashValid(plan)||!hashValid(reviewed)||plan.sourceHash!==digest(project)||plan.projectId!==project.project.id||plan.observationHash!==fingerprint(observation)||plan.ownershipRevision!==ownership.revision||digest(plan.target)!==digest(observation.target)||digest(plan.target)!==digest(ownership.target))deny('Changed plan, target, observation or ownership revision');
 if(Date.parse(plan.expiresAt)<=now.getTime()||Date.parse(plan.createdAt)>now.getTime()+60000)deny('Certification plan is expired or from the future');
 if(input.authHealth!=='AUTH_HEALTHY'||!['READ_HEALTHY','READ_DEGRADED_RECOVERED'].includes(input.readHealth)||observation.coverage.some(c=>c.status!=='complete'))deny('Authentication or read observation is incomplete');
 if(digest(plan.executionPolicy)!==digest({environmentType:'Default',mode:'defaultExperiment',nonDisposable:true,modelDriven:true,unified:true}))deny('Certification requires the unchanged non-disposable Default policy');
 if(digest(certificationPlanSemantics(plan))!==digest(certificationPlanSemantics(reviewed))||digest(input.historical)!==digest(input.reviewedHistorical))deny('Fresh certification semantics differ from the accepted review');
 evaluateCertification(project,observation,ownership,intent!);
 const rebuilt=createPlan(project,observation,ownership,'all',new Date(plan.createdAt),plan.executionPolicy,intent);
 if(plan.powercanvasVersion!==rebuilt.powercanvasVersion||digest(plan.providerVersions)!==digest(rebuilt.providerVersions)||digest(certificationPlanSemantics(plan))!==digest(certificationPlanSemantics(rebuilt)))deny('Certification operations differ from the existing deterministic compiler');
 const ownedPrerequisites=certificationOwnedPrerequisites(input);
 if(input.fixtureHash===REVIEWED_REMAINING_FIXTURE&&digest(plan.operations.map(o=>o.action))!==digest([...(ownedPrerequisites.length>=12?[]:['createKey']),...(ownedPrerequisites.length===14?[]:['createRelationship','createRole']),'grantRolePrivileges','createForm','createView','createSitemap','createApp','addAppComponents',...(plan.deferred?.length?[]:['setAppAccess'])]))deny('Remaining certification operation set/order differs');
 if(plan.blockers.length||plan.operations.length!==21-ownedPrerequisites.length-(plan.deferred?.length??0)||intent!.roots.length!==21||intent!.existingDependencies.length!==2||plan.certification!.publishScopes.length||plan.certification!.closure.resourcesToPublish.length||plan.certification!.closure.resourcesToUpdate.length)deny('Certification scope is not the exact create-only review');
 for(const op of plan.operations)if(!intent!.roots.some(r=>r.resourceId===op.resourceId)||!['additive','securityWrite'].includes(op.risk)||op.before!==null||op.classification!=='create'||!intent!.allowedActions.includes(op.action))deny('Operation escapes the authorized certification closure');
 if(plan.deferred?.length&&(plan.deferred.length!==1||!plan.deferred[0]!.resourceId.endsWith(':appAccess:certification')||!plan.deferred[0]!.app.endsWith(':app:certification')))deny('Unreviewed deferred requirement');
 const resources=certificationResources(project),solution=observation.resources.find(r=>r.kind==='solution'&&intent!.existingDependencies.some(d=>d.resourceId===r.resourceId)),publisher=observation.resources.find(r=>r.kind==='publisher'&&intent!.existingDependencies.some(d=>d.resourceId===r.resourceId));
 if(!solution||!publisher||solution.schemaName!=='pfx_PowerForgeExperiment'||solution.properties.displayName!=='PowerForge Experiment'||publisher.schemaName!=='PowerForgeExperimentPublisher'||publisher.properties.prefix!=='pfx')deny('Historical solution or publisher identity differs');
 const grant=plan.operations.find(o=>o.action==='grantRolePrivileges');
 const resolvedTablePrivileges=ownedPrerequisites.length===14?plannedPrivileges(grant!):undefined;
 if(resolvedTablePrivileges&&(resolvedTablePrivileges.some(p=>p.privilegeType!=='Read'||p.depth!=='Basic'||!p.canBeBasic)||digest(resolvedTablePrivileges)!==digest(resolveObservedPrivileges(project,grant!.resourceId,observation))))deny('Stable table privilege bindings differ from the fresh Basic Read plan');
 const body={...(plan.deferred?.length?{deferred:plan.deferred}:{}),...(resolvedTablePrivileges?{resolvedTablePrivileges}:{}),version:1 as const,purpose:'PROVIDER_CERTIFICATION' as const,evidenceState:'ATTEMPT_INTENT_ONLY' as const,intentManifestHash:intent!.contentHash,fixtureHash:input.fixtureHash,projectHash:digest(project),target:plan.target,solutionId:solution!.remoteId,publisherId:publisher!.remoteId,publisherPrefix:'pfx' as const,namespace:'pfx_ExperimentCertification' as const,ownershipRevision:ownership.revision,ownershipHash:digest(ownership),ownershipReceiptHashes:ownership.resources.map(r=>({resourceId:r.resourceId,hash:digest(r)})),desiredResources:intent!.roots.map(r=>{const desired=resources.find(d=>d.resourceId===r.resourceId)!;return {resourceId:r.resourceId,definitionHash:r.definitionHash,kind:desired.kind,identity:desired.schemaName};}),...(ownedPrerequisites.length?{ownedPrerequisites}:{}),operations:plan.operations.map(op=>({id:op.id,resourceId:op.resourceId,action:op.action,risk:op.risk,definitionHash:digest(op),dependsOn:op.dependsOn})),requiredDependencies:intent!.existingDependencies.map(d=>({resourceId:d.resourceId,remoteId:d.remoteId,baselineHash:d.baselineHash})),forbiddenResources:ownership.resources.filter(r=>!intent!.roots.some(root=>root.resourceId===r.resourceId)).map(r=>r.resourceId),forbiddenEffects:'historicalUpdates,deletes,Canvas,Flow,businessData,connectionReferences,environmentVariables,publication,humanAssignments,teamAssignments,authentication,bindingChanges' as const,expectedPublication:[],planHash:plan.contentHash,planExpiresAt:plan.expiresAt,historicalHash:digest(input.historical)};
 return executionManifestSchema.parse({...body,contentHash:digest(body)});
}
export function authorizeCertification(input:CertificationExecutionInput,now=new Date()):CertificationExecutionBundle{
 const manifest=certificationExecutionManifest(input,now),body={...(manifest.resolvedTablePrivileges?{resolvedTablePrivileges:manifest.resolvedTablePrivileges}:{}),version:1 as const,purpose:'PROVIDER_CERTIFICATION' as const,receiptId:randomUUID(),manifestHash:manifest.contentHash,planHash:manifest.planHash,environmentId:manifest.target.environmentId,targetHash:digest(manifest.target),solutionId:manifest.solutionId,publisherId:manifest.publisherId,ownershipRevision:manifest.ownershipRevision,ownershipHash:manifest.ownershipHash,authorizedOperationIds:manifest.operations.map(o=>o.id),...(manifest.ownedPrerequisites?{ownedPrerequisitesHash:digest(manifest.ownedPrerequisites)}:{}),authorizedRisks:[...new Set(manifest.operations.map(o=>o.risk))],issuedAt:now.toISOString(),expiresAt:manifest.planExpiresAt};
 return {manifest,receipt:executionReceiptSchema.parse({...body,contentHash:digest(body)})};
}
export function validateCertificationExecution(bundle:CertificationExecutionBundle,input:CertificationExecutionInput,now=new Date()){
 const manifest=executionManifestSchema.parse(bundle.manifest),receipt=executionReceiptSchema.parse(bundle.receipt),expected=certificationExecutionManifest(input,now);
 if(digest(receipt.resolvedTablePrivileges??null)!==digest(manifest.resolvedTablePrivileges??null)||!hashValid(manifest)||digest(expected)!==digest(manifest)||!hashValid(receipt)||receipt.manifestHash!==manifest.contentHash||receipt.ownedPrerequisitesHash!==(manifest.ownedPrerequisites?digest(manifest.ownedPrerequisites):undefined)||receipt.planHash!==input.plan.contentHash||receipt.targetHash!==digest(input.plan.target)||receipt.environmentId!==input.plan.target.environmentId||receipt.solutionId!==manifest.solutionId||receipt.publisherId!==manifest.publisherId||receipt.ownershipRevision!==input.ownership.revision||receipt.ownershipHash!==digest(input.ownership)||digest(receipt.authorizedOperationIds)!==digest(manifest.operations.map(o=>o.id))||digest(receipt.authorizedRisks)!==digest([...new Set(manifest.operations.map(o=>o.risk))])||receipt.expiresAt!==input.plan.expiresAt||Date.parse(receipt.expiresAt)<=now.getTime()||Date.parse(receipt.issuedAt)>now.getTime()+60000)deny('Certification execution receipt is changed, stale or bound to another plan');
 return manifest;
}

/** Only the reviewed recovered choice may satisfy a root before this continuation. */
export function certificationOwnedPrerequisites(input:CertificationExecutionInput){
 if(input.fixtureHash===REVIEWED_REMAINING_FIXTURE)return remainingOwnedPrerequisites(input);
 const {project,observation,plan}=input,ownership=ownershipSchema.parse(input.ownership),intent=plan.certification?.manifest;
 const resources=certificationResources(project),ownedRoots=ownership.resources.filter(o=>intent?.roots.some(r=>r.resourceId===o.resourceId));
 if(!ownedRoots.length)return [];
 if(ownedRoots.length!==1)deny('Continuation permits only the recovered global-choice root');
 const receipt=ownedRoots[0]!,spec=resources.find(r=>r.resourceId===receipt.resourceId),live=observation.resources.find(r=>r.resourceId===receipt.resourceId),e=receipt.recoveryEvidence;
 if(!spec||spec.kind!=='choice'||spec.schemaName!=='pfx_ExperimentCertificationState'||!live||live.remoteId!==receipt.remoteId||live.kind!=='choice'||live.provider!=='dataverse'||receipt.origin!=='CREATE_RECOVERY'||!e||e.reason!=='POSTCONDITION_PLATFORM_NORMALIZATION'||e.metadataId!==receipt.remoteId||e.canonicalName!=='pfx_experimentcertificationstate'||e.authoringIdentity!==spec.schemaName||e.sourceHash!==plan.sourceHash||e.fixtureHash!==input.fixtureHash||e.publisherUniqueName!==project.solution.publisher.uniqueName||e.publisherPrefix!=='pfx'||e.reason!=='POSTCONDITION_PLATFORM_NORMALIZATION'||e.optionSetType!=='Picklist'||!e.isGlobal||e.displayName!==spec.properties.displayName||digest(e.options)!==digest(spec.properties.options)||e.previousRevision+1!==ownership.revision)deny('Recovered choice provenance differs');
 if(receipt.provider!=='dataverse'||receipt.lastVerifiedHash!==digest(receipt.baseline)||digest(receipt.baseline)!==digest(spec!.properties)||digest(projection(live!,spec!.properties))!==digest(spec!.properties)||live!.properties.isManaged!==false||live!.properties.customizable!==true||plan.operations.some(o=>o.resourceId===receipt.resourceId)||plan.blockers.some(o=>o.resourceId===receipt.resourceId))deny('Recovered global choice must remain an exact owned NO_OP');
 if(!intent!.existingDependencies.some(d=>d.remoteId===e!.solutionId&&resources.find(r=>r.resourceId===d.resourceId)?.kind==='solution')||!intent!.existingDependencies.some(d=>d.remoteId===e!.publisherId&&resources.find(r=>r.resourceId===d.resourceId)?.kind==='publisher'))deny('Recovered choice solution/publisher binding differs');
 return [{resourceId:receipt.resourceId,remoteId:receipt.remoteId,receiptHash:digest(receipt),definitionHash:digest(spec),canonicalName:'pfx_experimentcertificationstate' as const,state:'OWNED_EXPECTED_STATE' as const}];
}

/** Exact V2.1k / V2.1m / V2.1o continuations; not a general partial-apply resume mechanism. */
function remainingOwnedPrerequisites(input:CertificationExecutionInput):z.infer<typeof ownedPrerequisiteSchema>[] {
 const {project,observation,plan}=input,ownership=ownershipSchema.parse(input.ownership),intent=plan.certification?.manifest;
 const finalSeven=ownership.revision===51,withKey=ownership.revision===49||finalSeven;
 const resources=certificationResources(project),expected=resources.filter(r=>['choice','table','column',...(withKey?['key']:[]),...(finalSeven?['relationship','role']:[])].includes(r.kind));
 const owned=ownership.resources.filter(r=>intent?.roots.some(root=>root.resourceId===r.resourceId));
 if(![48,49,51].includes(ownership.revision)||expected.length!==(finalSeven?14:withKey?12:11)||owned.length!==expected.length||expected.some(r=>!owned.some(o=>o.resourceId===r.resourceId)))deny('Remaining certification requires the exact eleven/revision48, twelve/revision49 or fourteen/revision51 roots');
 const dependencies=intent!.existingDependencies,solution=dependencies.find(d=>resources.find(r=>r.resourceId===d.resourceId)?.kind==='solution')!,publisher=dependencies.find(d=>resources.find(r=>r.resourceId===d.resourceId)?.kind==='publisher')!;
 const revisions:number[]=[];
 return expected.map(spec=>{
  const receipt=owned.find(r=>r.resourceId===spec.resourceId)!,live=observation.resources.find(r=>r.resourceId===spec.resourceId);
  if(!live||receipt.provider!==(spec.provider??'dataverse')||live.provider!==(spec.provider??'dataverse')||live.kind!==spec.kind||receipt.remoteId!==live.remoteId||receipt.lastVerifiedHash!==digest(receipt.baseline)||digest(receipt.baseline)!==digest(spec.properties)||digest(projection(live,spec.properties))!==digest(spec.properties)||live.properties.isManaged!==false||spec.kind!=='key'&&live.properties.customizable!==true||plan.operations.some(o=>o.resourceId===spec.resourceId)||plan.blockers.some(o=>o.resourceId===spec.resourceId))deny('Satisfied root must remain exact, owned and NO_OP');
  const base={resourceId:spec.resourceId,remoteId:receipt.remoteId,receiptHash:digest(receipt),definitionHash:digest(spec),state:'OWNED_EXPECTED_STATE' as const};
  if(spec.kind==='choice'){
   const e=receipt.recoveryEvidence;
   if(receipt.origin!=='CREATE_RECOVERY'||!e||e.reason!=='POSTCONDITION_PLATFORM_NORMALIZATION'||e.previousRevision!==37||e.sourceHash!==REVIEWED_CERTIFICATION_PROJECT||e.fixtureHash!==REVIEWED_CERTIFICATION_FIXTURE||e.metadataId!==receipt.remoteId||e.canonicalName!=='pfx_experimentcertificationstate'||e.authoringIdentity!==spec.schemaName||e.reason!=='POSTCONDITION_PLATFORM_NORMALIZATION'||e.solutionId!==solution.remoteId||e.publisherId!==publisher.remoteId||e.publisherPrefix!=='pfx'||e.publisherUniqueName!==project.solution.publisher.uniqueName||e.displayName!==spec.properties.displayName||digest(e.options)!==digest(spec.properties.options)||e.optionSetType!=='Picklist'||!e.isGlobal)deny('Original recovered-choice provenance changed');
   return {...base,canonicalName:'pfx_experimentcertificationstate' as const};
  }
  if(spec.kind==='key'){
   const e=receipt.recoveryEvidence,parent=observation.resources.find(r=>r.kind==='table'&&r.schemaName===spec.properties.tableSchemaName);
   if(receipt.origin!=='CREATE_RECOVERY'||!e||e.reason!=='POSTCONDITION_PLATFORM_MANAGED_PROPERTY'||e.previousRevision!==48||e.metadataId!=='c86cc458-b4b8-f111-aaaf-70a8a57ac7d9'||e.metadataId!==receipt.remoteId||e.originalExecutionId!=='5626100b-6011-40e8-8e56-4d25f0401834'||e.originalOperationId!=='op-8d66822a41c09863ef2e19f0'||e.originalPlanHash!=='1b11e8b1b75303b980483a0133eab45c672efc53b49d9120641ec70f1fd673df'||e.journalHash!=='22a98621665a03524ea873cb01404ce051fcdd1b2d5cfbff7dc771af4ad8a30d'||e.sourceHash!==REVIEWED_REMAINING_PROJECT||e.fixtureHash!==REVIEWED_REMAINING_FIXTURE||e.authoringIdentity!==spec.schemaName||e.displayName!==spec.properties.displayName||digest(e.keyAttributes)!==digest(spec.properties.columns)||e.indexStatus!=='Active'||e.isManaged!==false||!e.solutionMember||e.solutionId!==solution.remoteId||e.publisherId!==publisher.remoteId||e.publisherUniqueName!==project.solution.publisher.uniqueName||e.publisherPrefix!=='pfx'||!parent||e.parentMetadataId!==parent.remoteId||e.parentSchemaName!==parent.schemaName||e.entityLogicalName!==spec.properties.entityLogicalName||live!.properties.parentMetadataId!==parent.remoteId||live!.properties.parentEntityLogicalName!==e.entityLogicalName)deny('Recovered key provenance or defining identity changed');
   return {...base,kind:'key' as const,schemaName:spec.schemaName};
  }
  if(spec.kind==='relationship'||spec.kind==='role'){
   const role=spec.kind==='role',e=receipt.certificationEvidence,action=role?'createRole':'createRelationship',operationId=`op-${digest({resource:spec.resourceId,action,before:null,after:spec.properties}).slice(0,24)}`;
   if(!finalSeven||receipt.origin==='CREATE_RECOVERY'||!e||e.sourceHash!==REVIEWED_REMAINING_PROJECT||e.planHash!=='242882f45d0eda6e857d8245daf5294dde8dbd7f5ac3ff172d1a43afaef72a3d'||e.solutionId!==solution.remoteId||e.publisherId!==publisher.remoteId||e.publisherPrefix!=='pfx'||e.creationOperationId!==operationId||e.revision!==(role?51:50)||receipt.remoteId!==(role?'a0032113-bbb8-f111-aaaf-70a8a57ac7d9':'cf0ad8e0-bab8-f111-aaaf-70a8a57ac7d9'))deny('V2.1m relationship/role provenance changed');
   return {...base,kind:spec.kind,schemaName:spec.schemaName,...(role?{businessUnitId:'70e4e6f6-08e6-ed11-a7c5-000d3a69ed75'}:{lookupMetadataId:'9a96edb5-d882-426f-b728-012fbbefbc69'})};
  }
  const e=receipt.certificationEvidence,action=spec.kind==='table'?'createTable':'createColumn',operationId=`op-${digest({resource:spec.resourceId,action,before:null,after:spec.properties}).slice(0,24)}`;
  if(receipt.origin==='CREATE_RECOVERY'||!e||e.sourceHash!==REVIEWED_CERTIFICATION_PROJECT||e.solutionId!==solution.remoteId||e.publisherId!==publisher.remoteId||e.publisherPrefix!=='pfx'||e.creationOperationId!==operationId||e.revision<39||e.revision>48)deny('Existing table/column creation provenance changed');
  revisions.push(e!.revision);if(new Set(revisions).size!==revisions.length)deny('Duplicate receipt revisions');
  return {...base,kind:spec.kind as 'table'|'column',schemaName:spec.schemaName};
 });
}
