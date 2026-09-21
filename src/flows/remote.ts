import { z } from 'zod';
import type { DataverseHttp } from '../dataverse/http.js';
import type { Project } from '../ir/schema.js';
import { hashJson } from '../core/json.js';
import type { JsonInput } from '../core/json.js';
import { fail } from './expressions.js';
export type FlowHttp=Pick<DataverseHttp,'request'|'all'>;
export type ResourceKind='flow'|'connection'|'environment'|'environmentValue';
export const resourceKinds:Record<ResourceKind,{set:string;id:string;component:number;select:string}>= {
 flow:{set:'workflows',id:'workflowid',component:29,select:'workflowid,uniquename,name,description,category,type,primaryentity,clientdata,statecode,ismanaged,_ownerid_value'},
 connection:{set:'connectionreferences',id:'connectionreferenceid',component:10035,select:'connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname,connectorid,connectionid,ismanaged,_ownerid_value'},
 environment:{set:'environmentvariabledefinitions',id:'environmentvariabledefinitionid',component:380,select:'environmentvariabledefinitionid,schemaname,displayname,type,defaultvalue,ismanaged'},
 environmentValue:{set:'environmentvariablevalues',id:'environmentvariablevalueid',component:381,select:'environmentvariablevalueid,_environmentvariabledefinitionid_value,value,ismanaged'},
};
export type ObservedResource={kind:ResourceKind;id:string;logicalName:string;displayName:string;managed:boolean;owner:string|null;state:number|null;member:boolean;solutions:string[];hash:string;definitionHash:string|null;etag:string;trigger:string|null;connectionReferences:string[];connectionId:string|null;connector:string|null};
export type FlowSnapshot={solutionId:string;solutionName:string;publisher:string;resources:ObservedResource[]};
const text=(v:unknown)=>typeof v==='string'?v:'';
export function managedPayload(kind:ResourceKind,row:Record<string,unknown>):Record<string,unknown> {
  const fields:Record<ResourceKind,string[]>={flow:['uniquename','name','description','category','type','primaryentity','clientdata'],connection:['connectionreferencelogicalname','connectionreferencedisplayname','connectorid','connectionid'],environment:['schemaname','displayname','type','defaultvalue'],environmentValue:['_environmentvariabledefinitionid_value','value']};
  return Object.fromEntries(fields[kind].map(k=>[k,k==='clientdata'?JSON.parse(text(row[k])):row[k]??null]));
}
export function observeResource(kind:ResourceKind,row:Record<string,unknown>,members:Record<string,unknown>[],solutionId:string):ObservedResource {
  const id=z.guid().parse(row[resourceKinds[kind].id]);const payload=managedPayload(kind,row);const cd=kind==='flow'?payload.clientdata as {properties?:{definition?:{triggers?:Record<string,{type?:string;kind?:string}>};connectionReferences?:Record<string,unknown>}}:undefined;
  const t=Object.values(cd?.properties?.definition?.triggers??{})[0];
  const solutions=members.filter(m=>m.objectid===id&&m.componenttype===resourceKinds[kind].component).map(m=>text(m._solutionid_value)).sort();
  return {kind,id,logicalName:text(row.uniquename??row.connectionreferencelogicalname??row.schemaname??row._environmentvariabledefinitionid_value),displayName:text(row.name??row.connectionreferencedisplayname??row.displayname),managed:z.boolean().parse(row.ismanaged),owner:row._ownerid_value?z.guid().parse(row._ownerid_value):null,state:kind==='flow'?z.number().parse(row.statecode):null,member:solutions.includes(solutionId),solutions,hash:hashJson(payload as JsonInput),definitionHash:cd?hashJson(cd as JsonInput):null,etag:z.string().regex(/^W\/"[0-9]+"$/).parse(row['@odata.etag']),trigger:t?.kind??t?.type??null,connectionReferences:Object.keys(cd?.properties?.connectionReferences??{}),connectionId:kind==='connection'?text(row.connectionid)||null:null,connector:kind==='connection'?text(row.connectorid):null};
}
export async function discoverFlows(http:FlowHttp,project:Project):Promise<FlowSnapshot>{
  const name=project.solution.uniqueName;const solutions=await http.all(`solutions?$select=solutionid,uniquename,ismanaged,_publisherid_value&$filter=uniquename eq '${name}'`);
  if(solutions.length!==1||solutions[0]!.ismanaged!==false)fail('Flow target must be one existing approved unmanaged solution.');
  const solution=solutions[0]!;const solutionId=z.guid().parse(solution.solutionid);const publisherId=z.guid().parse(solution._publisherid_value);
  const publisher=(await http.request(`publishers(${publisherId})?$select=uniquename,customizationprefix`)).data as Record<string,unknown>;
  if(publisher.uniquename!==project.solution.publisher.uniqueName||publisher.customizationprefix!==project.solution.publisher.prefix)fail('Solution publisher does not match project.');
  const members=await http.all('solutioncomponents?$select=objectid,componenttype,_solutionid_value&$filter=componenttype eq 29 or componenttype eq 10035 or componenttype eq 380 or componenttype eq 381');
  const resources:ObservedResource[]=[];
  for(const kind of Object.keys(resourceKinds) as ResourceKind[]){const meta=resourceKinds[kind];const rows=await http.all(`${meta.set}?$select=${meta.select}${kind==='flow'?'&$filter=category eq 5 and type eq 1':''}`);
    for(const row of rows){try{resources.push(observeResource(kind,row,members,solutionId));}catch{fail(`Incomplete ${kind} discovery; malformed metadata cannot be treated as absence.`);}}
  }
  return {solutionId,solutionName:name,publisher:text(publisher.uniquename),resources:resources.sort((a,b)=>(a.kind+a.id).localeCompare(b.kind+b.id))};
}
