import process from 'node:process';
import {spawn} from 'node:child_process';
import {createServer,connect} from 'node:net';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {certify,certifyProxy} from '../tests/sharepoint-simulation/certify.mjs';
import {isolatedFetch} from '../tests/sharepoint-simulation/service.mjs';

const unit=process.argv.includes('--unit'),refresh=process.argv.includes('--refresh-mocks');
const fixtureRoot=resolve('tests/sharepoint-simulation');
const write=async(path,data)=>writeFile(path,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const port=()=>new Promise(resolvePort=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolvePort(p));});});
async function generateMocks(result){
 for(const name of ['team-request-tracker','document-approval','contract-library']){
  const dir=join(fixtureRoot,'scenarios',name);await mkdir(dir,{recursive:true});
  const byUrl=new Map(result.bundles[name].contractTrace.filter(t=>t.method==='GET'&&t.status===200).map(t=>[t.url,t]));
  for(const [file,graph]of [['graph-mocks.json',true],['sharepoint-rest-mocks.json',false]]){
   const mocks=[...byUrl.values()].filter(t=>t.url.startsWith('https://graph.microsoft.com')===graph).map(t=>({request:{url:t.url,method:'GET'},response:{statusCode:200,headers:[{name:'content-type',value:'application/json'}],body:t.response}}));
   await writeFile(join(dir,file),JSON.stringify({$schema:'https://raw.githubusercontent.com/dotnet/dev-proxy/main/schemas/v3.3.1/mockresponseplugin.mocksfile.schema.json',mocks},null,2)+'\n');
  }
  const config={$schema:'https://raw.githubusercontent.com/dotnet/dev-proxy/main/schemas/v3.3.1/rc.schema.json',asSystemProxy:false,installCert:false,ipAddress:'127.0.0.1',newVersionNotification:'none',logLevel:'warning',urlsToWatch:['*'],plugins:[{name:'GraphMockResponsePlugin',enabled:true,pluginPath:'~appFolder/plugins/DevProxy.Plugins.dll',configSection:'graphMocks',urlsToWatch:['https://graph.microsoft.com/*']},{name:'MockResponsePlugin',enabled:true,pluginPath:'~appFolder/plugins/DevProxy.Plugins.dll',configSection:'restMocks',urlsToWatch:['https://powercanvas-simulation.sharepoint.com/*']}],graphMocks:{mocksFile:'graph-mocks.json',blockUnmockedRequests:true},restMocks:{mocksFile:'sharepoint-rest-mocks.json',blockUnmockedRequests:true}};
  await writeFile(join(dir,'devproxyrc.json'),JSON.stringify(config,null,2)+'\n');
 }
}
async function runProxy(name){
 const configPath=join(fixtureRoot,'scenarios',name,'devproxyrc.json');const config=JSON.parse(await readFile(configPath,'utf8'));
 if(config.asSystemProxy!==false||config.installCert!==false||config.graphMocks.blockUnmockedRequests!==true||config.restMocks.blockUnmockedRequests!==true)throw Error('Unsafe Dev Proxy configuration');
 const proxyPort=await port(),apiPort=await port();const exe=process.env.POWERCANVAS_DEVPROXY_PATH??resolve('.powercanvas/tooling/devproxy-v3.3.1/devproxy.exe');
 const child=spawn(exe,['--config-file',configPath,'--port',String(proxyPort),'--api-port',String(apiPort),'--no-first-run','--no-watch','--no-color'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,CI:'true'}});
 let failure;child.on('error',e=>{failure=e.message;});let diagnostics='';child.stdout.on('data',v=>{diagnostics+=v;});child.stderr.on('data',v=>{diagnostics+=v;});
 try{
  let ready=false;for(let i=0;i<300;i++){
   if(failure||child.exitCode!==null)throw Error('Dev Proxy startup failed: '+(failure??diagnostics.replace(/token[^\r\n]*/gi,'token [redacted]').slice(-2000)));
   ready=await new Promise(r=>{const s=connect(proxyPort,'127.0.0.1');s.on('connect',()=>{s.destroy();r(true);});s.on('error',()=>r(false));});if(ready)break;await delay(100);
  }
  if(!ready)throw Error('Dev Proxy did not become ready; no provider requests sent. '+diagnostics.replace(/token[^\r\n]*/gi,'token [redacted]').slice(-1500));
  const requests=[],client=isolatedFetch(proxyPort);const proof=await certifyProxy(async(input,init)=>{const started=Date.now(),response=await client(input,init);requests.push({engine:'DevProxy',method:init?.method??'GET',url:String(input),status:response.status,elapsedMs:Date.now()-started});return response;},name);return {...proof,requests,engine:'Microsoft Dev Proxy 3.3.1',systemProxy:false,configSha256:sha(await readFile(configPath))};
 }finally{if(child.exitCode===null){const closed=new Promise(r=>child.once('close',r));child.kill();await closed;}}
}

const result=await certify();
if(refresh)await generateMocks(result);
if(unit){console.log(JSON.stringify({cases:result.cases,mode:result.mode}));}
else{
 const out=resolve('output/sharepoint-v11s/run-'+new Date().toISOString().replaceAll(':','-'));await mkdir(out,{recursive:true});
 const proxy=[];let proxyFailure;
 try{for(const name of ['team-request-tracker','document-approval','contract-library'])proxy.push(await runProxy(name));}catch(e){proxyFailure=e.message;}
 const contract={mode:result.mode,engine:'Stateful loopback HTTP + Microsoft Dev Proxy',status:proxyFailure?'INCOMPLETE':'SIMULATED_CONTRACT_CERTIFIED',cases:result.cases,devProxy:proxy,devProxyFailure:proxyFailure??null,liveRead:'EXTERNAL_ACCOUNT_BLOCKED',liveWrite:'EXTERNAL_ACCOUNT_BLOCKED',realSharePointCalls:0,realSharePointWrites:0,realBusinessData:0};
 await write(join(out,'provider-contract.json'),contract);await write(join(out,'endpoint-inventory.json'),[...result.endpoints,...proxy.flatMap(p=>p.requests)]);
 await write(join(out,'read-cycles.json'),Object.fromEntries(['team-request-tracker','document-approval','contract-library'].map(n=>[n,result.bundles[n].cycles])));
 await write(join(out,'edge-profile.json'),result.bundles.edge);
 await write(join(out,'site-correlation.json'),{status:'SIMULATED_MATCH',profiles:proxy});
 await write(join(out,'failure-matrix.json'),result.cases.filter(c=>c.attempts||c.outcome||/blocked|failure|wrong|missing|drop|reject|postcondition/.test(c.name)));
 await write(join(out,'simulated-execution.json'),result.bundles['execution-success']);await write(join(out,'simulated-reconciliation.json'),{unknown:result.bundles['execution-accepted-drop'],unverified:result.bundles['execution-postcondition'],rejected:result.bundles['execution-reject-400']});
 for(const name of ['simulated-final-plan','canvas-binding','flow-binding','library-flow-contract'])await write(join(out,name+'.json'),result.bundles[name]);
 const hashes=[];for(const file of await readdir(out)){const bytes=await readFile(join(out,file));hashes.push({file,bytes:bytes.length,sha256:sha(bytes)});}await write(join(out,'integrity-audit.json'),{sealed:true,files:hashes});
 if(process.argv.includes('--record-evidence')&&!proxyFailure){
  const files=[];const visit=async(dir)=>{for(const e of await readdir(dir,{withFileTypes:true})){const path=join(dir,e.name);if(e.isDirectory())await visit(path);else if(e.name!=='certification.json')files.push(path);}};
  await visit('src/sharepoint');await visit('tests/sharepoint-simulation');files.push('scripts/sharepoint-simulate.mjs');
  const sourceHashes=[];for(const file of files.sort())sourceHashes.push({file:file.replaceAll('\\','/'),sha256:sha(await readFile(file))});
  const capabilities=['site.bind','contentTypeBase.bind','list.discover','library.discover','column.discover','contentType.discover','folder.discover','view.discover','permission.discover','permission.read'].map(id=>({id:'sharepoint.'+id,dimensions:['SIMULATED_READ_VERIFIED'],contract:'Fictional scoped Graph/REST metadata; no live access or provisioning proof'}));
  for(const id of ['list.create','column.create','choice.create'])capabilities.push({id:'sharepoint.'+id,dimensions:['SIMULATED_WRITE_VERIFIED','SIMULATED_NOOP_VERIFIED'],contract:'One generic list and text/choice/date columns only; stateful HTTP create, provider readback, fresh discovery and NO_OP'});
  for(const id of ['canvasBinding.resolve','flowBinding.resolve'])capabilities.push({id:'sharepoint.'+id,dimensions:['SIMULATED_BINDING_RESOLUTION_VERIFIED'],contract:'Local symbolic contract resolution only; no native registration, deployment or runtime'});
  await writeFile(join(fixtureRoot,'certification.json'),JSON.stringify({mode:result.mode,status:contract.status,liveRead:false,liveWrite:false,engine:'Microsoft Dev Proxy 3.3.1 + stateful loopback HTTP',cases:result.cases.map(c=>c.name),sourceHashes,capabilities,evidenceArchive:relative(process.cwd(),out).replaceAll('\\','/'),integrityAuditSha256:sha(await readFile(join(out,'integrity-audit.json')))},null,2)+'\n');
 }
 console.log(JSON.stringify({out,status:contract.status,contracts:result.cases.length,devProxyProfiles:proxy.length,devProxyFailure:proxyFailure??null,realSharePointCalls:0}));if(proxyFailure)process.exitCode=1;
}
