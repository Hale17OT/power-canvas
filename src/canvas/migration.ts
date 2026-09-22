import { z } from 'zod';
import { hashJson } from '../core/json.js';
import { controls, dependencies } from './taste/audit.js';
import type { NativeFiles } from './native-types.js';
import { compareFormula, immutableMutationPaths, lowerBehaviorBindings, isBehavioralBinding, type FormulaCategory } from './behavior-ir.js';

export const migrationMappingSchema=z.strictObject({from:z.string().min(1),to:z.string().min(1),slot:z.string().min(1)});
export const behaviorChangeApprovalSchema=z.strictObject({control:z.string().min(1),property:z.string().min(1),beforeFormulaHash:z.string().length(64),afterFormulaHash:z.string().length(64),reason:z.string().min(20),authorization:z.literal('explicit-user-approval')});
/** Replace identifiers outside string literals; never rewrite user-visible text or quoted data names. */
export function mapFormulaIdentifiers(formula:string,mapping:Record<string,string>) {
  return formula.replace(/"(?:""|[^"])*"|'(?:''|[^'])*'|\b[A-Za-z_]\w*\b/g,token=>token.startsWith('"')||token.startsWith("'")?token:mapping[token]??token);
}
/** A conservative, read-only migration plan. This does not authorize a changed mutation path. */
export function planCanvasMigration(before:NativeFiles,after:NativeFiles,rawMappings:unknown=[],rawApprovals:unknown=[]) {
  const mappings=z.array(migrationMappingSchema).parse(rawMappings),old=controls(before),next=controls(after);
  const approvals=z.array(behaviorChangeApprovalSchema).parse(rawApprovals),usedApprovals=new Set<string>();
  if(new Set(approvals.map(a=>a.control+'.'+a.property)).size!==approvals.length)throw new Error('Duplicate behavior approval');
  const ids=new Set(next.map(n=>n.name)),oldIds=new Set(old.map(n=>n.name));
  if(new Set(mappings.map(m=>m.from)).size!==mappings.length||new Set(mappings.map(m=>m.to)).size!==mappings.length)throw new Error('Ambiguous control replacement mapping');
  for(const m of mappings)if(!oldIds.has(m.from)||!ids.has(m.to))throw new Error('Migration mapping references a missing control');
  const map=Object.fromEntries(mappings.map(m=>[m.from,m.to]));
  const blockers:string[]=[];
  if(old.length!==oldIds.size||next.length!==ids.size)blockers.push('Duplicate control identities');
  if(mappings.some(m=>oldIds.has(m.to)&&m.to!==m.from&&!Object.hasOwn(map,m.to)))blockers.push('Replacement collides with a retained identity');
  const previous=dependencies(before),current=dependencies(after),index=new Map(current.map(d=>[`${d.control}.${d.property}`,d]));
  // Checked/SelectedDate and selection state matter just as much as TextInput.Value.
  const functional=isBehavioralBinding;
  const changed: {control:string;property:string;reason:string}[]=[];
  const classifications:{control:string;property:string;category:FormulaCategory;reason:string;authorized?:boolean}[]=[];
  for(const d of previous.filter(functional)){
    for(const m of mappings)if(d.formula.includes("'"+m.from.replaceAll("'","''")+"'"))blockers.push(`Quoted identity requires explicit typed migration: ${d.control}.${d.property}`);
    const target=index.get(`${map[d.control]??d.control}.${d.property}`);
    const comparison=compareFormula(d,target,map);
    const approval=approvals.find(a=>a.control===d.control&&a.property===d.property);
    const authorized=approval&&target&&comparison.reason==='Functional formula changed; semantic equivalence unproven'&&approval.beforeFormulaHash===hashJson(d.formula)&&approval.afterFormulaHash===hashJson(target.formula)&&target.control===d.control&&target.parent===d.parent;
    if(authorized){usedApprovals.add(d.control+'.'+d.property);classifications.push({control:d.control,property:d.property,category:'BUSINESS_BEHAVIOR_CHANGE',reason:approval.reason,authorized:true});}
    else{classifications.push({control:d.control,property:d.property,...comparison});if(!['SEMANTICALLY_EQUIVALENT','EXPECTED_REBINDING'].includes(comparison.category))changed.push({control:d.control,property:d.property,reason:comparison.reason});}
    for(const ref of d.references)if(oldIds.has(ref)&&!ids.has(map[ref]??ref))blockers.push(`Lost dependency: ${d.control}.${d.property} → ${ref}`);
  }
  const prevIndex=new Set(previous.filter(functional).map(d=>`${map[d.control]??d.control}.${d.property}`));
  for(const d of current.filter(functional))if(!prevIndex.has(`${d.control}.${d.property}`)){changed.push({control:d.control,property:d.property,reason:'New functional property requires review'});classifications.push({control:d.control,property:d.property,category:'BUSINESS_BEHAVIOR_CHANGE',reason:'New functional property requires review'});}
  for(const d of previous.filter(d=>!functional(d))){const target=index.get(`${map[d.control]??d.control}.${d.property}`);if(!target||d.formula!==target.formula)classifications.push({control:d.control,property:d.property,category:'PRESENTATION_ONLY',reason:'Presentation property changed; references still require preservation'});}
  // A retained formula may still refer to a removed identity even if other references were mapped.
  for(const d of current)for(const token of d.formula.replace(/"(?:""|[^"])*"/g,'').match(/\b[A-Za-z_]\w*\b/g)??[])if(oldIds.has(token)&&!ids.has(token))blockers.push(`Stale control reference in candidate: ${d.control}.${d.property} → ${token}`);
  if(changed.length)blockers.push(`${changed.length} functional changes require explicit binding migration`);
  for(const approval of approvals)if(!usedApprovals.has(approval.control+'.'+approval.property))blockers.push('Stale or inapplicable behavior approval: '+approval.control+'.'+approval.property);
  const mutationPaths=immutableMutationPaths(before,after,map);blockers.push(...mutationPaths.differences);
  const stateDependencies=previous.flatMap(d=>d.writes.filter(w=>['Set','UpdateContext','Collect','ClearCollect'].includes(w.operation??'')).map(w=>({control:d.control,property:d.property,...w})));
  return {version:'4.2',beforeHash:hashJson(before),afterHash:hashJson(after),remoteWrites:0,classifications,mutationPaths,approvedBehaviorChanges:approvals,behaviorBindings:lowerBehaviorBindings(before),
    retained:old.filter(n=>ids.has(n.name)&&!map[n.name]).map(n=>n.name),
    moved:old.flatMap(n=>{const dest=next.find(x=>x.name===(map[n.name]??n.name));return dest&&dest.parent!==(map[n.parent??'']??n.parent)?[{control:n.name,from:n.parent??null,to:dest.parent??null}]:[];}),
    replaced:mappings,removed:old.filter(n=>!ids.has(map[n.name]??n.name)).map(n=>n.name),
    added:next.filter(n=>!old.some(o=>(map[o.name]??o.name)===n.name)).map(n=>n.name),
    formulaDependencies:previous.filter(functional),stateDependencies,changed,blockers:[...new Set(blockers)],safe:!blockers.length,
    limitations:['Lexical preservation is not a Power Fx type check','Native checker, runtime, visual review and explicit migration apply remain required']};
}
