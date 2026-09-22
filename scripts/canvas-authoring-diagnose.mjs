import {loadLocalAuthoringConfig} from './local-authoring-config.mjs';
const local=await loadLocalAuthoringConfig();
// V4.5: read-only capability ladder. No compile, import, save, publish, account removal, or retry.
import process from 'node:process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {connectAuthoring} from '../dist/canvas/authoring-client.js';
import {CapabilityLadder,studioUrlMetadata,providerHealth,redactDiagnostic} from '../dist/canvas/authoring-health.js';
import {AuthoringMcpProvider,authoringDoctor,toolText,requireToolResult} from '../dist/canvas/source-provider.js';
import {semanticSourceHash} from '../dist/canvas/authoring-lifecycle.js';
const [observationFile,out]=process.argv.slice(2);if(!observationFile||!out)throw Error('Usage: canvas-authoring-diagnose.mjs current-observation.json fresh-output');
await mkdir(out,{recursive:true});
const save=(name,value)=>writeFile(join(out,name+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const observation=JSON.parse(await readFile(observationFile,'utf8'));
if(!observation.coauthoringEnabled||!observation.autoSaveDisabled||!observation.loaded||observation.role!=='Editing'||!Number.isFinite(Date.parse(observation.observedAt))||Date.now()-Date.parse(observation.observedAt)>30*60_000||Date.parse(observation.observedAt)>Date.now())throw Error('Fresh observable Studio readiness required');
const url=studioUrlMetadata(observation.studioUrl),binding=local.binding;
if(url.appId!==binding.appId||url.environmentId!==binding.environmentId)throw Error('Current Studio URL differs from owned app');
const runtime=resolve('.powercanvas/tooling/dotnet/dotnet.exe'),env={...process.env,DOTNET_ROOT:resolve('.powercanvas/tooling/dotnet')};
const sdk=(await promisify(execFile)(runtime,['--version'],{windowsHide:true,env})).stdout.trim();if(Number(sdk.split('.')[0])<10)throw Error('.NET 10 required');
const launch={command:runtime,args:['dnx','Microsoft.PowerApps.CanvasAuthoring.McpServer@1.1.5','--yes'],environmentOverrides:{DOTNET_ROOT:env.DOTNET_ROOT},authentication:{auth_flow:'official default',login_hint:local.loginHint,tenant_id:'omitted; normal same-tenant sign-in',force_account_select:false}};
await save('configuration',{version:'4.5',currentUrl:url,launch,sdk,configuredAt:new Date().toISOString(),observation:observationFile});
const diagnostics=[],ladder=new CapabilityLadder();let session,current,doctor,provider,sourceValidated=false;
const observe=record=>{diagnostics.push(record);if(record.phase==='initialize')ladder.record('MCP_STARTED','PASS','Official MCP initialize returned');if(record.phase==='connect-response')ladder.record('AUTHENTICATED',record.authenticated?'PASS':'UNPROVEN',record.authenticated?'Official tool explicitly identifies signed-in account':'No affirmative authentication evidence returned');};
try{
 session=await connectAuthoring({...launch,env,studioUrl:observation.studioUrl,expectedAppId:binding.appId,loginHint:launch.authentication.login_hint,onDiagnostic:observe});
 ladder.record('STUDIO_SESSION_RESOLVED','PASS','Official connect response matches app and environment');
 const step=async(stage,name,args={})=>{try{const result=await session.call(name,args);const text=requireToolResult(result);if(name==='list_controls'&&!/Power Apps Controls:\s*\r?\n\s*-\s*\w/i.test(text))throw Error('Unrecognized control inventory');if(['list_apis','list_data_sources'].includes(name)&&!/Available (?:APIs|Data Sources):\s*\d+/i.test(text))throw Error('Unrecognized discovery response');await save(name,result);ladder.record(stage,'PASS','Official '+name+' returned verified discovery evidence');return result;}catch(error){ladder.record(stage,'FAIL',String(error));throw error;}};
 const controls=await step('CONTROL_DISCOVERY_READY','list_controls');
 await step('CONTROL_DESCRIPTION_READY','describe_control',{controlName:'Button'});
 const apis=await step('API_DISCOVERY_READY','list_apis'),dataSources=await step('DATA_SOURCE_DISCOVERY_READY','list_data_sources');
 const names=t=>[...t.matchAll(/^\s*-\s+([^\r\n(]+?)(?:\s+\(Kind:|\r?$)/gm)].map(m=>m[1].trim());
 provider=new AuthoringMcpProvider(session.call,session.identity,names(toolText(dataSources)),names(toolText(apis)));
 try{current=await provider.read(join(out,'source'));await save('source-snapshot',current.snapshot);ladder.record('SOURCE_SYNC_READY','PASS','Fresh App and screen files; source inventory verified');}
 catch(error){ladder.record('SOURCE_SYNC_READY','FAIL',String(error));throw error;}
 doctor=authoringDoctor({studioUrl:observation.studioUrl,expected:session.identity,connected:session.identity,coauthoringEnabled:true,dotnetMajor:Number(sdk.split('.')[0]),workspaceWritable:true,tools:session.catalog.tools.map(t=>t.name),controls,apis,dataSources,source:current});await save('doctor',doctor);
 if(!doctor.passed)throw Error('Source doctor failed');
 if(observation.expectedSemanticHash&&semanticSourceHash(current.files)!==observation.expectedSemanticHash)throw Error('Acquired source differs from protected semantic target');
 sourceValidated=true;
 await save('source-identity',{identity:current.snapshot.identity,sourceHash:current.snapshot.sourceHash,semanticHash:semanticSourceHash(current.files),screens:Object.keys(current.snapshot.screenHashes)});
}catch(error){
 const stage=ladder.results.find(r=>r.status==='NOT_REACHED');if(stage&&!ladder.results.some(r=>r.status==='FAIL'))ladder.record(stage.stage,'FAIL',String(error));
 await save('failure',{error:redactDiagnostic(String(error)),autoRetry:false});process.exitCode=1;
}finally{
 session?.close();
 if(session)await session.closed;
 await save('diagnostics',diagnostics);await save('capability-ladder',ladder.results);
 const healthEvidence={doctorPassed:sourceValidated,recoveryRequired:!!current&&!sourceValidated,rejected:diagnostics.some(d=>d.httpStatus===422)};
 const health=provider?provider.health(healthEvidence):providerHealth('authoringMcp',{...healthEvidence,readSucceeded:false});
 await save('provider-health',health);
 console.log(JSON.stringify({health,ladder:ladder.results,sourceWrites:0}));
}
