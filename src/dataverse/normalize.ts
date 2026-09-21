import { z } from 'zod';
import type { JsonValue } from '../core/json.js';
import { PowerCanvasError } from '../core/errors.js';

export type Raw = Record<string, unknown>;
export const rawObject = (value: unknown): Raw => z.record(z.string(), z.unknown()).parse(value);
export const textValue = (value: unknown): string => z.string().parse(value);
export const guidValue = (value: unknown): string => z.guid().parse(value).toLowerCase();
const numberValue = (value: unknown): number => z.number().finite().parse(value);
const booleanValue = (value: unknown): boolean => z.boolean().parse(value);
export function label(value: unknown): string {
  const labels = z.object({ LocalizedLabels: z.array(z.object({ LanguageCode: z.int(), Label: z.string() })) }).parse(value);
  const english = labels.LocalizedLabels.find(item => item.LanguageCode === 1033);
  if (!english) throw new PowerCanvasError('PF-DV-003', 'Metadata lacks a required English (1033) label.', 'This adapter currently supports English metadata only; do not infer a label from the current user language.');
  return english.Label;
}
export function required(value: unknown): string {
  const level = textValue(rawObject(value).Value);
  return level === 'None' ? 'none' : level === 'ApplicationRequired' ? 'application' : `unsupported:${level}`;
}
export const attributeCasts: Record<string, string> = {
  String: 'StringAttributeMetadata', Memo: 'MemoAttributeMetadata', Integer: 'IntegerAttributeMetadata', Decimal: 'DecimalAttributeMetadata',
  Boolean: 'BooleanAttributeMetadata', DateTime: 'DateTimeAttributeMetadata', Picklist: 'PicklistAttributeMetadata', Lookup: 'LookupAttributeMetadata',
};
export function normalizeColumn(raw: Raw): Record<string, JsonValue> {
  const base = { schemaName: textValue(raw.SchemaName), displayName: label(raw.DisplayName), required: required(raw.RequiredLevel) };
  switch (raw.AttributeType) {
    case 'String': return { ...base, type: 'text', maxLength: numberValue(raw.MaxLength) };
    case 'Memo': return { ...base, type: 'multilineText', maxLength: numberValue(raw.MaxLength) };
    case 'Integer': return { ...base, type: 'integer', min: numberValue(raw.MinValue), max: numberValue(raw.MaxValue) };
    case 'Decimal': return { ...base, type: 'decimal', min: numberValue(raw.MinValue), max: numberValue(raw.MaxValue), precision: numberValue(raw.Precision) };
    case 'DateTime': {
      const behavior = textValue(rawObject(raw.DateTimeBehavior).Value);
      return { ...base, type: 'dateTime', behavior: ({ UserLocal: 'userLocal', DateOnly: 'dateOnly', TimeZoneIndependent: 'timeZoneIndependent' } as Record<string, string>)[behavior] ?? `unsupported:${behavior}` };
    }
    case 'Boolean': {
      const options = rawObject(raw.OptionSet);
      return { ...base, type: 'boolean', default: booleanValue(raw.DefaultValue), trueLabel: label(rawObject(options.TrueOption).Label), falseLabel: label(rawObject(options.FalseOption).Label) };
    }
    case 'Picklist': {
      const optionSet = rawObject(raw.OptionSet);
      if (optionSet.IsGlobal === true) return { ...base, type: 'unsupported:globalChoice' };
      const options = z.array(z.record(z.string(), z.unknown())).parse(optionSet.Options);
      return { ...base, type: 'choice', choices: options.map(option => ({ value: numberValue(option.Value), label: label(option.Label) })).sort((a, b) => a.value - b.value),
        default: raw.DefaultFormValue === null || raw.DefaultFormValue === -1 ? null : numberValue(raw.DefaultFormValue) };
    }
    default: return { ...base, type: `unsupported:${textValue(raw.AttributeType)}` };
  }
}
export function normalizeTable(raw: Raw, primary: Raw): Record<string, JsonValue> {
  return { schemaName: textValue(raw.SchemaName), displayName: label(raw.DisplayName), pluralName: label(raw.DisplayCollectionName),
    ownership: raw.OwnershipType === 'UserOwned' ? 'userOrTeam' : raw.OwnershipType === 'OrganizationOwned' ? 'organization' : `unsupported:${textValue(raw.OwnershipType)}`,
    auditing: booleanValue(rawObject(raw.IsAuditEnabled).Value), primaryColumn: normalizeColumn(primary) };
}
export function normalizeRelationship(raw: Raw, lookup: Raw, fromSchema: string, toSchema: string): Record<string, JsonValue> {
  const cascade = rawObject(raw.CascadeConfiguration);
  const translate = (value: unknown): string => value === 'NoCascade' ? 'none' : value === 'Restrict' ? 'restrict' : `unsupported:${textValue(value)}`;
  return { schemaName: textValue(raw.SchemaName), fromTableSchemaName: fromSchema, toTableSchemaName: toSchema,
    lookup: { schemaName: textValue(lookup.SchemaName), displayName: label(lookup.DisplayName), required: required(lookup.RequiredLevel) },
    cascade: { delete: translate(cascade.Delete), assign: translate(cascade.Assign), share: translate(cascade.Share), unshare: translate(cascade.Unshare), reparent: translate(cascade.Reparent), merge: translate(cascade.Merge) } };
}
