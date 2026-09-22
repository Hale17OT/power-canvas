import {describe,it,expect} from 'vitest';
import {CapabilityLadder,providerHealth,reconnectStability,redactDiagnostic,sanitizedHttpEvidence,studioUrlMetadata} from '../src/canvas/authoring-health.js';
import {makeSourceBundle,AuthoringMcpProvider,PacDownloadProvider} from '../src/canvas/source-provider.js';
import {buildAuthoringSupportBundle} from '../src/canvas/authoring-support.js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {stringify} from 'yaml';
import {AuthoringLifecycle,semanticSourceHash,ownHarness,planHarnessRecovery} from '../src/canvas/authoring-lifecycle.js';
import {button} from '../src/canvas/patterns.js';
import {harnessFile,harnessScreen} from '../src/canvas/certification-harness.js';
import type {NativeFiles} from '../src/canvas/native-types.js';
const id={appId:'11111111-1111-4111-8111-111111111111',environmentId:'Default-22222222-2222-4222-8222-222222222222',sessionId:'one'};
const source:NativeFiles={'App.pa.yaml':{App:{Properties:{StartScreen:'=Screen1'}}},'Screen1.pa.yaml':{Screens:{Screen1:{Properties:{},Children:[button('cancel','"Cancel"','SetFocus(cancel)')]}}}};
const bundle=(epoch:string,files=source)=>makeSourceBundle(files,{...id,sessionId:epoch},'authoringMcp',[],[],{content:[{type:'text',text:'Synthetic local test'}]});
const cycle=(epoch:string)=>({source:bundle(epoch),doctorPassed:true,controlsPassed:true});
const target={...id,semanticHash:semanticSourceHash(source)};
const studio=`https://make.powerapps.com/e/${id.environmentId}/canvas/?action=edit&app-id=%2Fproviders%2FMicrosoft.PowerApps%2Fapps%2F${id.appId}`;
describe('capability ladder',()=>{
 it('retains startup success when authentication is not established',()=>{const l=new CapabilityLadder();l.record('MCP_STARTED','PASS','Started');l.record('AUTHENTICATED','FAIL','Sign-in failed');expect(l.results[0]!.status).toBe('PASS');expect(l.results[2]!.status).toBe('NOT_REACHED');expect(()=>l.record('CONTROL_DISCOVERY_READY','PASS','Guess')).toThrow();});
 it('separates authenticated from rejected Studio resolution',()=>{const l=new CapabilityLadder();l.record('MCP_STARTED','PASS','Started');l.record('AUTHENTICATED','PASS','Signed in');l.record('STUDIO_SESSION_RESOLVED','FAIL','HTTP 422');expect(l.results[1]!.status).toBe('PASS');expect(l.results[3]!.status).toBe('NOT_REACHED');});
 it.each(['CONTROL_DISCOVERY_READY','SOURCE_SYNC_READY'] as const)('stops on %s failure',stage=>{const l=new CapabilityLadder();for(const r of l.results){l.record(r.stage,r.stage===stage?'FAIL':'PASS','Synthetic result');if(r.stage===stage)break;}const index=l.results.findIndex(r=>r.status==='FAIL');expect(l.results.slice(index+1).every(r=>r.status==='NOT_REACHED')).toBe(true);expect(l.results.slice(0,index).every(r=>r.status==='PASS')).toBe(true);});
 it('does not permit rewriting an observed failure as a pass',()=>{const l=new CapabilityLadder();l.record('MCP_STARTED','FAIL','Missing executable');expect(()=>l.record('MCP_STARTED','PASS','Changed story')).toThrow();});
});
describe('diagnostic sanitization and current URL configuration',()=>{
 it.each(['Authorization: Bearer TOPSECRET','Cookie: sid=TOPSECRET','Set-Cookie: auth=TOPSECRET; secure','access_token=TOPSECRET','refresh_token="TOPSECRET"','{"access_token":"TOPSECRET","error":{"code":"SessionRejected"}}','{"Authorization":"Bearer TOPSECRET"}','https://example.test/auth?code=TOPSECRET&state=TOPSECRET#TOPSECRET','?code=TOPSECRET&state=TOPSECRET'])('redacts credential shape %s',text=>expect(redactDiagnostic(text)).not.toContain('TOPSECRET'));
 it('preserves service error, inner error, request IDs and safe headers',()=>{const requestId='d19c16ac-83c4-4a04-984d-325e4ea5542e';const r=sanitizedHttpEvidence(`HTTP 422\nx-ms-request-id: ${requestId}\nSet-Cookie: TOPSECRET\n{"error":{"code":"SessionRejected","message":"No active session","innererror":{"code":"InvalidSession"}}}`);expect(r.httpStatus).toBe(422);expect(r.requestIds).toContain(requestId);expect(r.headers['x-ms-request-id']).toBe(requestId);expect(r.headers).not.toHaveProperty('set-cookie');expect(r.sanitizedResponse).toContain('InvalidSession');expect(r.sanitizedResponse).not.toContain('TOPSECRET');});
 it('does not invent missing HTTP headers or endpoint details',()=>{const r=sanitizedHttpEvidence('HTTP 422 [SessionId: d19c16ac-83c4-4a04-984d-325e4ea5542e]');expect(r.httpHeadersExposed).toBe(false);expect(r.rawHttpCapture).toBe(false);expect(r.requestIds).toHaveLength(1);});
 it('extracts the complete current URL according to official category mapping',()=>{const m=studioUrlMetadata(studio);expect(m.appId).toBe(id.appId);expect(m.environmentId).toBe(id.environmentId);expect(m.environmentCategory).toBe('prod');expect(m.cluster).toContain('NOT A SEPARATE');});
 it('hashes unknown routing/auth query values and strips fragments',()=>{const m=studioUrlMetadata(studio+'&cluster=TOPSECRET&code=TOPSECRET#TOPSECRET');expect(JSON.stringify(m)).not.toContain('TOPSECRET');expect(m.fragmentPresent).toBe(true);expect(m.query.cluster).toMatchObject({redacted:true});});
 it('rejects arbitrary data hidden in the app-id prefix',()=>expect(()=>studioUrlMetadata(studio.replace('%2Fproviders%2FMicrosoft.PowerApps%2Fapps%2F','password%3DTOPSECRET%2F'))).toThrow());
});
describe('health and read-only authority',()=>{
 it('reports actual provider acquisition failures and recovery without changing static capabilities',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'powercanvas-health-'));let fail=false;
  const p=new AuthoringMcpProvider(async(_name,args)=>{if(fail)throw Error('HTTP 422');for(const [name,data] of Object.entries(source))await writeFile(join(String(args.directoryPath),name),stringify(data));return {content:[{type:'text',text:'Fresh source acquired'}]};},id,[],[]);
  try{expect(p.health({doctorPassed:true}).writeEligible).toBe(false);await p.read(dir);expect(p.health({doctorPassed:true}).health).toBe('HEALTHY');expect(p.health({doctorPassed:true,recoveryRequired:true}).writeEligible).toBe(false);fail=true;await expect(p.read(join(dir,'next'))).rejects.toThrow('HTTP 422');expect(p.health({doctorPassed:true}).writeEligible).toBe(false);expect(p.capabilities.write).toBe(true);}finally{await rm(dir,{recursive:true,force:true});}
  const pac=new PacDownloadProvider('unused',id,'https://example.crm.dynamics.com','owned');expect(pac.health({doctorPassed:true}).writeEligible).toBe(false);expect(pac.capabilities.write).toBe(false);
 });
 it('PAC read success never enables writes or certification revocation',()=>expect(providerHealth('pacDownload',{readSucceeded:true,doctorPassed:true})).toMatchObject({health:'DEGRADED_READ_ONLY',writeEligible:false,certificateRevocationRequired:false}));
 it('distinguishes rejection, recovery and incomplete doctor from healthy acquisition',()=>{expect(providerHealth('authoringMcp',{readSucceeded:false,rejected:true}).health).toBe('SESSION_REJECTED');expect(providerHealth('authoringMcp',{readSucceeded:true,recoveryRequired:true}).writeEligible).toBe(false);expect(providerHealth('authoringMcp',{readSucceeded:true}).writeEligible).toBe(false);expect(providerHealth('authoringMcp',{readSucceeded:true,doctorPassed:true}).health).toBe('HEALTHY');});
});
describe('support bundle generation',()=>{
 const input={generatedAt:'2026-09-22T15:02:21.000Z',system:{version:'0.1.0'},studio:{appId:id.appId},comparison:{cause:'UNDETERMINED'},attempts:[{httpStatus:422,requestId:id.appId,error:{code:'SessionRejected',innererror:{message:'No active session'}},authorization:'TOPSECRET',details:'Cookie: TOPSECRET'}],recovery:{writes:0},limitations:['HTTP headers not exposed']};
 it('preserves diagnostic semantics, redacts nested secrets and excludes unselected inputs',()=>{const bundle=buildAuthoringSupportBundle({...input,rawLogs:'TOPSECRET'} as typeof input);expect(JSON.stringify(bundle)).not.toContain('TOPSECRET');expect(bundle).not.toHaveProperty('rawLogs');expect(bundle.attempts[0]).toMatchObject({httpStatus:422,requestId:id.appId,error:{code:'SessionRejected',innererror:{message:'No active session'}}});expect(bundle.metadataHash).toHaveLength(64);expect(bundle.rawLogsIncluded).toBe(false);});
 it('binds the sanitized metadata and rejects non-JSON/unbounded metadata',()=>{expect(buildAuthoringSupportBundle(input).metadataHash).toBe(buildAuthoringSupportBundle(input).metadataHash);expect(buildAuthoringSupportBundle({...input,recovery:{writes:1}}).metadataHash).not.toBe(buildAuthoringSupportBundle(input).metadataHash);expect(()=>buildAuthoringSupportBundle({...input,system:{bad:()=>0}})).toThrow('JSON');expect(()=>buildAuthoringSupportBundle({...input,attempts:Array.from({length:1001},()=>({}))})).toThrow('limit');});
});
describe('three independent reconnect epochs',()=>{
 it('requires exactly three successful independent acquisitions',()=>{expect(reconnectStability([cycle('a'),cycle('b')],target).accepted).toBe(false);expect(reconnectStability([cycle('a'),cycle('b'),cycle('c')],target).accepted).toBe(true);});
 it('rejects reused evidence and failed doctor/control discovery',()=>{expect(reconnectStability([cycle('a'),cycle('a'),cycle('c')],target).accepted).toBe(false);expect(reconnectStability([cycle('a'),{...cycle('b'),doctorPassed:false},cycle('c')],target).accepted).toBe(false);expect(reconnectStability([cycle('a'),{...cycle('b'),controlsPassed:false},cycle('c')],target).accepted).toBe(false);});
 it('cannot use saved baseline stability as protected focus-draft proof',()=>expect(reconnectStability([cycle('a'),cycle('b'),cycle('c')],{...target,semanticHash:'f'.repeat(64)}).accepted).toBe(false));
 it('rejects expired source even when the hash matches',()=>{const c=cycle('a');c.source.snapshot.acquiredAt='2026-01-01T00:00:00.000Z';expect(reconnectStability([c,cycle('b'),cycle('c')],target).accepted).toBe(false);});
});
describe('recovery preconditions stay strict',()=>{
 const harness:NativeFiles={...source,[harnessFile]:{Screens:{[harnessScreen]:{Properties:{},Children:[button('pc_cert_noop','"No op"','false')]}}}};
 it('cannot adopt or clean before healthy acquisition',()=>{const l=new AuthoringLifecycle(id,semanticSourceHash(source));const owner=ownHarness(source,harness,id,'test');expect(()=>l.adoptRecovery(owner)).toThrow();l.connect('two');expect(()=>l.authorizeWrite({epoch:'two',sourceHash:'f'.repeat(64),candidateHash:semanticSourceHash(source),purpose:'cleanup'})).toThrow();});
 it('rejects unknown screens and changed protected focus logic',()=>{const owner=ownHarness(source,harness,id,'test');expect(()=>planHarnessRecovery(bundle('one',{...harness,'Unknown.pa.yaml':{Screens:{Unknown:{Properties:{}}}}}),source,owner)).toThrow('Unexpected');const altered=structuredClone(harness);altered['Screen1.pa.yaml']={Screens:{Screen1:{Properties:{},Children:[button('cancel','"Cancel"','false')]}}};expect(()=>planHarnessRecovery(bundle('one',altered),source,owner)).toThrow('Unexpected');});
});
