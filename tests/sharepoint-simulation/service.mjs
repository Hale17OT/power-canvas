import {URL} from 'node:url';
import {Buffer} from 'node:buffer';
import {createServer,request} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

export const guid=n=>'22222222-2222-4222-8222-'+String(n).padStart(12,'0');
export const siteUrl='https://powercanvas-simulation.sharepoint.com/sites/PowerCanvasProviderLab';
export const siteId='powercanvas-simulation.sharepoint.com,'+guid(1)+','+guid(2);
export const tenantId=guid(3);
const origin=new URL(siteUrl).origin;
export const graphBase='https://graph.microsoft.com/v1.0';
const fixture=name=>readFile(new URL('responses/'+name+'.json',import.meta.url),'utf8').then(JSON.parse);
const strip=(v,keys)=>Object.fromEntries(Object.entries(v).filter(([k])=>!keys.includes(k)));
const publicList=v=>strip(v,['columns','contentTypes','views','unique','drive','folders']);
const reply=(body,status=200,headers={})=>({body,status,headers});
const collection=(value,context)=>({'@odata.context':graphBase+'/$metadata#'+context,value});

/** Real HTTP, loopback-only: no DNS lookup, outbound forwarding or native fetch fallback exists. */
export function isolatedFetch(port){
 return async(input,init={})=>{
  const url=new URL(String(input));if(![origin,'https://graph.microsoft.com'].includes(url.origin))throw Error('UNMOCKED_ORIGIN_BLOCKED');
  return new Promise((resolve,reject)=>{
   const req=request({hostname:'127.0.0.1',port,path:url.href,method:init.method??'GET',headers:init.headers,signal:init.signal},res=>{
    const chunks=[];res.on('data',v=>chunks.push(v));res.on('end',()=>resolve(new globalThis.Response(res.statusCode===204?null:Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
   });req.on('error',reject);if(init.body)req.write(init.body);req.end();
  });
 };
}

export async function createLab(profile='team',options={}){
 const state=await fixture(profile),site=await fixture('site');const trace=[];let serial=200;
 const faults=[];const effects={lists:0,columns:0};const base='/v1.0/sites/'+siteId;
 const handle=(url,method,body,headers)=>{
  const path=decodeURIComponent(url.pathname),page=url.searchParams.get('$skiptoken');
  const paged=(values,context)=>{
   if(values.length>1&&!page)return reply({...collection(values.slice(0,1),context),'@odata.nextLink':url.origin+url.pathname+'?$skiptoken=page2'});
   return reply(collection(page?values.slice(1):values,context));
  };
  if(method==='GET'){
   if(url.origin==='https://graph.microsoft.com'){
    if(path==='/v1.0/sites/powercanvas-simulation.sharepoint.com:/sites/PowerCanvasProviderLab')return reply(site);
    if(path===base+'/lists')return paged(state.lists.map(publicList),'sites/lists');
    if(path===base+'/columns')return paged(state.columns,'sites/columns');
    if(path===base+'/contentTypes')return paged(state.contentTypes.map(v=>strip(v,['columns'])),'sites/contentTypes');
    const ct=path.match(new RegExp('^'+base+'/contentTypes/([^/]+)(/columns)?$'));
    if(ct){const found=state.contentTypes.find(v=>v.id===ct[1]);return found?ct[2]?paged(found.columns,'columns'):reply(strip(found,['columns'])):reply({error:{code:'itemNotFound'}},404);}
    const list=path.match(new RegExp('^'+base+'/lists/([^/]+)(?:/(columns|drive|contentTypes|permissions)(?:/([^/]+))?)?$'));
    if(list){const l=state.lists.find(v=>v.id===list[1]);if(!l)return reply({error:{code:'itemNotFound'}},404);
     if(!list[2])return reply(publicList(l));
     if(list[2]==='drive')return l.drive?reply(l.drive):reply({},404);
     if(list[2]==='permissions')return paged([{id:'permission-lab',roles:['read'],grantedToV2:{application:{id:guid(800),displayName:'Fictional simulation app'}}}],'permissions');
     const values=l[list[2]].map(v=>strip(v,['columns']));return list[3]?reply(values.find(v=>v.id===list[3])??{},values.some(v=>v.id===list[3])?200:404):paged(values,'list/'+list[2]);
    }
    const drive=path.match(/^\/v1.0\/drives\/([^/]+)\/(root|root:\/(.+))$/);
    if(drive){const l=state.lists.find(v=>v.drive?.id===drive[1]);if(!l)return reply({},404);if(drive[2]==='root')return reply({id:'root-'+l.id,folder:{childCount:l.folders.length}});const f=l.folders.find(v=>v.name===drive[3]);return f?reply(f):reply({error:{code:'itemNotFound'}},404);}
   }else if(url.origin===origin){
    const rest='/sites/PowerCanvasProviderLab/_api';
    if(path===rest+'/web')return reply({'odata.metadata':siteUrl+'/_api/$metadata#SP.Web',Id:options.wrongWeb?guid(999):guid(2),Url:siteUrl});
    if(path===rest+'/site')return reply({Id:guid(1)});
    const match=path.match(/\/_api\/web\/lists\(guid'([^']+)'\)(?:\/(views|roleassignments)(?:\(guid'([^']+)'\)\/viewfields)?)?$/);
    if(match){const l=state.lists.find(v=>v.id===match[1]);if(!l)return reply({},404);
     if(!match[2])return reply({Id:l.id,HasUniqueRoleAssignments:l.unique});
     if(match[2]==='roleassignments')return reply({value:[{PrincipalId:42,Member:{Id:42,PrincipalType:8,Title:'Contoso Members',Email:'fictional@example.invalid'},RoleDefinitionBindings:[{Id:1073741826,Name:'Read'}]}]});
     if(match[3])return reply(l.views.find(v=>v.Id===match[3])?.ViewFields??{},l.views.some(v=>v.Id===match[3])?200:404);
     return reply({'odata.metadata':siteUrl+'/_api/$metadata#SP.List.Views',value:l.views.map(v=>strip(v,['ViewFields']))});
    }
   }
  }
  if(url.origin==='https://graph.microsoft.com'&&method==='POST'&&profile==='empty'){
   if(options.writeFailure==='reject-400')return reply({error:{code:'invalidRequest'}},400);
   if(path===base+'/lists'){
    if(!body||body.list?.template!=='genericList'||Object.keys(body).some(k=>!['displayName','description','list'].includes(k)))return reply({error:{code:'invalidRequest'}},400);
    if(state.lists.some(l=>l.displayName===body.displayName))return reply({error:{code:'nameAlreadyExists'}},409);
    const l={id:guid(++serial),name:body.displayName.replaceAll(' ',''),displayName:body.displayName,description:body.description??'',list:{template:'genericList',hidden:false},webUrl:siteUrl+'/Lists/Certification',eTag:'"1"',columns:[],contentTypes:[],views:[],folders:[],unique:false};
    if(options.writeFailure==='postcondition')l.list.template='tasks';state.lists.push(l);effects.lists++;
    if(options.writeFailure==='accepted-drop')return {drop:true};return reply(publicList(l),201);
   }
   const m=path.match(new RegExp('^'+base+'/lists/([^/]+)/columns$'));
   if(m){const l=state.lists.find(v=>v.id===m[1]);if(!l)return reply({},404);
    const facets=['text','choice','dateTime'].filter(k=>body?.[k]);if(facets.length!==1||!body.name||!body.displayName)return reply({},400);
    const allowed=['name','displayName','description','required','hidden','indexed','enforceUniqueValues',...facets];if(Object.keys(body).some(k=>!allowed.includes(k)))return reply({},400);
    const c={id:guid(++serial),required:false,hidden:false,indexed:false,readOnly:false,...body};l.columns.push(c);effects.columns++;return reply(c,201);
   }
  }
  if(method==='PATCH'&&profile==='empty'){if(headers['if-match']!=='"1"')return reply({},412);return reply({},503);}
  return reply({error:{code:'UNMOCKED_REQUEST_BLOCKED',method,path}},502);
 };
 const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  let result;const url=new URL(req.url),method=req.method,body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):undefined;
  const fault=faults.find(f=>f.remaining>0&&f.matches(url,method));
  if(fault){fault.remaining--;result=fault.status==='socket-drop'?{drop:true,timeout:true}:reply({error:{code:'SIMULATED_FAILURE'}},fault.status,fault.status===429?{'retry-after':'2'}:{});}
  else result=handle(url,method,body,req.headers);
  trace.push({method,url:url.href,body:body??null,status:result.drop?0:result.status,response:result.body??null,headers:result.headers??{},at:Date.now(),blocked:result.body?.error?.code==='UNMOCKED_REQUEST_BLOCKED'});
  if(result.drop){res.destroy();return;}res.writeHead(result.status,{'content-type':'application/json',...result.headers});res.end(result.status===204?undefined:JSON.stringify(result.body));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 return {state,trace,effects,port,fetcher:isolatedFetch(port),faults,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}),assertIsolated(){assert(trace.every(t=>['https://graph.microsoft.com',origin].includes(new URL(t.url).origin)));return {realSharePointCalls:0,realSharePointWrites:0,realBusinessData:0,transport:'LOOPBACK_ONLY',unmocked:trace.filter(t=>t.blocked).length};}};
}
