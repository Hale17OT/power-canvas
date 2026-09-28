import {simulationEvidence} from './simulation-evidence.js';
const simulated=simulationEvidence();
/** One authoritative API per capability. No transport fallback and no live maturity claims. */
const graph='https://learn.microsoft.com/en-us/graph/api/';
const entry=(id:string,surface:'Graph'|'SharePoint REST'|'Not implemented',scope:string,reference:string,apply=true)=>({id:'sharepoint.'+id,provider:'sharepoint',surface,apiVersion:surface==='Graph'?'v1.0':surface==='SharePoint REST'?'_api':null,permissions:{delegated:scope,application:surface==='SharePoint REST'?'Separate SharePoint application grant required':scope},schema:true,compile:apply,plan:true,applyAdapter:apply,readback:apply,implementation:apply?'implemented':'planned',maturity:apply?'experimental':'planned',liveProof:false,deploy:false,simulation:simulated.find(c=>c.id==='sharepoint.'+id)??null,liveReadStatus:'EXTERNAL_ACCOUNT_BLOCKED',liveWriteStatus:'EXTERNAL_ACCOUNT_BLOCKED',reference,reason:surface==='Graph'?'Stable Graph resource contract':surface==='SharePoint REST'?'SharePoint-native view/security contract is not modeled equivalently by Graph':'Explicitly outside bounded V1'});
export const sharepointCapabilities=[
 {...entry('site.bind','Graph','Sites.Read.All',graph+'site-getbypath?view=graph-rest-1.0'),applyAdapter:false},
 {...entry('site.create','Not implemented','none','',false),schema:false},
 entry('list.create','Graph','Sites.Manage.All',graph+'list-create?view=graph-rest-1.0'),
 entry('library.create','Graph','Sites.Manage.All',graph+'list-create?view=graph-rest-1.0'),
 ...['list','library','column','contentType','folder','view','permission'].map(n=>({...entry(n+'.discover',n==='view'||n==='permission'?'SharePoint REST':'Graph','Read-only discovery; separate audience authorization','docs/sharepoint-simulation-v11s.md'),applyAdapter:false})),
 ...['column','choice','lookup','person','siteColumn'].map(n=>entry(n+'.create','Graph','Sites.Manage.All',graph+(n==='siteColumn'?'site-post-columns':'list-post-columns')+'?view=graph-rest-1.0')),
 {...entry('contentTypeBase.bind','Graph','Sites.Read.All',graph+'contenttype-get?view=graph-rest-1.0'),applyAdapter:false},
 entry('contentType.create','Graph','Sites.Manage.All',graph+'site-post-contenttypes?view=graph-rest-1.0'),
 entry('contentTypeColumn.create','Graph','Sites.Manage.All',graph+'contenttype-post-columns?view=graph-rest-1.0'),
 entry('contentTypeBinding.create','Graph','Sites.Manage.All',graph+'contenttype-addcopy?view=graph-rest-1.0'),
 {...entry('folder.create','Graph','Files.ReadWrite',graph+'driveitem-post-children?view=graph-rest-1.0'),permissions:{delegated:'Files.ReadWrite',application:'Files.ReadWrite.All'}},
 entry('view.create','SharePoint REST','SharePoint AllSites.Manage','https://github.com/pnp/pnpjs/blob/version-4/packages/sp/views/types.ts'),
 {...entry('permission.read','SharePoint REST','SharePoint AllSites.FullControl','https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins/set-custom-permissions-on-a-list-by-using-the-rest-interface'),applyAdapter:false},
 entry('permission.breakInheritance','Not implemented','Separate security review required','',false),
 entry('permission.assign','Not implemented','Separate security review required','',false),
] as const;
export function spCapability(kind:string){return sharepointCapabilities.find(c=>c.id==='sharepoint.'+({site:'site.bind',contentTypeBase:'contentTypeBase.bind',permissionBoundary:'permission.read'}[kind]??kind+'.create'));}
