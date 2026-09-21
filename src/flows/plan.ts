import { flowOrder, bindChildIdentities } from './orchestration.js';
import type { Project } from '../ir/schema.js';
import { hashJson } from '../core/json.js';
import type { JsonInput } from '../core/json.js';
import type { Target } from '../state/models.js';
import { compileFlows, environmentShape } from './compile.js';
import { deploymentSchema } from './schema.js';
import type { FlowDeployment } from './schema.js';
import { validateValue, fail, assertNonsecret } from './expressions.js';
import type { FlowSnapshot, ResourceKind } from './remote.js';
import { managedPayload } from './remote.js';
import { dependencyGraph, portabilityAudit, flattenActions } from './safety.js';
export type FlowOwnership={projectId:string;target:Target;entries:Record<string,{kind:ResourceKind;id:string;hash:string;solutionId:string;logicalName:string;owner:string|null}>;pending?:{key:string;id:string;operation:string}};
export type FlowOperation={key:string;kind:ResourceKind;id:string;logicalName:string;status:'CREATE'|'UPDATE'|'NO-OP'|'BLOCKED'|'CONFLICT'|'ORPHANED';reason:string;body:Record<string,unknown>;expectedHash:string|null;desiredHash:string;etag:string|null};
export type FlowPlan={version:1;projectId:string;target:Target;sourceHash:string;deploymentHash:string;solutionId:string;solutionName:string;operations:FlowOperation[];canvasBindings:{app:string;flow:string;alias:string;status:string}[];remoteMutations:0;executable:boolean;hash:string;dependencies?:ReturnType<typeof dependencyGraph>;portability?:ReturnType<typeof portabilityAudit>;risk?:Record<string,ReturnType<typeof compileFlows>['flows'][string]['safety']>;warnings?:string[];recipes?:Record<string,unknown>;manifest?:ReturnType<typeof compileFlows>['manifest']};
const digest=(v:unknown)=>hashJson(v as JsonInput);
export function planFlows(project:Project,target:Target,snapshot:FlowSnapshot,ownership:FlowOwnership,deployment:FlowDeployment):FlowPlan {
  const compiled=compileFlows(project);deployment=deploymentSchema.parse(deployment);
  for(const key of Object.keys(deployment.connections))if(!compiled.resources.connectionReferences[key])fail('Undeclared deployment connection.');
  for(const [key,value]of Object.entries(deployment.environmentValues)){
    const spec=compiled.resources.environmentVariables[key];
    if(!spec||['secret','dataSource'].includes(spec.type))fail('Undeclared or unsupported environment override; secret values are never accepted.');
    assertNonsecret(value);
    if(spec.type==='json'){try{assertNonsecret(JSON.parse(String(value)));}catch{fail('Invalid or secret-bearing environment JSON.');}}
  }
  if(deployment.environmentId.toLowerCase()!==target.environmentId.toLowerCase()||ownership.projectId!==project.project.id||digest(ownership.target)!==digest(target))fail('Flow state or deployment settings target mismatch.');
  const ops:FlowOperation[]=[];const ids:Record<string,string>={};
  const add=(key:string,kind:ResourceKind,logicalName:string,displayName:string,body:Record<string,unknown>,blocked?:string)=>{
    const owned=ownership.entries[key];const byId=owned?snapshot.resources.find(r=>r.kind===kind&&r.id===owned.id):undefined;
    const collisions=snapshot.resources.filter(r=>r.kind===kind&&(r.logicalName.toLowerCase()===logicalName.toLowerCase()||(displayName&&r.displayName.toLowerCase()===displayName.toLowerCase())));
    const seed=digest({projectId:project.project.id,target,key});const id=owned?.id??`${seed.slice(0,8)}-${seed.slice(8,12)}-5${seed.slice(13,16)}-a${seed.slice(17,20)}-${seed.slice(20,32)}`;ids[key]=id;
    const desiredHash=digest(managedPayload(kind,kind==='environmentValue'?{...body,_environmentvariabledefinitionid_value:logicalName}:body));
    let status:FlowOperation['status']='CREATE',reason='New owned solution resource; create off/draft.';
    if(owned){if(!byId||byId.managed||!byId.member||owned.solutionId!==snapshot.solutionId||byId.logicalName!==owned.logicalName||byId.owner!==owned.owner){status='CONFLICT';reason='Owned identity, solution, owner or managed state changed.';}
      else if(byId.hash!==owned.hash){status='CONFLICT';reason='Remote source changed since the last verified readback; no overwrite.';}
      else if(byId.hash===desiredHash){status='NO-OP';reason='Desired source equals verified remote source.';}
      else if(kind==='flow'&&byId.state!==0){status='BLOCKED';reason='Deactivate explicitly before updating an active flow.';}
      else{status='UPDATE';reason='Owned draft update with exact source and etag preconditions.';}}
    if(collisions.some(r=>r.id!==owned?.id)){status='CONFLICT';reason='Logical/display name collision: rename or abort. V1 never adopts existing resources.';}
    if(ownership.pending){status='BLOCKED';reason='An interrupted write requires journal reconciliation; retry is forbidden.';}
    if(blocked&&status!=='CONFLICT'){status='BLOCKED';reason=blocked;}
    ops.push({key,kind,id,logicalName,status,reason,body,expectedHash:byId?.hash??null,desiredHash,etag:byId?.etag??null});
  };
  for(const [key,ref]of Object.entries(compiled.resources.connectionReferences)){const binding=deployment.connections[key];add('connection:'+key,'connection',ref.logicalName,ref.displayName,{connectionreferencelogicalname:ref.logicalName,connectionreferencedisplayname:ref.displayName,connectorid:'/providers/Microsoft.PowerApps/apis/'+ref.connector,connectionid:binding?.connectionId??null},!binding?.authorizationVerified||!binding.principalId||!binding.authorizationEvidence?'Connection authorization requires owner verification, principal identity and evidence; connector existence is not authorization.':binding.connector!==ref.connector?'Authenticated connection connector does not match the reference.':binding.environmentId?.toLowerCase()!==target.environmentId.toLowerCase()?'Authenticated connection environment mismatch or unverified.':!ownership.entries['connection:'+key]&&!ref.allowCreate?'Connection reference creation is not explicitly permitted.':undefined);}
  const typeCodes={text:100000000,number:100000001,boolean:100000002,json:100000003,dataSource:100000004,secret:100000005};
  for(const [key,v] of Object.entries(compiled.resources.environmentVariables)){
    let blocked=['secret','dataSource'].includes(v.type)?'V1 refuses secret/data-source provisioning; a dedicated provider is required.':undefined;
    if(v.default!==undefined&&!validateValue(v.default,environmentShape(v.type,v.format)))blocked='Environment default type mismatch.';
    add('environment:'+key,'environment',v.logicalName,v.displayName,{schemaname:v.logicalName,displayname:v.displayName,type:typeCodes[v.type],defaultvalue:v.default===undefined?null:String(v.default)},blocked);
    if(Object.hasOwn(deployment.environmentValues,key)){const value=deployment.environmentValues[key];if(!validateValue(value,environmentShape(v.type,v.format)))fail('Environment override type mismatch.');add('environmentValue:'+key,'environmentValue',ids['environment:'+key]!,'',{value:String(value),'EnvironmentVariableDefinitionId@odata.bind':`/environmentvariabledefinitions(${ids['environment:'+key]})`},blocked);}
  }
  for(const key of Object.keys(compiled.flows)){const seed=digest({projectId:project.project.id,target,key:'flow:'+key});ids['flow:'+key]=ownership.entries['flow:'+key]?.id??`${seed.slice(0,8)}-${seed.slice(8,12)}-5${seed.slice(13,16)}-a${seed.slice(17,20)}-${seed.slice(20,32)}`;}
  const childIds=Object.fromEntries(Object.entries(compiled.flows).map(([k,f])=>[f.logicalName,ids['flow:'+k]!]));
  for(const key of flowOrder(compiled.resources)){const flow=compiled.flows[key]!;
    const source=compiled.resources.flows[key]!;const dependencyBlocked=ops.some(o=>['BLOCKED','CONFLICT'].includes(o.status));
    const clientdata=structuredClone(flow.clientdata);bindChildIdentities(clientdata,childIds);
    for(const ref of source.connectionReferences)(clientdata.properties.connectionReferences[ref] as {connection:Record<string,unknown>}).connection.name=deployment.connections[ref]?.connectionId;
    let missingEnvironment=false;
    for(const ref of source.environmentVariables){const spec=compiled.resources.environmentVariables[ref]!;const value=deployment.environmentValues[ref]??spec.default;if(value===undefined){missingEnvironment=true;continue;}(clientdata.properties.definition.parameters[spec.logicalName] as Record<string,unknown>).defaultValue=value;}
    const unresolvedPdf=flattenActions(source.actions).some(a=>a.use==='word.convertToPdf'&&a.file?.op==='output');
    add('flow:'+key,'flow',flow.logicalName,flow.displayName,{uniquename:flow.logicalName,name:flow.displayName,description:flow.description,category:5,type:1,primaryentity:'none',clientdata:JSON.stringify(clientdata)},unresolvedPdf?'Word PDF locator for a newly saved file requires runtime identity proof; deployment is blocked.':dependencyBlocked||missingEnvironment?'Unresolved flow dependencies.':undefined);
  }
  for(const [key,entry]of Object.entries(ownership.entries))if(!ops.some(o=>o.key===key))ops.push({key,kind:entry.kind,id:entry.id,logicalName:entry.logicalName,status:'ORPHANED',reason:'Declaration removed; retained remotely. No delete operation exists.',body:{},expectedHash:entry.hash,desiredHash:entry.hash,etag:null});
  const dependencies=dependencyGraph(compiled.resources);
  const body={version:1 as const,projectId:project.project.id,target,sourceHash:compiled.sourceHash,deploymentHash:digest(deployment),solutionId:snapshot.solutionId,solutionName:snapshot.solutionName,operations:ops,canvasBindings:compiled.resources.canvasBindings.map(b=>({...b,status:ops.find(o=>o.key==='flow:'+b.flow)?.status==='NO-OP'?'READY FOR EXPLICIT NATIVE BINDING':'WAITING ON FLOW DEPENDENCIES'})),recipes:compiled.recipes,manifest:compiled.manifest,remoteMutations:0 as const,executable:dependencies.resolved&&!ops.some(o=>['CONFLICT','BLOCKED'].includes(o.status)),dependencies,portability:portabilityAudit(compiled.resources),risk:Object.fromEntries(Object.entries(compiled.flows).map(([k,f])=>[k,f.safety])),warnings:[...(deployment.flowUpdateConcurrency==='verifiedSource'?['verifiedSource explicitly uses If-Match: *; source checks do not provide atomic optimistic concurrency.']:[]),'Flows deploy disabled. Deployment does not grant permission to execute writes.']};
  return {...body,hash:digest(body)};
}
export function verifyPlan(plan:FlowPlan){const {hash,...body}=plan;if(hash!==digest(body))fail('Flow plan hash mismatch.');}
