import { z } from 'zod';
import type { JsonValue } from '../core/json.js';

export const identifier = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).max(100);
export const valueTypes = ['string','number','integer','boolean','date','datetime','object','array','recordRef','email','guid','binary'] as const;
export type ValueType = typeof valueTypes[number];
export type ValueShape = { type: ValueType; fields?: Record<string, ValueShape> | undefined; items?: ValueShape | undefined }
export const shapeSchema: z.ZodType<ValueShape> = z.lazy(()=>z.strictObject({type:z.enum(valueTypes),fields:z.record(identifier,shapeSchema).optional(),items:shapeSchema.optional()}).superRefine((s,c)=>{
  if((s.type==='array')!==!!s.items || (s.type==='object')!==!!s.fields) c.addIssue({code:'custom',message:'Array requires items; object requires fields; other types cannot declare them.'});
}));
export type Expr = { op:'literal'|'input'|'output'|'trigger'|'variable'|'environment'|'item'|'concat'|'coalesce'|'equals'|'not'|'and'|'or'|'empty'|'length'|'first'|'last'|'newGuid'|'utcNow'|'runId'; value?: JsonValue; shape?:ValueShape; name?:string; path?:string[]; args?:Expr[]; intentionalConstant?:string | undefined }
export const expressionSchema: z.ZodType<Expr> = z.lazy(()=>z.discriminatedUnion('op',[
  z.strictObject({op:z.literal('literal'),value:z.json(),shape:shapeSchema,intentionalConstant:z.string().min(10).optional()}),
  ...(['newGuid','utcNow','runId'] as const).map(op=>z.strictObject({op:z.literal(op)})),
  ...(['input','output','variable','environment'] as const).map(op=>z.strictObject({op:z.literal(op),name:identifier,path:z.array(identifier).default([])})),
  z.strictObject({op:z.literal('item'),path:z.array(identifier).default([])}),
  z.strictObject({op:z.literal('trigger'),path:z.array(identifier).default([])}),
  ...(['concat','coalesce','equals','not','and','or','empty','length','first','last'] as const).map(op=>z.strictObject({op:z.literal(op),args:z.array(expressionSchema).min(1).max(32)})),
]));
export type FlowAction = { name:string; use:string; after?:{action:string; statuses:('Succeeded'|'Failed'|'TimedOut'|'Skipped')[]} | undefined; timeoutHours?:number | undefined; seconds?:number; flow?:string; arguments?:Record<string,Expr>; template?:string; source?:Expr; drive?:Expr; file?:Expr; approvalType?:'firstToRespond'|'everyoneMustApprove'; assignedTo?:Expr[]; title?:Expr; details?:Expr | undefined; itemLink?:Expr | undefined; itemLinkDescription?:Expr | undefined; enableNotifications?:boolean; approvalId?:Expr; responses?:Expr; conflict?:'uniqueSuffix' | undefined; value?:Expr; condition?:Expr; actions?:FlowAction[]; otherwise?:FlowAction[]; from?:Expr; maxItems?:number; fields?:Record<string,Expr>; shape?:ValueShape | undefined; variable?:string; connection?:string; table?:string; id?:Expr; select?:string[]; top?:number; metadata?:string | undefined; site?:Expr; list?:Expr; folder?:Expr; fileName?:Expr; content?:Expr; to?:Expr[]; cc?:Expr[] | undefined; bcc?:Expr[] | undefined; subject?:Expr; body?:Expr; importance?:'Low'|'Normal'|'High'; retry?:{policy:'none'|'default'} | undefined; idempotency?:{mode:'naturalKey'|'targetIdentity'|'operatorReviewed'; rationale:string} | undefined; filter?:{column:string; operator:'eq'|'ne'; value:Expr} | undefined }
const actionBase={name:identifier,after:z.strictObject({action:identifier,statuses:z.array(z.enum(['Succeeded','Failed','TimedOut','Skipped'])).min(1)}).optional()};
export const connectorNames=['shared_commondataserviceforapps','shared_sharepointonline','shared_office365','shared_approvals','shared_wordonlinebusiness'] as const;
export const retrySchema=z.strictObject({policy:z.enum(['none','default'])});
const connectorBase={...actionBase,connection:identifier,retry:retrySchema.optional(),idempotency:z.strictObject({mode:z.enum(['naturalKey','targetIdentity','operatorReviewed']),rationale:z.string().min(10)}).optional()};
const fieldsSchema=z.record(identifier,expressionSchema).refine(v=>Object.keys(v).length>0,'At least one field is required.');
const filterSchema=z.strictObject({column:identifier,operator:z.enum(['eq','ne']),value:expressionSchema});
export const actionSchema:z.ZodType<FlowAction> = z.lazy(()=>z.discriminatedUnion('use',[
  z.strictObject({...actionBase,use:z.literal('control.scope'),actions:z.array(actionSchema).min(1)}),
  z.strictObject({...actionBase,use:z.literal('control.delay'),seconds:z.int().min(1).max(3600)}),
  z.strictObject({...actionBase,use:z.literal('flows.invoke'),flow:identifier,arguments:z.record(identifier,expressionSchema)}),
  z.strictObject({...actionBase,use:z.literal('flows.respond'),fields:z.record(identifier,expressionSchema)}),
  z.strictObject({...actionBase,use:z.literal('approvals.responses'),from:expressionSchema}),
  z.strictObject({...actionBase,use:z.literal('approvals.result'),from:expressionSchema,approvalId:expressionSchema,responses:expressionSchema}),
  ...(['approvals.create','approvals.startAndWait'] as const).map(use=>z.strictObject({...connectorBase,use:z.literal(use),approvalType:z.enum(['firstToRespond','everyoneMustApprove']),assignedTo:z.array(expressionSchema).min(1).max(100),title:expressionSchema,details:expressionSchema.optional(),itemLink:expressionSchema.optional(),itemLinkDescription:expressionSchema.optional(),enableNotifications:z.boolean(),timeoutHours:z.int().min(1).max(672).optional()})),
  z.strictObject({...connectorBase,use:z.literal('approvals.wait'),approvalId:expressionSchema,timeoutHours:z.int().min(1).max(672)}),
  z.strictObject({...connectorBase,use:z.literal('word.populateTemplate'),template:identifier,fields:fieldsSchema}),
  z.strictObject({...connectorBase,use:z.literal('word.convertToPdf'),source:expressionSchema,drive:expressionSchema,file:expressionSchema}),
  z.strictObject({...actionBase,use:z.literal('control.terminate'),value:expressionSchema}),
  z.strictObject({...actionBase,use:z.literal('workflow.correlation'),fields:z.strictObject({correlationId:expressionSchema,sourceRecordId:expressionSchema,parentRunContext:expressionSchema})}),
  z.strictObject({...actionBase,use:z.literal('data.object'),fields:fieldsSchema}),
  z.strictObject({...actionBase,use:z.literal('data.compose'),value:expressionSchema}),
  z.strictObject({...actionBase,use:z.literal('data.parseJson'),value:expressionSchema,shape:shapeSchema}),
  z.strictObject({...actionBase,use:z.literal('data.select'),from:expressionSchema,fields:z.record(identifier,expressionSchema)}),
  z.strictObject({...actionBase,use:z.literal('data.filterArray'),from:expressionSchema,condition:expressionSchema}),
  z.strictObject({...actionBase,use:z.literal('control.condition'),condition:expressionSchema,actions:z.array(actionSchema),otherwise:z.array(actionSchema).default([])}),
  z.strictObject({...actionBase,use:z.literal('control.applyToEach'),from:expressionSchema,maxItems:z.int().min(1).max(1000),actions:z.array(actionSchema).min(1)}),
  z.strictObject({...actionBase,use:z.literal('variables.initialize'),variable:identifier,shape:shapeSchema,value:expressionSchema}),
  z.strictObject({...actionBase,use:z.literal('variables.set'),variable:identifier,value:expressionSchema}),
  z.strictObject({...actionBase,use:z.literal('variables.append'),variable:identifier,value:expressionSchema}),
  z.strictObject({...actionBase,use:z.literal('powerApps.respond'),fields:z.record(identifier,expressionSchema)}),
  z.strictObject({...connectorBase,use:z.literal('dataverse.getRow'),connection:identifier,table:identifier,id:expressionSchema,select:z.array(identifier).min(1),shape:shapeSchema.optional(),metadata:identifier.optional()}),
  z.strictObject({...connectorBase,use:z.literal('dataverse.listRows'),connection:identifier,table:identifier,select:z.array(identifier).min(1),top:z.int().min(1).max(500),shape:shapeSchema.optional(),metadata:identifier.optional()}),
  z.strictObject({...connectorBase,use:z.literal('dataverse.addRow'),table:identifier,metadata:identifier,fields:fieldsSchema}),
  z.strictObject({...connectorBase,use:z.literal('dataverse.updateRow'),table:identifier,metadata:identifier,id:expressionSchema,fields:fieldsSchema}),
  z.strictObject({...connectorBase,use:z.literal('sharepoint.getItems'),site:expressionSchema,list:expressionSchema,metadata:identifier,top:z.int().min(1).max(500),filter:filterSchema.optional()}),
  ...(['sharepoint.getFileMetadata','sharepoint.getFileContent'] as const).map(use=>z.strictObject({...connectorBase,use:z.literal(use),site:expressionSchema,id:expressionSchema})),
  z.strictObject({...connectorBase,use:z.literal('sharepoint.createItem'),site:expressionSchema,list:expressionSchema,metadata:identifier,fields:fieldsSchema}),
  ...(['sharepoint.updateItem','sharepoint.updateFileProperties'] as const).map(use=>z.strictObject({...connectorBase,use:z.literal(use),site:expressionSchema,list:expressionSchema,metadata:identifier,id:expressionSchema,fields:fieldsSchema})),
  z.strictObject({...connectorBase,use:z.literal('sharepoint.createFile'),site:expressionSchema,folder:expressionSchema,fileName:expressionSchema,content:expressionSchema,conflict:z.literal('uniqueSuffix').optional()}),
  z.strictObject({...connectorBase,use:z.literal('outlook.sendEmail'),to:z.array(expressionSchema).min(1).max(100),cc:z.array(expressionSchema).max(100).optional(),bcc:z.array(expressionSchema).max(100).optional(),subject:expressionSchema,body:expressionSchema,importance:z.enum(['Low','Normal','High']).default('Normal')}),
]));
export const portSchema=z.strictObject({name:identifier,shape:shapeSchema,required:z.boolean().default(true)});
export const flowSchema=z.strictObject({
  logicalName:identifier,displayName:z.string().min(1).max(100),description:z.string().max(1000).default(''),
  role:z.enum(['parent','child']).optional(),
  flowType:z.enum(['instant','scheduled','automated']),
  trigger:z.discriminatedUnion('type',[
    z.strictObject({type:z.literal('powerAppsV2')}),
    z.strictObject({type:z.literal('manual')}),
    z.strictObject({type:z.literal('recurrence'),frequency:z.enum(['Minute','Hour','Day']),interval:z.int().min(1).max(500),startTime:z.iso.datetime()}),
    z.strictObject({type:z.literal('dataverse'),connection:identifier,table:identifier,metadata:identifier,changeType:z.enum(['rowAdded','rowModified','rowAddedOrModified','rowDeleted']),scope:z.enum(['user','businessUnit','parentChildBusinessUnit','organization']),selectColumns:z.array(identifier).min(1).optional(),filter:filterSchema.optional()}),
  ]),
  inputs:z.array(portSchema).max(20).default([]),outputs:z.array(portSchema).max(20).default([]),
  actions:z.array(actionSchema).min(1).max(100),connectionReferences:z.array(identifier).default([]),environmentVariables:z.array(identifier).default([]),dependencies:z.array(identifier).default([]),
  runPolicy:z.strictObject({mode:z.enum(['readOnly','controlledWrite']).default('readOnly'),maxActions:z.int().min(1).max(200).default(100)}).default({mode:'readOnly',maxActions:100}),
  activationPolicy:z.enum(['manual','afterValidation']).default('manual'),
});
export const connectionReferenceSchema=z.strictObject({logicalName:identifier,displayName:z.string().min(1).max(100),connector:z.enum(connectorNames),allowCreate:z.boolean().default(false)});
export const environmentVariableSchema=z.strictObject({logicalName:identifier,displayName:z.string().min(1).max(100),type:z.enum(['text','number','boolean','json','dataSource','secret']),default:z.json().optional(),format:z.enum(['email','guid','date','datetime']).optional()}).superRefine((v,c)=>{if(v.format&&v.type!=='text')c.addIssue({code:'custom',message:'Format applies only to text environment variables.'});if(['secret','dataSource'].includes(v.type)&&v.default!==undefined)c.addIssue({code:'custom',message:'Secret/data-source values cannot be embedded in source.'});});
export const flowCommandSchema=z.strictObject({
  name:identifier,parent:identifier,label:z.string().min(1).max(80),description:z.string().min(1).max(240),
  arguments:z.record(identifier,z.strictObject({type:z.enum(valueTypes),formula:z.string().min(1)})),
  fields:z.array(z.strictObject({input:identifier,label:z.string().min(1).max(80)})).max(6),
  messageOutput:identifier,successOutput:identifier,disabled:z.string().default('false'),
  lifecycle:z.strictObject({submitLabel:z.string().min(1).max(80),busyLabel:z.string().min(1).max(80),completion:z.literal('response'),retry:z.enum(['safe','manualReconcile'])}).optional(),
});
export const canvasFlowBindingSchema=z.strictObject({app:identifier,flow:identifier,alias:identifier,command:flowCommandSchema.optional()});
export const dataSourceSchema=z.strictObject({connector:z.enum(['shared_commondataserviceforapps','shared_sharepointonline']),table:identifier,logicalName:identifier.optional(),kind:z.enum(['table','list','library']),columns:z.record(identifier,z.strictObject({shape:shapeSchema,required:z.boolean(),readable:z.boolean(),create:z.boolean(),update:z.boolean(),choices:z.array(z.union([z.string(),z.number()])).optional()}))});
export type DataSource=z.infer<typeof dataSourceSchema>;
export const executionPolicySchema=z.strictObject({allowRead:z.boolean().default(true),allowInternalWrite:z.boolean().default(false),allowExternalWrite:z.boolean().default(false),allowDestructive:z.literal(false).default(false)});

export const documentTemplateSchema=z.strictObject({provider:z.literal('word'),source:expressionSchema,drive:expressionSchema,file:expressionSchema,
  fields:z.record(identifier,z.strictObject({controlId:z.string().regex(/^-?[0-9]+$/),type:z.literal('string'),control:z.literal('plainText'),required:z.boolean()})).refine(v=>Object.keys(v).length>0),
});
export const ledgerSchema=z.strictObject({connection:identifier,table:identifier,metadata:identifier,keyColumn:identifier,statusColumn:identifier,workflowColumn:identifier,sourceColumn:identifier});


const mailRecipe=z.strictObject({recipe:z.literal('notification'),name:identifier,send:actionSchema.refine(a=>a.use==='outlook.sendEmail'),when:expressionSchema.optional(),errorBehavior:z.literal('stop'),idempotencyIntent:z.string().min(10)});
const outputFileSchema=z.strictObject({connection:identifier,site:expressionSchema,folder:expressionSchema,fileName:expressionSchema,conflict:z.literal('uniqueSuffix')});
const leafRecipeSchema=z.discriminatedUnion('recipe',[
 mailRecipe,
 z.strictObject({recipe:z.literal('documentGeneration'),name:identifier,connection:identifier,template:identifier,fields:fieldsSchema,output:outputFileSchema,pdf:z.strictObject({source:expressionSchema,drive:expressionSchema,file:expressionSchema,output:outputFileSchema}).optional()}),
 z.strictObject({recipe:z.literal('auditLog'),name:identifier,destination:actionSchema.refine(a=>['dataverse.addRow','sharepoint.createItem'].includes(a.use)),columns:z.strictObject({recordId:identifier,eventType:identifier,actor:identifier,reason:identifier,before:identifier,after:identifier,timestamp:identifier,correlationId:identifier}),entry:z.strictObject({recordId:expressionSchema,eventType:expressionSchema,actor:expressionSchema,reason:expressionSchema,before:expressionSchema,after:expressionSchema,timestamp:expressionSchema,correlationId:expressionSchema})}),
 ...(['reminder','escalation'] as const).map(recipe=>z.strictObject({recipe:z.literal(recipe),name:identifier,query:actionSchema.refine(a=>['dataverse.listRows','sharepoint.getItems'].includes(a.use)),maxItems:z.int().min(1).max(500),eligibility:expressionSchema,notification:mailRecipe,update:actionSchema.refine(a=>a.use==='dataverse.updateRow').optional()})),
 z.strictObject({recipe:z.literal('fileRouting'),name:identifier,read:actionSchema.refine(a=>a.use==='sharepoint.getFileContent'),when:expressionSchema,output:outputFileSchema,update:actionSchema.refine(a=>a.use==='sharepoint.updateFileProperties').optional()}),
 z.strictObject({recipe:z.literal('childWorkflow'),name:identifier,flow:identifier,arguments:z.record(identifier,expressionSchema)}),
 z.strictObject({recipe:z.literal('primitive'),name:identifier,action:actionSchema}),
]);
type ApprovalStep={recipe:'approval';name:string;request:FlowAction;mode:'create'|'createAndWait'|'startAndWait';timeoutHours:number;persist:FlowAction[];onApproved:RecipeStep[];onRejected:RecipeStep[];onUnknown:RecipeStep[]};
type PostSaveStep={recipe:'postSaveAutomation';name:string;commit:'dataverseEvent'|'explicitAfterCommit';steps:RecipeStep[]};
export type RecipeStep=z.infer<typeof leafRecipeSchema>|ApprovalStep|PostSaveStep;
export const recipeStepSchema:z.ZodType<RecipeStep>=z.lazy(()=>z.union([leafRecipeSchema,
 z.strictObject({recipe:z.literal('approval'),name:identifier,request:actionSchema.refine(a=>a.use==='approvals.create'||a.use==='approvals.startAndWait'),mode:z.enum(['create','createAndWait','startAndWait']),timeoutHours:z.int().min(1).max(672),persist:z.array(actionSchema).default([]),onApproved:z.array(recipeStepSchema).default([]),onRejected:z.array(recipeStepSchema).default([]),onUnknown:z.array(recipeStepSchema).default([])}),
 z.strictObject({recipe:z.literal('postSaveAutomation'),name:identifier,commit:z.enum(['dataverseEvent','explicitAfterCommit']),steps:z.array(recipeStepSchema).min(1)}),
]));
export const workflowRecipeSchema=z.strictObject({purpose:z.string().min(10),flow:flowSchema.omit({actions:true}),steps:z.array(recipeStepSchema).min(1).max(50),
 correlation:z.strictObject({correlationId:expressionSchema,sourceRecordId:expressionSchema,parentRunContext:expressionSchema}).optional(),
 idempotency:z.discriminatedUnion('mode',[z.strictObject({mode:z.literal('ledger'),ledger:identifier,operationKey:expressionSchema,sourceId:expressionSchema}),z.strictObject({mode:z.enum(['none','naturalKey','targetIdentity','operatorReviewed']),rationale:z.string().min(10)})]),
 response:z.record(identifier,expressionSchema).optional(),
});

export const flowResourcesSchema=z.strictObject({flows:z.record(identifier,flowSchema).default({}),connectionReferences:z.record(identifier,connectionReferenceSchema).default({}),environmentVariables:z.record(identifier,environmentVariableSchema).default({}),canvasBindings:z.array(canvasFlowBindingSchema).default([]),flowDataSources:z.record(identifier,dataSourceSchema).optional(),documentTemplates:z.record(identifier,documentTemplateSchema).optional(),workflowLedgers:z.record(identifier,ledgerSchema).optional(),workflowRecipes:z.record(identifier,workflowRecipeSchema).optional(),executionPolicy:executionPolicySchema.optional()});
export type FlowSpec=z.infer<typeof flowSchema>;
export type FlowResources=z.infer<typeof flowResourcesSchema>;
export const deploymentSchema=z.strictObject({environmentId:z.string().min(1),workflowAuthorizations:z.record(identifier,z.strictObject({environmentId:z.string().min(1),configurationHash:z.string().regex(/^[a-f0-9]{64}$/),definitionHash:z.string().regex(/^[a-f0-9]{64}$/),invokers:z.string().min(10),connectionOwnership:z.string().min(10),businessAuthorization:z.string().min(10),approvers:z.string().min(10).optional()})).optional(),flowUpdateConcurrency:z.enum(['etag','verifiedSource']).optional(),connections:z.record(identifier,z.strictObject({connectionId:z.string().regex(/^[a-zA-Z0-9_-]+$/),authorizationVerified:z.boolean(),connector:z.enum(connectorNames).optional(),environmentId:z.string().min(1).optional(),principalId:z.guid().optional(),authorizationEvidence:z.string().min(10).optional()})).default({}),environmentValues:z.record(identifier,z.json()).default({})});
export type FlowDeployment=z.infer<typeof deploymentSchema>;
