import {workflowConfigurationHash} from '../src/flows/orchestration.js';
import {it,expect,describe} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {loadProject} from '../src/config/load.js';
import {compileFlows} from '../src/flows/compile.js';
import {verifyFlowExport} from '../src/flows/export.js';
import {setFlowState} from '../src/flows/apply.js';
import type {FlowOwnership,FlowPlan} from '../src/flows/plan.js';
import type {FlowHttp} from '../src/flows/remote.js';
const dir='examples/flows-v3/child-proof',proof='experiments/flows-v3-20260921';
const p=(await loadProject(dir)).project;
const privateEvidence=process.env.POWERCANVAS_PRIVATE_EVIDENCE === '1';
const plan=privateEvidence ? JSON.parse(await readFile(proof+'/child-noop-plan.json','utf8')) as FlowPlan : {} as FlowPlan;
const index=privateEvidence ? JSON.parse(await readFile(proof+'/export-index.json','utf8')) : null;
describe.skipIf(!privateEvidence)('private historical tenant evidence',()=>{
it('verifies actual disabled parent/child solution export against the current compiler',()=>{const r=verifyFlowExport(p,plan,index);expect(r.definitionVerified).toBe(true);expect(r.orchestrationVerified).toBe(true);expect(r.crossEnvironmentImportProven).toBe(false);expect(r.checks.filter(c=>c.kind==='flow'&&c.verified)).toHaveLength(2);const parent=index.workflows.find((w:{logicalName:string})=>w.logicalName==='pfx_ExperimentV3ParentContract');expect(parent.clientdata.properties.definition.actions.Child.inputs.host.workflowReferenceName).toBe(plan.operations.find(o=>o.key==='flow:child')!.id);});
it('rejects an exported parent silently retargeted to another child identity',()=>{const broken=structuredClone(index);const parent=broken.workflows.find((w:{logicalName:string})=>w.logicalName==='pfx_ExperimentV3ParentContract');parent.clientdata.properties.definition.actions.Child.inputs.host.workflowReferenceName='11111111-1111-4111-8111-111111111111';expect(()=>verifyFlowExport(p,plan,broken)).toThrow('differs');});
it('live readback records only two inactive additions and no preexisting changes',async()=>{const r=JSON.parse(await readFile(proof+'/readback.json','utf8'));expect(r.environmentType).toBe('Default');expect(r.nonDisposable).toBe(true);expect(r.changedPreexistingResources).toEqual([]);expect(r.newResources).toHaveLength(2);expect(r.newResources.every((x:{state:number;member:boolean})=>x.state===0&&x.member)).toBe(true);expect(r.operations.every((x:{status:string})=>x.status==='NO-OP')).toBe(true);});
it('both preexisting exported Canvas packages are unchanged',async()=>{const r=JSON.parse(await readFile(proof+'/canvas-preservation.json','utf8'));expect(r.unchanged).toBe(true);expect(r.appPackagesAfter).toBe(r.appPackagesBefore);expect(r.after).toEqual(r.before);});
it('even attested parent activation is blocked while the deployed child is off',async()=>{const name=(await readdir(dir+'/.powercanvas')).find(n=>n.startsWith('flows-'))!;const state=JSON.parse(await readFile(dir+'/.powercanvas/'+name,'utf8')) as FlowOwnership;let mutations=0;const owner=state.entries['flow:parent']!.owner!;
 const http:FlowHttp={all:async path=>{if(path.startsWith('solutions?'))return [{solutionid:plan.solutionId,ismanaged:false,_publisherid_value:owner}];if(path.startsWith('solutioncomponents?'))return plan.operations.map(o=>({objectid:o.id,componenttype:29,_solutionid_value:plan.solutionId}));if(path.startsWith('workflows?'))return plan.operations.map(o=>({...o.body,workflowid:o.id,ismanaged:false,_ownerid_value:owner,statecode:0,'@odata.etag':'W/"1"'}));return [];},request:async(path,method='GET')=>{if(method!=='GET'){mutations++;throw Error('No mutation allowed');}if(path.startsWith('publishers('))return {data:{uniquename:p.solution.publisher.uniqueName,customizationprefix:p.solution.publisher.prefix},requestId:'test'};throw Error('Unexpected request');}};
 const compiled=compileFlows(p),authorization=Object.fromEntries(Object.entries(compiled.flows).map(([key,f])=>[key,{definitionHash:f.definitionHash,environmentId:plan.target.environmentId,configurationHash:workflowConfigurationHash({environmentId:plan.target.environmentId,connections:{},environmentValues:{}}),invokers:'Offline test attestation',connectionOwnership:'Connector-free built-in actions',businessAuthorization:'No business effects permitted'}]));
 await expect(setFlowState(p,plan.target,'parent',true,{environmentId:plan.target.environmentId,connections:{},environmentValues:{},workflowAuthorizations:authorization},http,{read:async()=>state,save:async()=>{mutations++;}})).rejects.toThrow('inactive');expect(mutations).toBe(0);
});

});
