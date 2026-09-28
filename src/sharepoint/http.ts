import {cancellableDelay,classifyTransport,retryAfter,retryClassification} from '../dataverse/transport.js';
import {siteUrl} from './schema.js';

export interface ProviderCredential {value:string;tenantId:string;audience:string;expiresAt:Date;scopes:readonly string[]}
export interface ProviderCredentialSource {acquire(request:{audience:string;scopes:readonly string[]}):Promise<ProviderCredential>}
export class SharePointRequestError extends Error {constructor(readonly status:number,readonly uncertain:boolean){super('SharePoint provider request failed: '+status+(uncertain?' UNKNOWN_OUTCOME; stop and reconcile':''));}}
/** Audience, target, redirect and metadata boundary checks apply before dispatch. Tokens are ephemeral. */
export class SharePointHttp {
 readonly audit:{method:string;surface:string;attempt:number;status:number;uncertain:boolean}[]=[];
 constructor(readonly surface:'Graph'|'SharePoint REST',readonly site:string,readonly tenantId:string,private credentials:ProviderCredentialSource,private fetcher:typeof fetch=fetch,private options:{simulation?:boolean;readOnly?:boolean;sleep?:(ms:number)=>Promise<void>;siteIds?:string[];driveIds?:string[]}={}){siteUrl.parse(site);if(new URL(site).hostname==='powercanvas-simulation.sharepoint.com'&&(!options.simulation||fetcher===fetch))throw Error('Simulation identity requires an isolated transport');}
 async request(path:string,method='GET',body?:unknown,headers:Record<string,string>={},scopes?:readonly string[]):Promise<unknown>{
  const site=new URL(this.site),audience=this.surface==='Graph'?'https://graph.microsoft.com':site.origin,base=this.surface==='Graph'?audience+'/v1.0':this.site.replace(/\/$/,'')+'/_api';
  const url=new URL(path.startsWith('https:')?path:base+path);
  if(url.origin!==audience||!url.pathname.startsWith(new URL(base).pathname+'/')||url.username||url.password||url.hash||/%2e|%2f|%5c/i.test(url.pathname))throw Error('Provider service boundary escaped');
  if(this.surface==='SharePoint REST'&&/\/items(?:\(|\/|$)/i.test(url.pathname)||/\$expand=[^&]*(items|children)/i.test(url.search))throw Error('Business rows/documents cannot be expanded during metadata discovery');
  if(method==='GET'&&/\/children(?:\/|$)/.test(url.pathname))throw Error('Business folder enumeration is outside metadata discovery');
  if(/\/(?:content|search)(?:\/|$)|\/lists\/[^/]+\/items(?:\/|$)|getitems|GetFileBy/i.test(url.pathname)||url.searchParams.has('search'))throw Error('Business content/tenant search is outside metadata discovery');
  if(this.surface==='Graph'){
   const route=decodeURIComponent(url.pathname.slice('/v1.0'.length));
   const exactSite='/sites/'+site.hostname+':'+site.pathname.replace(/\/$/,'');
   const allowed=route===exactSite||(this.options.siteIds??[]).some(id=>route.startsWith('/sites/'+id+'/')||route==='/sites/'+id)||(this.options.driveIds??[]).some(id=>route.startsWith('/drives/'+id+'/'));
   if(!allowed)throw Error('Graph path is outside explicitly bound sites/drives');
  }
  if(this.options.readOnly!==false&&method!=='GET')throw Error('Read-only SharePoint transport');
  if(!['GET','POST','PATCH'].includes(method)||Object.keys(headers).some(k=>k.toLowerCase()!=='if-match'))throw Error('Unsupported provider method/header');
  scopes??=[this.surface==='Graph'?(method==='GET'?'Sites.Read.All':url.pathname.includes('/drives/')?'Files.ReadWrite':'Sites.Manage.All'):(/roleassignments/i.test(url.pathname)?'AllSites.FullControl':method==='GET'?'AllSites.Read':'AllSites.Manage')];
  for(let attempt=1;attempt<=3;attempt++){
   let token:ProviderCredential;try{token=await this.credentials.acquire({audience,scopes});}catch{throw Error('SharePoint provider credential acquisition failed; raw diagnostics omitted');}
   if(!token.value||token.audience!==audience||token.tenantId!==this.tenantId||token.expiresAt.getTime()<=Date.now()+30000||!scopes.every(s=>token.scopes.includes(s)))throw Error('Provider credential audience/tenant/scope/expiry mismatch');
   let response:Response|undefined;let wait:number;
   try{
    response=await this.fetcher(url,{method,redirect:'manual',signal:AbortSignal.timeout(method==='GET'?30000:180000),headers:{Authorization:'Bearer '+token.value,Accept:'application/json;odata=nometadata','Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    this.audit.push({method,surface:this.surface,attempt,status:response.status,uncertain:method!=='GET'&&response.status>=500});
    if(response.ok)return response.status===204?null:await response.json();
    const retry=retryClassification({kind:'http',status:response.status});wait=(retryAfter(response.headers.get('retry-after'))??attempt)*1000;
    if(method!=='GET'||!retry.retryable||attempt===3||wait>30000)throw new SharePointRequestError(response.status,method!=='GET'&&(response.status>=500||response.status===408));
   }catch(error){
    if(error instanceof SharePointRequestError)throw error;
    const retry=retryClassification(classifyTransport(error,'connectOrHeaders'));
    if(method!=='GET'||!retry.retryable||attempt===3)throw new SharePointRequestError(response?.status??0,method!=='GET');wait=attempt*1000;
   }
   await (this.options.sleep??cancellableDelay)(wait);
  }
  throw Error('Read retry budget exhausted');
 }
 async all(path:string){const values:unknown[]=[];const seen=new Set<string>();let next:string|undefined=path;while(next){if(seen.has(next)||seen.size>=100)throw Error('Metadata pagination incomplete');seen.add(next);const raw=await this.request(next) as Record<string,unknown>;if(!Array.isArray(raw.value))throw Error('Invalid metadata collection');values.push(...raw.value);const continuation=raw['@odata.nextLink']??raw['odata.nextLink'];if(continuation!==undefined&&typeof continuation!=='string')throw Error('Malformed metadata continuation');next=continuation;}return values;}
}
