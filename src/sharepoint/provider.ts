import {create} from 'xmlbuilder2';
import {canonicalQuery,compileSharePoint,ref,type SPDesired,type ResolveIdentity} from './compile.js';
import {projectProperties} from './plan.js';
import {spObservedSchema,type SharePointSpec,type SPObserved} from './schema.js';
import {spHash} from './compile.js';

export interface SPRequest {surface:'Graph'|'SharePoint REST';method:'POST'|'PATCH';path:string;body:unknown;headers?:Record<string,string>}
const segment=(v:string)=>{if(v.startsWith('${'))throw Error('Unresolved stable resource identity');return encodeURIComponent(v);};
export function createRequest(d:SPDesired,s:SharePointSpec,resolve:ResolveIdentity):SPRequest{
 const site=segment(resolve(ref('site',d.site)).id),parent=resolve(d.parent),base='/sites/'+site;
 const request=(path:string,body:unknown,surface:SPRequest['surface']='Graph'):SPRequest=>({surface,method:'POST',path,body});
 if(d.unsupported.length)throw Error(d.unsupported.join('; '));
 if(['list','library'].includes(d.kind))return request(base+'/lists',d.properties);
 if(d.kind==='column')return request(base+(d.parent.startsWith('sharepoint.site:')?'':'/lists/'+segment(parent.id))+'/columns',d.properties);
 if(d.kind==='contentType')return request(base+'/contentTypes',d.properties);
 if(d.kind==='contentTypeColumn')return request(base+'/contentTypes/'+segment(parent.id)+'/columns',{'sourceColumn@odata.bind':'https://graph.microsoft.com/v1.0'+base+'/columns/'+segment(String(d.properties.sourceColumnId))});
 if(d.kind==='contentTypeBinding')return request(base+'/lists/'+segment(parent.id)+'/contentTypes/addCopy',{contentType:'https://graph.microsoft.com/v1.0'+base+'/contentTypes/'+segment(String(d.properties.sourceContentTypeId))});
 if(d.kind==='folder'){
  const f=s.folders[d.id.split(':')[1]!]!;const library=resolve(ref('library',f.library));if(!library.driveId)throw Error('Library drive identity unresolved');
  return request('/drives/'+segment(library.driveId)+(d.parent.startsWith('sharepoint.folder:')?'/items/'+segment(parent.id):'/root')+'/children',{...d.properties,'@microsoft.graph.conflictBehavior':'fail'});
 }
 if(d.kind==='view')return request("/web/lists(guid'"+segment(parent.id)+"')/views",{Title:d.properties.Title,RowLimit:d.properties.RowLimit,PersonalView:false},'SharePoint REST');
 throw Error('No write adapter for '+d.kind);
}
/** Newly created view only: one follow-up configures all ordered fields and typed CAML. */
export function viewConfiguration(d:SPDesired,s:SharePointSpec,resolve:ResolveIdentity,id:string):SPRequest{
 const v=s.views[d.id.split(':')[1]!]!;const compiled=compileSharePoint(s,resolve).resources.find(r=>r.id===d.id)!;
 const query=compiled.properties.ViewQuery as {Query?:unknown};
 const doc=create().ele('View',{Type:'HTML'});const fields=doc.ele('ViewFields');for(const field of v.fields)fields.ele('FieldRef',{Name:field});
 if(query.Query)doc.import(create({Query:query.Query}));doc.ele('RowLimit',{Paged:'TRUE'}).txt(String(v.rowLimit));
 return {surface:'SharePoint REST',method:'POST',path:"/web/lists(guid'"+segment(resolve(d.parent).id)+"')/views(guid'"+segment(id)+"')/SetViewXml",body:{viewXml:doc.end({headless:true})}};
}
export function updateRequest(d:SPDesired,s:SharePointSpec,resolve:ResolveIdentity,id:string,etag:string):SPRequest{
 if(!etag||!['list','library','column'].includes(d.kind))throw Error('No guarded update adapter');
 const r=createRequest(d,s,resolve);const body=Object.fromEntries(Object.entries(d.properties).filter(([k])=>['displayName','description'].includes(k)));
 return {...r,method:'PATCH',path:r.path+'/'+segment(id),body,headers:{'If-Match':etag}};
}
const record=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid provider object');return v as Record<string,unknown>;};
const text=(v:unknown)=>{if(typeof v!=='string'||!v)throw Error('Stable provider identity missing');return v;};
export function readback(d:SPDesired,raw:unknown,resolve:ResolveIdentity,aux:{verify?:boolean;drive?:unknown;viewFields?:unknown;parentId?:string}={}):SPObserved{
 const data=record(raw),siteId=resolve(ref('site',d.site)).id,parentId=resolve(d.parent).id;
 const id=text(data.id??data.Id);let properties:Record<string,unknown>={...data};let extra:Record<string,unknown>={};
 if(d.kind==='library'){
  const drive=record(aux.drive),ids=record(drive.sharepointIds);if(text(ids.listId).toLowerCase()!==id.toLowerCase())throw Error('LIBRARY_IDENTITY_MISMATCH: Library list/drive identity mismatch');extra={driveId:text(drive.id),driveListId:ids.listId};
 }
 if(d.kind==='column'){extra.internalName=text(data.name);if(aux.verify!==false&&data.name!==d.identity)throw Error('Internal column identity mismatch');}
 if(d.kind==='contentType')properties.base={id:record(data.base??{id:data.parentId}).id};
 if(d.kind==='contentTypeColumn')properties={sourceColumnId:id};
 if(d.kind==='contentTypeBinding'){
  const inherited=record(data.inheritedFrom);if(inherited.siteId!==siteId)throw Error('Content type inherited site mismatch');properties={sourceContentTypeId:text(inherited.id)};
 }
 if(d.kind==='view'){
  const fields=record(aux.viewFields??data.ViewFields);const values=fields.Items??fields.results;
  if(!Array.isArray(values)||!values.every(v=>typeof v==='string'))throw Error('View field order missing');
  properties={...data,ViewFields:values,ViewQuery:canonicalQuery(typeof data.ViewQuery==='string'?data.ViewQuery:'')};
 }
 if(d.kind==='folder'){
  record(data.folder);const parent=record(data.parentReference);if(parent.driveId!==resolve(ref('library',String(d.definition.library))).driveId)throw Error('Folder drive mismatch');
  if(!aux.parentId||parent.id!==aux.parentId)throw Error('Folder parent identity not verified');properties={name:data.name,folder:{}};
 }
 const projected=projectProperties(properties,d.properties);
 if(aux.verify!==false&&spHash(projected)!==spHash(d.properties))throw Error('Provider readback differs from defining metadata');
 return spObservedSchema.parse({resource:d.id,kind:d.kind,id,siteId,parentId,properties:projected,...extra,...(typeof data.webUrl==='string'?{webUrl:data.webUrl}:{}),...(typeof data['@odata.etag']==='string'?{etag:data['@odata.etag']}:typeof data.eTag==='string'?{etag:data.eTag}:{})});
}
