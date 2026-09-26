import { requirePublishedApp } from '../model-driven/lifecycle.js';
import { PowerCanvasError } from '../core/errors.js';
import { reattestPrivileges, plannedPrivileges, normalizeRolePrivilegeIds } from '../model-driven/table-privileges.js';
import {canonicalGlobalChoiceName} from '../dataverse/global-choice.js';
import {z} from 'zod';
import {digest} from '../solution/compile.js';
import {certificationExecutionManifest,type CertificationExecutionInput} from './certification.js';
import type {Observation,Ownership,PlannedOperation} from '../state/models.js';
import {certificationResources} from '../planner/certification.js';
import {metadataPath} from '../dataverse/discovery.js';
import {ApiError,DataverseHttp} from '../dataverse/http.js';
import {guidValue,rawObject,textValue,label,normalizeTable,normalizeColumn} from '../dataverse/normalize.js';
import {columnPayload} from '../dataverse/payloads.js';
import {quote} from '../model-driven/discovery.js';
import {publisherLocalName} from '../model-driven/names.js';
import {SCHEMA_PRIVILEGES,MODEL_PRIVILEGES} from '../dataverse/preflight.js';
import {transportHealth} from '../dataverse/transport.js';
import {PLATFORM_ROLE_DEFAULTS} from '../model-driven/privileges.js';
import {readAppRoleIds} from '../model-driven/access.js';
import {CredentialError} from '../auth/credential-audit.js';

/** Closed registry. Other operation classes retain full observation revalidation. */
export const preWriteContracts={
 table:{action:'createTable',strategy:'EXACT_METADATA_FILTER',states:['metadata']},
 column:{action:'createColumn',strategy:'EXACT_PARENT_ATTRIBUTE',states:['metadata']},
 choice:{action:'createChoice',strategy:'EXACT_NAME_KEY',states:['metadata']},
 relationship:{action:'createRelationship',strategy:'EXACT_SCHEMA_FILTER_AND_LOOKUP',states:['metadata']},
 key:{action:'createKey',strategy:'EXACT_PARENT_KEY',states:['metadata']},
 form:{action:'createForm',strategy:'EXACT_NAME_AND_TABLE',states:['published','unpublished']},
 view:{action:'createView',strategy:'EXACT_NAME_AND_TABLE',states:['published','unpublished']},
 sitemap:{action:'createSitemap',strategy:'EXACT_SERVICE_UNIQUE_NAMES',states:['published','unpublished']},
 app:{action:'createApp',strategy:'EXACT_SERVICE_UNIQUE_NAMES',states:['published','unpublished']},
 role:{action:'createRole',strategy:'EXACT_NAME_ROOT_BUSINESS_UNIT',states:['existing']},
 rolePermissions:{action:'grantRolePrivileges',strategy:'VERIFIED_ROLE_TABLE_PRIVILEGE_IDS_BASIC',states:['existing']},
 appComponents:{action:'addAppComponents',strategy:'VERIFIED_APP_COMPONENT_IDS',states:['existing']},
 appAccess:{action:'setAppAccess',strategy:'VERIFIED_APP_ROLE_ASSOCIATION',states:['published']},
} as const;
type Kind=keyof typeof preWriteContracts;
export type AttestationClassification='APP_ACCESS_REQUIRES_PUBLICATION'|'PASS'|'TARGET_CHANGED'|'DEPENDENCY_CHANGED'|'OWNERSHIP_CHANGED'|'COLLISION'|'READ_INCOMPLETE'|'AUTH_FAILURE'|'PLAN_CHANGED'|'UNSUPPORTED_TARGETED_QUERY';
export interface ExactRead {id:string;resource:string;purpose:string;state:string;path:string;mode:'collection'|'entity';absent404?:boolean;parent?:string;comparison?:'GLOBAL_CHOICE'|'OWNED_TABLE'|'OWNED_COLUMN'|'OWNED_PRIMARY'|'OWNED_KEY'|'OWNED_RELATIONSHIP'|'MEMBERSHIP';membership?:{id:string;type:number;parentId?:string};expected?:Record<string,unknown>}
export interface OperationCheck {operationId:string;resourceId:string;kind:string;action:string;expected:'ABSENT'|'DEPENDENCY_LOCAL';dependsOn:string[];reads:ExactRead[];deferredUntilExecutable:boolean}
export interface PreWriteReadSet {version:1;strategy:'SCOPE_BOUND_ATTESTATION';planHash:string;manifestHash:string;dependencies:ExactRead[];operations:OperationCheck[];target:string[];prerequisites:{purpose:string;pathTemplate:string;requiredFact:string}[];executableDependencyContracts:string[];ownershipHash:string;publication:never[];contentHash:string}
export interface CheckEvidence {id:string;resource:string;purpose:string;state:string;path:string;status:'VERIFIED'|'COLLISION'|'DRIFT'|'INCOMPLETE'|'NOT_RUN';records:number|null;basis?:string;requestIds:string[];attempts:number;retries:number;elapsedMs:number;expectedNotFound?:boolean;observedPlatformProperties?:Record<string,unknown>}
export interface PreWriteAttestation {version:1;planHash:string;manifestHash:string;readSetHash:string;operationId:string|null;target:unknown;dependencies:CheckEvidence[];operations:{operationId:string;status:string}[];collisions:CheckEvidence[];ownership:{hash:string;revision:number;verified:boolean};publication:{scope:never[];verified:boolean};authStatus:string;startedAt:string;expiresAt:string;finishedAt:string;result:'PASS'|'DRIFT'|'COLLISION'|'INCOMPLETE'|'BLOCKED';classification:AttestationClassification;detail:string;getSummary:ReturnType<typeof transportHealth>;expectedAbsenceResponses:number;contentHash:string}
class AttestationFailure extends Error {constructor(readonly classification:AttestationClassification,message:string){super(message);}}
const fail=(c:AttestationClassification,m:string):never=>{throw new AttestationFailure(c,m);};
const collection=(set:string,select:string,filter:string)=>`${set}?$select=${select}&$filter=${filter}`;
const tableFilter=(name:string)=>`LogicalName eq ${quote(name.toLowerCase())} or SchemaName eq ${quote(name)}`;

export function preWriteStrategy(input:CertificationExecutionInput):'SCOPE_BOUND_ATTESTATION'|'FULL_OBSERVATION_REVALIDATION'{
 try{certificationExecutionManifest(input);const resources=certificationResources(input.project);return input.plan.operations.every(op=>{const r=resources.find(r=>r.resourceId===op.resourceId),c=r&&preWriteContracts[r.kind as Kind];return c&&c.action===op.action&&op.before===null&&op.classification==='create';})?'SCOPE_BOUND_ATTESTATION':'FULL_OBSERVATION_REVALIDATION';}catch{return 'FULL_OBSERVATION_REVALIDATION';}
}
/** No resource names or queries supplied by the caller: derive from the native plan. */
export function derivePreWriteReadSet(input:CertificationExecutionInput):PreWriteReadSet{
 const manifest=certificationExecutionManifest(input);
 if(preWriteStrategy(input)!=='SCOPE_BOUND_ATTESTATION')fail('PLAN_CHANGED','REQUIRES_FULL_REVALIDATION');
 const resources=certificationResources(input.project);
 const dependencies:ExactRead[]=manifest.requiredDependencies.map(d=>{
  const r=input.observation.resources.find(r=>r.resourceId===d.resourceId)!;
  return r.kind==='solution'?{id:d.resourceId,resource:d.resourceId,purpose:'REQUIRED_DEPENDENCY',state:'existing',mode:'collection',path:collection('solutions','solutionid,uniquename,friendlyname,ismanaged,_publisherid_value,version',`solutionid eq ${guidValue(d.remoteId)} or uniquename eq ${quote(r.schemaName)}`),expected:{solutionid:d.remoteId,uniquename:r.schemaName,friendlyname:r.properties.displayName,ismanaged:false,_publisherid_value:manifest.publisherId,version:r.properties.version}}:
   {id:d.resourceId,resource:d.resourceId,purpose:'REQUIRED_DEPENDENCY',state:'existing',mode:'collection',path:collection('publishers','publisherid,uniquename,customizationprefix,customizationoptionvalueprefix',`publisherid eq ${guidValue(d.remoteId)} or uniquename eq ${quote(r.schemaName)} or customizationprefix eq 'pfx'`),expected:{publisherid:d.remoteId,uniquename:r.schemaName,customizationprefix:'pfx',customizationoptionvalueprefix:r.properties.optionValuePrefix}};
 });
 for(const prerequisite of manifest.ownedPrerequisites??[]){
  const properties=input.ownership.resources.find(r=>r.resourceId===prerequisite.resourceId)!.baseline;
  const {solutionMember:_member,...expected}=properties;void _member;
  if('kind'in prerequisite){
   const live=input.observation.resources.find(r=>r.resourceId===prerequisite.resourceId)!;
   const add=(suffix:string,path:string,comparison:NonNullable<ExactRead['comparison']>,expected:Record<string,unknown>)=>dependencies.push({id:prerequisite.resourceId+suffix,resource:prerequisite.resourceId,purpose:'OWNED_EXPECTED_STATE',state:'existing',mode:'entity',path,comparison,expected});
   const membership=(suffix:string,id:string,type:number,parentId?:string)=>dependencies.push({id:prerequisite.resourceId+suffix,resource:prerequisite.resourceId,purpose:'OWNED_EXPECTED_STATE',state:'existing',mode:'collection',comparison:'MEMBERSHIP',membership:{id,type,...(parentId?{parentId}:{})},path:collection('solutioncomponents','objectid,componenttype,rootcomponentbehavior',`_solutionid_value eq ${guidValue(manifest.solutionId)} and ((objectid eq ${guidValue(id)} and componenttype eq ${type})${parentId?` or (objectid eq ${guidValue(parentId)} and componenttype eq 1 and rootcomponentbehavior eq 0)`:''})`),expected:{included:true}});
   if(prerequisite.kind==='table'){
    const primary=rawObject(properties.primaryColumn),primaryId=guidValue(live.properties.primaryMetadataId);
    add(':primary',`EntityDefinitions(${guidValue(prerequisite.remoteId)})/Attributes(${primaryId})/Microsoft.Dynamics.CRM.StringAttributeMetadata`,'OWNED_PRIMARY',{MetadataId:primaryId,...primary,LogicalName:textValue(primary.schemaName).toLowerCase(),IsPrimaryName:true,isManaged:false,customizable:true});
    add(':owned',`EntityDefinitions(${guidValue(prerequisite.remoteId)})`,'OWNED_TABLE',{MetadataId:prerequisite.remoteId,...expected,LogicalName:prerequisite.schemaName.toLowerCase(),EntitySetName:textValue(live.properties.entitySetName),PrimaryNameAttribute:textValue(primary.schemaName).toLowerCase(),isManaged:false,customizable:true});
    membership(':membership',prerequisite.remoteId,1);membership(':primary-membership',primaryId,2,prerequisite.remoteId);
   }else if(prerequisite.kind==='role'){
    dependencies.push({id:prerequisite.resourceId+':owned',resource:prerequisite.resourceId,purpose:'OWNED_EXPECTED_STATE',state:'existing',mode:'entity',path:`roles(${guidValue(prerequisite.remoteId)})?$select=roleid,name,_businessunitid_value,ismanaged`,expected:{roleid:prerequisite.remoteId,name:properties.displayName,_businessunitid_value:prerequisite.businessUnitId,ismanaged:false}});
    membership(':membership',prerequisite.remoteId,20);
   }else if(prerequisite.kind==='relationship'){
    const from=input.observation.resources.find(r=>r.kind==='table'&&r.schemaName===properties.fromTableSchemaName)!,lookup=rawObject(properties.lookup);
    dependencies.push({id:prerequisite.resourceId+':owned',resource:prerequisite.resourceId,purpose:'OWNED_EXPECTED_STATE',state:'existing',mode:'entity',path:`RelationshipDefinitions(${guidValue(prerequisite.remoteId)})/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata`,comparison:'OWNED_RELATIONSHIP',expected:{MetadataId:prerequisite.remoteId,SchemaName:prerequisite.schemaName,ReferencedEntity:textValue(properties.toTableSchemaName).toLowerCase(),ReferencingEntity:from.schemaName.toLowerCase(),ReferencingAttribute:textValue(lookup.schemaName).toLowerCase(),CascadeConfiguration:{Delete:'Restrict',Assign:'NoCascade',Share:'NoCascade',Unshare:'NoCascade',Reparent:'NoCascade',Merge:'NoCascade'},IsManaged:false}});
    dependencies.push({id:prerequisite.resourceId+':lookup',resource:prerequisite.resourceId,purpose:'OWNED_EXPECTED_STATE',state:'existing',mode:'entity',path:`EntityDefinitions(${guidValue(from.remoteId)})/Attributes(${guidValue(prerequisite.lookupMetadataId)})?$select=MetadataId,SchemaName,LogicalName`,expected:{MetadataId:prerequisite.lookupMetadataId,SchemaName:lookup.schemaName,LogicalName:textValue(lookup.schemaName).toLowerCase()}});
    membership(':membership',prerequisite.remoteId,10,from.remoteId);membership(':lookup-membership',prerequisite.lookupMetadataId!,2,from.remoteId);
   }else if(prerequisite.kind==='key'){
    const table=input.observation.resources.find(r=>r.kind==='table'&&r.schemaName===properties.tableSchemaName)!;
    const {tableSchemaName:_table,...key}=expected;void _table;
    add(':owned',`EntityDefinitions(${guidValue(table.remoteId)})/Keys(${guidValue(prerequisite.remoteId)})`,'OWNED_KEY',{MetadataId:prerequisite.remoteId,...key,isManaged:false});
    membership(':membership',prerequisite.remoteId,14,table.remoteId);
   }else{
    const table=input.observation.resources.find(r=>r.kind==='table'&&r.schemaName===properties.tableSchemaName)!;
    const payload=columnPayload(properties),cast=textValue(payload['@odata.type']),expand=['choice','boolean'].includes(textValue(properties.type))?'?$expand=OptionSet':'';
    const {tableSchemaName:_table,...column}=expected;void _table;
    const choice=properties.globalOptionSetName?input.observation.resources.find(r=>r.kind==='choice'&&r.properties.schemaName===properties.globalOptionSetName):undefined;
    add(':owned',`EntityDefinitions(${guidValue(table.remoteId)})/Attributes(${guidValue(prerequisite.remoteId)})/${cast}${expand}`,'OWNED_COLUMN',{MetadataId:prerequisite.remoteId,...column,LogicalName:prerequisite.schemaName.toLowerCase(),isManaged:false,customizable:true,...(choice?{globalChoiceMetadataId:choice.remoteId}:{})});
    membership(':membership',prerequisite.remoteId,2,table.remoteId);
   }
   continue;
  }
  dependencies.push({id:prerequisite.resourceId+':owned',resource:prerequisite.resourceId,purpose:'OWNED_EXPECTED_STATE',state:'existing',mode:'entity',comparison:'GLOBAL_CHOICE',path:`GlobalOptionSetDefinitions(${guidValue(prerequisite.remoteId)})`,expected:{MetadataId:prerequisite.remoteId,...expected,isManaged:false,customizable:true}});
  dependencies.push({id:prerequisite.resourceId+':membership',resource:prerequisite.resourceId,purpose:'OWNED_EXPECTED_STATE',state:'existing',mode:'collection',path:collection('solutioncomponents','objectid,componenttype',`_solutionid_value eq ${guidValue(manifest.solutionId)} and objectid eq ${guidValue(prerequisite.remoteId)} and componenttype eq 9`),expected:{objectid:prerequisite.remoteId,componenttype:9}});
 }
 const operations=input.plan.operations.map(op=>{
  const r=resources.find(r=>r.resourceId===op.resourceId)!,p=op.after!,reads:ExactRead[]=[];
  const add=(state:string,path:string,parent?:string,mode:'collection'|'entity'='collection')=>reads.push({id:op.id+':'+reads.length,resource:op.resourceId,purpose:'CREATE_COLLISION_CHECK',state,path,mode,...(parent?{parent}:{}),...(mode==='entity'?{absent404:true}:{})});
  const table=typeof p.tableSchemaName==='string'?p.tableSchemaName:undefined;
  if(r.kind==='table')add('metadata',collection('EntityDefinitions','MetadataId,SchemaName,LogicalName',tableFilter(r.schemaName)));
  if(r.kind==='choice')add('metadata',`GlobalOptionSetDefinitions(Name=${quote(canonicalGlobalChoiceName(r.schemaName))})` ,undefined,'entity');
  if(r.kind==='column')add('metadata',collection(`${metadataPath(table!)}/Attributes`,'MetadataId,SchemaName,LogicalName',tableFilter(r.schemaName)),table);
  if(r.kind==='key')add('metadata',collection(`${metadataPath(table!)}/Keys`,'MetadataId,SchemaName',`SchemaName eq ${quote(r.schemaName)}`),table);
  if(r.kind==='relationship'){
   add('metadata',collection('RelationshipDefinitions','MetadataId,SchemaName',`SchemaName eq ${quote(r.schemaName)}`));
   const from=textValue(p.fromTableSchemaName),lookup=textValue(rawObject(p.lookup).schemaName);add('lookup',collection(`${metadataPath(from)}/Attributes`,'MetadataId,SchemaName,LogicalName',tableFilter(lookup)),from);
  }
  if(['form','view','sitemap','app'].includes(r.kind)){
   const route={form:['systemforms','formid,name,objecttypecode','name'],view:['savedqueries','savedqueryid,name,returnedtypecode','name'],sitemap:['sitemaps','sitemapid,sitemapnameunique,componentstate,solutionid','sitemapnameunique'],app:['appmodules','appmoduleid,uniquename,componentstate,solutionid','uniquename']}[r.kind]!;
   const names=['sitemap','app'].includes(r.kind)?[textValue(p.uniqueName),publisherLocalName(input.project,p.uniqueName)]:[textValue(p.displayName)];
   for(const state of ['published','unpublished'])for(const name of names){const filter=`${route[2]} eq ${quote(name)}`+(table?` and ${r.kind==='form'?'objecttypecode':'returnedtypecode'} eq ${quote(table.toLowerCase())}`:'');add(state,collection(route[0]+(state==='unpublished'?'/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()':''),route[1]!,filter),table);}
  }
  if(r.kind==='role')add('existing',collection('roles','roleid,name,_businessunitid_value,_parentrootroleid_value',`name eq ${quote(textValue(p.displayName))}`));
  return {operationId:op.id,resourceId:op.resourceId,kind:r.kind,action:op.action,expected:reads.length?'ABSENT' as const:'DEPENDENCY_LOCAL' as const,dependsOn:op.dependsOn,reads,deferredUntilExecutable:reads.length===0||reads.some(r=>!!r.parent)};
 });
 const prerequisites=[
  {purpose:'CURRENT_CALLER_PRIVILEGES',pathTemplate:collection('privileges','privilegeid,name',[...SCHEMA_PRIVILEGES,...MODEL_PRIVILEGES].map(n=>`name eq ${quote(n)}`).join(' or ')),requiredFact:'Exact required privilege definitions exist'},
  {purpose:'CURRENT_CALLER_PRIVILEGES',pathTemplate:'systemusers({verifiedPrincipalId})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()',requiredFact:'Current verified principal has every required privilege'},
  {purpose:'LANGUAGE',pathTemplate:`organizations(${input.plan.target.organizationId})?$select=languagecode`,requiredFact:'languagecode = 1033'},
  {purpose:'ROLE_ROOT_BUSINESS_UNIT',pathTemplate:'businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null',requiredFact:'Exactly one root business unit'},
 ];
 const body={version:1 as const,strategy:'SCOPE_BOUND_ATTESTATION' as const,planHash:input.plan.contentHash,manifestHash:manifest.contentHash,dependencies,operations,target:['environmentId','dataverseUrl','organizationId','principal','AUTH_HEALTHY','English base language','customization permissions'],prerequisites,executableDependencyContracts:['Each dependsOn ID resolves to a source-bound verified ownership receipt in this plan','Table: exact LogicalName GET; MetadataId, LogicalName and UserOwned match','Column: exact parent/LogicalName GET; MetadataId and SchemaName match','Choice: exact MetadataId GET; MetadataId and canonical Name match','Form/view/sitemap/app: exact ID unpublished query; ID matches','Role: exact roleid query; ID and expected name match','Grant: exact owned tables, source PrivilegeType, plan-bound PrivilegeId and requested Basic capability; observed names are diagnostic; existing documented defaults only','App components: exact component layer ID; association absent; all component receipts verified','App access: exact app ID FetchXML intersect plus exact published app/role association; reviewed role absent'],ownershipHash:digest(input.ownership),publication:[] as never[]};
 return {...body,contentHash:digest(body)};
}
export interface AttestationOptions {verifyTarget:()=>Promise<{target:unknown;principalId:string;authStatus:string}>;ownership:()=>Promise<Ownership|undefined>;operation?:PlannedOperation;current?:Observation;expectedOwnership?:Ownership;now?:()=>number}

/** GET-only, no broad fallback, no write transport. Call only inside the existing writer lock. */
export async function attestPreWrite(input:CertificationExecutionInput,http:DataverseHttp,options:AttestationOptions):Promise<{readSet:PreWriteReadSet;attestation:PreWriteAttestation}>{
 const now=options.now??Date.now,startedAt=new Date(now()).toISOString(),start=http.audit.length;
 const readSet=derivePreWriteReadSet(input),manifest=certificationExecutionManifest(input),checks:CheckEvidence[]=[],dependencies:CheckEvidence[]=[];
 const expectedOwnership=options.expectedOwnership??input.ownership;let target:unknown=null,authStatus='UNVERIFIED',ownershipVerified=false,classification:AttestationClassification='PASS',detail='All exact preconditions verified';
 const absentTables=new Set<string>(),primaryMetadata=new Map<string,Record<string,unknown>>();
 const run=async(read:ExactRead,dep=false)=>{
  const entry:CheckEvidence={id:read.id,resource:read.resource,purpose:read.purpose,state:read.state,path:read.path,status:'NOT_RUN',records:null,requestIds:[],attempts:0,retries:0,elapsedMs:0};(dep?dependencies:checks).push(entry);
  if(read.parent&&absentTables.has(read.parent.toLowerCase())){entry.status='VERIFIED';entry.records=0;entry.basis='PARENT_ABSENT: exact parent table probe; child cannot exist; re-probe when executable';return;}
  const offset=http.audit.length,t=now();let rows:Record<string,unknown>[];
  try{
   try{rows=read.mode==='collection'?await http.all(read.path):[rawObject((await http.request(read.path)).data)];}
   catch(error){if(read.absent404&&error instanceof ApiError&&error.status===404&&error.transportEvidence?.failure?.kind==='http'&&error.transportEvidence.failure.serviceErrorCode){rows=[];entry.expectedNotFound=true;}else throw error;}
   entry.records=rows.length;
   if(read.comparison==='GLOBAL_CHOICE')rows=rows.map(raw=>({MetadataId:guidValue(raw.MetadataId),schemaName:textValue(raw.Name),displayName:label(raw.DisplayName),optionSetType:textValue(raw.OptionSetType),isGlobal:z.boolean().parse(raw.IsGlobal),isManaged:z.boolean().parse(raw.IsManaged),customizable:z.boolean().parse(rawObject(raw.IsCustomizable).Value),options:z.array(z.record(z.string(),z.unknown())).parse(raw.Options).map(o=>({value:z.int().parse(o.Value),label:label(o.Label)})).sort((a,b)=>a.value-b.value)}));
   if(read.comparison==='OWNED_PRIMARY'||read.comparison==='OWNED_COLUMN')rows=rows.map(raw=>{
    if(read.comparison==='OWNED_PRIMARY')primaryMetadata.set(read.resource,raw);
    const set=raw.OptionSet?rawObject(raw.OptionSet):undefined;
    return {MetadataId:guidValue(raw.MetadataId),...normalizeColumn(raw),LogicalName:textValue(raw.LogicalName),isManaged:z.boolean().parse(raw.IsManaged),customizable:z.boolean().parse(rawObject(raw.IsCustomizable).Value),...(read.comparison==='OWNED_PRIMARY'?{IsPrimaryName:z.boolean().parse(raw.IsPrimaryName)}:{}),...(read.expected?.globalChoiceMetadataId?{globalChoiceMetadataId:guidValue(set?.MetadataId)}:{})};
   });
   if(read.comparison==='OWNED_KEY')rows=rows.map(raw=>{
    entry.observedPlatformProperties={IsCustomizable:raw.IsCustomizable??null};
    return {MetadataId:guidValue(raw.MetadataId),schemaName:textValue(raw.SchemaName),displayName:label(raw.DisplayName),entityLogicalName:textValue(raw.EntityLogicalName),columns:z.array(z.string()).parse(raw.KeyAttributes),indexStatus:textValue(raw.EntityKeyIndexStatus),isManaged:z.boolean().parse(raw.IsManaged)};
   });
   if(read.comparison==='OWNED_TABLE')rows=rows.map(raw=>({MetadataId:guidValue(raw.MetadataId),...normalizeTable(raw,primaryMetadata.get(read.resource)??{}),LogicalName:textValue(raw.LogicalName),EntitySetName:textValue(raw.EntitySetName),PrimaryNameAttribute:textValue(raw.PrimaryNameAttribute),isManaged:z.boolean().parse(raw.IsManaged),customizable:z.boolean().parse(rawObject(raw.IsCustomizable).Value)}));
   if(read.comparison==='OWNED_RELATIONSHIP')rows=rows.map(raw=>({...raw,CascadeConfiguration:Object.fromEntries(['Delete','Assign','Share','Unshare','Reparent','Merge'].map(k=>[k,rawObject(raw.CascadeConfiguration)[k]]))}));
   if(read.comparison==='MEMBERSHIP'){const m=read.membership!;rows=[{included:rows.some(r=>guidValue(r.objectid)===m.id&&r.componenttype===m.type||m.parentId&&guidValue(r.objectid)===m.parentId&&r.componenttype===1&&r.rootcomponentbehavior===0)}];}
   if(read.expected){if(rows.length!==1||Object.entries(read.expected).some(([k,v])=>digest(rows[0]![k]??null)!==digest(v??null))){entry.status='DRIFT';fail('DEPENDENCY_CHANGED','Exact dependency identity or defining properties changed');}}
   else if(rows.length){entry.status='COLLISION';fail('COLLISION','Planned create identity is occupied; no adoption');}
   entry.status='VERIFIED';
  }catch(error){if(entry.status==='NOT_RUN')entry.status='INCOMPLETE';throw error;}
  finally{const audit=http.audit.slice(offset).filter(e=>e.result!=='STARTED');entry.requestIds=[...new Set(audit.map(e=>e.requestId))];entry.attempts=audit.length;entry.retries=audit.filter(e=>e.result==='RETRY').length;entry.elapsedMs=now()-t;}
 };
 try{
  if(now()>=Date.parse(input.plan.expiresAt))fail('PLAN_CHANGED','Plan expired');
  const verified=await options.verifyTarget();target=verified.target;authStatus=verified.authStatus;
  if(authStatus!=='AUTH_HEALTHY')fail('AUTH_FAILURE','Credential context is not healthy');
  if(digest(target)!==digest(input.plan.target))fail('TARGET_CHANGED','Target differs from plan');
  const ownership=await options.ownership();ownershipVerified=digest(ownership??null)===digest(expectedOwnership);
  if(!ownershipVerified)fail('OWNERSHIP_CHANGED','Ownership revision or receipts changed');
  for(const prerequisite of manifest.ownedPrerequisites??[])if(digest(ownership?.resources.find(r=>r.resourceId===prerequisite.resourceId)??null)!==prerequisite.receiptHash)fail('OWNERSHIP_CHANGED','Owned prerequisite receipt differs from authorized prerequisite');
  for(const read of readSet.dependencies)await run(read,true);
  // Current principal permissions are prerequisites, not a new role assignment.
  const names=[...SCHEMA_PRIVILEGES,...MODEL_PRIVILEGES];
  const defs=await http.all(readSet.prerequisites[0]!.pathTemplate);
  const privileges=z.array(z.object({PrivilegeId:z.guid()})).parse(rawObject((await http.request(readSet.prerequisites[1]!.pathTemplate.replace('{verifiedPrincipalId}',guidValue(verified.principalId)))).data).RolePrivileges);
  if(names.some(name=>!defs.some(d=>d.name===name&&privileges.some(p=>p.PrivilegeId.toLowerCase()===guidValue(d.privilegeid)))))fail('DEPENDENCY_CHANGED','Required caller privileges changed');
  const language=rawObject((await http.request(readSet.prerequisites[2]!.pathTemplate)).data);if(language.languagecode!==1033)fail('DEPENDENCY_CHANGED','Organization base language changed');
  const root=await http.all(readSet.prerequisites[3]!.pathTemplate);if(root.length!==1)fail('DEPENDENCY_CHANGED','Root business unit is unresolved');guidValue(root[0]!.businessunitid);
  const selected=options.operation?readSet.operations.filter(o=>o.operationId===options.operation!.id):readSet.operations;
  if(options.operation&&(!selected.length||digest(input.plan.operations.find(o=>o.id===options.operation!.id))!==digest(options.operation)))fail('PLAN_CHANGED','Operation differs from exact plan');
  // Tables first: absent parent is a proof, never a swallowed child 404.
  for(const op of selected.filter(o=>o.kind==='table')){for(const r of op.reads)await run(r);absentTables.add(manifest.desiredResources.find(d=>d.resourceId===op.resourceId)!.identity.toLowerCase());}
  for(const op of selected.filter(o=>o.kind!=='table')){
   if(options.operation){
    if(!options.current)fail('DEPENDENCY_CHANGED','Verified dependency observation required at operation boundary');
    for(const operationId of op.dependsOn){const dependency=input.plan.operations.find(o=>o.id===operationId);if(!dependency)continue;const owned=expectedOwnership.resources.find(o=>o.resourceId===dependency.resourceId),live=options.current!.resources.find(o=>o.resourceId===dependency.resourceId);if(!owned||!live||owned.remoteId!==live.remoteId||!owned.certificationEvidence||owned.certificationEvidence.planHash!==input.plan.contentHash)fail('DEPENDENCY_CHANGED','New dependency has no verified source-bound ownership');}
    await verifyDependencyIdentities(input,options.operation,options.current!,expectedOwnership,http);
   }
   for(const read of op.reads)await run(read);
   if(op.expected==='DEPENDENCY_LOCAL'){
    if(!options.operation){checks.push({id:op.operationId+':parent',resource:op.resourceId,purpose:'DEPENDENCY_LOCAL_PRECONDITION',state:'not-created',path:'',status:'VERIFIED',records:0,basis:'Parent is absent in this exact initial create-only plan; exact owned IDs and associations are checked when executable',requestIds:[],attempts:0,retries:0,elapsedMs:0});}
    else {await attestAggregate(input,options.operation,options.current!,expectedOwnership,http);checks.push({id:op.operationId+':parent',resource:op.resourceId,purpose:'DEPENDENCY_LOCAL_PRECONDITION',state:'existing',path:'',status:'VERIFIED',records:0,basis:'Exact owned dependency IDs and aggregate absence verified',requestIds:[],attempts:0,retries:0,elapsedMs:0});}
   }
  }
  if(digest(await options.ownership()??null)!==digest(expectedOwnership))fail('OWNERSHIP_CHANGED','Ownership changed during attestation');
  if(now()>=Date.parse(input.plan.expiresAt))fail('PLAN_CHANGED','Plan expired during attestation');
 }catch(error){classification=error instanceof PowerCanvasError&&error.code==='PF-MDA-018'?'APP_ACCESS_REQUIRES_PUBLICATION':error instanceof PowerCanvasError&&error.code==='PF-MDA-009'?'DEPENDENCY_CHANGED':error instanceof AttestationFailure?error.classification:error instanceof CredentialError?'AUTH_FAILURE':error instanceof ApiError&&[400,501].includes(error.status)?'UNSUPPORTED_TARGETED_QUERY':error instanceof ApiError&&[401,403].includes(error.status)?'AUTH_FAILURE':'READ_INCOMPLETE';detail=error instanceof PowerCanvasError&&['PF-MDA-009','PF-MDA-018'].includes(error.code)?error.message:error instanceof AttestationFailure?error.message:error instanceof ApiError?error.message:'Required target/read contract did not complete';}
 const finishedAt=new Date(now()).toISOString(),expectedIds=new Set(checks.filter(c=>c.expectedNotFound).flatMap(c=>c.requestIds));
 const rawSummary=transportHealth(http.audit.slice(start),startedAt,finishedAt),evaluated=transportHealth(http.audit.slice(start).filter(e=>!expectedIds.has(e.requestId)),startedAt,finishedAt);
 const getSummary={...rawSummary,status:evaluated.status,failedRequests:evaluated.failedRequests};
 const body={version:1 as const,planHash:readSet.planHash,manifestHash:readSet.manifestHash,readSetHash:readSet.contentHash,operationId:options.operation?.id??null,target,dependencies,operations:readSet.operations.filter(o=>!options.operation||o.operationId===options.operation.id).map(o=>({operationId:o.operationId,status:classification==='PASS'?'VERIFIED':'NOT_CERTIFIED'})),collisions:checks,ownership:{hash:digest(expectedOwnership),revision:expectedOwnership.revision,verified:ownershipVerified},publication:{scope:[] as never[],verified:true},authStatus,startedAt,expiresAt:new Date(Math.min(Date.parse(input.plan.expiresAt),Date.parse(startedAt)+5*60*1000)).toISOString(),finishedAt,result:classification==='PASS'?'PASS' as const:classification==='COLLISION'?'COLLISION' as const:['TARGET_CHANGED','DEPENDENCY_CHANGED','OWNERSHIP_CHANGED'].includes(classification)?'DRIFT' as const:classification==='READ_INCOMPLETE'?'INCOMPLETE' as const:'BLOCKED' as const,classification,detail,getSummary,expectedAbsenceResponses:expectedIds.size};
 return {readSet,attestation:{...body,contentHash:digest(body)}};
}

async function attestAggregate(input:CertificationExecutionInput,op:PlannedOperation,current:Observation,ownership:Ownership,http:DataverseHttp){
 const prerequisiteIds=new Set(certificationExecutionManifest(input).ownedPrerequisites?.map(r=>r.resourceId));
 const owned=(id:string)=>{const r=current.resources.find(r=>r.resourceId===id),o=ownership.resources.find(o=>o.resourceId===id);if(!r||!o||r.remoteId!==o.remoteId||(!prerequisiteIds.has(id)&&o.certificationEvidence?.planHash!==input.plan.contentHash))fail('DEPENDENCY_CHANGED','Aggregate dependency is not verified and owned');return r!;};
 const p=op.after!;
 if(op.action==='grantRolePrivileges'){
  const role=owned(textValue(p.role));const rows=await http.all(collection('roles','roleid,name',`roleid eq ${guidValue(role.remoteId)}`));if(rows.length!==1||rows[0]!.name!==role.properties.displayName)fail('DEPENDENCY_CHANGED','Role identity changed');
  const bindings=plannedPrivileges(op);
  for(const binding of bindings){owned(binding.tableResourceId);if(binding.depth!=='Basic')fail('DEPENDENCY_CHANGED','PRIVILEGE_DEPTH_UNSUPPORTED: certification permits Basic only');}
  const resolved=await reattestPrivileges(input.project,op,current,http);
  const definitions=await http.all(collection('privileges','privilegeid,name',PLATFORM_ROLE_DEFAULTS.map(n=>`name eq ${quote(n)}`).join(' or ')));
  const actual=z.array(z.object({PrivilegeId:z.guid(),Depth:z.string()})).parse(rawObject((await http.request(`RetrieveRolePrivilegesRole(RoleId=${guidValue(role.remoteId)})`)).data).RolePrivileges);
  const normalized=normalizeRolePrivilegeIds(actual,new Map(definitions.map(d=>[guidValue(d.privilegeid),textValue(d.name)])),resolved);
  if(normalized.grants.length)fail('DEPENDENCY_CHANGED','Role privileges changed before initial grant');
 }else{
  const app=owned(textValue(p.app));
  const rows=await http.all(collection('appmodules/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()','appmoduleid,appmoduleidunique,uniquename',`appmoduleid eq ${guidValue(app.remoteId)}`));if(rows.length!==1||rows[0]!.uniquename!==app.properties.serviceUniqueName)fail('DEPENDENCY_CHANGED','Owned app identity changed');
  if(op.action==='addAppComponents'){for(const id of z.array(z.string()).parse(p.components))owned(id);const components=await http.all(collection('appmodulecomponents','objectid,componenttype',`_appmoduleidunique_value eq ${guidValue(app.properties.componentLayerId)}`));if(components.length)fail('COLLISION','App component association exists before planned create');}
  else {requirePublishedApp(app);const unpublished=await readAppRoleIds(http,app.remoteId);for(const id of z.array(z.string()).parse(p.roles)){const role=owned(id);const roles=await http.all(collection(`appmodules(${guidValue(app.remoteId)})/appmoduleroles_association`,'roleid',`roleid eq ${guidValue(role.remoteId)}`));if(roles.length||unpublished.includes(role.remoteId))fail('COLLISION','App-role association already exists');}}
 }
}

async function verifyDependencyIdentities(input:CertificationExecutionInput,op:PlannedOperation,current:Observation,ownership:Ownership,http:DataverseHttp){
 for(const id of op.dependsOn){
  const dependency=input.plan.operations.find(o=>o.id===id);if(!dependency)continue;
  const r=current.resources.find(r=>r.resourceId===dependency.resourceId),receipt=ownership.resources.find(r=>r.resourceId===dependency.resourceId);
  if(!r||!receipt||r.remoteId!==receipt.remoteId)fail('DEPENDENCY_CHANGED','Dependency identity is missing');
  if(r!.kind==='table'){
   const raw=rawObject((await http.request(`${metadataPath(r!.schemaName)}?$select=MetadataId,LogicalName,OwnershipType`)).data);
   if(guidValue(raw.MetadataId)!==r!.remoteId||raw.LogicalName!==r!.schemaName.toLowerCase()||raw.OwnershipType!=='UserOwned')fail('DEPENDENCY_CHANGED','Table identity or ownership type changed');
  }else if(r!.kind==='column'){
   const raw=rawObject((await http.request(`${metadataPath(textValue(r!.properties.tableSchemaName))}/Attributes(LogicalName=${quote(r!.schemaName.toLowerCase())})?$select=MetadataId,SchemaName`)).data);
   if(guidValue(raw.MetadataId)!==r!.remoteId||raw.SchemaName!==r!.schemaName)fail('DEPENDENCY_CHANGED','Column identity changed');
  }else if(r!.kind==='choice'){
   const raw=rawObject((await http.request(`GlobalOptionSetDefinitions(${guidValue(r!.remoteId)})`)).data);
   if(guidValue(raw.MetadataId)!==r!.remoteId||raw.Name!==canonicalGlobalChoiceName(r!.schemaName))fail('DEPENDENCY_CHANGED','Choice identity changed');
  }else if(r!.kind==='relationship'){
   const raw=rawObject((await http.request(`RelationshipDefinitions(SchemaName=${quote(r!.schemaName)})?$select=MetadataId,SchemaName`)).data);
   if(guidValue(raw.MetadataId)!==r!.remoteId||raw.SchemaName!==r!.schemaName)fail('DEPENDENCY_CHANGED','Relationship identity changed');
  }else if(['form','view','sitemap','app','role'].includes(r!.kind)){
   const route={form:['systemforms','formid'],view:['savedqueries','savedqueryid'],sitemap:['sitemaps','sitemapid'],app:['appmodules','appmoduleid'],role:['roles','roleid']}[r!.kind]!;
   const rows=await http.all(collection(route[0]+(r!.kind==='role'?'':'/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()'),route[1]+(r!.kind==='role'?',name':''),`${route[1]} eq ${guidValue(r!.remoteId)}`));
   if(rows.length!==1||guidValue(rows[0]![route[1]!])!==r!.remoteId)fail('DEPENDENCY_CHANGED','Component identity changed');
   if(r!.kind==='role'&&rows[0]!.name!==receipt!.baseline.displayName)fail('DEPENDENCY_CHANGED','Owned role name changed');
  }else if(r!.kind==='rolePermissions'){
   const resolved=await reattestPrivileges(input.project,dependency,current,http);
   const defs=await http.all(collection('privileges','privilegeid,name',PLATFORM_ROLE_DEFAULTS.map(n=>`name eq ${quote(n)}`).join(' or ')));
   const actual=z.array(z.object({PrivilegeId:z.guid(),Depth:z.string()})).parse(rawObject((await http.request(`RetrieveRolePrivilegesRole(RoleId=${guidValue(r!.remoteId)})`)).data).RolePrivileges);
   const normalized=normalizeRolePrivilegeIds(actual,new Map(defs.map(d=>[guidValue(d.privilegeid),textValue(d.name)])),resolved);
   if(digest(normalized.grants)!==digest(receipt!.baseline.grants))fail('DEPENDENCY_CHANGED','PRIVILEGE_CHANGED: required stable IDs/depths differ from verified receipt');
  }else{
   fail('PLAN_CHANGED','REQUIRES_FULL_REVALIDATION: unsupported executable dependency contract');
  }
 }
}

export function requireAttestationPass(attestation:PreWriteAttestation,readSet:PreWriteReadSet,now=Date.now()){
 const {contentHash,...body}=attestation,{contentHash:readHash,...readBody}=readSet;
 if(contentHash!==digest(body)||readHash!==digest(readBody)||attestation.readSetHash!==readHash||attestation.planHash!==readSet.planHash||attestation.manifestHash!==readSet.manifestHash||attestation.result!=='PASS'||attestation.classification!=='PASS'||!attestation.ownership.verified||!attestation.publication.verified||attestation.authStatus!=='AUTH_HEALTHY'||now>=Date.parse(attestation.expiresAt)||Date.parse(attestation.startedAt)>now+60000||attestation.dependencies.length!==readSet.dependencies.length||attestation.dependencies.some(c=>c.status!=='VERIFIED')||attestation.collisions.some(c=>c.status!=='VERIFIED'))throw new PowerCanvasError('PF-CERT-003', `Scope-bound attestation blocked: ${attestation.classification}. ${attestation.detail ?? 'Incomplete, changed or expired evidence'}`, 'Reobserve and replan; no mutation is authorized.', [{code:'PF-CERT-003',severity:'error',message:attestation.classification}]);
 const ops=readSet.operations.filter(o=>!attestation.operationId||o.operationId===attestation.operationId);
 if(attestation.operations.length!==ops.length||ops.some(o=>!attestation.operations.some(c=>c.operationId===o.operationId&&c.status==='VERIFIED')||o.reads.some(r=>!attestation.collisions.some(c=>c.id===r.id&&c.status==='VERIFIED'))))throw Error('Attestation omits a required operation or collision probe');
 if(readSet.dependencies.some(d=>!attestation.dependencies.some(c=>c.id===d.id&&c.path===d.path&&c.status==='VERIFIED'))||ops.some(o=>o.expected==='DEPENDENCY_LOCAL'&&!attestation.collisions.some(c=>c.id===o.operationId+':parent'&&c.status==='VERIFIED')))throw Error('Attestation omits a dependency or aggregate precondition');
}
