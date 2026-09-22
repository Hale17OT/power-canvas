import { controls, compareBehavior, dependencies } from './audit.js';
import type { NativeFiles } from '../native-types.js';
import type { DesignMemory } from './memory.js';
import type { SemanticMap } from './decision-schema.js';
import { componentMetadataSchema } from './decision-schema.js';
import { ownsLegacyRefinement, refineLegacyApplication } from './adapters/complaint-refine.js';

export const refinementPasses = ['layout', 'typeset', 'distill', 'color', 'polish', 'bolder', 'quieter'] as const;
export type RefinementFocus = typeof refinementPasses[number];
export function mergeFormulas(files:NativeFiles, formulas:Record<string,string>) {
  const app=files['App.pa.yaml'] as {App:{Properties:{Formulas:string}}};
  const original=app.App.Properties.Formulas.slice(1).split(';').map(v=>v.trim()).filter(Boolean);
  app.App.Properties.Formulas='='+[...original.filter(line=>!Object.hasOwn(formulas,line.split('=')[0]!.trim())),...Object.entries(formulas).map(([k,v])=>`${k} = ${v}`)].join(';\n')+';';
}
/** Refinement consumes sidecar roles; names carry no presentation semantics. */
export function refineNative(input:NativeFiles, memory:DesignMemory, focus:RefinementFocus, metadata?:SemanticMap) {
  if (!metadata && ownsLegacyRefinement(input)) return refineLegacyApplication(input,memory,focus);
  const files=structuredClone(input); const nodes=controls(files);const changes:string[]=[];
  for(const [name,raw] of Object.entries(metadata??{})) {
    const meta=componentMetadataSchema.parse(raw); const node=nodes.find(n=>n.name===name);
    if(!node)throw new Error(`Semantic metadata refers to missing control ${name}`);
    const set=(property:string,value:string)=>{if(node.node.Properties[property]!==value){node.node.Properties[property]=value;changes.push(`${name}.${property}`);}};
    if(focus==='typeset') {
      const token=({'page-title':'PF_typeTitle','record-primary-identity':'PF_typeTitle','section-title':'PF_typeSection','metadata':'PF_typeCaption','lead-metric':'PF_typeLead'} as Record<string,string>)[meta.role];
      if(token&&node.node.Control==='ModernText')set('Size','='+token);
    }
    if(focus==='layout'&&meta.role==='data-view'&&node.node.Control==='GroupContainer')set('LayoutGap',memory.primary.density.level>=7?'=8':'=16');
    if(focus==='color'&&node.node.Control==='ModernText'&&['metadata','record-secondary-identity'].includes(meta.role))set('Color','=PF_muted');
    if(focus==='polish'&&node.node.Control==='Button'&&['primary-command','secondary-command','destructive-command','navigation-primary'].includes(meta.role))set('Height','=Max(44, PF_controlHeight)');
    if(focus==='distill'&&meta.slot==='redundant-decoration') {
      if(dependencies(files).some(d=>d.control===name&&d.behavioral||d.references.includes(name)))throw new Error(`Cannot distill dependent control ${name}`);
      const parent=nodes.find(n=>n.name===node.parent);if(parent?.node.Children){parent.node.Children=parent.node.Children.filter(c=>!Object.hasOwn(c,name));changes.push(`removed decorative ${name}`);}
    }
  }
  if(focus==='typeset')mergeFormulas(files,Object.fromEntries(memory.primary.typography.hierarchy.map(r=>[r.token,String(r.size)])));
  const behavior=compareBehavior(input,files);if(!behavior.preserved)throw new Error('Refinement changed functional properties');
  return {files,focus,changes,outcome:changes.length?'Refined within design contract':'No justified change',behavior};
}
