import type {Command} from 'commander';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {stringify} from 'yaml';
import {parseConfigData,readConfigSource,loadProject} from '../config/load.js';
import {solutionPlan,savedSolutionPlanSchema,validateSolutionPlan,solutionDiff,critiqueSolution,summarizeSolution} from '../solution/plan.js';
import type {SolutionPlan} from '../solution/plan.js';
import {digest} from '../solution/compile.js';
import {applySolution,type StageResult} from '../solution/apply.js';
import {checkerReport,comparePlatformDependencies,deploymentManifest,verifySolutionExport} from '../solution/alm.js';
import {writeTask} from '../agent/journal.js';
import {createHash,randomUUID} from 'node:crypto';
import {emit} from './output.js';
import type {CliContext} from './remote.js';
import {FlowStore} from '../flows/state.js';

const json=async(path:string):Promise<unknown>=>JSON.parse(await readFile(resolve(path),'utf8'));
async function save(path:string,value:unknown){await mkdir(dirname(resolve(path)),{recursive:true});await writeFile(resolve(path),JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
type PlanOptions={spec:string;out:string;evidence?:string;flowEvidence?:string};
async function inputs(o:PlanOptions){return {spec:parseConfigData(await readConfigSource(resolve(o.spec))),evidence:o.evidence?await json(o.evidence):{},flow:o.flowEvidence?await json(o.flowEvidence):undefined};}
async function loadPlan(path:string){const p=savedSolutionPlanSchema.parse(await json(path));return validateSolutionPlan(p,p.spec,p.evidence,new Date(p.createdAt),p.flowEvidence);}
/** Fixed, allowlisted calls into the existing CLI; no model-generated PAC or shell execution. */
async function nativeCommand(project:string,args:string[]){
 const entry=fileURLToPath(new URL('./index.js',import.meta.url));
 try{const r=await promisify(execFile)(process.execPath,[entry,'--project',project,'--non-interactive','--json',...args],{windowsHide:true,maxBuffer:16*1024*1024});return JSON.parse(r.stdout) as Record<string,unknown>;}
 catch(error){const e=error as {stdout?:string};if(e.stdout){const result=JSON.parse(e.stdout) as Record<string,unknown>;if(result.error||result.ok===false)return result;}throw new Error('Native subsystem failed; inspect its journal before retry.',{cause:error});}
}
async function recordPlan(plan:SolutionPlan,project:string,out:string){
 const bytes=await readFile(resolve(out));const {relative}=await import('node:path');
 await writeTask({version:'1.0',project:resolve(project),goal:'Review unified solution architecture and exact saved plan',workflow:'architecture',phase:plan.ir.validation.blockers.length?'blocked':'review',plannedOperations:['solution plan','solution inspect','solution audit'],blockers:plan.ir.validation.blockers.slice(0,50).map(b=>(b.code+': '+b.message).slice(0,1900)),facts:['Project hash: '+plan.ir.projectHash,'Plan hash: '+plan.contentHash,'Expected authorized mutations: 0'],mutationState:'NONE',artifacts:[{kind:'plan',path:relative(resolve(project),resolve(out)),sha256:createHash('sha256').update(bytes).digest('hex'),expiresAt:plan.expiresAt}]},project,'.powercanvas/agent/solution-'+randomUUID()+'.json');
}
export function registerSolutionCommands(program:Command,global:()=>CliContext){
 const group=program.command('solution').description('Unified requirement/resource planning through existing PowerCanvas compilers');
 group.command('plan').requiredOption('--spec <file>').requiredOption('--out <file>').option('--evidence <file>','Native Dataverse observation, ownership and exact plan; optional read-only bindings').option('--flow-evidence <file>','Existing flow plan/snapshot/ownership/deployment').description('Compile intent or explicit resources; save canonical plan and traceability; no remote calls').action(async(o:PlanOptions)=>{
  const i=await inputs(o);const p=solutionPlan(i.spec,i.evidence,i.flow);await save(o.out,p);await save(o.out+'.manifest.json',deploymentManifest(p.ir));
  await writeFile(resolve(o.out+'.resolved.yaml'),stringify(p.ir.project),{flag:'wx'});
  await recordPlan(p,global().project,o.out);emit({plan:p,saved:resolve(o.out)},summarizeSolution(p),global().json);
 });
 for(const command of ['inspect','graph','critique','audit'] as const)group.command(command).requiredOption('--plan <file>').option('--checker-report <file>').option('--platform-dependencies <file>').description(command==='audit'?'Deterministic architecture checks, optional PAC Checker and platform dependency evidence':'Read a saved unified plan; no execution').action(async(o:{plan:string;checkerReport?:string;platformDependencies?:string})=>{
  const p=await loadPlan(o.plan);let result:object=command==='inspect'?p:command==='graph'?{order:p.ir.deploymentOrder,edges:p.ir.dependencies,traceability:p.ir.requirements}:command==='critique'?critiqueSolution(p.ir):{...p.ir.validation,checker:o.checkerReport?checkerReport(await json(o.checkerReport)):{status:'NOT_RUN'},platformDependencies:o.platformDependencies?comparePlatformDependencies(p.ir,await json(o.platformDependencies)):{status:'NOT_CHECKED'},staleAt:new Date()>new Date(p.expiresAt)};
  if(command==='inspect')result={...result,stale:new Date()>new Date(p.expiresAt)};
  emit(result,JSON.stringify(result,null,2),global().json);
 });
 group.command('diff').requiredOption('--before <file>').requiredOption('--after <file>').description('Compare resource definitions; removed resources are retained orphans').action(async(o:{before:string;after:string})=>{const result=solutionDiff((await loadPlan(o.before)).ir,(await loadPlan(o.after)).ir);emit({operations:result,remoteMutations:0},JSON.stringify(result,null,2),global().json);});
 group.command('verify-export').requiredOption('--plan <file>').requiredOption('--index <file>').description('Verify an independently indexed unmanaged solution; no import or remote calls').action(async(o:{plan:string;index:string})=>{const p=await loadPlan(o.plan);const r=verifySolutionExport(p.ir,await json(o.index),p.flowEvidence?.plan as unknown as import('../flows/plan.js').FlowPlan|undefined);emit(r,JSON.stringify(r,null,2),global().json);});
 group.command('apply').requiredOption('--plan <file>').requiredOption('--spec <file>').requiredOption('--evidence <file>').option('--flow-evidence <file>').requiredOption('--env <alias>').requiredOption('--out <directory>').description('Exact saved plan; preflight all stages, delegate mutations to existing executors; never activate').action(async(o:PlanOptions&{plan:string;env:string})=>{
  const i=await inputs(o);const loaded=await loadProject(global().project);const raw=await json(o.plan);
  let count=0;const env=['--env',o.env];const out=resolve(o.out);await mkdir(out,{recursive:true});
  const result=await applySolution(raw,i.spec,i.evidence,{
   journal:async entry=>{await save(resolve(out,'stage-'+String(++count).padStart(3,'0')+'.json'),entry);},
   preflight:async p=>{
    if(digest(loaded.project)!==p.ir.projectHash)throw new Error('STALE: selected project differs from resolved solution project');
    if(p.evidence.dataverse){const n=p.evidence.dataverse.plan;const result=await nativeCommand(global().project,['plan',...env,'--scope',n.scope??'all',...(n.executionPolicy?.mode==='defaultExperiment'?['--default-experiment']:[]),...(n.executionPolicy?.modelDriven?['--model-driven-experiment']:[])]);const fresh=result.plan as typeof n|undefined;if(!fresh||fresh.blockers.length||fresh.sourceHash!==n.sourceHash||fresh.observationHash!==n.observationHash||fresh.ownershipRevision!==n.ownershipRevision||digest(fresh.target)!==digest(n.target)||digest(fresh.executionPolicy)!==digest(n.executionPolicy)||digest(fresh.operations)!==digest(n.operations))throw new Error('STALE: live Dataverse plan differs before any mutation');await save(resolve(out,'dataverse-plan.json'),n);}
    if(p.flowEvidence){await save(resolve(out,'deployment.json'),p.flowEvidence.deployment);const result=await nativeCommand(global().project,['flows','plan',...env,'--deployment',resolve(out,'deployment.json'),'--out',resolve(out,'fresh-flow-plan.json')]);if(digest(result)!==digest(p.flowEvidence.plan))throw new Error('STALE: live flow plan differs before any mutation');await save(resolve(out,'flow-plan.json'),p.flowEvidence.plan);}
   },
   execute:async(stage,p)=>{
    const r=await nativeCommand(global().project,stage==='DATA'?['apply',...env,'--plan',resolve(out,'dataverse-plan.json')]:['flows','apply',...env,'--deployment',resolve(out,'deployment.json'),'--plan',resolve(out,'flow-plan.json')]);
    const ok=stage==='DATA'?r.ok===true:!r.error&&typeof r.flowsCreated==='number'&&typeof r.activation==='string';
    return {...r,ok,...(stage==='AUTOMATION'&&p.evidence.target?{journal:new FlowStore(global().project,p.ir.identity.id,p.evidence.target).path}:{}),mutationState:ok?'CONFIRMED':'UNKNOWN'} as StageResult;
   },
  },i.flow);
  await save(resolve(out,'result.json'),result);emit(result,JSON.stringify(result,null,2),global().json);
 });
}
