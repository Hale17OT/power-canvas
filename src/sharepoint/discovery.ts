import {SharePointRequestError} from './http.js';
import {spSiteIdentitySchema,sharepointEvidenceSchema,type SharePointSpec,type SPEvidence,type SPObserved} from './schema.js';
import {compileSharePoint,ref,spHash,type ResolveIdentity} from './compile.js';
import {readback} from './provider.js';
import {orderResources} from '../solution/compile.js';

export interface MetadataReader {request(path:string):Promise<unknown>;all(path:string):Promise<unknown[]>}
export interface SharePointDiscoveryPorts {graph(url:string,siteId?:string,driveIds?:string[]):MetadataReader;rest(url:string):MetadataReader}
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid metadata object');return v as Record<string,unknown>;};
const id=(v:unknown)=>{if(typeof v!=='string'||!v)throw Error('Missing metadata identity');return v;};
/** Explicit configured sites only. The ports are read-only and never acquire/create/rebind auth profiles. */
export async function discoverSharePoint(spec:SharePointSpec,configuration:SPEvidence['configuration'],ports:SharePointDiscoveryPorts,ownership?:SPEvidence['ownership'],options:{inspect?:boolean}={}):Promise<NonNullable<SPEvidence['observation']>>{
 const sites:NonNullable<SPEvidence['observation']>['sites']={},resources:SPObserved[]=[],coverage:string[]=[];
 const details:Record<string,unknown[]>={siteCorrelation:[],lists:[],columns:[],contentTypes:[],permissions:[]};
 const identities:Record<string,{id:string;driveId?:string;webUrl?:string}>={};
 const resolve:ResolveIdentity=resource=>identities[resource]??{id:'${'+resource+'}'};
 let restUsed=false;
 for(const [alias,binding]of Object.entries(spec.sites)){
  const config=configuration.sites[binding.binding];if(!config)throw Error('Missing explicit SharePoint site configuration');
  const url=new URL(config.url),initial=ports.graph(config.url);const raw=obj(await initial.request('/sites/'+url.hostname+':'+url.pathname.replace(/\/$/,'')));
  const parts=id(raw.id).split(',');const site=spSiteIdentitySchema.parse({id:raw.id,hostname:parts[0],siteCollectionId:parts[1],webId:parts[2],webUrl:raw.webUrl,path:new URL(id(raw.webUrl)).pathname,displayName:raw.displayName,...(typeof raw.name==='string'?{name:raw.name}:{})});
  const check=sharepointEvidenceSchema.parse({configuration,observation:{targetHash:spHash(configuration),observedAt:new Date().toISOString(),complete:false,sites:{[alias]:site},coverage:[],resources:[],auth:{graph:'HEALTHY',rest:'MISSING'}}});
  const {verifySiteBindings}=await import('./plan.js');verifySiteBindings(spec,check);sites[alias]=site;identities[ref('site',alias)]={id:site.id,webUrl:site.webUrl};coverage.push(ref('site',alias));
  if(options.inspect){const rest=ports.rest(config.url);const web=obj(await rest.request('/web?$select=Id,Url')),collection=obj(await rest.request('/site?$select=Id'));correlateSite(site,web,collection);details.siteCorrelation!.push({siteId:site.id,status:'MATCH'});restUsed=true;}
  const graph=ports.graph(config.url,site.id),sitePath='/sites/'+encodeURIComponent(site.id);
  const lists=(await graph.all(sitePath+'/lists?$select=id,name,displayName,description,webUrl,list,eTag,sharepointIds,system')).map(obj);
  if(options.inspect)details.lists!.push(...lists.map(l=>({siteId:site.id,...l,classification:l.system?'SYSTEM':'APPLICATION'})));
  const scoped=compileSharePoint(spec,resolve).resources.filter(r=>r.site===alias);
  for(const d of scoped.filter(r=>['list','library'].includes(r.kind))){
   const receipt=ownership?.receipts.find(r=>r.resource===d.id);const binding=typeof d.definition.binding==='string'?configuration.resources[d.definition.binding]:undefined;
   const found=lists.filter(l=>receipt?l.id===receipt.id:binding?l.id===binding.id:!l.system&&l.displayName===d.identity);
   if(found.length>1)throw Error('CONFLICT: Ambiguous list identity');const raw=found[0];if(!raw){if(binding)throw Error('BOUND_RESOURCE_MISSING');coverage.push(d.id);continue;}
   const listId=id(raw.id);const drive=d.kind==='library'?await graph.request(sitePath+'/lists/'+encodeURIComponent(listId)+'/drive'):undefined;
   const observed=readback(d,raw,resolve,{...(drive?{drive}:{}),verify:false});resources.push(observed);identities[d.id]={id:observed.id,...(observed.driveId?{driveId:observed.driveId}:{}),...(observed.webUrl?{webUrl:observed.webUrl}:{})};coverage.push(d.id);
   if(options.inspect){const rows=(await graph.all(sitePath+'/lists/'+encodeURIComponent(listId)+'/columns?$select=id,name,displayName,description,required,hidden,indexed,enforceUniqueValues,readOnly,text,number,currency,boolean,dateTime,choice,lookup,personOrGroup,hyperlinkOrPicture')).map(obj);for(const r of rows){if(r.lookup&&!lists.some(l=>l.id===obj(r.lookup).listId))throw Error('BLOCKED: lookup references a missing same-site list');details.columns!.push({parent:d.id,...r,classification:['Title','ID','Created','Modified','Author','Editor'].includes(String(r.name))?'PLATFORM_DEFAULT':'EXTERNAL'});}}
  }
  const order=orderResources(compileSharePoint(spec,resolve).resources);
  const memo=new Map<string,unknown[]>();const all=async(reader:MetadataReader,path:string)=>{if(!memo.has(path))memo.set(path,await reader.all(path));return memo.get(path)!;};
  for(const resource of order){const d=compileSharePoint(spec,resolve).resources.find(v=>v.id===resource)!;if(d.site!==alias||coverage.includes(d.id))continue;
   const parent=identities[d.parent];if(!parent){coverage.push(d.id);continue;}
   const parentPath=d.parent.startsWith('sharepoint.site:')?sitePath:d.parent.startsWith('sharepoint.contentType:')?sitePath+'/contentTypes/'+encodeURIComponent(parent.id):sitePath+'/lists/'+encodeURIComponent(parent.id);
   const receipt=ownership?.receipts.find(r=>r.resource===d.id);let raw:Record<string,unknown>|undefined;const aux:{verify:false;drive?:unknown;viewFields?:unknown;parentId?:string}={verify:false};
   if(d.kind==='contentTypeBase'){raw=obj(await graph.request(sitePath+'/contentTypes/'+encodeURIComponent(d.identity)));}
   else if(d.kind==='column'||d.kind==='contentTypeColumn'){
    const rows=(await all(graph,parentPath+'/columns?$select=id,name,displayName,description,required,hidden,indexed,enforceUniqueValues,text,number,currency,boolean,dateTime,choice,lookup,personOrGroup,hyperlinkOrPicture')).map(obj);
    if(options.inspect){for(const r of rows){const lookup=r.lookup?obj(r.lookup):undefined;if(lookup&&!lists.some(l=>l.id===lookup.listId))throw Error('BLOCKED: lookup references a missing same-site list');details.columns!.push({parent:d.parent,...r,classification:['Title','ID','Created','Modified','Author','Editor'].includes(String(r.name))?'PLATFORM_DEFAULT':'EXTERNAL'});}}
    raw=rows.find(r=>receipt?r.id===receipt.id:d.kind==='contentTypeColumn'?r.id===d.properties.sourceColumnId:r.name===d.identity);
   }else if(d.kind==='contentType'||d.kind==='contentTypeBinding'){
    const rows=(await all(graph,parentPath+'/contentTypes?$expand=base')).map(obj);if(options.inspect)details.contentTypes!.push(...rows.map(r=>({parent:d.parent,...r})));raw=rows.find(r=>receipt?r.id===receipt.id:d.kind==='contentTypeBinding'?obj(r.inheritedFrom??{}).id===d.properties.sourceContentTypeId:r.name===d.identity);if(d.kind==='contentTypeBinding'&&!raw&&rows.some(r=>r.name===spec.contentTypes[String(d.definition.contentType)]?.name))throw Error('CONTENT_TYPE_SOURCE_MISMATCH');
   }else if(d.kind==='view'){
    restUsed=true;const rest=ports.rest(config.url),path="/web/lists(guid'"+encodeURIComponent(parent.id)+"')/views";
    raw=(await all(rest,path)).map(obj).find(r=>receipt?r.Id===receipt.id:r.Title===d.identity);if(raw)aux.viewFields=await rest.request(path+"(guid'"+encodeURIComponent(id(raw.Id))+"')/viewfields");
   }else if(d.kind==='folder'){
    const library=identities[ref('library',String(d.definition.library))];if(!library?.driveId)throw Error('Folder requires verified library drive');
    const reader=ports.graph(config.url,site.id,[library.driveId]),root='/drives/'+encodeURIComponent(library.driveId);
    const parentItem=d.parent.startsWith('sharepoint.folder:')?parent.id:id(obj(await reader.request(root+'/root?$select=id')).id);aux.parentId=parentItem;
    try{raw=obj(await reader.request(root+'/root:/'+String(d.definition.path).split('/').map(encodeURIComponent).join('/')+'?$select=id,name,folder,parentReference,eTag'));}catch(error){if(!(error instanceof SharePointRequestError&&error.status===404))throw error;}
   }else if(d.kind==='permissionBoundary'){
    restUsed=true;const rest=ports.rest(config.url),path="/web/lists(guid'"+encodeURIComponent(parent.id)+"')";const info=obj(await rest.request(path+'?$select=Id,HasUniqueRoleAssignments'));
    const roles=info.HasUniqueRoleAssignments===true?await rest.all(path+'/roleassignments?$expand=RoleDefinitionBindings,Member'):[];
    const safeRoles=roles.map(v=>{const r=obj(v),member=obj(r.Member??{});return {principalId:member.Id??r.PrincipalId??null,principalType:member.PrincipalType??null,roleDefinitionIds:(Array.isArray(r.RoleDefinitionBindings)?r.RoleDefinitionBindings:obj(r.RoleDefinitionBindings??{}).results as unknown[]??[]).map(v=>obj(v).Id)};});
    const graphPermissions=options.inspect?(await graph.all(sitePath+'/lists/'+encodeURIComponent(parent.id)+'/permissions')).map(v=>{const p=obj(v);return {id:p.id,roles:p.roles,identityKinds:Object.keys(obj(p.grantedToV2??p.grantedTo??{}))};}):undefined;
    if(options.inspect)details.permissions!.push({parentId:parent.id,classic:safeRoles,graph:graphPermissions,inherits:info.HasUniqueRoleAssignments===false});
    resources.push({resource:d.id,kind:'permissionBoundary',id:parent.id,siteId:site.id,parentId:parent.id,properties:{HasUniqueRoleAssignments:info.HasUniqueRoleAssignments as boolean,classicRoleAssignments:JSON.parse(JSON.stringify(safeRoles)),graphApplicationPermissions:graphPermissions?JSON.parse(JSON.stringify(graphPermissions)):'NOT_REQUESTED_NOT_EQUIVALENT'}});coverage.push(d.id);continue;
   }
   if(raw){const observed=readback(d,raw,resolve,aux);resources.push(observed);identities[d.id]={id:observed.id};}coverage.push(d.id);
  }
 }
 return {targetHash:spHash(configuration),observedAt:new Date().toISOString(),complete:true,...(options.inspect?{details:JSON.parse(JSON.stringify(details))}:{}),sites,resources,coverage,auth:{graph:'HEALTHY',rest:restUsed?'HEALTHY':'MISSING'}};
}

/** Compare only stable semantic facts; neither API may rebind the other. */
export function correlateSite(site:{webId:string;siteCollectionId:string;webUrl:string},web:Record<string,unknown>,collection:Record<string,unknown>){
 const guid=(v:unknown)=>String(v).replace(/[{}]/g,'').toLowerCase();
 if(guid(web.Id)!==guid(site.webId)||guid(collection.Id)!==guid(site.siteCollectionId)||new URL(id(web.Url)).href.replace(/\/$/,'')!==new URL(site.webUrl).href.replace(/\/$/,''))throw Error('SITE_TARGET_MISMATCH: Graph/REST identity correlation failed');
 return 'MATCH' as const;
}
