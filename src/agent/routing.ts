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
 const domain=context.powerCanvasProject||/powercanvas|power apps|power automate|canvas app|dataverse/.test(text);
 if(outOfScope||!domain)return {status:'NO_WORKFLOW',skills:[],steps:[],warnings:[],commands:[],executionAuthorized:false};
 const debug=/error|fail|broken|debug|timeout|stale|mismatch|conflict|unavailable/.test(text);
 const taste=/redesign|design|ui\b|ux\b|layout|theme|mobile|desktop|responsive|navigation|overlay/.test(text);
 const canvas=/canvas|screen|form|control|field|power fx|mobile|responsive|app\b/.test(text)||taste;
 const flows=/\bflows?\b|automation|automate|approval|notification|email|document|reminder|escalat|child workflow/.test(text);
 const solution=!debug&&!/^(?:just |only )?(?:redesign|restyle)/.test(text)&&(/\bsolution\b|\bsystem\b|end.to.end|business app/.test(text)||/build.*(?:management|inspection).*app/.test(text)||/^(?:build|create)\b/.test(text)&&/\b(?:app|application)\b/.test(text)&&/\b(?:tables?|dataverse|approvals?|flows?|automation)\b/.test(text));
 const skills=solution?['powercanvas']:[...(debug?['powercanvas-debug']:[]),...(taste?['powercanvas-taste']:[]),...(canvas?['powercanvas-canvas']:[]),...(flows?['powercanvas-flows']:[])];
 if(!skills.length)skills.push('powercanvas');
 const warnings:string[]=[];
 const bypass=/bypass|ignore.*(?:hash|ownership|plan)|overwrite.*hash/.test(text);
 if(bypass)warnings.push('Source/plan/ownership gates cannot be bypassed; inspect and replan from current evidence.');
 if(/mobile|tablet|desktop|responsive/.test(text))warnings.push('Device layouts default to compositions in the same app. Distinct product intent requires an explicit application-level contract.');
 if(/kanban|drag.and.drop|blur|calendar|grid/.test(text))warnings.push('Inspect the actual adapter and variant maturity; a PCF candidate or planned pattern is not production support.');
 if(solution)warnings.push('Use core solution plan for explicit architecture and capability/ownership gates. Unsupported resources remain visible; no implicit tenant creation.');
 const authoringBlocked=canvas&&context.authoringHealth!==undefined&&context.authoringHealth!=='HEALTHY';
 if(authoringBlocked)warnings.push('Authoring unavailable or recovery required: offline planning only, preserve evidence, no write or automatic retry.');
 const commands=solution?['capabilities','solution plan','solution inspect','solution graph','solution audit','solution critique']:['capabilities',...(debug?['doctor']:[]),...(taste?['taste decisions','patterns list','components variants']:[]),...(canvas?['canvas application-plan','taste migration-plan']:[]),...(flows?['flows advise','flows recipe list','flows compile','flows dependencies','flows portability']:[]),...(!canvas&&!flows?['validate']:[])];
 const steps=solution?['inspect','resolve-requirements','unified-solution-plan','dependency-validation','review-existing-gates','report']:['inspect',...(debug?['diagnose-before-mutation']:[]),...(taste?['taste-before-canvas']:[]),...(canvas?['same-app-source-and-maturity','migration-plan','preservation-validation']:[]),...(flows?['typed-primitive-or-recipe','compile','dependency-validation','saved-deployment-plan']:[]),'review-existing-gates',...(authoringBlocked||bypass?['stop-remote-work']:['apply-only-with-existing-authorization']),'report'];
 return {status:bypass?'BLOCKED':authoringBlocked?'OFFLINE_ONLY':'PLAN',skills,steps,warnings,commands:commands.map(command=>({command,...commandPolicy(command)})),executionAuthorized:false};
}
export function interpretResult(result:{status?:string;ok?:boolean;executable?:boolean;blockers?:unknown[];error?:unknown}){
 const status=result.status?.toUpperCase();
 if(status&&['BLOCKED','CONFLICT','STALE','UNSUPPORTED'].includes(status))return {status,autoRetry:false,next:status==='STALE'?'reacquire-and-replan':'inspect-diagnostics',mutationAuthorized:false};
 if(result.error||result.ok===false||result.executable===false||result.blockers?.length)return {status:'BLOCKED',autoRetry:false,next:'inspect-diagnostics',mutationAuthorized:false};
 return {status:'REVIEW_RESULT',autoRetry:false,next:'validate-artifacts-and-existing-gates',mutationAuthorized:false};
}
