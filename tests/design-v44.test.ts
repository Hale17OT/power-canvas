import { describe,it,expect } from 'vitest';
import { hashJson } from '../src/core/json.js';
import { AuthoringLifecycle,ownHarness,planHarnessRecovery,semanticSourceHash } from '../src/canvas/authoring-lifecycle.js';
import { authoringFailure } from '../src/canvas/authoring-diagnostics.js';
import { makeSourceBundle } from '../src/canvas/source-provider.js';
import { harnessFile,harnessScreen } from '../src/canvas/certification-harness.js';
import { button,stack } from '../src/canvas/patterns.js';
import { controls } from '../src/canvas/taste/audit.js';
import { compileField } from '../src/canvas/fields.js';
import { buildProductionCore,validateDependencyClosure,selectCoreVariant } from '../src/canvas/production-core.js';
import { restrictCertifiedSelection,type CertifiedSelection } from '../src/canvas/certified-selection.js';
import type { NativeFiles } from '../src/canvas/native-types.js';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { stringify } from 'yaml';
import { CertificationTransaction } from '../src/canvas/certification-transaction.js';
import { AuthoringMcpProvider,readNativeSource,type AuthoringCall } from '../src/canvas/source-provider.js';

const id={appId:'11111111-1111-4111-8111-111111111111',environmentId:'Default-test',sessionId:'epoch-1'};
const now=Date.parse('2026-09-22T03:00:00.000Z');
const base=():NativeFiles=>({'App.pa.yaml':{App:{Properties:{StartScreen:'=Screen1'}}},'Screen1.pa.yaml':{Screens:{Screen1:{Properties:{},Children:[button('protected_cancel','"Cancel"','SetFocus(protected_cancel)')]}}}});
const candidate=():NativeFiles=>({...base(),[harnessFile]:{Screens:{[harnessScreen]:{Properties:{},Children:[stack('pc_cert_root',[button('pc_cert_local','"Local"','Set(pc_cert_clicked, true)')])]}}}});
const bundle=(files=base(),epoch=id.sessionId,time=now)=>makeSourceBundle(files,{...id,sessionId:epoch},'authoringMcp',[],[],{content:[{type:'text',text:'Synthetic local unit evidence'}]},new Date(time).toISOString());
const owner=()=>ownHarness(base(),candidate(),id,'V4.4 unit fixture');
const ready=()=>{const life=new AuthoringLifecycle(id,semanticSourceHash(base()),()=>now);life.connect(id.sessionId);life.doctorPassed(id.sessionId);life.acquire(bundle());life.checked(true,true);return life;};
const write=(life:AuthoringLifecycle,purpose:'install'|'cleanup',files:NativeFiles)=>life.authorizeWrite({epoch:life.epoch,sourceHash:hashJson(files),candidateHash:semanticSourceHash(purpose==='install'?candidate():base()),purpose});

describe('V4.4 lifecycle and reversible batches',()=>{
 it('starts disconnected and requires same epoch doctor then acquisition',()=>{const l=new AuthoringLifecycle(id,semanticSourceHash(base()),()=>now);expect(l.state).toBe('DISCONNECTED');l.connect('one');expect(()=>l.acquire(bundle(base(),'one'))).toThrow();expect(()=>l.doctorPassed('old')).toThrow();l.connect('recovered');l.doctorPassed('recovered');l.acquire(bundle(base(),'recovered'));expect(l.state).toBe('CONNECTED_CLEAN');});
 it('reconnect invalidates old source and checker authority',()=>{const l=ready();l.connect('epoch-2');expect(()=>l.checked(true,true)).toThrow();l.doctorPassed('epoch-2');expect(()=>l.acquire(bundle())).toThrow();expect(l.state).toBe('BLOCKED');l.connect('epoch-3');l.doctorPassed('epoch-3');l.acquire(bundle(base(),'epoch-3'));l.checked(true,true);expect(l.state).toBe('CONNECTED_VALIDATED');expect(()=>l.connect('epoch-3')).toThrow();});
 it('rejects checkers and writes during preview until reacquisition',()=>{const l=ready();l.beginBatch(owner());l.preview();expect(()=>l.checked(true,true)).toThrow('Reacquire');expect(()=>write(l,'install',base())).toThrow('transition');l.acquire(bundle());l.checked(true,true);write(l,'install',base());});
 it('requires declared additions and restores the protected draft before completion',()=>{const l=ready();expect(()=>write(l,'install',base())).toThrow();l.beginBatch(owner());expect(()=>l.beginBatch(owner())).toThrow();write(l,'install',base());expect(()=>l.completeBatch()).toThrow();l.acquire(bundle(candidate()));l.checked(true,true);write(l,'cleanup',candidate());l.acquire(bundle());l.checked(true,true);l.verifyCleanup();l.completeBatch();expect(l.events.at(-1)?.event).toBe('batch-complete');});
 it('preserves recovery obligation across failed connection and reconnect',()=>{const l=ready();l.beginBatch(owner());write(l,'install',base());l.fail('AUTHORING_REJECTED');expect(l.state).toBe('RECOVERY_REQUIRED');expect(()=>write(l,'cleanup',candidate())).toThrow();l.connect('two');l.doctorPassed('two');l.acquire(bundle(candidate(),'two'));expect(l.state).toBe('RECOVERY_REQUIRED');expect(()=>l.beginBatch(owner())).toThrow();});
 it('source mismatch cannot authorize any follow-on write',()=>{const l=ready();l.beginBatch(owner());write(l,'install',base());expect(()=>l.acquire(bundle())).toThrow('mismatch');expect(l.state).toBe('RECOVERY_REQUIRED');expect(()=>l.checked(true,true)).toThrow();});
 it('cleanup readback permits only known version normalization',()=>{const l=ready();l.acquire(bundle(candidate()));l.adoptRecovery(owner());write(l,'cleanup',candidate());const normalized=base();controls(normalized)[0]!.node.Control+='@1.0';l.acquire(bundle(normalized));l.checked(true,true);l.verifyCleanup();expect(l.events.at(-1)?.temporaryAdditions).toBe(0);});
 it('a failed checker leaves a pending harness in recovery',()=>{const l=ready();l.beginBatch(owner());write(l,'install',base());l.acquire(bundle(candidate()));expect(()=>l.checked(true,false)).toThrow();expect(l.state).toBe('RECOVERY_REQUIRED');});
 it('source-bound evidence records identity epoch state and timestamp',()=>{const l=ready();expect(l.events.at(-1)).toMatchObject({appId:id.appId,environmentId:id.environmentId,epoch:id.sessionId,sourceHash:hashJson(base()),state:'CONNECTED_VALIDATED',at:new Date(now).toISOString()});});
 it('does not accept stale, wrong-app, wrong-hash or malformed inventory acquisition',()=>{for(const mutate of [(b:ReturnType<typeof bundle>)=>{b.snapshot.acquiredAt=new Date(now-900001).toISOString();},(b:ReturnType<typeof bundle>)=>{b.snapshot.identity.appId='11111111-1111-4111-8111-111111111113';},(b:ReturnType<typeof bundle>)=>{b.snapshot.sourceHash='f'.repeat(64);},(b:ReturnType<typeof bundle>)=>{b.snapshot.screenHashes={};}]){const b=bundle();mutate(b);expect(()=>ready().acquire(b)).toThrow();}});
});
describe('source-bound harness recovery',()=>{
 it('plans the exact owned subtree and makes no write',()=>{const p=planHarnessRecovery(bundle(candidate()),base(),owner(),now);expect(p.action).toBe('REMOVE_OWNED_HARNESS');expect(p.expectedControls).toEqual(['pc_cert_local','pc_cert_root']);expect(p.unexpectedControls).toBe(0);expect(p.candidate).toEqual(base());expect(p.remoteWrites).toBe(0);});
 it('is idempotent once already restored',()=>{expect(planHarnessRecovery(bundle(),base(),owner(),now).action).toBe('ALREADY_RESTORED');const l=ready();l.adoptRecovery(owner());expect(()=>write(l,'cleanup',base())).toThrow('already absent');});
 it('never adopts a screen merely because its name matches',()=>{const changed=candidate();controls(changed).find(n=>n.name==='pc_cert_local')!.node.Properties.Text='="Other owner"';expect(()=>planHarnessRecovery(bundle(changed),base(),owner(),now)).toThrow('ownership');});
 it('blocks unexpected business formulas and unexpected screens',()=>{const changed=candidate();controls(changed)[0]!.node.Properties.OnSelect='=false';expect(()=>planHarnessRecovery(bundle(changed),base(),owner(),now)).toThrow('Unexpected');const extra=candidate();extra['Other.pa.yaml']={Screens:{Other:{Properties:{}}}};expect(()=>planHarnessRecovery(bundle(extra),base(),owner(),now)).toThrow('Unexpected');});
 it('requires ownership from the same app and protected hash',()=>{expect(()=>planHarnessRecovery(bundle(candidate()),base(),{...owner(),appId:'11111111-1111-4111-8111-111111111113'},now)).toThrow();expect(()=>planHarnessRecovery(bundle(candidate()),base(),{...owner(),baseHash:'f'.repeat(64)},now)).toThrow();});
 it('will not clean altered harness contents after acquiring recovery ownership',()=>{const l=ready();l.acquire(bundle(candidate()));l.adoptRecovery(owner());const changed=candidate();controls(changed).find(n=>n.name==='pc_cert_local')!.node.Properties.Text='="Unexpected"';l.acquire(bundle(changed));expect(()=>write(l,'cleanup',changed)).toThrow('ownership');});
});
describe('bounded diagnostics',()=>{
 it('classifies 422 without assigning an invented cause or leaking credentials',()=>{const d=authoringFailure('HTTP 422 Signed in as: person@example.test token=secret','connect');expect(d.kind).toBe('AUTHORING_REJECTED');expect(d.cause).toBe('UNDETERMINED');expect(JSON.stringify(d)).not.toMatch(/person@|token=|secret/);expect(d.autoRetry).toBe(false);});
 it.each([['session expired','SESSION_STALE'],['not connected','SESSION_NOT_READY'],['zero-files','SOURCE_EMPTY'],['source mismatch','SOURCE_MISMATCH'],['cleanup required','CLEANUP_REQUIRED'],['unrecognized problem','UNKNOWN']])('classifies %s', (message,kind)=>expect(authoringFailure(message,'sync').kind).toBe(kind));
 it('reports a timed-out write as unknown, never as proof of no mutation',()=>expect(authoringFailure('timeout','compile',true).outcome).toBe('UNKNOWN_UNTIL_ACQUIRED'));
});
describe('production dependency closure',()=>{
 it('traverses shared dependencies once and rejects stale/missing dependencies',()=>{const edges={A:['B','C'],B:['C']};expect(validateDependencyClosure(['A'],edges,new Set(['A','B','C'])).dependencies).toEqual(['A','B','C']);expect(validateDependencyClosure(['A'],edges,new Set(['A','B'])).passed).toBe(false);});
 it('rejects recursive component dependencies',()=>expect(validateDependencyClosure(['A'],{A:['B'],B:['A']},new Set(['A','B'])).failures).toContain('Cycle: A'));
 it('cannot promote caller-supplied certificate objects into production',()=>{const unverified={certificates:[],current:{},confidence:'native'} as CertifiedSelection;expect(()=>restrictCertifiedSelection(unverified,[])).toThrow('verified');expect(()=>selectCoreVariant(unverified,'SideSheet.standard',[{variant:'FullScreenTask.standard',reason:'Mobile task'}])).toThrow('Uncertified');expect(()=>selectCoreVariant(unverified,'RichList.compact')).toThrow('NOT PRODUCTION');expect(()=>buildProductionCore({version:'canvas-production-core-v1',groups:{navigation:['TopNavigation.standard'],data:[],forms:[],overlays:[],commands:[],feedback:[],hierarchy:[]},dependencies:{}},unverified)).toThrow('Uncertified');});
});
describe('core field source contracts (not native proof)',()=>{
 it.each(['text','multiline','number','percentage','boolean','toggle','date','singleChoice'] as const)('%s emits read-only and theme bindings and omits blank helper',type=>{const f=compileField('pc_cert_field',{type,label:'Field',value:type==='singleChoice'?'Table({Value: 1})':'Blank()',items:'Table({Value: 1})',onChange:'false',readOnly:true,helpText:'  '});const nodes=controls({field:f.control}),input=nodes.find(n=>n.name==='pc_cert_field_input')!;expect(input.node.Properties.DisplayMode).toContain('DisplayMode.View');expect(input.node.Properties.BasePaletteColor).toBe('=PF_brand');expect(nodes.some(n=>n.name.endsWith('_help'))).toBe(false);});
 it('preserves a singleChoice record without claiming runtime Form.Updates',()=>{const f=compileField('pc_cert_choice',{type:'singleChoice',label:'Priority',value:'Table({Value: 1})',items:'Table({Value: 1}, {Value: 2})',onChange:'false'});expect(f.value).toBe('pc_cert_choice_input.Selected');expect(f.evidence.nativeValidated).toBe(false);});
});

describe('official compiler transaction boundary with a local fake transport',()=>{
 it.each(['restored','retained-harness','changed-before-write'] as const)('handles %s without assuming successful cleanup',async(mode)=>{
  const root=await mkdtemp(join(tmpdir(),'pc-v44-'));
  if(!resolve(root).startsWith(resolve(tmpdir(),'pc-v44-')))throw new Error('Unexpected temporary path');
  const save=async(dir:string,files:NativeFiles)=>{await mkdir(dir,{recursive:true});for(const [name,data] of Object.entries(files))await writeFile(join(dir,name),stringify(data));};
  let live=base(),compiles=0;
  const call:AuthoringCall=async(name,args)=>{
    if(name==='sync_canvas'){await save(args.directoryPath as string,live);return {content:[{type:'text',text:'Source synchronized'}]};}
    if(name==='compile_canvas'){compiles++;const target=await readNativeSource(args.directoryPath as string);if(mode!=='retained-harness'||compiles===1)live=target;return {content:[{type:'text',text:'Validation PASSED'}]};}
    throw new Error('Unexpected call: '+name);
  };
  try{
    await save(join(root,'candidate'),candidate());await save(join(root,'base'),base());
    const provider=new AuthoringMcpProvider(call,id,[],[]),transaction=new CertificationTransaction(provider,call,base());
    transaction.doctorPassed();const current=await transaction.acquire(join(root,'initial'));transaction.lifecycle.checked(true,true);
    if(mode==='changed-before-write'){
      live=base();controls(live)[0]!.node.Properties.Text='="Changed by editor"';
      await expect(transaction.install(join(root,'candidate'),current,join(root,'installed'),'Test')).rejects.toThrow('changed after planning');expect(compiles).toBe(0);return;
    }
    const installed=await transaction.install(join(root,'candidate'),current,join(root,'installed'),'Test');transaction.lifecycle.checked(true,true);
    if(mode==='retained-harness'){
      await expect(transaction.cleanup(join(root,'base'),installed.readback,join(root,'restored'))).rejects.toThrow('mismatch');expect(transaction.lifecycle.state).toBe('RECOVERY_REQUIRED');expect(()=>transaction.lifecycle.completeBatch()).toThrow();
    }else{
      await transaction.cleanup(join(root,'base'),installed.readback,join(root,'restored'));transaction.lifecycle.checked(true,true);transaction.lifecycle.verifyCleanup();transaction.lifecycle.completeBatch();expect(semanticSourceHash(live)).toBe(semanticSourceHash(base()));expect(compiles).toBe(2);
    }
  }finally{await rm(root,{recursive:true,force:true});}
 });
});
