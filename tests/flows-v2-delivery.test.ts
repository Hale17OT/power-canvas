import {it,expect} from 'vitest';
import {loadProject} from '../src/config/load.js';
import {flowResourcesSchema} from '../src/flows/schema.js';
import {discoverFlows,resourceKinds} from '../src/flows/remote.js';
import type {FlowHttp,ResourceKind} from '../src/flows/remote.js';
import type {FlowOwnership,FlowPlan} from '../src/flows/plan.js';
import {planFlows} from '../src/flows/plan.js';
import {applyFlows,setFlowState} from '../src/flows/apply.js';
import {verifyFlowExport} from '../src/flows/export.js';
import {readFile} from 'node:fs/promises';
const project=(await loadProject('examples/canvas-native-complaints')).project;
const solution='33333333-3333-4333-8333-333333333333',owner='44444444-4444-4444-8444-444444444444';
const target={tenantId:owner,environmentId:owner,organizationId:owner,dataverseUrl:'https://example.crm.dynamics.com'};
it('deploys an external-write definition disabled, proves solution membership and never calls the connector',async()=>{
 const p=structuredClone(project);p.resources=flowResourcesSchema.parse({connectionReferences:{mail:{logicalName:'pfx_V2Mail',displayName:'V2 mail',connector:'shared_office365',allowCreate:true}},flows:{mail:{logicalName:'pfx_V2MailProof',displayName:'V2 mail proof',flowType:'scheduled',trigger:{type:'recurrence',frequency:'Day',interval:1,startTime:'2030-01-01T00:00:00Z'},runPolicy:{mode:'controlledWrite'},connectionReferences:['mail'],actions:[{name:'Send',use:'outlook.sendEmail',to:[{op:'literal',shape:{type:'email'},value:'test@example.test',intentionalConstant:'Offline fixture recipient; never sent.'}],subject:{op:'literal',shape:{type:'string'},value:'Proof'},body:{op:'literal',shape:{type:'string'},value:'Proof'},connection:'mail'}]}}});
 const records:Record<ResourceKind,Record<string,unknown>[]>={flow:[],connection:[],environment:[],environmentValue:[]};const members:Record<string,unknown>[]=[];const mutations:string[]=[];
 const http:FlowHttp={all:async path=>{if(path.startsWith('solutions?'))return [{solutionid:solution,ismanaged:false,_publisherid_value:owner}];if(path.startsWith('solutioncomponents?'))return members;for(const [k,v]of Object.entries(resourceKinds))if(path.startsWith(v.set+'?'))return records[k as ResourceKind];throw Error('Unexpected read');},request:async(path,method='GET',body)=>{
  if(path.startsWith('publishers('))return {data:{uniquename:p.solution.publisher.uniqueName,customizationprefix:p.solution.publisher.prefix},requestId:'test'};
  if(method!=='POST')throw Error('Unexpected operation');mutations.push(path);const b=body as Record<string,unknown>;
  if(path==='AddSolutionComponent'){members.push({objectid:b.ComponentId,componenttype:b.ComponentType,_solutionid_value:solution});return {data:null,requestId:'test'};}
  for(const [k,v]of Object.entries(resourceKinds))if(path===v.set){records[k as ResourceKind].push({...b,ismanaged:false,_ownerid_value:owner,'@odata.etag':'W/"1"'});return {data:null,requestId:'test'};}throw Error('Connector execution is forbidden');
 }};
 let state:FlowOwnership={projectId:p.project.id,target,entries:{}};const store={read:async()=>structuredClone(state),save:async(s:FlowOwnership)=>{state=structuredClone(s);}};
 const deployment={environmentId:owner,environmentValues:{},connections:{mail:{connectionId:'explicit-test-connection',connector:'shared_office365' as const,environmentId:owner,principalId:owner,authorizationVerified:true,authorizationEvidence:'Operator-owned connection verified for offline fixture.'}}};
 const plan=planFlows(p,target,await discoverFlows(http,p),await store.read(),deployment);
 const result=await applyFlows(p,target,plan,deployment,http,store,owner);expect(result.flowsCreated).toBe(1);expect(result.emailsSent).toBe(0);expect(result.flowsActivated).toBe(0);expect(records.flow[0]!.statecode).toBe(0);expect(mutations).toEqual(['connectionreferences','AddSolutionComponent','workflows','AddSolutionComponent']);
 const repeat=planFlows(p,target,await discoverFlows(http,p),await store.read(),deployment);expect(repeat.operations.every(o=>o.status==='NO-OP')).toBe(true);
 const count=mutations.length;await expect(setFlowState(p,target,'mail',true,deployment,http,store)).rejects.toThrow('execution policy');expect(mutations).toHaveLength(count);
});
it('requires the documented case-sensitive environment value navigation property',async()=>{
 const p=(await loadProject('examples/flows-v2/configuration-proof')).project;
 const plan=planFlows(p,target,{solutionId:solution,solutionName:p.solution.uniqueName,publisher:p.solution.publisher.uniqueName,resources:[]},{projectId:p.project.id,target,entries:{}},{environmentId:owner,connections:{},environmentValues:{threshold:5,label:'test'}});
 const value=plan.operations.find(o=>o.key==='environmentValue:threshold')!;expect(value.body).toHaveProperty('EnvironmentVariableDefinitionId@odata.bind');expect(value.body).not.toHaveProperty('environmentvariabledefinitionid@odata.bind');
});
it.skipIf(process.env.POWERCANVAS_PRIVATE_EVIDENCE !== '1')('verifies actual V2 exported definitions/values and rejects missing or altered dependencies',async()=>{
 const p=(await loadProject('examples/flows-v2/configuration-proof')).project;
 const plan=JSON.parse(await readFile('experiments/flows-v2-20260921/configuration-plan3.json','utf8')) as FlowPlan;
 const index=JSON.parse(await readFile('experiments/flows-v2-20260921/export-index2.json','utf8'));
 expect(verifyFlowExport(p,plan,index).definitionVerified).toBe(true);
 for(const kind of ['definition','value','variable','managed']){const changed=structuredClone(index);if(kind==='definition')changed.workflows.find((w:{logicalName:string})=>w.logicalName==='pfx_ExperimentV2ConfigurationCheck').clientdata.properties.definition.actions={};if(kind==='value')changed.environmentValues.pfx_ExperimentV2Threshold=['9'];if(kind==='variable')changed.environmentVariables=[];if(kind==='managed')changed.managed=true;expect(()=>verifyFlowExport(p,plan,changed)).toThrow();}
});
import {composeFlowCommands} from '../src/flows/native.js';
import {nativeBindingsSchema} from '../src/canvas/native-types.js';
import {controls} from '../src/canvas/taste/audit.js';
it('generates action-specific native write labels, response status and submission guard without replacing screen behavior',async()=>{
 const p=structuredClone(project),resources=p.resources!,flow=resources.flows.complaintChangeContract!;
 resources.executionPolicy={allowRead:true,allowInternalWrite:false,allowExternalWrite:true,allowDestructive:false};
 resources.connectionReferences.mail={logicalName:'pfx_TestMail',displayName:'Test mail',connector:'shared_office365',allowCreate:false};
 flow.runPolicy.mode='controlledWrite';flow.connectionReferences=['mail'];
 flow.actions.splice(flow.actions.length-1,0,{name:'Send',use:'outlook.sendEmail',connection:'mail',to:[{op:'literal',shape:{type:'email'},value:'test@example.test'}],subject:{op:'literal',shape:{type:'string'},value:'Fixture'},body:{op:'literal',shape:{type:'string'},value:'Never executed'}});
 const command=resources.canvasBindings[0]!.command!;command.lifecycle={submitLabel:'Send notification',busyLabel:'Sending notification',completion:'response',retry:'manualReconcile'};
 const bindings=nativeBindingsSchema.parse(JSON.parse(await readFile('examples/canvas-native-complaints/bindings.json','utf8')));
 const files={'Screen.pa.yaml':{Screens:{Screen:{Properties:{OnVisible:'=Set(existingState, true)'},Children:[{[command.parent]:{Control:'GroupContainer',Variant:'AutoLayout',Properties:{},Children:[]}}]}}}};
 const receipt=composeFlowCommands(p,'complaintPortal',bindings,files);const nodes=controls(files);
 expect(nodes.find(n=>n.name.endsWith('_run'))!.node.Properties.Text).toContain('Send notification');
 expect(nodes.find(n=>n.name.endsWith('_run'))!.node.Properties.Text).toContain('Sending notification');
 expect(nodes.find(n=>n.name.endsWith('_response'))!.node.Properties.Text).toContain('Completed');
 expect(receipt[0]!.formula).toContain('_attempted, true');expect(receipt[0]!.formula).toContain('Outcome unknown');expect(files['Screen.pa.yaml'].Screens.Screen.Properties.OnVisible).toBe('=Set(existingState, true)');
});
