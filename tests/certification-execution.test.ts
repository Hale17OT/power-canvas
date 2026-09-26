import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {describe,it,expect,vi} from 'vitest';
import {resolveSolution} from '../src/solution/resolve.js';
import {certificationPlan} from '../src/solution/certification.js';
import {digest} from '../src/solution/compile.js';
import {authorizeCertification,validateCertificationExecution,REVIEWED_CERTIFICATION_FIXTURE,type CertificationExecutionInput} from '../src/execution/certification.js';
import {matchingState} from './planner-fixtures.js';
import {MODEL_KINDS,MODEL_VERSION} from '../src/model-driven/desired.js';
import {certificationResources} from '../src/planner/certification.js';
import {applyPlan,verifyPostcondition} from '../src/execution/apply.js';
import {LocalStateStore} from '../src/state/local.js';
import {temporary,clean} from './helpers.js';
import {DataverseHttp,ApiError} from '../src/dataverse/http.js';
import {assertAuthEvidenceSafe} from '../src/auth/safe-evidence.js';
import {validateSavedPlan,projection} from '../src/planner/dataverse.js';
import {commandManifest} from '../src/agent/commands.js';
import {createProgram} from '../src/cli/program.js';

function setup():CertificationExecutionInput{
 const raw=JSON.parse(readFileSync('tests/fixtures/certification-v21i-source.json','utf8')),{project,spec}=resolveSolution(raw),{observation,ownership}=matchingState(project);
 observation.resources=observation.resources.filter(r=>['publisher','solution'].includes(r.kind));ownership.resources=ownership.resources.filter(r=>observation.resources.some(o=>o.resourceId===r.resourceId));
 const solution=observation.resources.find(r=>r.kind==='solution')!,owned=ownership.resources.find(r=>r.resourceId===solution.resourceId)!;solution.properties.displayName='PowerForge Experiment';owned.baseline.displayName='PowerForge Experiment';owned.lastVerifiedHash=digest(owned.baseline);
 observation.coverage=[...new Set([...observation.coverage.map(c=>c.kind),'choice','key',...MODEL_KINDS])].map(kind=>({kind,status:'complete' as const}));observation.providerVersions['model-driven']=MODEL_VERSION;
 const result=certificationPlan(raw,observation,ownership);return {project,fixtureHash:digest(spec),plan:result.native,reviewedPlan:structuredClone(result.native),historical:result.historical,reviewedHistorical:structuredClone(result.historical),observation,ownership,authHealth:'AUTH_HEALTHY',readHealth:'READ_DEGRADED_RECOVERED'};
}
function resign<T extends {contentHash:string}>(value:T){const {contentHash:_ignored,...body}=value;void _ignored;value.contentHash=digest(body);}
describe('exact certification execution boundary',()=>{
 it('accepts the reviewed global-choice Name normalization without weakening other postconditions',()=>{
  const x=setup(),op=x.plan.operations.find(o=>o.action==='createChoice')!,spec=certificationResources(x.project).find(r=>r.resourceId===op.resourceId)!;
  // V2.1g returned the requested choice under a lower-case metadata Name.
  // V2.1h compiles the canonical Name before creation; no generic comparison ignore.
  const resource={resourceId:spec.resourceId,remoteId:randomUUID(),provider:'dataverse',kind:'choice',schemaName:spec.schemaName,properties:{...op.after!,schemaName:spec.schemaName.toLowerCase(),isManaged:false,customizable:true}};
  const observed={...x.observation,resources:[...x.observation.resources,resource]};
  const actual=projection(resource,op.after!);
  expect(Object.keys(op.after!).filter(k=>digest(actual[k])!==digest(op.after![k]))).toEqual([]);
  expect(actual.options).toEqual(op.after!.options);expect(actual.solutionMember).toBe(true);
  expect(verifyPostcondition(op,observed)).toBe(true);
  expect(verifyPostcondition({...op,after:{...op.after!,schemaName:spec.schemaName.toLowerCase()}},observed)).toBe(true);
 });
 it('accepts only the exact reviewed fixture and records a source/target/operation-bound receipt',()=>{
  const x=setup();expect(x.fixtureHash).toBe(REVIEWED_CERTIFICATION_FIXTURE);const bundle=authorizeCertification(x);
  expect(bundle.manifest).toMatchObject({purpose:'PROVIDER_CERTIFICATION',evidenceState:'ATTEMPT_INTENT_ONLY',ownershipRevision:x.ownership.revision,planHash:x.plan.contentHash,expectedPublication:[]});
  expect(bundle.manifest.desiredResources).toHaveLength(21);expect(bundle.manifest.requiredDependencies).toHaveLength(2);expect(bundle.receipt.authorizedOperationIds).toEqual(x.plan.operations.map(o=>o.id));
  expect(()=>validateCertificationExecution(bundle,x)).not.toThrow();expect(()=>assertAuthEvidenceSafe(bundle)).not.toThrow();
  expect(()=>validateSavedPlan(x.plan,x.project,x.observation,x.ownership)).toThrow('separately authorized');
 });
 it.each(['expired','hash','environment','solution','publisher','ownershipRevision','ownershipReceipt','extraTable','historicalTable','historicalForm','historicalRole','delete','canvas','flow','businessData','publishXml','globalPrivilege','userAssignment','teamAssignment','appPublish','manifest','dependencies','connectionReference','environmentVariable','fixture','policy','historicalClassification','auth','partialReads'])('rejects %s before authorization',kind=>{
  const x=setup();
  if(kind==='expired')x.plan.expiresAt=new Date(Date.now()-1000).toISOString();
  if(kind==='hash')x.plan.contentHash='0'.repeat(64);
  if(kind==='environment')x.plan.target.environmentId=randomUUID();
  if(kind==='solution')x.observation.resources.find(r=>r.kind==='solution')!.remoteId=randomUUID();
  if(kind==='publisher')x.observation.resources.find(r=>r.kind==='publisher')!.remoteId=randomUUID();
  if(kind==='ownershipRevision')x.ownership.revision++;
  if(kind==='ownershipReceipt')x.ownership.resources[0]!.baseline.displayName='Changed';
  if(kind==='extraTable')x.project.dataverse.tables.extra=structuredClone(x.project.dataverse.tables.certificationProbe!);
  if(['historicalTable','historicalForm','historicalRole'].includes(kind)){x.plan.operations[0]!.resourceId='pf:'+x.project.project.id+':dataverse:table:historical';x.plan.operations[0]!.action='updateOwnedProperties';x.plan.operations[0]!.risk='mutable';x.plan.operations[0]!.before={displayName:'historical'};}
  const badActions:Record<string,string>={delete:'deleteTable',canvas:'updateCanvas',flow:'createFlow',businessData:'createRecord',publishXml:'publish',userAssignment:'assignUser',teamAssignment:'assignTeam',appPublish:'publish',connectionReference:'createConnectionReference',environmentVariable:'createEnvironmentVariable'};
  if(badActions[kind])Object.assign(x.plan.operations[0]!,{action:badActions[kind]});
  if(kind==='globalPrivilege'){const op=x.plan.operations.find(o=>o.action==='grantRolePrivileges')!;(op.after!.grants as {depth:string}[])[0]!.depth='Global';}
  if(kind==='manifest')x.plan.certification!.manifest.namespace='different' as 'pfx_ExperimentCertification';
  if(kind==='dependencies')x.plan.operations[0]!.dependsOn.push(x.plan.operations.at(-1)!.id);
  if(kind==='fixture')x.fixtureHash=digest('another fixture');
  if(kind==='policy')x.plan.executionPolicy!.nonDisposable=false;
  if(kind==='historicalClassification')x.historical=[];
  if(kind==='auth')x.authHealth='AUTH_UNSTABLE';
  if(kind==='partialReads')x.observation.coverage[0]!.status='partial';
  if(kind!=='hash')resign(x.plan);
  expect(()=>authorizeCertification(x)).toThrow();
 });
 it.each(['manifestHash','planHash','environmentId','solutionId','publisherId','ownershipRevision','authorizedOperationIds','authorizedRisks','expiry'])('rejects re-signed receipt alteration: %s',field=>{
  const x=setup(),bundle=authorizeCertification(x);
  if(field==='ownershipRevision')bundle.receipt.ownershipRevision++;
  else if(field==='authorizedOperationIds')bundle.receipt.authorizedOperationIds[0]='arbitrary';
  else if(field==='authorizedRisks')bundle.receipt.authorizedRisks=['additive'];
  else if(field==='expiry')bundle.receipt.expiresAt=new Date(Date.now()-1).toISOString();
  else Object.assign(bundle.receipt,{[field]:field.endsWith('Hash')?'1'.repeat(64):randomUUID()});
  resign(bundle.receipt);expect(()=>validateCertificationExecution(bundle,x)).toThrow();
 });
 it('binds all manifest fields even when the manifest is rehashed',()=>{const x=setup(),b=authorizeCertification(x);b.manifest.operations[0]!.definitionHash='0'.repeat(64);resign(b.manifest);expect(()=>validateCertificationExecution(b,x)).toThrow();});
 it('cannot authorize a changed operation by forging both reviewed and fresh plans',()=>{const x=setup();x.plan.operations[0]!.after!.displayName='Unreviewed';resign(x.plan);x.reviewedPlan=structuredClone(x.plan);expect(()=>authorizeCertification(x)).toThrow('deterministic compiler');});
 it('advertises a narrow tenant/security command without a generic Default bypass',()=>{
  const commands=commandManifest(createProgram());expect(commands.find(c=>c.command==='solution certification-execute')).toMatchObject({risk:'TENANT_WRITE',mutatesTenant:true,requiresSavedPlan:true});
  expect(JSON.stringify(commands.find(c=>c.command==='solution certification-execute'))).not.toContain('allow-default-writes');
 });
 it.each(['EntityDefinitions','appmodules','roles(11111111-1111-1111-1111-111111111111)/Microsoft.Dynamics.CRM.AddPrivilegesRole','AddAppComponents','appmodules(11111111-1111-1111-1111-111111111111)/appmoduleroles_association/$ref'])('never retries an uncertain POST to %s',async path=>{
  const send=vi.fn(async()=>{throw new TypeError('network');}),http=new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/',{token:async()=>'test'},send);
  await expect(http.request(path,'POST',{})).rejects.toMatchObject({uncertain:true});expect(send).toHaveBeenCalledTimes(1);
 });
 it('does not retry PATCH',async()=>{const send=vi.fn(async()=>new Response('{}',{status:503}));const http=new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/',{token:async()=>'test'},send);await expect(http.request('appmodules','PATCH',{})).rejects.toThrow();expect(send).toHaveBeenCalledTimes(1);});
 it.each([false,true])('uses the existing executor/journal and handles uncertain second operation: %s',async failSecond=>{
  const directory=await temporary();try{
   const x=setup(),bundle=authorizeCertification(x),store=new LocalStateStore(directory,x.project.project.id,x.plan.target);await store.withLock(w=>w.saveOwnership(x.ownership));let calls=0;
   const observed=structuredClone(x.observation),resources=certificationResources(x.project);
   const result=await applyPlan(x.project,x.plan,store,{
    verifyTarget:async()=>undefined,observe:async()=>structuredClone(observed),membership:async()=>undefined,
    apply:async(op,_observed,mutate)=>{await mutate('create','synthetic','POST',{});const spec=resources.find(r=>r.resourceId===op.resourceId)!;observed.resources.push({resourceId:spec.resourceId,remoteId:randomUUID(),provider:op.provider,kind:spec.kind,schemaName:spec.schemaName,properties:{...op.after!,isManaged:false,customizable:true}});},
    request:async()=>{calls++;if(failSecond&&calls===2)throw new ApiError(0,randomUUID(),true);return {requestId:randomUUID()};},
   },async()=>undefined,{...x,bundle});
   expect(result.ok).toBe(false);if(!failSecond)expect(result.error?.message).toContain('not a semantic no-op');expect(calls).toBe(failSecond?2:20);expect(result.completed).toHaveLength(failSecond?1:20);
   const owned=await store.readOwnership();expect(owned!.resources.filter(r=>r.certificationEvidence)).toHaveLength(failSecond?1:20);expect(owned!.resources.filter(r=>!r.certificationEvidence)).toEqual(x.ownership.resources);
   const journal=await store.readJournal(result.executionId),bytes=await readFile(join(store.root,`journal-${result.executionId}.jsonl`));expect(bytes.toString().trim().split('\n').map(line=>JSON.parse(line))).toEqual(journal);expect(createHash('sha256').update(bytes).digest('hex')).toHaveLength(64);
   if(failSecond)expect(journal.some(e=>e.status==='outcomeUnknown')).toBe(true);
  }finally{await clean(directory);}
 });
});
