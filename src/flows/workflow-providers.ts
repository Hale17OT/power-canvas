import type {Expr,FlowAction,FlowResources,ValueShape} from './schema.js';
import {expression,compatible,fail} from './expressions.js';
import type {ExpressionContext} from './expressions.js';
import type {Risk} from './providers.js';
export const approvalResponses:ValueShape={type:'array',items:{type:'object',fields:{comments:{type:'string'},approverResponse:{type:'string'},responder:{type:'object',fields:{id:{type:'string'},displayName:{type:'string'},email:{type:'string'}}}}}};
export const completedApproval:ValueShape={type:'object',fields:{outcome:{type:'string'},responses:approvalResponses}};
export const normalizedResponses:ValueShape={type:'array',items:{type:'object',fields:Object.fromEntries(['responderId','responderName','responderEmail','comments','response'].map(k=>[k,{type:'string'}]))}};
export const approvalResultShape:ValueShape={type:'object',fields:{approvalId:{type:'string'},outcome:{type:'string'},responses:normalizedResponses}};
export function compileWorkflowConnector(a:FlowAction,r:FlowResources,c:ExpressionContext,connector:string,operation:string,risk:Risk){
 const ex=(e:Expr|undefined,type:ValueShape['type'])=>{if(!e)fail('Missing workflow connector parameter.');const v=expression(e,c);if(!compatible(v.shape,{type}))fail(`Expected ${type} in ${a.name}.`);return '@'+v.code;};
 let parameters:Record<string,unknown>={},output:ValueShape;
 if(connector==='shared_approvals'){
  if(a.use==='approvals.wait'){parameters.approvalName=ex(a.approvalId,'string');output=completedApproval;}
  else {
   const prefix=a.use==='approvals.create'?'ApprovalCreationInput':'WebhookApprovalCreationInput';
   if(!a.assignedTo?.length)fail('Approval recipients are required.');
   const recipients=a.assignedTo.map(e=>{const v=expression(e,c);if(!['email','guid'].includes(v.shape.type))fail('Approver must be a typed email/UPN or Entra user GUID, never a display name.');if(e.op==='literal'&&!e.intentionalConstant)fail('Literal approvers require intentional approved configuration; prefer a typed environment variable.');return v.code;});
   parameters={approvalType:a.approvalType==='firstToRespond'?'Basic':'BasicAwaitAll',[prefix+'/title']:ex(a.title,'string'),[prefix+'/assignedTo']:`@join(createArray(${recipients.join(',')}),';')`,[prefix+'/enableNotifications']:a.enableNotifications,[prefix+'/enableReassignment']:false};
   for(const key of ['details','itemLink','itemLinkDescription'] as const)if(a[key])parameters[prefix+'/'+key]=ex(a[key],'string');
   output={type:'object',fields:{name:{type:'string'},...(a.use==='approvals.create'?{}:completedApproval.fields)}};
  }
  if(a.use!=='approvals.create'&&!a.timeoutHours)fail('Blocking approvals require a bounded timeoutHours (maximum 28 days).');
  if(a.use==='approvals.create'&&a.timeoutHours)fail('Create approval does not wait; timeoutHours belongs on the wait action.');
 }else{
  if(a.use==='word.populateTemplate'){
   const t=r.documentTemplates?.[a.template!];if(!t)fail('Unknown external document template.');
   const ids=Object.values(t.fields).map(f=>f.controlId);if(new Set(ids).size!==ids.length)fail('Duplicate template content-control identity.');
   parameters={source:ex(t.source,'string'),drive:ex(t.drive,'string'),file:ex(t.file,'string')};
   for(const [key,field]of Object.entries(t.fields))if(field.required&&!a.fields?.[key])fail(`Missing required template field ${key}.`);
   for(const [key,value]of Object.entries(a.fields??{})){const field=t.fields[key];if(!field)fail(`Unknown template field ${key}.`);parameters['dynamicFileSchema/'+field.controlId]=ex(value,field.type);}
  }else parameters={source:ex(a.source,'string'),drive:ex(a.drive,'string'),file:ex(a.file,'string')};
  output={type:'binary'};
 }
 const webhook=a.use==='approvals.wait'||a.use==='approvals.startAndWait';
 const body:Record<string,unknown>={type:webhook?'OpenApiConnectionWebhook':'OpenApiConnection',inputs:{host:{apiId:'/providers/Microsoft.PowerApps/apis/'+connector,connectionName:a.connection,operationId:operation},parameters,authentication:"@parameters('$authentication')",retryPolicy:{type:'none'}},...(webhook?{limit:{timeout:`PT${a.timeoutHours}H`}}:{})};
 return {body,output,risk};
}
/** Normalization is conservative: unrecognized decisions never become rejection/approval. */
export function normalizeApproval(value:unknown,approvalId:string){
 const raw=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const outcome=raw.outcome==='Approve'?'approved':raw.outcome==='Reject'?'rejected':raw.outcome==='Cancel'?'cancelled':'unknown';
 const responses=Array.isArray(raw.responses)?raw.responses:[];
 return {approvalId,outcome,responses:responses.map(x=>{const r=x&&typeof x==='object'?x as Record<string,unknown>:{};const p=r.responder&&typeof r.responder==='object'?r.responder as Record<string,unknown>:{};return {comments:typeof r.comments==='string'?r.comments:'',response:typeof r.approverResponse==='string'?r.approverResponse:'',responderId:typeof p.id==='string'?p.id:'',responderName:typeof p.displayName==='string'?p.displayName:'',responderEmail:typeof p.email==='string'?p.email:''};})};
}
