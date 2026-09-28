import type {CanvasSourceContracts} from '../canvas/compile.js';
import type {Project} from '../ir/schema.js';
import type {ValueShape,DataSource,Expr} from '../flows/schema.js';
import type {SharePointSpec,SPEvidence,SPColumn} from './schema.js';
import {ref} from './compile.js';
import {identityResolver} from './plan.js';

export function sharedField(c:SPColumn):ValueShape{
 if(['number','currency'].includes(c.type))return {type:'number'};
 if(c.type==='boolean')return {type:'boolean'};
 if(c.type==='date'||c.type==='datetime')return {type:c.type};
 if(c.type==='multiChoice')return {type:'array',items:{type:'string'}};
 // Person connector subfields require operation-specific metadata; never promise lookup Id/Value semantics.
 if(c.type==='person'||c.type==='multiPerson'){const person:ValueShape={type:'object',fields:{}};return c.type==='multiPerson'?{type:'array',items:person}:person;}
 if(c.type==='lookup'&&c.multiple)return {type:'array',items:{type:'object',fields:{Id:{type:'integer'},Value:{type:'string'}}}};
 if(c.type==='lookup')return {type:'object',fields:{Id:{type:'integer'},Value:{type:'string'}}};
 return {type:'string'};
}
export function sharePointBindingContracts(s:SharePointSpec,e?:SPEvidence){
 const resolve=identityResolver(s,e);
 return Object.fromEntries([...Object.entries(s.lists).map(([k,v])=>({id:ref('list',k),site:v.site,key:k,kind:'list' as const})),...Object.entries(s.libraries).map(([k,v])=>({id:ref('library',k),site:v.site,key:k,kind:'library' as const}))].map(v=>{
  const identity=resolve(v.id),site=resolve(ref('site',v.site));
  const metadata:DataSource={connector:'shared_sharepointonline',table:v.key,kind:v.kind,columns:{Title:{shape:{type:'string'},required:false,readable:true,create:true,update:true},ID:{shape:{type:'integer'},required:false,readable:true,create:false,update:false}}};
  for(const [key,c]of Object.entries(s.columns))if(c.parent===v.id||Object.values(s.contentTypeBindings).some(b=>b.target===v.id&&s.contentTypes[b.contentType]?.columns.includes(key)))metadata.columns[c.internalName]={shape:sharedField(c),required:c.required??false,readable:true,create:true,update:true,...('choices'in c?{choices:c.choices}:{})};
  const resolved=!identity.id.startsWith('${')&&!site.id.startsWith('${')&&(v.kind!=='library'||!!identity.driveId&&!identity.driveId.startsWith('${'));
  return [v.id,{resource:v.id,siteId:site.id,siteUrl:site.webUrl??null,listId:identity.id,driveId:identity.driveId??null,resolved,metadata,canvas:{provider:'sharepoint',connector:'shared_sharepointonline',fields:metadata.columns,delegation:'Connector/runtime verification required',nativeRegistration:'UNPROVEN'},flow:{connector:'shared_sharepointonline',metadata}}];
 }));
}
export function hydrateSharePointFlows(project:Project,s:SharePointSpec,e?:SPEvidence){
 const contracts=sharePointBindingContracts(s,e),copy=structuredClone(project),edges:{from:string;to:string}[]=[];
 const visit=(value:unknown,flow:string):unknown=>{
  if(Array.isArray(value))return value.map(v=>visit(v,flow));if(!value||typeof value!=='object')return value;
  const obj=value as Record<string,unknown>;
  if(typeof obj.use==='string'&&obj.use.startsWith('sharepoint.')){const site=obj.site as Record<string,unknown>|undefined,list=obj.list as Record<string,unknown>|undefined;if(site?.op==='sharepointResource'&&list?.op==='sharepointResource'&&(site.name!==list.name||(site.path as string[])[0]!=='siteUrl'||(list.path as string[])[0]!=='listId'))throw Error('SharePoint action site/list must use one identity contract');}
  if(obj.op==='sharepointResource'){
   const c=contracts[String(obj.name)];if(!c)throw Error('Unknown SharePoint Flow resource '+String(obj.name));
   edges.push({from:'flow:'+flow,to:c.resource});if(!c.resolved)return obj;
   const property=(obj.path as string[])[0]!;const literal=c[property as 'siteUrl'|'listId'|'driveId'];if(!literal)throw Error('Unresolved SharePoint property '+property);
   return {op:'literal',shape:{type:'string'},value:literal,intentionalConstant:'Resolved from the Unified SharePoint target-bound identity contract.'} satisfies Expr;
  }
  return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,visit(v,flow)]));
 };
 for(const [key,flow]of Object.entries(copy.resources?.flows??{}))copy.resources!.flows[key]=visit(flow,key) as typeof flow;
 for(const [key,recipe]of Object.entries(copy.resources?.workflowRecipes??{}))copy.resources!.workflowRecipes![key]=visit(recipe,key) as typeof recipe;
 if(copy.resources){copy.resources.flowDataSources??={};for(const c of Object.values(contracts)){
  const key=c.metadata.table;if(copy.resources.flowDataSources[key]&&JSON.stringify(copy.resources.flowDataSources[key])!==JSON.stringify(c.metadata))throw Error('Duplicate SharePoint metadata authority for '+key);
  copy.resources.flowDataSources[key]=c.metadata;
 }}
 return {project:copy,contracts,edges};
}


export function canvasSharePointSources(s:SharePointSpec,e?:SPEvidence):CanvasSourceContracts {
 const contracts=sharePointBindingContracts(s,e),result:CanvasSourceContracts={};
 for(const b of s.bindings.canvas){const c=contracts[b.resource];if(!c)throw Error('Unknown Canvas SharePoint resource');const columns:Record<string,{name:string;type:string;required:boolean}>={title:{name:'Title',type:'text',required:false},Title:{name:'Title',type:'text',required:false},ID:{name:'ID',type:'integer',required:false}};
  for(const field of Object.keys(c.metadata.columns)){const source=Object.values(s.columns).find(v=>v.internalName===field&&(v.parent===b.resource||Object.values(s.contentTypeBindings).some(bind=>bind.target===b.resource&&s.contentTypes[bind.contentType]?.columns.some(k=>s.columns[k]===v))));if(source)columns[field]={name:field,type:source.type==='multiline'?'multilineText':source.type,required:source.required??false};}
  result[b.app]??={};if(result[b.app]![b.alias])throw Error('Duplicate Canvas SharePoint alias');result[b.app]![b.alias]={provider:'sharepoint',resource:b.resource,dataSourceName:b.alias,primaryName:'Title',columns,resolved:c.resolved};
 }
 return result;
}
