import type {Observation,PlannedOperation} from '../state/models.js';
import type {DataverseHttp} from './http.js';
import {metadataPath} from './discovery.js';
import {guidValue,rawObject,textValue} from './normalize.js';
import {nameSchema} from '../ir/schema.js';
import {PowerCanvasError} from '../core/errors.js';

/** Additional exact identity witnesses required by continuation certification. GET only. */
export async function certificationIdentityReadback(op:PlannedOperation,observation:Observation,http:DataverseHttp){
 const resource=observation.resources.find(r=>r.resourceId===op.resourceId),p=op.after;
 if(!resource||!p)return undefined;
 const fail=():never=>{throw new PowerCanvasError('PF-DV-007','Certification identity readback differs from the exact reviewed provider contract.','Stop and reconcile this confirmed create; never retry CREATE or normalize during execution.');};
 if(op.action==='createRelationship'){
  const raw=rawObject((await http.request(`RelationshipDefinitions(${guidValue(resource.remoteId)})/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata`)).data);
  const lookup=rawObject((await http.request(`${metadataPath(textValue(p.fromTableSchemaName))}/Attributes(LogicalName='${textValue(rawObject(p.lookup).schemaName).toLowerCase()}')?$select=MetadataId,SchemaName,LogicalName`)).data);
  if(guidValue(raw.MetadataId)!==resource.remoteId||raw.SchemaName!==p.schemaName||raw.ReferencedEntity!==textValue(p.toTableSchemaName).toLowerCase()||raw.ReferencingEntity!==textValue(p.fromTableSchemaName).toLowerCase()||lookup.SchemaName!==rawObject(p.lookup).schemaName||lookup.LogicalName!==textValue(rawObject(p.lookup).schemaName).toLowerCase()||raw.ReferencingAttribute!==lookup.LogicalName)fail();
  return {kind:'RELATIONSHIP_LOOKUP_IDENTITY',resourceId:resource.resourceId,metadataId:resource.remoteId,schemaName:textValue(raw.SchemaName),referencedEntity:textValue(raw.ReferencedEntity),referencingEntity:textValue(raw.ReferencingEntity),lookupMetadataId:guidValue(lookup.MetadataId),lookupSchemaName:textValue(lookup.SchemaName),lookupLogicalName:textValue(lookup.LogicalName),cascadeConfiguration:rawObject(raw.CascadeConfiguration)};
 }
 if(op.action==='createRole'){
  const raw=rawObject((await http.request(`roles(${guidValue(resource.remoteId)})?$select=roleid,name,_businessunitid_value,ismanaged`)).data);
  if(guidValue(raw.roleid)!==resource.remoteId||raw.name!==p.displayName||raw.ismanaged!==false||resource.properties.businessUnit!=='root')fail();
  return {kind:'ROLE_IDENTITY',resourceId:resource.resourceId,roleId:resource.remoteId,name:textValue(raw.name),businessUnitId:guidValue(raw._businessunitid_value),isManaged:false};
 }
 if(op.action==='createTable'){
  const raw=rawObject((await http.request(`EntityDefinitions(${guidValue(resource.remoteId)})?$select=MetadataId,LogicalName,SchemaName,EntitySetName,OwnershipType,PrimaryNameAttribute`)).data);
  const expectedPrimary=textValue(rawObject(p.primaryColumn).schemaName).toLowerCase();
  if(guidValue(raw.MetadataId)!==resource.remoteId||raw.SchemaName!==p.schemaName||raw.LogicalName!==textValue(p.schemaName).toLowerCase()||raw.OwnershipType!=='UserOwned'||raw.PrimaryNameAttribute!==expectedPrimary)fail();
  // EntitySetName is platform-generated, not a separately authored rename. Record its
  // exact valid value and require it to remain stable across independent witnesses.
  nameSchema.parse(raw.EntitySetName);
  const primary=rawObject((await http.request(`${metadataPath(textValue(p.schemaName))}/Attributes(LogicalName='${expectedPrimary}')?$select=MetadataId,SchemaName,LogicalName,IsPrimaryName`)).data);
  if(primary.SchemaName!==rawObject(p.primaryColumn).schemaName||primary.LogicalName!==expectedPrimary||primary.IsPrimaryName!==true)fail();
  return {kind:'TABLE_IDENTITY',resourceId:resource.resourceId,metadataId:guidValue(raw.MetadataId),logicalName:textValue(raw.LogicalName),schemaName:textValue(raw.SchemaName),entitySetName:textValue(raw.EntitySetName),ownershipType:textValue(raw.OwnershipType),primaryNameAttribute:textValue(raw.PrimaryNameAttribute),primaryMetadataId:guidValue(primary.MetadataId)};
 }
 if(op.action==='createColumn'&&p.globalOptionSetName){
  const choices=observation.resources.filter(r=>r.kind==='choice'&&r.properties.schemaName===p.globalOptionSetName);
  if(choices.length!==1)fail();
  const raw=rawObject((await http.request(`${metadataPath(textValue(p.tableSchemaName))}/Attributes(${guidValue(resource.remoteId)})/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet`)).data),choice=rawObject(raw.OptionSet);
  if(guidValue(raw.MetadataId)!==resource.remoteId||guidValue(choice.MetadataId)!==choices[0]!.remoteId||choice.Name!==p.globalOptionSetName||choice.IsGlobal!==true)fail();
  return {kind:'GLOBAL_CHOICE_BINDING',resourceId:resource.resourceId,metadataId:resource.remoteId,globalChoiceMetadataId:guidValue(choice.MetadataId),canonicalName:textValue(choice.Name)};
 }
 return undefined;
}
