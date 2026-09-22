import { resolve } from 'node:path';
import { AuthoringLifecycle, ownHarness, planHarnessRecovery, semanticSourceHash, type HarnessOwnership } from './authoring-lifecycle.js';
import { AuthoringMcpProvider, readNativeSource, type AuthoringCall, type SourceBundle } from './source-provider.js';
import { compileSucceeded } from './authoring-result.js';
import type { NativeFiles } from './native-types.js';
import { authoringFailure } from './authoring-diagnostics.js';

/** A reversible workflow around the existing official compiler, not an atomic transaction.
 * Caller supplies checker evidence only for the returned acquisition and saves the event journal.
 * No retry, save, publish, or automatic ownership inference is performed here. */
export class CertificationTransaction {
  readonly lifecycle:AuthoringLifecycle;
  private owner:HarnessOwnership|undefined;
  constructor(private readonly provider:AuthoringMcpProvider,private readonly call:AuthoringCall,private readonly protectedSource:NativeFiles){
    this.lifecycle=new AuthoringLifecycle(provider.identity,semanticSourceHash(protectedSource));
    this.lifecycle.connect(provider.identity.sessionId);
  }
  async acquire(directory:string){
    try{const bundle=await this.provider.read(directory);this.lifecycle.acquire(bundle);return bundle;}
    catch(error){this.lifecycle.fail(authoringFailure(String(error),'sync').kind);throw error;}
  }
  /** Must follow the same session's successful discovery/doctor prerequisite checks. */
  doctorPassed(){this.lifecycle.doctorPassed(this.provider.identity.sessionId);}
  async install(candidateDirectory:string,current:SourceBundle,readbackDirectory:string,purpose:string){
    const candidate=await readNativeSource(candidateDirectory);
    this.owner=ownHarness(this.protectedSource,candidate,this.provider.identity,purpose);
    this.lifecycle.beginBatch(this.owner);
    return this.write(candidateDirectory,current,readbackDirectory,'install');
  }
  adoptRecovery(owner:HarnessOwnership){this.lifecycle.adoptRecovery(owner);this.owner=owner;}
  recoveryPlan(current:SourceBundle){if(!this.owner)throw new Error('Explicit ownership required');return planHarnessRecovery(current,this.protectedSource,this.owner);}
  async cleanup(baseDirectory:string,current:SourceBundle,readbackDirectory:string){
    const plan=this.recoveryPlan(current);
    if(semanticSourceHash(await readNativeSource(baseDirectory))!==plan.protectedHash)throw new Error('Cleanup source differs from protected draft');
    if(plan.action==='ALREADY_RESTORED')return {alreadyRestored:true,readback:current,compileAttempts:0};
    return this.write(baseDirectory,current,readbackDirectory,'cleanup');
  }
  private async write(directory:string,current:SourceBundle,readbackDirectory:string,purpose:'install'|'cleanup'){
    const candidate=await readNativeSource(directory);
    const validated=this.lifecycle.state==='CONNECTED_VALIDATED';
    const preflight=await this.acquire(readbackDirectory+'-preflight');
    if(preflight.snapshot.sourceHash!==current.snapshot.sourceHash){this.lifecycle.fail('SOURCE_MISMATCH');throw new Error('Studio changed after planning');}
    if(validated)this.lifecycle.checked(true,true); // identical source; same-epoch checker results remain applicable
    this.lifecycle.authorizeWrite({epoch:preflight.snapshot.identity.sessionId,sourceHash:preflight.snapshot.sourceHash,candidateHash:semanticSourceHash(candidate),purpose});
    try{
      const result=await this.call('compile_canvas',{directoryPath:resolve(directory)});
      // Even a failed compiler can have changed the draft. Read back before reporting failure.
      const readback=await this.acquire(readbackDirectory);
      if(!compileSucceeded(result)){this.lifecycle.fail('AUTHORING_REJECTED');throw new Error('Compile failed; acquired source retained for recovery');}
      return {alreadyRestored:false,result,readback,compileAttempts:1};
    }catch(error){this.lifecycle.fail('CLEANUP_REQUIRED');throw error;}
  }
}
