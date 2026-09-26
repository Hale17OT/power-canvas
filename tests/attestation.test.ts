import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {resolveSolution} from '../src/solution/resolve.js';
import {certificationPlan} from '../src/solution/certification.js';
import {digest} from '../src/solution/compile.js';
import {authorizeCertification,type CertificationExecutionInput} from '../src/execution/certification.js';
import {attestPreWrite,derivePreWriteReadSet,preWriteStrategy,requireAttestationPass} from '../src/execution/attestation.js';
import {matchingState} from './planner-fixtures.js';
import {MODEL_KINDS,MODEL_VERSION} from '../src/model-driven/desired.js';
import {certificationResources} from '../src/planner/certification.js';
import {DataverseHttp} from '../src/dataverse/http.js';
import {SCHEMA_PRIVILEGES,MODEL_PRIVILEGES} from '../src/dataverse/preflight.js';
import {LocalStateStore} from '../src/state/local.js';
import {applyPlan} from '../src/execution/apply.js';
import {temporary,clean} from './helpers.js';
import {commandManifest} from '../src/agent/commands.js';
import {createProgram} from '../src/cli/program.js';

function setup():CertificationExecutionInput{
 const raw=JSON.parse(readFileSync('tests/fixtures/certification-v21i-source.json','utf8')),{project,spec}=resolveSolution(raw),{observation,ownership}=matchingState(project);
 observation.resources=observation.resources.filter(r=>['publisher','solution'].includes(r.kind));ownership.resources=ownership.resources.filter(r=>observation.resources.some(o=>o.resourceId===r.resourceId));
 const solution=observation.resources.find(r=>r.kind==='solution')!,owned=ownership.resources.find(r=>r.resourceId===solution.resourceId)!;solution.properties.displayName='PowerForge Experiment';owned.baseline.displayName='PowerForge Experiment';owned.lastVerifiedHash=digest(owned.baseline);
 observation.coverage=[...new Set([...observation.coverage.map(c=>c.kind),'choice','key',...MODEL_KINDS])].map(kind=>({kind,status:'complete' as const}));observation.providerVersions['model-driven']=MODEL_VERSION;
 const result=certificationPlan(raw,observation,ownership);return {project,fixtureHash:digest(spec),plan:result.native,reviewedPlan:structuredClone(result.native),historical:result.historical,reviewedHistorical:structuredClone(result.historical),observation,ownership,authHealth:'AUTH_HEALTHY',readHealth:'READ_HEALTHY'};
}
function backend(x:CertificationExecutionInput,override?:(path:string)=>Response|undefined){
 const readSet=derivePreWriteReadSet(x),paths:string[]=[],privileges=[...SCHEMA_PRIVILEGES,...MODEL_PRIVILEGES].map(name=>({name,privilegeid:randomUUID()}));
 const response=(value:unknown)=>new Response(JSON.stringify(value),{status:200});
 const send=async(url:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  expect(init?.method).toBe('GET');const u=new URL(String(url)),path=decodeURIComponent(u.pathname.split('/v9.2/')[1]!+u.search);paths.push(path);
  const overridden=override?.(path);if(overridden)return overridden;
  const d=readSet.dependencies.find(d=>path===d.path);if(d)return response({value:[d.expected]});
  if(path.startsWith('privileges?'))return response({value:privileges});
  if(path.startsWith('systemusers('))return response({RolePrivileges:privileges.map(p=>({PrivilegeId:p.privilegeid}))});
  if(path.startsWith('organizations('))return response({languagecode:1033});
  if(path.startsWith('businessunits?'))return response({value:[{businessunitid:'22222222-2222-4222-8222-222222222222'}]});
  if(path.startsWith('GlobalOptionSetDefinitions('))return new Response(JSON.stringify({error:{code:'0x80060888',message:'not found'}}),{status:404});
  return response({value:[]});
 };
 return {paths,http:new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/',{token:async()=>'synthetic'},send,{readOnly:true,sleep:async()=>undefined})};
}
const options=(x:CertificationExecutionInput)=>({ownership:async()=>x.ownership,verifyTarget:async()=>({target:x.plan.target,principalId:'11111111-1111-4111-8111-111111111111',authStatus:'AUTH_HEALTHY'})});
const row=()=>new Response(JSON.stringify({value:[{MetadataId:randomUUID()}]}),{status:200});
describe('scope-bound pre-write attestation',()=>{
 it('derives deterministic plan-bound contracts for 20 executable operations and one deferred root, never historical identities',()=>{
  const x=setup(),a=derivePreWriteReadSet(x);expect(a).toEqual(derivePreWriteReadSet(x));expect(a.operations).toHaveLength(20);expect(x.plan.deferred).toHaveLength(1);expect(a.dependencies).toHaveLength(2);
  expect(a.operations.filter(o=>o.kind==='sitemap')[0]!.reads).toHaveLength(4);expect(a.operations.filter(o=>o.kind==='app')[0]!.reads).toHaveLength(4);
  expect(JSON.stringify(a)).not.toContain('Complaint');expect(preWriteStrategy(x)).toBe('SCOPE_BOUND_ATTESTATION');
 });
 it('passes exact initial absence, retaining deferred child checks and documented choice 404',async()=>{
  const x=setup(),b=backend(x),r=await attestPreWrite(x,b.http,options(x));expect(r.attestation.result).toBe('PASS');requireAttestationPass(r.attestation,r.readSet);
  expect(r.attestation.expectedAbsenceResponses).toBe(1);expect(r.attestation.getSummary.failedRequests).toBe(0);expect(b.paths).toHaveLength(19);
  expect(r.attestation.collisions.filter(c=>c.basis?.startsWith('PARENT_ABSENT'))).toHaveLength(14);
  expect(b.paths.some(p=>p.includes('/Attributes')||p.includes('systemforms'))).toBe(false);
 });
 it.each(['table','choice','relationship','role','published sitemap','unpublished sitemap','published app','unpublished app'])('blocks a new %s collision after full planning',async kind=>{
  const x=setup(),set=derivePreWriteReadSet(x),[state,type]=kind.split(' '),op=set.operations.find(o=>o.kind===(type??state))!,read=op.reads.find(r=>!type||r.state===state)!;
  const b=backend(x,path=>path===read.path?(read.mode==='entity'?new Response(JSON.stringify({MetadataId:randomUUID()})):row()):undefined),r=await attestPreWrite(x,b.http,options(x));expect(r.attestation.result).toBe('COLLISION');expect(()=>requireAttestationPass(r.attestation,r.readSet)).toThrow();
 });
 it.each(['column','key','form','view'])('probes exact %s when its owned parent exists and blocks collisions',async kind=>{
  const x=setup(),set=derivePreWriteReadSet(x),op=set.operations.find(o=>o.kind===kind)!,operation=x.plan.operations.find(o=>o.id===op.operationId)!;
  const current=structuredClone(x.observation),ownership=structuredClone(x.ownership),matching=matchingState(x.project).observation;
  for(const id of operation.dependsOn){const dep=x.plan.operations.find(o=>o.id===id)!,r=matching.resources.find(r=>r.resourceId===dep.resourceId);if(!r)continue;current.resources.push(r);ownership.resources.push({resourceId:r.resourceId,remoteId:r.remoteId,provider:r.provider,ownedPaths:[],baseline:dep.after!,lastVerifiedHash:digest(dep.after),certificationEvidence:{purpose:'PROVIDER_CERTIFICATION',solutionId:set.dependencies.find(d=>d.resource.includes(':solution:'))!.expected!.solutionid as string,publisherId:set.dependencies.find(d=>d.resource.includes(':publisher:'))!.expected!.publisherid as string,publisherPrefix:'pfx',sourceHash:x.plan.sourceHash,planHash:x.plan.contentHash,creationOperationId:id,readbackHash:digest(r),revision:1,verifiedAt:new Date().toISOString()}});}
  const b=backend(x,path=>{
   if(path===op.reads[0]!.path)return row();
   if(path.includes('?$select=MetadataId,LogicalName,OwnershipType')){const r=current.resources.find(r=>r.kind==='table')!;return new Response(JSON.stringify({MetadataId:r.remoteId,LogicalName:r.schemaName.toLowerCase(),OwnershipType:'UserOwned'}));}
   if(path.includes('/Attributes(LogicalName=')){const r=current.resources.find(r=>r.kind==='column'&&path.includes(r.schemaName.toLowerCase()))!;return new Response(JSON.stringify({MetadataId:r.remoteId,SchemaName:r.schemaName}));}
   if(path.startsWith('RelationshipDefinitions(SchemaName=')){const r=current.resources.find(r=>r.kind==='relationship')!;return new Response(JSON.stringify({MetadataId:r.remoteId,SchemaName:r.schemaName}));}
   return undefined;
  });
  const result=await attestPreWrite(x,b.http,{...options(x),ownership:async()=>ownership,expectedOwnership:ownership,operation,current});expect(result.attestation.classification).toBe('COLLISION');
 });
 it.each(['solution','publisher'])('blocks changed required %s',async kind=>{
  const x=setup(),read=derivePreWriteReadSet(x).dependencies.find(d=>d.resource.includes(':'+kind+':'))!,b=backend(x,p=>p===read.path?row():undefined);
  expect((await attestPreWrite(x,b.http,options(x))).attestation.classification).toBe('DEPENDENCY_CHANGED');
 });
 it('does not re-read or depend on unrelated historical drift',async()=>{const x=setup(),b=backend(x,p=>{if(p.includes('Complaint'))throw Error('Unrelated historical resource unavailable');return undefined;});expect((await attestPreWrite(x,b.http,options(x))).attestation.result).toBe('PASS');expect(b.paths.every(p=>!p.includes('Complaint'))).toBe(true);});
 it('rejects ownership revision change before resource reads',async()=>{const x=setup(),b=backend(x);const r=await attestPreWrite(x,b.http,{...options(x),ownership:async()=>({...x.ownership,revision:x.ownership.revision+1})});expect(r.attestation.classification).toBe('OWNERSHIP_CHANGED');expect(b.paths).toHaveLength(0);});
 it('rejects target change before resource reads',async()=>{const x=setup(),b=backend(x);const r=await attestPreWrite(x,b.http,{...options(x),verifyTarget:async()=>({target:{...x.plan.target,environmentId:'changed'},principalId:randomUUID(),authStatus:'AUTH_HEALTHY'})});expect(r.attestation.classification).toBe('TARGET_CHANGED');expect(b.paths).toHaveLength(0);});
 it('rejects unhealthy authentication before resource reads',async()=>{const x=setup(),b=backend(x);const r=await attestPreWrite(x,b.http,{...options(x),verifyTarget:async()=>({target:x.plan.target,principalId:randomUUID(),authStatus:'AUTH_UNSTABLE'})});expect(r.attestation.classification).toBe('AUTH_FAILURE');expect(b.paths).toHaveLength(0);});
 it.each(['operation','privilege','publication','expired'])('keeps %s changes outside the targeted strategy',kind=>{
  const x=setup();if(kind==='operation')x.plan.operations.push(structuredClone(x.plan.operations[0]!));if(kind==='privilege')(x.plan.operations.find(o=>o.action==='grantRolePrivileges')!.after!.grants as {depth:string}[])[0]!.depth='Global';if(kind==='publication')x.plan.certification!.publishScopes.push({reason:'EXPLICIT_APP_POLICY',resources:['unreviewed'],sourceOperations:[]});if(kind==='expired')x.plan.expiresAt=new Date(0).toISOString();
  expect(preWriteStrategy(x)).toBe('FULL_OBSERVATION_REVALIDATION');expect(()=>derivePreWriteReadSet(x)).toThrow();
 });
 it.each([400,403,503])('fails closed on exact query HTTP %s without broad fallback',async status=>{
  const x=setup(),b=backend(x,p=>p.includes('sitemaps/Microsoft')?new Response('{}',{status}):undefined),r=await attestPreWrite(x,b.http,options(x));expect(r.attestation.result).not.toBe('PASS');expect(()=>requireAttestationPass(r.attestation,r.readSet)).toThrow();
  const failed=b.paths.filter(p=>p.includes('sitemaps/Microsoft'));expect(failed).toHaveLength(status===503?3:1);expect(failed.every(p=>p.includes("sitemapnameunique eq 'pfx_ExperimentCertificationNav'"))).toBe(true);
 });
 it('rejects partial/tampered attestation even if rehashed',async()=>{const x=setup(),b=backend(x),r=await attestPreWrite(x,b.http,options(x));r.attestation.collisions.pop();const {contentHash,...body}=r.attestation;void contentHash;r.attestation.contentHash=digest(body);expect(()=>requireAttestationPass(r.attestation,r.readSet)).toThrow();});
 it('rejects expired attestation without extending the plan',async()=>{const x=setup(),b=backend(x),r=await attestPreWrite(x,b.http,options(x));expect(()=>requireAttestationPass(r.attestation,r.readSet,Date.parse(r.attestation.expiresAt))).toThrow();});
 it('uses the lock and scoped initial gate, retains generic full revalidation, and never writes after a collision',async()=>{
  const x=setup(),directory=await temporary();try{const store=new LocalStateStore(directory,x.project.project.id,x.plan.target);await store.withLock(w=>w.saveOwnership(x.ownership));const bundle=authorizeCertification(x),b=backend(x,p=>p.startsWith('EntityDefinitions?')?row():undefined);let fullReads=0,writes=0;
   await expect(applyPlan(x.project,x.plan,store,{verifyTarget:async()=>undefined,observe:async()=>{fullReads++;return x.observation;},scopeAttestation:{input:x,run:async()=>attestPreWrite(x,b.http,{...options(x),ownership:()=>store.readOwnership()})},apply:async()=>{writes++;},membership:async()=>undefined,request:async()=>{writes++;return {requestId:randomUUID()};}},undefined,{...x,bundle})).rejects.toThrow('attestation');expect(fullReads).toBe(0);expect(writes).toBe(0);
   await store.withLock(async()=>undefined);
  }finally{await clean(directory);}
 });
 it('classifies the dry-run command as local evidence only',()=>{expect(commandManifest(createProgram()).find(c=>c.command==='solution certification-attest')).toMatchObject({risk:'LOCAL_WRITE',network:true,mutatesTenant:false});});
 it('re-attests at each operation and preserves the verified first resource when a later collision appears',async()=>{
  const x=setup(),directory=await temporary();try{
   const store=new LocalStateStore(directory,x.project.project.id,x.plan.target);await store.withLock(w=>w.saveOwnership(x.ownership));
   let writes=0,fullReads=0;const observed=structuredClone(x.observation),b=backend(x,p=>writes>0&&p.startsWith('EntityDefinitions?')?row():undefined),bundle=authorizeCertification(x);
   const result=await applyPlan(x.project,x.plan,store,{
    verifyTarget:async()=>undefined,observe:async()=>{fullReads++;return observed;},observeReadback:async()=>structuredClone(observed),
    scopeAttestation:{input:x,run:async(ownership,operation,current)=>attestPreWrite(x,b.http,{...options(x),ownership:()=>store.readOwnership(),expectedOwnership:ownership,...(operation?{operation}:{}),...(current?{current}:{})})},
    apply:async(op,_observation,mutate)=>{await mutate('create','synthetic','POST',{});const spec=certificationResources(x.project).find(r=>r.resourceId===op.resourceId)!;observed.resources.push({resourceId:spec.resourceId,kind:spec.kind,schemaName:spec.schemaName,provider:op.provider,remoteId:randomUUID(),properties:{...op.after!,isManaged:false,customizable:true}});},membership:async()=>undefined,request:async()=>{writes++;return {requestId:randomUUID()};},
   },async()=>undefined,{...x,bundle});
   expect(result.ok).toBe(false);expect(writes).toBe(1);expect(fullReads).toBe(0);expect(result.completed).toHaveLength(1);expect((await store.readOwnership())!.resources.filter(r=>r.certificationEvidence)).toHaveLength(1);
  }finally{await clean(directory);}
 });
 it.each(['permissions','root unit','choice 404 without metadata error'])('blocks incomplete %s facts',async kind=>{
  const x=setup(),b=backend(x,p=>kind==='permissions'&&p.startsWith('privileges?')||kind==='root unit'&&p.startsWith('businessunits?')?new Response(JSON.stringify({value:[]})):kind==='choice 404 without metadata error'&&p.startsWith('GlobalOptionSetDefinitions(')?new Response('{}',{status:404}):undefined);
  const r=await attestPreWrite(x,b.http,options(x));expect(r.attestation.result).not.toBe('PASS');expect(()=>requireAttestationPass(r.attestation,r.readSet)).toThrow();
 });
});
