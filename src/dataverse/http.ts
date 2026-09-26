import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { TokenSource } from '../auth/msal.js';
import { PowerCanvasError } from '../core/errors.js';
import { redactText } from '../core/logging.js';
import {cancellableDelay,classifyTransport,correlationHeaders,exceptionType,requestShape,retryAfter,retryClassification,type FailurePhase,type RequestAudit,type TransportFailure,type TransportOptions} from './transport.js';

export class ApiError extends PowerCanvasError {
  constructor(readonly status: number, readonly requestId: string, readonly uncertain: boolean, diagnostic?: { code: string; message: string }, readonly transportEvidence?:RequestAudit) {
    super('PF-DV-001', `Microsoft API request failed (${status || 'transport failure'}). Correlation: ${requestId}.${transportEvidence?` ${transportEvidence.category} ${transportEvidence.pathTemplate}; ${transportEvidence.retryClassification}; attempt ${transportEvidence.attempt}.`:''}${diagnostic ? ` Service ${diagnostic.code}: ${redactText(diagnostic.message).slice(0, 600)}` : ''}`,
      status === 401 ? 'Renew the selected authentication profile.' : status === 403 ? 'Check the selected identity permissions; no automatic privilege grants are made.' :
        uncertain ? 'The write outcome is unknown. Inspect the journal and rediscover before retrying.' : 'Inspect target readiness and retry after resolving the service error.');
  }
}
export class DataverseHttp {
  readonly audit:RequestAudit[]=[];
  constructor(readonly base: string, private readonly credentials: TokenSource, private readonly transport: typeof fetch = fetch, private readonly options:TransportOptions={}) {}
  private async record(entry:RequestAudit){this.audit.push(entry);await this.options.audit?.(entry);}
  async request(path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}, pageIndex=1): Promise<{ data: unknown; requestId: string; remoteId?: string }> {
    const url = new URL(path, this.base);
    const base = new URL(this.base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.username || url.password || url.hash) {
      throw new PowerCanvasError('PF-ENV-001', 'API URL escaped the verified service boundary.', 'Use only same-origin documented service paths.');
    }
    if(this.options.readOnly&&method!=='GET')throw new PowerCanvasError('PF-SAFETY-006','Transport doctor and certification preflight allow GET only.','No remote mutation was attempted.');
    const requestId = randomUUID(),shape=requestShape(url),safeRead=method==='GET'&&shape.discovery;
    let totalDelay=0;
    for (let attempt = 1; attempt<=3; attempt++) {
      const start=Date.now();
      const entry:RequestAudit={requestId,method,category:shape.category,pathTemplate:shape.pathTemplate,query:shape.query,requestShapeHash:shape.requestShapeHash,pageIndex,continuation:shape.query.continuation,attempt,startedAt:new Date(start).toISOString(),result:'STARTED'};
      await this.record(entry);
      let response:Response|undefined,phase:FailurePhase='credentials',failure:TransportFailure|undefined,thrown:unknown,dispatched=false;
      let data:unknown,receipt:{remoteId?:string}={},diagnostic:{code:string;message:string}|undefined;
      try {
        this.options.signal?.throwIfAborted();
        const token = await this.credentials.token(base.origin,{requestId,attempt});
        phase='connectOrHeaders';
        const deadline=AbortSignal.timeout(method==='GET'?30000:180000);
        dispatched=true;
        response = await this.transport(url, { method, redirect: 'manual',
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
            'OData-Version': '4.0', 'OData-MaxVersion': '4.0', 'x-ms-client-request-id': requestId, ...extra },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),signal:this.options.signal?AbortSignal.any([deadline,this.options.signal]):deadline });
        phase='body';
        if (!response.ok) {
        // Only the bounded OData code/message is exposed; never headers, inner errors or raw bodies.
        try {
          const parsed = z.object({ error: z.object({ code: z.string().regex(/^0x[a-f0-9]{8}$/i), message: z.string() }) }).safeParse(await response.json());
          if (parsed.success) diagnostic = {code:parsed.data.error.code,message:method==='GET'?'Service message omitted from discovery evidence':parsed.data.error.message};
        } catch { /* Non-JSON failures retain the safe status/correlation diagnostic. */ }
          failure={kind:'http',status:response.status,...(diagnostic?{serviceErrorCode:diagnostic.code}:{})};
        }else{
      const entityId = response.headers.get('odata-entityid');
      let guid: string | undefined;
      try { if (entityId && new URL(entityId, base).origin === base.origin) guid = entityId.match(/\(([a-f0-9-]{36})\)\/?$/i)?.[1]; } catch { /* Malformed optional receipt cannot turn a successful write into a retry. */ }
      receipt = guid && z.guid().safeParse(guid).success ? { remoteId: guid.toLowerCase() } : {};
      data=response.status===204||response.headers.get('content-length')==='0'?null:await response.json() as unknown;
        }
      }catch(error){thrown=error;failure=this.options.signal?.aborted?{kind:'aborted'}:phase==='credentials'?{kind:'authentication'}:classifyTransport(error,phase,this.options.signal);}
      const finished={...entry,dispatched,finishedAt:new Date().toISOString(),elapsedMs:Date.now()-start,slow:Date.now()-start>5000,...(response?{status:response.status,...correlationHeaders(response.headers)}:{})};
      if(!failure){await this.record({...finished,result:attempt===1?'SUCCESS':'RECOVERED_TRANSIENT'});return {data,requestId,...receipt};}
      const classification=retryClassification(failure);
      const serverDelay=response?retryAfter(response.headers.get('retry-after')):undefined;
      const delay=Math.ceil((serverDelay===undefined?2**(attempt-1):serverDelay)*1000);
      const invalidHint=response?.headers.has('retry-after')&&serverDelay===undefined;
      const retry=safeRead&&classification.retryable&&attempt<3&&!invalidHint&&delay<=60000&&totalDelay+delay<=60000&&!this.options.signal?.aborted;
      const evidence:RequestAudit={...finished,result:retry?'RETRY':'FAILED',failure,failurePhase:phase,...(thrown?{exceptionType:exceptionType(thrown)}:{}),retryClassification:classification.classification,retryDecision:!safeRead?'NOT_DISCOVERY_READ':!classification.retryable?'NONRETRYABLE':attempt>=3?'ATTEMPTS_EXHAUSTED':invalidHint?'INVALID_RETRY_AFTER':retry?'RETRY_SCHEDULED':'DELAY_BUDGET_EXCEEDED',retryDelayMs:retry?delay:0,...(serverDelay!==undefined?{retryAfterSeconds:serverDelay}:{})};
      await this.record(evidence);
      if(!retry){if(phase==='credentials'&&thrown instanceof PowerCanvasError)throw thrown;throw new ApiError(response?.status??0,requestId,method!=='GET'&&(failure.kind!=='http'||failure.status>=500),diagnostic,evidence);}
      totalDelay+=delay;
      try{await (this.options.sleep??cancellableDelay)(delay,this.options.signal);}catch(error){
       const cancelled:RequestAudit={...evidence,result:'FAILED',failure:classifyTransport(error,'retryWait',this.options.signal),failurePhase:'retryWait',retryClassification:'CANCELLED',retryDecision:'NONRETRYABLE',retryDelayMs:0,finishedAt:new Date().toISOString()};
       await this.record(cancelled);throw new ApiError(response?.status??0,requestId,false,undefined,cancelled);
      }
    }
    throw new PowerCanvasError('PF-DV-001','Read attempt budget exhausted.','Inspect transport evidence.');
  }
  async all(path: string): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = []; const visited = new Set<string>();
    let next: string | undefined = path;
    while (next) {
      if (visited.has(next) || visited.size >= 1000) throw new PowerCanvasError('PF-DV-002', 'Metadata pagination did not terminate.', 'Do not treat partial discovery as absence.');
      visited.add(next);
      const result = z.object({ value: z.array(z.record(z.string(), z.unknown())), '@odata.nextLink': z.string().optional() }).parse((await this.request(next,'GET',undefined,{},visited.size)).data);
      rows.push(...result.value); next = result['@odata.nextLink'];
    }
    return rows;
  }
}
