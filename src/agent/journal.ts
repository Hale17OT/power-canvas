import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {redactDiagnostic} from '../canvas/authoring-health.js';
import {commandPolicy} from './commands.js';
const safe=z.string().min(1).max(2000).refine(s=>redactDiagnostic(s)===s,'Do not store secrets, credential headers or authentication URLs');
export const taskJournalSchema=z.strictObject({version:z.literal('1.0'),project:safe,goal:safe,workflow:z.enum(['architecture','canvas','taste','flows','debug','mixed']),phase:z.enum(['inspect','plan','validate','blocked','review','complete']),plannedOperations:z.array(safe).max(100),blockers:z.array(safe).max(100),facts:z.array(safe).max(100),mutationState:z.enum(['NONE','PLANNED','CONFIRMED','UNKNOWN']),artifacts:z.array(z.strictObject({kind:z.enum(['source','plan','result','providerHealth']),path:safe,sha256:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.iso.datetime().optional()})).max(100)});
export type TaskJournal=z.infer<typeof taskJournalSchema>;
async function contained(project:string,path:string){
 const base=await realpath(resolve(project)),target=await realpath(resolve(base,path)),rel=relative(base,target);
 if(rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel))throw new Error('Artifact must remain inside the selected project');return target;
}
export async function resumeTask(raw:unknown,project:string,now=Date.now()){
 const journal=taskJournalSchema.parse(raw);
 if(await realpath(resolve(journal.project))!==await realpath(resolve(project)))throw new Error('Journal project mismatch');
 for(const command of journal.plannedOperations)commandPolicy(command);
 const artifacts=[];
 for(const artifact of journal.artifacts){let status='MATCH';try{const path=await contained(project,artifact.path);const actual=createHash('sha256').update(await readFile(path)).digest('hex');if(actual!==artifact.sha256)status='CHANGED';else if(artifact.expiresAt&&Date.parse(artifact.expiresAt)<=now)status='EXPIRED';}catch{status='MISSING_OR_OUTSIDE_PROJECT';}artifacts.push({kind:artifact.kind,path:artifact.path,status});}
 const stale=artifacts.some(a=>a.status!=='MATCH');
 return {journal,artifacts,status:stale?'STALE':journal.mutationState==='UNKNOWN'?'BLOCKED':'INSPECT_BEFORE_RESUME',autoRetry:false,mutationAuthorized:false,next:stale?'Reacquire and replan; do not apply stale artifacts.':journal.mutationState==='UNKNOWN'?'Reconcile unknown outcome before any retry.':'Recheck live identity, source freshness, provider health and plan gates; journal is not authorization.'};
}
export async function writeTask(raw:unknown,project:string,out:string){
 const journal=taskJournalSchema.parse(raw),report=await resumeTask(journal,project);
 if(report.status==='STALE')throw new Error('Cannot record unmatched artifacts');
 const base=await realpath(resolve(project)),target=resolve(base,out),rel=relative(base,target);
 if(!rel.startsWith('.powercanvas/agent/')&&!rel.startsWith('.powercanvas\\agent\\'))throw new Error('Task journals belong under .powercanvas/agent/');
 await mkdir(dirname(target),{recursive:true});
 const parent=await realpath(dirname(target)),parentRel=relative(base,parent);
 if(parentRel.startsWith('..')||isAbsolute(parentRel))throw new Error('Journal directory escapes project');
 await writeFile(target,JSON.stringify(journal,null,2)+'\n',{flag:'wx'});return {path:target,phase:journal.phase,remoteWrites:0,mutationAuthorized:false};
}
