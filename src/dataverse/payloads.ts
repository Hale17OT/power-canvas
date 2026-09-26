import {canonicalGlobalChoiceName} from './global-choice.js';
import { create } from 'xmlbuilder2';
import { columnSchema, nameSchema, keyDisplayNameSchema } from '../ir/schema.js';
import { z } from 'zod';
import { PowerCanvasError } from '../core/errors.js';
import type { JsonValue } from '../core/json.js';
import { rawObject, textValue } from './normalize.js';

export const nativeLabel = (value: string) => ({ LocalizedLabels: [{ Label: value, LanguageCode: 1033 }] });
const logicalNameSchema=z.string().regex(/^[a-z][a-z0-9_]*$/).max(100);
/** Bounded PowerCanvas subset, not the complete Microsoft EntityKeyMetadata schema. */
export const entityKeyCreateSchema=z.strictObject({
  SchemaName:nameSchema,
  DisplayName:z.strictObject({LocalizedLabels:z.array(z.strictObject({Label:keyDisplayNameSchema,LanguageCode:z.literal(1033)})).length(1)}),
  KeyAttributes:z.array(logicalNameSchema).min(1).max(16).refine(v=>new Set(v).size===v.length,'Duplicate key attributes'),
});
export function keyPayload(properties:Record<string,unknown>){
  try{
    nameSchema.parse(properties.tableSchemaName);
    const parent=logicalNameSchema.parse(properties.entityLogicalName);
    if(parent!==String(properties.tableSchemaName).toLowerCase())throw Error('Key parent logical identity differs');
    return entityKeyCreateSchema.parse({SchemaName:properties.schemaName,DisplayName:nativeLabel(keyDisplayNameSchema.parse(properties.displayName)),KeyAttributes:properties.columns});
  }catch(error){throw new PowerCanvasError('PF-VALIDATION-003','Invalid EntityKeyMetadata create contract; no request dispatched.','Require SchemaName, a nonblank DisplayName Label in language 1033, nonempty logical KeyAttributes and the matching parent table.',[],{cause:error});}
}
export function columnPayload(properties: Record<string, unknown>, primary = false): Record<string, unknown> {
  const input = { ...properties }; delete input.tableSchemaName; delete input.solutionMember;
  delete input.globalOptionSetName;
  if (input.default === null) delete input.default;
  const column = columnSchema.parse(input);
  const types = { text: 'String', multilineText: 'Memo', integer: 'Integer', decimal: 'Decimal',currency:'Money',multiChoice:'MultiSelectPicklist', boolean: 'Boolean', dateTime: 'DateTime', choice: 'Picklist' };
  const type = types[column.type];
  const result: Record<string, unknown> = { '@odata.type': `Microsoft.Dynamics.CRM.${type}AttributeMetadata`, SchemaName: column.schemaName,
    DisplayName: nativeLabel(column.displayName), RequiredLevel: { Value: column.required === 'application' ? 'ApplicationRequired' : 'None' }, ...(primary ? { IsPrimaryName: true } : {}) };
  switch (column.type) {
    case 'text': Object.assign(result, { MaxLength: column.maxLength, FormatName: { Value: 'Text' } }); break;
    case 'multilineText': Object.assign(result, { MaxLength: column.maxLength, Format: 'Text' }); break;
    case 'integer': Object.assign(result, { MinValue: column.min, MaxValue: column.max, Format: 'None' }); break;
    case 'decimal': Object.assign(result, { MinValue: column.min, MaxValue: column.max, Precision: column.precision }); break;
    case 'currency': Object.assign(result,{MinValue:column.min,MaxValue:column.max,Precision:column.precision,PrecisionSource:0});break;
    case 'boolean': Object.assign(result, { DefaultValue: column.default, OptionSet: { OptionSetType: 'Boolean',
      TrueOption: { Value: 1, Label: nativeLabel(column.trueLabel) }, FalseOption: { Value: 0, Label: nativeLabel(column.falseLabel) } } }); break;
    case 'dateTime': Object.assign(result, { Format: column.behavior === 'dateOnly' ? 'DateOnly' : 'DateAndTime',
      DateTimeBehavior: { Value: { userLocal: 'UserLocal', dateOnly: 'DateOnly', timeZoneIndependent: 'TimeZoneIndependent' }[column.behavior] } }); break;
    case 'multiChoice':Object.assign(result,{OptionSet:{IsGlobal:false,OptionSetType:'Picklist',Options:column.choices.map(c=>({Value:c.value,Label:nativeLabel(c.label)}))}});break;
    case 'choice': if(properties.globalOptionSetName){Object.assign(result,{'GlobalOptionSet@odata.bind':`/GlobalOptionSetDefinitions(Name='${canonicalGlobalChoiceName(properties.globalOptionSetName)}')`,...(column.default===undefined?{}:{DefaultFormValue:column.default})});break;} Object.assign(result, { ...(column.default === undefined ? {} : { DefaultFormValue: column.default }), OptionSet: { IsGlobal: false, OptionSetType: 'Picklist',
      Options: column.choices.map(choice => ({ Value: choice.value, Label: nativeLabel(choice.label) })) } }); break;
  }
  return result;
}
export function tablePayload(properties: Record<string, JsonValue>): Record<string, unknown> {
  return { SchemaName: nameSchema.parse(properties.schemaName), DisplayName: nativeLabel(textValue(properties.displayName)), DisplayCollectionName: nativeLabel(textValue(properties.pluralName)),
    OwnershipType: properties.ownership === 'userOrTeam' ? 'UserOwned' : 'OrganizationOwned', IsActivity: false, HasActivities: false, HasNotes: false,
    IsAuditEnabled: { Value: properties.auditing },...(properties.description!==undefined?{Description:nativeLabel(textValue(properties.description))}:{}), Attributes: [columnPayload(rawObject(properties.primaryColumn) as Record<string, JsonValue>, true)] };
}
export function choicePayload(p:Record<string,JsonValue>){return {'@odata.type':'Microsoft.Dynamics.CRM.OptionSetMetadata',Name:canonicalGlobalChoiceName(p.schemaName),DisplayName:nativeLabel(textValue(p.displayName)),IsGlobal:true,OptionSetType:'Picklist',Options:(p.options as {value:number;label:string}[]).map(o=>({Value:o.value,Label:nativeLabel(o.label)}))};}
export function relationshipPayload(properties: Record<string, JsonValue>): Record<string, unknown> {
  const lookup = rawObject(properties.lookup); const cascade = rawObject(properties.cascade);
  return { '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata', SchemaName: nameSchema.parse(properties.schemaName),
    ReferencingEntity: nameSchema.parse(properties.fromTableSchemaName).toLowerCase(), ReferencedEntity: nameSchema.parse(properties.toTableSchemaName).toLowerCase(),
    Lookup: { SchemaName: nameSchema.parse(lookup.schemaName), DisplayName: nativeLabel(textValue(lookup.displayName)),
      RequiredLevel: { Value: lookup.required === 'application' ? 'ApplicationRequired' : 'None' } },
    AssociatedMenuConfiguration: { Behavior: 'DoNotDisplay', Group: 'Details', Order: 10000 },
    CascadeConfiguration: Object.fromEntries(Object.entries(cascade).map(([key, value]) => [key[0]!.toUpperCase() + key.slice(1), value === 'restrict' ? 'Restrict' : 'NoCascade'])) };
}
export function publishXml(tables: string[],choices:string[]=[]): string {
  const root = create().ele('importexportxml'); const entities = root.ele('entities');
  for (const table of tables) entities.ele('entity').txt(nameSchema.parse(table).toLowerCase());
  if(choices.length){const options=root.ele('optionsets');for(const choice of choices)options.ele('optionset').txt(canonicalGlobalChoiceName(choice));}
  return root.end({ headless: true });
}
