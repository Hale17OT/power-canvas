import { validateTemplateContract } from './documents.js';
import type {Project} from '../ir/schema.js';
import type {DataSource, FlowAction, FlowDeployment, ValueShape} from './schema.js';
import type {FlowHttp} from './remote.js';
import {compileFlows} from './compile.js';
import {compatible, fail} from './expressions.js';
import {flattenActions} from './safety.js';
import {validateFileName,validateFilePath} from './providers.js';
import {hashJson} from '../core/json.js';
const dvTypes:Record<string,ValueShape['type']>={String:'string',Memo:'string',Uniqueidentifier:'guid',Integer:'integer',BigInt:'integer',Picklist:'integer',State:'integer',Status:'integer',Boolean:'boolean',Decimal:'number',Double:'number',Money:'number',DateTime:'datetime',Lookup:'recordRef',Customer:'recordRef',Owner:'recordRef'};
export async function discoverDataverseSource(http:FlowHttp,table:string):Promise<DataSource>{
 if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(table))fail('Invalid entity set name.');
 const entities=await http.all(`EntityDefinitions?$select=MetadataId,LogicalName,EntitySetName,PrimaryIdAttribute&$filter=EntitySetName eq '${table}'`);
 if(entities.length!==1||typeof entities[0]!.MetadataId!=='string'||!/^[a-f0-9-]{36}$/i.test(entities[0]!.MetadataId))fail('Dataverse target must resolve to one verified entity set.');
 const entity=entities[0]!,base=`EntityDefinitions(${entity.MetadataId})/Attributes`;
 const attrs=await http.all(`${base}?$select=LogicalName,AttributeType,IsValidForRead,IsValidForCreate,IsValidForUpdate,RequiredLevel`);
 const dateColumns=attrs.some(c=>c.AttributeType==='DateTime')?await http.all(`${base}/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?$select=LogicalName,Format`):[];
 const columns:DataSource['columns']={};
 for(const col of attrs){const type=dvTypes[String(col.AttributeType)];if(!type){if(col.IsValidForCreate&&(col.RequiredLevel as {Value?:string}|undefined)?.Value==='ApplicationRequired')fail('Required Dataverse field uses an unsupported type.');continue;}const key=String(col.LogicalName);let choices:(string|number)[]|undefined;
  if(['Picklist','State','Status'].includes(String(col.AttributeType))){
   const rows=await http.all(`${base}/Microsoft.Dynamics.CRM.${col.AttributeType}AttributeMetadata?$select=LogicalName&$expand=OptionSet($select=Options)&$filter=LogicalName eq '${key}'`);
   const options=(rows[0]?.OptionSet as {Options?:{Value:number}[]}|undefined)?.Options;if(!options)fail('Choice metadata is incomplete.');choices=options.map(o=>o.Value);
  }
  const required=(col.RequiredLevel as {Value?:string}|undefined)?.Value;
  columns[key]={shape:{type:type==='datetime'&&dateColumns.find(c=>c.LogicalName===key)?.Format==='DateOnly'?'date':type},required:['ApplicationRequired','SystemRequired'].includes(required??'')&&key!==entity.PrimaryIdAttribute,readable:col.IsValidForRead===true,create:col.IsValidForCreate===true,update:col.IsValidForUpdate===true,...(choices?{choices}:{})};
 }
 return {connector:'shared_commondataserviceforapps',table,kind:'table',...(entity.LogicalName?{logicalName:String(entity.LogicalName)}:{}),columns};
}
export interface SharePointMetadataReader {read(site:string,path:string):Promise<unknown>}
export interface WordMetadataReader {template(source:string,drive:string,file:string):Promise<Buffer>;file(source:string,drive:string,file:string):Promise<void>}
export interface MetadataServices {sharepoint?:SharePointMetadataReader;word?:WordMetadataReader}
export function validateSharePointSite(site:string){let url:URL;try{url=new URL(site);}catch{fail('Invalid SharePoint site URL.');}if(url!.protocol!=='https:'||!url!.hostname.endsWith('.sharepoint.com')||url!.username||url!.password||url!.search||url!.hash||url!.port)fail('SharePoint site must be an approved HTTPS SharePoint Online site.');return url!;}
export async function discoverSharePointSource(reader:SharePointMetadataReader,site:string,listId:string):Promise<DataSource>{
 validateSharePointSite(site);if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(listId))fail('SharePoint list/library requires an immutable GUID, not a display name.');
 const base=`web/lists(guid'${listId}')`;
 const list=await reader.read(site,base+'?$select=Id,BaseType,EntityTypeName') as {Id:string;BaseType:number;EntityTypeName:string};
 if(list.Id?.toLowerCase()!==listId.toLowerCase()||![0,1].includes(list.BaseType))fail('SharePoint list/library identity mismatch.');
 const response=await reader.read(site,base+'/Fields?$select=InternalName,TypeAsString,Required,ReadOnlyField,Hidden') as {value:Record<string,unknown>[]};
 if(!Array.isArray(response.value))fail('Incomplete SharePoint field discovery.');
 const types:Record<string,ValueShape['type']>={Text:'string',Note:'string',Choice:'string',Number:'number',Currency:'number',Integer:'integer',Counter:'integer',Boolean:'boolean',DateTime:'datetime',Guid:'guid'};
 const columns:DataSource['columns']={};
 for(const col of response.value){const type=types[String(col.TypeAsString)];if(!type){if(col.Required&&!col.ReadOnlyField&&!col.Hidden)fail('Required SharePoint person/lookup/multichoice or other complex field is unsupported.');continue;}
  let choices:unknown=col.Choices;
  if(col.TypeAsString==='Choice'&&!Array.isArray(choices)){const choice=await reader.read(site,base+"/Fields/getbyinternalnameortitle('"+String(col.InternalName).replaceAll("'","''")+"')?$select=Choices") as {Choices?:unknown};choices=choice.Choices;if(!Array.isArray(choices))fail('SharePoint choice metadata is incomplete.');}
  columns[String(col.InternalName)]={shape:{type},required:col.Required===true,readable:true,create:!col.ReadOnlyField&&!col.Hidden,update:!col.ReadOnlyField&&!col.Hidden,...(Array.isArray(choices)?{choices:choices as string[]}: {})};
 }
 return {connector:'shared_sharepointonline',table:String(list.EntityTypeName),kind:list.BaseType===1?'library':'list',columns};
}
function sameContract(declared:DataSource,live:DataSource){
 if(declared.connector!==live.connector||declared.table!==live.table||declared.kind!==live.kind||declared.logicalName!==live.logicalName)fail('Target metadata identity differs from the declared contract.');
 for(const [key,col]of Object.entries(declared.columns)){const actual=live.columns[key];if(!actual||hashJson(col)!==hashJson(actual))fail(`Column ${key} metadata changed; rediscover and review the source contract.`);}
 for(const [key,col]of Object.entries(live.columns))if(col.required&&col.create&&!declared.columns[key])fail(`Required live column ${key} missing from metadata contract.`);
}
/** Resolve configuration only; dynamic user expressions cannot choose a deployment metadata target. */
export function configuredValue(e:NonNullable<FlowAction['value']>,project:Project,deployment?:FlowDeployment):unknown {
 if(e.op==='literal')return e.value;
 if(e.op==='environment'&&!e.path?.length){const spec=project.resources?.environmentVariables[e.name!];return deployment?.environmentValues[e.name!]??spec?.default;}
 fail('Metadata target must be an environment variable or intentional constant.');
}
export async function validateFlowMetadata(project:Project,http:FlowHttp,deployment?:FlowDeployment,services:MetadataServices={}){
 const {resources}=compileFlows(project),actions=Object.values(resources.flows).flatMap(f=>flattenActions(f.actions));
 for(const l of Object.values(resources.workflowLedgers??{})){
  const entities=await http.all(`EntityDefinitions?$select=EntitySetName,PrimaryIdAttribute,TableType,IsVirtualEntity&$filter=EntitySetName eq '${l.table}'`);
  if(entities.length!==1||entities[0]!.PrimaryIdAttribute!==l.keyColumn||entities[0]!.TableType!=='Standard'||entities[0]!.IsVirtualEntity!==false)fail('Ledger requires the verified primary key of an existing standard, non-virtual Dataverse table.');
 }
 for(const a of actions.filter(a=>a.use.startsWith('word.'))){
  if(!services.word)fail('BLOCKED: authenticated Word template metadata/content access is unavailable.');
  const t=a.template?resources.documentTemplates![a.template]!:undefined;
  const source=configuredValue(t?.source??a.source!,project,deployment),drive=configuredValue(t?.drive??a.drive!,project,deployment),file=t?configuredValue(t.file,project,deployment):a.file?.op==='output'?undefined:configuredValue(a.file!,project,deployment);
  if(typeof source!=='string'||typeof drive!=='string')fail('Word location/library configuration is unresolved.');
  if(t){if(typeof file!=='string')fail('Word template file identity is unresolved.');validateTemplateContract(t,await services.word.template(source,drive,file));}
  else {if(typeof file!=='string')fail('BLOCKED: Word PDF file locator cannot yet be validated for a newly generated SharePoint file; runtime locator proof is required.');await services.word.file(source,drive,file);}
 }
 const reads=actions.filter(a=>a.use.startsWith('dataverse.'));
 const triggers=Object.values(resources.flows).flatMap(f=>f.trigger.type==='dataverse'?[f.trigger]:[]);
 for(const table of new Set([...reads.map(a=>a.table!),...triggers.map(t=>t.table)])){
  const live=await discoverDataverseSource(http,table);
  for(const a of reads.filter(a=>a.table===table)){
   if(a.metadata)sameContract(resources.flowDataSources![a.metadata]!,live);
   else for(const key of a.select!){const col=live.columns[key],shape=a.shape!.fields![key]!;if(!col?.readable||!compatible(col.shape,shape))fail(`Dataverse selected column ${key} is unreadable, unsupported or has a different live type.`);}
  }
  for(const t of triggers.filter(t=>t.table===table))sameContract(resources.flowDataSources![t.metadata]!,live);
 }
 const cache=new Map<string,DataSource>();
 for(const a of actions.filter(a=>a.use.startsWith('sharepoint.'))){
  if(!services.sharepoint)fail('BLOCKED: authenticated SharePoint metadata access is unavailable. Authorize the intended account; no credential fallback.');
  const site=configuredValue(a.site!,project,deployment);if(typeof site!=='string')fail('BLOCKED: SharePoint site configuration is unresolved.');validateSharePointSite(site);
  if(a.list){const list=configuredValue(a.list,project,deployment);if(typeof list!=='string')fail('BLOCKED: SharePoint list configuration is unresolved.');const key=site+'|'+list;
   if(!cache.has(key))cache.set(key,await discoverSharePointSource(services.sharepoint,site,list));sameContract(resources.flowDataSources![a.metadata!]!,cache.get(key)!);
  }else {const web=await services.sharepoint.read(site,'web?$select=Id') as {Id?:string};if(!web.Id)fail('SharePoint site discovery incomplete.');}
  if(a.use==='sharepoint.createFile'){
   const folder=configuredValue(a.folder!,project,deployment),name=configuredValue(a.fileName!,project,deployment);
   if(typeof folder!=='string'||typeof name!=='string')fail('File configuration unresolved.');validateFilePath(folder);validateFileName(name);
   const serverPath=validateSharePointSite(site).pathname.replace(/\/$/,'')+folder;
   const folderMeta=await services.sharepoint.read(site,`web/GetFolderByServerRelativeUrl('${serverPath.replaceAll("'","''")}')?$select=Exists`) as {Exists?:boolean};if(folderMeta.Exists!==true)fail('Configured SharePoint folder does not exist.');
  }
 }
 return {checkedActions:reads.length+actions.filter(a=>a.use.startsWith('sharepoint.')).length+triggers.length,remoteWrites:0};
}
