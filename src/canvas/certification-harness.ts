import { hashJson } from '../core/json.js';
import type { NativeFiles } from './native-types.js';
import { controls, dependencies } from './taste/audit.js';
import { normalizeFormula, immutableMutationPaths } from './behavior-ir.js';
import { behaviorChangeApprovalSchema, planCanvasMigration } from './migration.js';
import { assertFreshSource, compareSources, makeSourceBundle, type SourceBundle } from './source-provider.js';
import { z } from 'zod';

/** Saved and draft are separate lifecycle states. Only exact reviewed differences can bridge them. */
export function compareSourceStates(draft:SourceBundle,saved:SourceBundle,reviewedDraft:NativeFiles,rawApprovals:unknown,now=Date.now()) {
  assertFreshSource(draft,draft.snapshot.identity,now);assertFreshSource(saved,saved.snapshot.identity,now);
  const direct=compareSources(draft,saved,now);
  if(direct.status==='MATCH')return {...direct,status:'MATCH' as const,approvedDraftDelta:0};
  if(draft.snapshot.sourceHash!==hashJson(reviewedDraft))throw new Error('Unreviewed authoring draft');
  const approvals=z.array(behaviorChangeApprovalSchema).min(1).parse(rawApprovals);
  const corrected=structuredClone(saved.files),targets=dependencies(reviewedDraft);
  for(const approval of approvals){
    const original=dependencies(saved.files).find(d=>d.control===approval.control&&d.property===approval.property);
    const target=targets.find(d=>d.control===approval.control&&d.property===approval.property);
    const node=controls(corrected).find(n=>n.name===approval.control);
    if(!original||!target||!node||hashJson(original.formula)!==approval.beforeFormulaHash||hashJson(target.formula)!==approval.afterFormulaHash)throw new Error('Saved/draft approval does not match exact formulas');
    node.node.Properties[approval.property]=target.formula;
  }
  const migration=planCanvasMigration(saved.files,draft.files,[],approvals);
  const projected=makeSourceBundle(corrected,saved.snapshot.identity,'pacDownload',saved.snapshot.dataSources,saved.snapshot.connectors,{content:[{type:'text',text:'Explicit approved-delta comparison projection; not a saved package'}]},saved.snapshot.acquiredAt);
  const agreement=compareSources(draft,projected,now);
  // The projection also compares all nonbehavioral properties after stripping ONLY discovered version suffixes.
  const semantic=(files:NativeFiles)=>{const copy=structuredClone(files);for(const n of controls(copy))n.node.Control=n.node.Control!.split('@')[0]!.trim();return hashJson(copy);};
  if(!migration.safe||agreement.status!=='MATCH'||semantic(corrected)!==semantic(draft.files))throw new Error('Unresolved saved/draft source difference');
  return {version:'4.3',status:'APPROVED_DRAFT_DELTA' as const,saved:saved.snapshot,draft:draft.snapshot,approvedDraftDelta:approvals.length,checks:agreement.checks,approvals,remoteWrites:0};
}

export const harnessScreen='pc_certification_preview';
export const harnessFile=harnessScreen+'.pa.yaml';
export function sourceMetrics(files:NativeFiles){
  const nodes=controls(files);
  return {controls:nodes.length,depth:Math.max(0,...nodes.map(n=>n.depth)),galleryTemplate:Math.max(0,...nodes.filter(n=>n.node.Control?.split('@')[0]==='Gallery').map(g=>nodes.filter(n=>n.path.startsWith(g.path+'/')).length)),formulas:dependencies(files).length};
}
const localCalls=new Set(['If','Coalesce','Blank','IsBlank','IsEmpty','IsMatch','Len','Trim','Lower','Upper','Text','Value','JSON','Table','First','Last','FirstN','CountRows','Filter','Sort','Min','Max','Round','Abs','Date','Time','DateValue','Hour','Minute','Year','Month','Day','GUID','Set','SetFocus','Reset','Not','And','Or','RGBA','ColorValue','Char','Substitute','Left','With']);
/** A harness may add one isolated screen. Existing files, formulas, navigation and start screen stay byte-semantically identical. */
export function validateHarnessCandidate(base:NativeFiles,candidate:NativeFiles) {
  if(Object.hasOwn(base,harnessFile))throw new Error('Harness screen collision');
  const without=structuredClone(candidate);delete without[harnessFile];
  if(hashJson(without)!==hashJson(base))throw new Error('Harness changed protected application source');
  const fragment=candidate[harnessFile] as {Screens?:Record<string,unknown>}|undefined;
  if(!fragment?.Screens||Object.keys(fragment.Screens).join()!==harnessScreen)throw new Error('Exactly one isolated harness screen required');
  const local:NativeFiles={[harnessFile]:candidate[harnessFile]!};
  const names=new Set(controls(local).map(n=>n.name));
  if([...names].some(n=>!n.startsWith('pc_cert_'))||controls(base).some(n=>names.has(n.name)))throw new Error('Harness identity collision/namespace violation');
  const allowedRoots=new Set(['Self','Parent','ThisItem','App','Font','FontWeight','Align','AlignInContainer','LayoutDirection','LayoutAlignItems','LayoutJustifyContent','LayoutOverflow','DropShadow','DisplayMode','FormMode','LoadingSpinner','Color','JSONFormat','SortOrder']);
  for(const d of dependencies(local)){
    const {tokens,complete}=normalizeFormula(d.formula);if(!complete)throw new Error('Unsupported harness formula syntax');
    for(let i=0;i<tokens.length;i++){
      const t=tokens[i]!;
      if(t==='Set'&&tokens[i+1]==='('&&!/^pc_cert_\w+$/.test(tokens[i+2]??''))throw new Error('Harness state write escaped local namespace');
      if(['SetFocus','Reset'].includes(t)&&tokens[i+1]==='('&&!names.has(tokens[i+2]??''))throw new Error('Harness action targets outside control');
      if(/^[A-Za-z_]\w*$/.test(t)&&tokens[i+1]==='('&&(!localCalls.has(t)||tokens[i-1]==='.'))throw new Error('Unapproved harness call: '+t);
      if(/^[A-Za-z_]\w*$/.test(t)&&tokens[i-1]!=='.'&&tokens[i+1]!==':'&&!['true','false','in','exactin','As','Blank'].includes(t)&&!localCalls.has(t)&&!allowedRoots.has(t)&&!t.startsWith('PF_')&&!t.startsWith('pc_cert_')&&!names.has(t))throw new Error('Unapproved harness identifier: '+t);
    }
  }
  const mutations=immutableMutationPaths(base,candidate);if(!mutations.preserved)throw new Error('Harness changed mutation paths');
  const metrics=sourceMetrics(candidate);if(metrics.controls>240||metrics.depth>12||metrics.galleryTemplate>16)throw new Error('Harness exceeds existing complexity budget');
  return {version:'4.3',baseHash:hashJson(base),candidateHash:hashJson(candidate),screen:harnessScreen,metrics,protectedSourceUnchanged:true,mutationPaths:mutations,previewOnly:true,remoteWrites:0};
}

export function verifyHarnessRestoration(current:NativeFiles,base:NativeFiles,receipt:ReturnType<typeof validateHarnessCandidate>){
  if(hashJson(current)!==receipt.candidateHash||hashJson(base)!==receipt.baseHash)throw new Error('Harness restoration source changed');
  validateHarnessCandidate(base,current);return {restoredHash:hashJson(base),remoteWrites:0};
}

export function checkLogicalBoundary(sample:{requested:number;logical:number;stableSamples:number;composition:string},breakpoints:{min:number;composition:string}[]){
  const expected=[...breakpoints].sort((a,b)=>b.min-a.min).find(b=>sample.requested>=b.min)?.composition;
  return {passed:sample.stableSamples>=3&&sample.logical===sample.requested&&sample.composition===expected,expected,actual:sample.composition,exact:sample.logical===sample.requested};
}

export function readableScreenNamePlan(screen:string,properties:string[]){
  return properties.includes('AccessibleLabel')?{screen,action:'SET_ACCESSIBLE_LABEL',property:'AccessibleLabel',rename:false}:{screen,action:'RETAIN_KNOWN_SUGGESTION',rename:false,reason:'No separately discovered readable-name property; internal screen identity is preserved.'};
}
