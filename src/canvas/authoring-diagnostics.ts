import { hashJson } from '../core/json.js';
import { PowerCanvasError } from '../core/errors.js';
export type AuthoringFailureKind='SESSION_NOT_READY'|'SESSION_STALE'|'AUTHORING_REJECTED'|'SOURCE_EMPTY'|'SOURCE_MISMATCH'|'CLEANUP_REQUIRED'|'UNKNOWN';
/** Export bounded metadata, never raw authentication/server bodies or URLs. 422 alone does not establish a cause. */
export function authoringFailure(message:string,phase:string,writeAttempted=false){
  const status=message.match(/HTTP(?:\s+status:)?\s+(\d{3})/i)?.[1];
  const session=message.match(/\[SessionId:\s*([a-f0-9-]{36})\]/i)?.[1];
  const kind:AuthoringFailureKind=/empty source|zero.files|no.*yaml/i.test(message)?'SOURCE_EMPTY':/source.*mismatch|readback.*differ/i.test(message)?'SOURCE_MISMATCH':/cleanup required/i.test(message)?'CLEANUP_REQUIRED':/session.*(?:expired|stale)/i.test(message)?'SESSION_STALE':/not connected|not ready|coauthoring.*disabled/i.test(message)?'SESSION_NOT_READY':status==='422'?'AUTHORING_REJECTED':'UNKNOWN';
  return {kind,phase,httpStatus:status?Number(status):null,serverSessionId:session??null,signedIn:/Signed in as:/i.test(message),diagnosticHash:hashJson(message),writeAttempted,outcome:writeAttempted?'UNKNOWN_UNTIL_ACQUIRED':'NO_SOURCE_WRITE',cause:'UNDETERMINED',autoRetry:false};
}
export class AuthoringOperationError extends PowerCanvasError {
  constructor(readonly diagnostic:ReturnType<typeof authoringFailure>){super(`PF-CANVAS-AUTHORING-${diagnostic.kind}`,`Authoring ${diagnostic.phase}: ${diagnostic.kind}${diagnostic.httpStatus?' HTTP '+diagnostic.httpStatus:''}; reacquisition required`,'Inspect bounded connection diagnostics. Do not retry writes until doctor and fresh same-epoch source acquisition succeed.');this.name='AuthoringOperationError';}
}
