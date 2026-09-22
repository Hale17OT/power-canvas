import {hashJson} from '../core/json.js';
import {redactDiagnostic} from './authoring-health.js';

export interface AuthoringSupportInput {
  generatedAt:string;
  system:Record<string,unknown>;
  studio:Record<string,unknown>;
  comparison:Record<string,unknown>;
  attempts:readonly Record<string,unknown>[];
  recovery:Record<string,unknown>;
  limitations:readonly string[];
}
// Select metadata explicitly. Never recursively attach directories, source, credentials or raw logs.
export function buildAuthoringSupportBundle(input:AuthoringSupportInput){
  if(!Number.isFinite(Date.parse(input.generatedAt)))throw new Error('Support bundle timestamp required');
  const secret=/^(?:authorization|proxy-authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|token|sig|auth[_-]?code)$/i;
  function sanitize(value:unknown,depth=0):unknown{
    if(depth>24)throw new Error('Diagnostic metadata nesting limit exceeded');
    if(typeof value==='string')return redactDiagnostic(value).slice(0,24000);
    if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value;
    if(Array.isArray(value)){if(value.length>1000)throw new Error('Diagnostic array limit exceeded');return value.map(v=>sanitize(v,depth+1));}
    if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype)return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,secret.test(key)?'[REDACTED]':sanitize(v,depth+1)]));
    throw new Error('Support metadata must contain JSON values only');
  }
  const selected={version:'4.5',generatedAt:input.generatedAt,system:input.system,studio:input.studio,comparison:input.comparison,attempts:input.attempts,recovery:input.recovery,limitations:input.limitations};
  const metadata=sanitize(selected) as typeof selected;
  return {...metadata,sanitized:true as const,rawLogsIncluded:false as const,businessSourceIncluded:false as const,metadataHash:hashJson(metadata as never)};
}
