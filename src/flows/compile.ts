import type { Project } from '../ir/schema.js';
import { hashJson } from '../core/json.js';
import type { JsonInput } from '../core/json.js';
import { flowResourcesSchema } from './schema.js';
import type { FlowAction, FlowSpec, ValueShape, FlowResources } from './schema.js';
import { expression, fail, compatible, jsonShape, validateValue, assertNonsecret } from './expressions.js';
import type { ExpressionContext } from './expressions.js';
import { compileConnector, compileDataverseTrigger, connectorOperations } from './providers.js';
import { expandRecipes, externalManifest } from './recipes.js';
import { approvalResultShape, completedApproval, approvalResponses, normalizedResponses } from './workflow-providers.js';
import { assessFlow, dependencyGraph, flattenActions } from './safety.js';
import { actionRecipe } from './registry.js';

export function environmentShape(type:string,format?:ValueShape['type']):ValueShape {return {type:format??({text:'string',number:'number',boolean:'boolean',json:'string'} as const)[type as 'text']??'string'};}
export function triggerPorts(flow:FlowSpec){const counters:Record<string,number>={};return flow.inputs.map(p=>{
  if(['object','array','binary'].includes(p.shape.type)||!p.required)fail('V1 Power Apps trigger supports required scalar inputs only; encode complex payloads explicitly as JSON strings.');
  const base=p.shape.type==='boolean'?'boolean':['number','integer'].includes(p.shape.type)?'number':p.shape.type==='date'?'date':'text';const i=counters[base]??0;counters[base]=i+1;return {...p,wire:i?`${base}_${i}`:base};
});}
export function compileFlow(flow:FlowSpec,resources:FlowResources) {
  const ports=triggerPorts(flow);
  if((flow.flowType==='instant')!==(['powerAppsV2','manual'].includes(flow.trigger.type)))fail('Flow type and trigger disagree.');
  if(flow.flowType!=='instant'&&(ports.length||flow.outputs.length))fail('Scheduled flows cannot have Power Apps inputs/outputs.');
  if((flow.flowType==='scheduled')!==(flow.trigger.type==='recurrence')||(flow.flowType==='automated')!==(flow.trigger.type==='dataverse'))fail('Flow type and trigger disagree.');
  const safety=assessFlow(flow,resources);
  if(safety.blockers.length)fail(safety.blockers.join(' '));
  if(new Set(flow.inputs.map(p=>p.name.toLowerCase())).size!==ports.length||new Set(flow.outputs.map(p=>p.name.toLowerCase())).size!==flow.outputs.length)fail('Duplicate flow port names.');
  if((flow.role==='child')!==(flow.trigger.type==='manual'))fail('Child-flow role requires a manual trigger and vice versa.');
  const calls=flattenActions(flow.actions).filter(a=>a.use==='flows.invoke').map(a=>a.flow!);
  if(calls.length&&!flow.role)fail('Child-flow invocation requires explicit parent/child role.');
  if(flow.dependencies.some(k=>!calls.includes(k))||calls.some(k=>!flow.dependencies.includes(k)))fail('Child-flow dependencies must exactly declare invoked children.');
  for(const keys of [flow.connectionReferences,flow.environmentVariables])if(new Set(keys).size!==keys.length)fail('Duplicate flow dependency.');
  const c:ExpressionContext={inputs:Object.fromEntries(ports.map(p=>[p.name,{shape:p.shape,wire:p.wire}])),outputs:{},variables:{},environment:{}};
  const parameters:Record<string,unknown>={'$connections':{defaultValue:{},type:'Object'},'$authentication':{defaultValue:{},type:'SecureObject'}};
  for(const key of flow.environmentVariables){const v=resources.environmentVariables[key];if(!v)fail(`Missing environment variable ${key}.`);if(['secret','dataSource'].includes(v!.type))fail('Secret/data-source environment variables require a provider not implemented in V1.');
    const shape=environmentShape(v!.type,v!.format);if(v!.default!==undefined&&!validateValue(v!.default,shape))fail('Environment variable default has wrong type; JSON uses a serialized JSON string.');
    if(v!.type==='json'&&v!.default!==undefined){try{JSON.parse(String(v!.default));}catch{fail('Environment JSON default is invalid.');}}
    c.environment[key]={shape,parameter:v!.logicalName};parameters[v!.logicalName]={type:({string:'String',number:'Float',boolean:'Bool'} as Record<string,string>)[shape.type]??'String',metadata:{schemaName:v!.logicalName},...(v!.default!==undefined?{defaultValue:v!.default}:{})};
  }
  const connectionReferences:Record<string,unknown>={};
  for(const key of flow.connectionReferences){const ref=resources.connectionReferences[key];if(!ref)fail(`Missing connection reference ${key}.`);connectionReferences[key]={runtimeSource:'embedded',connection:{connectionReferenceLogicalName:ref!.logicalName},api:{name:ref!.connector}};}
  const automatedTrigger=flow.trigger.type==='dataverse'?compileDataverseTrigger(flow.trigger,resources,c):undefined;
  const names=new Set<string>();let responseCount=0,count=0;const usedConnections=new Set<string>(flow.trigger.type==='dataverse'?[flow.trigger.connection]:[]);
  const emit=(actions:FlowAction[],ctx:ExpressionContext,depth=0):Record<string,unknown>=>{
    if(depth>8)fail('Flow nesting exceeds eight levels.');const result:Record<string,unknown>={};let previous:string|undefined;
    for(const a of actions){if(++count>flow.runPolicy.maxActions||names.has(a.name.toLowerCase()))fail('Duplicate action name or action limit exceeded.');names.add(a.name.toLowerCase());const recipe=actionRecipe(a.use);let body:Record<string,unknown>={type:recipe.operation};let output:ValueShape|undefined;let outputBody=true;
      const ex=(e:NonNullable<FlowAction['value']>,expected?:ValueShape)=>{const r=expression(e,ctx);if(expected&&!compatible(r.shape,expected))fail(`Type mismatch in ${a.name}.`);return r;};
      const fieldValues=(fields:Record<string,NonNullable<FlowAction['value']>>,context=ctx)=>Object.fromEntries(Object.entries(fields).map(([k,e])=>[k,'@'+expression(e,context).code]));
      switch(a.use){
        case 'control.scope':body.actions=emit(a.actions!,structuredClone(ctx),depth+1);break;
        case 'control.delay':body.inputs={interval:{count:a.seconds,unit:'Second'}};break;
        case 'control.terminate':if(ctx.loop)fail('Terminate is not allowed in a loop.');body.inputs={runStatus:'Failed',runError:{code:'PowerCanvasUncertain',message:'@'+ex(a.value!,{type:'string'}).code}};break;
        case 'workflow.correlation':case 'data.object':{
          if(a.use==='workflow.correlation'){ex(a.fields!.correlationId!,{type:'guid'});ex(a.fields!.sourceRecordId!,{type:'guid'});ex(a.fields!.parentRunContext!,{type:'string'});}
          body.inputs=fieldValues(a.fields!);output={type:'object',fields:Object.fromEntries(Object.entries(a.fields!).map(([k,v])=>[k,ex(v).shape]))};outputBody=false;break;
        }
        case 'flows.invoke':{
          const child=resources.flows[a.flow!];if(!child||child.role!=='child'||child.trigger.type!=='manual')fail('Child-flow target is missing, outside this solution, or not a child.');
          const childPorts=triggerPorts(child);if(JSON.stringify(Object.keys(a.arguments!).sort())!==JSON.stringify(childPorts.map(p=>p.name).sort()))fail('Child-flow input contract mismatch.');
          const args=Object.fromEntries(childPorts.map(p=>[p.wire,'@'+ex(a.arguments![p.name]!,p.shape).code]));
          body={type:'Workflow',inputs:{host:{workflowReferenceName:child.logicalName},body:args,retryPolicy:{type:'none'}}};output={type:'object',fields:Object.fromEntries(child.outputs.map(p=>[p.name,p.shape]))};break;
        }
        case 'approvals.responses':{
          const raw=ex(a.from!,approvalResponses);body.inputs={from:`@coalesce(${raw.code},json('[]'))`,select:{responderId:"@coalesce(item()?['responder']?['id'],'')",responderName:"@coalesce(item()?['responder']?['displayName'],'')",responderEmail:"@coalesce(item()?['responder']?['email'],'')",comments:"@coalesce(item()?['comments'],'')",response:"@coalesce(item()?['approverResponse'],'')"}};output=normalizedResponses;break;
        }
        case 'approvals.result':{
          const raw=ex(a.from!);if(raw.shape.type!=='object'||!raw.shape.fields?.outcome||!raw.shape.fields?.responses||!compatible(raw.shape.fields.responses,completedApproval.fields!.responses!))fail('Approval normalization requires a completed approval result.');
          const code=raw.code;body.inputs={approvalId:'@'+ex(a.approvalId!,{type:'string'}).code,outcome:`@if(equals(${code}?['outcome'],'Approve'),'approved',if(equals(${code}?['outcome'],'Reject'),'rejected',if(equals(${code}?['outcome'],'Cancel'),'cancelled','unknown')))`,responses:'@'+ex(a.responses!,normalizedResponses).code};output=approvalResultShape;outputBody=false;break;
        }
        case 'data.compose':{const r=ex(a.value!);body.inputs='@'+r.code;output=r.shape;outputBody=false;break;}
        case 'data.parseJson':body.inputs={content:'@'+ex(a.value!,{type:'string'}).code,schema:jsonShape(a.shape!)};output=a.shape;break;
        case 'data.select':case 'data.filterArray':{const from=ex(a.from!);if(from.shape.type!=='array')fail('Data projection requires an array.');const inner={...ctx,item:from.shape.items!};delete inner.loop;
          if(a.use==='data.select'){body.inputs={from:'@'+from.code,select:fieldValues(a.fields!,inner)};output={type:'array',items:{type:'object',fields:Object.fromEntries(Object.entries(a.fields!).map(([k,e])=>[k,expression(e,inner).shape]))}};}
          else {const predicate=expression(a.condition!,inner);if(predicate.shape.type!=='boolean')fail('Filter predicate must be boolean.');body.inputs={from:'@'+from.code,where:'@'+predicate.code};output=from.shape;}break;}
        case 'control.condition':body.expression='@'+ex(a.condition!,{type:'boolean'}).code;body.actions=emit(a.actions!,structuredClone(ctx),depth+1);body.else={actions:emit(a.otherwise!,structuredClone(ctx),depth+1)};break;
        case 'control.applyToEach':{const from=ex(a.from!);if(from.shape.type!=='array')fail('Loop requires an array.');body.foreach=`@take(${from.code},${a.maxItems})`;body.runtimeConfiguration={concurrency:{repetitions:1}};body.actions=emit(a.actions!,{...structuredClone(ctx),item:from.shape.items!,loop:a.name},depth+1);break;}
        case 'variables.initialize':{if(depth||ctx.variables[a.variable!])fail('Variables must be initialized once at the top level.');ex(a.value!,a.shape!);ctx.variables[a.variable!]=a.shape!;body.inputs={variables:[{name:a.variable,type:({number:'float',integer:'integer',boolean:'boolean',array:'array',object:'object'} as Record<string,string>)[a.shape!.type]??'string',value:'@'+ex(a.value!).code}]};break;}
        case 'variables.set':case 'variables.append':{const type=ctx.variables[a.variable!];if(!type)fail('Variable is not initialized in this scope.');if(a.use==='variables.append'&&type!.type!=='array')fail('Append requires an array variable.');const r=ex(a.value!,a.use==='variables.append'?type!.items!:type!);if(r.code.includes(`variables('${a.variable}')`))fail('Variable self-reference updates are not supported; use a preceding compose.');body.inputs={name:a.variable,value:'@'+r.code};break;}
        case 'flows.respond':case 'powerApps.respond':{if(depth||(a.use==='flows.respond'?flow.role!=='child':flow.trigger.type!=='powerAppsV2')||a!==actions.at(-1)||++responseCount!==1)fail('Power Apps response must be the single final top-level action.');
          const expected=flow.outputs.map(p=>p.name).sort();if(JSON.stringify(Object.keys(a.fields!).sort())!==JSON.stringify(expected))fail('Response fields do not match declared outputs.');
          for(const p of flow.outputs){if(['object','array','binary'].includes(p.shape.type))fail('Complex Power Apps outputs are not supported in V1.');ex(a.fields![p.name]!,p.shape);}
          body.kind='PowerApp';body.inputs={statusCode:200,body:fieldValues(a.fields!),schema:{type:'object',properties:Object.fromEntries(flow.outputs.map(p=>[p.name,{...jsonShape(p.shape),title:p.name,'x-ms-dynamically-added':true}]))}};break;}
        default:{
          if(!connectorOperations[a.use])fail('Unsupported registry compiler.');
          if(!flow.connectionReferences.includes(a.connection!))fail('Action connection is not a declared dependency.');
          usedConnections.add(a.connection!);const compiled=compileConnector(a,resources,ctx);body=compiled.body;output=compiled.output;break;
        }
      }
      if(a.after){
        if(a.after.action!==previous||!result[a.after.action])fail('runAfter must refer to the immediately preceding sibling; parallel output dominance is not implemented.');
        // Failure/skipped branches cannot consume potentially unavailable successful outputs.
        if(a.after.statuses.some(s=>s!=='Succeeded')){
          const refs=JSON.stringify({...a,after:undefined});if(/"op":"(?:output|variable)"/.test(refs))fail('Failure/skipped branch cannot reference prior action outputs or variables; persist correlation or use trigger inputs.');
        }
      }
      if(a.after?.statuses.some(s=>s!=='Succeeded'))ctx.outputs={};
      body.runAfter=a.after?{[a.after.action]:a.after.statuses}:previous?{[previous]:['Succeeded']}:{};result[a.name]=body;previous=a.name;if(output)ctx.outputs[a.name]={shape:output,body:outputBody};
    }return result;
  };
  const actions=emit(flow.actions,c);
  if(['powerAppsV2','manual'].includes(flow.trigger.type)&&responseCount!==1)fail('Instant flow requires one typed response.');
  if(flow.connectionReferences.some(k=>!usedConnections.has(k)))fail('Unused connection dependency.');
  const trigger=['powerAppsV2','manual'].includes(flow.trigger.type)?{type:'Request',kind:flow.trigger.type==='manual'?'Button':'PowerAppV2',inputs:{schema:{type:'object',properties:Object.fromEntries(ports.map(p=>[p.wire,{...jsonShape(p.shape),title:p.name,'x-ms-dynamically-added':true,'x-ms-content-hint':p.shape.type==='boolean'?'BOOLEAN':['number','integer'].includes(p.shape.type)?'NUMBER':p.shape.type==='date'?'DATE':'TEXT'}])),required:ports.map(p=>p.wire)}}}:flow.trigger.type==='dataverse'?automatedTrigger!:{type:'Recurrence',recurrence:{frequency:(flow.trigger as Extract<FlowSpec['trigger'],{type:'recurrence'}>).frequency,interval:(flow.trigger as Extract<FlowSpec['trigger'],{type:'recurrence'}>).interval,startTime:(flow.trigger as Extract<FlowSpec['trigger'],{type:'recurrence'}>).startTime}};
  const clientdata={properties:{connectionReferences,definition:{$schema:'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',contentVersion:'1.0.0.0',parameters,triggers:{manual:trigger},actions}},schemaVersion:'1.0.0.0'};
  return {logicalName:flow.logicalName,displayName:flow.displayName,description:flow.description,clientdata,definitionHash:hashJson(clientdata as JsonInput),ports,outputs:flow.outputs,risk:safety.risk,safety,actions:count,activationPolicy:flow.activationPolicy};
}
export function compileFlows(project:Project){const original=flowResourcesSchema.parse(project.resources??{});const {resources,plans}=expandRecipes(original);
  const graph=dependencyGraph(resources);if(!graph.resolved)fail('Child-flow dependency graph is unresolved or cyclic.');
  const names=new Set<string>();
  const aliases=resources.canvasBindings.map(b=>(b.app+'.'+b.alias).toLowerCase());if(new Set(aliases).size!==aliases.length)fail('Duplicate Canvas flow alias.');
  for(const value of Object.values(resources.environmentVariables)){assertNonsecret(value.default);if(value.type==='json'&&value.default!==undefined){try{assertNonsecret(JSON.parse(String(value.default)));}catch{fail('Invalid or secret-bearing environment JSON.');}}}
  for(const resource of [...Object.values(resources.flows),...Object.values(resources.connectionReferences),...Object.values(resources.environmentVariables)]){if(!resource.logicalName.startsWith(project.solution.publisher.prefix+'_')||names.has(resource.logicalName.toLowerCase()))fail('Flow resource identities must be unique and use the solution publisher prefix.');names.add(resource.logicalName.toLowerCase());}
  for(const binding of resources.canvasBindings){const app=project.canvasApps?.[binding.app];if(!app?.application?.existingAppId||!resources.flows[binding.flow])fail('Canvas flow binding needs an existing pinned application and declared flow.');if(assessFlow(resources.flows[binding.flow]!,resources).longRunning)fail('Long-running approval cannot use a synchronous Canvas binding; use create/persist and later processing.');}
  const flows=Object.fromEntries(Object.entries(resources.flows).map(([k,f])=>[k,compileFlow(f,resources)]));
  const recipes=Object.fromEntries(Object.entries(plans).map(([k,p])=>[k,{...p as Record<string,unknown>,safety:flows[k]!.safety,outputs:flows[k]!.outputs,dependencies:resources.flows[k]!.dependencies,connectors:[...new Set(flows[k]!.safety.effects.map(e=>connectorOperations[e.operation]!.provider))]}]));
  return {resources,flows,sourceHash:hashJson(original),recipes,manifest:externalManifest(resources)};
}
