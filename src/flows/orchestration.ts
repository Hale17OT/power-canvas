import {hashJson} from '../core/json.js';
import type {FlowResources,FlowDeployment} from './schema.js';
import {fail} from './expressions.js';
/** Dependency-first order. All child resources are resolved in the enclosing solution. */
export function flowOrder(r:FlowResources){
 const ordered:string[]=[],visiting=new Set<string>(),done=new Set<string>();
 const walk=(k:string)=>{if(visiting.has(k))fail('Child-flow cycle.');if(done.has(k))return;const f=r.flows[k];if(!f)fail('Missing child flow in this solution.');visiting.add(k);for(const d of f.dependencies)walk(d);visiting.delete(k);done.add(k);ordered.push(k);};
 for(const k of Object.keys(r.flows))walk(k);return ordered;
}
export function bindChildIdentities(value:unknown,ids:Record<string,string>):void{
 if(!value||typeof value!=='object')return;
 const v=value as Record<string,unknown>;
 if(v.type==='Workflow'){
  const host=(v.inputs as {host:{workflowReferenceName:string}}).host;
  const id=ids[host.workflowReferenceName];if(!id)fail('Child-flow deployment identity is unresolved.');host.workflowReferenceName=id;
 }
 for(const child of Object.values(v))bindChildIdentities(child,ids);
}
export function transitiveChildren(r:FlowResources,key:string){const result=new Set<string>();const walk=(k:string)=>{for(const child of r.flows[k]!.dependencies){if(!result.has(child)){result.add(child);walk(child);}}};walk(key);return [...result];}

export function workflowConfigurationHash(d:FlowDeployment){return hashJson({environmentId:d.environmentId.toLowerCase(),connections:d.connections,environmentValues:d.environmentValues});}
