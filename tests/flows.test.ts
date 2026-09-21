import {it,expect} from 'vitest';
import {loadProject} from '../src/config/load.js';
import {compileFlows} from '../src/flows/compile.js';
import {flowSchema,flowResourcesSchema,expressionSchema} from '../src/flows/schema.js';
import {expression} from '../src/flows/expressions.js';
import type {ExpressionContext} from '../src/flows/expressions.js';
import {planFlows} from '../src/flows/plan.js';
import type {FlowOwnership} from '../src/flows/plan.js';
import {discoverFlows,resourceKinds} from '../src/flows/remote.js';
import type {FlowHttp,ResourceKind} from '../src/flows/remote.js';
import {applyFlows,setFlowState,reconcileFlowState,flowTargetPolicy} from '../src/flows/apply.js';
import {canvasInvocation,planCanvasInvocationPatch,validateCanvasArgument} from '../src/flows/canvas.js';
import {hashJson} from '../src/core/json.js';
import type {Target} from '../src/state/models.js';
import {composeFlowCommands} from '../src/flows/native.js';
import {compileNativeCanvas} from '../src/canvas/native.js';
import {nativeBindingsSchema} from '../src/canvas/native-types.js';
import {readFile} from 'node:fs/promises';
import {controls,compareBehavior,dependencies} from '../src/canvas/taste/audit.js';
import {validateFlowMetadata} from '../src/flows/metadata.js';
const {project}=await loadProject('examples/canvas-native-complaints');
const target:Target={tenantId:'11111111-1111-4111-8111-111111111111',environmentId:'default-11111111-1111-4111-8111-111111111111',organizationId:'22222222-2222-4222-8222-222222222222',dataverseUrl:'https://example.crm.dynamics.com'};
const deployment={environmentId:target.environmentId,connections:{},environmentValues:{}};
const solutionId='33333333-3333-4333-8333-333333333333',owner='44444444-4444-4444-8444-444444444444';
it('rejects hidden behavior in Canvas arguments while permitting bounded pure bindings',()=>{
 for(const formula of ['OtherFlow.Run("x")','RemoveIf(Complaints,true)','Concurrent(Set(x,1))','Select(button)','Launch("https://example.test")'])expect(()=>validateCanvasArgument(formula)).toThrow();
 expect(()=>validateCanvasArgument('Coalesce(Trim(reason.Value), "test")')).not.toThrow();
});
it('compiles connector reads and verifies selected types against target metadata',async()=>{
 const p=structuredClone(project),f=p.resources!.flows.complaintChangeContract!;
 p.resources!.connectionReferences.dv={logicalName:'pfx_ReadOnlyDV',displayName:'Read-only DV',connector:'shared_commondataserviceforapps',allowCreate:true};f.connectionReferences=['dv'];
 const shape={type:'object' as const,fields:{title:{type:'string' as const}}};
 f.actions.unshift({name:'Get',use:'dataverse.getRow',connection:'dv',table:'pfx_experimentcomplaints',id:{op:'input',name:'complaintId'},select:['title'],shape},{name:'List',use:'dataverse.listRows',connection:'dv',table:'pfx_experimentcomplaints',select:['title'],top:5,shape});
 expect(compileFlows(p).flows.complaintChangeContract!.clientdata.properties.definition.actions.List).toMatchObject({type:'OpenApiConnection',inputs:{host:{operationId:'ListRecords'},parameters:{'$top':5}}});
 let type='String';const http:FlowHttp={all:async path=>path.includes('/Attributes?')?[{LogicalName:'title',AttributeType:type,IsValidForRead:true}]:[{MetadataId:owner}],request:async()=>{throw Error('No remote write allowed');}};
 expect(await validateFlowMetadata(p,http)).toEqual({checkedActions:2,remoteWrites:0});type='Integer';await expect(validateFlowMetadata(p,http)).rejects.toThrow('different live type');
});
it('compiles conditional and variable-set actions while isolating branch outputs',()=>{
 const p=structuredClone(project),f=p.resources!.flows.complaintChangeContract!;
 f.actions.unshift({name:'InitializeFlag',use:'variables.initialize',variable:'flag',shape:{type:'boolean'},value:{op:'literal',shape:{type:'boolean'},value:false}},{name:'Branch',use:'control.condition',condition:{op:'literal',shape:{type:'boolean'},value:true},actions:[{name:'SetFlag',use:'variables.set',variable:'flag',value:{op:'literal',shape:{type:'boolean'},value:true}},{name:'Local',use:'data.compose',value:{op:'variable',name:'flag'}}],otherwise:[]});
 expect(compileFlows(p).flows.complaintChangeContract!.clientdata.properties.definition.actions.Branch).toMatchObject({type:'If'});f.actions[2]!.value={op:'output',name:'Local'};expect(()=>compileFlows(p)).toThrow('outside scope');
});
function setup(){
 const records:Record<ResourceKind,Record<string,unknown>[]>={flow:[],connection:[],environment:[],environmentValue:[]};const members:Record<string,unknown>[]=[];const writes:{path:string;method:string;body:unknown}[]=[];let revision=1;
 const http:FlowHttp={all:async(path)=>{if(path.startsWith('solutions?'))return [{solutionid:solutionId,uniquename:project.solution.uniqueName,ismanaged:false,_publisherid_value:owner}];if(path.startsWith('solutioncomponents?'))return structuredClone(members);for(const [kind,meta]of Object.entries(resourceKinds))if(path.startsWith(meta.set+'?'))return structuredClone(records[kind as ResourceKind]);throw Error(path);},request:async(path,method='GET',body,headers)=>{
   if(path.startsWith('publishers('))return {data:{uniquename:project.solution.publisher.uniqueName,customizationprefix:project.solution.publisher.prefix},requestId:'test'};
   if(method==='GET'){for(const [kind,meta]of Object.entries(resourceKinds))if(path.startsWith(meta.set+'('))return {data:structuredClone(records[kind as ResourceKind].find(r=>r[meta.id]===path.match(/\(([^)]+)\)/)![1])),requestId:'test'};}
   writes.push({path,method,body});const b=body as Record<string,unknown>;
   if(path==='AddSolutionComponent'){members.push({objectid:b.ComponentId,componenttype:b.ComponentType,_solutionid_value:solutionId});return {data:null,requestId:'test'};}
   for(const [k,meta]of Object.entries(resourceKinds)){const kind=k as ResourceKind;if(path===meta.set&&method==='POST'){const row:Record<string,unknown>={...b,ismanaged:false,_ownerid_value:kind==='flow'||kind==='connection'?owner:undefined,'@odata.etag':`W/"${revision++}"`};if(kind==='environmentValue')row._environmentvariabledefinitionid_value=String(b['EnvironmentVariableDefinitionId@odata.bind']).match(/\(([^)]+)\)/)![1];records[kind].push(row);return {data:null,requestId:'test'};}
    if(path.startsWith(meta.set+'(')&&method==='PATCH'){const id=path.match(/\(([^)]+)\)/)![1];const row=records[kind].find(r=>r[meta.id]===id)!;if(headers?.['If-Match']!==row['@odata.etag'])throw Error('etag');Object.assign(row,b,{'@odata.etag':`W/"${revision++}"`});return {data:null,requestId:'test'};}}
   throw Error(path);
 }};
 let state:FlowOwnership={projectId:project.project.id,target,entries:{}};const store={read:async()=>structuredClone(state),save:async(s:FlowOwnership)=>{state=structuredClone(s);}};
 const plan=async(p=project)=>planFlows(p,target,await discoverFlows(http,p),await store.read(),deployment);
 return {http,store,records,members,writes,plan};
}
it('strictly rejects unsupported triggers, actions, raw expressions and undeclared fields',()=>{
 const source=project.resources!.flows.complaintChangeContract!;
 for(const edit of [{...source,trigger:{type:'desktop'}},{...source,actions:[{name:'Mail',use:'outlook.sendEmail'}]},{...source,unknown:true}])expect(flowSchema.safeParse(edit).success).toBe(false);
 expect(expressionSchema.safeParse({op:'raw',value:"triggerBody()"}).success).toBe(false);
 expect(flowResourcesSchema.safeParse({environmentVariables:{secret:{logicalName:'pfx_Secret',displayName:'Secret',type:'secret',default:'no'}}}).success).toBe(false);
});
it('reconciles state-only failures without remote writes and never adopts an uncertain create',async()=>{
 const s=setup();await applyFlows(project,target,await s.plan(),deployment,s.http,s.store,owner);const state=await s.store.read(),e=state.entries['flow:complaintChangeContract']!;
 state.pending={key:'flow:complaintChangeContract',id:e.id,operation:'ACTIVATE'};await s.store.save(state);const n=s.writes.length;
 expect(await reconcileFlowState(project,target,s.http,s.store)).toMatchObject({completed:false,state:0,remoteWrites:0});expect(s.writes).toHaveLength(n);
 state.pending.operation='CREATE';await s.store.save(state);await expect(reconcileFlowState(project,target,s.http,s.store)).rejects.toThrow();
});
it('permits deactivation after a local edit but blocks activation of unreviewed source',async()=>{
 const s=setup();await applyFlows(project,target,await s.plan(),deployment,s.http,s.store,owner);await setFlowState(project,target,'complaintChangeContract',true,deployment,s.http,s.store);
 const p=structuredClone(project);p.resources!.flows.complaintChangeContract!.description='Pending edit';
 await expect(setFlowState(p,target,'complaintChangeContract',true,deployment,s.http,s.store)).rejects.toThrow();
 await setFlowState(p,target,'complaintChangeContract',false,deployment,s.http,s.store);expect(s.records.flow[0]!.statecode).toBe(0);
});
it('rejects foreign caller updates before mutating and readback mismatches retain the journal',async()=>{
 const s=setup();await applyFlows(project,target,await s.plan(),deployment,s.http,s.store,owner);const p=structuredClone(project);p.resources!.flows.complaintChangeContract!.description='Edit';const n=s.writes.length;
 await expect(applyFlows(p,target,await s.plan(p),deployment,s.http,s.store,solutionId)).rejects.toThrow('caller');expect(s.writes).toHaveLength(n);
 const bad:FlowHttp={all:s.http.all,request:async(...args)=>{const r=await s.http.request(...args);if(args[1]==='PATCH')s.records.flow[0]!.description='Provider altered source';return r;}};
 await expect(applyFlows(p,target,await s.plan(p),deployment,bad,s.store,owner)).rejects.toThrow('Readback');expect((await s.store.read()).pending).toBeDefined();
});
it('requires the isolated Default target and rejects a different environment',async()=>{
 const s=setup();expect(()=>flowTargetPolicy(project,12)).not.toThrow();expect(()=>flowTargetPolicy(project,0)).toThrow();const p=structuredClone(project);p.solution.uniqueName='Wrong';expect(()=>flowTargetPolicy(p,12)).toThrow();
 expect(()=>planFlows(project,{...target,environmentId:'different'},{solutionId,solutionName:project.solution.uniqueName,publisher:'pfx',resources:[]},{projectId:project.project.id,target,entries:{}},deployment)).toThrow('mismatch');expect(s.writes).toHaveLength(0);
});
it('blocks unknown overrides, secret overrides and nested credentials without printing their values',async()=>{
 const s=setup(),snap=await discoverFlows(s.http,project),state=await s.store.read();
 expect(()=>planFlows(project,target,snap,state,{...deployment,environmentValues:{missing:'test'}})).toThrow('Undeclared');
 const p=structuredClone(project);p.resources!.environmentVariables.v={logicalName:'pfx_Secret',displayName:'Secret',type:'secret'};
 expect(()=>planFlows(p,target,snap,state,{...deployment,environmentValues:{v:'private-value'}})).toThrow('never accepted');
 const c:ExpressionContext={inputs:{},outputs:{},variables:{},environment:{}};
 expect(()=>expression({op:'literal',shape:{type:'object',fields:{password:{type:'string'}}},value:{password:'private-value'}},c)).toThrow('Credential');
});
it('reports unresolved environment configuration as blocked and verifies override values',async()=>{
 const s=setup(),p=structuredClone(project);p.resources!.environmentVariables.v={logicalName:'pfx_Endpoint',displayName:'Endpoint',type:'text'};p.resources!.flows.complaintChangeContract!.environmentVariables=['v'];
 const snap=await discoverFlows(s.http,p);expect(planFlows(p,target,snap,await s.store.read(),deployment).operations.find(o=>o.kind==='flow')!.status).toBe('BLOCKED');
 const d={...deployment,environmentValues:{v:'https://example.test'}};const plan=planFlows(p,target,snap,await s.store.read(),d);expect(plan.executable).toBe(true);await applyFlows(p,target,plan,d,s.http,s.store,owner);expect(planFlows(p,target,await discoverFlows(s.http,p),await s.store.read(),d).operations.every(o=>o.status==='NO-OP')).toBe(true);
});
it('compiles projection, filter, parse and variable recipes and rejects uninitialized variables',()=>{
 const p=structuredClone(project),f=p.resources!.flows.complaintChangeContract!;
 f.actions.unshift({name:'Initialize',use:'variables.initialize',variable:'names',shape:{type:'array',items:{type:'string'}},value:{op:'literal',shape:{type:'array',items:{type:'string'}},value:[]}}, {name:'Append',use:'variables.append',variable:'names',value:{op:'literal',shape:{type:'string'},value:'one'}},{name:'Parse',use:'data.parseJson',shape:{type:'array',items:{type:'string'}},value:{op:'literal',shape:{type:'string'},value:'["one"]'}},{name:'Filter',use:'data.filterArray',from:{op:'output',name:'Parse'},condition:{op:'equals',args:[{op:'item'},{op:'literal',shape:{type:'string'},value:'one'}]}},{name:'Select',use:'data.select',from:{op:'output',name:'Filter'},fields:{label:{op:'item'}}});
 expect(compileFlows(p).flows.complaintChangeContract!.actions).toBe(8);f.actions.shift();expect(()=>compileFlows(p)).toThrow('initialized');
});
it('generates native flow controls reproducibly without changing the existing save behavior',async()=>{
 const bindings=nativeBindingsSchema.parse(JSON.parse(await readFile('examples/canvas-native-complaints/bindings.json','utf8')));
 const p=structuredClone(project);p.resources!.canvasBindings=[];const original=compileNativeCanvas(p,'complaintPortal',bindings).files;const files=structuredClone(original);const result=composeFlowCommands(project,'complaintPortal',bindings,files);
 expect(result).toHaveLength(1);expect(compareBehavior(original,files).preserved).toBe(true);expect(dependencies(files).filter(d=>d.formula.includes('SubmitForm('))).toHaveLength(1);expect(controls(files).filter(n=>n.node.Control==='Form')).toHaveLength(1);
 expect(()=>composeFlowCommands(project,'complaintPortal',bindings,files)).toThrow('collision');bindings.flowSources!.ComplaintChangeContract!.contractHash='0'.repeat(64);expect(()=>composeFlowCommands(project,'complaintPortal',bindings,structuredClone(original))).toThrow('contract');
});
it('compiles stable Power Apps V2 ports and a typed response deterministically',()=>{
 const a=compileFlows(project),b=compileFlows(project);expect(a).toEqual(b);const f=a.flows.complaintChangeContract!;
 expect(f.clientdata.schemaVersion).toBe('1.0.0.0');
 expect(f.ports.map(p=>p.wire)).toEqual(['text','text_1','text_2']);expect(f.clientdata.properties.definition.triggers.manual).toMatchObject({type:'Request',kind:'PowerAppV2'});
 expect(f.clientdata.properties.definition.actions.Respond).toMatchObject({type:'Response',kind:'PowerApp',inputs:{body:{accepted:"@outputs('ValidateContract')",message:"@outputs('ContractMessage')"}}});
});
it('rejects type mismatches, forward references and incomplete output contracts',()=>{
 for(const mode of ['type','reference','response']){const p=structuredClone(project);const f=p.resources!.flows.complaintChangeContract!;
 if(mode==='type')f.actions[0]!.value={op:'not',args:[{op:'input',name:'changeSummary'}]};
 if(mode==='reference')f.actions[0]!.value={op:'output',name:'ContractMessage'};
 if(mode==='response')delete f.actions.at(-1)!.fields!.accepted;
 expect(()=>compileFlows(p)).toThrow();}
});
it('checks expression arity, field paths and loop scope and escapes literal expression syntax',()=>{
 const c:ExpressionContext={inputs:{},outputs:{},variables:{},environment:{}};
 expect(()=>expression({op:'item'},c)).toThrow('outside scope');
 expect(()=>expression({op:'not',args:[{op:'literal',shape:{type:'boolean'},value:true},{op:'literal',shape:{type:'boolean'},value:false}]},c)).toThrow('arity');
 expect(expression({op:'literal',shape:{type:'string'},value:"@outputs('Injected')"},c).code).toBe("'@outputs(''Injected'')'");
});
it('compiles bounded loops, isolated condition scopes and scheduled triggers',()=>{
 const p=structuredClone(project);const f=p.resources!.flows.complaintChangeContract!;f.actions.unshift({name:'Loop',use:'control.applyToEach',from:{op:'literal',value:['one','two'],shape:{type:'array',items:{type:'string'}}},maxItems:2,actions:[{name:'Inner',use:'data.compose',value:{op:'item'}}]});
 expect(compileFlows(p).flows.complaintChangeContract!.clientdata.properties.definition.actions.Loop).toMatchObject({type:'Foreach',foreach:"@take(json('[\"one\",\"two\"]'),2)"});
 f.actions[1]!.value={op:'output',name:'Inner'};expect(()=>compileFlows(p)).toThrow('outside scope');
 f.flowType='scheduled';f.trigger={type:'recurrence',frequency:'Day',interval:1,startTime:'2030-01-01T00:00:00Z'};f.inputs=[];f.outputs=[];f.actions=[{name:'Tick',use:'data.compose',value:{op:'literal',shape:{type:'boolean'},value:true}}];p.resources!.canvasBindings=[];
 expect(compileFlows(p).flows.complaintChangeContract!.clientdata.properties.definition.triggers.manual).toMatchObject({type:'Recurrence'});
});
it('plans without remote mutation, creates off in solution, verifies readback, then becomes no-op',async()=>{
 const s=setup();const p=await s.plan();expect(s.writes).toHaveLength(0);expect(p.operations[0]!.status).toBe('CREATE');
 const result=await applyFlows(project,target,p,deployment,s.http,s.store,owner);expect(result.flowsCreated).toBe(1);expect(s.records.flow[0]!.statecode).toBe(0);expect(s.members[0]!.componenttype).toBe(29);expect((await s.plan()).operations[0]!.status).toBe('NO-OP');
 await setFlowState(project,target,'complaintChangeContract',true,deployment,s.http,s.store);expect(s.records.flow[0]!.statecode).toBe(1);
 await setFlowState(project,target,'complaintChangeContract',false,deployment,s.http,s.store);expect(s.records.flow[0]!.statecode).toBe(0);
});
it('blocks collisions without adoption, stale remote edits, active updates and lost ownership',async()=>{
 const s=setup();const p=await s.plan();await applyFlows(project,target,p,deployment,s.http,s.store,owner);
 const changed=structuredClone(project);changed.resources!.flows.complaintChangeContract!.description='Updated controlled description';
 expect((await s.plan(changed)).operations[0]!.status).toBe('UPDATE');await applyFlows(changed,target,await s.plan(changed),deployment,s.http,s.store,owner);expect((await s.plan(changed)).operations[0]!.status).toBe('NO-OP');
 await setFlowState(changed,target,'complaintChangeContract',true,deployment,s.http,s.store);expect((await s.plan()).operations[0]!.status).toBe('BLOCKED');
 s.records.flow[0]!.description='Someone else edited';expect((await s.plan()).operations[0]!.status).toBe('CONFLICT');
 const blank={projectId:project.project.id,target,entries:{}};expect(planFlows(project,target,await discoverFlows(s.http,project),blank,deployment).operations[0]!.status).toBe('CONFLICT');
});
it('retains source-removed resources and rejects forged/stale plans before a write',async()=>{
 const s=setup();const p=await s.plan();const forged=structuredClone(p);forged.operations[0]!.body.name='Overwrite';await expect(applyFlows(project,target,forged,deployment,s.http,s.store,owner)).rejects.toThrow('hash');expect(s.writes).toHaveLength(0);
 await applyFlows(project,target,p,deployment,s.http,s.store,owner);const removed=structuredClone(project);removed.resources!.flows={};removed.resources!.canvasBindings=[];expect((await s.plan(removed)).operations[0]!.status).toBe('ORPHANED');expect(s.writes.some(w=>w.method==='DELETE')).toBe(false);
});
it('keeps an uncertain create journal and blocks automatic retries',async()=>{
 const s=setup();const p=await s.plan();const broken:FlowHttp={all:s.http.all,request:async(...args)=>{if(args[1]==='POST')throw Error('transport lost');return s.http.request(...args);}};
 await expect(applyFlows(project,target,p,deployment,broken,s.store,owner)).rejects.toThrow('transport');expect((await s.store.read()).pending).toBeDefined();expect((await s.plan()).executable).toBe(false);
});
it('blocks unbound connections and creates portable environment dependencies',async()=>{
 const s=setup();const p=structuredClone(project);p.resources!.connectionReferences.dv={logicalName:'pfx_ExperimentDV',displayName:'PowerCanvas DV',connector:'shared_commondataserviceforapps',allowCreate:false};
 expect((await s.plan(p)).operations.find(o=>o.kind==='connection')!.status).toBe('BLOCKED');
 delete p.resources!.connectionReferences.dv;p.resources!.environmentVariables.message={logicalName:'pfx_ExperimentMessage',displayName:'Contract message',type:'text',default:'Portable message'};
 p.resources!.flows.complaintChangeContract!.environmentVariables=['message'];
 const result=await applyFlows(p,target,await s.plan(p),deployment,s.http,s.store,owner);expect(result.environmentVariablesCreated).toBe(1);expect(s.members.map(m=>m.componenttype)).toContain(380);
});
it('generates ordered typed Canvas invocations and refuses to replace existing form behavior',()=>{
 const invocation=canvasInvocation(project,{appId:project.canvasApps!.complaintPortal!.application!.existingAppId,alias:'ComplaintChangeContract',workflowId:owner,arguments:{changeSummary:{type:'string',formula:'summary.Value'},complaintId:{type:'guid',formula:'selected.Complaint'},changeReason:{type:'string',formula:'reason.Value'}},resultVariable:'contractResult'});
 expect(invocation.formula).toBe('Set(contractResult, ComplaintChangeContract.Run(Text(selected.Complaint), reason.Value, summary.Value))');expect(invocation.outputs.map(o=>o.name)).toEqual(['accepted','message']);
 const files={'Screen.pa.yaml':{Screens:{Test:{Properties:{},Children:[{save:{Control:'Button',Properties:{OnSelect:'=SubmitForm(Form1)'}}}]}}}};
 expect(()=>planCanvasInvocationPatch(files,'save',invocation,hashJson(files))).toThrow('overwrite');
 files['Screen.pa.yaml'].Screens.Test.Children[0]!.save.Properties.OnSelect='=false';expect(planCanvasInvocationPatch(files,'save',invocation,hashJson(files)).intent.after).toContain('ComplaintChangeContract.Run');
});
