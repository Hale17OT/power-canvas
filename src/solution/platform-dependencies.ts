import {z} from 'zod';
import type {DataverseHttp} from '../dataverse/http.js';
import type {SolutionIR} from './compile.js';
import {nameSchema} from '../ir/schema.js';
import {targetSchema} from '../state/models.js';
import {digest} from './compile.js';

export const componentTypes:Readonly<Record<string,number>>={table:1,column:2,choice:9,relationship:10,key:14,role:20,view:26,flow:29,form:60,webResource:61,sitemap:62,app:80,canvas:300,environmentVariable:380,connection:10039};
const dependency=z.object({dependentcomponentobjectid:z.guid(),dependentcomponenttype:z.number().int(),requiredcomponentobjectid:z.guid(),requiredcomponenttype:z.number().int()});
/** Only documented GET functions, scoped by exact discovered component IDs. No write/auth management API. */
export async function discoverPlatformDependencies(ir:SolutionIR,http:Pick<DataverseHttp,'all'>,rawTarget:unknown,now=new Date()){
 const target=targetSchema.parse(rawTarget);if(digest(target)!==ir.environmentHash)throw Error('Dependency target differs from saved solution evidence');
 const components=ir.resources.filter(r=>r.existingId&&componentTypes[r.kind]);
 const identity=(type:number,id:string)=>components.find(r=>componentTypes[r.kind]===type&&r.existingId?.toLowerCase()===id.toLowerCase())?.id??`platform:${type}:${id.toLowerCase()}`;
 const edges:{from:string;to:string}[]=[];
 const add=(raw:unknown)=>{const d=dependency.parse(raw);const edge={from:identity(d.dependentcomponenttype,d.dependentcomponentobjectid),to:identity(d.requiredcomponenttype,d.requiredcomponentobjectid)};if(!edges.some(e=>e.from===edge.from&&e.to===edge.to))edges.push(edge);return edge;};
 for(const r of components){const id=z.guid().parse(r.existingId);for(const row of await http.all(`RetrieveRequiredComponents(ObjectId=${id},ComponentType=${componentTypes[r.kind]})`))add(row);}
 const missing=(await http.all(`RetrieveMissingDependencies(SolutionUniqueName='${nameSchema.parse(ir.solution.uniqueName)}')`)).map(row=>add(row).to);
 return {solution:ir.solution.uniqueName,target,targetEnvironment:target.dataverseUrl,observedAt:now.toISOString(),method:'RetrieveRequiredComponents' as const,edges:edges.sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to)),missing:[...new Set(missing)].sort(),coverage:{queried:components.map(r=>r.id),unresolved:ir.resources.filter(r=>componentTypes[r.kind]&&!r.existingId).map(r=>r.id),methods:['RetrieveRequiredComponents','RetrieveMissingDependencies']},remoteMutations:0};
}
