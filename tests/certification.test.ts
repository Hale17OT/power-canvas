import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {resolveSolution} from '../src/solution/resolve.js';
import {certificationPlan} from '../src/solution/certification.js';
import {solutionPlan} from '../src/solution/plan.js';
import {applySolution} from '../src/solution/apply.js';
import {digest} from '../src/solution/compile.js';
import {certificationResources,createCertificationManifest,evaluateCertification,mutationClosure,calculatePublishScopes,auditPublicationClosure,finalizeCertification} from '../src/planner/certification.js';
import {createPlan,validateSavedPlan,publicationHash} from '../src/planner/dataverse.js';
import {executionPolicy} from '../src/dataverse/isolation.js';
import {assertAuthEvidenceSafe} from '../src/auth/safe-evidence.js';
import {interpretResult} from '../src/agent/routing.js';
import {matchingState} from './planner-fixtures.js';
import {MODEL_KINDS,MODEL_VERSION} from '../src/model-driven/desired.js';
import type {CertificationManifest,PlannedOperation} from '../src/state/models.js';

const fixture=()=>JSON.parse(readFileSync('tests/fixtures/certification-v21i-source.json','utf8'));
function setup(){
 const raw=fixture(),{project,spec}=resolveSolution(raw),{observation,ownership}=matchingState(project);
 observation.resources=observation.resources.filter(r=>['publisher','solution'].includes(r.kind));ownership.resources=ownership.resources.filter(r=>observation.resources.some(o=>o.resourceId===r.resourceId));
 const solution=observation.resources.find(r=>r.kind==='solution')!,receipt=ownership.resources.find(r=>r.resourceId===solution.resourceId)!;
 solution.properties.displayName='PowerForge Experiment';receipt.baseline.displayName='PowerForge Experiment';receipt.lastVerifiedHash=digest(receipt.baseline);
 observation.coverage=[...new Set([...observation.coverage.map(c=>c.kind),'choice','key',...MODEL_KINDS])].map(kind=>({kind,status:'complete' as const}));observation.providerVersions['model-driven']=MODEL_VERSION;
 const requiredBy=Object.fromEntries(certificationResources(project).map(r=>[r.resourceId,['REQ-certification']]));
 const manifest=createCertificationManifest(project,digest(spec),observation,ownership,requiredBy);
 return {raw,spec,project,observation,ownership,requiredBy,manifest};
}
const resign=(m:CertificationManifest)=>{const {contentHash:_old,...body}=m;void _old;return {...body,contentHash:digest(body)};};
describe('provider certification scope and native planning',()=>{
 it('uses the existing compiler with 21 roots, verified bound containers and zero publication',()=>{
  const x=setup(),result=certificationPlan(x.raw,x.observation,x.ownership);
  expect(result.native.blockers).toEqual([]);expect(result.summary.status).toBe('CERTIFICATION_PLAN_READY_FOR_REVIEW');
  expect(result.native.operations).toHaveLength(20);expect(result.native.deferred).toHaveLength(1);expect(result.manifest.roots).toHaveLength(21);
  expect(result.native.operations.some(o=>['updateOwnedProperties','publish','createSolution','createPublisher'].includes(o.action))).toBe(false);
  expect(result.native.certification?.closure.requiredExistingDependencies).toHaveLength(2);
  expect(result.native.certification?.publishScopes).toEqual([]);expect(result.native.operations.filter(o=>o.risk==='securityWrite')).toHaveLength(2);
  expect(result.unified.ir.resources.filter(r=>r.state==='EXTERNAL'&&r.kind!=='appPublication')).toHaveLength(2);
  expect(result.unified.ir.validation.blockers).toEqual([]);expect(result.manifest.evidenceState).toBe('ATTEMPT_INTENT_ONLY');
  expect(result.unified.ir.capabilities.every(c=>!c.runtime&&!c.production)).toBe(true);
  expect(result.unified.ir.capabilities.every(c=>!c.deploy)).toBe(true);
  expect(result.native.operations.filter(o=>o.action==='createTable')).toHaveLength(2);expect(result.native.operations.filter(o=>o.action==='createColumn')).toHaveLength(8);
  const grants=result.native.operations.find(o=>o.action==='grantRolePrivileges')!.after!.grants as {depth:string}[];expect(grants.every(g=>g.depth==='Basic')).toBe(true);
 });
 it('keeps unrelated owned form drift visible but outside the dependency closure',()=>{
  const x=setup(),resourceId='pf:'+x.project.project.id+':model-driven:form:historical/main',remoteId=randomUUID();
  x.ownership.resources.push({resourceId,remoteId,provider:'model-driven',ownedPaths:['reveal'],baseline:{reveal:{namespace:'PowerForgeReveal_old'}},lastVerifiedHash:digest({reveal:{namespace:'PowerForgeReveal_old'}})});
  x.observation.resources.push({resourceId,remoteId,provider:'model-driven',kind:'form',schemaName:'pfx_ExperimentOldForm',properties:{reveal:null,isManaged:false,customizable:true}});
  const r=certificationPlan(x.raw,x.observation,x.ownership);expect(r.native.blockers).toEqual([]);
  expect(r.native.certification?.context).toContainEqual({resourceId,classification:'OUT_OF_SCOPE_DRIFT',changedProperties:['reveal']});
  expect(r.native.certification?.closure.resources).not.toContain(resourceId);expect(r.unified.ir.resources.some(v=>v.nativeId===resourceId)).toBe(false);
 });
 it('blocks required dependency drift through the graph, even when the dependency is historical',()=>{
  const x=setup();x.project.dataverse.tables.history={...structuredClone(x.project.dataverse.tables.certificationCategory!),schemaName:'pfx_ExperimentHistory'};
  x.project.dataverse.relationships.certificationCategoryProbe!.toTable='history';
  const d=certificationResources(x.project).find(r=>r.schemaName==='pfx_ExperimentHistory')!,remoteId=randomUUID();
  x.observation.resources.push({...d,provider:'dataverse',remoteId,properties:{...d.properties,isManaged:false,customizable:true}});
  x.ownership.resources.push({resourceId:d.resourceId,remoteId,provider:'dataverse',ownedPaths:Object.keys(d.properties),baseline:d.properties,lastVerifiedHash:digest(d.properties)});
  const m=createCertificationManifest(x.project,digest(x.spec),x.observation,x.ownership,x.requiredBy,[...x.manifest.existingDependencies.map(d=>d.resourceId),d.resourceId]);
  expect(evaluateCertification(x.project,x.observation,x.ownership,m).closure.requiredExistingDependencies).toContain(d.resourceId);
  x.observation.resources.at(-1)!.properties.displayName='Changed outside receipt';
  expect(()=>evaluateCertification(x.project,x.observation,x.ownership,m)).toThrow('baseline drift');
 });
 it('preserves only the explicit bound solution label and leaves new solution branding unchanged',()=>{
  const x=setup();expect(evaluateCertification(x.project,x.observation,x.ownership,x.manifest)).toBeDefined();
  expect(x.project.solution.displayName).toBe('PowerCanvas Experiment');
  const m=structuredClone(x.manifest);m.existingDependencies.find(d=>d.resourceId.includes(':solution:'))!.displayNamePolicy='exact';
  expect(()=>evaluateCertification(x.project,x.observation,x.ownership,resign(m))).toThrow('definition differs');
  x.observation.resources.find(r=>r.kind==='solution')!.properties.displayName='Remote drift';
  expect(()=>evaluateCertification(x.project,x.observation,x.ownership,x.manifest)).toThrow('baseline drift');
 });
 it('does not reuse historical Experiment 1 proof or change the global Default policy',()=>{
  const x=setup();x.ownership.experiment1Evidence={schemaHash:digest('historical'),firstNoOpHash:digest('a'),secondNoOpHash:digest('b'),destructiveCheckHash:digest('c'),completedAt:new Date().toISOString()};
  const before=digest(x.ownership);const ordinary=createPlan(x.project,x.observation,x.ownership,'all',new Date(),executionPolicy(12,true,true,true,false));
  expect(ordinary.blockers.some(b=>b.code==='PF-CAPABILITY-003')).toBe(true);expect(x.ownership.experiment1Evidence.schemaHash).not.toBe(publicationHash(x.project));
  expect(certificationPlan(x.raw,x.observation,x.ownership).native.blockers).toEqual([]);expect(digest(x.ownership)).toBe(before);
 });
 it.each(['table','canvas','flow','webResource','globalPrivilege'])('rejects unrelated or broadened desired resources: %s',kind=>{
  const x=setup();
  if(kind==='table')x.project.dataverse.tables.unrelated={...x.project.dataverse.tables.certificationCategory!,schemaName:'pfx_ExperimentComplaint'};
  if(kind==='canvas')Object.assign(x.project,{canvasApps:{unrelated:{}}});
  if(kind==='flow')Object.assign(x.project,{resources:{flows:{unrelated:{}}}});
  if(kind==='webResource')x.project.apps.certification!.commands={details:{label:'Extra',form:'main',action:'toggleDetails',visible:true,bindingVersion:2,sequence:1,tooltip:'Extra'}};
  if(kind==='globalPrivilege')x.project.security.roles.certificationReader!.tables.certificationCategory!.read='organization';
  expect(()=>createCertificationManifest(x.project,digest(x.spec),x.observation,x.ownership,x.requiredBy)).toThrow();
 });
 it.each(['target','definition','actions','publish','preserve','traceability'])('rejects manifest tampering: %s',kind=>{
  const x=setup(),m=structuredClone(x.manifest);
  if(kind==='target')m.target.organizationId=randomUUID();if(kind==='definition')m.roots[0]!.definitionHash=digest('changed');
  if(kind==='actions')m.allowedActions.push('updateOwnedProperties');if(kind==='publish')m.expectedPublication.push('pfx_experimentcomplaint');
  if(kind==='preserve')m.existingDependencies.find(d=>d.resourceId.includes(':publisher:'))!.displayNamePolicy='preserveExisting';
  if(kind==='traceability')m.roots[0]!.requiredBy=[];
  expect(()=>evaluateCertification(x.project,x.observation,x.ownership,resign(m))).toThrow();
 });
 it('rejects removed owned certification resources and new-name collisions',()=>{
  const x=setup(),r=certificationResources(x.project).find(r=>r.kind==='table')!,remoteId=randomUUID();
  x.observation.resources.push({resourceId:r.resourceId,kind:r.kind,schemaName:r.schemaName,provider:'dataverse',remoteId,properties:{...r.properties,isManaged:false}});
  expect(certificationPlan(x.raw,x.observation,x.ownership).native.blockers.some(b=>b.code==='PF-PLAN-005')).toBe(true);
  x.ownership.resources.push({resourceId:r.resourceId+'Old',remoteId,provider:'dataverse',ownedPaths:Object.keys(r.properties),baseline:r.properties,lastVerifiedHash:digest(r.properties)});
  expect(()=>evaluateCertification(x.project,x.observation,x.ownership,x.manifest)).toThrow('Removing');
 });
 it('blocks certification updates instead of admitting historical or existing-resource writes',()=>{
  const x=setup(),r=certificationResources(x.project).find(r=>r.kind==='table')!,remoteId=randomUUID(),baseline={...r.properties,displayName:'Old label'};
  x.observation.resources.push({resourceId:r.resourceId,kind:r.kind,schemaName:r.schemaName,provider:'dataverse',remoteId,properties:{...baseline,isManaged:false}});x.ownership.resources.push({resourceId:r.resourceId,remoteId,provider:'dataverse',ownedPaths:Object.keys(baseline),baseline,lastVerifiedHash:digest(baseline)});
  expect(certificationPlan(x.raw,x.observation,x.ownership).native.blockers.some(b=>b.code==='PF-CERT-002')).toBe(true);
 });
 it('rejects delete/business-write/historical operations even if injected into a report',()=>{
  const x=setup(),r=certificationPlan(x.raw,x.observation,x.ownership),report=r.native.certification!;
  for(const action of ['deleteTable','createRecord','updateOwnedProperties','createWebResource'])expect(()=>finalizeCertification(report,certificationResources(x.project),[{...r.native.operations[0]!,action} as PlannedOperation])).toThrow('additive');
  expect(()=>finalizeCertification(report,certificationResources(x.project),[{...r.native.operations[0]!,resourceId:report.closure.requiredExistingDependencies[0]!}])).toThrow('additive');
 });
 it('rejects changed fixture hashes and cannot apply a review-only certification plan',async()=>{
  const x=setup(),r=certificationPlan(x.raw,x.observation,x.ownership),changed=structuredClone(x.raw);changed.requirements[0].statement+=' Changed';
  expect(()=>solutionPlan(changed,r.evidence)).toThrow('fixture hash');
  expect(()=>validateSavedPlan(r.native,x.project,x.observation,x.ownership)).toThrow('separately authorized');
  let calls=0;await expect(applySolution(r.unified,x.spec,r.evidence,{preflight:async()=>{calls++;},execute:async()=>{calls++;return {ok:true};},journal:async()=>{calls++;}})).rejects.toThrow('separately authorized');expect(calls).toBe(0);
 });
 it('rejects missing/cyclic dependencies rather than excluding them by name',()=>{
  expect(()=>mutationClosure([{resourceId:'root',kind:'form',schemaName:'Root',properties:{},dependencies:['missing']}],['root'])).toThrow('Unresolved');
  expect(()=>mutationClosure([{resourceId:'root',kind:'form',schemaName:'Root',properties:{},dependencies:['root']}],['root'])).toThrow('cycle');
 });
});
describe('publication derivation and report safety',()=>{
 it('derives a form update scope from its table and app publication independently',()=>{
  const x=setup(),r=certificationPlan(x.raw,x.observation,x.ownership),resources=certificationResources(x.project),form=r.native.operations.find(o=>o.action==='createForm')!,app=r.native.operations.find(o=>o.action==='createApp')!;
  const update={...form,classification:'safeUpdate' as const,before:{...form.after,displayName:'Previous certification form label'},action:'updateOwnedProperties' as const};
  const scope=calculatePublishScopes(resources,[update]);expect(scope).toHaveLength(1);expect(scope[0]!.resources[0]).toContain(':table:certificationProbe');
  expect(calculatePublishScopes(resources,[app])).toEqual([]);expect(calculatePublishScopes(resources,[app],true)[0]!.resources).toEqual([app.resourceId]);
  auditPublicationClosure(scope,resources,[update],r.native.certification!.closure.resources);
  expect(()=>auditPublicationClosure([{...scope[0]!,resources:['pfx_experimentcomplaint']}],resources,[update],r.native.certification!.closure.resources)).toThrow('Publication scope');
 });
 it('accepts only bounded authorization status values; credentials still fail closed',()=>{
  expect(()=>assertAuthEvidenceSafe({authorization:'PENDING_REVIEW'})).not.toThrow();
  for(const value of [{authorization:'Bearer private'},{authorization:'arbitrary'},{authorization:{status:'PENDING_REVIEW'}},{access_token:'PENDING_REVIEW'},{password:'NOT_REQUESTED'},{authorization:'REQUIRED',cookie:'secret'},{authorization:'NOT_REQUESTED',message:'access_token=private'}])expect(()=>assertAuthEvidenceSafe(value)).toThrow();
 });
 it('routes certification blockers to scope diagnosis, never apply retries',()=>{
  expect(interpretResult({status:'READ_ONLY_PREFLIGHT_COMPLETE_CERTIFICATION_BLOCKED'})).toMatchObject({next:'resolve-planning-scope-blockers',autoRetry:false,mutationAuthorized:false});
 });
});
