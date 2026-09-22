import {routeRequest,interpretResult} from './routing.js';
import {resolveAdapter} from '../canvas/taste/catalog.js';
import {commandPolicy} from './commands.js';
export interface RoutingCase {id:string;prompt:string;context?:boolean;health?:string;skills:string[];steps:string[];status:string;capability?:string}
export function evaluateRouting(cases:readonly RoutingCase[],knownCommands:readonly string[]){
 const results=cases.map(c=>{
  const result=routeRequest(c.prompt,{powerCanvasProject:c.context??true,authoringHealth:c.health});
  const checks={routing:JSON.stringify(result.skills)===JSON.stringify(c.skills),status:result.status===c.status,workflow:c.steps.every(s=>result.steps.includes(s)),commands:result.commands.every(v=>knownCommands.includes(v.command)&&!['TENANT_WRITE','BUSINESS_DATA_WRITE','DESTRUCTIVE','AUTHORING_SESSION_WRITE'].includes(commandPolicy(v.command).risk)),noExecution:result.executionAuthorized===false,capability:c.capability?resolveAdapter(c.capability).implemented===false:true};
  return {id:c.id,passed:Object.values(checks).every(Boolean),checks,result};
 });
 const interpretations=['BLOCKED','CONFLICT','STALE','UNSUPPORTED'].map(status=>({status,result:interpretResult({status})}));
 return {kind:'DETERMINISTIC_FIXTURES',results,interpretations,passed:results.every(r=>r.passed)&&interpretations.every(i=>!i.result.autoRetry&&!i.result.mutationAuthorized),remoteCalls:0,limitation:'Routing hints and compiler-contract checks; not proof of live LLM skill selection or host runtime behavior.'};
}
