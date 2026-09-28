import {solutionReadiness} from './readiness.js';
import {z} from 'zod';
import {compileSolution, digest, capabilityFingerprint, mutationCounts, orderResources, type SolutionIR} from './compile.js';
import {solutionSpecSchema, evidenceSchema, flowEvidenceSchema, type ResourceIR} from './schema.js';
import {planFlows, verifyPlan, type FlowPlan, type FlowOwnership} from '../flows/plan.js';
import type {FlowSnapshot} from '../flows/remote.js';
import {safeUpdate} from '../planner/dataverse.js';
import type {JsonValue} from '../core/json.js';

export const savedSolutionPlanSchema=z.strictObject({version:z.literal(1),createdAt:z.iso.datetime(),expiresAt:z.iso.datetime(),spec:solutionSpecSchema,evidence:evidenceSchema,flowEvidence:flowEvidenceSchema.optional(),ir:z.json(),contentHash:z.string().regex(/^[a-f0-9]{64}$/)});
export function solutionPlan(raw:unknown,evidence:unknown={},flowEvidence?:unknown,now=new Date()){
 const spec=solutionSpecSchema.parse(raw),proof=evidenceSchema.parse(evidence);
 if(proof.dataverse?.plan.certification&&proof.dataverse.plan.certification.manifest.fixtureHash!==digest(spec))throw new Error('Certification fixture hash differs from the reviewed manifest');
 // Saved plans are JSON artifacts; omit optional undefined annotations identically in memory and on disk.
 const ir=JSON.parse(JSON.stringify(compileSolution(spec,proof,now))) as SolutionIR;
 if(proof.dataverse?.plan.certification)for(const root of proof.dataverse.plan.certification.manifest.roots){const r=ir.resources.find(r=>r.nativeId===root.resourceId);if(!r||digest([...r.requiredBy].sort())!==digest([...root.requiredBy].sort()))throw new Error('Certification requirement traceability differs from fixture');}
 const flow=flowEvidence===undefined?undefined:flowEvidenceSchema.parse(flowEvidence);
 if(flow){
  const native=flow.plan as unknown as FlowPlan;verifyPlan(native);
  if(!proof.target||digest(proof.target)!==digest(native.target))throw new Error('Flow evidence target differs');
  const rebuilt=planFlows(ir.project,proof.target,flow.snapshot as unknown as FlowSnapshot,flow.ownership as unknown as FlowOwnership,flow.deployment);
  if(digest(rebuilt)!==digest(native))throw new Error('Flow evidence differs from existing planner output');
  for(const op of rebuilt.operations)if(!ir.resources.some(r=>r.id===op.key)&&op.kind==='environmentValue'){
   const definition=ir.resources.find(r=>r.id==='environment:'+op.key.slice('environmentValue:'.length));
   if(!definition)throw new Error('Environment current value has no declared definition');
   ir.resources.push({...definition,id:op.key,kind:'environmentValue',definition:op.body,definitionHash:digest(op.body),dependencies:[definition.id]});
  }
  for(const op of rebuilt.operations.filter(o=>o.status==='ORPHANED'))if(!ir.resources.some(r=>r.id===op.key)){
   ir.resources.push({id:op.key,kind:op.kind,subsystem:'flows',stage:'AUTOMATION',definition:op.body,definitionHash:digest(op.body),physicalName:op.logicalName,requiredBy:[],dependencies:[],ownership:'POWERCANVAS_OWNED',existingId:op.id,state:'ORPHANED',reason:op.reason,capability:{status:'BLOCKED',schema:true,compile:false,deploy:false,runtime:false,production:false,limitations:['Retain the orphan; no automatic deletion.']}});
   ir.validation.blockers.push({code:'ORPHANED',severity:'error',resource:op.key,message:op.reason});
  }
  for(const r of ir.resources){const op=rebuilt.operations.find(o=>o.key===r.id);if(!op)continue;
   r.state=op.status==='NO-OP'?'NO_OP':op.status;r.reason=op.reason;r.existingId=op.id;
   r.ownership=(flow.ownership as unknown as FlowOwnership).entries[r.id]?'POWERCANVAS_OWNED':'UNKNOWN';
   r.capability.deploy=rebuilt.executable&&!!proof.observedAt&&Date.parse(proof.observedAt)>now.getTime()-3600000&&Date.parse(proof.observedAt)<=now.getTime()+60000;
   r.capability.status=r.capability.deploy?'SUPPORTED_WITH_LIMITS':'COMPILE_ONLY';
  }
  ir.validation.blockers=ir.validation.blockers.filter(b=>!('resource'in b)||!b.resource||!rebuilt.operations.some(o=>o.key===b.resource&&!['BLOCKED','CONFLICT','ORPHANED'].includes(o.status)));
 }
 ir.readiness=solutionReadiness(ir.project,ir.resources,proof,ir.validation.blockers,now);
 ir.capabilities=ir.resources.map(r=>({resource:r.id,...r.capability}));ir.ownership=ir.resources.map(r=>({resource:r.id,state:r.ownership}));
 ir.resourceHash=digest(ir.resources.map(r=>({id:r.id,definitionHash:r.definitionHash})));
 ir.requirements=ir.requirements.map(r=>({...r,resources:ir.resources.filter(v=>v.requiredBy.includes(r.id)).map(v=>v.id)}));
 ir.expectedMutations=mutationCounts(ir.resources);try{ir.deploymentOrder=orderResources(ir.resources);}catch{ir.status='BLOCKED';}
 ir.dependencies=ir.resources.flatMap(r=>r.dependencies.map(to=>({from:r.id,to})));
 ir.deployment=ir.deployment.map(s=>({...s,resources:ir.deploymentOrder.filter(id=>ir.resources.find(r=>r.id===id)?.stage===s.stage)}));
 if(!ir.validation.blockers.length)ir.status=ir.resources.some(r=>r.state==='DEFERRED_REQUIRES_PUBLICATION')&&!ir.resources.some(r=>['CREATE','UPDATE'].includes(r.state))?'PROVIDER_CONVERGED_WITH_DEFERRED_PUBLICATION':'FULLY_IMPLEMENTABLE';
 const body={version:1 as const,createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+3600000).toISOString(),spec,evidence:proof,...(flow?{flowEvidence:flow}:{}),ir};
 return {...body,contentHash:digest(body)};
}
export type SolutionPlan=ReturnType<typeof solutionPlan>;
export function validateSolutionPlan(raw:unknown,currentSpec:unknown,currentEvidence:unknown,now=new Date(),currentFlowEvidence?:unknown):SolutionPlan{
 const saved=savedSolutionPlanSchema.parse(raw);const {contentHash,...body}=saved;
 if(contentHash!==digest(body)||Date.parse(saved.expiresAt)<=now.getTime()||Date.parse(saved.createdAt)>now.getTime()+60000)throw new Error('STALE: modified or expired solution plan');
 const prior=saved.ir as unknown as SolutionIR;
 if(prior.capabilityHash!==capabilityFingerprint()||prior.sourceHash!==digest(solutionSpecSchema.parse(currentSpec))||prior.discoveryHash!==digest(evidenceSchema.parse(currentEvidence)))throw new Error('STALE: project, capability, environment or discovery changed');
 if(digest(saved.flowEvidence??null)!==digest(currentFlowEvidence??null))throw new Error('STALE: flow environment configuration or resource state changed');
 const rebuilt=solutionPlan(currentSpec,currentEvidence,currentFlowEvidence,new Date(saved.createdAt));
 if(rebuilt.contentHash!==contentHash)throw new Error('STALE: canonical solution plan differs; arbitrary operations are forbidden');
 return rebuilt;
}
export function solutionDiff(before:SolutionIR,after:SolutionIR){
 const ids=[...new Set([...before.resources,...after.resources].map(r=>r.id))].sort();return ids.map(id=>{const a=before.resources.find(r=>r.id===id),b=after.resources.find(r=>r.id===id);const security=['rolePermissions','appAccess'].includes((b??a)!.kind),old=(a?.definition??{}) as Record<string,JsonValue>,next=(b?.definition??{}) as Record<string,JsonValue>;return {resource:id,state:!b?'ORPHANED':!a?'CREATE':a.definitionHash===b.definitionHash?'NO_OP':'UPDATE',changedProperties:[...new Set([...Object.keys(old),...Object.keys(next)])].filter(k=>digest(old[k]??null)!==digest(next[k]??null)),risk:security?(!b||a&&!safeUpdate(b.kind,old,next)?'SECURITY_DESTRUCTIVE':'SECURITY_WRITE'):'TENANT_WRITE',before:a?.definitionHash??null,after:b?.definitionHash??null,executable:false,reason:!b?'Retain; automatic deletion forbidden.':'Source comparison only; target ownership/discovery still required.'};});
}
export function critiqueSolution(ir:SolutionIR){return {kind:'ARCHITECTURE_CRITIQUE',deterministicGate:false,observations:ir.validation.issues.filter(i=>i.severity==='warning'),questions:['Should complex relations or fine-grained row security use Dataverse instead of SharePoint?','Are SharePoint lookup chains excessive?','Should document metadata use reusable content types?','Are folders being overused instead of metadata?','Are unique permission scopes too granular?','Should this app remain unpublished under manual policy?','Is the retained Category-specific form/view warning acceptable?','Should relational administration use the model-driven provider?','Are roles broader than declared persona needs?','Are custom forms/views redundant?','Is a tailored mobile workflow better served by Canvas?','Does each app serve a distinct job rather than a different viewport?','Are optional workflows worth their connection, security and operational cost?','Are reference data and configuration minimal and shared?','Are security scope, licensing and external document ownership acceptable?'],resourceCount:ir.resources.length,flowCount:ir.resources.filter(r=>r.kind==='flow').length,appCount:ir.resources.filter(r=>r.kind==='canvas').length,remoteMutations:0};}
export function summarizeSolution(plan:SolutionPlan){const ir=plan.ir;const counts:Record<string,number>={};for(const r of ir.resources)counts[r.state]=(counts[r.state]??0)+1;return `${ir.identity.name}: ${ir.status}\n${ir.requirements.length} requirements; ${ir.resources.length} resources\n${Object.entries(counts).map(([s,n])=>`${s}: ${n}`).join(', ')}\n${ir.validation.blockers.length} blockers; production readiness unproven\n${ir.deployment.map(s=>s.stage+': '+s.resources.length).join(' → ')}\n0 remote mutations; inspect exact saved plan before apply.`;}
export function executableResources(resources:ResourceIR[]){return resources.filter(r=>r.state==='CREATE'||r.state==='UPDATE');}
