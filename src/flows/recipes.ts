import type {Expr,FlowAction,FlowResources,RecipeStep,FlowSpec} from './schema.js';
import {flowSchema} from './schema.js';
import {fail} from './expressions.js';
import {flattenActions} from './safety.js';
const lit=(value:string):Expr=>({op:'literal',value,shape:{type:'string'}});
const out=(name:string,...path:string[]):Expr=>({op:'output',name,path});
const eq=(a:Expr,b:string):Expr=>({op:'equals',args:[a,lit(b)]});
const purposes={approval:'Request a decision and explicitly handle its lifecycle',notification:'Communicate a business event through Outlook',documentGeneration:'Populate an external Word template and save requested artifacts',auditLog:'Append an explicitly mapped application history entry',reminder:'Scan a bounded due-record set and notify eligible recipients',escalation:'Notify eligible overdue records and optionally update internal state',fileRouting:'Copy content to a new uniquely named SharePoint file',postSaveAutomation:'Run secondary automation after the primary business commit',childWorkflow:'Invoke a typed reusable workflow in the same solution'};
const recipeContracts:Record<string,{triggers:string[];connectors:string[];required:string[];optional:string[];actions:string[];outputs:string[]}>={
 approval:{triggers:['powerAppsV2','manual','dataverse','recurrence'],connectors:['approvals'],required:['request','mode','timeoutHours'],optional:['persist','onApproved','onRejected','onUnknown'],actions:['approvals.create','approvals.wait','approvals.startAndWait','approvals.responses','approvals.result','control.scope','control.condition','control.terminate'],outputs:['creation identity or scoped normalized approval result']},
 notification:{triggers:['powerAppsV2','manual','dataverse','recurrence'],connectors:['outlook'],required:['send','idempotencyIntent','errorBehavior'],optional:['when'],actions:['control.condition','outlook.sendEmail'],outputs:[]},
 documentGeneration:{triggers:['powerAppsV2','manual','dataverse','recurrence'],connectors:['word','sharepoint'],required:['connection','template','fields','output.conflict'],optional:['pdf'],actions:['word.populateTemplate','sharepoint.createFile','control.delay','word.convertToPdf','data.object'],outputs:['fileName','fileIdentifier','location','pdfIdentifier and pdfLocation only when requested']},
 auditLog:{triggers:['powerAppsV2','manual','dataverse','recurrence'],connectors:['dataverse or sharepoint'],required:['destination','columns','entry'],optional:[],actions:['dataverse.addRow or sharepoint.createItem'],outputs:['destination row']},
 reminder:{triggers:['recurrence'],connectors:['dataverse or sharepoint','outlook'],required:['query.top','maxItems','eligibility','notification'],optional:[],actions:['dataverse.listRows or sharepoint.getItems','control.applyToEach','control.condition','outlook.sendEmail'],outputs:[]},
 escalation:{triggers:['recurrence'],connectors:['dataverse or sharepoint','outlook'],required:['query.top','maxItems','eligibility','notification'],optional:['update'],actions:['dataverse.listRows or sharepoint.getItems','control.applyToEach','control.condition','outlook.sendEmail','dataverse.updateRow'],outputs:[]},
 fileRouting:{triggers:['powerAppsV2','manual','dataverse','recurrence'],connectors:['sharepoint'],required:['read','when','output.conflict'],optional:['update'],actions:['sharepoint.getFileContent','control.condition','sharepoint.createFile','sharepoint.updateFileProperties'],outputs:['scoped target file metadata']},
 postSaveAutomation:{triggers:['powerAppsV2','manual','dataverse'],connectors:['composed dependencies'],required:['commit','steps'],optional:[],actions:['typed expansion of composed stages'],outputs:['composed stage outputs']},
 childWorkflow:{triggers:['powerAppsV2','manual','dataverse','recurrence'],connectors:['transitive child dependencies'],required:['flow','arguments'],optional:[],actions:['flows.invoke'],outputs:['exact declared child response']},
};
export const recipeRegistry=Object.entries(purposes).map(([name,purpose])=>{const c=recipeContracts[name]!;return {name,purpose,supportedTriggers:c.triggers,requiredConnectors:c.connectors,requiredInputs:c.required,optionalInputs:c.optional,generatedActions:c.actions,generatedFlows:'One enclosing flow per workflowRecipes resource; child references resolve to separately declared solution flows',risk:'Propagated from every primitive and transitive child',longRunningBehavior:name==='approval'?'Create returns immediately; createAndWait/startAndWait have explicit bounded timeouts':'Transitive waits are propagated; parent waits for child',idempotencyRequirements:'Explicit intent; optional atomic Dataverse primary-key ledger',environmentDependencies:'Declared references and external-resource manifest',outputs:c.outputs,testingRequirements:['schema','types','effects','graph','lifecycle','controlled runtime when configured']};});

function file(name:string,o:{connection:string;site:Expr;folder:Expr;fileName:Expr;conflict:'uniqueSuffix'},content:Expr):FlowAction{return {name,use:'sharepoint.createFile',...o,content};}
function expandSteps(steps:RecipeStep[],flow:FlowSpec['trigger'],depth=0):FlowAction[]{
 if(depth>6)fail('Recipe composition exceeds six levels; extract a child workflow.');
 return steps.flatMap((s):FlowAction[]=>{
  const n=s.name;
  switch(s.recipe){
   case 'primitive':return [{...s.action,name:n}];
   case 'childWorkflow':return [{name:n,use:'flows.invoke',flow:s.flow,arguments:s.arguments}];
   case 'notification':{const send={...s.send,name:n};return s.when?[{name:n+'_When',use:'control.condition',condition:s.when,actions:[send],otherwise:[]}]:[send];}
   case 'documentGeneration':{
    const actions:FlowAction[]=[{name:n+'_Populate',use:'word.populateTemplate',connection:s.connection,template:s.template,fields:s.fields},file(n+'_Save',s.output,out(n+'_Populate'))];
    const fields:Record<string,Expr>={fileName:out(n+'_Save','Name'),fileIdentifier:out(n+'_Save','Id'),location:out(n+'_Save','Path')};
    if(s.pdf){actions.push({name:n+'_Ready',use:'control.delay',seconds:60},{name:n+'_PDF',use:'word.convertToPdf',connection:s.connection,source:s.pdf.source,drive:s.pdf.drive,file:s.pdf.file},file(n+'_SavePDF',s.pdf.output,out(n+'_PDF')));fields.pdfIdentifier=out(n+'_SavePDF','Id');fields.pdfLocation=out(n+'_SavePDF','Path');}
    actions.push({name:n,use:'data.object',fields});return actions;
   }
   case 'auditLog':{
    for(const e of [s.entry.before,s.entry.after])if(e.op==='literal'){try{JSON.parse(String(e.value));}catch{fail('Audit before/after literals must contain valid serialized JSON.');}}
    const columns=Object.values(s.columns);if(new Set(columns).size!==columns.length)fail('Audit concepts must map to distinct target columns.');
    const fields=Object.fromEntries(Object.entries(s.entry).map(([key,value])=>[s.columns[key as keyof typeof s.columns],value]));
    return [{...s.destination,name:n,fields}];
   }
   case 'reminder':case 'escalation':{
    if(flow.type!=='recurrence')fail('Reminder/escalation recipes require a recurrence trigger.');
    if(!s.query.top||s.maxItems>s.query.top)fail('Reminder maxItems must not exceed the bounded query top.');
    if(s.recipe==='reminder'&&s.update)fail('Record mutation belongs in an escalation recipe.');
    return [{...s.query,name:n+'_Query'},{name:n,use:'control.applyToEach',from:out(n+'_Query','value'),maxItems:s.maxItems,actions:[{name:n+'_Eligible',use:'control.condition',condition:s.eligibility,actions:[...expandSteps([s.notification],flow,depth+1),...(s.update?[s.update]:[])],otherwise:[]}]}];
   }
   case 'fileRouting':return [{...s.read,name:n+'_Read'},{name:n,use:'control.condition',condition:s.when,actions:[file(n+'_Save',s.output,out(n+'_Read')),...(s.update?[s.update]:[])],otherwise:[]}];
   case 'postSaveAutomation':{
    if((s.commit==='dataverseEvent'&&flow.type!=='dataverse')||(s.commit==='explicitAfterCommit'&&!['powerAppsV2','manual'].includes(flow.type)))fail('Post-save commit contract does not match trigger.');
    return expandSteps(s.steps,flow,depth+1);
   }
   case 'approval':{
    if(s.mode==='create'&&(s.onApproved.length||s.onRejected.length||s.onUnknown.length))fail('Create-only approval cannot branch on a completed result.');
    if(s.mode==='createAndWait'&&!s.persist.length)fail('Split approval requires explicit correlation persistence between create and wait.');
    if(s.persist.some(a=>!['dataverse.addRow','dataverse.updateRow','sharepoint.createItem','sharepoint.updateItem'].includes(a.use)))fail('Approval persistence requires an explicit internal record write.');
    const create=s.mode!=='startAndWait';
    const request:FlowAction={...s.request,name:n+'_Request',use:create?'approvals.create':'approvals.startAndWait'};
    delete request.timeoutHours;if(!create)request.timeoutHours=s.timeoutHours;
    const actions:FlowAction[]=[request,...s.persist];
    if(s.mode==='create')return actions;
    const result=create?n+'_Wait':request.name;
    if(create)actions.push({name:result,use:'approvals.wait',connection:s.request.connection!,approvalId:out(request.name,'name'),timeoutHours:s.timeoutHours});
    actions.push({name:n+'_Responses',use:'approvals.responses',from:out(result,'responses')});
    actions.push({name:n+'_Result',use:'approvals.result',from:out(result),approvalId:out(request.name,'name'),responses:out(n+'_Responses')});
    actions.push({name:n+'_Decision',use:'control.condition',condition:eq(out(n+'_Result','outcome'),'approved'),actions:expandSteps(s.onApproved,flow,depth+1),otherwise:[{name:n+'_Rejected',use:'control.condition',condition:eq(out(n+'_Result','outcome'),'rejected'),actions:expandSteps(s.onRejected,flow,depth+1),otherwise:[{name:n+'_UnknownDecision',use:'control.terminate',value:lit('Unknown')}]}]});
    // A failure/timeout may follow an already-created approval. Never recreate in the recovery branch.
    const recovery=expandSteps(s.onUnknown,flow,depth+1);
    if(flattenActions(recovery).some(a=>['approvals.create','approvals.startAndWait','outlook.sendEmail','sharepoint.createFile','flows.invoke'].includes(a.use)))fail('Unknown approval recovery cannot repeat external effects or invoke an opaque child; reconcile first.');
    return [{name:n,use:'control.scope',actions},{name:n+'_Unknown',use:'control.scope',after:{action:n,statuses:['Failed','TimedOut']},actions:[...recovery,{name:n+'_Uncertain',use:'control.terminate',value:lit('Unknown: inspect approval and correlation before any retry')}]},{name:n+'_Completed',use:'control.scope',after:{action:n+'_Unknown',statuses:['Skipped']},actions:[{name:n+'_Settled',use:'data.compose',value:lit('Outcome branch completed')}]}];
   }
  }
 });
}
export function expandRecipes(source:FlowResources){
 const resources=structuredClone(source),plans:Record<string,unknown>={};
 for(const [key,r]of Object.entries(source.workflowRecipes??{})){
  if(resources.flows[key])fail('Recipe-generated flow collides with a declared flow.');
  const actions:FlowAction[]=[];
  if(r.correlation)actions.push({name:'WorkflowCorrelation',use:'workflow.correlation',fields:r.correlation});
  if(r.idempotency.mode==='ledger'){
   const cfg=r.idempotency,l=resources.workflowLedgers?.[cfg.ledger];if(!l)fail('Missing explicitly configured idempotency ledger.');
   if(!['input','trigger'].includes(cfg.operationKey.op))fail('Ledger operationKey must be a stable caller/source GUID; never a newly generated run identity.');
   if(new Set([l.keyColumn,l.statusColumn,l.workflowColumn,l.sourceColumn]).size!==4)fail('Ledger columns must be distinct.');
   const metadata=resources.flowDataSources?.[l.metadata];if(!metadata||metadata.table!==l.table||metadata.columns[l.keyColumn]?.shape.type!=='guid')fail('Ledger needs a typed GUID primary-key contract.');
   actions.push({name:'ClaimOperation',use:'dataverse.addRow',connection:l.connection,table:l.table,metadata:l.metadata,fields:{[l.keyColumn]:cfg.operationKey,[l.statusColumn]:lit('Claimed'),[l.workflowColumn]:lit(r.flow.logicalName),[l.sourceColumn]:cfg.sourceId},retry:{policy:'none'},idempotency:{mode:'targetIdentity',rationale:'Atomic primary-key claim. Duplicate or uncertain claim stops before business effects.'}});
  }
  actions.push(...expandSteps(r.steps,r.flow.trigger));
  // Completion must not run when an error recovery scope succeeded: ledger remains Claimed for reconciliation.
  if(r.idempotency.mode==='ledger'&&flattenActions(actions).some(a=>a.after))fail('Ledger recipes with explicit runAfter/recovery branches are not supported; keep the claim unresolved on failure.');
  if(r.idempotency.mode==='ledger'){
   const l=resources.workflowLedgers![r.idempotency.ledger]!;
   actions.push({name:'CompleteOperation',use:'dataverse.updateRow',connection:l.connection,table:l.table,metadata:l.metadata,id:r.idempotency.operationKey,fields:{[l.statusColumn]:lit('Completed')},retry:{policy:'none'}});
  }
  if(r.response)actions.push({name:'Respond',use:r.flow.role==='child'?'flows.respond':'powerApps.respond',fields:r.response});
  const calls=flattenActions(actions).filter(a=>a.use==='flows.invoke').map(a=>a.flow!);
  resources.flows[key]=flowSchema.parse({...r.flow,actions,dependencies:[...new Set([...r.flow.dependencies,...calls])]});
  const primitive=flattenActions(actions);
  plans[key]={purpose:r.purpose,recipes:r.steps.map(s=>s.recipe),generatedFlows:[key],primitiveActions:primitive.map(a=>({name:a.name,use:a.use,after:a.after??null})),actionGraph:actions,longRunning:primitive.some(a=>['approvals.wait','approvals.startAndWait'].includes(a.use)),lifecycle:primitive.some(a=>a.use.startsWith('approvals.'))?['Pending','ApprovalCreated','Waiting','Approved','Rejected','Failed','Unknown']:['Pending','Running','Succeeded','Failed','Unknown'],idempotency:r.idempotency,correlation:r.correlation??null,retries:'No automatic external write retries; unknown effects require reconciliation',activation:'MANUAL',warnings:[...(primitive.length>30?['Large recipe: extract reusable work into typed child workflows.']:[]),...(!r.correlation?['Correlation is not persisted or propagated by this recipe.']:[])]};
 }
 return {resources,plans};
}
export function externalManifest(r:FlowResources){return {solutionResources:{flows:Object.keys(r.flows),connectionReferences:Object.keys(r.connectionReferences),environmentVariableDefinitions:Object.keys(r.environmentVariables)},environmentConfiguration:['connection bindings','environment current values','run-only/persona authorization'],externalResources:Object.entries(r.documentTemplates??{}).map(([key,t])=>({kind:'wordTemplate',key,location:t.source,library:t.drive,file:t.file,fields:t.fields,solutionContained:false})),ledgerResources:Object.entries(r.workflowLedgers??{}).map(([key,l])=>({key,table:l.table,primaryKey:l.keyColumn,provisionedByCompiler:false})),runtimeAuthorization:'RUN-ONLY / PERSONA AUTHORIZATION UNPROVEN',crossEnvironmentImportProven:false};}
