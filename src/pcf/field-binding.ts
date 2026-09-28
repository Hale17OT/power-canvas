import {z} from 'zod';
import {hashJson} from '../core/json.js';
import {type PCFComponentIR} from './schema.js';
import {resolveOracleHosts,type InstalledOracleComponent} from './binding-oracle.js';
import {serializeObservedBindings,type ParameterNode,type ObservedBinding} from './binding-parser.js';

/** V1.0C differential Maker captures, not the PCF runtime form-factor enum. */
export const makerFormFactors={Phone:'0',Tablet:'1',Web:'2'} as const;
export const textFallbackId='{4273EDBD-AC1D-40D3-9FB2-095C621B552D}';
export const fieldHostClassId='{F9A8A302-114E-466A-B582-6771B2AE0D92}';
const key=z.string().regex(/^[A-Za-z][\w.]*$/);
export const fieldBindingIntentSchema=z.strictObject({component:key,form:key,host:key,column:key,boundProperty:z.literal('value'),staticInputs:z.strictObject({theme:z.enum(['light','dark'])}),selections:z.strictObject({Phone:z.enum(['native','pcf']),Tablet:z.enum(['native','pcf']),Web:z.enum(['native','pcf'])})});
export type FieldBindingIntent=z.infer<typeof fieldBindingIntentSchema>;
export interface FieldBindingResolution {references:Pick<FieldBindingIntent,'component'|'form'|'host'|'column'>;component:PCFComponentIR;installedName:string;hostUniqueId:string;hostId:string;columnLogicalName:string}
const node=(name:string,text:string,attributes:Record<string,string>={}):ParameterNode=>({name,namespace:null,attributes:Object.entries(attributes).sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>({name,value,namespace:null})),content:[text]});
const parameters=(content:ParameterNode[]):ParameterNode=>({name:'parameters',namespace:null,attributes:[],content});
function contract(r:FieldBindingResolution){
 if(r.component.kind!=='field'||!r.component.targets.modelDriven||r.component.namespace!=='PowerCanvas'||r.component.constructor!=='ColorContrastField')throw Error('Unverified field host contract');
 if(!/^[A-Za-z][\w]*_PowerCanvas\.ColorContrastField$/.test(r.installedName))throw Error('Component identity mismatch');
 for(const [name,usage]of [['value','bound'],['theme','input']] as const){const p=r.component.properties[name];if(!p||p.type!=='string'||p.usage!==usage)throw Error('Manifest/property mismatch');}
 if(!/^\{?[0-9a-f-]{36}\}?$/i.test(r.hostUniqueId)||!r.hostId||!r.columnLogicalName)throw Error('Missing resolved host column/identity');
}
/** Offline only: creates the verified controlDescription; never writes a form. */
export function lowerModelDrivenFieldPCFBinding(source:FieldBindingIntent,r:FieldBindingResolution):ObservedBinding {
 const input=fieldBindingIntentSchema.parse(source);contract(r);
 if(!Object.values(input.selections).includes('pcf'))throw Error('Removing all PCF selections is outside the verified subset');
 for(const key of ['component','form','host','column'] as const)if(input[key]!==r.references[key])throw Error('Unresolved logical reference '+key);
 const controls=Object.entries(makerFormFactors).map(([client,formFactor])=>{
  const pcf=input.selections[client as keyof typeof makerFormFactors]==='pcf';
  return {attributes:pcf?{formFactor,name:r.installedName}:{formFactor,id:textFallbackId},parameters:parameters(pcf?[node('theme',input.staticInputs.theme,{static:'true',type:'SingleLine.Text'}),node('value',r.columnLogicalName,{type:'SingleLine.Text'})]:[node('datafieldname',r.columnLogicalName)]),classification:pcf?'UNCLASSIFIED' as const:'FIRST_PARTY_OR_LEGACY' as const,semantics:'UNVERIFIED' as const};
 });
 return {forControl:r.hostUniqueId,attributes:{forControl:r.hostUniqueId},controls};
}
export function parseModelDrivenFieldPCFBinding(xml:string,r:FieldBindingResolution){
 contract(r);
 const installed:InstalledOracleComponent={name:r.installedName,platformId:'diagnostic-not-required',namespace:r.component.namespace,constructor:r.component.constructor,version:r.component.version,manifestHash:'source-contract'};
 const matches=resolveOracleHosts(xml,[installed]).filter(x=>x.host.id===r.hostId);
 if(matches.length!==1)throw Error('Exactly one field host required');const actual=matches[0]!;
 if(actual.host.datafieldname!==r.columnLogicalName||actual.host.classid?.toUpperCase()!==fieldHostClassId)throw Error('Field base host mismatch');
 if(Object.keys(actual.binding.attributes).join()!=='forControl'||actual.binding.controls.length!==3)throw Error('Unknown field binding structure');
 const selections={} as FieldBindingIntent['selections'];let theme:string|undefined;
 for(const [client,factor]of Object.entries(makerFormFactors)){
  const controls=actual.binding.controls.filter(c=>c.attributes.formFactor===factor);if(controls.length!==1)throw Error('Missing/duplicate formFactor');const c=controls[0]!;
  if(c.attributes.name===r.installedName){
   if(Object.keys(c.attributes).sort().join()!=='formFactor,name')throw Error('Unknown PCF control attributes');
   const n=c.parameters?.content.find(p=>typeof p!=='string'&&p.name==='theme');const value=typeof n!=='string'?n?.content[0]:undefined;
   if(value!=='light'&&value!=='dark')throw Error('Unverified static parameter');if(theme&&theme!==value)throw Error('Per-factor input differences unsupported');theme=value;selections[client as keyof typeof selections]='pcf';
  }else if(c.attributes.id===textFallbackId){selections[client as keyof typeof selections]='native';}else throw Error('External or unknown selected component');
 }
 if(!theme)throw Error('No PCF selected');
 const expected=lowerModelDrivenFieldPCFBinding({...r.references,boundProperty:'value',staticInputs:{theme:theme as 'light'|'dark'},selections},{...r,hostUniqueId:actual.binding.forControl});
 // Sort only factor entry order, retaining all parameter structure and unknown data.
 const canonical=(b:ObservedBinding)=>({...b,controls:[...b.controls].sort((a,b)=>a.attributes.formFactor!.localeCompare(b.attributes.formFactor!))});
 if(hashJson(canonical(actual.binding) as never)!==hashJson(canonical(expected) as never))throw Error('Unknown customControl parameter serialization');
 return {host:r.hostId,column:r.columnLogicalName,component:r.installedName,boundProperty:'value',staticInputs:{theme},selections};
}
export function compareFieldBinding(desired:FieldBindingIntent,r:FieldBindingResolution,xml:string,ownedHost:boolean):'NO_OP'|'UPDATE'|'CONFLICT'{
 let observed;try{observed=parseModelDrivenFieldPCFBinding(xml,r);}catch{return 'CONFLICT';}
 const b=lowerModelDrivenFieldPCFBinding(desired,r);
 // Use an isolated local host to parse our output through the same semantic boundary.
 const escaped=(s:string)=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
 const generated=`<form><control id="${escaped(r.hostId)}" uniqueid="${escaped(r.hostUniqueId)}" classid="${fieldHostClassId}" datafieldname="${escaped(r.columnLogicalName)}"/>${serializeObservedBindings([b])}</form>`;
 return hashJson(observed as never)===hashJson(parseModelDrivenFieldPCFBinding(generated,r) as never)?'NO_OP':ownedHost?'UPDATE':'CONFLICT';
}
