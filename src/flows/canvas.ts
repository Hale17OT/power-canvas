import { z } from 'zod';
import type { Project } from '../ir/schema.js';
import type { NativeFiles } from '../canvas/native-types.js';
import { controls, dependencies, compareBehavior } from '../canvas/taste/audit.js';
import { hashJson } from '../core/json.js';
import { compileFlows } from './compile.js';
import { fail } from './expressions.js';
import { valueTypes } from './schema.js';
import { requireExecutionPolicy } from './safety.js';
export const invocationSchema=z.strictObject({appId:z.uuid(),alias:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),workflowId:z.guid(),arguments:z.record(z.string(),z.strictObject({type:z.enum(valueTypes),formula:z.string().min(1)})),resultVariable:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/)});
const pureFunctions=new Set(['text','value','guid','coalesce','if','isblank','isempty','trim','lower','upper','left','right','mid','len','concatenate','date','datevalue','datetimevalue','lookup','first','last']);
export function validateCanvasArgument(formula:string){
  const code=formula.replace(/"(?:""|[^"])*"/g,'""');
  if(/[;]|\/\*|\*\/|\/\//.test(code))fail('Canvas arguments must be one pure expression.');
  for(const call of code.matchAll(/\b([A-Za-z_]\w*)\s*\(/g))if(!pureFunctions.has(call[1]!.toLowerCase()))fail('Unsupported or behavioral Canvas argument function.');
}
/** Host formulas are reviewed Power Fx bindings, not flow expressions. No silent coercion or positional guessing. */
export function canvasInvocation(project:Project,input:unknown,prepared?:{workflowId:string;dataSourceName:string;contractHash:string}){
  const r=invocationSchema.parse(input);const compiled=compileFlows(project);const binding=compiled.resources.canvasBindings.find(b=>b.alias===r.alias&&project.canvasApps?.[b.app]?.application?.existingAppId===r.appId);if(!binding)fail('No typed flow binding for this existing application.');
  const flow=compiled.flows[binding.flow]!;
  if(compiled.resources.flows[binding.flow]!.trigger.type!=='powerAppsV2')fail('Canvas bindings require a Power Apps V2 trigger.');
  const write=flow.risk!=='READ',lifecycle=binding.command?.lifecycle;
  if(write){requireExecutionPolicy(compiled.resources.flows[binding.flow]!,compiled.resources);if(!lifecycle||lifecycle.retry!=='manualReconcile')fail('Write bindings require explicit response lifecycle and manual reconciliation before retry.');}
  const contractHash=hashJson({inputs:flow.ports,outputs:flow.outputs});
  if(prepared&&(prepared.workflowId!==r.workflowId||prepared.contractHash!==contractHash||!/^[A-Za-z][A-Za-z0-9_]*$/.test(prepared.dataSourceName)))fail('Prepared Canvas flow identity or contract differs.');
  if(JSON.stringify(Object.keys(r.arguments).sort())!==JSON.stringify(flow.ports.map(p=>p.name).sort()))fail('Canvas arguments must exactly match flow inputs.');
  const args=flow.ports.map(p=>{const a=r.arguments[p.name]!;if(a.type!==p.shape.type)fail('Canvas argument type differs from flow input.');validateCanvasArgument(a.formula);return ['guid','recordRef'].includes(a.type)?`Text(${a.formula})`:a.formula;});
  const call=`Set(${r.resultVariable}, ${prepared?.dataSourceName??r.alias}.Run(${args.join(', ')}))`;
  const formula=write?`If(!${r.resultVariable}_busy && !${r.resultVariable}_attempted, Set(${r.resultVariable}_busy, true); Set(${r.resultVariable}_attempted, true); Set(${r.resultVariable}, Blank()); Set(${r.resultVariable}_error, ""); IfError(${call}, Set(${r.resultVariable}_error, "Outcome unknown. Reconcile before retrying.")); Set(${r.resultVariable}_busy, false))`:call;
  return {appId:r.appId,workflowId:r.workflowId,alias:r.alias,contractHash,inputs:flow.ports,outputs:flow.outputs,argumentExpressions:args,formula,risk:flow.risk,lifecycle:write?lifecycle:undefined,applicationCreates:0,remoteWrites:0,requiresPreparedNativeFlowDataSource:!prepared};
}
/** A source patch can target only a new/empty command. Existing nonempty OnSelect is never replaced or appended implicitly. */
export function planCanvasInvocationPatch(files:NativeFiles,control:string,invocation:ReturnType<typeof canvasInvocation>,expectedHash:string){
  if(hashJson(files)!==expectedHash)fail('Canvas source changed before flow binding.');const next=structuredClone(files);const target=controls(next).find(n=>n.name===control);if(!target)fail('Flow invocation needs an explicitly prepared command control.');
  const prior=target.node.Properties.OnSelect;if(prior&&prior!=='=false')fail('Flow binding cannot overwrite an existing OnSelect formula.');
  target.node.Properties.OnSelect='='+invocation.formula;
  const before=dependencies(files).filter(d=>d.behavioral&&!(d.control===control&&d.property==='OnSelect'));const after=new Map(dependencies(next).map(d=>[d.control+'.'+d.property,d]));
  for(const d of before){const n=after.get(d.control+'.'+d.property);if(n?.formula!==d.formula||n?.parent!==d.parent)fail('Unexpected Canvas behavior replacement.');}
  const comparison=compareBehavior(files,next);if(comparison.changed.some(d=>!JSON.stringify(d).includes(control)))fail('Unexpected flow-binding change.');
  return {files:next,appId:invocation.appId,workflowId:invocation.workflowId,expectedHash,nativeHash:hashJson(next),intent:{control,property:'OnSelect',before:prior??null,after:'='+invocation.formula},preservedBehavioralProperties:before.length,remoteWrites:0};
}
