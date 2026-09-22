import { hashJson } from '../core/json.js';
import type { NativeFiles } from './native-types.js';
import { dependencies } from './taste/audit.js';

export type FormulaCategory='SEMANTICALLY_EQUIVALENT'|'PRESENTATION_ONLY'|'EXPECTED_REBINDING'|'BUSINESS_BEHAVIOR_CHANGE'|'UNRESOLVED';
type Dependency=ReturnType<typeof dependencies>[number];
export function isBehavioralBinding(d:Dependency) {return d.behavioral||/^(Checked|SelectedDate|SelectMultiple|Formulas|StartScreen)$/.test(d.property)||(/^(Text|Content|AccessibleLabel)$/.test(d.property)&&!/^=\s*"(?:""|[^"])*"\s*$/.test(d.formula));}
/** Token equality only. No algebraic simplification, statement reordering or string rewriting. */
export function normalizeFormula(formula:string,scope:{self?:string;parent?:string|null;renames?:Record<string,string>}={}) {
  const tokens:string[]=[];let offset=formula.startsWith('=')?1:0;let complete=true;
  while(offset<formula.length){const rest=formula.slice(offset);const space=/^\s+/.exec(rest);if(space){offset+=space[0].length;continue;}
    if(rest.startsWith('//')||rest.startsWith('/*')){complete=false;tokens.push(rest);break;}
    const token=/^(?:"(?:""|[^"])*"|'(?:''|[^'])*'|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|&&|\|\||<>|<=|>=|;;|[(){}[\].,:;=+*/&!<>%-])/.exec(rest)?.[0];
    if(!token){complete=false;tokens.push(rest);break;}tokens.push(token);offset+=token.length;
  }
  const resolved=tokens.map((token,i)=>{
    // Only unquoted qualified references may be rebound. A variable named Self in a record is not rewritten.
    let id=token;if(tokens[i+1]==='.'&&token==='Self'&&scope.self)id=scope.self;
    if(tokens[i+1]==='.'&&token==='Parent'&&scope.parent)id=scope.parent;
    return /^[A-Za-z_]\w*$/.test(id)?scope.renames?.[id]??id:id;
  });
  return {tokens:resolved,complete};
}
export function compareFormula(before:Dependency,after:Dependency|undefined,renames:Record<string,string>={}):{category:FormulaCategory;reason:string} {
  if(!after)return {category:'BUSINESS_BEHAVIOR_CHANGE',reason:'Functional property lost'};
  const a=normalizeFormula(before.formula,{self:before.control,parent:before.parent,renames});
  const b=normalizeFormula(after.formula,{self:after.control,parent:after.parent});
  if(!a.complete||!b.complete)return {category:'UNRESOLVED',reason:'Formula contains unsupported lexical syntax'};
  const scopeChanged=(renames[before.parent??'']??before.parent)!==after.parent;
  if(scopeChanged&&(a.tokens.includes('ThisItem')||a.tokens.includes('ThisRecord')||/^(DataField|Update|DataSource|Item)$/.test(before.property)))return {category:'UNRESOLVED',reason:'Binding scope changed'};
  if(hashJson(a.tokens)===hashJson(b.tokens))return {category:Object.keys(renames).some(k=>normalizeFormula(before.formula).tokens.includes(k))?'EXPECTED_REBINDING':'SEMANTICALLY_EQUIVALENT',reason:'Identical token sequence after bounded scope/rename normalization'};
  if(scopeChanged&&normalizeFormula(before.formula).tokens.includes('Parent'))return {category:'UNRESOLVED',reason:'Binding scope changed'};
  // A different nontrivial formula may be equivalent, but lexical evidence cannot prove it.
  return {category:'UNRESOLVED',reason:'Functional formula changed; semantic equivalence unproven'};
}
const mutators=new Set(['SubmitForm','Patch','Remove','RemoveIf','Update','UpdateIf','Collect','ClearCollect','Clear','Relate','Unrelate']);
export function mutationCalls(formula:string) {
  const {tokens}=normalizeFormula(formula);const effects:{operation:string;target:string;ordinal:number}[]=[];
  for(let i=0;i<tokens.length;i++){
    const t=tokens[i]!;if(tokens[i+1]!=='(')continue;
    if(mutators.has(t))effects.push({operation:t,target:tokens[i+2]??'',ordinal:effects.length});
    if(t==='Run'&&tokens[i-1]==='.')effects.push({operation:'flow',target:tokens[i-2]??'',ordinal:effects.length});
  }return effects;
}
export type BehaviorRole='select'|'navigate'|'submit'|'patch'|'flow'|'filter'|'sort'|'state'|'formItem'|'formUpdate'|'validation'|'cancel';
export function lowerBehaviorBindings(files:NativeFiles) {
  const bindings=dependencies(files).filter(isBehavioralBinding).map(d=>{
    const tokens=normalizeFormula(d.formula).tokens,effects=mutationCalls(d.formula);let role:BehaviorRole='state';
    if(d.property==='Item')role='formItem';else if(d.property==='Update')role='formUpdate';else if(['Required','DisplayMode','MaxLength'].includes(d.property))role='validation';
    else if(tokens.includes('SubmitForm'))role='submit';else if(effects.some(e=>e.operation==='flow'))role='flow';else if(effects.length)role='patch';
    else if(tokens.includes('ResetForm'))role='cancel';else if(tokens.includes('Navigate'))role='navigate';else if(tokens.includes('Filter'))role='filter';else if(tokens.includes('Sort')||tokens.includes('SortByColumns'))role='sort';else if(tokens.includes('Select'))role='select';
    return {id:`${d.control}.${d.property}`,role,owner:d.control,property:d.property,scope:d.parent,expression:{language:'PowerFx' as const,source:d.formula,tokenHash:hashJson(tokens),typeStatus:'NATIVE_CHECK_REQUIRED' as const},dependencies:d.references,effects};
  });
  const body={version:'4.2',sourceHash:hashJson(files),bindings,mutationPaths:bindings.filter(b=>b.effects.length).map(b=>({bindingId:b.id,gateHash:b.expression.tokenHash,effects:b.effects}))};
  return {...body,hash:hashJson(body),limitations:['Bindings preserve source expressions; Power Fx types must be established by native authoring validation.','Collection mutations are conservatively protected even when local.']};
}
export function immutableMutationPaths(before:NativeFiles,after:NativeFiles,renames:Record<string,string>={}) {
  const a=dependencies(before).filter(d=>mutationCalls(d.formula).length),b=dependencies(after).filter(d=>mutationCalls(d.formula).length);
  const differences:string[]=[];
  for(const d of a){const target=b.find(n=>n.control===(renames[d.control]??d.control)&&n.property===d.property);const compared=compareFormula(d,target,renames);
    if(!['SEMANTICALLY_EQUIVALENT','EXPECTED_REBINDING'].includes(compared.category))differences.push(`${d.control}.${d.property}: mutation target, count, arguments or gate changed`);}
  for(const d of b)if(!a.some(n=>(renames[n.control]??n.control)===d.control&&n.property===d.property))differences.push(`${d.control}.${d.property}: new mutation path`);
  return {preserved:!differences.length,before:a.flatMap(d=>mutationCalls(d.formula)).length,after:b.flatMap(d=>mutationCalls(d.formula)).length,differences};
}
