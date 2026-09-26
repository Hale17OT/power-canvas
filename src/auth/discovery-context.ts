import {randomUUID} from 'node:crypto';
import {hashJson} from '../core/json.js';
import type {StoredProfile} from './profiles.js';
import type {EnvironmentBinding} from './environments.js';
import type {TokenSource,CredentialGrant} from './msal.js';
import {CredentialError,type CredentialAuditOptions,type CredentialRequest,type CredentialEvent} from './credential-audit.js';

const discoveryOrigin='https://globaldisco.crm.dynamics.com';
/** Short-lived read-only cycle context. Grants are private runtime memory, never evidence. */
export class DiscoveryCredentialContext implements TokenSource {
 #grants=new Map<string,CredentialGrant&{obtainedAt:number}>();
 #inflight=new Map<string,Promise<CredentialGrant>>();
 #invalid=false;
 #operatorBoundary:CredentialError|undefined;
 #principal:string|undefined;
 #bindingHash:string;
 constructor(private readonly profile:StoredProfile,private readonly binding:EnvironmentBinding,private readonly acquire:(origin:string,request:CredentialRequest,forceRefresh:boolean)=>Promise<CredentialGrant>,private readonly options:CredentialAuditOptions,private readonly now:()=>number=Date.now){
  this.#bindingHash=this.identityHash();
  if(profile.alias!==binding.authProfile||profile.tenantId!==binding.target.tenantId||!profile.allowedEnvironmentIds.includes(binding.target.environmentId))this.rejectIdentity();
 }
 private identityHash(){return hashJson({profile:this.profile,binding:this.binding});}
 private rejectIdentity():never{this.invalidate();throw new CredentialError({state:'AUTH_CONTEXT_MISMATCH',stage:'identityValidation',errorClass:'PowerCanvasError',interactionRequired:false},'PF-AUTH-005');}
 private checkBinding(origin?:string){if(this.#invalid||this.identityHash()!==this.#bindingHash||origin&&origin!==discoveryOrigin&&origin!==this.binding.target.dataverseUrl)this.rejectIdentity();}
 bindPrincipal(principal:string,expected?:string){if(expected&&principal.toLowerCase()!==expected.toLowerCase()||this.#principal&&this.#principal!==principal.toLowerCase())this.rejectIdentity();this.#principal=principal.toLowerCase();}
 invalidate(){this.#invalid=true;this.#grants.clear();this.#inflight.clear();}
 private async event(origin:string,request:CredentialRequest,mode:'context-reuse'|'single-flight',grant?:CredentialGrant){
  const now=this.now();const event:CredentialEvent={eventId:randomUUID(),acquisitionId:request.requestId,cycleId:this.options.cycleId,requestId:request.requestId,attempt:request.attempt,profile:this.profile.alias,environment:this.options.environment,audience:origin,startedAt:new Date(now).toISOString(),finishedAt:new Date(now).toISOString(),elapsedMs:0,kind:'context',result:'SUCCESS',mode,...(grant?{expiresInBucket:grant.expiresAt-now>1800000?'>30m':grant.expiresAt-now>=300000?'5–30m':'<5m'}:{})};
  await this.options.audit(event);
 }
 async token(origin:string,request:CredentialRequest={requestId:randomUUID(),attempt:1}):Promise<string>{
  this.checkBinding(origin);if(this.#operatorBoundary)throw this.#operatorBoundary;const cached=this.#grants.get(origin),now=this.now();
  if(cached&&cached.expiresAt-now>60000&&(cached.refreshAt===undefined||cached.refreshAt>now)&&now-cached.obtainedAt<300000){await this.event(origin,request,'context-reuse',cached);this.checkBinding(origin);return cached.value;}
  const previous=this.#inflight.get(origin);
  if(previous){const grant=await previous;this.checkBinding(origin);await this.event(origin,request,'single-flight',grant);this.checkBinding(origin);return grant.value;}
  const forceRefresh=!!cached&&(cached.expiresAt-now<=60000||cached.refreshAt!==undefined&&cached.refreshAt<=now);
  // Store the promise synchronously before another sibling can request the same audience.
  const pending=Promise.resolve().then(()=>this.acquire(origin,request,forceRefresh)).then(grant=>{
   this.checkBinding(origin);
   if(grant.tenantId!==this.profile.tenantId||grant.accountId!==this.profile.homeAccountId||grant.expiresAt<=this.now())this.rejectIdentity();
   this.#grants.set(origin,{...grant,obtainedAt:this.now()});return grant;
  });
  this.#inflight.set(origin,pending);
  try{return (await pending).value;}catch(error){
   // These states stop this cycle. A later explicitly started cycle can acquire again.
   if(error instanceof CredentialError&&['AUTH_INTERACTION_REQUIRED','AUTH_CONSENT_REQUIRED','AUTH_ACCOUNT_NOT_FOUND'].includes(error.credentialFailure.state)){this.#operatorBoundary=error;this.#grants.clear();}
   throw error;
  }finally{if(this.#inflight.get(origin)===pending)this.#inflight.delete(origin);}
 }
 async initialize(){await this.token(this.binding.target.dataverseUrl);await this.token(discoveryOrigin);}
}
