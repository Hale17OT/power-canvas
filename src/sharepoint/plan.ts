import type {ResourceIR,Issue} from '../solution/schema.js';
import {ownedComparison} from '../planner/three-way.js';
import {compileSharePoint,ref,spHash,type SPDesired,type ResolveIdentity} from './compile.js';
import {spCapability} from './capabilities.js';
import type {SharePointSpec,SPEvidence,SPObserved} from './schema.js';

export function projectProperties(actual:unknown,shape:unknown):unknown{
 if(Array.isArray(shape))return actual??null;
 if(shape&&typeof shape==='object'){if(!actual||typeof actual!=='object'||Array.isArray(actual))return null;const v=actual as Record<string,unknown>;return Object.fromEntries(Object.entries(shape).map(([k,s])=>[k,projectProperties(v[k],s)]));}
 return actual??null;
}
export function safeSharePointUpdate(r:SPDesired,before:Record<string,unknown>,after:Record<string,unknown>){
 const allowed=r.kind==='list'||r.kind==='library'?['displayName','description']:r.kind==='column'&&!r.parent.startsWith('sharepoint.site:')?['displayName','description']:[];
 return Object.keys({...before,...after}).every(k=>spHash(before[k]??null)===spHash(after[k]??null)||allowed.includes(k));
}
export function choiceChange(before:string[],after:string[]){if(spHash(before)===spHash(after))return 'UNCHANGED';if(before.every((v,i)=>after[i]===v)&&after.length>before.length)return 'ADD';if(before.length===after.length&&before.every(v=>after.includes(v)))return 'REORDER';if(before.some(v=>!after.includes(v)))return after.some(v=>!before.includes(v))?'RENAME_OR_REPLACE':'REMOVE';return 'REORDER_AND_ADD';}
export function identityResolver(s:SharePointSpec,e?:SPEvidence,overrides:Record<string,{id:string;driveId?:string;webUrl?:string}>={}):ResolveIdentity{
 return resource=>{
  if(overrides[resource])return overrides[resource];
  const site=resource.startsWith('sharepoint.site:')?e?.observation?.sites[resource.split(':')[1]!]:undefined;
  if(site)return {id:site.id,webUrl:site.webUrl};
  const receipt=e?.ownership?.receipts.find(v=>v.resource===resource);
  const binding=resource.startsWith('sharepoint.list:')?s.lists[resource.split(':')[1]!]?.binding:resource.startsWith('sharepoint.library:')?s.libraries[resource.split(':')[1]!]?.binding:undefined;
  const external=binding?e?.configuration.resources[binding]:undefined;
  const found=e?.observation?.resources.find(v=>v.id===(receipt?.id??external?.id)&&v.siteId===(receipt?.siteId??e?.observation?.sites[external?.site??'']?.id));
  if(found)return {id:found.id,...(found.driveId?{driveId:found.driveId}:{}),...(found.webUrl?{webUrl:found.webUrl}:{})};
  return {id:'${'+resource+'}',driveId:'${'+resource+'.drive}',webUrl:'${'+resource+'.url}'};
 };
}
export function verifySiteBindings(s:SharePointSpec,e:SPEvidence){
 const receipts=e.ownership?.receipts??[];if(new Set(receipts.map(r=>r.resource)).size!==receipts.length)throw Error('Duplicate ownership resource');
 const hash=spHash(e.configuration);if(e.observation&&e.observation.targetHash!==hash||e.ownership&&e.ownership.targetHash!==hash)throw Error('SharePoint target mismatch');
 for(const [alias,definition]of Object.entries(s.sites)){
  const configured=e.configuration.sites[definition.binding],site=e.observation?.sites[alias];if(!site)continue;
  if(!configured)throw Error('Site observation has no explicit configured binding');const url=new URL(configured.url),observed=new URL(site.webUrl);
  if(url.origin!==observed.origin||url.pathname.replace(/\/$/,'')!==observed.pathname.replace(/\/$/,'')||site.hostname!==url.hostname||site.path!==observed.pathname||site.id.toLowerCase()!==[site.hostname,site.siteCollectionId,site.webId].join(',').toLowerCase()||configured.expectedSiteId&&configured.expectedSiteId!==site.id)throw Error('SharePoint site identity/target mismatch');
 }
}
export function planSharePoint(s:SharePointSpec,projectId:string,e?:SPEvidence,now=new Date()){
 if(e){verifySiteBindings(s,e);if(e.ownership?.projectId&&e.ownership.projectId!==projectId)throw Error('SharePoint ownership project mismatch');}
 const resolve=identityResolver(s,e),compiled=compileSharePoint(s,resolve);const issues:Issue[]=[...compiled.issues];const resources:ResourceIR[]=[];
 const fresh=!!e?.observation&&e.observation.complete&&e.observation.auth.graph==='HEALTHY'&&Date.parse(e.observation.observedAt)>now.getTime()-3600000&&Date.parse(e.observation.observedAt)<=now.getTime()+60000;
 const candidates=(d:SPDesired)=>e?.observation?.resources.filter(o=>o.siteId===resolve(ref('site',d.site)).id&&o.parentId===resolve(d.parent).id&&o.kind===d.kind)??[];
 const matches=(d:SPDesired,o:SPObserved)=>o.resource===d.id||[o.internalName,o.properties.name,o.properties.displayName,o.properties.Title,o.properties.sourceContentTypeId,o.properties.sourceColumnId].some(v=>v===(d.kind==='contentTypeBinding'?d.properties.sourceContentTypeId:d.kind==='contentTypeColumn'?d.properties.sourceColumnId:d.identity));
 for(const d of compiled.resources){
  const cap=spCapability(d.kind);const r:ResourceIR={id:d.id,kind:'sharepoint.'+d.kind,subsystem:'sharepoint',stage:d.kind==='permissionBoundary'?'VALIDATION':'DATA',physicalName:d.identity,requiredBy:[],dependencies:d.dependencies,definition:d.definition,definitionHash:spHash(d.definition),ownership:'UNKNOWN',state:'CREATE',reason:'Offline proposal only; complete target metadata and authorization required.',capability:{schema:true,compile:!!cap?.compile,deploy:false,runtime:false,production:false,status:'COMPILE_ONLY',limitations:['EXTERNAL_DEPLOYMENT_RESOURCE; not contained in a Dataverse solution ZIP.','No live SharePoint provisioning evidence; V1 has no CLI tenant-write route.']}};
  resources.push(r);
  const receipt=e?.ownership?.receipts.find(v=>v.resource===d.id);
  const binding='binding'in d.definition&&typeof d.definition.binding==='string'?e?.configuration.resources[d.definition.binding]:undefined;
  if(d.kind==='site'){
   r.ownership='EXTERNAL';r.state='EXTERNAL';const site=e?.observation?.sites[d.site];r.reason=site&&fresh?'Verified existing site dependency.':'Existing site binding unresolved; no site creation capability.';r.capability.status=site&&fresh?'SUPPORTED_WITH_LIMITS':'EXTERNAL_BLOCKED';if(site)r.existingId=site.id;continue;
  }
  if(d.kind==='contentTypeBase'){
   const current=candidates(d).find(o=>o.id===d.identity&&o.properties.id===d.identity);r.ownership='EXTERNAL';r.state='EXTERNAL';r.reason='Built-in parent content type; read-only platform dependency.';r.capability.status=current&&fresh&&e?.observation?.coverage.includes(d.id)?'SUPPORTED_WITH_LIMITS':'EXTERNAL_BLOCKED';if(current)r.existingId=current.id;continue;
  }
  if(d.unsupported.length){r.state='UNSUPPORTED';r.reason=d.unsupported.join(' ');continue;}
  if(e&&!fresh||e?.observation&&!e.observation.coverage.includes(d.id)){r.state='BLOCKED';r.reason='Incomplete, missing, stale or unhealthy scoped discovery.';continue;}
  if(cap?.surface==='SharePoint REST'&&e?.observation?.auth.rest!=='HEALTHY'){r.state='BLOCKED';r.reason='SharePoint REST audience authentication/metadata required.';continue;}
  const pool=candidates(d);const current=receipt?pool.find(o=>o.id===receipt.id):binding?pool.find(o=>o.id===binding.id):pool.find(o=>matches(d,o));
  if(pool.filter(o=>matches(d,o)).length>1){r.state='CONFLICT';r.reason='Ambiguous scoped resource collision.';continue;}
  if(binding&&(!current||binding.site!==d.site)){r.state='CONFLICT';r.reason='Explicit resource binding identity was not found in the bound site.';continue;}
  if(!current){if(receipt){r.state='BLOCKED';r.reason='Owned resource is missing; no implicit replacement.';}else if(d.kind==='permissionBoundary'){r.state='BLOCKED';r.reason='Exact existing permission inheritance readback required.';}continue;}
  r.existingId=current.id;
  if(d.kind==='library'&&(!current.driveId||current.driveListId?.toLowerCase()!==current.id.toLowerCase())){r.state='BLOCKED';r.reason='List/drive identity is not independently linked.';continue;}
  if(d.kind==='permissionBoundary'&&!receipt){r.ownership='EXTERNAL';r.state=current.properties.HasUniqueRoleAssignments===false?'NO_OP':'BLOCKED';r.reason=r.state==='NO_OP'?'Existing inherited boundary observed; no grants or ownership inferred.':'Inheritance differs; no reset/break allowed.';continue;}
  if(binding&&!receipt){r.state='EXTERNAL';r.ownership='EXTERNAL';r.reason='Explicit existing dependency; not adopted or mutable.';if(spHash(projectProperties(current.properties,d.properties))!==spHash(d.properties)){r.state='CONFLICT';r.reason='Explicit external resource does not match the declared contract.';}else r.capability.status='SUPPORTED_WITH_LIMITS';continue;}
  if(!receipt){r.state='CONFLICT';r.reason='Existing unowned resource; no display-name adoption.';continue;}
  r.ownership='POWERCANVAS_OWNED';
  if(receipt.siteId!==current.siteId||receipt.parentId!==current.parentId){r.state='CONFLICT';r.reason='Ownership stable parent/site mismatch.';continue;}
  const cmp=ownedComparison(d.properties,receipt.baseline,projectProperties(current.properties,receipt.baseline),projectProperties(current.properties,d.properties));
  if(cmp.drift){r.state='CONFLICT';r.reason='Owned properties changed outside the baseline.';continue;}
  if(cmp.equal){r.state='NO_OP';r.reason='Desired, owned baseline and fresh scoped observation agree.';continue;}
  if(receipt.etag&&receipt.etag!==current.etag){r.state='CONFLICT';r.reason='ETag changed since ownership baseline.';continue;}
  r.state=safeSharePointUpdate(d,receipt.baseline,d.properties)&&!!current.etag?'UPDATE':'BLOCKED';r.reason=r.state==='UPDATE'?'Allowlisted label/description update with exact ETag precondition.':'Replacement/type/choice/lookup/propagation/security changes or missing concurrency token require review.';
 }
 for(const receipt of e?.ownership?.receipts??[])if(!resources.some(r=>r.id===receipt.resource))resources.push({id:receipt.resource,kind:'sharepoint.orphan',subsystem:'sharepoint',stage:'DATA',physicalName:null,requiredBy:[],dependencies:[],definition:receipt.baseline,definitionHash:spHash(receipt.baseline),ownership:'POWERCANVAS_OWNED',existingId:receipt.id,state:'ORPHANED',reason:'Retain resource; automatic deletion is forbidden.',capability:{schema:true,compile:false,deploy:false,runtime:false,production:false,status:'BLOCKED',limitations:['No DELETE adapter.']}});
 return {...compiled,resources,issues,fresh,auth:e?.observation?.auth??{graph:'MISSING',rest:'MISSING'},readiness:{status:resources.length&&fresh&&resources.every(r=>r.state==='NO_OP'||r.state==='EXTERNAL'&&r.capability.status==='SUPPORTED_WITH_LIMITS')?'PROVIDER_CONVERGED':'PROVIDER_NOT_CONVERGED',externalDeploymentResource:true,liveProof:false,productionReady:false}};
}
