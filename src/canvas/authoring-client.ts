import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import type { AuthoringCall, SourceIdentity, ToolResult } from './source-provider.js';
import { requireToolResult, studioIdentity, toolText } from './source-provider.js';
import { authoringFailure, AuthoringOperationError } from './authoring-diagnostics.js';
import { sanitizedHttpEvidence } from './authoring-health.js';

/** Supported official MCP stdio interface. Authentication remains inside Microsoft's server. */
export async function connectAuthoring(options:{command:string;args:string[];env?:NodeJS.ProcessEnv;studioUrl:string;expectedAppId:string;loginHint?:string;onDiagnostic?:(record:Record<string,unknown>)=>void}) {
  const identity=studioIdentity(options.studioUrl);if(identity.appId!==options.expectedAppId)throw new Error('Studio app differs from project binding');
  const epoch=randomUUID();
  const child=spawn(options.command,options.args,{windowsHide:true,stdio:['pipe','pipe','pipe'],env:options.env??process.env});
  const observe=(record:Record<string,unknown>)=>options.onDiagnostic?.({...record,appId:identity.appId,environmentId:identity.environmentId,epoch,at:new Date().toISOString()});
  child.on('spawn',()=>observe({phase:'process-start',pid:child.pid}));
  child.on('exit',(code,signal)=>observe({phase:'process-exit',pid:child.pid,code,signal}));
  const closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));
  let next=1;const pending=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  const send=(value:unknown)=>child.stdin.write(JSON.stringify(value)+'\n');
  const close=()=>{child.kill();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Authoring session closed'));}pending.clear();};
  child.on('error',close);child.on('exit',close);child.stdin.on('error',close);
  // Drain diagnostics without exporting token-bearing server output.
  child.stderr.on('data',()=>{});
  createInterface({input:child.stdout}).on('line',line=>{let message: {id?:number;result?:unknown;error?:unknown;method?:string};try{message=JSON.parse(line);}catch{return;}
    if(message.id&&pending.has(message.id)){const p=pending.get(message.id)!;pending.delete(message.id);clearTimeout(p.timer);if(message.error)p.reject(new Error('Official MCP protocol error'));else p.resolve(message.result);}
    else if(message.id&&message.method)send({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Interactive elicitation unavailable; use browser/broker sign-in'}});
  });
  const request=(method:string,params:unknown)=>new Promise<unknown>((resolve,reject)=>{const id=next++;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Official MCP request timed out; outcome is unknown'));close();},120_000);pending.set(id,{resolve,reject,timer});send({jsonrpc:'2.0',id,method,params});});
  const call:AuthoringCall=async(name,args)=>await request('tools/call',{name,arguments:args}) as ToolResult;
  try{
    await request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'powercanvas-authoring',version:'4.2'}});
    observe({phase:'initialize',success:true});
    send({jsonrpc:'2.0',method:'notifications/initialized',params:{}});
    const catalog=await request('tools/list',{}) as {tools:{name:string}[]};
    observe({phase:'tool-catalog',success:true,tools:catalog.tools.map(t=>t.name)});
    const result=await call('connect',{environment_id:identity.environmentId,app_id:identity.appId,environment_category:identity.environmentCategory,...(options.loginHint?{login_hint:options.loginHint}:{})});
    observe({phase:'connect-response',authenticated:/Signed in as:/i.test(toolText(result)),...sanitizedHttpEvidence(toolText(result))});
    if(result.isError||!toolText(result).trim()){
      const diagnostic=authoringFailure(toolText(result),'connect');
      options.onDiagnostic?.({...diagnostic,environmentId:identity.environmentId,appId:identity.appId,epoch,at:new Date().toISOString()});
      throw new AuthoringOperationError(diagnostic);
    }
    const text=requireToolResult(result);
    if(!text.includes(identity.appId)||!text.includes(identity.environmentId)||!text.includes('Successfully connected'))throw new Error('Official connection identity not established');
    const session:SourceIdentity={appId:identity.appId,environmentId:identity.environmentId,sessionId:epoch};
    options.onDiagnostic?.({phase:'connect',success:true,environmentId:identity.environmentId,appId:identity.appId,epoch,at:new Date().toISOString()});
    return {call,catalog,identity:session,close,closed};
  }catch(error){
    close();
    await closed;
    if(error instanceof AuthoringOperationError)throw error;
    const diagnostic=authoringFailure(String(error),'connect');
    options.onDiagnostic?.({...diagnostic,environmentId:identity.environmentId,appId:identity.appId,epoch,at:new Date().toISOString()});
    throw new AuthoringOperationError(diagnostic);
  }
}
