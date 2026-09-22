import {loadLocalAuthoringConfig} from './local-authoring-config.mjs';
const local=await loadLocalAuthoringConfig();
// Existing official authoring client, with isolated-screen guards. Never save/publish.
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import process from 'node:process';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {connectAuthoring} from '../dist/canvas/authoring-client.js';
import {AuthoringMcpProvider,PacDownloadProvider,readNativeSource,authoringDoctor,toolText} from '../dist/canvas/source-provider.js';
import {compareSourceStates,validateHarnessCandidate,verifyHarnessRestoration} from '../dist/canvas/certification-harness.js';
import {hashJson} from '../dist/core/json.js';
import {compileSucceeded} from '../dist/canvas/authoring-result.js';
const [mode,candidateDirectory,out,observationFile]=process.argv.slice(2);
if(!['inspect','inspect-harness','apply','revise','restore'].includes(mode)||!out||!observationFile)throw Error('Usage: inspect|inspect-harness|apply|revise|restore candidate-directory fresh-output observation-json');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const save=async(n,v)=>writeFile(join(out,n+'.json'),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
await mkdir(out,{recursive:true});
const binding=local.binding;
const observed=await read(observationFile);
if(observed.appId!==binding.appId||observed.environmentId!==binding.environmentId||!observed.autoSaveDisabled||!observed.coauthoringEnabled||Date.now()-Date.parse(observed.observedAt)>30*60_000||Date.parse(observed.observedAt)>Date.now()||createHash('sha256').update(await readFile(observed.artifact)).digest('hex')!==observed.sha256)throw Error('Fresh Studio settings observation required');
const expectedBase=await readNativeSource('output/canvas/native/v42-focus-review');
const approvals=(await read('output/canvas/native/v42-focus-review/approved-migration-plan.json')).approvedBehaviorChanges;
const studioUrl=`https://make.powerapps.com/e/${binding.environmentId}/canvas/?action=edit&app-id=${binding.appId}`;
const env={...process.env,DOTNET_ROOT:resolve('.powercanvas/tooling/dotnet')};
let session;
try{session=await connectAuthoring({command:join(env.DOTNET_ROOT,'dotnet.exe'),args:['dnx','Microsoft.PowerApps.CanvasAuthoring.McpServer@1.1.5','--yes'],env,studioUrl,expectedAppId:binding.appId,loginHint:local.loginHint});}
catch(error){await save('failure',{phase:'connect',message:String(error),writeAttempted:false,outcome:'NO_WRITE',autoRetry:false});throw error;}
let writeAttempted=false;
try{
 const controls=await session.call('list_controls',{}),apis=await session.call('list_apis',{}),dataSources=await session.call('list_data_sources',{});
 const names=t=>[...t.matchAll(/^\s*-\s+([^\r\n(]+?)(?:\s+\(Kind:|\r?$)/gm)].map(m=>m[1].trim());
 const provider=new AuthoringMcpProvider(session.call,session.identity,names(toolText(dataSources)),names(toolText(apis)));
 const current=await provider.read(join(out,'authoring-source'));await save('authoring-snapshot',current.snapshot);
 const doctor=authoringDoctor({studioUrl,expected:session.identity,connected:session.identity,coauthoringEnabled:true,dotnetMajor:10,workspaceWritable:true,tools:session.catalog.tools.map(t=>t.name),controls,apis,dataSources,source:current});await save('doctor',doctor);if(!doctor.passed)throw Error('Doctor failed');
 const saved=await new PacDownloadProvider(resolve('.powercanvas/tooling/pac/pac.exe'),session.identity,local.dataverseUrl,local.appName,env).read(join(out,'pac-source'));await save('saved-snapshot',saved.snapshot);
 if(mode==='inspect'||mode==='inspect-harness'){
   let comparison=current;
   if(mode==='inspect-harness'){
     await save('harness-receipt',validateHarnessCandidate(expectedBase,current.files));
     const {makeSourceBundle}=await import('../dist/canvas/source-provider.js');
     comparison=makeSourceBundle(expectedBase,current.snapshot.identity,'authoringMcp',current.snapshot.dataSources,current.snapshot.connectors,{content:[{type:'text',text:'Verified protected source beneath isolated harness'}]});
   }
   await save('source-states',compareSourceStates(comparison,saved,expectedBase,approvals));
   for(const name of ['Screen','NumberInput','ComboBox','DatePicker'])await save('describe-'+name,await session.call('describe_control',{controlName:name}));
   for(const tool of ['get_appchecker_errors','get_accessibility_errors'])await save(tool,{source:current.snapshot,tool,result:await session.call(tool,{})});
   console.log(JSON.stringify({mode,sourceHash:current.snapshot.sourceHash,doctor:doctor.passed}));
 }else{
   const candidate=await readNativeSource(candidateDirectory);
   let receipt;
   if(mode==='apply'){
     await save('source-states',compareSourceStates(current,saved,expectedBase,approvals));
     receipt=validateHarnessCandidate(current.files,candidate);
   }else if(mode==='revise'){
     // Explicit new review after readback: protect every original file on both sides.
     const review=await read(join(candidateDirectory,'revision-review.json'));
     if(review.currentHash!==current.snapshot.sourceHash||review.candidateHash!==hashJson(candidate)||typeof review.reason!=='string'||review.reason.length<20)throw Error('Exact revision review required');
     validateHarnessCandidate(expectedBase,current.files);
     receipt=validateHarnessCandidate(expectedBase,candidate);
     const {makeSourceBundle}=await import('../dist/canvas/source-provider.js');
     const projected=makeSourceBundle(expectedBase,current.snapshot.identity,'authoringMcp',current.snapshot.dataSources,current.snapshot.connectors,{content:[{type:'text',text:'Verified protected draft underlying isolated harness'}]});
     await save('source-states',compareSourceStates(projected,saved,expectedBase,approvals));
   }else{
     receipt=await read(join(candidateDirectory,'harness-receipt.json'));
     // The restore directory is the exact original draft; receipt is from its reviewed additive candidate.
     verifyHarnessRestoration(current.files,candidate,receipt);
     const baseBundle={files:candidate,snapshot:{...current.snapshot,sourceHash:hashJson(candidate)}};
     // Recompute inventories rather than presenting draft-with-harness as the saved lifecycle state.
     const {makeSourceBundle}=await import('../dist/canvas/source-provider.js');
     const projected=makeSourceBundle(candidate,current.snapshot.identity,'authoringMcp',current.snapshot.dataSources,current.snapshot.connectors,{content:[{type:'text',text:'Verified restoration to exact protected draft'}]});
     await save('source-states',compareSourceStates(projected,saved,expectedBase,approvals));
     void baseBundle;
   }
   await save('harness-receipt',receipt);
   const before=await provider.read(join(out,'preflight-source'));
   if(before.snapshot.sourceHash!==current.snapshot.sourceHash)throw Error('Studio changed after planning');
   await appendFile('.powercanvas/canvas-authoring-journal.jsonl',JSON.stringify({at:new Date().toISOString(),mode,appId:binding.appId,beforeHash:current.snapshot.sourceHash,candidateHash:hashJson(candidate),status:'started',previewOnly:true})+'\n');
   writeAttempted=true;const result=await session.call('compile_canvas',{directoryPath:resolve(candidateDirectory)});await save('compile_canvas',result);
   const readback=await provider.read(join(out,'readback-source'));await save('readback-snapshot',readback.snapshot);
   const exact=readback.snapshot.sourceHash===hashJson(candidate);await save('readback-verdict',{exact,expectedHash:hashJson(candidate),actualHash:readback.snapshot.sourceHash});
   for(const tool of ['get_appchecker_errors','get_accessibility_errors'])await save(tool,{source:readback.snapshot,tool,result:await session.call(tool,{})});
   const accepted=compileSucceeded(result)&&exact;await save('result',{mode,accepted,exact,source:readback.snapshot,appSaves:0,appPublishes:0,appCreates:0,authoringAttempts:1});
   console.log(JSON.stringify({mode,accepted,exact,sourceHash:readback.snapshot.sourceHash,out}));
   if(!accepted)process.exitCode=1;
 }
}catch(error){await save('failure',{message:String(error),writeAttempted,outcome:writeAttempted?'UNKNOWN_UNTIL_READBACK':'NO_WRITE',autoRetry:false});throw error;}finally{session.close();}
