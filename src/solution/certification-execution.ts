import { requireAppValidation } from '../model-driven/validation.js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {loadProject,parseConfigData,readConfigSource} from '../config/load.js';
import {resolveSolution} from './resolve.js';
import {digest} from './compile.js';
import {liveCertificationPlan,certificationDiscoveryProject} from './certification.js';
import {authorizeCertification,type CertificationExecutionContext} from '../execution/certification.js';
import {applyPlan} from '../execution/apply.js';
import {certificationIdentityReadback} from '../dataverse/certification-readback.js';
import type {PlannedOperation} from '../state/models.js';
import {LocalStateStore} from '../state/local.js';
import {planSchema,ownershipSchema,observationSchema} from '../state/models.js';
import {connect} from '../cli/remote.js';
import {EnvironmentStore,verifyTarget} from '../auth/environments.js';
import {ProfileStore} from '../auth/profiles.js';
import {credentialHealth,type CredentialEvent} from '../auth/credential-audit.js';
import {assertAuthEvidenceSafe} from '../auth/safe-evidence.js';
import {attestPreWrite} from '../execution/attestation.js';
import {DataverseDiscovery} from '../dataverse/discovery.js';
import {DataverseHttp} from '../dataverse/http.js';
import {mutateSchema,ensureMembership} from '../dataverse/mutations.js';
import {observeModel} from '../model-driven/discovery.js';
import {mutateModel,modelMembership} from '../model-driven/mutations.js';
import {TransportAuditLog} from '../dataverse/transport-audit.js';
import {transportHealth,type TransportOptions} from '../dataverse/transport.js';
import {publicError,PowerCanvasError} from '../core/errors.js';

const json=async(path:string):Promise<unknown>=>JSON.parse(await readFile(path,'utf8'));
/** Policy boundary only: compilation, mutation, membership and receipts use existing providers. */
export async function executeLiveCertification(directory:string,specPath:string,alias:string,out:string,reviewedDirectory:string,options:{executeReviewedFixture:true;expectedPrincipal:string}){
 if(options.executeReviewedFixture!==true)throw Error('Explicit reviewed-fixture execution authorization is required');
 const destination=resolve(out);await mkdir(destination);const artifacts:{file:string;sha256:string}[]=[];
 const save=async(file:string,value:unknown)=>{assertAuthEvidenceSafe(value);const bytes=JSON.stringify(value,null,2)+'\n';await writeFile(join(destination,file),bytes,{flag:'wx'});artifacts.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});};
 const raw=parseConfigData(await readConfigSource(resolve(specPath))),resolved=resolveSolution(raw),original=(await loadProject(directory)).project;
 const preflight=join(destination,'preflight');
 await liveCertificationPlan(directory,raw,alias,preflight,{expectedPrincipal:options.expectedPrincipal});
 const plan=planSchema.parse(await json(join(preflight,'native.json'))),ownership=ownershipSchema.parse(await json(join(preflight,'ownership.json'))),observation=observationSchema.parse(await json(join(preflight,'observation.json')));
 const auth=await json(join(preflight,'auth-health.json')) as {status:string},reads=await json(join(preflight,'transport-summary.json')) as {status:string};
 const context:CertificationExecutionContext={fixtureHash:digest(resolved.spec),reviewedPlan:planSchema.parse(await json(join(reviewedDirectory,'native.json'))),historical:await json(join(preflight,'historical.json')),reviewedHistorical:await json(join(reviewedDirectory,'historical.json')),authHealth:auth.status,readHealth:reads.status==='HEALTHY'?'READ_HEALTHY':reads.status==='DEGRADED_RECOVERED'?'READ_DEGRADED_RECOVERED':'READ_UNSTABLE'};
 const bundle=authorizeCertification({...context,project:resolved.project,plan,ownership,observation});
 await save('execution-manifest.json',bundle.manifest);await save('execution-authorization.json',bundle.receipt);
 const requests=await TransportAuditLog.create(join(destination,'requests.ndjson')),authLog=await TransportAuditLog.create<CredentialEvent>(join(destination,'auth-events.ndjson'));
 const transport:TransportOptions={readOnly:true,audit:e=>requests.record(e),credentials:{mode:'cycle',cycleId:randomUUID(),environment:alias,audit:e=>authLog.record(e)}};
 const startedAt=new Date().toISOString();let connection:Awaited<ReturnType<typeof connect>>|undefined;
 const store=new LocalStateStore(directory,resolved.project.project.id,plan.target);
 let result:Awaited<ReturnType<typeof applyPlan>>|undefined;
 try{
  const c=await connect(directory,alias,transport);connection=c;
  if(!c.credentialContext)throw Error('Healthy cycle credential context is required');
  c.credentialContext.bindPrincipal(c.identity.UserId,options.expectedPrincipal);
  const writeHttp=new DataverseHttp(c.http.base,c.credentialContext,fetch,{...transport,readOnly:false});
  const discoveryProject=certificationDiscoveryProject(original,resolved.project);
  const observe=async(current=ownership)=>observeModel(discoveryProject,await new DataverseDiscovery(c.http).observe(discoveryProject,c.binding.target,current),c.http,current);
  const verify=async()=>{
   if(digest(await new EnvironmentStore(directory).get(alias))!==digest(c.binding)||digest(await new ProfileStore().get(c.profile.alias))!==digest(c.profile)||digest((await loadProject(directory)).project)!==digest(original)||digest(parseConfigData(await readConfigSource(resolve(specPath))))!==digest(raw))throw Error('Source/profile/binding changed; execution stopped');
   const verified=await verifyTarget(c.profile,c.binding,c.credentialContext!,transport);
   c.credentialContext!.bindPrincipal(verified.identity.UserId,options.expectedPrincipal);
   if(digest(c.binding.target)!==digest(plan.target)||verified.environment.organizationType!==12||credentialHealth(authLog.entries).status!=='AUTH_HEALTHY')throw Error('Certification target or authentication health differs');
  };
  const attestationInput={...context,project:resolved.project,plan,ownership,observation};
  let attestationSequence=0;
  const allowedIds=new Set([...bundle.manifest.desiredResources,...bundle.manifest.requiredDependencies].map(r=>r.resourceId));
  let currentOperation:PlannedOperation|undefined,identitySequence=0;
  const validateAppBeforeAccess=async(observed:import('../state/models.js').Observation)=>{
   const app=observed.resources.find(r=>r.kind==='app'&&allowedIds.has(r.resourceId));if(!app)throw new PowerCanvasError('PF-MDA-008','Certification AppModule is missing before access association.','Stop; no association or publication.');
   const validation=(await c.http.request(`ValidateApp(AppModuleId=${app.remoteId})`)).data as {AppValidationResponse?:{ValidationSuccess?:boolean;ValidationIssueList?:unknown[]}};
   await save('validate-app-before-access.json',{appId:app.remoteId,validation});
   requireAppValidation(validation);
  };
  const identities=new Map<string,unknown>();
  const observeReadback=async(current=ownership)=>{
   const scoped={...current,resources:current.resources.filter(r=>allowedIds.has(r.resourceId))};
   const observed=await observeModel(resolved.project,await new DataverseDiscovery(c.http).observe(resolved.project,c.binding.target,scoped),c.http,scoped);
   if(currentOperation){const identity=await certificationIdentityReadback(currentOperation,observed,c.http);if(identity){
    await save(`provider-identity-readback-${++identitySequence}.json`,identity);
    if(identities.has(identity.resourceId)&&digest(identities.get(identity.resourceId))!==digest(identity))throw Error('Platform identity changed between independent readbacks; stop without normalization');
    identities.set(identity.resourceId,identity);
   }}return observed;
  };
  result=await applyPlan(resolved.project,plan,store,{
   verifyTarget:verify,observe,observeReadback,
   scopeAttestation:{input:attestationInput,run:async(current,operation,observed)=>{
    const evidence=await attestPreWrite(attestationInput,c.http,{ownership:()=>store.readOwnership(),expectedOwnership:current,...(operation?{operation}:{}),...(observed?{current:observed}:{}),verifyTarget:async()=>{await verify();return {target:c.binding.target,principalId:c.identity.UserId,authStatus:credentialHealth(authLog.entries).status};}});
    await save(`pre-write-attestation-${++attestationSequence}.json`,evidence);return evidence;
   }},
   apply:async(operation,observed,mutate)=>{currentOperation=operation;if(operation.action==='setAppAccess')await validateAppBeforeAccess(observed);return operation.provider==='model-driven'?mutateModel(resolved.project,operation,observed,writeHttp,mutate):mutateSchema(resolved.project,operation,observed,writeHttp,mutate);},
   membership:(operation,observed,mutate)=>operation.provider==='model-driven'?modelMembership(resolved.project,operation,observed,mutate):ensureMembership(resolved.project,operation,observed,writeHttp,mutate),
   request:(path,method,body,headers)=>writeHttp.request(path,method,body,headers),
  },undefined,{...context,bundle});
  await save('apply-result.json',result);
  const journal=await store.readJournal(result.executionId);await save('mutation-journal.json',journal);
  if(journal.length){const journalBytes=await readFile(join(store.root,`journal-${result.executionId}.jsonl`));await writeFile(join(destination,'mutation-journal.jsonl'),journalBytes,{flag:'wx'});artifacts.push({file:'mutation-journal.jsonl',sha256:createHash('sha256').update(journalBytes).digest('hex')});}
  if(!result.ok){
   // Read-only reconciliation only. Never retry an uncertain creation or delete survivors.
   try{await save('reconciliation.json',await observe(await store.readOwnership()));}catch(error){await save('reconciliation-failure.json',publicError(error));}
   const status=journal.some(e=>['remoteSucceeded','verified','outcomeUnknown'].includes(e.status))?'V2.1 LIVE PROVIDER CERTIFICATION PARTIALLY_APPLIED':'V2.1 LIVE PROVIDER CERTIFICATION BLOCKED';
   const report={status,result,mutationAuthorizedForFurtherWork:false,compensatingDeletes:0};await save('execution-report.json',report);return report;
  }
  const after=join(destination,'after-state');await liveCertificationPlan(directory,raw,alias,after,{expectedPrincipal:options.expectedPrincipal});
  const final=planSchema.parse(await json(join(after,'native.json'))),fresh=observationSchema.parse(await json(join(after,'observation.json')));
  if(final.deferred?.length||final.operations.length||final.blockers.length||fresh.resources.filter(r=>r.kind==='key'&&bundle.manifest.desiredResources.some(d=>d.resourceId===r.resourceId)).some(r=>r.properties.indexStatus!=='Active'))throw Error('Independent after-state did not converge to Active-key NO_OP');
  const app=fresh.resources.find(r=>r.kind==='app'&&bundle.manifest.desiredResources.some(d=>d.resourceId===r.resourceId));if(!app)throw Error('Certification app readback is missing');
  const validation=(await c.http.request(`ValidateApp(AppModuleId=${app.remoteId})`)).data as {AppValidationResponse?:{ValidationSuccess?:boolean;ValidationIssueList?:unknown[]}};
  await save('validate-app.json',validation);
   requireAppValidation(validation);
  const report={status:'V2.1 LIVE PROVIDER CERTIFICATION PARTIAL',provisioning:'VERIFIED',independentNoOp:true,validateApp:'PASSED',alternateKey:'Active',export:'PENDING',checker:'PENDING',capabilityPromotions:0,modelDrivenAppsPublished:0,publishXmlCalls:0,personaRuntime:'UNPROVEN',result};await save('execution-report.json',report);return report;
 }catch(error){const safe=publicError(error);const report={status:requests.entries.some(e=>e.method!=='GET'&&e.dispatched)?'V2.1 LIVE PROVIDER CERTIFICATION PARTIALLY_APPLIED':'V2.1 LIVE PROVIDER CERTIFICATION BLOCKED',error:safe,completed:result?.completed??[],mutationAuthorizedForFurtherWork:false};await save('execution-failure.json',report);return report;}
 finally{connection?.credentialContext?.invalidate();await save('auth-health.json',credentialHealth(authLog.entries));await save('auth-events.json',authLog.entries);await save('transport-summary.json',transportHealth(requests.entries,startedAt));await save('artifact-index.json',[...artifacts,{file:'requests.ndjson',sha256:await requests.sha256()},{file:'auth-events.ndjson',sha256:await authLog.sha256()}]);}
}
