import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {loadProject,parseConfigData,readConfigSource} from '../config/load.js';
import {resolveSolution} from './resolve.js';
import {digest} from './compile.js';
import {liveCertificationPlan} from './certification.js';
import {certificationExecutionManifest,type CertificationExecutionInput} from '../execution/certification.js';
import {attestPreWrite,derivePreWriteReadSet,requireAttestationPass} from '../execution/attestation.js';
import {LocalStateStore} from '../state/local.js';
import {planSchema,ownershipSchema,observationSchema} from '../state/models.js';
import {connect} from '../cli/remote.js';
import {EnvironmentStore,verifyTarget} from '../auth/environments.js';
import {ProfileStore} from '../auth/profiles.js';
import {credentialHealth,type CredentialEvent} from '../auth/credential-audit.js';
import {assertAuthEvidenceSafe} from '../auth/safe-evidence.js';
import {TransportAuditLog} from '../dataverse/transport-audit.js';
import {transportHealth,type TransportOptions} from '../dataverse/transport.js';
import {publicError} from '../core/errors.js';

const json=async(path:string):Promise<unknown>=>JSON.parse(await readFile(path,'utf8'));
/** Deliberately has no mutation adapter, authorization receipt, apply call or non-GET client. */
export async function proveCertificationAttestation(directory:string,specPath:string,alias:string,out:string,reviewedDirectory:string,expectedPrincipal:string){
 const destination=resolve(out);await mkdir(destination);const artifacts:{file:string;sha256:string}[]=[];
 const save=async(file:string,value:unknown)=>{assertAuthEvidenceSafe(value);const bytes=JSON.stringify(value,null,2)+'\n';await writeFile(join(destination,file),bytes,{flag:'wx'});artifacts.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});};
 const raw=parseConfigData(await readConfigSource(resolve(specPath))),resolved=resolveSolution(raw),original=(await loadProject(directory)).project;
 const binding=await new EnvironmentStore(directory).get(alias),profile=await new ProfileStore().get(binding.authProfile);
 const store=new LocalStateStore(directory,resolved.project.project.id,binding.target),before=await store.readOwnership();
 await save('before-state.json',{bindingHash:digest(binding),profileHash:digest(profile),sourceHash:digest(original),ownershipHash:digest(before??null),ownershipRevision:before?.revision});
 const cycles:{cycle:number;result:string;classification:string;logicalReads:number;dispatches:number;retries:number;recovered:number;unrecovered:number}[]=[];
 try{
  const preflight=join(destination,'preflight');await liveCertificationPlan(directory,raw,alias,preflight,{expectedPrincipal});
  const auth=await json(join(preflight,'auth-health.json')) as {status:string},reads=await json(join(preflight,'transport-summary.json')) as {status:string};
  const input:CertificationExecutionInput={project:resolved.project,fixtureHash:digest(resolved.spec),plan:planSchema.parse(await json(join(preflight,'native.json'))),ownership:ownershipSchema.parse(await json(join(preflight,'ownership.json'))),observation:observationSchema.parse(await json(join(preflight,'observation.json'))),reviewedPlan:planSchema.parse(await json(join(reviewedDirectory,'native.json'))),historical:await json(join(preflight,'historical.json')),reviewedHistorical:await json(join(reviewedDirectory,'historical.json')),authHealth:auth.status,readHealth:reads.status==='HEALTHY'?'READ_HEALTHY':reads.status==='DEGRADED_RECOVERED'?'READ_DEGRADED_RECOVERED':'READ_UNSTABLE'};
  await save('execution-intent-manifest.json',certificationExecutionManifest(input));
  await save('pre-write-read-set.json',derivePreWriteReadSet(input));
  for(let cycle=1;cycle<=3;cycle++){
   const prefix=`cycle-${cycle}`;await mkdir(join(destination,prefix));
   const requests=await TransportAuditLog.create(join(destination,prefix,'requests.ndjson')),authLog=await TransportAuditLog.create<CredentialEvent>(join(destination,prefix,'auth-events.ndjson'));
   const startedAt=new Date().toISOString(),transport:TransportOptions={readOnly:true,audit:e=>requests.record(e),credentials:{mode:'cycle',cycleId:randomUUID(),environment:alias,audit:e=>authLog.record(e)}};
   let c:Awaited<ReturnType<typeof connect>>|undefined;
   try{
    c=await connect(directory,alias,transport);const connection=c;
    if(!connection.credentialContext)throw Error('A healthy named credential context is required');
    connection.credentialContext.bindPrincipal(connection.identity.UserId,expectedPrincipal);
    const result=await store.withLock(async()=>{
     const result=await attestPreWrite(input,connection.http,{
      ownership:()=>store.readOwnership(),
      verifyTarget:async()=>{
       if(digest(await new EnvironmentStore(directory).get(alias))!==digest(binding)||digest(await new ProfileStore().get(profile.alias))!==digest(profile)||digest((await loadProject(directory)).project)!==digest(original)||digest(parseConfigData(await readConfigSource(resolve(specPath))))!==digest(raw))throw Error('Source/profile/binding changed');
       const verified=await verifyTarget(connection.profile,connection.binding,connection.credentialContext!,transport);
       connection.credentialContext!.bindPrincipal(verified.identity.UserId,expectedPrincipal);
       if(verified.environment.organizationType!==12)throw Error('Target is no longer the reviewed Default environment');
       return {target:connection.binding.target,principalId:verified.identity.UserId,authStatus:credentialHealth(authLog.entries).status};
      },
     });
     await save(prefix+'/pre-write-read-set.json',result.readSet);await save(prefix+'/pre-write-attestation.json',result.attestation);
     return result;
    });
    requireAttestationPass(result.attestation,result.readSet);
    const health=transportHealth(requests.entries,startedAt),absences=result.attestation.expectedAbsenceResponses;
    cycles.push({cycle,result:result.attestation.result,classification:result.attestation.classification,logicalReads:health.requestsTotal,dispatches:health.httpDispatchAttempts,retries:health.retries,recovered:health.recoveredTransientFailures,unrecovered:health.failedRequests-absences});
   }catch(error){const safe=publicError(error);await save(prefix+'/failure.json',{code:safe.code,message:safe.message,mutationAuthorized:false});if(!cycles.some(c=>c.cycle===cycle)){const h=transportHealth(requests.entries,startedAt);cycles.push({cycle,result:'INCOMPLETE',classification:'READ_INCOMPLETE',logicalReads:h.requestsTotal,dispatches:h.httpDispatchAttempts,retries:h.retries,recovered:h.recoveredTransientFailures,unrecovered:h.failedRequests});}break;}
   finally{c?.credentialContext?.invalidate();await save(prefix+'/auth-health.json',credentialHealth(authLog.entries));await save(prefix+'/auth-events.json',authLog.entries);await save(prefix+'/transport-summary.json',transportHealth(requests.entries,startedAt));artifacts.push({file:prefix+'/requests.ndjson',sha256:await requests.sha256()},{file:prefix+'/auth-events.ndjson',sha256:await authLog.sha256()});}
  }
 }catch(error){const safe=publicError(error);await save('failure.json',{code:safe.code,message:safe.message,mutationAuthorized:false});}
 const integrity={ownershipUnchanged:digest(await store.readOwnership()??null)===digest(before??null),profileUnchanged:digest(await new ProfileStore().get(profile.alias))===digest(profile),bindingUnchanged:digest(await new EnvironmentStore(directory).get(alias))===digest(binding),sourceUnchanged:digest((await loadProject(directory)).project)===digest(original)};
 const passed=cycles.length===3&&cycles.every(c=>c.result==='PASS'&&c.unrecovered===0)&&Object.values(integrity).every(Boolean);
 const report={verdict:passed?'SCOPE-BOUND PRE-WRITE ATTESTATION VERIFIED — V2.1 LIVE EXECUTION MAY BE REPLANNED':'SCOPE-BOUND PRE-WRITE ATTESTATION INCOMPLETE — CERTIFICATION REMAINS BLOCKED',cycles,integrity,mutationAuthorized:false,executionReceiptsCreated:0,metadataWrites:0,securityWrites:0,canvasWrites:0,flowWrites:0,businessRows:0,publishXml:0,appModulePublishes:0,profileChanges:0,bindingChanges:0,capabilityPromotions:0};
 await save('report.json',report);await save('artifact-index.json',artifacts);return report;
}
