import {commandPolicy} from './commands.js';
export const routingRules=[
 {skill:'powercanvas-debug',signals:'failure, error, broken, stale source/plan, ownership conflict, authoring MCP timeout'},
 {skill:'powercanvas-taste',signals:'redesign, UI/UX, theme, navigation, overlays, design direction, responsive/device composition'},
 {skill:'powercanvas-canvas',signals:'Canvas app, screen, form, control, typed field, Power Fx, native source'},
 {skill:'powercanvas-flows',signals:'Power Automate, flow, automation, approval, notification, document generation, reminder, child workflow'},
] as const;
export type AgentContext={powerCanvasProject?:boolean|undefined;authoringHealth?:string|undefined};
/** Bounded deterministic routing hints, not an NLP model or a substitute for compiler checks. */
export function routeRequest(prompt:string,context:AgentContext={}){
 const text=prompt.toLowerCase();
 const outOfScope=/\b(?:javascript|python|typescript)\b.*\b(?:sort|sorting)\b/.test(text)||/^(?:explain|what is|what are)\b/.test(text)&&!/(?:build|modify|implement|debug|plan)\b/.test(text);
 const domain=context.powerCanvasProject||/powercanvas|power apps|power automate|canvas app|dataverse|sharepoint/.test(text);
 if(outOfScope||!domain)return {status:'NO_WORKFLOW',skills:[],steps:[],warnings:[],commands:[],executionAuthorized:false};
 if(/dataverse.*(?:transport|discovery.*(?:fail|unstable))|discovery transport/.test(text))return {status:'PLAN',skills:['powercanvas-debug'],steps:['inspect','dataverse-transport-diagnosis','read-only-stability','report'],warnings:['Diagnose sanitized GET attempt evidence. Never retry apply or change authentication profiles to resolve a transport failure.'],commands:['dataverse transport-doctor'].map(command=>({command,...commandPolicy(command)})),executionAuthorized:false};
 if(/pf-auth-001|authentication (?:binding |profile |store )?recovery|auth profile.*missing/.test(text))return {status:'PLAN',skills:['powercanvas-debug'],steps:['inspect','authentication-recovery','operator-boundary','report'],warnings:['Inspect PAC inventory and the explicitly named PowerCanvas profile/store. Never select, create or rebind a profile implicitly; do not retry solution apply.'],commands:['auth doctor'].map(command=>({command,...commandPolicy(command)})),executionAuthorized:false};
 const debug=/error|fail|broken|debug|timeout|stale|mismatch|conflict|unavailable/.test(text);
 const taste=/redesign|design|ui\b|ux\b|layout|theme|mobile|desktop|responsive|navigation|overlay/.test(text);
 const canvas=/canvas|screen|form|control|field|power fx|mobile|responsive|app\b/.test(text)||taste;
 const flows=/\bflows?\b|automation|automate|approval|notification|email|document|reminder|escalat|child workflow/.test(text);
 const native=/model.driven|back.office|administrative app|security roles?|app access|dataverse.*(?:table|schema|choice|relationship|privilege)/.test(text);
 const sharepoint=/sharepoint/.test(text)&&/list|librar|site|column|content type|permission|folder|tracker/.test(text);
 const solution=!debug&&!/^(?:just |only )?(?:redesign|restyle)/.test(text)&&(native||sharepoint||/\bsolution\b|\bsystem\b|end.to.end|business app/.test(text)||/build.*(?:management|inspection).*app/.test(text)||/^(?:build|create)\b/.test(text)&&/\b(?:app|application)\b/.test(text)&&/\b(?:tables?|dataverse|approvals?|flows?|automation)\b/.test(text));
 const skills=solution?['powercanvas']:[...(debug?['powercanvas-debug']:[]),...(taste?['powercanvas-taste']:[]),...(canvas?['powercanvas-canvas']:[]),...(flows?['powercanvas-flows']:[])];
 if(!skills.length)skills.push('powercanvas');
 const warnings:string[]=[];
 const bypass=/bypass|ignore.*(?:hash|ownership|plan)|overwrite.*hash/.test(text);
 if(bypass)warnings.push('Source/plan/ownership gates cannot be bypassed; inspect and replan from current evidence.');
 if(/mobile|tablet|desktop|responsive/.test(text))warnings.push('Device layouts default to compositions in the same app. Distinct product intent requires an explicit application-level contract.');
 if(/kanban|drag.and.drop|blur|calendar|grid/.test(text))warnings.push('Inspect the actual adapter and variant maturity; a PCF candidate or planned pattern is not production support.');
 if(solution)warnings.push('Use core solution plan for explicit architecture and capability/ownership gates. Unsupported resources remain visible; no implicit tenant creation.');
 const authoringBlocked=canvas&&!(native&&/model.driven|administrative app/.test(text)&&!/canvas/.test(text))&&context.authoringHealth!==undefined&&context.authoringHealth!=='HEALTHY';
 if(authoringBlocked)warnings.push('Authoring unavailable or recovery required: offline planning only, preserve evidence, no write or automatic retry.');
 const commands=solution?['capabilities','solution plan','solution inspect','solution graph','solution audit','solution critique']:['capabilities',...(debug?['doctor']:[]),...(taste?['taste decisions','patterns list','components variants']:[]),...(canvas?['canvas application-plan','taste migration-plan']:[]),...(flows?['flows advise','flows recipe list','flows compile','flows dependencies','flows portability']:[]),...(!canvas&&!flows?['validate']:[])];
 const steps=solution?['inspect','resolve-requirements','unified-solution-plan','dependency-validation','review-existing-gates','report']:['inspect',...(debug?['diagnose-before-mutation']:[]),...(taste?['taste-before-canvas']:[]),...(canvas?['same-app-source-and-maturity','migration-plan','preservation-validation']:[]),...(flows?['typed-primitive-or-recipe','compile','dependency-validation','saved-deployment-plan']:[]),'review-existing-gates',...(authoringBlocked||bypass?['stop-remote-work']:['apply-only-with-existing-authorization']),'report'];
 return {status:bypass?'BLOCKED':authoringBlocked?'OFFLINE_ONLY':'PLAN',skills,steps,warnings,commands:commands.map(command=>({command,...commandPolicy(command)})),executionAuthorized:false};
}
export function interpretResult(result:{status?:string;verdict?:string;blocker?:{classification?:string};creationEvidence?:{remoteSucceeded?:{remoteId:string};verificationFailed?:boolean;reconciledRemoteId?:string};ok?:boolean;executable?:boolean;blockers?:unknown[];error?:unknown}){
 const detail=result.error&&typeof result.error==='object'?result.error as Record<string,unknown>:{};
 const message=typeof detail.message==='string'?detail.message:'';
 if(result.blocker?.classification==='PROVIDER_PAYLOAD_DEFECT'||/\b400\b/.test(message)&&/Entity\s?Key(?:Metadata)?/i.test(message)&&/DisplayName/i.test(message)&&/omitted|missing|not specified|required/i.test(message))return {status:'BLOCKED',classification:'PROVIDER_PAYLOAD_DEFECT',autoRetry:false,next:'provider-payload-contract-correction',mutationAuthorized:false};
 if(['APP_NOT_PUBLISHED','APP_ACCESS_REQUIRES_PUBLICATION','DEFERRED_REQUIRES_PUBLICATION','PROVIDER_CONVERGED_WITH_DEFERRED_PUBLICATION'].includes(result.status??'')||message==='APP_ACCESS_REQUIRES_PUBLICATION')return {status:'DEFERRED_REQUIRES_PUBLICATION',autoRetry:false,next:'review-scoped-app-publication-boundary',mutationAuthorized:false};
 const creation=result.creationEvidence;
 if(creation?.remoteSucceeded?.remoteId&&creation.verificationFailed&&creation.reconciledRemoteId===creation.remoteSucceeded.remoteId)return {status:'CONFIRMED_SURVIVING_CREATE',autoRetry:false,next:'provider-normalization-and-source-bound-recovery-analysis',mutationAuthorized:false};
 const errorCode=result.error&&typeof result.error==='object'&&'code'in result.error?result.error.code:undefined;
 if(errorCode==='PF-AUTH-006'||result.status?.startsWith('AUTH_')&&result.status!=='AUTH_HEALTHY'||result.verdict?.startsWith('AUTHENTICATION UNSTABLE'))return {status:'BLOCKED',autoRetry:false,next:'credential-acquisition-diagnosis',mutationAuthorized:false};
 if(result.status==='BLOCKED_AUTH'||result.status==='BLOCKED_PERMISSION')return {status:'BLOCKED',autoRetry:false,next:result.status==='BLOCKED_AUTH'?'credential-acquisition-diagnosis':'permission-diagnosis',mutationAuthorized:false};
 const transport=result.error&&typeof result.error==='object'&&'transport'in result.error?result.error.transport:undefined;
 if(transport&&typeof transport==='object'&&'retryClassification'in transport&&['AUTH_FAILURE','PERMISSION_FAILURE'].includes(String(transport.retryClassification)))return {status:'BLOCKED',autoRetry:false,next:transport.retryClassification==='AUTH_FAILURE'?'credential-acquisition-diagnosis':'permission-diagnosis',mutationAuthorized:false};
 if(result.blocker?.classification==='TRANSPORT_FAILURE'||transport||result.status==='UNSTABLE'||result.verdict?.startsWith('DATAVERSE READ TRANSPORT UNSTABLE'))return {status:'BLOCKED',autoRetry:false,next:'dataverse-transport-diagnosis',mutationAuthorized:false};
 if(['READ_ONLY_PREFLIGHT_COMPLETE_CERTIFICATION_BLOCKED','CERTIFICATION_PLAN_STILL_BLOCKED'].includes(result.status??''))return {status:'BLOCKED',autoRetry:false,next:'resolve-planning-scope-blockers',mutationAuthorized:false};
 if(result.error&&typeof result.error==='object'&&'code' in result.error&&result.error.code==='PF-AUTH-001'||['PROFILE_MISSING','PROFILE_STORE_MISMATCH','PROFILE_TARGET_MISMATCH','PRINCIPAL_MISMATCH','AUTHENTICATION_FAILED','PROFILE_ENUMERATION_FAILED','ENVIRONMENT_MISMATCH'].includes(result.status??''))return {status:'BLOCKED',autoRetry:false,next:'authentication-recovery',mutationAuthorized:false};
 const status=result.status?.toUpperCase();
 if(status&&['BLOCKED','CONFLICT','STALE','UNSUPPORTED'].includes(status))return {status,autoRetry:false,next:status==='STALE'?'reacquire-and-replan':'inspect-diagnostics',mutationAuthorized:false};
 if(result.error||result.ok===false||result.executable===false||result.blockers?.length)return {status:'BLOCKED',autoRetry:false,next:'inspect-diagnostics',mutationAuthorized:false};
 return {status:'REVIEW_RESULT',autoRetry:false,next:'validate-artifacts-and-existing-gates',mutationAuthorized:false};
}
