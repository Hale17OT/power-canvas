import {it,expect} from 'vitest';
import {loadProject} from '../src/config/load.js';
import {compileFlows} from '../src/flows/compile.js';
import {flowResourcesSchema,flowSchema,actionSchema,executionPolicySchema} from '../src/flows/schema.js';
import type {Expr,FlowAction,DataSource} from '../src/flows/schema.js';
import {connectorOperations,triggerRegistry,validateFileName,validateFilePath} from '../src/flows/providers.js';
import {discoverSharePointSource,discoverDataverseSource,validateFlowMetadata} from '../src/flows/metadata.js';
import {dependencyGraph,portabilityAudit,validateTestTarget,requireExecutionPolicy} from '../src/flows/safety.js';
import {planFlows} from '../src/flows/plan.js';
import {setFlowState} from '../src/flows/apply.js';
import {sharePointMetadataReader} from '../src/flows/connections.js';
import {validateValue} from '../src/flows/expressions.js';
import {canvasInvocation} from '../src/flows/canvas.js';
import {readFile} from 'node:fs/promises';
const base=(await loadProject('examples/canvas-native-complaints')).project;
const guid='11111111-1111-4111-8111-111111111111';
const lit=(value:string|number|boolean,type:'string'|'guid'|'email'|'integer'|'boolean'='string'):Expr=>({op:'literal',value,shape:{type}});
const env=(name:string):Expr=>({op:'environment',name});
const column=(type:'string'|'guid'|'integer'|'boolean',required=false)=>({shape:{type},required,readable:true,create:true,update:true});
const dv:DataSource={connector:'shared_commondataserviceforapps',table:'pfx_testrows',logicalName:'pfx_testrow',kind:'table',columns:{pfx_title:column('string',true),pfx_id:column('guid'),pfx_priority:{...column('integer'),choices:[1,2]},pfx_enabled:column('boolean')}};
const sp:DataSource={connector:'shared_sharepointonline',table:'TestList',kind:'list',columns:{Title:column('string',true),ID:{...column('integer'),create:false,update:false},State:{...column('string'),choices:['Open','Done']}}};
const response={name:'Respond',use:'powerApps.respond',fields:{ok:lit(true,'boolean')}};
function fixture(actions:FlowAction[],write=true){const p=structuredClone(base);p.resources=flowResourcesSchema.parse({
 connectionReferences:{dv:{logicalName:'pfx_V2DV',displayName:'V2 DV',connector:dv.connector,allowCreate:true},sp:{logicalName:'pfx_V2SP',displayName:'V2 SP',connector:sp.connector,allowCreate:true},mail:{logicalName:'pfx_V2Mail',displayName:'V2 mail',connector:'shared_office365',allowCreate:true}},
 environmentVariables:{site:{logicalName:'pfx_V2Site',displayName:'Site',type:'text'},list:{logicalName:'pfx_V2List',displayName:'List',type:'text'},mailbox:{logicalName:'pfx_V2Mailbox',displayName:'Mailbox',type:'text',format:'email'}},
 flowDataSources:{dv,sp,library:{...sp,table:'Documents',kind:'library'}},
 flows:{proof:{logicalName:'pfx_V2Proof',displayName:'V2 proof',flowType:'instant',trigger:{type:'powerAppsV2'},outputs:[{name:'ok',shape:{type:'boolean'}}],actions:[...actions,response],connectionReferences:[...new Set(actions.map(a=>a.connection).filter(Boolean))],environmentVariables:['site','list','mailbox'],runPolicy:{mode:write?'controlledWrite':'readOnly'}}}
});return p;}
const update=():FlowAction=>({name:'Update',use:'dataverse.updateRow',connection:'dv',table:dv.table,metadata:'dv',id:lit(guid,'guid'),fields:{pfx_title:lit('changed')}});
const email=():FlowAction=>({name:'Email',use:'outlook.sendEmail',connection:'mail',to:[env('mailbox')],subject:lit('V2 proof'),body:lit('Not executed')});
const compiled=(p:typeof base)=>compileFlows(p).flows.proof!;
it('uses real update-only operation instead of upsert and correct connector input envelope',()=>{
 const f=compiled(fixture([update()]));expect(f.clientdata.properties.definition.actions.Update).toMatchObject({type:'OpenApiConnection',inputs:{host:{operationId:'UpdateOnlyRecord'},parameters:{entityName:dv.table,recordId:"@'"+guid+"'",'item/pfx_title':"@'changed'"},authentication:"@parameters('$authentication')",retryPolicy:{type:'none'}}});expect(f.risk).toBe('WRITE_INTERNAL');
});
it('rejects a read-only declaration containing nested writes',()=>{const p=fixture([{name:'Branch',use:'control.condition',condition:lit(true,'boolean'),actions:[update()],otherwise:[]}],false);p.resources!.flows.proof!.connectionReferences=['dv'];expect(()=>compiled(p)).toThrow('controlledWrite');});
it.each(['missing','wrong','empty','type','choice','lookup','table'])('rejects invalid Dataverse write contract: %s',mode=>{
 const a=update(),p=fixture([a]);const action=p.resources!.flows.proof!.actions[0]!;
 if(mode==='missing')delete action.id;
 if(mode==='wrong')action.connection='mail';
 if(mode==='empty')action.fields={};
 if(mode==='type')action.fields={pfx_title:lit(1,'integer')};
 if(mode==='choice')action.fields={pfx_priority:lit(99,'integer')};
 if(mode==='lookup'){p.resources!.flowDataSources!.dv!.columns.pfx_lookup={...column('guid'),shape:{type:'recordRef'}};action.fields={pfx_lookup:{op:'literal',shape:{type:'recordRef'},value:guid}};}
 if(mode==='table')action.table='unrelatedrows';
 expect(()=>compiled(p)).toThrow();
});
it('rejects display names and missing required create columns; accepts valid typed choices',()=>{
 const a:FlowAction={name:'Add',use:'dataverse.addRow',connection:'dv',table:dv.table,metadata:'dv',fields:{pfx_priority:lit(1,'integer')}};
 expect(()=>compiled(fixture([a]))).toThrow('Required');a.fields={Title:lit('bad')};expect(()=>compiled(fixture([a]))).toThrow();a.fields={pfx_title:lit('test'),pfx_priority:lit(2,'integer'),pfx_enabled:lit(true,'boolean')};expect(compiled(fixture([a])).risk).toBe('WRITE_INTERNAL');
});
it('propagates metadata column types and preserves branch output scope',()=>{
 const a=update();const p=fixture([a,{name:'Title',use:'data.compose',value:{op:'output',name:'Update',path:['pfx_title']}}]);expect(compiled(p).clientdata.properties.definition.actions.Title).toMatchObject({inputs:"@body('Update')?['pfx_title']"});p.resources!.flows.proof!.actions[1]!.value={op:'output',name:'Update',path:['DisplayName']};expect(()=>compiled(p)).toThrow('Unknown typed field');
});
it('uses discovered read shapes in a bounded write loop and rejects an escaped inner output',()=>{
 const read:FlowAction={name:'Read',use:'dataverse.listRows',connection:'dv',table:dv.table,metadata:'dv',select:['pfx_id'],top:3};
 const inner=update();inner.id={op:'item',path:['pfx_id']};
 const loop:FlowAction={name:'Loop',use:'control.applyToEach',from:{op:'output',name:'Read',path:['value']},maxItems:3,actions:[inner]};
 const p=fixture([read,loop]);p.resources!.flows.proof!.connectionReferences=['dv'];
 expect(compiled(p).clientdata.properties.definition.actions.Loop).toMatchObject({foreach:"@take(body('Read')?['value'],3)",runtimeConfiguration:{concurrency:{repetitions:1}}});
 expect(compiled(p).safety.warnings.join(' ')).toContain('bounded to 3');
 p.resources!.flows.proof!.actions.splice(2,0,{name:'Escape',use:'data.compose',value:{op:'output',name:'Update'}});expect(()=>compiled(p)).toThrow('outside scope');
});
it('compiles all seven bounded SharePoint operations with file/item distinctions',()=>{
 const common={connection:'sp',site:env('site')};
 const cases:FlowAction[]=[{...common,name:'Get',use:'sharepoint.getItems',list:env('list'),metadata:'sp',top:5},{...common,name:'Meta',use:'sharepoint.getFileMetadata',id:lit('file-identifier')},{...common,name:'Content',use:'sharepoint.getFileContent',id:lit('file-identifier')},{...common,name:'Add',use:'sharepoint.createItem',list:env('list'),metadata:'sp',fields:{Title:lit('test')}},{...common,name:'Update',use:'sharepoint.updateItem',list:env('list'),metadata:'sp',id:lit(2,'integer'),fields:{State:lit('Done')}},{...common,name:'File',use:'sharepoint.createFile',folder:lit('/Documents/PowerCanvas'),fileName:lit('test.txt'),content:{op:'output',name:'Content'}},{...common,name:'Properties',use:'sharepoint.updateFileProperties',list:env('list'),metadata:'library',id:lit(2,'integer'),fields:{Title:lit('test')}}];
 const f=compiled(fixture(cases));for(const a of cases)expect(f.clientdata.properties.definition.actions[a.name]).toMatchObject({inputs:{host:{operationId:connectorOperations[a.use]!.operation},parameters:{dataset:"@parameters('pfx_V2Site')"}}});expect(f.clientdata.properties.definition.actions.File).toMatchObject({inputs:{parameters:{body:"@body('Content')"}}});
});
it.each(['../escape','/Documents/../escape','/Documents/%2e%2e','https://example.test','/Documents?x=1'])('rejects unsafe file folders %s',path=>expect(()=>validateFilePath(path)).toThrow());
it.each(['../file','a/b.txt','a\\b.txt','x?.txt',''])('rejects unsafe filenames %s',name=>expect(()=>validateFileName(name)).toThrow());
it('does not allow item IDs as file identifiers or files as lists',()=>{
 const a:FlowAction={name:'Get',use:'sharepoint.getFileContent',connection:'sp',site:env('site'),id:lit(1,'integer')};expect(()=>compiled(fixture([a],false))).toThrow('parameter type');
 const b:FlowAction={name:'Update',use:'sharepoint.updateFileProperties',connection:'sp',site:env('site'),list:env('list'),metadata:'sp',id:lit(1,'integer'),fields:{Title:lit('test')}};expect(()=>compiled(fixture([b]))).toThrow('kind mismatch');
});
it('rejects unbounded SharePoint list requests',()=>{expect(actionSchema.safeParse({name:'Get',use:'sharepoint.getItems',connection:'sp',site:env('site'),list:env('list'),metadata:'sp'}).success).toBe(false);});
it('compiles typed Outlook recipients without permitting delimiter injection',()=>{
 const p=fixture([email()]),f=compiled(p);expect(f.risk).toBe('WRITE_EXTERNAL');expect(f.clientdata.properties.definition.actions.Email).toMatchObject({inputs:{parameters:{'emailMessage/To':"@join(createArray(parameters('pfx_V2Mailbox')),';')"}}});expect(f.safety.executionBlockers.length).toBe(1);
 for(const value of ['', 'one@example.test;two@example.test','one@example.test\r\nBCC:two@example.test']){p.resources!.flows.proof!.actions[0]!.to=[lit(value,'email')];expect(()=>compiled(p)).toThrow();}
 p.resources!.flows.proof!.actions[0]!.to=[];expect(()=>compiled(p)).toThrow();
});
it('rejects delete/HTTP/approval actions regardless of execution policy',()=>{for(const use of ['dataverse.deleteRow','sharepoint.deleteFile','http.request','approvals.start'])expect(actionSchema.safeParse({name:'Bad',use}).success).toBe(false);expect(executionPolicySchema.safeParse({allowDestructive:true}).success).toBe(false);});
it.each(['rowAdded','rowModified','rowAddedOrModified','rowDeleted'] as const)('compiles documented Dataverse trigger %s with typed body scope',changeType=>{
 const p=fixture([{name:'Event',use:'data.compose',value:{op:'trigger',path:['pfx_id']}}],false),f=p.resources!.flows.proof!;f.flowType='automated';f.trigger={type:'dataverse',connection:'dv',table:dv.table,metadata:'dv',changeType,scope:'user'};f.inputs=[];f.outputs=[];f.actions.pop();f.connectionReferences=['dv'];
 expect(compiled(p).clientdata.properties.definition.triggers.manual).toMatchObject({type:'OpenApiConnectionWebhook',inputs:{parameters:{'subscriptionRequest/message':triggerRegistry.changes[changeType],'subscriptionRequest/entityname':dv.logicalName,'subscriptionRequest/scope':1}}});
});
it('matches Microsoft CallbackRegistration change constants, including modified versus deleted',()=>expect(triggerRegistry.changes).toEqual({rowAdded:1,rowDeleted:2,rowModified:3,rowAddedOrModified:4}));
it('blocks nested self-triggering updates and warns about indirect cycles',()=>{
 const p=fixture([update()]),f=p.resources!.flows.proof!;f.flowType='automated';f.trigger={type:'dataverse',connection:'dv',table:dv.table,metadata:'dv',changeType:'rowModified',scope:'organization',selectColumns:['pfx_title']};f.outputs=[];f.actions.pop();expect(()=>compiled(p)).toThrow('Self-trigger');f.trigger.selectColumns=['pfx_enabled'];expect(compiled(p).safety.warnings.join(' ')).toContain('plugins');f.trigger.selectColumns=['display_name'];expect(()=>compiled(p)).toThrow('select column');
});
it('escapes bounded OData filters and rejects raw dynamic filter expressions',()=>{
 const a:FlowAction={name:'Get',use:'sharepoint.getItems',connection:'sp',site:env('site'),list:env('list'),metadata:'sp',top:5,filter:{column:'Title',operator:'eq',value:lit("O'Brien")}};
 expect(compiled(fixture([a],false)).clientdata.properties.definition.actions.Get).toMatchObject({inputs:{parameters:{'$filter':"Title eq 'O''Brien'"}}});a.filter!.value=env('site');expect(()=>compiled(fixture([a],false))).toThrow('typed literals');
});
it('keeps retries conservative and treats idempotency as guidance, not exactly-once enforcement',()=>{
 const a=update();a.retry={policy:'default'};expect(()=>compiled(fixture([a]))).toThrow('automatic write retries');a.retry={policy:'none'};a.idempotency={mode:'targetIdentity',rationale:'Operator reconciles this exact row before resubmission.'};const s=compiled(fixture([a])).safety;expect(s.exactlyOnce).toBe(false);expect(s.warnings.join(' ')).toContain('not an implemented');
});
it('denies activation before any remote call when write execution policy is absent',async()=>{
 const p=fixture([email()]);let calls=0;
 await expect(setFlowState(p,{tenantId:guid,environmentId:guid,organizationId:guid,dataverseUrl:'https://example.crm.dynamics.com'},'proof',true,{environmentId:guid,connections:{},environmentValues:{}},{request:async()=>{calls++;throw Error();},all:async()=>{calls++;return [];}},{read:async()=>{throw Error();},save:async()=>{throw Error();}})).rejects.toThrow('execution policy');expect(calls).toBe(0);
});
it('validates Dataverse live column types before any mutation',async()=>{
 const p=fixture([update()]);let writes=0;
 const http={all:async(path:string)=>path.includes('/Attributes?')?[{LogicalName:'pfx_title',AttributeType:'Integer',IsValidForRead:true,IsValidForCreate:true,IsValidForUpdate:true,RequiredLevel:{Value:'ApplicationRequired'}}]:[{MetadataId:guid,LogicalName:dv.logicalName,EntitySetName:dv.table}],request:async()=>{writes++;throw Error('Forbidden');}};
 await expect(validateFlowMetadata(p,http)).rejects.toThrow('metadata changed');expect(writes).toBe(0);
});
it('discovers SharePoint internal field names and rejects required unsupported complex types',async()=>{
 let complex=false;const reader={read:async(_site:string,path:string)=>path.includes('/Fields?')?{value:[{InternalName:'Title',TypeAsString:complex?'User':'Text',Required:true,ReadOnlyField:false,Hidden:false}]}:{Id:guid,BaseType:0,EntityTypeName:'TestList'}};
 const m=await discoverSharePointSource(reader,'https://example.sharepoint.com/sites/test',guid);expect(m.columns.Title?.shape.type).toBe('string');complex=true;await expect(discoverSharePointSource(reader,'https://example.sharepoint.com/sites/test',guid)).rejects.toThrow('complex');await expect(discoverSharePointSource(reader,'https://example.sharepoint.com/sites/test','Display name')).rejects.toThrow('GUID');
});
it('refuses missing SharePoint metadata credentials and prevents cross-site token escape',async()=>{
 const p=fixture([{name:'Get',use:'sharepoint.getFileMetadata',connection:'sp',site:env('site'),id:lit('file')}],false);await expect(validateFlowMetadata(p,{all:async()=>[],request:async()=>{throw Error();}})).rejects.toThrow('BLOCKED');let tokens=0;const r=sharePointMetadataReader({token:async()=>{tokens++;return 'never-exported';}});await expect(r.read('https://example.sharepoint.com/sites/test','https://evil.test')).rejects.toThrow('boundary');expect(tokens).toBe(0);
});
it('reports hardcoded configuration while permitting documented intentional constants',()=>{
 const p=fixture([email()]);p.resources!.flows.proof!.actions[0]!.to=[lit('test@example.test','email')];expect(portabilityAudit(p.resources!).portable).toBe(false);p.resources!.flows.proof!.actions[0]!.to![0]!.intentionalConstant='Dedicated test address supplied by the operator.';expect(portabilityAudit(p.resources!).portable).toBe(true);
});
it('builds dependencies and catches missing/cyclic child flow declarations',()=>{
 const p=fixture([update(),email()]);const graph=dependencyGraph(p.resources!);expect(graph.edges).toContainEqual({from:'flow:proof',to:'table:pfx_testrows'});p.resources!.flows.proof!.dependencies=['proof'];expect(dependencyGraph(p.resources!).cyclic).toBe(true);expect(()=>compiled(p)).toThrow('Child-flow');
});
it.each(['missing','wrongConnector','wrongEnvironment','unverified','missingEvidence'])('blocks unproven connection binding: %s',mode=>{
 const p=fixture([email()]);p.resources!.connectionReferences={mail:p.resources!.connectionReferences.mail!};p.resources!.environmentVariables={mailbox:p.resources!.environmentVariables.mailbox!};p.resources!.flows.proof!.environmentVariables=['mailbox'];
 const target={tenantId:guid,environmentId:guid,organizationId:guid,dataverseUrl:'https://example.crm.dynamics.com'};
 const binding={connectionId:'owned-connection',connector:'shared_office365' as const,environmentId:guid,principalId:guid,authorizationVerified:mode!=='unverified',authorizationEvidence:'Explicit owner-reviewed connection authorization.'};
 const d={environmentId:guid,connections:mode==='missing'?{}:{mail:{...binding,...(mode==='wrongConnector'?{connector:'shared_sharepointonline' as const}:{}),...(mode==='wrongEnvironment'?{environmentId:'other'}:{}),...(mode==='missingEvidence'?{authorizationEvidence:undefined}:{})}},environmentValues:{mailbox:'test@example.test'}};
 const plan=planFlows(p,target,{solutionId:guid,solutionName:p.solution.uniqueName,publisher:p.solution.publisher.uniqueName,resources:[]},{projectId:p.project.id,target,entries:{}},d);expect(plan.executable).toBe(false);expect(plan.operations.find(o=>o.kind==='connection')?.status).toBe('BLOCKED');
});
it('keeps disabled deployment available while execution policy denies external effects',()=>{
 const p=fixture([email()]);p.resources!.connectionReferences={mail:p.resources!.connectionReferences.mail!};p.resources!.environmentVariables={mailbox:p.resources!.environmentVariables.mailbox!};p.resources!.flows.proof!.environmentVariables=['mailbox'];const target={tenantId:guid,environmentId:guid,organizationId:guid,dataverseUrl:'https://example.crm.dynamics.com'};
 const plan=planFlows(p,target,{solutionId:guid,solutionName:p.solution.uniqueName,publisher:p.solution.publisher.uniqueName,resources:[]},{projectId:p.project.id,target,entries:{}},{environmentId:guid,connections:{mail:{connectionId:'owned-connection',connector:'shared_office365',environmentId:guid,principalId:guid,authorizationVerified:true,authorizationEvidence:'Explicit owner-reviewed connection authorization.'}},environmentValues:{mailbox:'test@example.test'}});expect(plan.executable).toBe(true);expect(plan.risk!.proof!.risk).toBe('WRITE_EXTERNAL');expect(plan.risk!.proof!.executionBlockers.length).toBe(1);expect(plan.remoteMutations).toBe(0);
});
it('requires a source-bound complete safe test context and safe to/cc/bcc recipients',()=>{
 const p=fixture([email()]);p.resources!.executionPolicy=executionPolicySchema.parse({allowExternalWrite:true});const a=p.resources!.flows.proof!.actions[0]!;a.to=[lit('test@example.test','email')];const f=compiled(p),input={environmentId:guid,flow:'proof',definitionHash:f.definitionHash,targets:[{action:'Email',resource:'test@example.test',expectedMutation:'Send exactly one controlled test email.'}],rollback:'Email cannot be recalled; recipient approved for this test.',operatorAuthorization:'Explicit operator test authorization.',safeRecipients:['test@example.test']};
 expect(validateTestTarget(input,'proof',p.resources!.flows.proof!,p.resources!,guid,f.definitionHash).executionPerformed).toBe(false);expect(()=>validateTestTarget({...input,safeRecipients:[]},'proof',p.resources!.flows.proof!,p.resources!,guid,f.definitionHash)).toThrow('safe literal');expect(()=>validateTestTarget({...input,environmentId:'other'},'proof',p.resources!.flows.proof!,p.resources!,guid,f.definitionHash)).toThrow('different');
});
it.skipIf(process.env.POWERCANVAS_PRIVATE_EVIDENCE !== '1')('preserves the deployed V1 pilot definition exactly',async()=>{
 const prior=JSON.parse(await readFile('experiments/flows-v1-20260921/exported-flow.json','utf8'));
 const current=compileFlows(base).flows.complaintChangeContract!.clientdata;
 expect(current.properties.definition).toEqual(prior.properties.definition);
});
it('requires explicit write lifecycle and prevents automatic retry in Canvas invocation',()=>{
 const p=fixture([email()]);p.resources!.executionPolicy=executionPolicySchema.parse({allowExternalWrite:true});p.resources!.canvasBindings=[{app:'complaintPortal',flow:'proof',alias:'V2Write'}];const input={appId:p.canvasApps!.complaintPortal!.application!.existingAppId,alias:'V2Write',workflowId:guid,arguments:{},resultVariable:'writeResult'};expect(()=>canvasInvocation(p,input)).toThrow('lifecycle');
 p.resources!.canvasBindings[0]!.command={name:'V2Write',parent:'ExistingPanel',label:'Send',description:'Explicit user action',arguments:{},fields:[],messageOutput:'message',successOutput:'ok',disabled:'false',lifecycle:{submitLabel:'Send',busyLabel:'Sending',completion:'response',retry:'manualReconcile'}};
 const f=canvasInvocation(p,input);expect(f.formula).toContain('!writeResult_attempted');expect(f.formula).toContain('Outcome unknown');expect(f.formula).toContain('IfError');expect(f.formula).toContain('Set(writeResult_busy, false)');
 p.resources!.executionPolicy.allowExternalWrite=false;expect(()=>canvasInvocation(p,input)).toThrow('execution policy');
});
it('rejects unsupported trigger properties and automated Power Apps ports',()=>{
 const p=fixture([]);const f=p.resources!.flows.proof!;expect(flowSchema.safeParse({...f,trigger:{type:'dataverse',connection:'dv',table:dv.table,metadata:'dv',changeType:'rowModified',scope:'user',raw:'anything'}}).success).toBe(false);expect(()=>requireExecutionPolicy({...f,runPolicy:{mode:'readOnly',maxActions:100},actions:[email()]},p.resources!)).toThrow();
});

it('rejects impossible calendar dates and ambiguous datetimes',()=>{
 expect(validateValue('2026-02-30',{type:'date'})).toBe(false);expect(validateValue('2026-09-21',{type:'date'})).toBe(true);expect(validateValue('2026-09-21T12:00:00',{type:'datetime'})).toBe(false);expect(validateValue('2026-09-21T12:00:00+03:00',{type:'datetime'})).toBe(true);
});
it('discovers date-only columns separately from datetime columns',async()=>{
 const metadata=await discoverDataverseSource({request:async()=>{throw Error('No mutation allowed');},all:async path=>path.includes('DateTimeAttributeMetadata')?[{LogicalName:'pfx_due',Format:'DateOnly'}]:path.includes('/Attributes?')?[{LogicalName:'pfx_due',AttributeType:'DateTime',IsValidForRead:true,IsValidForCreate:true,IsValidForUpdate:true,RequiredLevel:{Value:'None'}}]:[{MetadataId:guid,LogicalName:'pfx_row',EntitySetName:'pfx_rows'}]},'pfx_rows');expect(metadata.columns.pfx_due!.shape.type).toBe('date');
});
