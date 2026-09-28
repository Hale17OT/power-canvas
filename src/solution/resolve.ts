import {canvasSharePointSources} from '../sharepoint/bindings.js';
import {sharepointSchema,spColumnSchema,type SPColumn} from '../sharepoint/schema.js';
import {projectSchema, type Project, type Column} from '../ir/schema.js';
import {validateSemantics} from '../ir/validate.js';
import {solutionSpecSchema, type SolutionSpec, type SharedType, type Issue} from './schema.js';
import {responsibility} from '../flows/registry.js';

export const dataverseTypeMap:Partial<Record<SharedType,Column['type']>>={string:'text',email:'text',multiline:'multilineText',integer:'integer',decimal:'decimal',currency:'currency',multiChoice:'multiChoice',percentage:'decimal',boolean:'boolean',choice:'choice',date:'dateTime',datetime:'dateTime'};
export function experienceDelivery(e:{delivery?:string|undefined;workload?:string|undefined}){return e.delivery==='modelDriven'||e.delivery==='auto'&&e.workload==='administration'?'modelDriven':'canvas';}
export function conceptualType(column:Column):SharedType{return ({text:'string',multilineText:'multiline',dateTime:column.type==='dateTime'&&column.behavior==='dateOnly'?'date':'datetime'} as Record<string,SharedType>)[column.type]??column.type as SharedType;}
export function resolveSolution(raw:unknown){
 const spec=solutionSpecSchema.parse(raw);const issues:Issue[]=[];
 const sharepoint=spec.sharepoint?sharepointSchema.parse(spec.sharepoint):undefined;
 const requirements=structuredClone(spec.requirements);const products:Record<string,import('../canvas/taste/memory.js').ProductContext>={};
 const bind=(resource:string,requiredBy:string[])=>{for(const id of requiredBy){const r=requirements.find(v=>v.id===id);if(!r)throw new Error('Unknown requirement: '+id);if(!r.resources.includes(resource))r.resources.push(resource);}};
 let project:Project;
 if(spec.mode==='explicit'){project=spec.project;Object.assign(products,spec.products);}
 else{
  const prefix=spec.identity.solution.publisher.prefix;const tables:Project['dataverse']['tables']={};const relationships:Project['dataverse']['relationships']={};const keys:NonNullable<Project['dataverse']['keys']>={};
  for(const [key,e]of Object.entries(spec.entities)){
   if(e.storage==='sharepoint'&&sharepoint&&e.site){
    if(!sharepoint.sites[e.site])throw Error('SharePoint intent requires a declared site alias');
    if(sharepoint.lists[key])throw Error('Duplicate explicit/intent SharePoint list '+key);
    sharepoint.lists[key]={site:e.site,displayName:e.plural,template:'genericList',title:{mode:'used'}};bind('sharepoint.list:'+key,e.requiredBy);
    for(const [name,f]of Object.entries(e.fields)){
     if(name.toLowerCase()==='title'){if(f.type!=='string')throw Error('Platform Title requires string');continue;}
     const type=({string:'text',integer:'number',decimal:'number',email:'text'} as Record<string,string>)[f.type]??f.type;
     const value={parent:'sharepoint.list:'+key,internalName:name,displayName:f.label,required:f.required,type,...(f.choices?{choices:f.choices}:{}),...(type==='lookup'?{source:{list:'sharepoint.list:'+f.target,column:'Title'}}:{})};
     const parsed=spColumnSchema.safeParse(value);
     if(!parsed.success){issues.push({code:'SHAREPOINT_INTENT_FIELD',severity:'error',resource:'sharepoint.list:'+key,message:'Explicit column configuration required for '+name});continue;}
     sharepoint.columns[key+'_'+name]=parsed.data as SPColumn;
    }
    continue;
   }
   bind('table:'+key,e.requiredBy);
   if(e.storage==='sharepoint'){issues.push({code:'EXTERNAL_PROVISIONING',severity:'error',resource:'table:'+key,message:'SharePoint list provisioning is external; supply explicit identity and metadata.'});continue;}
   const columns:Record<string,Column>={};
   for(const [f,field]of Object.entries(e.fields)){
    const base={schemaName:prefix+'_'+key+'_'+f,displayName:field.label,required:field.required?'application':'none',lifecycle:{deletionPolicy:'retain'}};
    const type=dataverseTypeMap[field.type];
    if(field.type==='lookup'){
     if(!field.target||!spec.entities[field.target])throw new Error('Lookup target must be a declared entity: '+key+'.'+f);
     relationships[key+f]={schemaName:prefix+'_'+key+'_'+f,fromTable:key,toTable:field.target,lookup:{key:f,schemaName:prefix+'_'+key+'_'+f,displayName:field.label,required:field.required?'application':'none'},cascade:{delete:'restrict',assign:'none',share:'none',unshare:'none',reparent:'none',merge:'none'},lifecycle:{deletionPolicy:'retain'}};
     bind('relationship:'+key+f,e.requiredBy);continue;
    }
    if(!type){issues.push({code:'UNSUPPORTED_TYPE',severity:'error',resource:'table:'+key,message:`${key}.${f}: ${field.type} has no current Dataverse provisioning adapter; retained as an unmet requirement.`});continue;}
    const props=type==='text'?{maxLength:200}:type==='multilineText'?{maxLength:10000}:type==='integer'?{min:0,max:2147483647}:(type==='decimal'||type==='currency')?{min:0,max:field.type==='percentage'?100:1000000000,precision:2}:type==='boolean'?{default:false,trueLabel:'Yes',falseLabel:'No'}:type==='dateTime'?{behavior:field.type==='date'?'dateOnly':'userLocal'}:{choices:(field.choices??[]).map((label,i)=>({label,value:spec.identity.solution.publisher.optionValuePrefix*10000+i}))};
    columns[f]={...base,type,...props,...(type==='currency'?{min:0,max:1000000000,precision:2}:{}),...(field.globalChoice?{globalChoice:field.globalChoice,choices:[]}:{} )} as Column;
   }
   const primary=Object.entries(columns).find(([,c])=>c.type==='text')?.[0];
   if(!primary)throw new Error('An explicit string primary name is required: '+key);
   for(const [index,columns]of e.keys.entries()){const name=key+'Key'+index;keys[name]={schemaName:prefix+'_'+name,table:key,columns,reason:e.rationale,lifecycle:{deletionPolicy:'retain'}};bind('key:'+name,e.requiredBy);}
   tables[key]={schemaName:prefix+'_'+key,displayName:e.label,pluralName:e.plural,ownership:e.ownership,primaryName:primary,auditing:e.auditing,columns,lifecycle:{deletionPolicy:'retain'}};
  }
  for(const [key,r]of Object.entries(relationships))if(!tables[r.fromTable]||!tables[r.toTable]){issues.push({code:'EXTERNAL_RELATIONSHIP',severity:'error',resource:'relationship:'+key,message:'A Dataverse lookup cannot provision an external SharePoint target; retain an explicit integration requirement.'});delete relationships[key];}
  const apps:NonNullable<Project['canvasApps']>={};
  const modelApps:Project['apps']={};
  for(const [key,e]of Object.entries(spec.experiences)){
   if(experienceDelivery(e)==='modelDriven'){
    bind('app:'+key,e.requiredBy);
    if(!e.jobBoundary)issues.push({code:'APP_BOUNDARY_REQUIRED',severity:'error',resource:'app:'+key,message:'Model-driven experience requires an explicit audience/job boundary.'});
    modelApps[key]=e.model??{type:'modelDriven',uniqueName:prefix+'_'+key,displayName:e.product.name,tables:[e.source],forms:{main:{displayName:e.product.name+' Main',table:e.source,fields:e.fields,lifecycle:{deletionPolicy:'retain'}}},views:{active:{displayName:e.product.name+' Active',table:e.source,columns:e.fields,activeOnly:true,orderBy:[],lifecycle:{deletionPolicy:'retain'}}},navigation:[{area:'Operations',group:'Records',table:e.source}],publishPolicy:'manual',lifecycle:{deletionPolicy:'retain'}};
    continue;
   }
   bind('canvas:'+key,e.requiredBy);products[key]=e.product;
   apps[key]={type:'canvas',uniqueName:prefix+'_'+key,displayName:e.product.name,componentPolicy:'experimental',theme:{mode:'light',density:'comfortable',brand:{primary:'#145C4F'},font:'Segoe UI',radius:'soft'},shell:{pattern:'sidebar',navigation:[{screen:'workspace',label:e.product.name}]},screens:{workspace:{pattern:'masterDetail',title:e.product.name,source:e.source,columns:e.fields.slice(0,6),pageSize:25,detail:{fields:e.fields,revealFields:[]}}}};
   if(sharepoint&&spec.entities[e.source]?.storage==='sharepoint'&&spec.entities[e.source]?.site){sharepoint.bindings.canvas.push({app:key,alias:e.source,resource:'sharepoint.list:'+e.source});}
   if(e.host){apps[key]!.screens={};apps[key]!.nativeDesign={product:e.product,host:e.host,stability:spec.profile};}
   if(e.jobBoundary)apps[key]!.application={requiresNewApplication:true,requirement:{kind:'explicit-application',statement:e.jobBoundary}};
  }
  for(const [key,ids]of Object.entries(spec.automationRequirements))bind('flow:'+key,ids);
  for(const process of spec.processes){
   const advice=responsibility(process.job);
   if(advice.provider==='PowerFx'){
    if(process.implementation)issues.push({code:'UNNECESSARY_FLOW',severity:'error',message:process.id+': synchronous UI validation/single-record saves must not create a second flow write path.'});
    for(const key of Object.keys(apps))bind('canvas:'+key,process.requiredBy);
   }else if(!process.implementation||!spec.automation.workflowRecipes?.[process.implementation])issues.push({code:'RECIPE_CONFIGURATION_REQUIRED',severity:'error',message:process.id+': '+(advice.recipe??'external integration')+' requires explicit typed recipe configuration, destinations and recipients.'});
   else {const recipe=spec.automation.workflowRecipes[process.implementation]!;if(advice.recipe&&!recipe.steps.some(s=>s.recipe===advice.recipe))issues.push({code:'RECIPE_RESPONSIBILITY_MISMATCH',severity:'error',message:process.id+': expected '+advice.recipe+' recipe.'});bind('flow:'+process.implementation,process.requiredBy);}
  }
  project=projectSchema.parse({...spec.identity,dataverse:{tables,relationships,...(spec.choices?{choices:spec.choices}:{}),...(Object.keys(keys).length?{keys}:{})},apps:modelApps,canvasApps:apps,resources:spec.automation,...(spec.securityModel?{security:spec.securityModel}:{})});
 }
 const seen=new Set<string>();for(const r of requirements){if(seen.has(r.id))throw new Error('Duplicate requirement ID: '+r.id);seen.add(r.id);}
 for(const d of validateSemantics(project,sharepoint?canvasSharePointSources(sharepoint):{},!sharepoint).filter(d=>!(sharepoint&&Object.keys(sharepoint.sites).length&&d.path==='dataverse.tables'&&d.message==='Declare at least one table or flow.')))issues.push({code:d.code,severity:'error',message:d.message});
 return {spec,project,requirements,products,issues,sharepoint};
}
export function storageDecision(spec:SolutionSpec){return spec.mode==='intent'?Object.entries(spec.entities).map(([entity,v])=>({entity,selected:v.storage,reason:v.rationale,provisioning:v.storage==='dataverse'?'existing Dataverse adapter':v.site&&spec.sharepoint?.sites[v.site]?'SharePoint provider; external deployment resource':'EXTERNAL',criteria:['relationships','record ownership/security','auditing','scale/delegation','business rules','document orientation','licensing','integration'],ownership:v.ownership,auditing:v.auditing})):[];}
