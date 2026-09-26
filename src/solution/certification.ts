import {readProviderOutcomes} from './provider-outcomes.js';
import { evaluateAppValidation } from '../model-driven/validation.js';
import type { JsonValue } from '../core/json.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {projectSchema,type Project} from '../ir/schema.js';
import {resolveSolution} from './resolve.js';
import {solutionPlan} from './plan.js';
import {digest} from './compile.js';
import {certificationResources,createCertificationManifest} from '../planner/certification.js';
import {createPlan} from '../planner/dataverse.js';
import {executionPolicy} from '../dataverse/isolation.js';
import {DataverseDiscovery} from '../dataverse/discovery.js';
import {observeModel} from '../model-driven/discovery.js';
import {checkPermissions} from '../dataverse/preflight.js';
import {LocalStateStore} from '../state/local.js';
import {loadProject} from '../config/load.js';
import {connect} from '../cli/remote.js';
import {assertAuthEvidenceSafe} from '../auth/safe-evidence.js';
import {publicError} from '../core/errors.js';
import type {Observation,Ownership} from '../state/models.js';
import {transportHealth,transportConfiguration,type TransportOptions} from '../dataverse/transport.js';
import {ApiError} from '../dataverse/http.js';
import {TransportAuditLog} from '../dataverse/transport-audit.js';
import {CredentialError,credentialHealth,type CredentialEvent} from '../auth/credential-audit.js';
import type {DiscoveryCredentialContext} from '../auth/discovery-context.js';
import {randomUUID} from 'node:crypto';
import {ProfileStore} from '../auth/profiles.js';
import {EnvironmentStore} from '../auth/environments.js';

export function certificationPlan(raw:unknown,observation:Observation,ownership:Ownership,context?:Project,outcomes?:{unknown:string[];journalHashes:string[]}){
 const resolved=resolveSolution(raw);if(resolved.issues.some(i=>i.severity==='error'))throw Error('Certification fixture has semantic errors');
 const {project,spec}=resolved;const resources=certificationResources(project);
 const requiredBy=Object.fromEntries(resources.map(r=>{const alias=r.kind+':'+r.resourceId.split(':').at(-1)!.replaceAll('/','.');return [r.resourceId,resolved.requirements.filter(req=>req.resources.includes(alias)).map(req=>req.id)];}));
 const manifest=createCertificationManifest(project,digest(spec),observation,ownership,requiredBy);
 const native=createPlan(project,observation,ownership,'all',new Date(),executionPolicy(12,true,true,true,false),manifest);
 const evidence={...(outcomes?{executionOutcomes:outcomes}:{}),target:observation.target,observedAt:observation.observedAt,dataverse:{observation,ownership,plan:native}};
 const unified=solutionPlan(spec,evidence);
 const historical=certificationResources(context??project).filter(r=>!manifest.roots.some(root=>root.resourceId===r.resourceId)).map(r=>{
  const live=observation.resources.find(o=>o.resourceId===r.resourceId),owned=ownership.resources.find(o=>o.resourceId===r.resourceId);
  const sourceDifferences=live?Object.keys(r.properties).filter(k=>digest(r.properties[k]??null)!==digest(live.properties[k]??null)):['missing'];
  const baselineDifferences=owned&&live?Object.keys(owned.baseline).filter(k=>digest(owned.baseline[k]??null)!==digest(live.properties[k]??null)):['missing'];
  const dependency=manifest.existingDependencies.some(d=>d.resourceId===r.resourceId);
  return {resourceId:r.resourceId,kind:r.kind,schemaName:r.schemaName,classification:dependency?'REQUIRED_EXISTING_DEPENDENCY':sourceDifferences.length||baselineDifferences.length?'OUT_OF_SCOPE_DRIFT':'CONTEXT_ONLY',sourceDifferences,baselineDifferences,observed:live?.properties??null,receipt:owned?.baseline??null,desiredContext:r.properties,disposition:'Read-only observation; no baseline adoption or repair'};
 });
 return {manifest,native,evidence,unified,historical,summary:{status:native.blockers.length||unified.ir.validation.blockers.length?'CERTIFICATION_PLAN_STILL_BLOCKED':native.deferred?.length&&!native.operations.length?'PROVIDER_CONVERGED_WITH_DEFERRED_PUBLICATION':'CERTIFICATION_PLAN_READY_FOR_REVIEW',readiness:unified.ir.readiness,certificationProof:false,mutationAuthorized:false,tenantMutations:0,authenticationProfilesChanged:0,counts:{desiredLogicalResources:manifest.roots.length,existingDependencies:manifest.existingDependencies.length,plannedOperations:native.operations.length,deferredResources:native.deferred?.length??0,noOpRoots:manifest.roots.length-native.operations.length-(native.deferred?.length??0),securityOperations:native.certification!.closure.securityOperations.length,publicationOperations:native.operations.filter(o=>o.action==='publish').length,historicalUpdates:0,deletes:0},blockers:native.blockers,unifiedBlockers:unified.ir.validation.blockers,planHash:native.contentHash,unifiedPlanHash:unified.contentHash,expiresAt:native.expiresAt,applyBoundary:'V2.1a is planning only. Existing apply executors reject certification manifests pending separately implemented/reviewed authorization.'}};
}
export function certificationDiscoveryProject(base:Project,p:Project):Project{
  const merge=<T>(a:Record<string,T>,b:Record<string,T>)=>{for(const key of Object.keys(b))if(key in a&&digest(a[key])!==digest(b[key]))throw Error('Discovery context key conflicts: '+key);return {...a,...b};};
  return projectSchema.parse({...base,dataverse:{tables:merge(base.dataverse.tables,p.dataverse.tables),relationships:merge(base.dataverse.relationships,p.dataverse.relationships),choices:merge(base.dataverse.choices??{},p.dataverse.choices??{}),keys:merge(base.dataverse.keys??{},p.dataverse.keys??{})},apps:merge(base.apps,p.apps),security:{roles:merge(base.security.roles,p.security.roles),appAccess:merge(base.security.appAccess,p.security.appAccess)}});
}
/** Read-only network path. Original project supplies only target, receipts and diagnostic context. */
export async function liveCertificationPlan(directory:string,raw:unknown,alias:string,out:string,options:TransportOptions&{expectedPrincipal?:string;credentialMode?:'observe'|'cycle'}={}){
 const destination=resolve(out);await mkdir(destination); // Refuse reuse of any existing run directory.
 const artifacts:{file:string;sha256:string}[]=[];
 const save=async(file:string,value:unknown)=>{assertAuthEvidenceSafe(value);const bytes=JSON.stringify(value,null,2)+'\n';await writeFile(resolve(destination,file),bytes,{flag:'wx'});artifacts.push({file,sha256:createHash('sha256').update(bytes).digest('hex')});};
 const startedAt=new Date().toISOString();
 const audit=await TransportAuditLog.create(resolve(destination,'requests.ndjson'),options.audit);const requests=audit.entries;
 const authAudit=await TransportAuditLog.create<CredentialEvent>(resolve(destination,'auth-events.ndjson'),options.credentials?.audit);
 const transportOptions:TransportOptions={...options,readOnly:true,audit:entry=>audit.record(entry),credentials:{cycleId:randomUUID(),environment:alias,mode:options.credentialMode??'cycle',audit:entry=>authAudit.record(entry)}};
 let credentialContext:DiscoveryCredentialContext|undefined;
 await save('transport-configuration.json',transportConfiguration());
 try{
  const original=await loadProject(directory),resolved=resolveSolution(raw);if(resolved.project.project.id!==original.project.project.id)throw Error('Certification project must match the bound ownership identity');
  const c=await connect(directory,alias,transportOptions);credentialContext=c.credentialContext;if(c.environment.organizationType!==12)throw Error('This certification contract requires the verified Default environment');
  c.credentialContext?.bindPrincipal(c.identity.UserId,options.expectedPrincipal);
  if(options.expectedPrincipal&&c.identity.UserId.toLowerCase()!==options.expectedPrincipal.toLowerCase())throw Error('Expected Dataverse principal differs; no profile changes are allowed');
  const store=new LocalStateStore(directory,original.project.project.id,c.binding.target),ownership=await store.readOwnership();if(!ownership)throw Error('Existing ownership receipts are required');
  await save('target.json',{binding:c.binding,principalId:c.identity.UserId,organizationType:c.environment.organizationType,tenantMutations:0});await save('ownership.json',ownership);
  await save('credential-context.json',{mode:options.credentialMode??'cycle',profileStoreExists:true,profileEntryExists:true,profile:c.profile.alias,environment:c.binding.alias,profileHash:digest(c.profile),principalId:c.identity.UserId,accountFound:authAudit.entries.some(e=>e.accountFound===true),protectedCacheAccessible:authAudit.entries.some(e=>e.cacheProviderAccessible===true),credentialInitializationBeforeDiscovery:!!c.credentialContext,credentialMaterialRecorded:false});
  const organization=(await c.http.request(`organizations(${c.binding.target.organizationId})?$select=languagecode`)).data as {languagecode?:number};
  const permissions=await checkPermissions(c.http,c.identity.UserId,true);await save('permissions.json',{language:organization.languagecode,permissions});if(organization.languagecode!==1033||permissions.missing.length)throw Error('Existing language/permissions preflight failed');
  const p=resolved.project,base=original.project;
  const context=certificationDiscoveryProject(base,p);
  const observed=await observeModel(context,await new DataverseDiscovery(c.http).observe(context,c.binding.target,ownership),c.http,ownership);
  for(const app of observed.resources.filter(r=>r.kind==='app'&&r.resourceId.endsWith(':app:certification'))){const response=(await c.http.request(`ValidateApp(AppModuleId=${app.remoteId})`)).data;app.properties.validationResponse=response as JsonValue;await save('app-validation.json',evaluateAppValidation(response));}
  await save('observation.json',observed);await save('fixture.json',resolved.spec);
  const outcomes=await readProviderOutcomes(store.root,ownership,new Set(certificationResources(p).map(r=>r.resourceId)));await save('execution-outcomes.json',outcomes);
  const result=certificationPlan(resolved.spec,observed,ownership,base,{unknown:outcomes.unknown,journalHashes:outcomes.journalHashes});
  for(const [name,value]of Object.entries(result))await save(name+'.json',value);
  if(digest((await loadProject(directory)).project)!==digest(base)||digest(await store.readOwnership())!==digest(ownership))throw Error('Source or ownership changed during preflight');
  if(digest(await new ProfileStore().get(c.binding.authProfile))!==digest(c.profile)||digest(await new EnvironmentStore(directory).get(alias))!==digest(c.binding)){c.credentialContext?.invalidate();throw Error('Credential profile or target binding changed during discovery');}
  await save('read-only-audit.json',{requests,originalSourceUnchanged:true,ownershipUnchanged:true,tenantMutations:0,authProfileChanges:0,capabilityPromotions:0});
  return {...result.summary,out:destination};
 }catch(error){const safe=publicError(error);const failedRequest=error instanceof ApiError?error.transportEvidence:requests.findLast(r=>r.result==='FAILED');await save('failure.json',{status:'CERTIFICATION_PLAN_STILL_BLOCKED',observationComplete:false,planGenerated:false,error:{code:safe.code,message:safe.message,...(error instanceof CredentialError?{credentialFailure:error.credentialFailure}:{}),...(failedRequest?{transport:failedRequest}:{})},tenantMutations:0});throw error;}
 finally{credentialContext?.invalidate();await save('auth-health.json',credentialHealth(authAudit.entries));await save('auth-events.json',authAudit.entries);await save('transport-summary.json',transportHealth(requests,startedAt));await save('artifact-index.json',[...artifacts,{file:'requests.ndjson',sha256:await audit.sha256()},{file:'auth-events.ndjson',sha256:await authAudit.sha256()}]);}
}
