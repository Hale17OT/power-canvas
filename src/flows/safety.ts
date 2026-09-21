import { z } from 'zod';
import type { Expr, FlowAction, FlowResources, FlowSpec } from './schema.js';
import { executionPolicySchema } from './schema.js';
import { connectorOperations } from './providers.js';
import type { Risk } from './providers.js';
import { fail } from './expressions.js';

export function flattenActions(actions:FlowAction[]):FlowAction[]{return actions.flatMap(a=>[a,...flattenActions(a.actions??[]),...flattenActions(a.otherwise??[])]);}
export function workflowActions(flow:FlowSpec,resources:FlowResources,seen=new Set<FlowSpec>(),prefix=''):FlowAction[]{
 if(seen.has(flow))fail('Child-flow cycle.');const next=new Set(seen).add(flow);
 return flattenActions(flow.actions).flatMap(a=>[{...a,name:prefix+a.name},...(a.use==='flows.invoke'&&resources.flows[a.flow!]?workflowActions(resources.flows[a.flow!]!,resources,next,prefix+a.name+'.'):[])]);
}
export function assessFlow(flow:FlowSpec,resources:FlowResources){
  const actions=workflowActions(flow,resources),blockers:string[]=[],warnings:string[]=[];
  const effects=actions.filter(a=>connectorOperations[a.use]).map(a=>({action:a.name,operation:a.use,risk:connectorOperations[a.use]!.risk,connection:a.connection!,target:a.table??a.metadata??a.template??(a.use==='outlook.sendEmail'?'configured recipients':a.use.startsWith('approvals.')?'configured approvers/approval identity':'configured SharePoint site/file'),fields:Object.keys(a.fields??{}),identity:a.id??null}));
  const ledger=Object.values(resources.workflowRecipes??{}).some(r=>r.flow.logicalName===flow.logicalName&&r.idempotency.mode==='ledger');
  const ranks:Risk[]=['READ','WRITE_INTERNAL','WRITE_EXTERNAL','DESTRUCTIVE'];
  const risk=effects.reduce<Risk>((r,e)=>ranks.indexOf(e.risk)>ranks.indexOf(r)?e.risk:r,'READ');
  if(risk!=='READ'&&flow.runPolicy.mode!=='controlledWrite')blockers.push('WRITE actions require runPolicy.mode controlledWrite.');
  if(risk!=='READ'&&flow.activationPolicy!=='manual')blockers.push('WRITE flows require manual activation.');
  for(const a of actions){
    const write=connectorOperations[a.use]?.risk.startsWith('WRITE');
    if(write){
      if(ledger)warnings.push(`${a.name}: guarded by a durable claim; duplicate or uncertain claims stop execution. Manual reconciliation is required for unresolved claims.`);
      else if(!a.idempotency)warnings.push(`${a.name}: repeated execution can duplicate effects; no idempotency strategy declared.`);
      else warnings.push(`${a.name}: ${a.idempotency.mode} is design guidance, not an implemented deduplication guarantee.`);
      if(a.retry?.policy==='default')blockers.push(`${a.name}: automatic write retries are not verified in V2; use retry policy none.`);
    }
    if(a.use==='control.applyToEach'&&flattenActions(a.actions??[]).some(x=>connectorOperations[x.use]?.risk.startsWith('WRITE')))warnings.push(`${a.name}: serial write loop bounded to ${a.maxItems} items; review cumulative effects and partial completion.`);
  }
  const t=flow.trigger;
  if(t.type==='dataverse'){
    if(!flow.connectionReferences.includes(t.connection))blockers.push('Trigger connection is not a declared flow dependency.');
    for(const a of actions.filter(a=>a.table?.toLowerCase()===t.table.toLowerCase())){
      if(a.use==='dataverse.addRow'&&['rowAdded','rowAddedOrModified'].includes(t.changeType))blockers.push('Self-trigger cycle: flow adds rows to its monitored table.');
      if(a.use==='dataverse.updateRow'&&['rowModified','rowAddedOrModified'].includes(t.changeType)){
        if(!t.selectColumns||Object.keys(a.fields??{}).some(k=>t.selectColumns!.some(c=>c.toLowerCase()===k.toLowerCase())))blockers.push('Self-trigger cycle: flow updates monitored columns.');
        else warnings.push('Same-table write avoids selected columns, but plugins and other flows can still create cycles.');
      }
    }
    warnings.push('Static analysis cannot exclude cross-flow, plugin or data-dependent trigger cycles. Activation creates an event subscription.');
  }
  const policy=executionPolicySchema.parse(resources.executionPolicy??{});
  const executionBlockers=effects.filter(e=>e.risk==='READ'?!policy.allowRead:e.risk==='WRITE_INTERNAL'?!policy.allowInternalWrite:e.risk==='WRITE_EXTERNAL'?!policy.allowExternalWrite:true).map(e=>`${e.action}: execution policy denies ${e.risk}.`);
  if(!policy.allowRead&&risk==='READ'&&!executionBlockers.length)executionBlockers.push('Execution policy denies READ.');
  const longRunning=actions.some(a=>['approvals.wait','approvals.startAndWait'].includes(a.use));
  const potentialWaitHours=actions.reduce((sum,a)=>sum+(a.timeoutHours??0),0);if(potentialWaitHours>672)blockers.push('Combined workflow waits exceed the conservative 28-day budget; split lifecycle processing.');
  if(longRunning)warnings.push('Blocking approval: bounded timeout; timeout is an UNKNOWN effect, not cancellation. Power Apps callers must not assume a long wait returns synchronously.');
  return {longRunning,potentialWaitHours,idempotency:ledger?{mode:'ledger',enforced:true,guarantee:'Atomic primary-key claim gates effects; no exactly-once guarantee.'}:{mode:'intent',enforced:false,guarantee:'No durable deduplication.'},risk,effects,blockers,warnings,executionBlockers,deployment:'disabled-only',implicitExecution:false,exactlyOnce:false};
}
export function requireExecutionPolicy(flow:FlowSpec,resources:FlowResources){const safety=assessFlow(flow,resources);if(safety.blockers.length||safety.executionBlockers.length)fail([...safety.blockers,...safety.executionBlockers].join(' '));return safety;}

export function portabilityAudit(resources:FlowResources){
  const findings:{path:string;kind:string;intentional:boolean;reason:string}[]=[];
  const visit=(value:unknown,path:string)=>{
    if(!value||typeof value!=='object')return;
    const e=value as Expr;
    if(e.op==='literal'){
      const raw=JSON.stringify(e.value),kind=/https?:\/\/[^" ]*sharepoint\.com/i.test(raw)?'site URL':/https?:\/\/[^" ]*crm[^" ]*dynamics\.com/i.test(raw)?'Dataverse URL':/[^\s"@]+@[^\s"@]+\.[^\s"@]+/.test(raw)?'recipient':/Default-[a-f0-9-]{36}|(?:environment|connection)[/-]/i.test(raw)?'environment/connection identity':null;
      if(kind)findings.push({path,kind,intentional:!!e.intentionalConstant,reason:e.intentionalConstant??'Move environment-specific configuration to an environment variable.'});
    }
    for(const [key,child]of Object.entries(value))visit(child,path+'.'+key);
  };
  visit(resources.flows,'flows');
  for(const [key,v]of Object.entries(resources.environmentVariables))if(v.default!==undefined&&/https?:\/\/|@|Default-/i.test(String(v.default)))findings.push({path:`environmentVariables.${key}.default`,kind:'environment-specific default',intentional:false,reason:'Prefer target deployment values to an environment-specific portable default.'});
  return {findings,portable:findings.every(f=>f.intentional),remoteWrites:0};
}
export function dependencyGraph(resources:FlowResources){
  const nodes=new Map<string,{id:string;kind:string;declared:boolean}>(),edges:{from:string;to:string}[]=[];
  const node=(id:string,kind:string,declared=true)=>nodes.set(id,{id,kind,declared});
  for(const [key,f]of Object.entries(resources.flows)){
    const id='flow:'+key;node(id,'flow');
    const edge=(to:string,kind:string,declared=true)=>{node(to,kind,declared);edges.push({from:id,to});};
    for(const k of f.connectionReferences)edge('connection:'+k,'connection',!!resources.connectionReferences[k]);
    for(const k of f.environmentVariables)edge('environment:'+k,'environment',!!resources.environmentVariables[k]);
    for(const a of flattenActions(f.actions))if(a.table)edge('table:'+a.table,'table');else if(a.metadata)edge('metadata:'+a.metadata,'metadata',!!resources.flowDataSources?.[a.metadata]);
    if(f.trigger.type==='dataverse')edge('table:'+f.trigger.table,'table');
    for(const a of flattenActions(f.actions)){if(a.use==='flows.invoke')edge('flow:'+a.flow,'flow',!!resources.flows[a.flow!]);if(a.template)edge('template:'+a.template,'externalTemplate',!!resources.documentTemplates?.[a.template]);}
    for(const k of f.dependencies)edge('flow:'+k,'flow',!!resources.flows[k]);
  }
  for(const b of resources.canvasBindings){node('canvas:'+b.app,'canvas');edges.push({from:'canvas:'+b.app,to:'flow:'+b.flow});}
  const visiting=new Set<string>(),visited=new Set<string>();let cyclic=false;
  const walk=(id:string)=>{if(visiting.has(id)){cyclic=true;return;}if(visited.has(id))return;visiting.add(id);for(const e of edges.filter(e=>e.from===id))walk(e.to);visiting.delete(id);visited.add(id);};
  for(const id of nodes.keys())walk(id);
  return {nodes:[...nodes.values()],edges,cyclic,resolved:!cyclic&&[...nodes.values()].every(n=>n.declared),note:'Declaration graph. Live connection, table and solution checks remain mandatory.'};
}
export const testTargetSchema=z.strictObject({environmentId:z.string().min(1),flow:z.string().min(1),definitionHash:z.string().regex(/^[a-f0-9]{64}$/),targets:z.array(z.strictObject({action:z.string().min(1),resource:z.string().min(1),expectedMutation:z.string().min(10)})).min(1),rollback:z.string().min(10),operatorAuthorization:z.string().min(10),safeRecipients:z.array(z.email()).default([]),safeApprovers:z.array(z.union([z.email(),z.guid()])).optional()});
export function validateTestTarget(input:unknown,key:string,flow:FlowSpec,resources:FlowResources,environmentId:string,definitionHash:string){
  const t=testTargetSchema.parse(input),safety=requireExecutionPolicy(flow,resources);
  if(t.environmentId!==environmentId||t.flow!==key||t.definitionHash!==definitionHash)fail('Test target is bound to a different environment, flow or definition.');
  const writes=safety.effects.filter(e=>e.risk!=='READ');
  if(writes.some(e=>!t.targets.some(x=>x.action===e.action)))fail('Test target must describe every write effect.');
  for(const a of workflowActions(flow,resources).filter(a=>a.use==='outlook.sendEmail'))for(const e of [...a.to!,...a.cc??[],...a.bcc??[]])if(e.op!=='literal'||!t.safeRecipients.includes(String(e.value)))fail('Email test requires an explicit safe literal recipient for every to/cc/bcc address.');
  for(const a of workflowActions(flow,resources).filter(a=>a.use==='approvals.create'||a.use==='approvals.startAndWait'))for(const e of a.assignedTo!)if(e.op!=='literal'||!(t.safeApprovers??t.safeRecipients).includes(String(e.value)))fail('Approval test requires an explicit safe literal identity for every approver.');
  return {eligibleForOperatorReview:true,executionPerformed:false,note:'Declaration validation only; no write-test runner is exposed in V2. Resolve dynamic target identities and authorize the exact run separately.'};
}
