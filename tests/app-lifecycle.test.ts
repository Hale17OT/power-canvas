import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { resolveSolution } from '../src/solution/resolve.js';
import { certificationPlan } from '../src/solution/certification.js';
import { matchingState } from './planner-fixtures.js';
import { MODEL_KINDS, MODEL_VERSION, modelResources } from '../src/model-driven/desired.js';
import { hashJson, type JsonValue } from '../src/core/json.js';
import { createPlan, validateSavedPlan } from '../src/planner/dataverse.js';
import { evaluateAppValidation, requireAppValidation } from '../src/model-driven/validation.js';
import { appLifecycle, appPublishXml, publishedAssociationFailure } from '../src/model-driven/lifecycle.js';
import { mutateModel } from '../src/model-driven/mutations.js';
import { DataverseHttp } from '../src/dataverse/http.js';
import { interpretResult } from '../src/agent/routing.js';
import { readPublishedAppRoleIds } from '../src/model-driven/access.js';

function setup(published = false) {
  const raw=JSON.parse(readFileSync('examples/solution-v2-live-provider/certification.json','utf8'));
  const {project}=resolveSolution(raw), {observation,ownership}=matchingState(project);
  observation.coverage=[...new Set([...observation.coverage.map(c=>c.kind),'choice','key',...MODEL_KINDS])].map(kind=>({kind,status:'complete' as const}));
  observation.providerVersions['model-driven']=MODEL_VERSION;
  for(const r of modelResources(project).filter(r=>r.kind!=='appAccess')) {
    const remoteId=randomUUID();
    observation.resources.push({resourceId:r.resourceId,kind:r.kind,schemaName:r.schemaName,provider:'model-driven',remoteId,properties:{...r.properties,isManaged:false,customizable:true,...(r.kind==='app'?{lifecycle:published?'PUBLISHED':'DRAFT_UNPUBLISHED'}:{})}});
    ownership.resources.push({resourceId:r.resourceId,remoteId,provider:'model-driven',baseline:r.properties,ownedPaths:Object.keys(r.properties),lastVerifiedHash:hashJson(r.properties)});
  }
  const solution=observation.resources.find(r=>r.kind==='solution')!,receipt=ownership.resources.find(r=>r.resourceId===solution.resourceId)!;
  solution.properties.displayName=project.solution.displayName;receipt.baseline.displayName=project.solution.displayName;receipt.lastVerifiedHash=hashJson(receipt.baseline);
  return {raw,project,observation,ownership};
}
function historicalLabel(x:ReturnType<typeof setup>){const solution=x.observation.resources.find(r=>r.kind==='solution')!,receipt=x.ownership.resources.find(r=>r.resourceId===solution.resourceId)!;solution.properties.displayName='PowerForge Experiment';receipt.baseline.displayName='PowerForge Experiment';receipt.lastVerifiedHash=hashJson(receipt.baseline);}
const policy={environmentType:'Sandbox',mode:'schemaDevelopment',nonDisposable:false,modelDriven:true,unified:true} as const;
it('retains exactly 20 satisfied certification roots and one deferred requirement with zero executable mutations',()=>{
  const x=setup();historicalLabel(x);const result=certificationPlan(x.raw,x.observation,x.ownership);
  expect(result.native.operations).toEqual([]);expect(result.native.blockers).toEqual([]);
  expect(result.native.deferred).toHaveLength(1);
  expect(result.unified.ir.resources.filter(r=>result.manifest.roots.some(root=>root.resourceId===r.nativeId)&&r.state==='NO_OP')).toHaveLength(20);
  const access=result.unified.ir.resources.find(r=>r.id==='appAccess:certification')!;
  expect(access.state).toBe('DEFERRED_REQUIRES_PUBLICATION');expect(access.dependencies).toContain('appPublication:certification');
  expect(result.summary.status).toBe('PROVIDER_CONVERGED_WITH_DEFERRED_PUBLICATION');
  expect(result.unified.ir.validation.blockers).toEqual([]);
});
it('permits access for independently published apps',()=>{
 const x=setup(true), plan=createPlan(x.project,x.observation,x.ownership,'all',new Date(),policy);
 expect(plan.operations.map(o=>o.action)).toEqual(['setAppAccess']);expect(plan.deferred).toBeUndefined();
});
it('manual policy cannot be overridden by a generic publication flag',()=>{
 const x=setup(),plan=createPlan(x.project,x.observation,x.ownership,'all',new Date(),{...policy,publishModel:true});
 expect(plan.operations).toEqual([]);expect(plan.deferred).toHaveLength(1);
});
it('afterValidation publishes one app before its access operation, with separate visibility risk',()=>{
 const x=setup();x.project.apps.certification!.publishPolicy='afterValidation';
 const plan=createPlan(x.project,x.observation,x.ownership,'all',new Date(),policy);
 expect(plan.operations.map(o=>o.action)).toEqual(['publishModelApp','setAppAccess']);
 expect(plan.operations[1]!.dependsOn).toContain(plan.operations[0]!.id);
 expect(plan.operations[0]).toMatchObject({risk:'mutable',after:{scope:'EXACT_APP_ONLY',visibilityEffect:'USER_VISIBILITY_CHANGE'}});
 validateSavedPlan(plan,x.project,x.observation,x.ownership);
});
it('binds deferral to the deterministic plan, rejecting a hash-valid edited deferral',()=>{
 const x=setup(),plan=createPlan(x.project,x.observation,x.ownership,'all',new Date(),policy);
 delete plan.deferred;const {contentHash:_,...body}=plan;void _;plan.contentHash=hashJson(body);
 expect(()=>validateSavedPlan(plan,x.project,x.observation,x.ownership)).toThrow('deterministic');
});
it('recognizes a draft only with exact independently verified identity and 404',()=>{
 const x=setup(),app=x.observation.resources.find(r=>r.kind==='app')!;
 expect(publishedAssociationFailure(404,app.remoteId,app)).toBe('APP_NOT_PUBLISHED');
 expect(publishedAssociationFailure(404,randomUUID(),app)).toBe('READ_FAILED');
 expect(publishedAssociationFailure(503,app.remoteId,app)).toBe('READ_FAILED');
 expect(publishedAssociationFailure(404,app.remoteId,{...app,properties:{lifecycle:'PUBLISHED'}})).toBe('READ_FAILED');
 expect(appLifecycle(true,true)).toBe('PUBLISHED');expect(appLifecycle(false,true)).toBe('DRAFT_UNPUBLISHED');expect(appLifecycle(false,false)).toBe('UNKNOWN');
});
it('scopes publication XML to exactly one GUID without entities/sitemaps/solution-wide publication',()=>{
 const id=randomUUID();expect(appPublishXml(id)).toBe(`<importexportxml><appmodules><appmodule>${id}</appmodule></appmodules></importexportxml>`);
 expect(()=>appPublishXml('all')).toThrow();
});
it('blocks the access provider before requests when its observed app is unpublished',async()=>{
 const x=setup(true),plan=createPlan(x.project,x.observation,x.ownership,'all',new Date(),policy);
 x.observation.resources.find(r=>r.kind==='app')!.properties.lifecycle='DRAFT_UNPUBLISHED';let writes=0;
 const http=new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/',{token:async()=>'test'},async()=>{throw Error('No reads expected');});
 await expect(mutateModel(x.project,plan.operations[0]!,x.observation,http,async()=>{writes++;})).rejects.toThrow('APP_ACCESS_REQUIRES_PUBLICATION');expect(writes).toBe(0);
});
const response=(success:boolean,issues:JsonValue[])=>({AppValidationResponse:{ValidationSuccess:success,ValidationIssueList:issues}});
it.each([
 [true,[],'PASS'],[true,[{ErrorType:'Warning',Message:'Keep this warning'}],'PASS_WITH_WARNINGS'],
 [false,[{ErrorType:'Error',Message:'Missing component'}],'APP_VALIDATION_ERROR'],
 [true,[{ErrorType:'Error',Message:'Error despite success'}],'APP_VALIDATION_ERROR'],
 [false,[],'APP_VALIDATION_ERROR'],[true,[{ErrorType:'Info',Message:'Unknown'}],'VALIDATION_UNRECOGNIZED'],
 [true,[null],'VALIDATION_UNRECOGNIZED'],[true,[{ErrorType:'Warning'}],'VALIDATION_UNRECOGNIZED']
 ])('evaluates ValidateApp %s %j as %s',(success,issues,status)=>{expect(evaluateAppValidation(response(success as boolean,issues as JsonValue[])).status).toBe(status);});
it('retains warnings in native plan and unified audit without adding resources',()=>{
 const x=setup();x.observation.resources.find(r=>r.kind==='app')!.properties.validationResponse=response(true,[{ErrorType:'Warning',Message:'Category exposes all forms and views',CRMErrorCode:-2147155691}]);
 historicalLabel(x);const result=certificationPlan(x.raw,x.observation,x.ownership);
 expect(result.native.warnings?.[0]?.message).toBe('Category exposes all forms and views');
 expect(result.unified.ir.validation.issues).toContainEqual(expect.objectContaining({code:'APP_VALIDATION_WARNING',message:'Category exposes all forms and views'}));
 expect(result.native.operations).toEqual([]);
 expect(requireAppValidation(response(true,[{ErrorType:'Warning',Message:'Keep'}])).warnings).toHaveLength(1);
 expect(()=>requireAppValidation({})).toThrow('VALIDATION_UNRECOGNIZED');
});
it('directs the agent to publication review without create/auth retries',()=>{
 expect(interpretResult({status:'APP_NOT_PUBLISHED'})).toMatchObject({next:'review-scoped-app-publication-boundary',autoRetry:false,mutationAuthorized:false});
});
it('reads associations through the published endpoint only after lifecycle verification',async()=>{
 const x=setup(true),app=x.observation.resources.find(r=>r.kind==='app')!,roleId=randomUUID(),paths:string[]=[];
 const http=new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/',{token:async()=>'test'},async(url,init)=>{expect(init?.method).toBe('GET');paths.push(String(url));return new Response(JSON.stringify({value:[{roleid:roleId}]}));});
 expect(await readPublishedAppRoleIds(http,app)).toEqual([roleId]);expect(paths).toHaveLength(1);expect(paths[0]).toContain(`appmodules(${app.remoteId})/appmoduleroles_association`);
 app.properties.lifecycle='DRAFT_UNPUBLISHED';await expect(readPublishedAppRoleIds(http,app)).rejects.toThrow('APP_ACCESS_REQUIRES_PUBLICATION');expect(paths).toHaveLength(1);
});
it.each(['Warning','Error','Unknown'])('publication provider validates %s before a single exact app-only payload',async severity=>{
 const x=setup();x.project.apps.certification!.publishPolicy='afterValidation';const app=x.observation.resources.find(r=>r.kind==='app')!;
 const operation=createPlan(x.project,x.observation,x.ownership,'all',new Date(),policy).operations.find(o=>o.action==='publishModelApp')!;
 const events:string[]=[],payloads:unknown[]=[];
 const http=new DataverseHttp('https://synthetic.crm.dynamics.com/api/data/v9.2/',{token:async()=>'test'},async(url,init)=>{
  expect(init?.method).toBe('GET');events.push(String(url).includes('ValidateApp')?'validate':'readback');
  return new Response(JSON.stringify(String(url).includes('ValidateApp')?response(true,[{ErrorType:severity,Message:'Retained issue'}]):{value:[{appmoduleid:app.remoteId,componentstate:0}]}));
 });
 const invoke=()=>mutateModel(x.project,operation,x.observation,http,async(step,path,method,body)=>{expect(step).toBe('publish-app');expect(path).toBe('PublishXml');expect(method).toBe('POST');events.push('publish');payloads.push(body);});
 if(severity==='Warning'){await invoke();expect(events).toEqual(['validate','publish','readback']);expect(payloads).toEqual([{ParameterXml:appPublishXml(app.remoteId)}]);}
 else{await expect(invoke()).rejects.toThrow(severity==='Error'?'APP_VALIDATION_ERROR':'VALIDATION_UNRECOGNIZED');expect(events).toEqual(['validate']);expect(payloads).toEqual([]);}
});
