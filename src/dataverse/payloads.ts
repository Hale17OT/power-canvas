import { create } from 'xmlbuilder2';
import { columnSchema, nameSchema } from '../ir/schema.js';
import type { JsonValue } from '../core/json.js';
import { rawObject, textValue } from './normalize.js';

export const nativeLabel = (value: string) => ({ LocalizedLabels: [{ Label: value, LanguageCode: 1033 }] });
export function columnPayload(properties: Record<string, JsonValue>, primary = false): Record<string, unknown> {
  const input = { ...properties }; delete input.tableSchemaName; delete input.solutionMember;
  if (input.default === null) delete input.default;
  const column = columnSchema.parse(input);
  const types = { text: 'String', multilineText: 'Memo', integer: 'Integer', decimal: 'Decimal', boolean: 'Boolean', dateTime: 'DateTime', choice: 'Picklist' };
  const type = types[column.type];
  const result: Record<string, unknown> = { '@odata.type': `Microsoft.Dynamics.CRM.${type}AttributeMetadata`, SchemaName: column.schemaName,
    DisplayName: nativeLabel(column.displayName), RequiredLevel: { Value: column.required === 'application' ? 'ApplicationRequired' : 'None' }, ...(primary ? { IsPrimaryName: true } : {}) };
  switch (column.type) {
    case 'text': Object.assign(result, { MaxLength: column.maxLength, FormatName: { Value: 'Text' } }); break;
    case 'multilineText': Object.assign(result, { MaxLength: column.maxLength, Format: 'Text' }); break;
    case 'integer': Object.assign(result, { MinValue: column.min, MaxValue: column.max, Format: 'None' }); break;
    case 'decimal': Object.assign(result, { MinValue: column.min, MaxValue: column.max, Precision: column.precision }); break;
    case 'boolean': Object.assign(result, { DefaultValue: column.default, OptionSet: { OptionSetType: 'Boolean',
      TrueOption: { Value: 1, Label: nativeLabel(column.trueLabel) }, FalseOption: { Value: 0, Label: nativeLabel(column.falseLabel) } } }); break;
    case 'dateTime': Object.assign(result, { Format: column.behavior === 'dateOnly' ? 'DateOnly' : 'DateAndTime',
      DateTimeBehavior: { Value: { userLocal: 'UserLocal', dateOnly: 'DateOnly', timeZoneIndependent: 'TimeZoneIndependent' }[column.behavior] } }); break;
    case 'choice': Object.assign(result, { ...(column.default === undefined ? {} : { DefaultFormValue: column.default }), OptionSet: { IsGlobal: false, OptionSetType: 'Picklist',
      Options: column.choices.map(choice => ({ Value: choice.value, Label: nativeLabel(choice.label) })) } }); break;
  }
  return result;
}
export function tablePayload(properties: Record<string, JsonValue>): Record<string, unknown> {
  return { SchemaName: nameSchema.parse(properties.schemaName), DisplayName: nativeLabel(textValue(properties.displayName)), DisplayCollectionName: nativeLabel(textValue(properties.pluralName)),
    OwnershipType: properties.ownership === 'userOrTeam' ? 'UserOwned' : 'OrganizationOwned', IsActivity: false, HasActivities: false, HasNotes: false,
    IsAuditEnabled: { Value: properties.auditing }, Attributes: [columnPayload(rawObject(properties.primaryColumn) as Record<string, JsonValue>, true)] };
}
export function relationshipPayload(properties: Record<string, JsonValue>): Record<string, unknown> {
  const lookup = rawObject(properties.lookup); const cascade = rawObject(properties.cascade);
  return { '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata', SchemaName: nameSchema.parse(properties.schemaName),
    ReferencingEntity: nameSchema.parse(properties.fromTableSchemaName).toLowerCase(), ReferencedEntity: nameSchema.parse(properties.toTableSchemaName).toLowerCase(),
    Lookup: { SchemaName: nameSchema.parse(lookup.schemaName), DisplayName: nativeLabel(textValue(lookup.displayName)),
      RequiredLevel: { Value: lookup.required === 'application' ? 'ApplicationRequired' : 'None' } },
    AssociatedMenuConfiguration: { Behavior: 'DoNotDisplay', Group: 'Details', Order: 10000 },
    CascadeConfiguration: Object.fromEntries(Object.entries(cascade).map(([key, value]) => [key[0]!.toUpperCase() + key.slice(1), value === 'restrict' ? 'Restrict' : 'NoCascade'])) };
}
export function publishXml(tables: string[]): string {
  const root = create().ele('importexportxml'); const entities = root.ele('entities');
  for (const table of tables) entities.ele('entity').txt(nameSchema.parse(table).toLowerCase());
  return root.end({ headless: true });
}
