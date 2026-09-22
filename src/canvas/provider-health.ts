export type ProviderHealth='HEALTHY'|'DEGRADED_READ_ONLY'|'AUTHORING_UNAVAILABLE'|'SESSION_REJECTED'|'RECOVERY_REQUIRED';
export interface ProviderHealthEvidence {readSucceeded:boolean;rejected?:boolean;recoveryRequired?:boolean;doctorPassed?:boolean}
export function providerHealth(provider:'authoringMcp'|'pacDownload',input:ProviderHealthEvidence){
  const health:ProviderHealth=provider==='pacDownload'?(input.readSucceeded?'DEGRADED_READ_ONLY':'AUTHORING_UNAVAILABLE'):input.rejected?'SESSION_REJECTED':input.recoveryRequired?'RECOVERY_REQUIRED':input.readSucceeded&&input.doctorPassed?'HEALTHY':'AUTHORING_UNAVAILABLE';
  return {provider,health,read:input.readSucceeded,writeEligible:provider==='authoringMcp'&&health==='HEALTHY',certificateRevocationRequired:false};
}
