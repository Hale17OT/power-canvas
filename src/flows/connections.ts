import type { TokenSource } from '../auth/msal.js';
import type { FlowSnapshot } from './remote.js';
import type { FlowOwnership } from './plan.js';
import { fail } from './expressions.js';
import { validateSharePointSite } from './metadata.js';
import type { SharePointMetadataReader } from './metadata.js';

/** Read-only, same-origin metadata client. No tokens or upstream response bodies appear in diagnostics. */
export function sharePointMetadataReader(tokens:TokenSource,transport:typeof fetch=fetch):SharePointMetadataReader {
 return {async read(site,path){
  const origin=validateSharePointSite(site),base=new URL(site.replace(/\/$/,'')+'/_api/'),url=new URL(path,base);
  if(url.origin!==origin.origin||!url.pathname.startsWith(base.pathname)||url.username||url.password||url.hash)fail('SharePoint metadata request escaped its site boundary.');
  const token=await tokens.token(origin.origin);
  const response=await transport(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,Accept:'application/json;odata=nometadata'}});
  if(!response.ok)fail(`BLOCKED: SharePoint metadata access returned HTTP ${response.status}. Verify the intended account and site permissions.`);
  const body=await response.json() as Record<string,unknown>;
  if(body['odata.nextLink']||body['@odata.nextLink']||body.__next)fail('SharePoint metadata is paginated; incomplete discovery cannot authorize deployment.');
  return body;
 }};
}
export async function authenticatedConnectionInventory(tokens:TokenSource,environmentId:string,transport:typeof fetch=fetch){
 const origin='https://api.powerplatform.com',token=await tokens.token(origin);
 const response=await transport(`${origin}/connectivity/environments/${encodeURIComponent(environmentId)}/connections?api-version=2024-10-01`,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}});
 if(!response.ok)fail(`BLOCKED: Power Platform connection discovery returned HTTP ${response.status}.`);
 const body=await response.json() as {value?:{id:string;name:string}[];nextLink?:string};
 if(!Array.isArray(body.value)||body.nextLink)fail('Connection inventory is incomplete.');
 return body.value.map(c=>({id:c.id,name:c.name,authorizationState:'UNVERIFIED: listing alone does not establish permission to bind/run'}));
}
export function connectionReport(snapshot:FlowSnapshot,state:FlowOwnership){return snapshot.resources.filter(r=>r.kind==='connection').map(r=>({connector:r.connector,logicalName:r.logicalName,referenceId:r.id,connectionId:r.connectionId,authorizationState:'UNVERIFIED',solutions:r.solutions,experimentSolutionMember:r.member,managed:r.managed,owner:r.owner,powerCanvasOwned:Object.values(state.entries).some(e=>e.kind==='connection'&&e.id===r.id&&e.hash===r.hash&&e.solutionId===snapshot.solutionId)}));}

/** Graph file identities are explicit; signed download URLs are never logged or sent credentials. */
export function wordMetadataReader(tokens:TokenSource,transport:typeof fetch=fetch):import('./metadata.js').WordMetadataReader{
 const graph=async(path:string)=>{const token=await tokens.token('https://graph.microsoft.com');const response=await transport('https://graph.microsoft.com/v1.0/'+path,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`}});if(!response.ok)fail(`BLOCKED: Word metadata access returned HTTP ${response.status}.`);return await response.json() as Record<string,unknown>;};
 const locate=async(source:string,drive:string,file:string)=>{
  const site=validateSharePointSite(source);if(!/^[a-zA-Z0-9!_-]+$/.test(drive)||!/^[a-zA-Z0-9!_-]+$/.test(file))fail('Word metadata validation requires immutable Graph drive/item IDs.');
  const item=await graph(`drives/${encodeURIComponent(drive)}/items/${encodeURIComponent(file)}`);
  if(item.id!==file||typeof item.webUrl!=='string'||!item.file||typeof item.size!=='number'||item.size>10*1024*1024)fail('Word item identity/type/size validation failed.');
  const url=new URL(item.webUrl);if(url.origin!==site.origin||!url.pathname.startsWith(site.pathname.replace(/\/$/,'')+'/'))fail('Word file does not belong to the configured SharePoint location.');return {item,site};
 };
 return {async file(source,drive,file){await locate(source,drive,file);},async template(source,drive,file){const {item,site}=await locate(source,drive,file);const raw=item['@microsoft.graph.downloadUrl'];if(typeof raw!=='string')fail('Word download URL is missing.');const url=new URL(raw);if(url.protocol!=='https:'||url.origin!==site.origin||url.username||url.password)fail('Word download escaped the verified SharePoint origin.');const response=await transport(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(30000)});if(!response.ok||!response.body)fail('Word template download failed.');const chunks:Uint8Array[]=[];let total=0;for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){total+=chunk.length;if(total>10*1024*1024){await response.body.cancel().catch(()=>{});fail('Word template exceeds 10 MB.');}chunks.push(chunk);}return Buffer.concat(chunks);}};
}
