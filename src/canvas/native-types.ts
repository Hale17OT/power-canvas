import { z } from 'zod';
import type { JsonInput } from '../core/json.js';

export const nativeBindingsSchema = z.strictObject({
  appId: z.uuid(), solution: z.string(), environmentId: z.string(),
  controls: z.array(z.string()).min(1),
  flowSources:z.record(z.string(),z.strictObject({workflowId:z.guid(),dataSourceName:z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),contractHash:z.string().regex(/^[a-f0-9]{64}$/)})).optional(),
  sources: z.record(z.string(), z.strictObject({ name: z.string().min(1), logicalName: z.string(), primaryId: z.string(), fields: z.record(z.string(), z.string()) })),
});
export type NativeBindings = z.infer<typeof nativeBindingsSchema>;
type Props = Record<string, string>;
export interface NativeControl { [key: string]: JsonInput | undefined; Control?: string; Variant?: string; Layout?: string; Properties: Props; Children?: Record<string, NativeControl>[] }
export type NativeFiles = Record<string, JsonInput>;
