import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {liveCertificationPlan} from '../solution/certification.js';
import {digest} from '../solution/compile.js';
import {resolveSolution} from '../solution/resolve.js';
import {certificationManifestSchema,observationSchema,planSchema,type CertificationManifest,type Observation,type Ownership,type Plan} from '../state/models.js';
import {fingerprint} from '../planner/dataverse.js';
import {assertAuthEvidenceSafe} from '../auth/safe-evidence.js';
import {publicError} from '../core/errors.js';
import {transportConfiguration,type RequestAudit,type TransportOptions,transportHealth} from './transport.js';
import {credentialHealth,type CredentialEvent} from '../auth/credential-audit.js';

export interface DiscoveryCycle {
 complete:boolean;planReady?:boolean;health:ReturnType<typeof transportHealth>;readHealth?:string;authHealth?:ReturnType<typeof credentialHealth>;historical?:unknown;observation?:Observation;plan?:Plan;ownership?:Ownership;
}
/** V2.1d requires independent auth evidence; V2.1c evidence cannot satisfy this gate. */
export function evaluateCredentialStability(cycles:DiscoveryCycle[],reviewed:CertificationManifest){
 const previous=evaluateStability(cycles,reviewed);
 const authenticationHealthy=cycles.length===3&&cycles.every(c=>c.authHealth?.status==='AUTH_HEALTHY'&&c.health.status!=='BLOCKED_AUTH');
 const authFailure=cycles.some(c=>c.health.status==='BLOCKED_AUTH'||c.authHealth?.status!=='AUTH_HEALTHY');
 const scopeCorrect=cycles.length===3&&cycles.every(c=>{
  const report=c.plan?.certification;
  return report&&report.manifest.roots.length===21&&report.manifest.existingDependencies.length===2&&report.publishScopes.length===0&&report.closure.resourcesToUpdate.length===0&&report.closure.resourcesToPublish.length===0&&c.plan!.operations.every(o=>report.manifest.roots.some(r=>r.resourceId===o.resourceId)&&o.action!=='publish');
 });
 const historicalHashes=cycles.map(c=>c.historical===undefined?null:digest(c.historical));
 const historicalCompatible=historicalHashes.length===3&&historicalHashes.every(h=>h!==null&&h===historicalHashes[0]);
 const passed=previous.stabilityGatePassed&&authenticationHealthy&&scopeCorrect&&historicalCompatible;
 const recovered=cycles.some(c=>c.health.recoveredTransientFailures>0);
 return {...previous,authenticationHealthy,scopeCorrect,historicalCompatible,historicalHashes,stabilityGatePassed:passed,status:passed?recovered?'OPERATIONAL_WITH_RECOVERED_TRANSIENT':'STABLE':authFailure?'AUTH_UNSTABLE':'READ_UNSTABLE',authHealth:authenticationHealthy?'AUTH_HEALTHY':authFailure?'AUTH_UNSTABLE':'AUTH_UNKNOWN',readHealth:cycles.some(c=>c.readHealth==='READ_UNSTABLE'||['UNSTABLE','BLOCKED_PERMISSION'].includes(c.health.status))?'READ_UNSTABLE':cycles.length!==3||cycles.some(c=>!c.complete)?'READ_UNKNOWN':recovered?'READ_DEGRADED_RECOVERED':'READ_HEALTHY',verdict:passed?'AUTH AND DATAVERSE READ PREFLIGHT STABLE — V2.1 CERTIFICATION MAY BE REPLANNED':authFailure?'AUTHENTICATION UNSTABLE — CERTIFICATION REMAINS BLOCKED':'DATAVERSE READ TRANSPORT UNSTABLE — CERTIFICATION REMAINS BLOCKED'};
}
/** Transport evidence is not provider certification or execution authorization. */
export function evaluateStability(cycles:DiscoveryCycle[],reviewed:CertificationManifest){
 const complete=cycles.length===3&&cycles.every(c=>c.complete&&c.observation&&c.plan&&c.ownership);
 const observationHashes=cycles.map(c=>c.observation?fingerprint(c.observation):null);
 const planHashes=cycles.map(c=>c.plan?digest({projectId:c.plan.projectId,target:c.plan.target,sourceHash:c.plan.sourceHash,executionPolicy:c.plan.executionPolicy,operations:c.plan.operations,blockers:c.plan.blockers,certification:c.plan.certification}):null);
 const ownershipHashes=cycles.map(c=>c.ownership?digest(c.ownership):null);
 const equal=(values:(string|null)[])=>values.length===3&&values.every(v=>v!==null&&v===values[0]);
 const observationsCompatible=complete&&equal(observationHashes),plansCompatible=complete&&equal(planHashes),ownershipCompatible=complete&&equal(ownershipHashes);
 const manifestsMatch=complete&&cycles.every(c=>c.plan?.certification?.manifest.contentHash===reviewed.contentHash&&digest(c.plan.certification.manifest)===digest(reviewed));
 const zeroBlockers=complete&&cycles.every(c=>c.plan!.blockers.length===0&&c.planReady!==false);
 const finishedHealth=cycles.every(c=>['HEALTHY','DEGRADED_RECOVERED'].includes(c.health.status));
 const passed=complete&&observationsCompatible&&plansCompatible&&ownershipCompatible&&manifestsMatch&&zeroBlockers&&finishedHealth;
 const recovered=cycles.some(c=>c.health.recoveredTransientFailures>0);
 return {status:passed?recovered?'DEGRADED_RECOVERED':'HEALTHY':cycles.some(c=>c.health.status==='BLOCKED_AUTH')?'BLOCKED_AUTH':cycles.some(c=>c.health.status==='BLOCKED_PERMISSION')?'BLOCKED_PERMISSION':'UNSTABLE',verdict:passed?recovered?'DATAVERSE READ TRANSPORT DEGRADED BUT RECOVERABLE — REVIEW BEFORE CERTIFICATION':'DATAVERSE READ TRANSPORT STABLE — V2.1 CERTIFICATION MAY RESUME':'DATAVERSE READ TRANSPORT UNSTABLE — CERTIFICATION REMAINS BLOCKED',cyclesComplete:cycles.filter(c=>c.complete).length,requiredCycles:3,observationsCompatible,plansCompatible,ownershipCompatible,manifestsMatch,zeroBlockers,observationHashes,planSemanticHashes:planHashes,ownershipHashes,stabilityGatePassed:passed,mutationAuthorized:false,providerCertification:false,capabilityPromotions:0,finalFreshPlanRequired:true};
}
export function transportDoctorConfiguration(){return {...transportConfiguration(),authPolicy:{mode:'per-cycle',authRetryBudget:0,maximumReuseMs:300000,minimumRemainingMs:60000,initialAudiences:2,initialization:'Sequential Dataverse and global-discovery silent acquisition before any HTTP dispatch',singleFlight:'Per cycle, profile/tenant/account/environment/audience/refresh requirement',refresh:'MSAL expiry and refreshOn, with five-minute maximum context reuse',personaAuthorization:'UNPROVEN'}};}
const read=async(path:string):Promise<unknown>=>JSON.parse(await readFile(path,'utf8'));
/** Copies only allowlisted sanitized diagnostics, never private observations or plans. */
export async function writeTransportSupport(source:string,out:string){
 const destination=resolve(out);await mkdir(destination);const files=[];
 for(const name of ['transport-summary.json','failed-requests.json','phase-timeline.json','configuration.json','reproduction.md']){
  const bytes=await readFile(resolve(source,name));assertAuthEvidenceSafe(name.endsWith('.json')?JSON.parse(bytes.toString('utf8')):bytes.toString('utf8'));
  await writeFile(resolve(destination,name),bytes,{flag:'wx'});files.push({file:name,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 // Optional only for older V2.1c bundles. Every V2.1d doctor writes this file.
 try{const bytes=await readFile(resolve(source,'auth-events.json'));assertAuthEvidenceSafe(JSON.parse(bytes.toString('utf8')));await writeFile(resolve(destination,'auth-events.json'),bytes,{flag:'wx'});files.push({file:'auth-events.json',sha256:createHash('sha256').update(bytes).digest('hex')});}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT'))throw error;}
 await writeFile(resolve(destination,'sha256-manifest.json'),JSON.stringify(files,null,2)+'\n',{flag:'wx'});return destination;
}
export async function transportDoctor(directory:string,raw:unknown,alias:string,out:string,reviewedRaw:unknown,options:TransportOptions&{expectedPrincipal?:string}={}){
 const reviewed=certificationManifestSchema.parse(reviewedRaw),{contentHash,...manifestBody}=reviewed;
 const fixture=resolveSolution(raw);
 if(contentHash!==digest(manifestBody)||reviewed.fixtureHash!==digest(fixture.spec)||reviewed.projectHash!==digest(fixture.project))throw Error('Transport proof requires the exact previously reviewed certification fixture/manifest');
 const destination=resolve(out);await mkdir(destination);
 const artifacts:{file:string;sha256:string}[]=[];
 const save=async(file:string,value:unknown)=>{assertAuthEvidenceSafe(value);const bytes=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';await writeFile(resolve(destination,file),bytes,{flag:'wx'});artifacts.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});};
 const cycles:DiscoveryCycle[]=[],summaries:unknown[]=[],allRequests:{cycle:number;entry:RequestAudit}[]=[],allAuth:{cycle:number;entry:CredentialEvent}[]=[];
 const configuration=transportDoctorConfiguration();await save('configuration.json',configuration);
 for(let cycle=1;cycle<=3;cycle++){
  if(options.signal?.aborted)break;
  const path=resolve(destination,'cycle-'+cycle);let complete=false,planReady=false,safeError:unknown;
  try{const result=await liveCertificationPlan(directory,raw,alias,path,{...options,credentialMode:'cycle',audit:async entry=>{allRequests.push({cycle,entry});await options.audit?.(entry);}});complete=true;planReady=result.status==='CERTIFICATION_PLAN_READY_FOR_REVIEW';}
  catch(error){const safe=publicError(error);safeError={code:safe.code,message:safe.message};}
  const health=await read(resolve(path,'transport-summary.json')) as ReturnType<typeof transportHealth>;
  if(safeError&&typeof safeError==='object'&&'code'in safeError&&String(safeError.code).startsWith('PF-AUTH-'))health.status='BLOCKED_AUTH';
  const authHealth=await read(resolve(path,'auth-health.json')) as ReturnType<typeof credentialHealth>;
  const authEvents=await read(resolve(path,'auth-events.json')) as CredentialEvent[];allAuth.push(...authEvents.map(entry=>({cycle,entry})));
  const current:DiscoveryCycle={complete,planReady,health,authHealth};
  if(complete){current.observation=observationSchema.parse(await read(resolve(path,'observation.json')));current.plan=planSchema.parse(await read(resolve(path,'native.json')));current.ownership=await read(resolve(path,'ownership.json')) as Ownership;current.historical=await read(resolve(path,'historical.json'));}
  const credentialFailures=allRequests.filter(r=>r.cycle===cycle&&r.entry.result==='FAILED'&&r.entry.failurePhase==='credentials').length;
  const readHealth=health.failedRequests>credentialFailures||health.incompleteRequests?'READ_UNSTABLE':!complete?'READ_UNKNOWN':health.recoveredTransientFailures?'READ_DEGRADED_RECOVERED':'READ_HEALTHY';
  current.readHealth=readHealth;
  cycles.push(current);summaries.push({cycle,complete,planGenerated:complete,planReady,authHealth,readHealth,health,scope:current.plan?.certification?{desiredNodes:current.plan.certification.manifest.roots.length,existingDependencies:current.plan.certification.manifest.existingDependencies.length,historicalUpdates:current.plan.certification.closure.resourcesToUpdate.length,publishScopes:current.plan.certification.publishScopes,operationClasses:[...new Set(current.plan.operations.map(o=>o.action))].sort(),blockers:current.plan.blockers.length}:null,...(safeError?{error:safeError}:{})});
  // Authentication/permission failures require operator diagnosis, never a different profile.
  if(authHealth.status!=='AUTH_HEALTHY'||['BLOCKED_AUTH','BLOCKED_PERMISSION'].includes(health.status)||safeError&&typeof safeError==='object'&&'code'in safeError&&String(safeError.code).startsWith('PF-AUTH-'))break;
 }
 const comparison=evaluateCredentialStability(cycles,reviewed);
 const failures=allRequests.filter(r=>r.entry.failure);
 const phaseTimeline=allRequests.filter(r=>r.entry.result==='STARTED').map(({cycle,entry})=>({cycle,requestId:entry.requestId,attempt:entry.attempt,phase:entry.category,pathTemplate:entry.pathTemplate,query:entry.query,requestShapeHash:entry.requestShapeHash,pageIndex:entry.pageIndex,continuation:entry.continuation,startedAt:entry.startedAt}));
 const report={...comparison,cycles:summaries,failedAttemptCount:failures.length,failedEndpointComparison:failures.map(({cycle,entry})=>({cycle,pathTemplate:entry.pathTemplate,requestShapeHash:entry.requestShapeHash,phase:entry.category,result:entry.result,failure:entry.failure,attempt:entry.attempt,pageIndex:entry.pageIndex})),tenantEffects:{metadataWrites:0,securityWrites:0,canvasWrites:0,flowWrites:0,businessRows:0,authProfileChanges:0,bindingChanges:0},historicalEvidence:'V2.1b lacked failed-path/cause evidence; no retrospective root cause inferred',next:'Separate certification task must generate a final fresh plan and pass its explicit execution gate. This command never applies.'};
 await save('report.json',report);await save('transport-summary.json',{...comparison,cycles:summaries});await save('auth-events.json',allAuth);await save('failed-requests.json',failures);await save('phase-timeline.json',phaseTimeline);
 await save('reproduction.md',`# Dataverse read transport evidence\n\n${comparison.verdict}\n\nUse the existing environment binding and named MSAL profile. Run dataverse transport-doctor with the same reviewed spec/manifest into a fresh output directory. Three full live read-only cycles are attempted; auth/permission failure or cancellation stops early. No apply, authentication configuration, network configuration, publish or upload is performed.\n\nRequest traces include sanitized paths/query structure, request fingerprints, attempts, phase and service correlation IDs. They omit literal query values, full URLs, raw exceptions and service payloads. Fresh cycle directories hold local private observations and plans; only complete observations enter planning. Plans are time-bound review evidence, not write permission.\n`);
 if(!comparison.stabilityGatePassed)await writeTransportSupport(destination,resolve(destination,'support'));
 await save('artifact-index.json',artifacts.slice());return {...report,out:destination};
}
