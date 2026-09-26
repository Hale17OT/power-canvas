import {hashJson,type JsonInput} from '../core/json.js';
import {canonicalGlobalChoiceName} from '../dataverse/global-choice.js';
import {PowerCanvasError} from '../core/errors.js';
import type {Project} from '../ir/schema.js';
import {desiredResources,type DesiredResource} from '../dataverse/desired.js';
import {modelResources} from '../model-driven/desired.js';
import {experimentIsolation} from '../dataverse/isolation.js';
import {certificationManifestSchema,type CertificationManifest,type CertificationReport,type Observation,type Ownership,type PlannedOperation,type PublishScope} from '../state/models.js';

const digest=(value:unknown)=>hashJson(value as JsonInput);
const allowedActions=['createChoice','createTable','createColumn','createRelationship','createKey','createForm','createView','createSitemap','createApp','createRole','grantRolePrivileges','addAppComponents','setAppAccess'].sort();
const allowedKinds=new Set(['choice','table','column','relationship','key','form','view','sitemap','app','role','rolePermissions','appComponents','appAccess']);
const fail=(message:string):never=>{throw new PowerCanvasError('PF-CERT-001',message,'Correct the exact certification fixture/dependencies and regenerate its manifest; no ignore-blocker switch is supported.');};
export const certificationResources=(project:Project)=>[...desiredResources(project),...modelResources(project)];
export function mutationClosure(resources:readonly DesiredResource[],roots:readonly string[]):string[]{
 const byId=new Map(resources.map(r=>[r.resourceId,r]));if(byId.size!==resources.length)fail('Duplicate certification graph identity');
 const visited=new Set<string>(),active=new Set<string>();
 const visit=(id:string)=>{if(active.has(id))fail('Certification dependency cycle');if(visited.has(id))return;const r=byId.get(id);if(!r)fail('Unresolved certification dependency: '+id);active.add(id);for(const dependency of r!.dependencies)visit(dependency);active.delete(id);visited.add(id);};
 for(const root of roots)visit(root);return [...visited].sort();
}
/** Produces intent, not proof or authorization. Existing receipts are never rewritten. */
export function createCertificationManifest(project:Project,fixtureHash:string,observation:Observation,ownership:Ownership,requiredBy:Record<string,string[]>,existingIds?:string[]):CertificationManifest{
 const resources=certificationResources(project),deps=existingIds??resources.filter(r=>['solution','publisher'].includes(r.kind)).map(r=>r.resourceId);
 const body={version:1 as const,intent:'PROVIDER_CERTIFICATION' as const,evidenceState:'ATTEMPT_INTENT_ONLY' as const,projectId:project.project.id,fixtureHash,projectHash:digest(project),target:observation.target,namespace:'pfx_ExperimentCertification' as const,
 roots:resources.filter(r=>!deps.includes(r.resourceId)).map(r=>({resourceId:r.resourceId,definitionHash:digest(r),requiredBy:requiredBy[r.resourceId]??[]})),
 existingDependencies:deps.map(resourceId=>{const r=resources.find(v=>v.resourceId===resourceId),owned=ownership.resources.find(o=>o.resourceId===resourceId);if(!r||!owned)fail('Missing existing dependency receipt: '+resourceId);return {resourceId,remoteId:owned!.remoteId,baselineHash:digest(owned!.baseline),displayNamePolicy:r!.kind==='solution'?'preserveExisting' as const:'exact' as const};}),
 allowedActions,expectedPublication:[],forbidden:'historicalUpdates,deletes,businessData,Canvas,Flow,authentication' as const,applyAuthorization:'REQUIRED_SEPARATE_REVIEW' as const};
 const manifest=certificationManifestSchema.parse({...body,contentHash:digest(body)});evaluateCertification(project,observation,ownership,manifest);return manifest;
}
export function evaluateCertification(project:Project,observation:Observation,ownership:Ownership|undefined,raw:CertificationManifest):CertificationReport{
 const manifest=certificationManifestSchema.parse(raw),{contentHash,...body}=manifest;
 if(contentHash!==digest(body)||manifest.projectHash!==digest(project)||manifest.projectId!==project.project.id||observation.projectId!==project.project.id||digest(manifest.target)!==digest(observation.target)||!ownership||ownership.projectId!==project.project.id||digest(ownership.target)!==digest(observation.target))fail('Certification source, target or ownership binding differs');
 if(digest(manifest.allowedActions)!==digest(allowedActions)||manifest.expectedPublication.length)fail('Certification operation allowance differs from create-only contract');
 experimentIsolation(project,true);
 if(Object.keys(project.canvasApps??{}).length||project.resources&&Object.entries(project.resources).some(([,v])=>Array.isArray(v)?v.length:!!v&&typeof v==='object'&&Object.keys(v).length))fail('Canvas/Flow resources are outside certification');
 if(Object.values(project.apps).some(a=>Object.keys(a.commands??{}).length||a.publishPolicy!=='manual'))fail('Certification apps require manual publication and no commands');
 if(Object.values(project.security.roles).some(role=>Object.values(role.tables).some(grants=>Object.entries(grants).some(([action,depth])=>!['read','create'].includes(action)||!['none','user'].includes(depth??'')))))fail('Certification privileges are bounded to Basic read/create');
 const resources=certificationResources(project),byId=new Map(resources.map(r=>[r.resourceId,r]));
 const roots=new Set(manifest.roots.map(r=>r.resourceId)),deps=new Set(manifest.existingDependencies.map(r=>r.resourceId));
 if(roots.size!==manifest.roots.length||deps.size!==manifest.existingDependencies.length||[...roots].some(id=>deps.has(id))||resources.length!==roots.size+deps.size)fail('Every desired node must be exactly one certification root or explicit existing dependency');
 for(const root of manifest.roots){const r=byId.get(root.resourceId);if(!r||digest(r)!==root.definitionHash||!allowedKinds.has(r.kind))fail('Certification definition/type differs from manifest');
  if(r!.provider!=='model-driven'&&!r!.schemaName.startsWith(manifest.namespace))fail('Resource escapes certification namespace');
  if(r!.kind==='table'&&!(r!.properties.primaryColumn as {schemaName:string}).schemaName.startsWith(manifest.namespace))fail('Primary name escapes certification namespace');
  if(r!.kind==='relationship'&&!(r!.properties.lookup as {schemaName:string}).schemaName.startsWith(manifest.namespace))fail('Lookup escapes certification namespace');
  if(r!.provider==='model-driven'&&['app','sitemap'].includes(r!.kind)&&!String(r!.properties.uniqueName).startsWith(manifest.namespace))fail('Model identity escapes certification namespace');
  if(['role','form','view'].includes(r!.kind)&&!String(r!.properties.displayName).startsWith('PowerCanvas Experiment Certification '))fail('Model label escapes certification namespace');
 }
 const closure=mutationClosure(resources,[...roots]);if(closure.length!==resources.length||[...deps].some(id=>!closure.includes(id)))fail('Unrelated existing dependencies are not permitted');
 const context:CertificationReport['context']=[];
 for(const dependency of manifest.existingDependencies){const r=byId.get(dependency.resourceId),live=observation.resources.find(o=>o.resourceId===dependency.resourceId),owned=ownership!.resources.find(o=>o.resourceId===dependency.resourceId);
  if(!r||!live||!owned||live.remoteId!==dependency.remoteId||owned.remoteId!==dependency.remoteId||owned.provider!==live.provider||owned.lastVerifiedHash!==digest(owned.baseline)||dependency.baselineHash!==digest(owned.baseline)||live.properties.isManaged!==false||live.properties.customizable===false)fail('Existing dependency identity, unmanaged status or receipt differs');
  if(Object.keys(owned!.baseline).some(k=>digest(owned!.baseline[k])!==digest(live!.properties[k]??null)))fail('Required existing dependency has baseline drift: '+dependency.resourceId);
  if(dependency.displayNamePolicy==='preserveExisting'&&r!.kind!=='solution')fail('Preserve-existing display policy is only for the explicit bound solution');
  if(Object.keys(r!.properties).some(k=>!(r!.kind==='solution'&&k==='displayName'&&dependency.displayNamePolicy==='preserveExisting')&&digest(r!.properties[k])!==digest(live!.properties[k]??null)))fail('Required dependency definition differs');
  context.push({resourceId:dependency.resourceId,classification:'REQUIRED_EXISTING_DEPENDENCY',changedProperties:[]});
 }
 if(!resources.filter(r=>['solution','publisher'].includes(r.kind)).every(r=>deps.has(r.resourceId)))fail('Solution and publisher must be existing bound dependencies');
 for(const owned of ownership!.resources){if(closure.includes(owned.resourceId))continue;const live=observation.resources.find(r=>r.resourceId===owned.resourceId);
  if(String(owned.baseline.schemaName??owned.baseline.uniqueName??'').startsWith(manifest.namespace)||owned.resourceId.split(':')[3]==='choice'&&String(owned.baseline.schemaName??'').startsWith(canonicalGlobalChoiceName(manifest.namespace))||String(owned.baseline.displayName??'').startsWith('PowerCanvas Experiment Certification '))fail('Removing an owned certification resource is forbidden');
  const changedProperties=live?Object.keys(owned.baseline).filter(k=>digest(owned.baseline[k])!==digest(live.properties[k]??null)):['missing'];
  context.push({resourceId:owned.resourceId,classification:changedProperties.length?'OUT_OF_SCOPE_DRIFT':'CONTEXT_ONLY',changedProperties});
 }
 return {manifest,closure:{resources:closure,resourcesToCreate:[],resourcesToUpdate:[],resourcesToPublish:[],securityOperations:[],requiredExistingDependencies:[...deps].sort()},context,publishScopes:[]};
}
/** UI updates trace only to their affected component; create-only metadata needs no publish. */
export function calculatePublishScopes(resources:readonly DesiredResource[],operations:readonly PlannedOperation[],publishApps=false):PublishScope[]{
 const result:PublishScope[]=[];
 for(const op of operations){const r=resources.find(v=>v.resourceId===op.resourceId);if(!r)continue;
  if(r.kind==='app'){if(publishApps)result.push({reason:'EXPLICIT_APP_POLICY',resources:[r.resourceId],sourceOperations:[op.id]});continue;}
  if(op.before===null||op.classification!=='safeUpdate')continue;
  const affected=['table','choice','sitemap'].includes(r.kind)?r:resources.find(v=>v.kind==='table'&&v.schemaName===r.properties.tableSchemaName);
  if(affected&&['table','choice','column','form','view','sitemap'].includes(r.kind))result.push({reason:'UI_UPDATE',resources:[affected.resourceId],sourceOperations:[op.id]});
 }
 return result;
}
export function auditPublicationClosure(scopes:readonly PublishScope[],resources:readonly DesiredResource[],operations:readonly PlannedOperation[],closure:readonly string[],publishApps=false):void{
 const expected=calculatePublishScopes(resources,operations,publishApps);
 if(digest(scopes)!==digest(expected)||scopes.some(s=>s.resources.some(r=>!closure.includes(r))))fail('Publication scope escaped the exact mutation closure or lacks a requiring operation');
}
export function finalizeCertification(report:CertificationReport,resources:readonly DesiredResource[],operations:readonly PlannedOperation[]):CertificationReport{
 const roots=new Set(report.manifest.roots.map(r=>r.resourceId));
 for(const op of operations)if(!roots.has(op.resourceId)||!report.manifest.allowedActions.includes(op.action)||op.before!==null||op.classification!=='create')fail('Certification allows only exact additive root operations');
 const publishScopes=calculatePublishScopes(resources,operations);auditPublicationClosure(publishScopes,resources,operations,report.closure.resources);
 if(publishScopes.length)fail('Unexpected publication in create-only certification');
 return {...report,publishScopes,closure:{...report.closure,resourcesToCreate:operations.filter(o=>!['grantRolePrivileges','setAppAccess','addAppComponents'].includes(o.action)).map(o=>o.resourceId),resourcesToUpdate:[],resourcesToPublish:[],securityOperations:operations.filter(o=>o.risk==='securityWrite').map(o=>o.resourceId)}};
}
