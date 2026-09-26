import {PowerCanvasError,type ErrorCode} from '../core/errors.js';

export type CredentialState='AUTH_CACHE_HIT'|'AUTH_SILENT_SUCCESS'|'AUTH_SILENT_REFRESH_SUCCESS'|'AUTH_INTERACTION_REQUIRED'|'AUTH_CONSENT_REQUIRED'|'AUTH_ACCOUNT_NOT_FOUND'|'AUTH_CACHE_UNAVAILABLE'|'AUTH_PROVIDER_FAILURE'|'AUTH_UNKNOWN'|'AUTH_CONTEXT_MISMATCH'|'AUTH_CONFIGURATION_ERROR';
export type CredentialStage='initialization'|'accountLookup'|'silentAcquisition'|'identityValidation';
export interface SafeCredentialFailure {
 state:CredentialState;stage:CredentialStage;errorClass:string;safeErrorCode?:string;msalErrorCode?:string;suberror?:string;correlationId?:string;aadsts?:string;interactionRequired:boolean;
}
export interface CredentialEvent {
 eventId:string;acquisitionId:string;cycleId:string;requestId:string;attempt:number;profile:string;environment:string;audience:string;
 startedAt:string;finishedAt?:string;elapsedMs?:number;kind:'provider'|'context'|'initialization';result:'STARTED'|'SUCCESS'|'FAILED';
 mode:'cache'|'silent'|'silent-refresh'|'context-reuse'|'single-flight'|'unknown';state?:CredentialState;stage?:CredentialStage;failure?:SafeCredentialFailure;
 activeProviderCalls?:number;expiresInBucket?:'>30m'|'5–30m'|'<5m';correlationId?:string;accountFound?:boolean;cacheProviderAccessible?:boolean;profileStoreExists?:boolean;profileEntryExists?:boolean;
}
export interface CredentialAuditOptions {cycleId:string;environment:string;audit:(event:CredentialEvent)=>void|Promise<void>;mode?:'observe'|'cycle'}
export interface CredentialRequest {requestId:string;attempt:number}
const names=new Set(['AuthError','ClientAuthError','ClientConfigurationError','InteractionRequiredAuthError','ServerError','CacheError','PersistenceError','Error','TypeError','PowerCanvasError']);
const codes=new Set(['interaction_required','consent_required','login_required','no_account_in_silent_request','no_tokens_found','token_refresh_required','refresh_token_expired','invalid_grant','temporarily_unavailable','server_error','endpoints_resolution_error','network_error','no_network_connectivity','post_request_failed','get_request_failed','cache_error','cache_parse_error','cache_plugin_error','invalid_cache_environment','unable_to_load_persistence','unable_to_save_persistence','persistence_not_found','lock_not_acquired','lock_timeout','file_lock_error','permission_denied','EACCES','EPERM','ENOENT','EBUSY','EEXIST','ECONNRESET','ETIMEDOUT','GnomeKeyringError','KeychainError','DPAPIEncryptedFileError','CrossPlatformLockError','CachePersistenceError','NotSupportedError','PersistenceNotVerifiedError','PersistenceNotValidatedError','server_unavailable','unknown_error']);
const suberrors=new Set(['basic_action','additional_action','message_only','consent_required','user_password_expired','bad_token','token_expired','protection_policy_required']);
const guid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function normalizeCredentialError(error:unknown,stage:CredentialStage):SafeCredentialFailure{
 if(error instanceof CredentialError)return error.credentialFailure;
 const e=error&&typeof error==='object'?error as Record<string,unknown>:{};
 const name=typeof e.name==='string'&&names.has(e.name)?e.name:'UnrecognizedError';
 const rawCode=e.errorCode??e.code;const code=typeof rawCode==='string'&&codes.has(rawCode)?rawCode:undefined;
 const suberror=typeof e.subError==='string'&&suberrors.has(e.subError)?e.subError:undefined;
 const state:CredentialState=code==='consent_required'||suberror==='consent_required'?'AUTH_CONSENT_REQUIRED':name==='InteractionRequiredAuthError'||['interaction_required','login_required'].includes(code??'')?'AUTH_INTERACTION_REQUIRED':code==='no_account_in_silent_request'?'AUTH_ACCOUNT_NOT_FOUND':name==='PersistenceError'||name==='CacheError'||stage==='accountLookup'&&!!code||['EACCES','EPERM','EBUSY','ENOENT','EEXIST','cache_error','cache_plugin_error','DPAPIEncryptedFileError','CrossPlatformLockError','CachePersistenceError','KeychainError','GnomeKeyringError'].includes(code??'')||error instanceof PowerCanvasError&&error.code==='PF-AUTH-004'?'AUTH_CACHE_UNAVAILABLE':error instanceof PowerCanvasError&&error.code==='PF-AUTH-005'?'AUTH_CONTEXT_MISMATCH':error instanceof PowerCanvasError&&['PF-AUTH-001','PF-AUTH-002'].includes(error.code)?'AUTH_CONFIGURATION_ERROR':code||name!=='UnrecognizedError'?'AUTH_PROVIDER_FAILURE':'AUTH_UNKNOWN';
 const aadsts=typeof e.message==='string'?e.message.match(/\bAADSTS[0-9]{4,10}\b/)?.[0]:undefined;
 return {state,stage,errorClass:name,...(error instanceof PowerCanvasError?{safeErrorCode:error.code}:{}),...(code?{msalErrorCode:code}:{}),...(suberror?{suberror}:{}),...(guid(e.correlationId)?{correlationId:e.correlationId}:{}),...(aadsts?{aadsts}:{}),interactionRequired:state==='AUTH_INTERACTION_REQUIRED'||state==='AUTH_CONSENT_REQUIRED'};
}
export class CredentialError extends PowerCanvasError {
 constructor(readonly credentialFailure:SafeCredentialFailure,code:ErrorCode='PF-AUTH-006'){
  super(code,`Credential acquisition stopped: ${credentialFailure.state} at ${credentialFailure.stage} (${credentialFailure.errorClass}${credentialFailure.msalErrorCode?'; '+credentialFailure.msalErrorCode:''}${credentialFailure.aadsts?'; '+credentialFailure.aadsts:''}).`,'Inspect the sanitized credential event. Do not recreate profiles, switch accounts or retry silently without a diagnosed cause; interaction requires explicit operator action.');
 }
}
export function credentialHealth(events:readonly CredentialEvent[]){
 const providers=events.filter(e=>e.kind==='provider'),finished=providers.filter(e=>e.result!=='STARTED'),failures=events.filter(e=>e.result==='FAILED');
 const incomplete=providers.filter(e=>e.result==='STARTED'&&!finished.some(f=>f.acquisitionId===e.acquisitionId));
 const statuses=failures.map(f=>f.failure?.state);
 const status=statuses.includes('AUTH_CONSENT_REQUIRED')?'AUTH_CONSENT_REQUIRED':statuses.includes('AUTH_INTERACTION_REQUIRED')?'AUTH_INTERACTION_REQUIRED':statuses.includes('AUTH_ACCOUNT_NOT_FOUND')?'AUTH_ACCOUNT_NOT_FOUND':failures.length||incomplete.length?'AUTH_UNSTABLE':finished.length?'AUTH_HEALTHY':'AUTH_UNKNOWN';
 return {status,providerCalls:providers.filter(e=>e.result==='STARTED').length,maxProviderConcurrency:Math.max(0,...providers.map(e=>e.activeProviderCalls??0)),cacheHits:finished.filter(e=>e.state==='AUTH_CACHE_HIT').length,silentSuccesses:finished.filter(e=>e.state==='AUTH_SILENT_SUCCESS').length,silentRefreshSuccesses:finished.filter(e=>e.state==='AUTH_SILENT_REFRESH_SUCCESS').length,refreshAttempts:'Not independently observable from MSAL; only completed result.fromCache is classified',contextReuses:events.filter(e=>e.kind==='context'&&e.mode==='context-reuse'&&e.result==='SUCCESS').length,singleFlightWaiters:events.filter(e=>e.kind==='context'&&e.mode==='single-flight').length,failures:failures.length,incomplete:incomplete.length,authRetries:0,failureStates:statuses};
}
