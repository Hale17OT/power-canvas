import {create,convert} from 'xmlbuilder2';
import type {SharePointSpec,SPColumn} from './schema.js';
import {spCapability} from './capabilities.js';
import {hashJson,type JsonInput} from '../core/json.js';

export const spHash=(v:unknown)=>hashJson(v as JsonInput);
export const ref=(kind:string,key:string)=>'sharepoint.'+kind+':'+key;
export const builtins:Record<string,string>={Title:'Text',ID:'Counter',Created:'DateTime',Modified:'DateTime',Author:'User',Editor:'User'};
export interface SPDesired {id:string;kind:string;site:string;parent:string;identity:string;dependencies:string[];definition:Record<string,unknown>;properties:Record<string,unknown>;risk:'TENANT_WRITE'|'SECURITY_WRITE'|'READ_ONLY';unsupported:string[]}
export type ResolveIdentity=(resource:string)=>{id:string;driveId?:string;webUrl?:string};
const unresolved:ResolveIdentity=resource=>({id:'${'+resource+'}',driveId:'${'+resource+'.drive}',webUrl:'${'+resource+'.url}'});
export function siteOf(s:SharePointSpec,resource:string):string{
 const [kind,key]=resource.split(':');if(kind==='sharepoint.site')return key!;
 if(kind==='sharepoint.list')return s.lists[key!]?.site??'';
 if(kind==='sharepoint.library')return s.libraries[key!]?.site??'';
 return '';
}
export function columnPayload(c:SPColumn,resolve:ResolveIdentity=unresolved){
 const base:Record<string,unknown>={name:c.internalName,displayName:c.displayName};
 for(const key of ['description','required','hidden','indexed'] as const)if(c[key]!==undefined)base[key]=c[key];
 if(c.unique!==undefined)base.enforceUniqueValues=c.unique;
 switch(c.type){
  case 'text':base.text={allowMultipleLines:false,maxLength:c.maxLength};break;
  case 'multiline':base.text={allowMultipleLines:true,linesForEditing:c.lines,textType:'plain'};break;
  case 'number':base.number={decimalPlaces:c.decimals,...(c.minimum!==undefined?{minimum:c.minimum}:{}),...(c.maximum!==undefined?{maximum:c.maximum}:{})};break;
  case 'currency':base.currency={locale:c.locale};break;
  case 'boolean':base.boolean={};break;
  case 'date':case 'datetime':base.dateTime={format:c.type==='date'?'dateOnly':'dateTime',displayAs:'default'};break;
  case 'choice':case 'multiChoice':base.choice={choices:c.choices,allowTextEntry:c.allowTextEntry,displayAs:c.type==='multiChoice'?'checkBoxes':c.displayAs??'dropDownMenu'};break;
  case 'lookup':base.lookup={listId:resolve(c.source.list).id,columnName:c.source.column,allowMultipleValues:c.multiple};break;
  case 'person':case 'multiPerson':base.personOrGroup={allowMultipleSelection:c.type==='multiPerson',chooseFromType:c.selection,displayAs:'name'};break;
  case 'hyperlink':base.hyperlinkOrPicture={isPicture:false};break;
 }
 return base;
}
export function viewQuery(view:SharePointSpec['views'][string],fields:Record<string,string>){
 const doc=create().ele('Query');
 const term=(node:ReturnType<typeof create>,f:typeof view.filters[number])=>{const tag={eq:'Eq',neq:'Neq',lt:'Lt',le:'Leq',gt:'Gt',ge:'Geq',isNull:'IsNull',isNotNull:'IsNotNull'}[f.operator];const el=node.ele(tag);el.ele('FieldRef',{Name:f.field});if(!['isNull','isNotNull'].includes(f.operator)){if(f.value===undefined)throw Error('View filter requires value');const type=fields[f.field];if(!type)throw Error('Unknown view field '+f.field);if(['Number','Currency','Counter'].includes(type)&&typeof f.value!=='number'||type==='Boolean'&&typeof f.value!=='boolean')throw Error('View filter value type mismatch');el.ele('Value',{Type:type}).txt(typeof f.value==='boolean'?(f.value?'1':'0'):String(f.value));}};
 const filters=(node:ReturnType<typeof create>,index:number)=>{if(index===view.filters.length-1)term(node,view.filters[index]!);else {const and=node.ele('And');term(and,view.filters[index]!);filters(and,index+1);}};
 if(view.filters.length)filters(doc.ele('Where'),0);
 if(view.sorting.length){const order=doc.ele('OrderBy');for(const s of view.sorting)order.ele('FieldRef',{Name:s.field,Ascending:s.direction==='asc'?'TRUE':'FALSE'});}
 return doc.end({headless:true}).replace(/^<Query>/,'').replace(/<\/Query>$/,'').replace('<Query/>','');
}
export function canonicalQuery(xml:string):unknown{
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('DTD is forbidden in CAML');
 // Parsing discards irrelevant XML formatting while retaining field/filter/sort order.
 return JSON.parse(convert('<Query>'+xml+'</Query>',{format:'json'}));
}
export function compileSharePoint(s:SharePointSpec,resolve:ResolveIdentity=unresolved){
 const result:SPDesired[]=[];const issues:{code:string;severity:'error'|'warning';resource:string;message:string}[]=[];
 const issue=(id:string,message:string)=>issues.push({code:'SHAREPOINT_CONTRACT',severity:'error',resource:id,message});
 const add=(kind:string,key:string,site:string,parent:string,identity:string,definition:Record<string,unknown>,properties:Record<string,unknown>,dependencies:string[]=[],unsupported:string[]=[])=>{const r:SPDesired={id:ref(kind,key),kind,site,parent,identity,definition,properties,dependencies:[...new Set([ref('site',site),...dependencies])].filter(v=>v!==ref(kind,key)).sort(),risk:['site','contentTypeBase'].includes(kind)?'READ_ONLY':kind==='permissionBoundary'?'SECURITY_WRITE':'TENANT_WRITE',unsupported};result.push(r);return r;};
 for(const [key,value]of Object.entries(s.sites))add('site',key,key,'',value.binding,value,{});
 for(const kind of ['list','library'] as const)for(const [key,v]of Object.entries(kind==='list'?s.lists:s.libraries)){
  add(kind,key,v.site,ref('site',v.site),v.displayName,v,{displayName:v.displayName,...(v.description!==undefined?{description:v.description}:{}),list:{template:kind==='list'?'genericList':'documentLibrary'}},[],v.title.mode==='used'&&!v.title.displayName?[]:['Title default changes are modeled but not provisioned in V1; no built-in field ownership.']);
 }
 for(const [key,c]of Object.entries(s.columns)){
  const deps=[c.parent];const id=ref('column',key);const site=siteOf(s,c.parent);
  if(Object.keys(builtins).some(b=>b.toLowerCase()===c.internalName.toLowerCase()))issue(id,'Platform default columns cannot be created or owned.');
  if('choices'in c&&(new Set(c.choices.map(v=>v.toLowerCase())).size!==c.choices.length))issue(id,'Duplicate choice values.');
  if(c.type==='number'&&c.minimum!==undefined&&c.maximum!==undefined&&c.minimum>c.maximum)issue(id,'Minimum exceeds maximum.');
  if(c.type==='multiChoice'&&c.displayAs)issue(id,'Multi-choice always uses checkBoxes; incompatible displayAs.');
  if(c.unique&&c.indexed===false)issue(id,'Unique columns require indexing.');
  if(c.type==='lookup'){
   deps.push(c.source.list);if(siteOf(s,c.source.list)!==site)issue(id,'Cross-site lookups are unsupported.');
   const column=Object.entries(s.columns).find(([,v])=>v.parent===c.source.list&&v.internalName===c.source.column);
   if(column)deps.push(ref('column',column[0]));else if(c.source.column!=='Title')issue(id,'Lookup source column is missing; only Title is an implicit lookup source.');
  }
  add('column',key,site,c.parent,c.internalName,c,columnPayload(c,resolve),deps);
 }
 for(const [site,name]of [...new Map(Object.values(s.contentTypes).filter(c=>['Item','Document'].includes(c.parent)).map(c=>[c.site+':'+c.parent,[c.site,c.parent] as const])).values()]){const id=name==='Item'?'0x01':'0x0101';add('contentTypeBase',site+'.'+name,site,ref('site',site),id,{site,parent:name,platformId:id},{id});}
 for(const [key,c]of Object.entries(s.contentTypes)){
  const parent=c.parent==='Item'?'0x01':c.parent==='Document'?'0x0101':resolve(ref('contentType',c.parent)).id;
  add('contentType',key,c.site,ref('site',c.site),c.name,c,{name:c.name,group:c.group,...(c.description!==undefined?{description:c.description}:{}),base:{id:parent}},['Item','Document'].includes(c.parent)?[ref('contentTypeBase',c.site+'.'+c.parent)]:[ref('contentType',c.parent)]);
  if(!['Item','Document'].includes(c.parent)&&s.contentTypes[c.parent]?.site!==c.site)issue(ref('contentType',key),'Parent content type must be declared in the same site.');
  for(const column of c.columns){const v=s.columns[column];if(!v||v.parent!==ref('site',c.site))issue(ref('contentType',key),'Content type requires a declared site column: '+column);
   add('contentTypeColumn',key+'.'+column,c.site,ref('contentType',key),column,{contentType:key,column},{sourceColumnId:resolve(ref('column',column)).id},[ref('contentType',key),ref('column',column)]);
  }
 }
 for(const [key,c]of Object.entries(s.contentTypeBindings)){
  const site=siteOf(s,c.target);if(site!==s.contentTypes[c.contentType]?.site)issue(ref('contentTypeBinding',key),'Content type and target must be in the same site.');
  add('contentTypeBinding',key,site,c.target,c.contentType,c,{sourceContentTypeId:resolve(ref('contentType',c.contentType)).id},[c.target,ref('contentType',c.contentType),...(s.contentTypes[c.contentType]?.columns??[]).map(col=>ref('contentTypeColumn',c.contentType+'.'+col))]);
 }
 for(const [key,f]of Object.entries(s.folders)){
  const container=ref('library',f.library);const parentPath=f.path.split('/').slice(0,-1).join('/');const owner=Object.entries(s.folders).find(([,v])=>v.library===f.library&&v.path===parentPath);
  if(parentPath&&!owner)issue(ref('folder',key),'Nested folder parent must be explicitly declared.');
  add('folder',key,s.libraries[f.library]?.site??'',owner?ref('folder',owner[0]):container,f.path,f,{name:f.path.split('/').at(-1),folder:{}},[container,...(owner?[ref('folder',owner[0])]:[])]);
 }
 for(const [key,v]of Object.entries(s.views)){
  const deps=[v.target];const fields:Record<string,string>={...builtins};
  const bindings=Object.entries(s.contentTypeBindings).filter(([,b])=>b.target===v.target);
  for(const [col,c]of Object.entries(s.columns)){
   const inherited=bindings.find(([,b])=>s.contentTypes[b.contentType]?.columns.includes(col));
   if(c.parent!==v.target&&!inherited)continue;
   fields[c.internalName]=c.type==='number'?'Number':c.type==='currency'?'Currency':['date','datetime'].includes(c.type)?'DateTime':c.type==='boolean'?'Boolean':c.type==='lookup'?'Lookup':['person','multiPerson'].includes(c.type)?'User':['choice','multiChoice'].includes(c.type)?'Choice':'Text';
   if([...v.fields,...v.filters.map(f=>f.field),...v.sorting.map(f=>f.field)].includes(c.internalName))deps.push(inherited?ref('contentTypeBinding',inherited[0]):ref('column',col));
  }
  for(const field of [...v.fields,...v.filters.map(f=>f.field),...v.sorting.map(f=>f.field)])if(!fields[field])issue(ref('view',key),'Unknown view field '+field);
  let query='';try{query=viewQuery(v,fields);}catch(e){issue(ref('view',key),String(e));}
  add('view',key,siteOf(s,v.target),v.target,v.title,v,{Title:v.title,ViewFields:v.fields,ViewQuery:canonicalQuery(query),RowLimit:v.rowLimit,...(v.default!==undefined?{DefaultView:v.default}:{})},deps,v.default===true?['Changing the default view can affect existing resources; blocked in V1.']:[]);
 }
 for(const [key,p]of Object.entries(s.permissions))add('permissionBoundary',key,siteOf(s,p.target),p.target,p.target,p,{HasUniqueRoleAssignments:p.inheritance==='unique'},[p.target],p.inheritance==='unique'||p.assignments.length?['Permission changes require separate security implementation/review; no V1 mutation adapter.']:[]);
 const names=new Set<string>();for(const r of result){const identity=r.site+':'+r.parent+':'+(['list','library'].includes(r.kind)?'container':r.kind)+':'+r.identity.toLowerCase();if(names.has(identity))issue(r.id,'Duplicate internal identity in parent scope.');names.add(identity);if(r.kind!=='site'&&!s.sites[r.site])issue(r.id,'Missing declared site binding.');for(const d of r.dependencies)if(!result.some(v=>v.id===d))issue(r.id,'Missing dependency '+d);}
 return {resources:result,issues,providerSelection:result.map(r=>({resource:r.id,...spCapability(r.kind)})),platformDefaults:Object.keys(builtins),businessDataWrites:0};
}
