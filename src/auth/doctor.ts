import {z} from 'zod';
import {ProfileStore,type StoredProfile} from './profiles.js';
import {EnvironmentStore,verifyTarget,type EnvironmentBinding} from './environments.js';
import {MicrosoftSession} from './msal.js';
import {loadProject} from '../config/load.js';
import type {Project} from '../ir/schema.js';
import {nameSchema} from '../ir/schema.js';
import {LocalStateStore} from '../state/local.js';
import type {Ownership,Target} from '../state/models.js';
import {hashJson} from '../core/json.js';
import {guidValue,rawObject} from '../dataverse/normalize.js';
import {projection} from '../planner/dataverse.js';
import {desiredResources} from '../dataverse/desired.js';
import {pacInventory,type PacInventory} from './pac-inventory.js';
import {assertAuthEvidenceSafe} from './safe-evidence.js';
import {publicError} from '../core/errors.js';

export type AuthDoctorState='READY'|'BINDING_MISSING'|'PROFILE_MISSING'|'PROFILE_STORE_MISMATCH'|'PROFILE_ENUMERATION_FAILED'|'PROFILE_TARGET_MISMATCH'|'AUTHENTICATION_FAILED'|'ENVIRONMENT_MISMATCH'|'PRINCIPAL_MISMATCH'|'SOLUTION_MISSING'|'SOLUTION_MISMATCH'|'PUBLISHER_MISMATCH'|'OWNERSHIP_UNVERIFIED';
type Connection=Awaited<ReturnType<typeof verifyTarget>>;
export interface AuthDoctorPorts{
 profiles:Pick<ProfileStore,'root'|'legacyCompatibility'|'list'>;
 binding():Promise<EnvironmentBinding>;
 project():Promise<Project>;
 connect(profile:StoredProfile,binding:EnvironmentBinding):Promise<Connection>;
 ownership(project:Project,target:Target):Promise<Ownership|undefined>;
 pac():Promise<PacInventory>;
}
export async function authDoctor(directory:string,options:{environment?:string;pac?:string;dotnetRoot?:string;expectedPrincipal?:string}={},ports?:AuthDoctorPorts){
 const store=new ProfileStore();const io=ports??{profiles:store,binding:()=>new EnvironmentStore(directory).get(options.environment),project:async()=>(await loadProject(directory)).project,connect:async(profile:StoredProfile,binding:EnvironmentBinding)=>verifyTarget(profile,binding,await MicrosoftSession.create(store,profile)),ownership:(project:Project,target:Target)=>new LocalStateStore(directory,project.project.id,target).readOwnership(),pac:()=>pacInventory(options.pac,options.dotnetRoot)};
 const report:{status:AuthDoctorState;verified:boolean;verifiedAt:string;tenantMutations:number;authProfilesChanged:number;profileStore:object;pac?:PacInventory;binding?:EnvironmentBinding;profiles?:object[];candidates?:string[];checks:object[];principal?:object;solution?:object;publisher?:object;error?:object;ownership?:object;sourceDifferences:object[];note:string}={status:'AUTHENTICATION_FAILED',verified:false,verifiedAt:new Date().toISOString(),tenantMutations:0,authProfilesChanged:0,profileStore:{root:io.profiles.root,legacyCompatibility:io.profiles.legacyCompatibility},checks:[],sourceDifferences:[],note:'Read-only authentication/solution/publisher ownership preflight. No provider certification, grants or metadata apply. PAC selection is independent.'};
 let phase='binding';
 const stop=(status:AuthDoctorState,detail:string)=>{report.status=status;report.checks.push({phase,status,detail});assertAuthEvidenceSafe(report);return report;};
 try{
  report.pac=await io.pac();const binding=await io.binding();report.binding=binding;
  phase='profileEnumeration';const profiles=await io.profiles.list();report.profiles=profiles.map(p=>({name:p.alias,tenantId:p.tenantId,environmentIds:p.allowedEnvironmentIds,environmentUrl:p.preferredDataverseUrl??null,cloud:p.cloud,type:p.mode}));
  const profile=profiles.find(p=>p.alias===binding.authProfile);
  report.candidates=profiles.filter(p=>p.alias!==binding.authProfile&&p.tenantId===binding.target.tenantId&&p.allowedEnvironmentIds.includes(binding.target.environmentId)&&(!p.preferredDataverseUrl||p.preferredDataverseUrl===binding.target.dataverseUrl)).map(p=>p.alias);
  if(!profile)return stop('PROFILE_MISSING','Expected named PowerCanvas profile absent. Candidates are informational; no profile was selected or created.');
  phase='profileTarget';if(profile.tenantId!==binding.target.tenantId||profile.cloud!=='public'||!profile.allowedEnvironmentIds.includes(binding.target.environmentId)||profile.preferredDataverseUrl&&profile.preferredDataverseUrl!==binding.target.dataverseUrl)return stop('PROFILE_TARGET_MISMATCH','Named profile tenant/cloud/environment restrictions differ from the fixed binding.');
  report.checks.push({phase,status:'PASS',profileName:profile.alias});
  phase='authentication';const connected=await io.connect(profile,binding);
  if(hashJson(connected.environment.tenantId)!==hashJson(binding.target.tenantId)||connected.environment.environmentId!==binding.target.environmentId||connected.environment.dataverseUrl!==binding.target.dataverseUrl||connected.environment.organizationId!==binding.target.organizationId||connected.identity.OrganizationId.toLowerCase()!==binding.target.organizationId)return stop('ENVIRONMENT_MISMATCH','Discovery/WhoAmI differ from expected target.');
  const principalId=guidValue(connected.identity.UserId);if(options.expectedPrincipal&&principalId!==z.guid().parse(options.expectedPrincipal).toLowerCase())return stop('PRINCIPAL_MISMATCH','WhoAmI does not match the explicitly expected principal.');
  report.principal={principalId,accountBinding:'Existing MSAL tenant/home-account identity checked',whoAmIRequestId:connected.requestId};report.checks.push({phase:'environmentAndWhoAmI',status:'PASS',organizationType:connected.environment.organizationType});
  phase='project';const project=await io.project();const solutionName=nameSchema.parse(project.solution.uniqueName);
  phase='solution';const solutions=await connected.http.all(`solutions?$select=solutionid,uniquename,friendlyname,version,ismanaged,_publisherid_value&$filter=uniquename eq '${solutionName}'`);
  if(!solutions.length)return stop('SOLUTION_MISSING','Expected existing solution was not found.');if(solutions.length!==1||solutions[0]!.uniquename!==solutionName||solutions[0]!.ismanaged!==false)return stop('SOLUTION_MISMATCH','Exact unique name and unmanaged solution identity required.');
  const solution=solutions[0]!,solutionId=guidValue(solution.solutionid),publisherId=guidValue(solution._publisherid_value);
  report.solution={id:solutionId,uniqueName:solution.uniquename,managed:false};
  phase='publisher';const publisher=rawObject((await connected.http.request(`publishers(${publisherId})?$select=publisherid,uniquename,customizationprefix,customizationoptionvalueprefix`)).data);
  if(guidValue(publisher.publisherid)!==publisherId||publisher.uniquename!==project.solution.publisher.uniqueName||publisher.customizationprefix!==project.solution.publisher.prefix||publisher.customizationoptionvalueprefix!==project.solution.publisher.optionValuePrefix)return stop('PUBLISHER_MISMATCH','Live publisher identity/prefix/options differ from project configuration.');
  report.publisher={id:publisherId,uniqueName:publisher.uniquename,prefix:publisher.customizationprefix,optionValuePrefix:publisher.customizationoptionvalueprefix};
  phase='ownership';const ownership=await io.ownership(project,binding.target);
  if(!ownership||ownership.projectId!==project.project.id||hashJson(ownership.target)!==hashJson(binding.target))return stop('OWNERSHIP_UNVERIFIED','Exact project/target ownership receipts are missing.');
  const desired=desiredResources(project).filter(r=>['solution','publisher'].includes(r.kind));
  for(const r of desired){const owned=ownership.resources.find(o=>o.resourceId===r.resourceId);const remoteId=r.kind==='solution'?solutionId:publisherId;const properties=r.kind==='solution'?{uniqueName:solution.uniquename,displayName:solution.friendlyname,version:solution.version,publisherUniqueName:publisher.uniquename}:{uniqueName:publisher.uniquename,prefix:publisher.customizationprefix,optionValuePrefix:publisher.customizationoptionvalueprefix};
   const parsed=z.record(z.string(),z.json()).parse(properties);
   if(!owned||owned.provider!=='dataverse'||owned.remoteId!==remoteId||owned.lastVerifiedHash!==hashJson(owned.baseline)||hashJson(projection({resourceId:r.resourceId,provider:'dataverse',remoteId,kind:r.kind,schemaName:r.schemaName,properties:parsed},owned.baseline))!==hashJson(owned.baseline))return stop('OWNERSHIP_UNVERIFIED','Stable solution/publisher identity or live owned properties differ from receipts.');
   for(const property of Object.keys(r.properties))if(hashJson(r.properties[property]??null)!==hashJson(owned.baseline[property]??null))report.sourceDifferences.push({resource:r.resourceId,property,source:r.properties[property],ownedLive:owned.baseline[property]??null,note:'Desired source change; not remote drift. Existing planner/policy must review it before any later apply.'});
  }
  report.ownership={status:'VERIFIED',revision:ownership.revision,resources:desired.map(r=>r.resourceId),scope:'Solution and publisher only; no certification resource ownership inferred'};report.status='READY';report.verified=true;report.checks.push({phase,status:'PASS'});assertAuthEvidenceSafe(report);return report;
 }catch(error){const safe=publicError(error);report.error={code:safe.code};const code=safe.code;return stop(phase==='binding'?'BINDING_MISSING':phase==='profileEnumeration'?'PROFILE_ENUMERATION_FAILED':code==='PF-AUTH-005'?'PRINCIPAL_MISMATCH':code==='PF-ENV-003'?'ENVIRONMENT_MISMATCH':phase==='publisher'?'PUBLISHER_MISMATCH':phase==='solution'?'SOLUTION_MISSING':phase==='ownership'?'OWNERSHIP_UNVERIFIED':'AUTHENTICATION_FAILED','Read-only check failed; no automatic retry, profile creation or rebinding.');}
}
