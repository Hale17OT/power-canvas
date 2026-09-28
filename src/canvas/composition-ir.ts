import { z } from 'zod';
import { hashJson } from '../core/json.js';
import { planDesign, type DesignPlan } from './taste/decisions.js';
import { patternCatalog } from './patterns.js';
import { componentEvidence } from './taste/catalog.js';
import { PowerCanvasError } from '../core/errors.js';
import { productionVariant, type CertifiedSelection } from './certified-selection.js';
import type {PCFSource} from '../pcf/schema.js';
import {evaluatePCFNeed} from './taste/pcf.js';

export const semanticSlots=['page.header','page.navigation','page.primaryContent','page.secondaryContent','record.identity','record.metadata','record.actions','record.activity','data.search','data.filters','data.commands','data.view','data.selectionActions','form.header','form.fields','form.review','form.actions','page.feedback','document.preview'] as const;
export const componentReferenceSchema=z.strictObject({preferred:z.string().min(1),fallback:z.string().min(1).optional(),variant:z.string().default('standard')});
export const compositionRegionSchema=z.strictObject({id:z.string().regex(/^[A-Za-z_]\w*$/),slot:z.enum(semanticSlots),layout:z.enum(['stack','row','split','overlay','fixed','flow']),component:componentReferenceSchema});
export const compositionIRSchema=z.strictObject({version:z.literal('4.1'),screen:z.string().regex(/^[A-Za-z_]\w*$/),planHash:z.string().length(64),archetype:z.string(),family:z.string(),stability:z.enum(['experimental','production']),shell:z.enum(['contextual','focused']),regions:z.array(compositionRegionSchema).min(1),responsive:z.array(z.strictObject({device:z.enum(['desktop','tablet','mobile']),navigation:componentReferenceSchema})).length(3),bindings:z.array(z.string()),hash:z.string().length(64)});
export type CanvasCompositionIR=z.infer<typeof compositionIRSchema>;
const aliases:Record<string,string>={Cards:'RichList',MobileBottomActions:'CommandBar', 'single-column':'TaskForm','two-column':'TaskForm',sectioned:'TaskForm',wizard:'TaskForm'};
const slotComponents:Partial<Record<typeof semanticSlots[number],string[]>>={
  'page.header':['RecordHeader'],'data.commands':['CommandBar','BulkActionBar','OverflowMenu'],
  'data.view':['DataTable','RichList','ChartCard','ActivityTimeline','GroupedList'],
  'form.fields':['TaskForm'],'form.review':['ConfirmationDialog','SideSheet','BottomSheet','FullScreenTask','ContextPanel','DedicatedPage'],
  'page.feedback':['ErrorState'],
};
export function resolveCompositionComponent(ref:z.infer<typeof componentReferenceSchema>,stability:'experimental'|'production',available=[...patternCatalog().map(p=>p.name as string),'DedicatedPage'],certifications?:CertifiedSelection) {
  const attempts=[ref.preferred,...(ref.fallback?[ref.fallback]:[])];const rejected:string[]=[];
  for(const requested of attempts){const name=aliases[requested]??requested;const evidence=name==='DedicatedPage'?{executable:true,maturity:'IMPLEMENTED' as const,variants:['standard'],nativeValidated:false}:componentEvidence(name);
    if(!available.includes(name)||!evidence.executable){rejected.push(requested+': no executable factory');continue;}
    const variant=['single-column','two-column','sectioned','wizard'].includes(requested)?requested:requested==='Cards'?'cards':ref.variant;
    const certificate=productionVariant(certifications,name,variant);
    if(stability==='production'&&!certificate){rejected.push(requested+': native certification required');continue;}
    if(!evidence.variants.includes(variant)){rejected.push(name+': unsupported variant '+variant);continue;}
    return {requested:ref.preferred,selected:name,variant,maturity:certificate?.maturity??evidence.maturity,fallbackUsed:requested!==ref.preferred,rejected};
  }throw new PowerCanvasError('PF-CANVAS-041','Component resolution blocked: '+rejected.join('; '),'Use an explicit executable fallback or experimental mode for local source exploration. Native evidence is required for production.');
}
export function createCompositionIR(plan:DesignPlan,stability:'experimental'|'production'='experimental'):CanvasCompositionIR {
  const selected=(key:string)=>plan.decisions.find(d=>d.decision===key)!.selected;
  const refs:[string,typeof semanticSlots[number],string,z.infer<typeof compositionRegionSchema>['layout']][]=[['header','page.header','RecordHeader','stack'],['commands','data.commands',selected('actions'),'row'],['data','data.view',selected('data'),'flow'],['form','form.fields',selected('form'),'stack'],['overlay','form.review',selected('overlay'),'overlay'],['feedback','page.feedback','ErrorState','stack']];
  const regions=refs.map(([id,slot,preferred,layout])=>({id,slot,layout,component:{preferred,variant:slot==='page.header'?(plan.direction==='content-first'?'editorial':plan.context.workflow==='analysis'?'standard':'compact'):slot==='data.view'&&preferred==='RichList'?(plan.dimensions.density>=7?'compact':'comfortable'):'standard'}}));
  // Both declaration order and slot identity are persisted before any native control exists.
  const body={version:'4.1' as const,screen:'Screen1',planHash:plan.hash,archetype:plan.archetype,family:plan.composition,stability,shell:plan.archetype==='focused-task'?'focused' as const:'contextual' as const,regions,responsive:(['desktop','tablet','mobile'] as const).map(device=>({device,navigation:{preferred:planDesign(plan.productContext,{device,design:{...plan.design,direction:plan.direction}}).decisions.find(d=>d.decision==='navigation')!.selected,variant:'standard'}})),bindings:['records','selection','commands','fields','validation','commit','feedback']};
  return compositionIRSchema.parse({...body,hash:hashJson(body)});
}
export function validateCompositionIR(raw:unknown,plan:DesignPlan,certifications?:CertifiedSelection,pcf?:PCFSource) {
  const ir=compositionIRSchema.parse(raw);const {hash,...body}=ir;
  if(hashJson(body)!==hash||ir.planHash!==plan.hash)throw new Error('Composition or design hash changed');
  if(new Set(ir.regions.map(r=>r.id)).size!==ir.regions.length||new Set(ir.regions.map(r=>r.slot)).size!==ir.regions.length)throw new Error('Duplicate composition identity or slot');
  if(new Set(ir.responsive.map(r=>r.device)).size!==3)throw new Error('Missing responsive device');
  if(ir.family!==plan.composition||ir.archetype!==plan.archetype)throw new Error('Composition family differs from the design plan');
  if(ir.screen!=='Screen1')throw new Error('The current host contract supports Screen1 only');
  const layouts:Record<string,string>={'page.header':'stack','data.commands':'row','data.view':'flow','form.fields':'stack','form.review':'overlay','page.feedback':'stack'};
  for(const r of ir.regions)if(layouts[r.slot]!==r.layout)throw new Error('Unsupported region/slot layout: '+r.slot);
  for(const slot of Object.keys(slotComponents))if(!ir.regions.some(r=>r.slot===slot))throw new Error('Missing required semantic slot: '+slot);
  const resolved=ir.regions.map(r=>{
    if(r.component.preferred.startsWith('pcf.component:')){
      const c=pcf?.components[r.component.preferred.slice('pcf.component:'.length)];
      if(!c||!c.targets.canvas||ir.stability==='production'||evaluatePCFNeed(c).selected!=='pcf'||r.component.variant!=='standard')throw Error('PCF composition requires a justified declared Canvas component and experimental profile.');
      if(r.slot!==(c.kind==='dataset'?'data.view':'form.fields'))throw Error('PCF kind/semantic slot mismatch');
      return {slot:r.slot,requested:r.component.preferred,selected:r.component.preferred,variant:'standard',maturity:'OFFLINE_BINDING_VERIFIED',fallbackUsed:false,rejected:[]};
    }
    return {slot:r.slot,...resolveCompositionComponent(r.component,ir.stability,undefined,certifications)};
  });
  for(const r of resolved)if(!r.selected.startsWith('pcf.component:')&&slotComponents[r.slot]&&!slotComponents[r.slot]!.includes(r.selected))throw new Error('Component incompatible with semantic slot: '+r.slot+' / '+r.selected);
  const navigation=ir.shell==='focused'?[]:ir.responsive.map(r=>({device:r.device,...resolveCompositionComponent(r.navigation,ir.stability,undefined,certifications)}));
  for(const n of navigation)if(!['TopNavigation','BottomNavigation','NavigationDrawer','CompactSidebar','Tabs'].includes(n.selected))throw new Error('Component incompatible with navigation slot');
  return {ir,resolved,navigation};
}
