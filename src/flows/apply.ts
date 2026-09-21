import { transitiveChildren, workflowConfigurationHash } from './orchestration.js';
import { z } from 'zod';
import type { Project } from '../ir/schema.js';
import type { Target } from '../state/models.js';
import { hashJson } from '../core/json.js';
import type { JsonInput } from '../core/json.js';
import type { FlowDeployment } from './schema.js';
import type { FlowHttp } from './remote.js';
import { discoverFlows, resourceKinds, managedPayload } from './remote.js';
import { planFlows, verifyPlan } from './plan.js';
import type { FlowPlan, FlowOwnership } from './plan.js';
import { fail } from './expressions.js';
import { validateFlowMetadata } from './metadata.js';
import type { MetadataServices } from './metadata.js';
import { compileFlows } from './compile.js';
import { requireExecutionPolicy } from './safety.js';
export interface FlowPersistence {read():Promise<FlowOwnership>;save(s:FlowOwnership):Promise<void>}
const hash=(v:unknown)=>hashJson(v as JsonInput);
export function flowTargetPolicy(project:Project,organizationType:number){
  if(organizationType===12&&(project.solution.uniqueName!=='pfx_PowerForgeExperiment'||project.solution.publisher.uniqueName!=='PowerForgeExperimentPublisher'||project.solution.publisher.prefix!=='pfx'))fail('Default permits only the dedicated PowerCanvas experiment solution/publisher.');
  if(![12,13,5,6].includes(organizationType))fail('V1 flow mutations require Developer, Sandbox or the isolated non-disposable Default experiment.');
}
export async function applyFlows(project:Project,target:Target,plan:FlowPlan,deployment:FlowDeployment,http:FlowHttp,store:FlowPersistence,ownerId:string,services:MetadataServices={}){
  await validateFlowMetadata(project,http,deployment,services);
  for(const c of Object.values(deployment.connections))if(c.principalId!==ownerId)fail('Connection authorization does not belong to the current caller; unrelated connections cannot be bound.');
  verifyPlan(plan);const state=await store.read();let snapshot=await discoverFlows(http,project);const fresh=planFlows(project,target,snapshot,state,deployment);
  const normalized=(p:FlowPlan)=>({...p,hash:undefined,operations:p.operations.map(o=>({...o,id:o.status==='CREATE'?'new':o.id}))});
  if(!fresh.executable||hash(normalized(fresh))!==hash(normalized(plan)))fail('Plan is blocked, stale or belongs to different source/deployment/remote state.');
  const result={flowsCreated:0,flowsUpdated:0,flowsActivated:0,flowsDeleted:0,connectionReferencesCreated:0,connectionReferencesUpdated:0,environmentVariablesCreated:0,environmentVariablesUpdated:0,environmentVariableValuesChanged:0,appsCreated:0,appsUpdated:0,sharePointItemsCreated:0,sharePointItemsUpdated:0,sharePointItemsDeleted:0,sharePointFilesCreated:0,sharePointFilesUpdated:0,sharePointFilesDeleted:0,emailsSent:0,approvalsCreated:0,documentsGenerated:0,pdfsGenerated:0,businessRowsCreated:0,businessRowsUpdated:0,businessRowsDeleted:0};
  for(const op of plan.operations){if(!['CREATE','UPDATE'].includes(op.status))continue;
    const meta=resourceKinds[op.kind];const id=z.guid().parse(op.id);
    // Repeat collision/source checks immediately before each mutation; no whole-plan presence assumption.
    snapshot=await discoverFlows(http,project);const live=planFlows(project,target,snapshot,state,deployment);const current=live.operations.find(o=>o.key===op.key);
    if(!current||current.status!==op.status||current.desiredHash!==op.desiredHash||current.expectedHash!==op.expectedHash)fail('Resource changed during apply.');
    if(snapshot.resources.some(r=>r.id===id)&&op.status==='CREATE')fail('Planned resource GUID collides with a remote resource.');
    if(op.status==='UPDATE'&&snapshot.resources.some(r=>r.id===id&&r.owner&&r.owner!==ownerId))fail('Current caller does not own the resource; no update attempted.');
    state.pending={key:op.key,id,operation:op.status};await store.save(state);
    let etag=current.etag!;let mutationBody=op.body;
    if(op.status==='UPDATE'){
      const row=(await http.request(`${meta.set}(${id})?$select=${meta.select}`)).data as Record<string,unknown>;
      if(hash(managedPayload(op.kind,row))!==op.expectedHash||(op.kind==='flow'&&row.statecode!==0))fail('Resource changed immediately before update.');
      etag=z.string().regex(/^W\/"[0-9]+"$/).parse(row['@odata.etag']);
      mutationBody=Object.fromEntries(Object.entries(op.body).filter(([k,v])=>hash(v)!==hash(row[k]??null)));
      // Explicit provider mode for solution workflows whose layer updates reject exact ETags.
      // Never an automatic retry/fallback. Source, ownership, off-state and readback remain mandatory.
      if(op.kind==='flow'&&deployment.flowUpdateConcurrency==='verifiedSource')etag='*';
    }
    // Existing components already have verified membership. Do not reintroduce a solution layer on update.
    const headers:Record<string,string>=op.status==='UPDATE'?{'If-Match':etag}:{'MSCRM.SolutionUniqueName':plan.solutionName};
    await http.request(op.status==='CREATE'?meta.set:`${meta.set}(${id})`,op.status==='CREATE'?'POST':'PATCH',{...mutationBody,...(op.status==='CREATE'?{[meta.id]:id,...(op.kind==='flow'?{statecode:0,statuscode:1}:{})}:{})},headers);
    let after=await discoverFlows(http,project);let remote=after.resources.find(r=>r.kind===op.kind&&r.id===id);
    if(!remote||remote.hash!==op.desiredHash||remote.managed||(op.kind==='flow'&&remote.state!==0)||(remote.owner&&remote.owner!==ownerId))fail('Readback failed after write; pending journal retained.');
    if(!remote.member){await http.request('AddSolutionComponent','POST',{ComponentId:id,ComponentType:meta.component,SolutionUniqueName:plan.solutionName,AddRequiredComponents:false,DoNotIncludeSubcomponents:true});after=await discoverFlows(http,project);remote=after.resources.find(r=>r.kind===op.kind&&r.id===id);}
    if(!remote?.member||remote.hash!==op.desiredHash)fail('Solution membership/readback failed; pending journal retained.');
    state.entries[op.key]={kind:op.kind,id,hash:remote.hash,solutionId:plan.solutionId,logicalName:remote.logicalName,owner:remote.owner};delete state.pending;await store.save(state);
    if(op.kind==='flow')result[op.status==='CREATE'?'flowsCreated':'flowsUpdated']++;
    if(op.kind==='connection'&&op.status==='CREATE')result.connectionReferencesCreated++;
    if(op.kind==='connection'&&op.status==='UPDATE')result.connectionReferencesUpdated++;
    if(op.kind==='environment'&&op.status==='CREATE')result.environmentVariablesCreated++;
    if(op.kind==='environment'&&op.status==='UPDATE')result.environmentVariablesUpdated++;
    if(op.kind==='environmentValue')result.environmentVariableValuesChanged++;
  }
  return {...result,activation:'Not attempted; use explicit flows activate after dependency validation.'};
}
export async function setFlowState(project:Project,target:Target,key:string,on:boolean,deployment:FlowDeployment,http:FlowHttp,store:FlowPersistence,services:MetadataServices={}){
  if(on){const {resources,flows}=compileFlows(project);const f=resources.flows[key];if(!f)fail('Unknown flow.');requireExecutionPolicy(f,resources);
    for(const k of [key,...transitiveChildren(resources,key)]){const spec=resources.flows[k]!,compiled=flows[k]!;
      if(spec.role||resources.workflowRecipes?.[k]||compiled.safety.effects.some(e=>e.operation.startsWith('approvals.')||e.operation.startsWith('word.'))){
        const auth=deployment.workflowAuthorizations?.[k];if(!auth||auth.definitionHash!==compiled.definitionHash||auth.environmentId.toLowerCase()!==target.environmentId.toLowerCase()||auth.configurationHash!==workflowConfigurationHash(deployment))fail('RUN-ONLY / PERSONA AUTHORIZATION UNPROVEN: exact workflow authorization evidence is required before activation.');
        if(compiled.safety.effects.some(e=>e.operation==='approvals.create'||e.operation==='approvals.startAndWait')&&!auth.approvers)fail('Approver configuration has not been explicitly validated.');
      }
    }
    await validateFlowMetadata(project,http,deployment,services);}
  if(on&&Object.keys(deployment.connections).length){const identity=z.object({UserId:z.guid()}).parse((await http.request('WhoAmI')).data);for(const c of Object.values(deployment.connections))if(c.principalId!==identity.UserId)fail('Activation caller differs from the explicitly authorized connection principal.');}
  const state=await store.read();if(state.pending)fail('Unresolved flow journal.');const snapshot=await discoverFlows(http,project);const plan=planFlows(project,target,snapshot,state,deployment);const op=plan.operations.find(o=>o.key==='flow:'+key);const flow=snapshot.resources.find(r=>r.id===op?.id);
  if(on){const {resources}=compileFlows(project);for(const child of transitiveChildren(resources,key)){const op=plan.operations.find(o=>o.key==='flow:'+child);const live=snapshot.resources.find(r=>r.id===op?.id);if(op?.status!=='NO-OP'||live?.state!==1)fail('Child-flow activation dependency is unresolved or inactive.');}}
  const owned=state.entries['flow:'+key];
  if(!op||!flow||!flow.member||flow.managed||!owned||flow.hash!==owned.hash||flow.owner!==owned.owner||owned.solutionId!==snapshot.solutionId||flow.logicalName!==owned.logicalName||(on&&(op.status!=='NO-OP'||!plan.executable)))fail('Activation/state change requires owned unchanged source and resolved dependencies.');
  if(flow.state===(on?1:0))return {changed:false,state:flow.state};
  state.pending={key:op.key,id:op.id,operation:on?'ACTIVATE':'DEACTIVATE'};await store.save(state);
  await http.request(`workflows(${z.guid().parse(op.id)})`,'PATCH',{statecode:on?1:0,statuscode:on?2:1},{'If-Match':flow.etag});
  const readback=(await discoverFlows(http,project)).resources.find(r=>r.id===op.id);
  if(!readback||readback.state!==(on?1:0)||readback.hash!==owned.hash||!readback.member||readback.owner!==owned.owner)fail('Flow state readback mismatch; inspect pending journal.');
  delete state.pending;await store.save(state);return {changed:true,state:readback.state,workflowId:op.id};
}
/** Reconcile a state-only journal against the already-owned baseline, never adopt a create. Zero remote writes. */
export async function reconcileFlowState(project:Project,target:Target,http:FlowHttp,store:FlowPersistence){
  const state=await store.read();const p=state.pending;
  if(state.projectId!==project.project.id||hash(state.target)!==hash(target)||!p||!['ACTIVATE','DEACTIVATE','UPDATE'].includes(p.operation))fail('Only an owned state or unchanged update journal can be reconciled.');
  const owned=state.entries[p.key];const snapshot=await discoverFlows(http,project);const flow=snapshot.resources.find(r=>r.kind==='flow'&&r.id===p.id);
  if(!owned||owned.id!==p.id||!flow||flow.hash!==owned.hash||flow.owner!==owned.owner||flow.logicalName!==owned.logicalName||!flow.member||flow.managed||owned.solutionId!==snapshot.solutionId||![0,1].includes(flow.state!))fail('State journal cannot be reconciled against the exact owned baseline.');
  if(p.operation==='UPDATE'&&flow.state!==0)fail('An unchanged update can only be reconciled while off.');
  delete state.pending;await store.save(state);
  return {workflowId:flow.id,state:flow.state,completed:p.operation!=='UPDATE'&&flow.state===(p.operation==='ACTIVATE'?1:0),remoteWrites:0};
}
