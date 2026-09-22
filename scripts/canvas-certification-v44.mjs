import {loadLocalAuthoringConfig} from './local-authoring-config.mjs';
const local=await loadLocalAuthoringConfig();
// A source-bound reversible certification workflow using the existing official compiler.
// Each invocation is a new epoch. Install remains incomplete until runtime evidence and cleanup.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import process from 'node:process';
import {connectAuthoring} from '../dist/canvas/authoring-client.js';
import {AuthoringMcpProvider,PacDownloadProvider,readNativeSource,authoringDoctor,toolText,makeSourceBundle} from '../dist/canvas/source-provider.js';
import {CertificationTransaction} from '../dist/canvas/certification-transaction.js';
import {compareSourceStates} from '../dist/canvas/certification-harness.js';
import {ownHarness} from '../dist/canvas/authoring-lifecycle.js';
const [mode,candidateDir,out,observationFile,ownershipFile]=process.argv.slice(2);
if(!['install','cleanup'].includes(mode)||!candidateDir||!out||!observationFile||mode==='cleanup'&&!ownershipFile)throw Error('Usage: install|cleanup candidate-directory fresh-output observation-json [ownership-json]');
await mkdir(out,{recursive:true});
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const save=(n,v)=>writeFile(join(out,n+'.json'),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const binding=local.binding,observed=await read(observationFile);
if(observed.appId!==binding.appId||observed.environmentId!==binding.environmentId||!observed.autoSaveDisabled||!observed.coauthoringEnabled||Date.now()-Date.parse(observed.observedAt)>30*60_000||Date.parse(observed.observedAt)>Date.now()||!Number.isFinite(Date.parse(observed.observedAt))||createHash('sha256').update(await readFile(observed.artifact)).digest('hex')!==observed.sha256)throw Error('Fresh bound settings observation required');
const base=await readNativeSource('output/canvas/native/v42-focus-review');
const approvals=(await read('output/canvas/native/v42-focus-review/approved-migration-plan.json')).approvedBehaviorChanges;
const studioUrl=`https://make.powerapps.com/e/${binding.environmentId}/canvas/?action=edit&app-id=${binding.appId}`;
const env={...process.env,DOTNET_ROOT:resolve('.powercanvas/tooling/dotnet')},diagnostics=[];
let session,transaction;
try{
 session=await connectAuthoring({command:join(env.DOTNET_ROOT,'dotnet.exe'),args:['dnx','Microsoft.PowerApps.CanvasAuthoring.McpServer@1.1.5','--yes'],env,studioUrl,expectedAppId:binding.appId,onDiagnostic:r=>diagnostics.push(r)});
 const controls=await session.call('list_controls',{}),apis=await session.call('list_apis',{}),dataSources=await session.call('list_data_sources',{});
 const doctorInput={studioUrl,expected:session.identity,connected:session.identity,coauthoringEnabled:true,dotnetMajor:10,workspaceWritable:true,tools:session.catalog.tools.map(t=>t.name),controls,apis,dataSources};
 const prerequisites=authoringDoctor(doctorInput);if(prerequisites.failures.some(f=>f!=='Live coauthoring not proven by fresh source'))throw Error('Doctor prerequisites failed');
 const names=t=>[...t.matchAll(/^\s*-\s+([^\r\n(]+?)(?:\s+\(Kind:|\r?$)/gm)].map(m=>m[1].trim());
 const provider=new AuthoringMcpProvider(session.call,session.identity,names(toolText(dataSources)),names(toolText(apis)));
 transaction=new CertificationTransaction(provider,session.call,base);transaction.doctorPassed();
 const current=await transaction.acquire(join(out,'source'));await save('source-snapshot',current.snapshot);
 const doctor=authoringDoctor({...doctorInput,source:current});await save('doctor',doctor);if(!doctor.passed)throw Error('Authoring doctor failed');
 if(mode==='cleanup')transaction.adoptRecovery(await read(ownershipFile));
 // Prove saved/draft lineage independently before any compile.
 const saved=await new PacDownloadProvider(resolve('.powercanvas/tooling/pac/pac.exe'),session.identity,local.dataverseUrl,local.appName,env).read(join(out,'pac-source'));
 const projected=mode==='cleanup'?makeSourceBundle(transaction.recoveryPlan(current).candidate,current.snapshot.identity,'authoringMcp',current.snapshot.dataSources,current.snapshot.connectors,{content:[{type:'text',text:'Exact owned-harness subtraction'}]},current.snapshot.acquiredAt):current;
 await save('source-agreement',compareSourceStates(projected,saved,base,approvals));
 const checked=async(source,label)=>{
  const app=await session.call('get_appchecker_errors',{}),accessibility=await session.call('get_accessibility_errors',{});
  await save(label+'-checkers',{source:source.snapshot,app,accessibility});
  const a=toolText(accessibility);
  const clean=!app.isError&&/No app checker issues found/.test(toolText(app));
  const accessible=!accessibility.isError&&(/No accessibility issues found/.test(a)||/Accessibility issues found: 1\s/.test(a)&&/\[Suggestion\] Screen1:/.test(a)&&/Check: ReadableScreenNameNeeded/.test(a)&&!a.includes('[Error]'));
  transaction.lifecycle.checked(clean,accessible);
 };
 if(mode==='install'){
  await checked(current,'before');
  const ownership=ownHarness(base,await readNativeSource(candidateDir),binding,'V4.4 bounded certification batch');await save('ownership',ownership);
  await save('planned-effects',{screen:ownership.screen,expectedControls:ownership.controls,unexpectedControls:0,save:false,publish:false});
 }else await save('recovery-plan',transaction.recoveryPlan(current));
 const result=mode==='install'?await transaction.install(candidateDir,current,join(out,'readback-source'),'V4.4 bounded certification batch'):await transaction.cleanup(candidateDir,current,join(out,'readback-source'));
 await save('readback-snapshot',result.readback.snapshot);await checked(result.readback,'after');
 if(mode==='cleanup')transaction.lifecycle.verifyCleanup();
 await save('result',{mode,state:transaction.lifecycle.state,compileAttempts:result.compileAttempts,cleanupVerified:mode==='cleanup',batchComplete:false,reason:mode==='install'?'Runtime and verified cleanup remain required':'Recovery verified; link to original batch runtime evidence before marking batch complete',appsSaved:0,appsPublished:0});
}catch(error){await save('failure',{message:String(error),state:transaction?.lifecycle.state??(mode==='cleanup'?'RECOVERY_REQUIRED':'BLOCKED'),retry:false,appsSaved:0,appsPublished:0});throw error;}
finally{await save('diagnostics',diagnostics);if(transaction)await save('lifecycle',transaction.lifecycle.events);session?.close();}
