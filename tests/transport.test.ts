import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {DataverseHttp,ApiError} from '../src/dataverse/http.js';
import {classifyTransport,retryAfter,requestShape,transportHealth,cancellableDelay,type RequestAudit} from '../src/dataverse/transport.js';
import {assertAuthEvidenceSafe} from '../src/auth/safe-evidence.js';
import {completeReads} from '../src/model-driven/discovery.js';
import {DataverseDiscovery} from '../src/dataverse/discovery.js';
import {interpretResult,routeRequest} from '../src/agent/routing.js';
import {commandManifest} from '../src/agent/commands.js';
import {createProgram} from '../src/cli/program.js';
import {evaluateStability,writeTransportSupport,type DiscoveryCycle} from '../src/dataverse/transport-doctor.js';
import {certificationPlan} from '../src/solution/certification.js';
import {resolveSolution} from '../src/solution/resolve.js';
import {matchingState} from './planner-fixtures.js';
import {MODEL_KINDS} from '../src/model-driven/desired.js';
import {TransportAuditLog} from '../src/dataverse/transport-audit.js';

const base='https://synthetic.crm.dynamics.com/api/data/v9.2/';
const json=(v:unknown={value:[]})=>new Response(JSON.stringify(v));
const network=(code:string)=>new TypeError('fetch failed private@example.com',{cause:Object.assign(new Error('DO NOT LOG credential'),{code})});
function client(transport:typeof fetch){const waits:number[]=[];const http=new DataverseHttp(base,{token:async()=>'NEVER-LOG-TOKEN'},transport,{sleep:async ms=>{waits.push(ms);}});return {http,waits};}

describe('bounded discovery retries and attempt evidence',()=>{
 it.each([429,500,502,503,504])('recovers HTTP %i transparently with safe correlation and per-attempt evidence',async status=>{
  let calls=0;const id=randomUUID();const {http,waits}=client(async()=>++calls===1?new Response('{}',{status,headers:{'Retry-After':'2','x-ms-service-request-id':id,'set-cookie':'NEVER-LOG-COOKIE'}}):json());
  await http.request('systemforms?$select=formid,name&$filter=name eq %27Jane Doe%27');
  expect(calls).toBe(2);expect(waits).toEqual([2000]);const finished=http.audit.filter(e=>e.result!=='STARTED');
  expect(finished[0]).toMatchObject({status,attempt:1,result:'RETRY',retryDelayMs:2000,retryAfterSeconds:2,serviceRequestId:id,category:'FORMS'});
  expect(finished[1]).toMatchObject({result:'RECOVERED_TRANSIENT',attempt:2});expect(finished[1]!.requestId).toBe(finished[0]!.requestId);
  const encoded=JSON.stringify(http.audit);expect(encoded).not.toContain('Jane');expect(encoded).not.toContain('NEVER-LOG');expect(()=>assertAuthEvidenceSafe(http.audit)).not.toThrow();
 });
 it.each([400,401,403,404,412,418,501,505])('does not retry HTTP %i',async status=>{
  let calls=0;const {http,waits}=client(async()=>{calls++;return new Response('{}',{status});});
  await expect(http.request('appmodules')).rejects.toMatchObject({status,uncertain:false});expect(calls).toBe(1);expect(waits).toEqual([]);
  expect(transportHealth(http.audit,new Date().toISOString()).status).toBe(status===401?'BLOCKED_AUTH':status===403?'BLOCKED_PERMISSION':'UNSTABLE');
 });
 it.each(['ECONNRESET','UND_ERR_SOCKET','EPIPE','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ETIMEDOUT'])('retries known transient %s at most twice',async code=>{
  let calls=0;const {http,waits}=client(async()=>{calls++;throw network(code);});
  await expect(http.request('EntityDefinitions')).rejects.toMatchObject({uncertain:false,transportEvidence:{attempt:3,retryDecision:'ATTEMPTS_EXHAUSTED'}});
  expect(calls).toBe(3);expect(waits).toEqual([1000,2000]);expect(http.audit.filter(e=>e.result==='STARTED')).toHaveLength(3);
  expect(JSON.stringify(http.audit)).not.toContain('private@example.com');
 });
 it.each(['ENOTFOUND','ECONNREFUSED','ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED','UNKNOWN_SECRET_CODE'])('stops conservatively for %s',async code=>{
  let calls=0;const {http,waits}=client(async()=>{calls++;throw network(code);});
  await expect(http.request('sitemaps')).rejects.toBeInstanceOf(ApiError);expect(calls).toBe(1);expect(waits).toEqual([]);expect(JSON.stringify(http.audit)).not.toContain('SECRET_CODE');
 });
 it('records unknown exceptions without their messages, names, cause fields or raw payload',async()=>{
  const {http}=client(async()=>{throw {name:'SECRET-NAME',message:'access_token=BAD',cause:{certificate:'PRIVATE',headers:{Authorization:'Bearer BAD'}}};});
  await expect(http.request('savedqueries')).rejects.toMatchObject({transportEvidence:{failure:{kind:'unknown'},exceptionType:'UnrecognizedError',category:'VIEWS',failurePhase:'connectOrHeaders'}});
  expect(JSON.stringify(http.audit)).not.toMatch(/BAD|PRIVATE|SECRET-NAME|Bearer/);expect(()=>assertAuthEvidenceSafe(http.audit)).not.toThrow();
 });
 it('uses an HTTP-date Retry-After and refuses excessive or invalid delays without clamping',async()=>{
  expect(retryAfter('Wed, 23 Sep 2026 12:00:03 GMT',Date.parse('2026-09-23T12:00:00Z'))).toBe(3);expect(retryAfter('1.5')).toBeUndefined();
  for(const hint of ['61','secret-value','9999999999999999999999999999']){let calls=0;const {http,waits}=client(async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':hint}});});await expect(http.request('roles')).rejects.toBeInstanceOf(ApiError);expect(calls).toBe(1);expect(waits).toEqual([]);expect(JSON.stringify(http.audit)).not.toContain('secret-value');}
 });
 it('enforces total delay budget instead of retrying sooner than Retry-After',async()=>{
  let calls=0;const {http,waits}=client(async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'40'}});});
  await expect(http.request('roles')).rejects.toMatchObject({transportEvidence:{retryDecision:'DELAY_BUDGET_EXCEEDED'}});expect(waits).toEqual([40000]);expect(calls).toBe(2);
 });
 it.each([['POST','EntityDefinitions'],['PATCH',"EntityDefinitions(LogicalName='pfx_table')/Attributes"],['POST','roles(00000000-0000-0000-0000-000000000000)/Microsoft.Dynamics.CRM.AddPrivilegesRole'],['POST','appmodules'],['PUT','sitemaps'],['DELETE','roles']])('never retries uncertain %s %s',async(method,path)=>{
  let calls=0;const {http,waits}=client(async()=>{calls++;throw network('ECONNRESET');});await expect(http.request(path,method,{})).rejects.toMatchObject({uncertain:true,code:'PF-DV-001'});expect(calls).toBe(1);expect(waits).toEqual([]);
 });
 it.each([429,500,503])('does not retry write HTTP %i',async status=>{
  let calls=0;const {http,waits}=client(async()=>{calls++;return new Response('{}',{status,headers:{'retry-after':'0'}});});await expect(http.request('appmodules','POST',{})).rejects.toMatchObject({status,uncertain:status>=500});expect(calls).toBe(1);expect(waits).toEqual([]);
 });
 it('does not extend resilience to arbitrary business GETs or unknown bound functions',async()=>{
  for(const path of ['contacts','EntityDefinitions/Microsoft.Dynamics.CRM.UnverifiedFunction()']){let calls=0;const {http}=client(async()=>{calls++;return new Response('{}',{status:503});});await expect(http.request(path)).rejects.toBeInstanceOf(ApiError);expect(calls).toBe(1);}
 });
 it('locks read-only command clients before credential acquisition or dispatch',async()=>{
  const token=vi.fn(async()=>'test'),fetcher=vi.fn(async()=>json());const http=new DataverseHttp(base,{token},fetcher,{readOnly:true});
  for(const method of ['POST','PUT','PATCH','DELETE'])await expect(http.request('EntityDefinitions',method,{})).rejects.toMatchObject({code:'PF-SAFETY-006'});
  expect(token).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
 });
 it('distinguishes body transport failure from malformed JSON',async()=>{
  let calls=0;const {http}=client(async()=>{calls++;const r=json();r.json=async()=>{throw network('UND_ERR_BODY_TIMEOUT');};return calls===1?r:json();});await http.request('solutions');
  expect(http.audit.find(e=>e.result==='RETRY')).toMatchObject({failurePhase:'body',status:200,failure:{kind:'timeout',phase:'body'}});
  const invalid=client(async()=>new Response('not json'));await expect(invalid.http.request('solutions')).rejects.toMatchObject({transportEvidence:{failure:{kind:'invalidResponse'},retryDecision:'NONRETRYABLE'}});
 });
 it('does not retry credentials failures',async()=>{
  const transport=vi.fn(async()=>json());const http=new DataverseHttp(base,{token:async()=>{throw Error('private auth detail');}},transport);await expect(http.request('WhoAmI')).rejects.toMatchObject({transportEvidence:{failurePhase:'credentials',failure:{kind:'authentication'}}});expect(transport).not.toHaveBeenCalled();
 });
 it('keeps pagination attempt budgets separate and continuations private',async()=>{
  let calls=0;const {http}=client(async()=>{calls++;if(calls===1)return json({value:[{id:1}],'@odata.nextLink':base+'roles?$skiptoken=PRIVATE-CONTINUATION'});if(calls===2)throw network('ECONNRESET');return json({value:[{id:2}]});});
  expect(await http.all('roles')).toEqual([{id:1},{id:2}]);const final=http.audit.filter(e=>e.result==='SUCCESS'||e.result==='RECOVERED_TRANSIENT');expect(final.map(e=>[e.pageIndex,e.continuation,e.attempt])).toEqual([[1,false,1],[2,true,2]]);expect(JSON.stringify(http.audit)).not.toContain('PRIVATE-CONTINUATION');
 });
 it('retains useful query structure without literal values',()=>{
  const shape=requestShape(new URL(base+"EntityDefinitions(LogicalName='Sensitive')/Attributes?$select=LogicalName,MetadataId&$filter=name eq 'O''Brien' and count gt 12&$expand=OptionSet($select=Options)"));
  expect(shape).toMatchObject({category:'COLUMN_METADATA',pathTemplate:'/api/data/v9.2/EntityDefinitions({value})/Attributes',query:{select:['LogicalName','MetadataId'],filterFields:['name','count'],filterOperators:['eq','gt'],expand:['OptionSet']}});expect(JSON.stringify(shape)).not.toMatch(/Sensitive|Brien/);
 });
 it('recognizes timeout and abort without inventing a timeout phase',()=>{
  expect(classifyTransport(new DOMException('private','TimeoutError'),'connectOrHeaders')).toEqual({kind:'timeout',phase:'unknown'});expect(classifyTransport(new DOMException('private','AbortError'),'body')).toEqual({kind:'aborted'});
 });
 it('cancels backoff without sending the next request',async()=>{
  const controller=new AbortController();let calls=0;
  const http=new DataverseHttp(base,{token:async()=>'test'},async()=>{calls++;return new Response('{}',{status:503});},{signal:controller.signal,sleep:async(ms,signal)=>{controller.abort();await cancellableDelay(ms,signal);}});
  await expect(http.request('sitemaps')).rejects.toMatchObject({transportEvidence:{failurePhase:'retryWait',failure:{kind:'aborted'}}});expect(calls).toBe(1);
  expect(transportHealth(http.audit,http.audit[0]!.startedAt)).toMatchObject({attemptsTotal:1,retries:0,retrySchedules:1,failedRequests:1});
 });
 it('summarizes clean, recovered and failed logical requests separately',async()=>{
  let calls=0;const {http}=client(async()=>++calls===2?new Response('{}',{status:503}):json());await http.request('WhoAmI');await http.request('systemforms');
  expect(transportHealth(http.audit,http.audit[0]!.startedAt)).toMatchObject({status:'DEGRADED_RECOVERED',requestsTotal:2,attemptsTotal:3,firstAttemptSuccesses:1,recoveredTransientFailures:1,failedRequests:0,retries:1,server5xxCount:1,totalRetryDelayMs:1000});
 });
});

describe('complete discovery and certification transport gate',()=>{
 it('preserves all concurrent attempt records in file order with a byte-backed integrity hash',async()=>{
  const root=await mkdtemp(join(tmpdir(),'powercanvas-transport-'));
  try{const path=join(root,'requests.ndjson'),log=await TransportAuditLog.create(path);
   const entries=Array.from({length:80},(_,index):RequestAudit=>({requestId:randomUUID(),method:'GET',category:'SITEMAPS',pathTemplate:'/api/data/v9.2/sitemaps',query:requestShape(new URL(base+'sitemaps')).query,requestShapeHash:'0'.repeat(64),pageIndex:index+1,continuation:false,attempt:1,startedAt:new Date().toISOString(),result:'STARTED'}));
   await Promise.all(entries.map(entry=>log.record(entry)));const bytes=await readFile(path);expect(bytes.toString().trim().split('\n').map(line=>JSON.parse(line))).toEqual(entries);expect(await log.sha256()).toBe(createHash('sha256').update(bytes).digest('hex'));expect(log.entries).toEqual(entries);
  }finally{expect(resolve(dirname(root))).toBe(resolve(tmpdir()));expect(basename(root).startsWith('powercanvas-transport-')).toBe(true);await rm(root,{recursive:true,force:true});}
 });
 it('builds support evidence from a strict file allowlist and rejects secret-shaped diagnostics',async()=>{
  const root=await mkdtemp(join(tmpdir(),'powercanvas-transport-'));
  try{const source=join(root,'source');await mkdir(source);for(const name of ['transport-summary.json','failed-requests.json','phase-timeline.json','configuration.json'])await writeFile(join(source,name),'{}');await writeFile(join(source,'reproduction.md'),'Safe diagnostics');await writeFile(join(source,'ownership.json'),'PRIVATE');
   await writeTransportSupport(source,join(root,'support'));const names=await readdir(join(root,'support'));expect(names).toHaveLength(6);expect(names).not.toContain('ownership.json');expect(JSON.parse(await readFile(join(root,'support/sha256-manifest.json'),'utf8'))).toHaveLength(5);
   await writeFile(join(source,'configuration.json'),JSON.stringify({access_token:'private'}));await expect(writeTransportSupport(source,join(root,'rejected'))).rejects.toThrow('Sensitive');
  }finally{expect(resolve(dirname(root))).toBe(resolve(tmpdir()));expect(basename(root).startsWith('powercanvas-transport-')).toBe(true);await rm(root,{recursive:true,force:true});}
 });
 function fixture(){
  const raw=JSON.parse(readFileSync('tests/fixtures/certification-v21i-source.json','utf8'));const {project}=resolveSolution(raw);const {observation,ownership}=matchingState(project);
  observation.resources=observation.resources.filter(r=>['publisher','solution'].includes(r.kind));ownership.resources=ownership.resources.filter(r=>observation.resources.some(o=>o.resourceId===r.resourceId));
  observation.coverage=[...new Set([...observation.coverage.map(c=>c.kind),'choice','key',...MODEL_KINDS])].map(kind=>({kind,status:'complete' as const}));
  const result=certificationPlan(raw,observation,ownership);const cycle:DiscoveryCycle={complete:true,observation,ownership,plan:result.native,health:transportHealth([],new Date().toISOString())};return {project,cycle,manifest:result.manifest};
 }
 it('drains concurrent read groups before surfacing the first error',async()=>{
  let settle!:(v:number)=>void;const delayed=new Promise<number>(resolve=>{settle=resolve;});let completed=false;
  const result=completeReads([Promise.reject(Error('first')),delayed]).catch(e=>{completed=true;throw e;});await Promise.resolve();expect(completed).toBe(false);settle(1);await expect(result).rejects.toThrow('first');
 });
 it('cannot return a valid observation after a required metadata read failed',async()=>{
  const x=fixture();const {http}=client(async()=>new Response('{}',{status:403}));await expect(new DataverseDiscovery(http).observe(x.project,x.cycle.observation!.target,x.cycle.ownership)).rejects.toBeInstanceOf(ApiError);
 });
 it('requires three complete semantically identical cycles, ignoring freshness identities',()=>{
  const x=fixture();const cycles=Array.from({length:3},()=>structuredClone(x.cycle));cycles[1]!.observation!.observedAt=new Date().toISOString();cycles[1]!.plan!.planId=randomUUID();cycles[1]!.plan!.createdAt=new Date().toISOString();
  expect(evaluateStability(cycles,x.manifest)).toMatchObject({status:'HEALTHY',stabilityGatePassed:true,mutationAuthorized:false,providerCertification:false});
  expect(evaluateStability(cycles.slice(0,2),x.manifest).stabilityGatePassed).toBe(false);
 });
 it.each(['partial','drift','plan','manifest','blocker','ownership'])('rejects incompatible evidence: %s',kind=>{
  const x=fixture();const cycles=Array.from({length:3},()=>structuredClone(x.cycle));const c=cycles[1]!;
  if(kind==='partial')c.complete=false;if(kind==='drift')c.observation!.resources[0]!.remoteId=randomUUID();if(kind==='plan')c.plan!.operations=[];if(kind==='manifest')c.plan!.certification!.manifest.contentHash='0'.repeat(64);if(kind==='blocker')c.plan!.blockers.push({code:'PF-PLAN-005',message:'Collision',classification:'manualPrerequisite'});if(kind==='ownership')c.ownership!.revision++;
  expect(evaluateStability(cycles,x.manifest)).toMatchObject({status:'UNSTABLE',stabilityGatePassed:false,mutationAuthorized:false});
 });
 it('marks recovered cycles degraded and any unrecovered failure unstable',()=>{
  const x=fixture();const cycles=Array.from({length:3},()=>structuredClone(x.cycle));cycles[1]!.health.status='DEGRADED_RECOVERED';cycles[1]!.health.recoveredTransientFailures=1;expect(evaluateStability(cycles,x.manifest).status).toBe('DEGRADED_RECOVERED');cycles[2]!.health.status='UNSTABLE';expect(evaluateStability(cycles,x.manifest).status).toBe('UNSTABLE');
 });
 it('routes transport failures to diagnosis without authentication repair or apply retry',()=>{
  expect(interpretResult({verdict:'V2.1 LIVE PROVIDER CERTIFICATION BLOCKED',blocker:{classification:'TRANSPORT_FAILURE'}})).toMatchObject({next:'dataverse-transport-diagnosis',autoRetry:false,mutationAuthorized:false});
  expect(interpretResult({status:'CERTIFICATION_PLAN_STILL_BLOCKED',error:{transport:{retryClassification:'SOCKET_FAILURE'}}}).next).toBe('dataverse-transport-diagnosis');
  expect(routeRequest('Diagnose Dataverse discovery transport failure',{powerCanvasProject:true}).commands[0]?.command).toBe('dataverse transport-doctor');
  expect(commandManifest(createProgram()).find(c=>c.command==='dataverse transport-doctor')).toMatchObject({risk:'LOCAL_WRITE',network:true,mutatesTenant:false});
  expect(interpretResult({status:'BLOCKED_AUTH',verdict:'DATAVERSE READ TRANSPORT UNSTABLE — CERTIFICATION REMAINS BLOCKED'})).toMatchObject({status:'BLOCKED',next:'credential-acquisition-diagnosis',autoRetry:false,mutationAuthorized:false});
 });
 it('counts interrupted attempts as unstable',()=>{const entry:RequestAudit={requestId:randomUUID(),method:'GET',category:'MODEL_APPS',pathTemplate:'/api/data/v9.2/appmodules',query:requestShape(new URL(base+'appmodules')).query,requestShapeHash:'0'.repeat(64),pageIndex:1,continuation:false,attempt:1,startedAt:new Date().toISOString(),result:'STARTED'};expect(transportHealth([entry],entry.startedAt)).toMatchObject({status:'UNSTABLE',incompleteRequests:1});});
});
