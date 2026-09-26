import {z} from 'zod';
import {guidValue,label,textValue,type Raw} from './normalize.js';

/** EntityKeyMetadata only: preserve unauthored managed properties as observed evidence. */
export function normalizeKey(raw:Raw,table:Raw,tableSchemaName:string,solutionMember:boolean){
 return {schemaName:textValue(raw.SchemaName),displayName:label(raw.DisplayName),tableSchemaName,
  entityLogicalName:textValue(raw.EntityLogicalName),columns:z.array(z.string()).parse(raw.KeyAttributes),
  indexStatus:textValue(raw.EntityKeyIndexStatus),solutionMember,isManaged:z.boolean().parse(raw.IsManaged),
  parentMetadataId:guidValue(table.MetadataId),parentEntityLogicalName:textValue(table.LogicalName),
  isCustomizable:raw.IsCustomizable===undefined?null:z.object({Value:z.boolean(),CanBeChanged:z.boolean(),ManagedPropertyLogicalName:z.string()}).parse(raw.IsCustomizable),
  managedPropertyClassification:'PLATFORM_MANAGED_PROPERTY'};
}
