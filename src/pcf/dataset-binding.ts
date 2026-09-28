import {z} from 'zod';
import {hashJson} from '../core/json.js';
import {type PCFComponentIR} from './schema.js';
import {resolveOracleHosts} from './binding-oracle.js';
import {type ParameterNode,type ObservedBinding} from './binding-parser.js';
import {fieldHostClassId,makerFormFactors} from './field-binding.js';

const key=z.string().regex(/^[A-Za-z][\w.]*$/);
export const datasetBindingIntentSchema=z.strictObject({component:key,form:key,host:key,table:key,view:key,relationship:key,dataset:z.literal('records'),propertySets:z.strictObject({status:key,title:key}),staticInputs:z.strictObject({theme:z.enum(['light','dark'])}),selections:z.strictObject({Phone:z.literal('pcf'),Tablet:z.literal('pcf'),Web:z.literal('pcf')})});
export type DatasetBindingIntent=z.infer<typeof datasetBindingIntentSchema>;
export interface DatasetBindingResolution {references:Pick<DatasetBindingIntent,'component'|'form'|'host'|'table'|'view'|'relationship'>;component:PCFComponentIR;installedName:string;hostId:string;hostUniqueId:string;tableLogicalName:string;viewId:string;relationshipSchemaName:string;columns:Record<string,{logicalName:string;type:'string'|'choice'}>;nativeFallback:ObservedBinding['controls'][number]}
const node=(name:string,text:string):ParameterNode=>({name,namespace:null,attributes:[],content:[text]});
const attribute=(name:string,value:string)=>({name,namespace:null,value});
export const datasetFallbackId='{E7A81278-8635-4D9E-8D4D-59480B391C5B}';
function fallback(r:DatasetBindingResolution){
 const n=r.nativeFallback;if(hashJson(n.attributes as never)!==hashJson({id:datasetFallbackId}))throw Error('Unverified native grid fallback');
 const expected=['RecordsPerPage','AutoExpand','EnableQuickFind','EnableViewPicker','EnableChartPicker','ChartGridMode','RelationshipName','TargetEntityType','ViewId','ViewIds'];
 const p=n.parameters;if(!p||p.name!=='parameters'||p.namespace||p.attributes.length||p.content.length!==expected.length)throw Error('Unknown grid fallback parameters');
 const values:Record<string,string>={};for(const [i,item]of p.content.entries()){if(typeof item==='string'||item.name!==expected[i]||item.namespace||item.attributes.length||item.content.length!==1||typeof item.content[0]!=='string')throw Error('Unknown grid fallback parameters');values[item.name]=item.content[0];}
 if(values.TargetEntityType!==r.tableLogicalName||values.RelationshipName!==r.relationshipSchemaName||values.ViewId!.toLowerCase()!==r.viewId.toLowerCase())throw Error('Base subgrid context mismatch');
 if(values.EnableViewPicker!=='false'||values.RecordsPerPage!=='4'||values.AutoExpand!=='Fixed'||values.EnableQuickFind!=='false'||values.EnableChartPicker!=='true'||values.ChartGridMode!=='All')throw Error('Unverified grid configuration');
 if(!/^\{[a-f\d-]{36}\}(,\{[a-f\d-]{36}\})*$/i.test(values.ViewIds!))throw Error('Missing view inventory');return values;
}
function contract(input:DatasetBindingIntent,r:DatasetBindingResolution){
 for(const key of ['component','form','host','table','view','relationship'] as const)if(input[key]!==r.references[key])throw Error('Unresolved logical reference '+key);
 if(r.component.kind!=='dataset'||!r.component.targets.modelDriven||r.component.namespace!=='PowerCanvas'||r.component.constructor!=='AdvancedDataGrid'||!/^\w+_PowerCanvas\.AdvancedDataGrid$/.test(r.installedName))throw Error('Unverified dataset component identity');
 for(const [property,type]of [['status','choice'],['title','string']] as const){if(r.component.datasets.records?.columns[property]?.type!==type||r.columns[input.propertySets[property]]?.type!==type)throw Error('Dataset manifest/property-set mismatch');}
 if(r.component.properties.theme?.type!=='string'||r.component.properties.theme.usage!=='input')throw Error('Static manifest mismatch');
 if(!r.hostId||!/^\{[a-f\d-]{36}\}$/i.test(r.hostUniqueId)||!/^\{[a-f\d-]{36}\}$/i.test(r.viewId))throw Error('Missing resolved dataset host');return fallback(r);
}
/** Only the observed all-client dataset contract. Native fallback is preserved, never synthesized. */
export function lowerModelDrivenDatasetPCFBinding(source:DatasetBindingIntent,r:DatasetBindingResolution):ObservedBinding{
 const input=datasetBindingIntentSchema.parse(source),base=contract(input,r);
 const ds:ParameterNode={name:'data-set',namespace:null,attributes:[attribute('name','records')],content:[node('ViewId',r.viewId),node('TargetEntityType',r.tableLogicalName),node('IsUserView','false'),node('EnableViewPicker','false'),node('RelationshipName',r.relationshipSchemaName),node('FilteredViewIds',base.ViewIds!),node('status',r.columns[input.propertySets.status]!.logicalName),node('title',r.columns[input.propertySets.title]!.logicalName)]};
 const theme:ParameterNode={...node('theme',input.staticInputs.theme),attributes:[attribute('static','true'),attribute('type','SingleLine.Text')]};
 return {forControl:r.hostUniqueId,attributes:{forControl:r.hostUniqueId},controls:[structuredClone(r.nativeFallback),...Object.values(makerFormFactors).map(formFactor=>({attributes:{formFactor,name:r.installedName},parameters:{name:'parameters',namespace:null,attributes:[],content:[ds,theme]},classification:'UNCLASSIFIED' as const,semantics:'UNVERIFIED' as const}))]};
}
const canonical=(b:ObservedBinding)=>({...b,controls:[...b.controls].sort((a,b)=>(a.attributes.formFactor??'').localeCompare(b.attributes.formFactor??''))});
export function parseModelDrivenDatasetPCFBinding(xml:string,r:DatasetBindingResolution){
 const matches=resolveOracleHosts(xml,[]).filter(x=>x.host.id===r.hostId);if(matches.length!==1)throw Error('Exactly one subgrid host required');const observed=matches[0]!;
 if(observed.host.indicationOfSubgrid!=='true'||observed.host.classid?.toUpperCase()!==fieldHostClassId)throw Error('Dataset component requires subgrid host');
 const pcfs=observed.binding.controls.filter(c=>c.attributes.name===r.installedName);if(pcfs.length!==3)throw Error('Unknown dataset form-factor selection');
 const params=pcfs[0]!.parameters;const theme=params?.content.find(p=>typeof p!=='string'&&p.name==='theme');const value=typeof theme!=='string'?theme?.content[0]:undefined;if(value!=='light'&&value!=='dark')throw Error('Unverified dataset static input');
 const ds=params?.content.find(p=>typeof p!=='string'&&p.name==='data-set');if(!ds||typeof ds==='string')throw Error('Missing dataset parameter');
 const logical=(name:string)=>{const n=ds.content.find(p=>typeof p!=='string'&&p.name===name);return typeof n!=='string'?n?.content[0]:undefined;};
 const columnKey=(property:string)=>{const matches=Object.entries(r.columns).filter(([,c])=>c.logicalName===logical(property));if(matches.length!==1)throw Error('Unknown property-set column');return matches[0]![0];};
 const intent:DatasetBindingIntent={...r.references,dataset:'records',propertySets:{status:columnKey('status'),title:columnKey('title')},staticInputs:{theme:value},selections:{Phone:'pcf',Tablet:'pcf',Web:'pcf'}};
 const expected=lowerModelDrivenDatasetPCFBinding(intent,{...r,hostUniqueId:observed.binding.forControl});
 if(hashJson(canonical(expected) as never)!==hashJson(canonical(observed.binding) as never))throw Error('Unknown dataset parameter serialization or base-context drift');
 return {component:r.installedName,host:r.hostId,table:r.tableLogicalName,view:r.viewId,relationship:r.relationshipSchemaName,dataset:'records',propertySets:intent.propertySets,staticInputs:intent.staticInputs,selections:intent.selections};
}
export function compareDatasetBinding(desired:DatasetBindingIntent,r:DatasetBindingResolution,xml:string,ownedHost:boolean):'NO_OP'|'UPDATE'|'CONFLICT'{
 try{const observed=parseModelDrivenDatasetPCFBinding(xml,r);lowerModelDrivenDatasetPCFBinding(desired,r);const same=hashJson({propertySets:desired.propertySets,staticInputs:desired.staticInputs,selections:desired.selections})===hashJson({propertySets:observed.propertySets,staticInputs:observed.staticInputs,selections:observed.selections});return same?'NO_OP':ownedHost?'UPDATE':'CONFLICT';}catch{return 'CONFLICT';}
}
