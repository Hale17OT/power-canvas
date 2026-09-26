import {readFileSync} from 'node:fs';
import {mkdtemp,readFile,rm,writeFile,mkdir,readdir} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {describe,expect,it,vi} from 'vitest';
import type {IPublicClientApplication} from '@azure/msal-node';
import {MicrosoftSession,DISCOVERY_ORIGIN,type CredentialGrant} from '../src/auth/msal.js';
import type {StoredProfile} from '../src/auth/profiles.js';
import {DiscoveryCredentialContext} from '../src/auth/discovery-context.js';
import {CredentialError,credentialHealth,normalizeCredentialError,type CredentialAuditOptions,type CredentialEvent,type CredentialState} from '../src/auth/credential-audit.js';
import {TransportAuditLog} from '../src/dataverse/transport-audit.js';
import {DataverseHttp} from '../src/dataverse/http.js';
import {transportHealth} from '../src/dataverse/transport.js';
import {evaluateCredentialStability,writeTransportSupport,transportDoctorConfiguration,type DiscoveryCycle} from '../src/dataverse/transport-doctor.js';
import {assertAuthEvidenceSafe} from '../src/auth/safe-evidence.js';
import {interpretResult} from '../src/agent/routing.js';
import {matchingState,target} from './planner-fixtures.js';
import {resolveSolution} from '../src/solution/resolve.js';
import {certificationPlan} from '../src/solution/certification.js';
import {MODEL_KINDS} from '../src/model-driven/desired.js';

const origin=target.dataverseUrl;
function setup(){
 const profile:StoredProfile={alias:'synthetic',tenantId:target.tenantId,clientId:randomUUID(),cloud:'public',mode:'interactive',allowedEnvironmentIds:[target.environmentId],homeAccountId:'synthetic-account',cacheId:randomUUID()};
 const binding={alias:'synthetic-dev',authProfile:profile.alias,target:structuredClone(target)};
 const events:CredentialEvent[]=[];
 const options:CredentialAuditOptions={cycleId:randomUUID(),environment:binding.alias,mode:'cycle',audit:event=>{events.push(event);}};
 const result={tenantId:profile.tenantId,account:{homeAccountId:profile.homeAccountId},expiresOn:new Date(Date.now()+3600000),accessToken:'synthetic-runtime-value',fromCache:true,correlationId:randomUUID()};
 const lookup=vi.fn(async()=>result.account),silent=vi.fn(async()=>result);
 const session=new MicrosoftSession(profile,{getTokenCache:()=>({getAccountByHomeId:lookup}),acquireTokenSilent:silent} as unknown as IPublicClientApplication,options);
 const acquire=vi.fn((url:string,request:{requestId:string;attempt:number},force:boolean)=>session.acquireSilentGrant(url,request,force));
 const context=new DiscoveryCredentialContext(profile,binding,acquire,options);
 return {profile,binding,events,options,result,lookup,silent,session,acquire,context};
}
describe('credential acquisition lifecycle',()=>{
 it('single-flights concurrent requests and audits one provider call',async()=>{
  const x=setup();const values=await Promise.all(Array.from({length:30},()=>x.context.token(origin)));
  expect(new Set(values).size).toBe(1);expect(x.silent).toHaveBeenCalledTimes(1);expect(x.lookup).toHaveBeenCalledTimes(1);
  expect(credentialHealth(x.events)).toMatchObject({status:'AUTH_HEALTHY',providerCalls:1,maxProviderConcurrency:1,singleFlightWaiters:29,cacheHits:1,authRetries:0});
  expect(JSON.stringify(x.events)).not.toContain(x.result.accessToken);expect(JSON.stringify(x.context)).not.toContain(x.result.accessToken);
 });
 it('initializes two audiences sequentially and reuses valid credentials without reloading the cache',async()=>{
  const x=setup();await x.context.initialize();await Promise.all(Array.from({length:50},()=>x.context.token(origin)));
  expect(x.acquire.mock.calls.map(c=>c[0])).toEqual([origin,DISCOVERY_ORIGIN]);
  expect(credentialHealth(x.events)).toMatchObject({providerCalls:2,maxProviderConcurrency:1,contextReuses:50});
  expect(x.events.filter(e=>e.kind==='provider'&&e.result==='SUCCESS').every(e=>e.expiresInBucket==='>30m')).toBe(true);
 });
 it('measures overlapping acquisitions in observe mode without hiding baseline behavior',async()=>{
  const x=setup();await Promise.all([x.session.token(origin),x.session.token(origin)]);
  expect(credentialHealth(x.events)).toMatchObject({providerCalls:2,maxProviderConcurrency:2,cacheHits:2});
 });
 it.each(['expiry','refreshOn','age'])('refreshes or rechecks after %s and shares the new acquisition',async reason=>{
  const x=setup();let now=Date.now();const initial=now;
  const acquire=vi.fn(async():Promise<CredentialGrant>=>({value:'synthetic',expiresAt:reason==='expiry'?now+120000:now+3600000,...(reason==='refreshOn'?{refreshAt:now+120000}:{}),accountId:x.profile.homeAccountId,tenantId:x.profile.tenantId}));
  const context=new DiscoveryCredentialContext(x.profile,x.binding,acquire,x.options,()=>now);
  await context.token(origin);now=initial+(reason==='age'?300000:120000);
  await Promise.all([context.token(origin),context.token(origin)]);
  expect(acquire).toHaveBeenCalledTimes(2);
  expect((acquire.mock.calls as unknown[][])[1]?.[2]).toBe(reason!=='age');
 });
 it.each([true,false,undefined])('classifies observable MSAL cache outcome %s',async fromCache=>{
  const x=setup();Object.assign(x.result,{fromCache});await x.context.token(origin);
  expect(x.events.find(e=>e.kind==='provider'&&e.result==='SUCCESS')?.state).toBe(fromCache===true?'AUTH_CACHE_HIT':fromCache===false?'AUTH_SILENT_REFRESH_SUCCESS':'AUTH_SILENT_SUCCESS');
 });
 it('rejects all waiters on one failure, clears in-flight state, and permits an explicit later acquisition',async()=>{
  const x=setup();x.silent.mockRejectedValueOnce(Object.assign(new Error('private provider detail'),{errorCode:'temporarily_unavailable'}));
  const results=await Promise.allSettled(Array.from({length:12},()=>x.context.token(origin)));
  expect(results.every(r=>r.status==='rejected')).toBe(true);expect(x.silent).toHaveBeenCalledTimes(1);
  expect(credentialHealth(x.events)).toMatchObject({providerCalls:1,failures:1,authRetries:0});
  await x.context.token(origin);expect(x.silent).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(x.events)).not.toContain('private provider detail');
 });
 it.each([['interaction_required','AUTH_INTERACTION_REQUIRED'],['consent_required','AUTH_CONSENT_REQUIRED']])('stops %s without HTTP dispatch, retry or another account',async(code,state)=>{
  const x=setup();x.silent.mockRejectedValue(Object.assign(new Error('private'),{name:'InteractionRequiredAuthError',errorCode:code}));
  const dispatch=vi.fn(async()=>new Response('{}')),sleep=vi.fn(async()=>undefined);
  const http=new DataverseHttp(origin+'/api/data/v9.2/',x.context,dispatch,{sleep,readOnly:true});
  await expect(http.request('sitemaps')).rejects.toThrow();await expect(http.request('sitemaps')).rejects.toThrow();
  expect(x.silent).toHaveBeenCalledTimes(1);expect(x.lookup).toHaveBeenCalledTimes(1);expect(dispatch).not.toHaveBeenCalled();expect(sleep).not.toHaveBeenCalled();
  expect(credentialHealth(x.events)).toMatchObject({status:state,authRetries:0,failures:1});
  expect(http.audit.filter(e=>e.result==='FAILED').every(e=>e.failurePhase==='credentials'&&e.dispatched===false)).toBe(true);
 });
 it('reports an absent exact account and never selects an alternative',async()=>{
  const x=setup();x.lookup.mockResolvedValue(null as unknown as typeof x.result.account);
  await expect(x.context.initialize()).rejects.toMatchObject({credentialFailure:{state:'AUTH_ACCOUNT_NOT_FOUND',stage:'accountLookup'}});
  expect(x.events.find(e=>e.result==='FAILED')?.failure).toEqual({state:'AUTH_ACCOUNT_NOT_FOUND',stage:'accountLookup',errorClass:'PowerCanvasError',safeErrorCode:'PF-AUTH-006',interactionRequired:false});
  await expect(x.context.token(origin)).rejects.toThrow();expect(x.lookup).toHaveBeenCalledTimes(1);expect(x.silent).not.toHaveBeenCalled();
 });
 it.each(['tenantId','homeAccountId','clientId','alias','cacheId'])('invalidates cached context after profile %s changes',async field=>{
  const x=setup();await x.context.token(origin);Object.assign(x.profile,{[field]:randomUUID()});
  await expect(x.context.token(origin)).rejects.toMatchObject({code:'PF-AUTH-005'});expect(x.acquire).toHaveBeenCalledTimes(1);
 });
 it.each(['tenantId','environmentId','organizationId','dataverseUrl'])('invalidates on target %s change',async field=>{
  const x=setup();await x.context.token(origin);Object.assign(x.binding.target,{[field]:randomUUID()});
  await expect(x.context.token(origin)).rejects.toMatchObject({code:'PF-AUTH-005'});
 });
 it('rejects unexpected resource audiences, returned identities and expired grants',async()=>{
  for(const variant of ['audience','tenant','account','expiry']){
   const x=setup();if(variant==='tenant')x.result.tenantId=randomUUID();if(variant==='account')x.result.account.homeAccountId='other';if(variant==='expiry')x.result.expiresOn=new Date(0);
   await expect(x.context.token(variant==='audience'?'https://other.crm.dynamics.com':origin)).rejects.toMatchObject({code:'PF-AUTH-005'});
  }
 });
 it('does not share grants between cycles and rejects principal switches',async()=>{
  const x=setup();await x.context.token(origin);const other=new DiscoveryCredentialContext(x.profile,x.binding,x.acquire,x.options);await other.token(origin);expect(x.acquire).toHaveBeenCalledTimes(2);
  const principal=randomUUID();x.context.bindPrincipal(principal,principal);expect(()=>x.context.bindPrincipal(randomUUID())).toThrow();await expect(x.context.token(origin)).rejects.toThrow();
 });
 it('keeps credential and GET retry budgets independent',async()=>{
  const x=setup();const dispatch=vi.fn(async()=>new Response('{}',{status:503})).mockResolvedValueOnce(new Response('{}',{status:503})).mockResolvedValueOnce(new Response('{}',{status:200}));
  const http=new DataverseHttp(origin+'/api/data/v9.2/',x.context,dispatch,{readOnly:true,sleep:async()=>undefined});await http.request('sitemaps');
  expect(credentialHealth(x.events)).toMatchObject({providerCalls:1,authRetries:0,contextReuses:1});expect(transportHealth(http.audit,http.audit[0]!.startedAt)).toMatchObject({retries:1,httpDispatchAttempts:2,recoveredTransientFailures:1});
 });
 it.each(['POST','PATCH','DELETE'])('never grants %s the GET retry behavior',async method=>{
  const x=setup(),dispatch=vi.fn(async()=>new Response('{}',{status:503}));
  const http=new DataverseHttp(origin+'/api/data/v9.2/',x.session,dispatch);await expect(http.request('roles',method,{})).rejects.toThrow();expect(dispatch).toHaveBeenCalledTimes(1);expect(x.acquire).not.toHaveBeenCalled();expect(x.silent).toHaveBeenCalledTimes(1);
  const guarded=new DataverseHttp(origin+'/api/data/v9.2/',x.context,dispatch,{readOnly:true});await expect(guarded.request('roles',method,{})).rejects.toMatchObject({code:'PF-SAFETY-006'});expect(x.acquire).not.toHaveBeenCalled();
 });
});
describe('safe auth diagnostics and stability gate',()=>{
 it('permits the doctor configuration through the evidence safety gate without credential-shaped keys',()=>{
  const config=transportDoctorConfiguration();expect(()=>assertAuthEvidenceSafe(config)).not.toThrow();expect(config.authPolicy.authRetryBudget).toBe(0);
 });
 it('retains only allowlisted error identifiers, never messages, credentials or nested causes',()=>{
  const correlationId=randomUUID();const raw=Object.assign(new Error('AADSTS65001 private credential material'),{name:'InteractionRequiredAuthError',errorCode:'consent_required',subError:'consent_required',correlationId,cause:{accessToken:'private'}});
  expect(normalizeCredentialError(raw,'silentAcquisition')).toEqual({state:'AUTH_CONSENT_REQUIRED',stage:'silentAcquisition',errorClass:'InteractionRequiredAuthError',msalErrorCode:'consent_required',suberror:'consent_required',correlationId,aadsts:'AADSTS65001',interactionRequired:true});
  expect(JSON.stringify(normalizeCredentialError({name:'SECRET',errorCode:'SECRET',subError:'SECRET',correlationId:'SECRET'},'accountLookup'))).not.toContain('SECRET');
  expect(normalizeCredentialError({name:'PersistenceError',errorCode:'DPAPIEncryptedFileError'},'initialization').state).toBe('AUTH_CACHE_UNAVAILABLE');
 });
 it('counts initialization failure and incomplete acquisitions as unhealthy',()=>{
  const event:CredentialEvent={eventId:randomUUID(),acquisitionId:randomUUID(),cycleId:randomUUID(),requestId:randomUUID(),attempt:1,profile:'test',environment:'test',audience:origin,startedAt:new Date().toISOString(),kind:'initialization',result:'FAILED',mode:'unknown',failure:{state:'AUTH_CACHE_UNAVAILABLE',stage:'initialization',errorClass:'PersistenceError',interactionRequired:false}};
  expect(credentialHealth([event])).toMatchObject({status:'AUTH_UNSTABLE',providerCalls:0,failures:1});expect(credentialHealth([{...event,kind:'provider',result:'STARTED'}])).toMatchObject({status:'AUTH_UNSTABLE',incomplete:1});
 });
 it('serializes 80 concurrent auth records, seals before hashing saved bytes, and includes sanitized auth in support',async()=>{
  const root=await mkdtemp(join(tmpdir(),'powercanvas-auth-audit-'));
  try{
   const x=setup();await Promise.all([x.session.token(origin),x.session.token(origin)]);
   const events=Array.from({length:80},(_,i)=>({...x.events[i%x.events.length]!,eventId:randomUUID()}));
   const path=join(root,'auth.ndjson'),log=await TransportAuditLog.create<CredentialEvent>(path);const writes=events.map(e=>log.record(e));const hashPromise=log.sha256();await Promise.all(writes);const hash=await hashPromise;
   const bytes=await readFile(path);expect(bytes.toString().trim().split('\n').map(line=>JSON.parse(line))).toEqual(log.entries);expect(log.entries).toEqual(events);expect(hash).toBe(createHash('sha256').update(bytes).digest('hex'));await expect(log.record(events[0]!)).rejects.toThrow();
   const source=join(root,'source');await mkdir(source);for(const name of ['transport-summary.json','failed-requests.json','phase-timeline.json','configuration.json'])await writeFile(join(source,name),'{}');await writeFile(join(source,'reproduction.md'),'Safe');await writeFile(join(source,'auth-events.json'),JSON.stringify(events));await writeTransportSupport(source,join(root,'support'));expect(await readdir(join(root,'support'))).toHaveLength(7);
   expect(await readFile(join(root,'support/auth-events.json'),'utf8')).not.toContain(x.result.accessToken);
  }finally{expect(resolve(dirname(root))).toBe(resolve(tmpdir()));expect(basename(root).startsWith('powercanvas-auth-audit-')).toBe(true);await rm(root,{recursive:true,force:true});}
 });
 function proof(){
  const raw=JSON.parse(readFileSync('tests/fixtures/certification-v21i-source.json','utf8'));const {project}=resolveSolution(raw);const {observation,ownership}=matchingState(project);
  observation.resources=observation.resources.filter(r=>['publisher','solution'].includes(r.kind));ownership.resources=ownership.resources.filter(r=>observation.resources.some(o=>o.resourceId===r.resourceId));observation.coverage=[...new Set([...observation.coverage.map(c=>c.kind),'choice','key',...MODEL_KINDS])].map(kind=>({kind,status:'complete' as const}));
  const result=certificationPlan(raw,observation,ownership);const authHealth={...credentialHealth([]),status:'AUTH_HEALTHY',providerCalls:2};
  const cycle:DiscoveryCycle={complete:true,observation,ownership,plan:result.native,historical:result.historical,authHealth,health:transportHealth([],new Date().toISOString())};return {cycles:Array.from({length:3},()=>structuredClone(cycle)),manifest:result.manifest};
 }
 it('requires three fresh healthy auth cycles in addition to complete compatible read evidence',()=>{
  const x=proof();expect(evaluateCredentialStability(x.cycles,x.manifest)).toMatchObject({status:'STABLE',stabilityGatePassed:true,scopeCorrect:true,mutationAuthorized:false});
  x.cycles[1]!.authHealth!.status='AUTH_UNSTABLE';expect(evaluateCredentialStability(x.cycles,x.manifest)).toMatchObject({status:'AUTH_UNSTABLE',stabilityGatePassed:false});
  delete x.cycles[1]!.authHealth;expect(evaluateCredentialStability(x.cycles,x.manifest).stabilityGatePassed).toBe(false);
 });
 it('accepts recovered GETs but rejects historical divergence and publication outside reviewed scope',()=>{
  const x=proof();x.cycles[1]!.health.status='DEGRADED_RECOVERED';x.cycles[1]!.health.recoveredTransientFailures=1;expect(evaluateCredentialStability(x.cycles,x.manifest).status).toBe('OPERATIONAL_WITH_RECOVERED_TRANSIENT');
  x.cycles[1]!.historical=[];expect(evaluateCredentialStability(x.cycles,x.manifest).stabilityGatePassed).toBe(false);
 });
 it.each(['AUTH_INTERACTION_REQUIRED','AUTH_CONSENT_REQUIRED','AUTH_ACCOUNT_NOT_FOUND','AUTH_UNSTABLE'])('routes %s to diagnosis with no automatic retry or profile repair',status=>{
  expect(interpretResult({status})).toMatchObject({next:'credential-acquisition-diagnosis',autoRetry:false,mutationAuthorized:false});
 });
 it('prioritizes PF-AUTH-006 over generic certification scope diagnosis',()=>{
  expect(interpretResult({status:'CERTIFICATION_PLAN_STILL_BLOCKED',error:{code:'PF-AUTH-006'}}).next).toBe('credential-acquisition-diagnosis');
  expect(new CredentialError({state:'AUTH_UNKNOWN' as CredentialState,stage:'silentAcquisition',errorClass:'Error',interactionRequired:false}).remediation).not.toMatch(/auth add|recreate this/);
 });
});
