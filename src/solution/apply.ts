import type {SolutionPlan} from './plan.js';
import {validateSolutionPlan} from './plan.js';
import {digest} from './compile.js';

export interface StageResult {ok:boolean;completed?:unknown[];journal?:string;executionId?:string;error?:unknown;mutationState?:'NONE'|'CONFIRMED'|'UNKNOWN'}
export interface SolutionExecutor {
 // Only adapters that delegate to existing target/source/ownership/apply guards may implement this interface.
 preflight(plan:SolutionPlan,stages?:readonly string[]):Promise<void>;
 execute(stage:'DATA'|'AUTOMATION',plan:SolutionPlan):Promise<StageResult>;
 journal(entry:unknown):Promise<void>;
}
/** Orchestration journal only. Subsystems remain the sole owners of network mutations and retry policy. */
export async function applySolution(raw:unknown,currentSpec:unknown,currentEvidence:unknown,executor:SolutionExecutor,currentFlowEvidence?:unknown,now=new Date(),selectedStages?:('DATA'|'AUTOMATION')[]){
 const plan=validateSolutionPlan(raw,currentSpec,currentEvidence,now,currentFlowEvidence);const ir=plan.ir;
 if(plan.evidence.dataverse?.plan.certification)throw new Error('BLOCKED: provider certification requires a separately authorized execution boundary; V2.1a is planning only');
 const native=(r:typeof ir.resources[number])=>!!r.nativeId;
 const selected=ir.resources.filter(r=>!selectedStages||selectedStages.includes('DATA')&&native(r)||selectedStages.includes('AUTOMATION')&&['flows','configuration'].includes(r.subsystem));
 const changes=selected.filter(r=>r.state==='CREATE'||r.state==='UPDATE');
 const selectedIds=new Set(selected.map(r=>r.id));
 if(selectedStages){
  if(!selectedStages.length||new Set(selectedStages).size!==selectedStages.length)throw Error('Explicit nonempty unique stage selection required');
  for(const r of selected)for(const dep of r.dependencies){const d=ir.resources.find(x=>x.id===dep)!;if(!selectedIds.has(dep)&&d.state!=='NO_OP'&&!(d.state==='EXTERNAL'&&d.capability.status==='SUPPORTED_WITH_LIMITS'))throw Error('BLOCKED: unsatisfied dependency '+dep);}
  if(ir.validation.issues.some(i=>i.severity==='error'&&(!i.resource||i.resource.startsWith('persona:')||selectedIds.has(i.resource))))throw Error('BLOCKED: selected stage has architecture/security errors');
 }
 const relevantBlockers=ir.validation.blockers.filter(b=>!selectedStages||!b.resource||selectedIds.has(b.resource));
 if(relevantBlockers.length||selected.some(r=>['BLOCKED','CONFLICT','ORPHANED','UNSUPPORTED'].includes(r.state)))throw new Error('BLOCKED: resolve all solution and native subsystem blockers before any mutation');
 if(changes.some(r=>!r.capability.deploy||!['dataverse','model-driven','flows','configuration'].includes(r.subsystem)))throw new Error('BLOCKED: no verified existing apply adapter for requested changes');
 if(ir.resources.some(r=>r.ownership==='UNKNOWN'&&r.state==='UPDATE'))throw new Error('BLOCKED: unknown ownership cannot authorize update');
 if(changes.some(r=>native(r))&&!plan.evidence.dataverse||changes.some(r=>['flows','configuration'].includes(r.subsystem))&&!plan.flowEvidence)throw new Error('BLOCKED: exact native saved plan is missing');
 await executor.preflight(plan,selectedStages);
 const entries:unknown[]=[];let mutationState:'NONE'|'CONFIRMED'|'UNKNOWN'='NONE';
 for(const stage of ['DATA','AUTOMATION'] as const){
  if(selectedStages&&!selectedStages.includes(stage))continue;
  const selected=changes.filter(r=>stage==='DATA'?native(r):['flows','configuration'].includes(r.subsystem));
  if(!selected.length)continue;
  const before={planHash:plan.contentHash,projectHash:ir.projectHash,stage,before:selected.map(r=>({resource:r.id,ownership:r.ownership,state:r.state})),intended:selected.map(r=>({resource:r.id,definitionHash:r.definitionHash})),status:'STARTED',mutationState:'UNKNOWN'};
  await executor.journal(before);
  let result:StageResult;
  try{result=await executor.execute(stage,plan);}catch(error){result={ok:false,error:error instanceof Error?error.message:'Subsystem error',mutationState:'UNKNOWN'};}
  mutationState=result.ok?'CONFIRMED':result.mutationState??'UNKNOWN';
  const entry={...before,status:result.ok?'VERIFIED':'STOPPED',result,verification:result.ok?'Existing subsystem readback/postconditions':'No retry; inspect subsystem journal',mutationState,resultHash:digest(result)};entries.push(entry);await executor.journal(entry);
  if(!result.ok)return {status:entries.length>1||mutationState!=='NONE'?'PARTIALLY_APPLIED':'BLOCKED',entries,mutationState,activation:'NOT_REQUESTED',retry:false};
 }
 return {status:selectedStages&&ir.validation.blockers.length?'PARTIALLY_APPLIED':selected.some(r=>r.state==='DEFERRED_REQUIRES_PUBLICATION')?'PROVIDER_CONVERGED_WITH_DEFERRED_PUBLICATION':changes.length?'APPLIED':'NO_OP',deferred:ir.resources.filter(r=>!selectedIds.has(r.id)||r.state==='DEFERRED_REQUIRES_PUBLICATION').map(r=>({resource:r.id,state:r.state})),entries,mutationState,activation:'NOT_REQUESTED',productionReady:false,validation:'Subsystem readback only; export/checker/persona proof remains separate.'};
}
