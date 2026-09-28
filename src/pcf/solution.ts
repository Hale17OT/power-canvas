import {hashJson} from '../core/json.js';
import type {ResourceIR,Issue} from '../solution/schema.js';
import {compileManifest} from './compile.js';
import {pcfIdentity,type PCFSource} from './schema.js';
import {evaluatePCFNeed} from '../canvas/taste/pcf.js';
import type {Project} from '../ir/schema.js';
import {conceptualType} from '../solution/resolve.js';

export function pcfSolutionResources(source:PCFSource,existing:ResourceIR[],project:Project){
 const resources:ResourceIR[]=[];const issues:Issue[]=[];
 const add=(id:string,kind:string,definition:unknown,dependencies:string[],physicalName:string|null=null)=>{const r:ResourceIR={id,kind,subsystem:'pcf',stage:kind==='pcf.component'?'APPLICATION':'BINDINGS',definition,definitionHash:hashJson(definition as never),dependencies,physicalName,requiredBy:[],ownership:'UNKNOWN',state:'BLOCKED',reason:'Offline PCF contract only; live import and binding executor deliberately unavailable.',capability:{status:'COMPILE_ONLY',schema:true,compile:true,deploy:false,runtime:false,production:false,limitations:['Local runtime does not prove Power Apps host behavior.','No live import is permitted in V1.']}};resources.push(r);return r;};
 for(const [key,c]of Object.entries(source.components)){
  const decision=evaluatePCFNeed(c);const r=add('pcf.component:'+key,'pcf.component',{component:c,manifest:compileManifest(c),taste:decision},['solution:solution'],pcfIdentity(c));
  if(c.implementationSource.kind==='external'){r.ownership='EXTERNAL';r.state='EXTERNAL';r.reason='EXTERNAL_SOURCE: inspect only; no rewrite or implicit adoption.';}
  if(decision.selected==='native'){r.capability.compile=false;issues.push({code:'PCF_NATIVE_SUFFICIENT',severity:'error',resource:r.id,message:decision.reason});}
  if(c.features.length)issues.push({code:'PCF_FEATURE_REVIEW',severity:'warning',resource:r.id,message:'Explicit feature usage requires separate target/capability review: '+c.features.map(f=>f.name).join(', ')});
 }
 for(const [key,b]of Object.entries(source.bindings)){
  const c=source.components[b.component];const dependencies=['pcf.component:'+b.component,b.consumer,...Object.values(b.properties).map(p=>p.resource),...(b.dataset?[b.dataset.resource]:[])];
  const r=add('pcf.binding:'+key,'pcf.binding',b,[...new Set(dependencies)]);
  const error=(message:string)=>{r.capability.compile=false;issues.push({code:'PCF_BINDING',severity:'error',resource:r.id,message});};
  if(!c){error('Missing component');continue;}
  if(!c.targets[b.target])error('Unsupported target');
  if(b.target==='canvas'&&(b.surface!=='composition'||!b.slot)||b.target==='modelDriven'&&(b.surface==='composition'||(b.surface==='field')!==(c.kind==='field')))error('Incompatible binding surface/kind');
  if(!existing.some(r=>r.id===b.consumer))error('Missing consumer');
  for(const [name,p]of Object.entries(c.properties))if(p.required&&!b.properties[name])error('Missing required property '+name);
  for(const [name,p]of Object.entries(b.properties)){if(c.properties[name]?.type!==p.type)error('Property type mismatch '+name);const target=existing.find(r=>r.id===p.resource);if(!target)error('Missing property source '+p.resource);const column=project.dataverse.tables[p.resource.replace(/^table:/,'')]?.columns[p.column];if(!column||conceptualType(column)!==p.type)error('Source column type mismatch '+name);if(c.properties[name]?.usage==='output')error('Output properties require an explicit event consumer, not a field input.');}
  if(c.kind==='dataset'&&!b.dataset)error('Dataset binding required');
  if(b.dataset)for(const [name,col]of Object.entries(Object.values(c.datasets)[0]?.columns??{}))if(col.required&&!b.dataset.columns[name])error('Missing semantic dataset column '+name);
  if(b.dataset)for(const [name,columnName]of Object.entries(b.dataset.columns)){const expected=Object.values(c.datasets)[0]?.columns[name];const actual=project.dataverse.tables[b.dataset.resource.replace(/^table:/,'')]?.columns[columnName];if(!expected||!actual||conceptualType(actual)!==expected.type)error('Dataset source type mismatch '+name);}
  if(b.target==='modelDriven'){
   const [,appKey,formKey]=b.consumer.split(/[:.]/);const form=project.apps[appKey!]?.forms[formKey!];
   if(!form)error('Model-driven form missing');
   if(b.surface==='field'&&Object.values(b.properties).some(p=>p.resource!=='table:'+form?.table||!form?.fields.includes(p.column)))error('Bound field must belong to the target form.');
   if(b.modelDrivenHost){
    const h=b.modelDrivenHost;if(h.component!==b.component||b.consumer!=='form:'+h.form||h.kind!==c.kind)error('Inconsistent model-driven host contract');
    if(h.kind==='dataset')for(const dependency of ['table:'+h.table,'view:'+h.view,'relationship:'+h.relationship]){r.dependencies.push(dependency);if(!existing.some(x=>x.id===dependency))error('Missing host dependency '+dependency);}
    r.reason='Offline Microsoft-oracle host lowering available after exact host resolution; live binding apply disabled.';
   }else if(b.surface==='subgrid'){r.capability.compile=false;error('Model-driven subgrid requires a verified modelDrivenHost contract and explicit host resolution; binding intent only.');}
  }
 }
 return {resources,issues};
}
