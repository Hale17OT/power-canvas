import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hashJson } from '../core/json.js';
import { controls } from './taste/audit.js';
import { harnessFile, harnessScreen, validateHarnessCandidate } from './certification-harness.js';
import type { NativeFiles } from './native-types.js';
import type { SourceBundle, SourceIdentity } from './source-provider.js';
import type { AuthoringFailureKind } from './authoring-diagnostics.js';
import { assertFreshSource } from './source-provider.js';

export const authoringStates=['DISCONNECTED','CONNECTED_CLEAN','CONNECTED_UNSAVED_SOURCE','CONNECTED_VALIDATED','CONNECTED_RUNTIME_PREVIEW','RECONNECT_REQUIRED','RECOVERY_REQUIRED','BLOCKED'] as const;
export type AuthoringState=typeof authoringStates[number];
export const semanticSourceHash=(files:NativeFiles)=>{
  const copy=structuredClone(files);
  // The sole normalization is the known provider dialect's Control@version suffix.
  // Properties, formulas and child order remain significant.
  for(const n of controls(copy))n.node.Control=n.node.Control!.split('@')[0]!;
  return hashJson(copy);
};
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const harnessOwnershipSchema=z.strictObject({
  version:z.literal('4.4'),owner:z.literal('PowerCanvasCertification'),purpose:z.string().min(1),ephemeral:z.literal(true),
  appId:z.uuid(),environmentId:z.string().min(1),baseHash:digest,candidateHash:digest,
  file:z.literal(harnessFile),screen:z.literal(harnessScreen),subtreeHash:digest,controls:z.array(z.string()).min(1),
});
export type HarnessOwnership=z.infer<typeof harnessOwnershipSchema>;
export function ownHarness(base:NativeFiles,candidate:NativeFiles,identity:Pick<SourceIdentity,'appId'|'environmentId'>,purpose:string):HarnessOwnership{
  validateHarnessCandidate(base,candidate);
  return harnessOwnershipSchema.parse({version:'4.4',owner:'PowerCanvasCertification',purpose,ephemeral:true,appId:identity.appId,environmentId:identity.environmentId,baseHash:semanticSourceHash(base),candidateHash:semanticSourceHash(candidate),file:harnessFile,screen:harnessScreen,subtreeHash:semanticSourceHash({[harnessFile]:candidate[harnessFile]!}),controls:controls({[harnessFile]:candidate[harnessFile]!}).map(n=>n.name).sort()});
}
/** A recovery plan never mutates. A familiar name is not ownership proof. */
export function planHarnessRecovery(current:SourceBundle,base:NativeFiles,rawOwnership:unknown,now=Date.now()){
  const owner=harnessOwnershipSchema.parse(rawOwnership),id=current.snapshot.identity;
  assertFreshSource(current,id,now);
  if(current.snapshot.mode!=='authoringMcp'||id.appId!==owner.appId||id.environmentId!==owner.environmentId||current.snapshot.sourceHash!==hashJson(current.files))throw new Error('Recovery identity/source mismatch');
  if(now-Date.parse(current.snapshot.acquiredAt)>15*60_000||Date.parse(current.snapshot.acquiredAt)>now)throw new Error('Fresh recovery acquisition required');
  if(semanticSourceHash(base)!==owner.baseHash)throw new Error('Protected draft mismatch');
  const without=structuredClone(current.files);delete without[owner.file];
  if(semanticSourceHash(without)!==owner.baseHash)throw new Error('Unexpected protected source/screen/control change; recovery blocked');
  const present=Object.hasOwn(current.files,owner.file);
  if(present){
    const subtree={[owner.file]:current.files[owner.file]!};
    if(semanticSourceHash(subtree)!==owner.subtreeHash||hashJson(controls(subtree).map(n=>n.name).sort())!==hashJson(owner.controls))throw new Error('Unexpected harness controls/source; ownership is not proven');
  }
  return {version:'4.4',epoch:id.sessionId,appId:id.appId,environmentId:id.environmentId,sourceHash:current.snapshot.sourceHash,sourceSemanticHash:semanticSourceHash(current.files),protectedHash:owner.baseHash,createdAt:new Date(now).toISOString(),action:present?'REMOVE_OWNED_HARNESS':'ALREADY_RESTORED',temporaryAdditions:present?[owner.screen]:[],expectedControls:present?owner.controls:[],unexpectedControls:0,candidate:without,remoteWrites:0,save:false,publish:false};
}

/** In-memory authority is issued only after fresh acquisition in the current epoch.
 * Serialized evidence is an audit trail, never a deserializable write permission. */
export class AuthoringLifecycle {
  private stateValue:AuthoringState='DISCONNECTED';
  private epochValue='';
  private connected=false;
  private doctor=false;
  private source:SourceBundle|undefined;
  private expectedHash:string|undefined;
  private owned:HarnessOwnership|undefined;
  private batch:string|undefined;
  private cleanupVerified=false;
  readonly events:Record<string,unknown>[]=[];
  constructor(readonly identity:Pick<SourceIdentity,'appId'|'environmentId'>,readonly protectedHash:string,private readonly clock=()=>Date.now()){}
  get state(){return this.stateValue;}
  get epoch(){return this.epochValue;}
  private record(event:string,extra:Record<string,unknown>={}){const e={event,...this.identity,epoch:this.epochValue,sourceHash:this.source?.snapshot.sourceHash??null,state:this.stateValue,at:new Date(this.clock()).toISOString(),...extra};this.events.push(e);return e;}
  connect(epoch:string=randomUUID()){
    if(epoch===this.epochValue)throw new Error('Reconnect requires a new epoch');
    this.epochValue=epoch;this.connected=true;this.doctor=false;this.source=undefined;this.expectedHash=undefined;this.stateValue='RECONNECT_REQUIRED';return this.record('connected-reacquisition-required');
  }
  doctorPassed(epoch:string){if(!this.connected||epoch!==this.epochValue)throw new Error('Doctor belongs to another connection epoch');this.doctor=true;return this.record('doctor-prerequisites-passed');}
  acquire(bundle:SourceBundle){
    try{
    const s=bundle.snapshot;
    assertFreshSource(bundle,{...this.identity,sessionId:this.epochValue},this.clock());
    if(!this.connected||!this.doctor||s.identity.sessionId!==this.epochValue||s.identity.appId!==this.identity.appId||s.identity.environmentId!==this.identity.environmentId||s.mode!=='authoringMcp'||s.sourceHash!==hashJson(bundle.files))throw new Error('Fresh same-epoch authoring source required');
    if(this.clock()-Date.parse(s.acquiredAt)>15*60_000||Date.parse(s.acquiredAt)>this.clock())throw new Error('Source acquisition expired');
    this.source=structuredClone(bundle);
    if(this.expectedHash&&semanticSourceHash(bundle.files)!==this.expectedHash){this.fail('SOURCE_MISMATCH');throw new Error('Semantic candidate readback mismatch; recovery required');}
    this.expectedHash=undefined;
    this.stateValue=this.owned?'RECOVERY_REQUIRED':semanticSourceHash(bundle.files)===this.protectedHash?'CONNECTED_CLEAN':'CONNECTED_UNSAVED_SOURCE';
    return this.record('source-acquired');
    }catch(error){this.fail('SOURCE_MISMATCH');throw error;}
  }
  checked(appCheckerPassed:boolean,accessibilityAccepted:boolean){
    if(this.stateValue==='CONNECTED_RUNTIME_PREVIEW')throw new Error('Reacquire source after runtime preview');
    this.fresh();if(!appCheckerPassed||!accessibilityAccepted){this.fail('AUTHORING_REJECTED');throw new Error('Source-bound checkers did not pass');}
    this.stateValue='CONNECTED_VALIDATED';return this.record('validated');
  }
  private fresh(){
    if(!this.connected||!this.doctor||!this.source||this.source.snapshot.identity.sessionId!==this.epochValue||this.clock()-Date.parse(this.source.snapshot.acquiredAt)>15*60_000)throw new Error('Reacquire source in the current healthy epoch');
    return this.source;
  }
  beginBatch(owner:HarnessOwnership){
    const source=this.fresh();owner=harnessOwnershipSchema.parse(owner);
    if(this.stateValue!=='CONNECTED_VALIDATED'||this.owned||this.batch||owner.appId!==this.identity.appId||owner.environmentId!==this.identity.environmentId||owner.baseHash!==this.protectedHash||semanticSourceHash(source.files)!==this.protectedHash)throw new Error('Restore protected draft before starting a batch');
    this.owned=owner;this.batch=randomUUID();this.cleanupVerified=false;return this.record('batch-planned',{batch:this.batch,ownership:owner});
  }
  adoptRecovery(owner:HarnessOwnership){
    owner=harnessOwnershipSchema.parse(owner);
    // Explicit V4.3 journal-derived ownership is verified against the acquired subtree, never inferred by name.
    const source=this.fresh();planHarnessRecovery(source,source.files[owner.file]?Object.fromEntries(Object.entries(source.files).filter(([f])=>f!==owner.file)):source.files,owner,this.clock());
    if(owner.baseHash!==this.protectedHash)throw new Error('Recovery protected hash mismatch');
    this.owned=harnessOwnershipSchema.parse(owner);this.stateValue='RECOVERY_REQUIRED';return this.record('recovery-ownership-proven');
  }
  authorizeWrite(plan:{epoch:string;sourceHash:string;candidateHash:string;purpose:'install'|'cleanup'}){
    const source=this.fresh();
    if(this.stateValue==='CONNECTED_RUNTIME_PREVIEW'||this.stateValue==='BLOCKED'||plan.epoch!==this.epochValue||plan.sourceHash!==source.snapshot.sourceHash||!this.owned)throw new Error('Invalid authoring write transition');
    if(plan.purpose==='install'&&(this.stateValue!=='CONNECTED_VALIDATED'||plan.candidateHash!==this.owned.candidateHash))throw new Error('Unreviewed harness candidate');
    if(plan.purpose==='cleanup'){
      if(plan.candidateHash!==this.protectedHash)throw new Error('Cleanup target differs from protected draft');
      const base=structuredClone(source.files);delete base[this.owned.file];
      const recovery=planHarnessRecovery(source,base,this.owned,this.clock());
      if(recovery.action==='ALREADY_RESTORED')throw new Error('Harness already absent; cleanup must not write again');
    }
    this.expectedHash=plan.candidateHash;this.stateValue='CONNECTED_UNSAVED_SOURCE';this.source=undefined;return this.record('write-started',{...plan,batch:this.batch??null});
  }
  preview(){this.fresh();if(this.stateValue!=='CONNECTED_VALIDATED')throw new Error('Validate current source before runtime preview');this.stateValue='CONNECTED_RUNTIME_PREVIEW';return this.record('runtime-preview');}
  verifyCleanup(){
    const source=this.fresh();if(this.stateValue!=='CONNECTED_VALIDATED'||Object.hasOwn(source.files,harnessFile)||semanticSourceHash(source.files)!==this.protectedHash)throw new Error('Cleanup is not verified');
    this.owned=undefined;this.cleanupVerified=true;return this.record('cleanup-verified',{temporaryAdditions:0});
  }
  completeBatch(){if(!this.batch||!this.cleanupVerified||this.owned)throw new Error('Batch remains incomplete until cleanup is verified');const batch=this.batch;this.batch=undefined;return this.record('batch-complete',{batch});}
  fail(kind:AuthoringFailureKind){this.connected=false;this.doctor=false;this.source=undefined;this.stateValue=this.owned?'RECOVERY_REQUIRED':'BLOCKED';return this.record('failure',{kind,cleanupRequired:!!this.owned});}
  disconnect(){this.connected=false;this.doctor=false;this.source=undefined;this.stateValue=this.owned?'RECOVERY_REQUIRED':'DISCONNECTED';return this.record('disconnected');}
}
