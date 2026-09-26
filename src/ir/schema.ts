import { z } from 'zod';
import { canvasAppSchema } from '../canvas/schema.js';
import { flowResourcesSchema } from '../flows/schema.js';

export const API_VERSION = 'powercanvas.dev/v1alpha1';
export const keySchema = z.string().regex(/^[a-z][a-zA-Z0-9]*$/).max(64);
export const nameSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/).max(100);
// eslint-disable-next-line no-control-regex -- Labels must not inject terminal control sequences.
export const labelSchema = z.string().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/);
export const lifecycleSchema = z.strictObject({ deletionPolicy: z.literal('retain').default('retain') })
  .default({ deletionPolicy: 'retain' });
const requiredSchema = z.enum(['none', 'application']).default('none');
const base = { schemaName: nameSchema, displayName: labelSchema, required: requiredSchema, lifecycle: lifecycleSchema };
const range = { min: z.number().finite(), max: z.number().finite() };

export const columnSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('text'), maxLength: z.int().min(1).max(4000) }),
  z.strictObject({ ...base, type: z.literal('multilineText'), maxLength: z.int().min(1).max(1048576) }),
  z.strictObject({ ...base, type: z.literal('integer'), min: z.int().min(-2147483648), max: z.int().max(2147483647) }),
  z.strictObject({ ...base, type: z.literal('decimal'), ...range, precision: z.int().min(0).max(10) }),
  z.strictObject({ ...base, type: z.literal('currency'), min:z.number().min(-922337203685477), max:z.number().max(922337203685477), precision:z.int().min(0).max(4) }),
  z.strictObject({ ...base, type: z.literal('boolean'), default: z.boolean(), trueLabel: labelSchema, falseLabel: labelSchema }),
  z.strictObject({ ...base, type: z.literal('dateTime'), behavior: z.enum(['userLocal', 'dateOnly', 'timeZoneIndependent']) }),
  z.strictObject({ ...base, type: z.literal('choice'),
    choices: z.array(z.strictObject({ label: labelSchema, value: z.int().min(0).max(2147483647) })).default([]), globalChoice:keySchema.optional(),
    default: z.int().min(0).max(2147483647).optional(),
  }),
  z.strictObject({ ...base, type:z.literal('multiChoice'), choices:z.array(z.strictObject({label:labelSchema,value:z.int().min(0).max(2147483647)})).min(1) }),
]);

export const globalChoiceSchema=z.strictObject({schemaName:nameSchema,displayName:labelSchema,options:z.array(z.strictObject({label:labelSchema,value:z.int().min(0).max(2147483647)})).min(1),lifecycle:lifecycleSchema});
// Optional only for compatibility with already-valid v1alpha1 key sources.
export const keyDisplayNameSchema=labelSchema.regex(/\S/,'Key displayName must not be blank');
export const keyResourceSchema=z.strictObject({schemaName:nameSchema,displayName:keyDisplayNameSchema.optional(),table:keySchema,columns:z.array(keySchema).min(1).max(16),reason:z.string().min(10),lifecycle:lifecycleSchema});

export const tableSchema = z.strictObject({
  schemaName: nameSchema, displayName: labelSchema, pluralName: labelSchema,
  ownership: z.enum(['userOrTeam', 'organization']), primaryName: keySchema,
  auditing: z.boolean().default(false), lifecycle: lifecycleSchema,
  description:z.string().max(2000).optional(),
  columns: z.record(keySchema, columnSchema),
});

export const relationshipSchema = z.strictObject({
  schemaName: nameSchema, fromTable: keySchema, toTable: keySchema,
  lookup: z.strictObject({ key: keySchema, schemaName: nameSchema, displayName: labelSchema, required: requiredSchema }),
  cascade: z.strictObject({ delete: z.literal('restrict'), assign: z.literal('none'), share: z.literal('none'),
    unshare: z.literal('none'), reparent: z.literal('none'), merge: z.literal('none') }),
  lifecycle: lifecycleSchema,
});

export const formLayoutSchema=z.array(z.strictObject({name:nameSchema,label:labelSchema,sections:z.array(z.strictObject({name:nameSchema,label:labelSchema,columns:z.int().min(1).max(2),fields:z.array(z.strictObject({field:keySchema,column:z.int().min(1).max(2).default(1),readOnly:z.boolean().default(false),visible:z.boolean().default(true)})).min(1)})).min(1)})).min(1);
export const viewFilterSchema=z.strictObject({field:keySchema,operator:z.enum(['eq','ne','gt','ge','lt','le','in','not-in','null','not-null','eq-userid']),values:z.array(z.union([z.string().max(1000),z.number().finite(),z.boolean()])).max(100).default([])});
const formSchema = z.strictObject({ displayName: labelSchema, table: keySchema, layout:formLayoutSchema.optional(),
  fields: z.array(keySchema).min(1), reveal: z.strictObject({ fields: z.array(keySchema).min(1).max(8) }).optional(), lifecycle: lifecycleSchema });
const viewSchema = z.strictObject({ displayName: labelSchema, table: keySchema,
  columns: z.array(keySchema).min(1), activeOnly: z.boolean().default(true),
  filters:z.array(viewFilterSchema).max(30).optional(),
  orderBy: z.array(z.strictObject({ column: keySchema, direction: z.enum(['ascending', 'descending']) })).default([]),
  lifecycle: lifecycleSchema });
export const appSchema = z.strictObject({
  type: z.literal('modelDriven'), uniqueName: nameSchema, displayName: labelSchema,
  publishPolicy:z.enum(['manual','afterValidation']).optional(),
  tables: z.array(keySchema).min(1), forms: z.record(keySchema, formSchema), views: z.record(keySchema, viewSchema),
  commands: z.record(keySchema, z.strictObject({ label: labelSchema, form: keySchema, action: z.literal('toggleDetails'), visible: z.boolean().default(true), bindingVersion: z.union([z.literal(1), z.literal(2)]).default(2), sequence: z.int().min(1).max(100000000000).default(100100100), tooltip: labelSchema })).optional(),
  navigation: z.array(z.strictObject({ area:labelSchema.optional(),group: labelSchema, table: keySchema })).min(1), lifecycle: lifecycleSchema,
});
export const depthSchema = z.enum(['none','user', 'businessUnit', 'parentChildBusinessUnit', 'organization']);
export const roleSchema = z.strictObject({ displayName: labelSchema, lifecycle: lifecycleSchema,
  tables: z.record(keySchema, z.strictObject({ read: depthSchema.optional(), create: depthSchema.optional(),
    write: depthSchema.optional(), append: depthSchema.optional(), appendTo: depthSchema.optional(),delete:depthSchema.optional(),assign:depthSchema.optional(),share:depthSchema.optional() })) });

export const projectSchema = z.strictObject({
  apiVersion: z.literal(API_VERSION),
  project: z.strictObject({ id: z.uuid(), name: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).max(80) }),
  solution: z.strictObject({
    uniqueName: nameSchema, displayName: labelSchema,
    version: z.string().regex(/^\d{1,5}\.\d{1,5}\.\d{1,5}\.\d{1,5}$/),
    publisher: z.strictObject({ uniqueName: nameSchema,
      prefix: z.string().regex(/^[a-z][a-z0-9]{1,7}$/), optionValuePrefix: z.int().min(10000).max(99999) }),
  }),
  dataverse: z.strictObject({ tables: z.record(keySchema, tableSchema),
    choices:z.record(keySchema,globalChoiceSchema).optional(),keys:z.record(keySchema,keyResourceSchema).optional(),
    relationships: z.record(keySchema, relationshipSchema).default({}) }),
  apps: z.record(keySchema, appSchema).default({}),
  canvasApps: z.record(keySchema, canvasAppSchema).optional(),
  resources: flowResourcesSchema.optional(),
  security: z.strictObject({ roles: z.record(keySchema, roleSchema).default({}),
    appAccess: z.record(keySchema, z.array(keySchema).min(1)).default({}) }).default({ roles: {}, appAccess: {} }),
});

export type Project = z.infer<typeof projectSchema>;
export type Column = z.infer<typeof columnSchema>;
