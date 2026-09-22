import { hashJson } from '../core/json.js';
import { studioIdentity,assertFreshSource,type SourceBundle } from './source-provider.js';
import { semanticSourceHash } from './authoring-lifecycle.js';
export {providerHealth,type ProviderHealth} from './provider-health.js';

/** Public diagnostic text only. Raw transport/authentication logs are never persisted. */
export function redactDiagnostic(text:string):string{
  return text
    .replace(/(["'](?:authorization|proxy-authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|token|sig|auth[_-]?code)["']\s*:\s*)(?:"[^"\r\n]*"|'[^'\r\n]*')/gi,'$1"[REDACTED]"')
    .replace(/(authorization|proxy-authorization|cookie|set-cookie)\s*:\s*[^\r\n]*/gi,'$1: [REDACTED]')
    .replace(/\bBearer\s+[^\s"'<>]+/gi,'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[REDACTED_JWT]')
    .replace(/((?:access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|token|sig|auth[_-]?code)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi,'$1[REDACTED]')
    .replace(/https?:\/\/[^\s<>"']+/gi,url=>{try{const u=new URL(url);u.username='';u.password='';for(const key of [...u.searchParams.keys()])u.searchParams.set(key,'[REDACTED]');u.hash='';return u.toString();}catch{return '[REDACTED_URL]';}})
    .replace(/([?&](?:code|state|token|sig|session_state)=)[^\s&#"']+/gi,'$1[REDACTED]');
}
export function sanitizedHttpEvidence(text:string){
  const headers:Record<string,string>={};
  for(const line of text.split(/\r?\n/)){const m=line.match(/^\s*(request-id|x-ms-request-id|x-ms-correlation-request-id|client-request-id|traceparent|date|retry-after)\s*:\s*(.+)$/i);if(m)headers[m[1]!.toLowerCase()]=redactDiagnostic(m[2]!);}
  return {sanitizedResponse:redactDiagnostic(text).slice(0,24000),responseHash:hashJson(text),headers,
    requestIds:[...text.matchAll(/(?:request[ -]?id|correlation[ -]?id|SessionId)\s*[=:]\s*["']?([a-f0-9-]{36})/gi)].map(m=>m[1]!),
    httpStatus:Number(text.match(/HTTP(?:\s+status:)?\s+(\d{3})/i)?.[1])||null,
    endpointClassification:'Official Canvas MCP connect/session resolution; exact HTTP endpoint not exposed unless included in response',
    httpHeadersExposed:Object.keys(headers).length>0,rawHttpCapture:false};
}
export function studioUrlMetadata(raw:string){
  const identity=studioIdentity(raw),u=new URL(raw);
  if(!/^(?:\/providers\/Microsoft\.PowerApps\/apps\/)?[a-f0-9-]{36}$/i.test(u.searchParams.get('app-id')??''))throw new Error('Unrecognized app-id URL shape');
  const query=Object.fromEntries([...u.searchParams].map(([k,v])=>[k,['action','app-id'].includes(k)?v:{redacted:true,sha256:hashJson(v)}]));
  return {...identity,origin:u.origin,path:u.pathname,query,fragmentPresent:!!u.hash,urlHash:hashJson(raw),
    cluster:'NOT A SEPARATE PARAMETER IN CURRENT OFFICIAL CONNECT CONTRACT',tenantContext:'Not inferred from URL',
    redactedUrl:u.origin+u.pathname+'?'+[...u.searchParams].map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(['action','app-id'].includes(k)?v:'[REDACTED]')}`).join('&')};
}
export const ladderStages=['MCP_STARTED','AUTHENTICATED','STUDIO_SESSION_RESOLVED','CONTROL_DISCOVERY_READY','CONTROL_DESCRIPTION_READY','API_DISCOVERY_READY','DATA_SOURCE_DISCOVERY_READY','SOURCE_SYNC_READY'] as const;
export type LadderStage=typeof ladderStages[number];
export type LadderResult={stage:LadderStage;status:'PASS'|'FAIL'|'NOT_REACHED'|'UNPROVEN';detail:string};
export class CapabilityLadder{
  readonly results:LadderResult[]=ladderStages.map(stage=>({stage,status:'NOT_REACHED',detail:''}));
  record(stage:LadderStage,status:'PASS'|'FAIL'|'UNPROVEN',detail:string){
    const i=ladderStages.indexOf(stage);
    if(this.results.slice(0,i).some(r=>r.status==='FAIL'||r.status==='NOT_REACHED'))throw new Error('Capability ladder cannot skip a failed/unreached layer');
    if(this.results[i]!.status!=='NOT_REACHED')throw new Error('Capability layer already recorded');
    this.results[i]={stage,status,detail:redactDiagnostic(detail)};
  }
}
export function reconnectStability(cycles:readonly {source:SourceBundle;doctorPassed:boolean;controlsPassed:boolean}[],expected:{appId:string;environmentId:string;semanticHash:string},now=Date.now()){
  const seen=new Set<string>();
  const results=cycles.map(c=>{const id=c.source.snapshot.identity;let fresh=true;try{assertFreshSource(c.source,id,now);}catch{fresh=false;}
    const unique=!seen.has(id.sessionId);seen.add(id.sessionId);
    return {epoch:id.sessionId,passed:fresh&&unique&&c.source.snapshot.mode==='authoringMcp'&&id.appId===expected.appId&&id.environmentId===expected.environmentId&&c.doctorPassed&&c.controlsPassed&&semanticSourceHash(c.source.files)===expected.semanticHash};});
  return {required:3,passed:results.filter(c=>c.passed).length,accepted:results.length===3&&results.every(c=>c.passed),results};
}
