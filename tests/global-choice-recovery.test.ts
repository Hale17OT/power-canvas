import {readFileSync} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {resolveSolution} from '../src/solution/resolve.js';
import {certificationPlan} from '../src/solution/certification.js';
import {digest} from '../src/solution/compile.js';
import {authorizeCertification} from '../src/execution/certification.js';
import {matchingState} from './planner-fixtures.js';
import {MODEL_KINDS,MODEL_VERSION,modelResources} from '../src/model-driven/desired.js';
import {desiredResources} from '../src/dataverse/desired.js';
import {canonicalGlobalChoiceName,readGlobalChoice} from '../src/dataverse/global-choice.js';
import {choicePayload,columnPayload,tablePayload,relationshipPayload} from '../src/dataverse/payloads.js';
import {DataverseHttp} from '../src/dataverse/http.js';
import {mutateSchema,type Mutation} from '../src/dataverse/mutations.js';
import {derivePreWriteReadSet} from '../src/execution/attestation.js';
import {verifyPostcondition} from '../src/execution/apply.js';
import {reviewConfirmedCreateRecovery,recoverConfirmedCreate,savedBytesHash,type ConfirmedCreateRecoveryInput} from '../src/execution/confirmed-create-recovery.js';
import {LocalStateStore} from '../src/state/local.js';
import type {JournalEvent,Observation} from '../src/state/models.js';
import {interpretResult} from '../src/agent/routing.js';
import {temporary,clean} from './helpers.js';

const fixture=()=>JSON.parse(readFileSync('tests/fixtures/certification-v21i-source.json','utf8'));
function resign<T extends {contentHash:string}>(v:T){const {contentHash:_hash,...body}=v;void _hash;v.contentHash=digest(body);}
function setup(){
 const raw=fixture(),{project,spec}=resolveSolution(raw),{observation,ownership}=matchingState(project);
 observation.resources=observation.resources.filter(r=>['publisher','solution'].includes(r.kind));ownership.resources=ownership.resources.filter(r=>observation.resources.some(o=>o.resourceId===r.resourceId));
 const solution=observation.resources.find(r=>r.kind==='solution')!,owned=ownership.resources.find(r=>r.resourceId===solution.resourceId)!;solution.properties.displayName='PowerForge Experiment';owned.baseline.displayName='PowerForge Experiment';owned.lastVerifiedHash=digest(owned.baseline);
 observation.coverage=[...new Set([...observation.coverage.map(c=>c.kind),'choice','key',...MODEL_KINDS])].map(kind=>({kind,status:'complete' as const}));observation.providerVersions['model-driven']=MODEL_VERSION;
 const result=certificationPlan(raw,observation,ownership);return {project,fixtureHash:digest(spec),plan:result.native,reviewedPlan:structuredClone(result.native),historical:result.historical,reviewedHistorical:structuredClone(result.historical),observation,ownership,authHealth:'AUTH_HEALTHY',readHealth:'READ_HEALTHY'};
}
function recoveryFixture():ConfirmedCreateRecoveryInput{
 const x=setup(),bundle=authorizeCertification(x),choice=desiredResources(x.project).find(r=>r.kind==='choice')!,op=x.plan.operations.find(o=>o.action==='createChoice')!;
 // Reconstruct the old compiler's provider representation; project/fixture source is unchanged.
 op.after={...op.after!,schemaName:choice.schemaName};delete op.after.optionSetType;delete op.after.isGlobal;
 resign(x.plan);bundle.manifest.planHash=x.plan.contentHash;bundle.manifest.operations.find(o=>o.id===op.id)!.definitionHash=digest(op);resign(bundle.manifest);bundle.receipt.planHash=x.plan.contentHash;bundle.receipt.manifestHash=bundle.manifest.contentHash;resign(bundle.receipt);
 const remoteId=randomUUID(),executionId=randomUUID(),timestamp=new Date(Date.now()-60000).toISOString();
 const events:JournalEvent[]=[];
 for(const status of ['started','remoteSucceeded','failed'] as const)for(const operationId of [op.id,op.id+'/create'])events.push({schemaVersion:1,projectId:x.project.project.id,target:x.plan.target,eventId:randomUUID(),executionId,planId:x.plan.planId,operationId,timestamp,provider:'dataverse',resourceId:op.resourceId,status,verificationResult:status==='failed'?'failed':'notRun',...(status==='remoteSucceeded'?{remoteId,requestId:randomUUID()}:{}),...(status==='failed'?{errorCode:'PF-DV-007'}:{})});
 const journalBytes=events.map(e=>JSON.stringify(e)+'\n').join('');
 x.observation.resources.push({resourceId:choice.resourceId,remoteId,provider:'dataverse',kind:'choice',schemaName:choice.schemaName,properties:{...choice.properties,isManaged:false,customizable:true}});
 x.observation.observedAt=new Date().toISOString();
 const old=structuredClone(x.observation);old.snapshotId=randomUUID();old.observedAt=timestamp;const r=old.resources.find(r=>r.kind==='choice')!;delete r.properties.optionSetType;delete r.properties.isGlobal;
 const reconciliationBytes=JSON.stringify(old)+'\n';
 return {...x,bundle,journalBytes,reconciliationBytes,request:{executionId,operationId:op.id,remoteId,journalHash:savedBytesHash(journalBytes),reconciliationHash:savedBytesHash(reconciliationBytes)}};
}
describe('global choice canonical provider identity',()=>{
 it.each(['pfx_ExperimentCertificationState','ABC_Choice123','a_0','pfx_iI'])('uses invariant ASCII normalization for %s',name=>expect(canonicalGlobalChoiceName(name)).toBe(name.toLowerCase()));
 it.each(['pfx_İ','pfx_ß','pfx_bad-name',' pfx_X','1Name',"pfx_x'",'pfx_é'])('rejects unsupported identifier %s',name=>expect(()=>canonicalGlobalChoiceName(name)).toThrow());
 it('preserves authoring identity and labels, emitting canonical Name and column references',()=>{
  const {project}=setup(),resources=desiredResources(project),choice=resources.find(r=>r.kind==='choice')!;
  expect(choice.schemaName).toBe('pfx_ExperimentCertificationState');expect(choice.properties.schemaName).toBe('pfx_experimentcertificationstate');
  expect(choicePayload({...choice.properties,schemaName:choice.schemaName})).toMatchObject({Name:'pfx_experimentcertificationstate',IsGlobal:true,OptionSetType:'Picklist',DisplayName:{LocalizedLabels:[{Label:'Provider certification state',LanguageCode:1033}]}});
  const column=resources.find(r=>r.properties.globalOptionSetName)!;expect(columnPayload(column.properties)['GlobalOptionSet@odata.bind']).toBe("/GlobalOptionSetDefinitions(Name='pfx_experimentcertificationstate')");
 });
 it('preserves table, relationship, sitemap and AppModule identities',()=>{
  const {project}=setup(),resources=desiredResources(project);
  for(const table of resources.filter(r=>r.kind==='table'))expect(tablePayload(table.properties).SchemaName).toBe(table.schemaName);
  const rel=resources.find(r=>r.kind==='relationship')!;expect(relationshipPayload(rel.properties).SchemaName).toBe('pfx_ExperimentCertificationCategoryProbe');
  for(const r of modelResources(project).filter(r=>['sitemap','app'].includes(r.kind)))expect(String(r.properties.uniqueName)).toMatch(/^pfx_ExperimentCertification/);
 });
 it('uses canonical Name for pre-create attestation, never the authoring case',()=>{
  const set=derivePreWriteReadSet(setup());expect(JSON.stringify(set)).toContain("GlobalOptionSetDefinitions(Name='pfx_experimentcertificationstate')");expect(JSON.stringify(set)).not.toContain("GlobalOptionSetDefinitions(Name='pfx_ExperimentCertificationState')");
 });
 it('reads an owned choice by MetadataId and unowned collision by canonical Name',async()=>{
  const id=randomUUID(),send=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({MetadataId:id,Name:'pfx_case'}))),http=new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/',{token:async()=>'test'},send);
  expect(await readGlobalChoice(http,'pfx_Case',id)).toMatchObject({MetadataId:id});expect(String(send.mock.calls[0]![0])).toContain(`GlobalOptionSetDefinitions(${id})`);
  await readGlobalChoice(http,'pfx_Case');expect(String(send.mock.calls[1]![0])).toContain("GlobalOptionSetDefinitions(Name='pfx_case')");
 });
 it('does not treat arbitrary 404 or missing owned MetadataId as absence',async()=>{
  const send=vi.fn(async()=>new Response(JSON.stringify({error:{code:'0x80040217',message:'absent'}}),{status:404})),http=new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/',{token:async()=>'test'},send);
  expect(await readGlobalChoice(http,'pfx_Case')).toBeUndefined();await expect(readGlobalChoice(http,'pfx_Case',randomUUID())).rejects.toThrow();expect(send).toHaveBeenCalledTimes(2);
  const bad=new DataverseHttp(http.base,{token:async()=>'test'},async()=>new Response('{}',{status:404}));await expect(readGlobalChoice(bad,'pfx_Case')).rejects.toThrow();
 });
 it('binds future global-choice columns to the observed stable MetadataId',async()=>{
  const x=recoveryFixture(),op=x.plan.operations.find(o=>o.after?.globalOptionSetName)!,mutate=vi.fn<Mutation>(async()=>undefined);
  await mutateSchema(x.project,op,x.observation,new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/',{token:async()=>'test'}),mutate);
  expect(mutate.mock.calls[0]![3]).toHaveProperty('GlobalOptionSet@odata.bind',`/GlobalOptionSetDefinitions(${x.request.remoteId})`);
 });
 it.each(['schemaName','optionSetType','isGlobal','options','displayName','solutionMember','isManaged','customizable'])('keeps postcondition %s strict',field=>{
  const x=setup(),spec=desiredResources(x.project).find(r=>r.kind==='choice')!,op=x.plan.operations.find(o=>o.action==='createChoice')!;
  const r:Observation['resources'][number]={...spec,provider:'dataverse',remoteId:randomUUID(),properties:{...spec.properties,isManaged:false,customizable:true}};
  const observation={...x.observation,resources:[...x.observation.resources,r]};expect(verifyPostcondition(op,observation)).toBe(true);
  r.properties[field]=field==='isManaged'?true:field==='customizable'?false:field==='schemaName'?'abc_experimentcertificationstate':null;
  expect(verifyPostcondition(op,observation)).toBe(false);
 });
});

describe('source-bound confirmed CREATE recovery',()=>{
 it('recovers only the normalized surviving choice and produces a 19-operation plan with deferred access with no duplicate/update',()=>{
  const x=recoveryFixture(),review=reviewConfirmedCreateRecovery(x),owned={...x.ownership,revision:x.ownership.revision+1,resources:[...x.ownership.resources,review.receipt]};
  expect(review.classification).toBe('CONFIRMED_SURVIVING_CREATE');expect(review.receipt).toMatchObject({origin:'CREATE_RECOVERY',remoteId:x.request.remoteId,recoveryEvidence:{originalExecutionId:x.request.executionId,originalOperationId:x.request.operationId}});
  const plan=certificationPlan(fixture(),x.observation,owned).native;
  expect(plan.operations).toHaveLength(19);expect(plan.deferred).toHaveLength(1);expect(plan.blockers).toEqual([]);expect(plan.operations.some(o=>o.resourceId===review.receipt.resourceId)).toBe(false);
  expect(plan.operations.filter(o=>o.risk==='securityWrite')).toHaveLength(2);expect(plan.certification!.publishScopes).toEqual([]);
 });
 it('keeps an equivalent unowned choice a collision',()=>{
  const x=recoveryFixture(),plan=certificationPlan(fixture(),x.observation,x.ownership).native;
  expect(plan.blockers).toContainEqual(expect.objectContaining({code:'PF-PLAN-005',resourceId:x.plan.operations.find(o=>o.action==='createChoice')!.resourceId}));
  expect(plan.operations.some(o=>o.action==='createChoice')).toBe(false);
 });
 const invalid:Record<string,(x:ConfirmedCreateRecoveryInput)=>void>={
  'journal missing':x=>{x.journalBytes='';x.request.journalHash=savedBytesHash('');},
  'remoteSucceeded missing':x=>{x.journalBytes=x.journalBytes.replaceAll('remoteSucceeded','started');x.request.journalHash=savedBytesHash(x.journalBytes);},
  'journal byte tampering':x=>{x.journalBytes+='\n';},
  'wrong MetadataId':x=>{x.request.remoteId=randomUUID();},
  'wrong operation':x=>{x.request.operationId='op-wrong';},
  'wrong execution':x=>{x.request.executionId=randomUUID();},
  'wrong source':x=>{x.project.solution.displayName='changed';},
  'wrong fixture':x=>{x.fixtureHash='0'.repeat(64);},
  'wrong ownership revision':x=>{x.ownership.revision++;},
  'changed ownership receipt':x=>{x.ownership.resources[0]!.baseline.prefix='other';},
  'wrong target':x=>{x.observation.target={...x.observation.target,organizationId:randomUUID()};},
  'wrong solution':x=>{x.observation.resources.find(r=>r.kind==='solution')!.remoteId=randomUUID();},
  'wrong publisher':x=>{x.observation.resources.find(r=>r.kind==='publisher')!.properties.prefix='abc';},
  'incomplete reconciliation':x=>{const r=JSON.parse(x.reconciliationBytes);r.coverage[0].status='partial';x.reconciliationBytes=JSON.stringify(r);x.request.reconciliationHash=savedBytesHash(x.reconciliationBytes);},
  'incomplete fresh read':x=>{x.observation.coverage[0]!.status='partial';},
  'missing fresh coverage':x=>{x.observation.coverage=x.observation.coverage.filter(c=>c.kind!=='choice');},
  'same old observation':x=>{x.observation.snapshotId=JSON.parse(x.reconciliationBytes).snapshotId;},
  'stale fresh observation':x=>{x.observation.observedAt=new Date(Date.now()-360000).toISOString();},
  'conflicting local identity':x=>{x.ownership.resources.push({...x.ownership.resources[0]!,resourceId:x.plan.operations.find(o=>o.action==='createChoice')!.resourceId,remoteId:x.request.remoteId});},
  'wrong raw canonical name':x=>{x.observation.resources.find(r=>r.kind==='choice')!.properties.schemaName='pfx_anotherchoiceset';},
  'wrong prefix':x=>{x.observation.resources.find(r=>r.kind==='choice')!.properties.schemaName='abc_experimentcertificationstate';},
  'mixed platform case':x=>{x.observation.resources.find(r=>r.kind==='choice')!.properties.schemaName='pfx_ExperimentCertificationState';},
  'wrong type':x=>{x.observation.resources.find(r=>r.kind==='choice')!.properties.optionSetType='Boolean';},
  'not global':x=>{x.observation.resources.find(r=>r.kind==='choice')!.properties.isGlobal=false;},
  'managed':x=>{x.observation.resources.find(r=>r.kind==='choice')!.properties.isManaged=true;},
  'not customizable':x=>{x.observation.resources.find(r=>r.kind==='choice')!.properties.customizable=false;},
  'missing membership':x=>{x.observation.resources.find(r=>r.kind==='choice')!.properties.solutionMember=false;},
  'wrong display label':x=>{x.observation.resources.find(r=>r.kind==='choice')!.properties.displayName='Changed';},
  'wrong option label':x=>{(x.observation.resources.find(r=>r.kind==='choice')!.properties.options as {value:number;label:string}[])[0]!.label='Changed';},
  'wrong option value':x=>{(x.observation.resources.find(r=>r.kind==='choice')!.properties.options as {value:number;label:string}[])[0]!.value++;},
  'different independently reconciled ID':x=>{const r=JSON.parse(x.reconciliationBytes);r.resources.find((r:{kind:string})=>r.kind==='choice').remoteId=randomUUID();x.reconciliationBytes=JSON.stringify(r);x.request.reconciliationHash=savedBytesHash(x.reconciliationBytes);},
 };
 it.each(Object.keys(invalid))('blocks %s',name=>{const x=recoveryFixture();invalid[name]!(x);expect(()=>reviewConfirmedCreateRecovery(x)).toThrow();});
 it('commits one receipt under the normal lock, preserving journal and previous receipts; repeated recovery fails',async()=>{
  const dir=await temporary();try{
   const x=recoveryFixture(),store=new LocalStateStore(dir,x.project.project.id,x.plan.target);
   await store.withLock(async w=>{await w.saveOwnership(x.ownership);for(const e of x.journalBytes.trim().split('\n'))await w.appendJournal(JSON.parse(e));});
   const path=join(store.root,`journal-${x.request.executionId}.jsonl`),before=await readFile(path,'utf8');
   x.journalBytes=before;x.request.journalHash=savedBytesHash(before);
   const result=await recoverConfirmedCreate(store,async()=>x);expect(result.ownershipRevision).toBe(1);expect(result.localOwnershipReceiptsCreated).toBe(1);
   expect((await store.readOwnership())!.resources.slice(0,-1)).toEqual(x.ownership.resources);expect(await readFile(path,'utf8')).toBe(before);
   await expect(recoverConfirmedCreate(store,async()=>x)).rejects.toThrow();
  }finally{await clean(dir);}
 });
 it('refuses a supplied journal that differs from durable local evidence',async()=>{
  const dir=await temporary();try{const x=recoveryFixture(),store=new LocalStateStore(dir,x.project.project.id,x.plan.target);await store.withLock(w=>w.saveOwnership(x.ownership));await writeFile(join(store.root,`journal-${x.request.executionId}.jsonl`),'\n');await expect(recoverConfirmedCreate(store,async()=>x)).rejects.toThrow();expect((await store.readOwnership())!.revision).toBe(0);}finally{await clean(dir);}
 });
 it('routes confirmed surviving creation to normalization/recovery analysis without authorizing retry',()=>{
  const id=randomUUID();expect(interpretResult({ok:false,creationEvidence:{remoteSucceeded:{remoteId:id},verificationFailed:true,reconciledRemoteId:id}})).toMatchObject({status:'CONFIRMED_SURVIVING_CREATE',autoRetry:false,mutationAuthorized:false,next:'provider-normalization-and-source-bound-recovery-analysis'});
  expect(interpretResult({ok:false,creationEvidence:{remoteSucceeded:{remoteId:id},verificationFailed:true,reconciledRemoteId:randomUUID()}}).status).toBe('BLOCKED');
 });
});
