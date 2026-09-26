import {createHash} from 'node:crypto';
import {getDefaultResultOrder} from 'node:dns';
import {getDefaultAutoSelectFamily} from 'node:net';
import {platform,release} from 'node:os';
import type {CredentialAuditOptions} from '../auth/credential-audit.js';

export type TransportFailure =
 | {kind:'http';status:number;serviceErrorCode?:string}
 | {kind:'dns'|'connect'|'tls'|'socket';code:string}
 | {kind:'timeout';phase:'connect'|'headers'|'body'|'unknown';code?:string}
 | {kind:'aborted'}
 | {kind:'authentication'}
 | {kind:'invalidResponse'}
 | {kind:'unknown';safeMessage:string};
export type FailurePhase='credentials'|'connectOrHeaders'|'body'|'retryWait';
export interface RequestAudit {
 requestId:string;method:string;category:string;pathTemplate:string;query:ReturnType<typeof requestShape>['query'];requestShapeHash:string;
 pageIndex:number;continuation:boolean;attempt:number;startedAt:string;finishedAt?:string;elapsedMs?:number;slow?:boolean;dispatched?:boolean;
 result:'STARTED'|'SUCCESS'|'RECOVERED_TRANSIENT'|'RETRY'|'FAILED';
 status?:number;failure?:TransportFailure;failurePhase?:FailurePhase;exceptionType?:string;
 retryClassification?:string;retryDecision?:string;retryDelayMs?:number;retryAfterSeconds?:number;
 serviceRequestId?:string;correlationId?:string;
}
export interface TransportOptions {
 credentials?:CredentialAuditOptions;
 readOnly?:boolean;
 audit?:(entry:RequestAudit)=>void|Promise<void>;
 signal?:AbortSignal;
 /** Injectable only for deterministic tests; production waits remain cancellable. */
 sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;
}
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const identifier=(v:string)=>/^[A-Za-z_$][A-Za-z0-9_$]{0,99}$/.test(v);
const fields=(v:string|null)=>(v??'').split(',').map(x=>x.trim()).filter(identifier).slice(0,100);
const phases:Record<string,string>={Instances:'TARGET',WhoAmI:'WHOAMI',organizations:'TARGET',privileges:'PERMISSIONS',systemusers:'PERMISSIONS',publishers:'PUBLISHER',solutions:'SOLUTION',solutioncomponents:'SOLUTION_COMPONENTS',EntityDefinitions:'TABLE_METADATA',GlobalOptionSetDefinitions:'CHOICE_METADATA',RelationshipDefinitions:'RELATIONSHIPS',systemforms:'FORMS',savedqueries:'VIEWS',appmodules:'MODEL_APPS',appmodulecomponents:'MODEL_APPS',appmodulerolescollection:'APP_ROLE_ACCESS',appactions:'COMMANDS',webresourceset:'WEB_RESOURCES',sitemaps:'SITEMAPS',roles:'SECURITY_ROLES',businessunits:'SECURITY_ROLES',RetrieveRolePrivilegesRole:'SECURITY_ROLES'};
/** Values are never retained, including string literals, GUIDs and opaque continuation data. */
export function requestShape(url:URL){
 const relative=url.pathname.replace(/^\/api\/(?:data|discovery)\/v[0-9.]+\//,'');
 const root=relative.split(/[(/]/)[0]??'';
 let category=phases[root]??'OTHER';
 if(root==='EntityDefinitions'&&relative.includes('/Attributes'))category='COLUMN_METADATA';
 if(root==='EntityDefinitions'&&relative.includes('/Keys'))category='KEYS';
 if(relative.includes('appmoduleroles_association'))category='APP_ROLE_ACCESS';
 const withoutValues=relative.replace(/\([^)]*\)/g,'({value})');
 const segments=withoutValues.split('/');
 // Only known metadata/navigation operations qualify, not arbitrary bound functions or business GETs.
 const safeSuffix=/^(?:Attributes|Keys|appmoduleroles_association|appmodulecomponents|Microsoft\.Dynamics\.CRM\.(?:RetrieveUnpublishedMultiple|RetrieveUserPrivileges|[A-Za-z]+(?:AttributeMetadata|RelationshipMetadata|OptionSetMetadata)))(?:\(\{value\}\))?$/;
 const discovery=!!phases[root]&&segments.slice(1).every(s=>safeSuffix.test(s));
 const prefix=url.pathname.slice(0,url.pathname.length-relative.length);
 const pathTemplate=phases[root]?prefix+segments.map((s,i)=>i===0?root+(s.includes('(')?'({value})':''):safeSuffix.test(s)?s:'{segment}').join('/'):'/{unclassified-resource}';
 const filter=url.searchParams.get('$filter')??'';
 const stripped=filter.replace(/'(?:[^']|'')*'/g,'{value}');
 const comparisons=[...stripped.matchAll(/\b([A-Za-z_][A-Za-z0-9_/.]{0,99})\s+(eq|ne|gt|ge|lt|le|in)\b/g)];
 const expand=(url.searchParams.get('$expand')??'').split(',').map(s=>s.split('(')[0]!.trim()).filter(identifier).slice(0,100);
 const query={select:fields(url.searchParams.get('$select')),expand,filterFields:[...new Set(comparisons.map(m=>m[1]!))],filterOperators:[...new Set(comparisons.map(m=>m[2]!))],hasFilter:url.searchParams.has('$filter'),continuation:url.searchParams.has('$skiptoken'),...(url.searchParams.has('$skiptoken')?{continuationHash:hash(url.searchParams.get('$skiptoken')!)}:{}),hasTop:url.searchParams.has('$top'),hasOtherParameters:[...url.searchParams.keys()].some(k=>!['$select','$expand','$filter','$skiptoken','$top','$orderby','$count'].includes(k))};
 return {category,pathTemplate,query,discovery,requestShapeHash:hash(url.pathname+url.search)};
}
const names=new Set(['Error','PowerCanvasError','TypeError','SyntaxError','AggregateError','AbortError','TimeoutError','ConnectTimeoutError','HeadersTimeoutError','BodyTimeoutError','SocketError']);
export function exceptionType(error:unknown){const name=error&&typeof error==='object'&&'name'in error?error.name:undefined;return typeof name==='string'&&names.has(name)?name:'UnrecognizedError';}
const codes=new Set(['EAI_AGAIN','ENOTFOUND','ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','ECONNRESET','EPIPE','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','UND_ERR_ABORT','UND_ERR_ABORTED','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID']);
export function classifyTransport(error:unknown,phase:FailurePhase,signal?:AbortSignal):TransportFailure{
 if(signal?.aborted)return {kind:'aborted'};
 let current=error;
 for(let depth=0;depth<5&&current&&typeof current==='object';depth++){
  const e=current as {code?:unknown;name?:unknown;cause?:unknown};
  const code=typeof e.code==='string'&&codes.has(e.code)?e.code:undefined;
  if(code){
   if(['UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ETIMEDOUT'].includes(code))return {kind:'timeout',code,phase:code==='UND_ERR_CONNECT_TIMEOUT'?'connect':code==='UND_ERR_HEADERS_TIMEOUT'?'headers':code==='UND_ERR_BODY_TIMEOUT'?'body':'unknown'};
   if(['EAI_AGAIN','ENOTFOUND'].includes(code))return {kind:'dns',code};
   if(['ECONNRESET','EPIPE','UND_ERR_SOCKET'].includes(code))return {kind:'socket',code};
   if(['UND_ERR_ABORT','UND_ERR_ABORTED'].includes(code))return {kind:'aborted'};
   if(['ECONNREFUSED','ENETUNREACH','EHOSTUNREACH'].includes(code))return {kind:'connect',code};
   return {kind:'tls',code};
  }
  if(e.name==='TimeoutError')return {kind:'timeout',phase:phase==='body'?'body':'unknown'};
  if(e.name==='AbortError')return {kind:'aborted'};
  if(e.name==='SyntaxError'&&phase==='body')return {kind:'invalidResponse'};
  current=e.cause;
 }
 return {kind:'unknown',safeMessage:'Unclassified transport exception; raw message omitted'};
}
export function retryClassification(f:TransportFailure):{classification:string;retryable:boolean}{
 if(f.kind==='http')return ({400:{classification:'NONRETRYABLE_CLIENT',retryable:false},401:{classification:'AUTH_FAILURE',retryable:false},403:{classification:'PERMISSION_FAILURE',retryable:false},404:{classification:'RESOURCE_OR_CONTRACT_ERROR',retryable:false},412:{classification:'CONCURRENCY_OR_PRECONDITION',retryable:false},429:{classification:'TRANSIENT_THROTTLE',retryable:true},500:{classification:'TRANSIENT_SERVER',retryable:true},502:{classification:'TRANSIENT_GATEWAY',retryable:true},503:{classification:'TRANSIENT_SERVICE',retryable:true},504:{classification:'TRANSIENT_GATEWAY_TIMEOUT',retryable:true}} as Record<number,{classification:string;retryable:boolean}>)[f.status]??{classification:'UNCLASSIFIED_HTTP',retryable:false};
 return {classification:f.kind==='authentication'?'AUTH_FAILURE':f.kind==='invalidResponse'?'RESPONSE_CONTRACT_ERROR':f.kind==='aborted'?'CANCELLED':f.kind.toUpperCase()+'_FAILURE',retryable:f.kind==='timeout'||f.kind==='socket'||f.kind==='dns'&&f.code==='EAI_AGAIN'};
}
export function retryAfter(value:string|null,now=Date.now()):number|undefined{
 if(value===null)return undefined;
 if(/^\d+$/.test(value.trim())){const seconds=Number(value);return Number.isSafeInteger(seconds)&&seconds<=Number.MAX_SAFE_INTEGER/1000?seconds:undefined;}
 // Avoid Date.parse interpreting malformed numeric or arbitrary words as a date.
 if(!/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value))return undefined;
 const date=Date.parse(value);return Number.isFinite(date)?Math.max(0,(date-now)/1000):undefined;
}
export function correlationHeaders(headers:Headers){
 const safe=(name:string)=>{const v=headers.get(name);return v&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)?v:undefined;};
 const serviceRequestId=safe('x-ms-service-request-id')??safe('req_id')??safe('request-id');
 const correlationId=safe('x-ms-correlation-request-id')??safe('x-ms-correlation-id');
 return {...(serviceRequestId?{serviceRequestId}:{}),...(correlationId?{correlationId}:{})};
}
export async function cancellableDelay(ms:number,signal?:AbortSignal):Promise<void>{
 signal?.throwIfAborted();
 await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new DOMException('Cancelled','AbortError'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});});
}
export function transportHealth(entries:readonly RequestAudit[],startedAt:string,finishedAt=new Date().toISOString()){
 const attempts=entries.filter(e=>e.result!=='STARTED'&&e.failurePhase!=='retryWait');
 const final=[...attempts.filter(e=>e.result!=='RETRY'),...entries.filter(e=>e.result==='FAILED'&&e.failurePhase==='retryWait')];
 const failed=final.filter(e=>e.result==='FAILED'),recovered=final.filter(e=>e.result==='RECOVERED_TRANSIENT');
 const incomplete=entries.filter(e=>e.result==='STARTED'&&!attempts.some(a=>a.requestId===e.requestId&&a.attempt===e.attempt));
 const status=failed.some(e=>e.retryClassification==='AUTH_FAILURE')?'BLOCKED_AUTH':failed.some(e=>e.retryClassification==='PERMISSION_FAILURE')?'BLOCKED_PERMISSION':failed.length||incomplete.length?'UNSTABLE':recovered.length?'DEGRADED_RECOVERED':'HEALTHY';
 const slowest=attempts.reduce<RequestAudit|undefined>((a,b)=>(a?.elapsedMs??-1)>(b.elapsedMs??0)?a:b,undefined);
 return {status,requestsTotal:new Set(entries.map(e=>e.requestId)).size,attemptsTotal:attempts.length,httpDispatchAttempts:attempts.filter(e=>e.dispatched??e.failurePhase!=='credentials').length,firstAttemptSuccesses:final.filter(e=>e.result==='SUCCESS').length,recoveredTransientFailures:recovered.length,failedRequests:failed.length,incompleteRequests:incomplete.length,retries:entries.filter(e=>e.result==='STARTED'&&e.attempt>1).length,retrySchedules:attempts.filter(e=>e.result==='RETRY').length,throttle429Count:attempts.filter(e=>e.status===429).length,server5xxCount:attempts.filter(e=>(e.status??0)>=500).length,transportFailureCount:attempts.filter(e=>e.failure&&!['http','authentication','invalidResponse'].includes(e.failure.kind)).length,totalRetryDelayMs:attempts.reduce((n,e)=>n+(e.retryDelayMs??0),0),slowRequests:attempts.filter(e=>e.slow).length,slowestRequest:slowest??null,startedAt,finishedAt,discoveryDurationMs:Date.parse(finishedAt)-Date.parse(startedAt)};
}
export function transportConfiguration(){
 const proxyEnvironmentNames=['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','NODE_USE_ENV_PROXY'].filter(k=>process.env[k]!==undefined);
 return {node:process.version,undici:process.versions.undici??'bundled version unavailable',os:platform(),osRelease:release(),client:'Node built-in fetch / Undici global dispatcher',getAttemptDeadlineMs:30000,writeAttemptDeadlineMs:180000,deadlineScope:'fetch through response body; credential acquisition excluded',connectTimeout:'dispatcher default; not configured or inferred',headersTimeout:'dispatcher default bounded by attempt deadline',bodyTimeout:'dispatcher default bounded by attempt deadline',retryAttempts:3,maxSingleRetryDelayMs:60000,maxTotalRetryDelayMs:60000,slowThresholdMs:5000,discoveryConcurrency:'Schema serial; model components serial with concurrent published/unpublished reads; sitemap identity fan-out at most 8 per component',connectionReuse:'Existing global dispatcher pooling/keep-alive; actual socket reuse not measured',proxyConfigured:proxyEnvironmentNames.length>0,proxyEnvironmentNames,proxyUse:'Presence only; actual dispatcher proxy routing unverified',vpn:'not inspected',dnsResultOrder:getDefaultResultOrder(),autoSelectFamily:getDefaultAutoSelectFamily(),networkChanges:0,cache:'Per-observation table memoization only; no cross-cycle metadata cache'};
}
