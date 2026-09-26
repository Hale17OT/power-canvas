import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {resolveSolution} from '../src/solution/resolve.js';
import {certificationPlan} from '../src/solution/certification.js';
import {digest} from '../src/solution/compile.js';
import {authorizeCertification,validateCertificationExecution,type CertificationExecutionInput} from '../src/execution/certification.js';
import {matchingState} from './planner-fixtures.js';
import {MODEL_KINDS,MODEL_VERSION} from '../src/model-driven/desired.js';
import {desiredResources} from '../src/dataverse/desired.js';
import {certificationResources} from '../src/planner/certification.js';
import {attestPreWrite,derivePreWriteReadSet,requireAttestationPass} from '../src/execution/attestation.js';
import {choicePayload} from '../src/dataverse/payloads.js';
import {DataverseHttp} from '../src/dataverse/http.js';
import {mutateSchema} from '../src/dataverse/mutations.js';
import {SCHEMA_PRIVILEGES,MODEL_PRIVILEGES} from '../src/dataverse/preflight.js';
import {certificationIdentityReadback} from '../src/dataverse/certification-readback.js';
import {applyPlan} from '../src/execution/apply.js';
import {LocalStateStore} from '../src/state/local.js';
import {temporary,clean} from './helpers.js';

function setup():CertificationExecutionInput{
 const raw=JSON.parse(readFileSync('tests/fixtures/certification-v21i-source.json','utf8')),{project,spec}=resolveSolution(raw),{observation,ownership}=matchingState(project);
 observation.resources=observation.resources.filter(r=>['publisher','solution','choice'].includes(r.kind));ownership.resources=ownership.resources.filter(r=>observation.resources.some(o=>o.resourceId===r.resourceId));
 const solution=observation.resources.find(r=>r.kind==='solution')!,publisher=observation.resources.find(r=>r.kind==='publisher')!,owned=ownership.resources.find(r=>r.resourceId===solution.resourceId)!;solution.properties.displayName='PowerForge Experiment';owned.baseline.displayName='PowerForge Experiment';owned.lastVerifiedHash=digest(owned.baseline);
 observation.coverage=[...new Set([...observation.coverage.map(c=>c.kind),'choice','key',...MODEL_KINDS])].map(kind=>({kind,status:'complete' as const}));observation.providerVersions['model-driven']=MODEL_VERSION;
 const choice=ownership.resources.find(r=>r.resourceId.includes(':choice:'))!;choice.origin='CREATE_RECOVERY';choice.recoveryEvidence={reason:'POSTCONDITION_PLATFORM_NORMALIZATION',metadataId:choice.remoteId,canonicalName:'pfx_experimentcertificationstate',authoringIdentity:'pfx_ExperimentCertificationState',displayName:'Provider certification state',options:[{value:731420100,label:'Draft'},{value:731420101,label:'Active'},{value:731420102,label:'Closed'}],optionSetType:'Picklist',isGlobal:true,solutionId:solution.remoteId,publisherId:publisher.remoteId,publisherUniqueName:project.solution.publisher.uniqueName,publisherPrefix:'pfx',sourceHash:digest(project),fixtureHash:digest(spec),originalExecutionId:randomUUID(),originalOperationId:'op-original-create',originalPlanHash:'a'.repeat(64),journalHash:'b'.repeat(64),reconciliationHash:'c'.repeat(64),readbackHash:'d'.repeat(64),recoveredAt:new Date().toISOString(),previousRevision:0};ownership.revision=1;
 const result=certificationPlan(raw,observation,ownership);return {project,fixtureHash:digest(spec),plan:result.native,reviewedPlan:structuredClone(result.native),historical:result.historical,reviewedHistorical:structuredClone(result.historical),observation,ownership,authHealth:'AUTH_HEALTHY',readHealth:'READ_HEALTHY'};
}
function backend(x:CertificationExecutionInput,change?:(path:string,value:Record<string,unknown>)=>unknown){
 const reads=derivePreWriteReadSet(x),privileges=[...SCHEMA_PRIVILEGES,...MODEL_PRIVILEGES].map(name=>({name,privilegeid:randomUUID()}));
 const send=vi.fn<typeof fetch>(async(url,init)=>{
  expect(init?.method).toBe('GET');const u=new URL(String(url)),path=decodeURIComponent(u.pathname.split('/v9.2/')[1]!+u.search),dep=reads.dependencies.find(r=>r.path===path);
  let value:Record<string,unknown>={value:[]};
  if(dep?.comparison==='GLOBAL_CHOICE'){const r=x.observation.resources.find(r=>r.kind==='choice')!;value={...choicePayload(r.properties),MetadataId:r.remoteId,IsManaged:false,IsCustomizable:{Value:true}};}
  else if(dep)value={value:[dep.expected]};
  else if(path.startsWith('privileges?'))value={value:privileges};
  else if(path.startsWith('systemusers('))value={RolePrivileges:privileges.map(p=>({PrivilegeId:p.privilegeid}))};
  else if(path.startsWith('organizations('))value={languagecode:1033};
  else if(path.startsWith('businessunits?'))value={value:[{businessunitid:randomUUID()}]};
  return new Response(JSON.stringify(change?.(path,value)??value));
 });
 return {send,http:new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/',{token:async()=>'test'},send,{readOnly:true})};
}
const options=(x:CertificationExecutionInput)=>({ownership:async()=>x.ownership,verifyTarget:async()=>({target:x.plan.target,principalId:randomUUID(),authStatus:'AUTH_HEALTHY'})});
describe('certification continuation from recovered choice',()=>{
 it('authorizes 19 executable operations with access deferred and binds the owned NO_OP prerequisite',()=>{
  const x=setup(),bundle=authorizeCertification(x);expect(x.plan.operations).toHaveLength(19);expect(x.plan.operations.some(o=>o.action==='createChoice')).toBe(false);expect(bundle.manifest.ownedPrerequisites).toHaveLength(1);expect(bundle.manifest.ownedPrerequisites![0]!.state).toBe('OWNED_EXPECTED_STATE');expect(bundle.receipt.ownedPrerequisitesHash).toBe(digest(bundle.manifest.ownedPrerequisites));expect(bundle.receipt.authorizedOperationIds).toHaveLength(19);expect(()=>validateCertificationExecution(bundle,x)).not.toThrow();
 });
 it.each(['receipt','observed ID','options','membership','source provenance','publisher','revision','choice mutation'])('rejects changed %s',change=>{
  const x=setup(),bundle=authorizeCertification(x),choice=x.observation.resources.find(r=>r.kind==='choice')!,receipt=x.ownership.resources.find(r=>r.resourceId===choice.resourceId)!;
  if(change==='receipt')receipt.origin=undefined as never;
  if(change==='observed ID')choice.remoteId=randomUUID();
  if(change==='options')choice.properties.options=[];
  if(change==='membership')choice.properties.solutionMember=false;
  if(change==='source provenance')receipt.recoveryEvidence!.sourceHash='e'.repeat(64);
  if(change==='publisher')receipt.recoveryEvidence!.publisherId=randomUUID();
  if(change==='revision')x.ownership.revision++;
  if(change==='choice mutation')x.plan.operations[0]!.resourceId=choice.resourceId;
  expect(()=>validateCertificationExecution(bundle,x)).toThrow();
 });
 it('rejects a stripped prerequisite authorization and any old receipt',()=>{
  const x=setup(),b=authorizeCertification(x);delete b.receipt.ownedPrerequisitesHash;expect(()=>validateCertificationExecution(b,x)).toThrow();const old=authorizeCertification(x);old.receipt.expiresAt=new Date(0).toISOString();expect(()=>validateCertificationExecution(old,x)).toThrow();
 });
 it('attests the owned choice with exact MetadataId and solution membership, never ABSENT',async()=>{
  const x=setup(),b=backend(x),result=await attestPreWrite(x,b.http,options(x));requireAttestationPass(result.attestation,result.readSet);
  expect(result.readSet.dependencies.filter(d=>d.purpose==='OWNED_EXPECTED_STATE')).toHaveLength(2);expect(result.readSet.operations.some(o=>o.kind==='choice')).toBe(false);expect(result.attestation.expectedAbsenceResponses).toBe(0);expect(b.send).toHaveBeenCalledTimes(20);
 });
 it.each(['Name','MetadataId','Options','IsGlobal','OptionSetType','IsManaged','IsCustomizable','DisplayName','membership'])('stops for live recovered-choice drift in %s',field=>{
  const x=setup(),b=backend(x,(path,value)=>{if(field==='membership'&&path.startsWith('solutioncomponents?'))return {value:[]};if(path.startsWith('GlobalOptionSetDefinitions('))return {...value,[field]:field==='MetadataId'?randomUUID():field==='Options'?[]:field==='IsManaged'?true:field==='IsCustomizable'?{Value:false}:'different'};});
  return attestPreWrite(x,b.http,options(x)).then(r=>{expect(r.attestation.result).not.toBe('PASS');expect(()=>requireAttestationPass(r.attestation,r.readSet)).toThrow();});
 });
 it('stops for an absent owned choice instead of treating it as create absence',async()=>{
  const x=setup(),b=backend(x),send:typeof fetch=async(url,init)=>String(url).includes('GlobalOptionSetDefinitions(')?new Response(JSON.stringify({error:{code:'0x80040217',message:'not found'}}),{status:404}):b.send(url,init);
  const http=new DataverseHttp(b.http.base,{token:async()=>'test'},send,{readOnly:true}),r=await attestPreWrite(x,http,options(x));expect(r.attestation.result).not.toBe('PASS');expect(r.attestation.expectedAbsenceResponses).toBe(0);
 });
 it('executes only remaining primitives and preserves the recovered receipt through draft convergence with access deferred',async()=>{
  const directory=await temporary();try{
   const x=setup(),bundle=authorizeCertification(x),store=new LocalStateStore(directory,x.project.project.id,x.plan.target),choice=x.ownership.resources.find(r=>r.origin==='CREATE_RECOVERY')!,observed=structuredClone(x.observation),resources=certificationResources(x.project);
   await store.withLock(async w=>{await w.saveOwnership({...x.ownership,revision:0,resources:x.ownership.resources.filter(r=>r!==choice)});await w.saveOwnership(x.ownership);});
   const calls:string[]=[];
   const result=await applyPlan(x.project,x.plan,store,{verifyTarget:async()=>undefined,observe:async()=>structuredClone(observed),membership:async()=>undefined,apply:async(op,_current,mutate)=>{calls.push(op.action);await mutate('create','synthetic','POST',{});const spec=resources.find(r=>r.resourceId===op.resourceId)!;observed.resources.push({resourceId:spec.resourceId,kind:spec.kind,schemaName:spec.schemaName,provider:op.provider,remoteId:randomUUID(),properties:{...op.after!,...(op.action==='createColumn'?{logicalName:String(op.after!.schemaName).toLowerCase()}:{}),isManaged:false,customizable:true}});},request:async()=>({requestId:randomUUID()})},async()=>undefined,{...x,bundle});
   expect(result.ok).toBe(false);expect(result.error?.message).toContain('not a semantic no-op');expect(result.completed).toHaveLength(19);expect(calls).not.toContain('createChoice');expect((await store.readOwnership())!.resources.find(r=>r.resourceId===choice.resourceId)).toEqual(choice);
  }finally{await clean(directory);}
 });
 it('preserves ten verified roots and stops without retry on a deterministic key rejection',async()=>{
  const directory=await temporary();try{
   const x=setup(),bundle=authorizeCertification(x),store=new LocalStateStore(directory,x.project.project.id,x.plan.target),choice=x.ownership.resources.find(r=>r.origin==='CREATE_RECOVERY')!,observed=structuredClone(x.observation),resources=certificationResources(x.project),attempted:string[]=[];
   await store.withLock(async w=>{await w.saveOwnership({...x.ownership,revision:0,resources:x.ownership.resources.filter(r=>r!==choice)});await w.saveOwnership(x.ownership);});
   const send=vi.fn<typeof fetch>(async(_url,init)=>{
    expect(init?.method).toBe('POST');
    const body=JSON.parse(String(init?.body));expect(body).toMatchObject({SchemaName:'pfx_ExperimentCertificationExternalCodeKey',KeyAttributes:['pfx_experimentcertificationexternalcode']});
    expect(body.DisplayName.LocalizedLabels[0].LanguageCode).toBe(1033);
    return new Response(JSON.stringify({error:{code:'0x80040203',message:'Entity Key DisplayName not specified'}}),{status:400});
   });
   const http=new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/',{token:async()=>'test'},send);
   const result=await applyPlan(x.project,x.plan,store,{verifyTarget:async()=>undefined,observe:async()=>structuredClone(observed),membership:async()=>undefined,
    apply:async(op,current,mutate)=>{attempted.push(op.action);if(op.action==='createKey'){await mutateSchema(x.project,op,current,http,mutate);return;}await mutate('create','synthetic','POST',{});const spec=resources.find(r=>r.resourceId===op.resourceId)!;observed.resources.push({resourceId:spec.resourceId,kind:spec.kind,schemaName:spec.schemaName,provider:op.provider,remoteId:randomUUID(),properties:{...op.after!,...(op.action==='createColumn'?{logicalName:String(op.after!.schemaName).toLowerCase()}:{}),isManaged:false,customizable:true}});},
    request:async(path,method,body,headers)=>path==='synthetic'?{requestId:randomUUID()}:http.request(path,method,body,headers)},async()=>undefined,{...x,bundle});
   expect(result.ok).toBe(false);expect(result.completed).toHaveLength(10);expect(result.failedOperation).toBe(x.plan.operations.find(o=>o.action==='createKey')!.id);expect(result.error?.code).toBe('PF-DV-001');expect(send).toHaveBeenCalledTimes(1);expect(attempted).toHaveLength(11);
   const owned=await store.readOwnership();expect(owned!.revision).toBe(x.ownership.revision+10);expect(owned!.resources.some(r=>r.resourceId.includes(':key:'))).toBe(false);
   const journal=await store.readJournal(result.executionId);expect(journal.some(e=>e.status==='outcomeUnknown')).toBe(false);expect(journal.filter(e=>e.operationId===result.failedOperation).map(e=>e.status)).toEqual(['started','failed']);
  }finally{await clean(directory);}
 });
});
describe('additional certification identity readback',()=>{
 it.each([false,true])('verifies exact table/primary identities and rejects a changed primary: %s',wrong=>{
  const x=setup(),op=x.plan.operations.find(o=>o.action==='createTable')!,spec=desiredResources(x.project).find(r=>r.resourceId===op.resourceId)!,id=randomUUID(),primary=spec.properties.primaryColumn as {schemaName:string};
  x.observation.resources.push({...spec,provider:'dataverse',remoteId:id});
  const http=new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/',{token:async()=>'test'},async(url)=>new Response(JSON.stringify(String(url).includes('/Attributes')?{MetadataId:randomUUID(),SchemaName:primary.schemaName,LogicalName:primary.schemaName.toLowerCase(),IsPrimaryName:!wrong}:{MetadataId:id,SchemaName:spec.schemaName,LogicalName:spec.schemaName.toLowerCase(),EntitySetName:spec.schemaName.toLowerCase()+'s',OwnershipType:'UserOwned',PrimaryNameAttribute:primary.schemaName.toLowerCase()})),{readOnly:true});
  const read=certificationIdentityReadback(op,x.observation,http);return wrong?expect(read).rejects.toThrow():expect(read).resolves.toMatchObject({kind:'TABLE_IDENTITY',metadataId:id});
 });
 it.each([false,true])('checks the State column against the recovered option-set GUID: wrong=%s',wrong=>{
  const x=setup(),op=x.plan.operations.find(o=>o.after?.globalOptionSetName)!,spec=desiredResources(x.project).find(r=>r.resourceId===op.resourceId)!,id=randomUUID(),choice=x.observation.resources.find(r=>r.kind==='choice')!;x.observation.resources.push({...spec,provider:'dataverse',remoteId:id});
  const http=new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/',{token:async()=>'test'},async()=>new Response(JSON.stringify({MetadataId:id,OptionSet:{MetadataId:wrong?randomUUID():choice.remoteId,Name:choice.properties.schemaName,IsGlobal:true}})),{readOnly:true});
  const read=certificationIdentityReadback(op,x.observation,http);return wrong?expect(read).rejects.toThrow():expect(read).resolves.toMatchObject({kind:'GLOBAL_CHOICE_BINDING',globalChoiceMetadataId:choice.remoteId});
 });
});
