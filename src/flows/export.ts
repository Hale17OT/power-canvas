import { z } from 'zod';
import type { Project } from '../ir/schema.js';
import type { FlowPlan } from './plan.js';
import { verifyPlan } from './plan.js';
import { compileFlows } from './compile.js';
import { dependencyGraph } from './safety.js';
import type { JsonInput } from '../core/json.js';
import { hashJson } from '../core/json.js';
import { fail } from './expressions.js';

export const exportIndexSchema=z.strictObject({archiveHash:z.string().regex(/^[a-f0-9]{64}$/),solution:z.string(),managed:z.boolean(),workflows:z.array(z.strictObject({id:z.guid(),logicalName:z.string(),clientdata:z.json()})),connectionReferences:z.array(z.string()),environmentVariables:z.array(z.string()),environmentValues:z.record(z.string(),z.array(z.string())).default({}),tables:z.array(z.string()),canvasReferences:z.array(z.strictObject({logicalName:z.string(),workflowIds:z.array(z.guid())}))});
/** The indexer reads the archive without modifying it; declarations alone never count as export evidence. */
export function verifyFlowExport(project:Project,plan:FlowPlan,input:unknown){
 verifyPlan(plan);const index=exportIndexSchema.parse(input),compiled=compileFlows(project);
 if(!plan.executable||plan.sourceHash!==compiled.sourceHash||plan.projectId!==project.project.id||index.solution!==project.solution.uniqueName||index.managed)fail('Export target, source, plan or unmanaged boundary mismatch.');
 const checks:{kind:string;identity:string;verified:boolean}[]=[];
 for(const [key,f]of Object.entries(compiled.flows)){
  const op=plan.operations.find(o=>o.key==='flow:'+key),remote=index.workflows.filter(w=>w.logicalName===f.logicalName);
  if(!op||remote.length!==1||remote[0]!.id!==op.id)fail('Export does not contain the exact planned workflow identity.');
  const actual=structuredClone(remote[0]!.clientdata) as {properties:Record<string,unknown>},expected=JSON.parse(String(op.body.clientdata));
  // V1 observed ExportSolution adding only this null field; no broad normalization.
  if(actual.properties.templateName===null)delete actual.properties.templateName;
  if(hashJson(actual as JsonInput)!==hashJson(expected))fail('Exported workflow differs from the verified deployment definition.');
  checks.push({kind:'flow',identity:f.logicalName,verified:true});
 }
 for(const ref of Object.values(compiled.resources.connectionReferences)){if(!index.connectionReferences.includes(ref.logicalName))fail('Export is missing a connection reference.');checks.push({kind:'connection',identity:ref.logicalName,verified:true});}
 for(const v of Object.values(compiled.resources.environmentVariables)){if(!index.environmentVariables.includes(v.logicalName))fail('Export is missing an environment variable.');checks.push({kind:'environment',identity:v.logicalName,verified:true});}
 for(const [key,v]of Object.entries(compiled.resources.environmentVariables)){const op=plan.operations.find(o=>o.key==='environmentValue:'+key);if(op){const values=index.environmentValues[v.logicalName];if(values?.length!==1||values[0]!==op.body.value)fail('Export environment value differs from the planned configuration.');checks.push({kind:'environmentValue',identity:v.logicalName,verified:true});}}
 for(const b of compiled.resources.canvasBindings){const appName=project.canvasApps?.[b.app]?.uniqueName.toLowerCase(),id=plan.operations.find(o=>o.key==='flow:'+b.flow)?.id;if(index.canvasReferences.filter(c=>!!appName&&(c.logicalName.toLowerCase()===appName||c.logicalName.toLowerCase().startsWith(project.solution.publisher.prefix+'_'+appName+'_'))&&c.workflowIds.includes(id!)).length!==1)fail('Export is missing the existing Canvas flow attachment.');checks.push({kind:'canvasBinding',identity:b.app+'.'+b.alias,verified:true});}
 const graph=dependencyGraph(compiled.resources);
 for(const n of graph.nodes.filter(n=>n.kind==='table')){
  const set=n.id.slice(6),source=Object.values(compiled.resources.flowDataSources??{}).find(s=>s.table===set);
  // System/external table definitions need not be bundled. Distinguish unresolved dependency evidence.
  const name=source?.logicalName;
  checks.push({kind:'tableDefinition',identity:name??set,verified:!!name&&index.tables.some(t=>t.toLowerCase()===name.toLowerCase())});
 }
 return {archiveHash:index.archiveHash,checks,orchestrationVerified:graph.resolved,externalDependencies:compiled.manifest.externalResources,externalAssetsSolutionContained:false,definitionVerified:true,tableDependenciesVerified:checks.filter(c=>c.kind==='tableDefinition').every(c=>c.verified),crossEnvironmentImportProven:false,remoteWrites:0};
}
