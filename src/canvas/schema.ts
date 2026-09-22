import { z } from 'zod';
import { componentNames, identity } from './registry.js';
import type { ComponentName } from './registry.js';
import { themeSchema } from './tokens.js';
import { tasteSchema } from './taste/config.js';
import { applicationPolicySchema } from './application-boundary.js';
import { productSchema } from './taste/memory.js';
import { designHostSchema } from './taste/generation.js';

export type ComponentNode = { key: string; component: ComponentName; version: string; props: Record<string, z.core.util.JSONType>; children: ComponentNode[] };
export const nodeSchema: z.ZodType<ComponentNode> = z.lazy(() => z.strictObject({ key: identity, component: z.enum(componentNames), version: z.literal('0.1.0').default('0.1.0'), props: z.record(z.string(), z.json()), children: z.array(nodeSchema).max(50).default([]) }));
const label = z.string().min(1).max(200);
export const screenSchema = z.discriminatedUnion('pattern', [
  z.strictObject({ pattern: z.literal('analytical'), title: label, subtitle: label, question: label, source: identity, groupBy: identity }),
  z.strictObject({ pattern: z.literal('masterDetail'), title: label, source: identity, columns: z.array(identity).min(1).max(6), search: z.strictObject({ field: identity, label }).optional(), pageSize: z.int().min(1).max(100).default(25), detail: z.strictObject({ fields: z.array(identity).min(1).max(8), revealFields: z.array(identity).max(8).default([]), reasonField: identity.optional() }) }),
  z.strictObject({ pattern: z.literal('dashboard'), title: label, subtitle: label.optional(), cards: z.array(z.strictObject({ key: identity, label, value: label, supportingText: label.optional() })).min(1).max(6) }),
  z.strictObject({ pattern: z.literal('list'), title: label, source: identity, columns: z.array(identity).min(1).max(6), search: z.strictObject({ field: identity, label }).optional(), pageSize: z.int().min(1).max(100).default(25) }),
  z.strictObject({ pattern: z.literal('custom'), title: label, content: z.array(nodeSchema).min(1).max(30) }),
]);
export const canvasAppSchema = z.strictObject({ type: z.literal('canvas'), uniqueName: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/).max(100), displayName: label,
  application: applicationPolicySchema.optional(),
  theme: themeSchema.default({ mode: 'light', density: 'comfortable', brand: { primary: '#145C4F' }, font: 'Segoe UI', radius: 'soft' }),
  componentPolicy: z.enum(['experimental', 'stableOnly']).default('experimental'),
  taste: tasteSchema.optional(),
  nativeDesign:z.strictObject({version:z.literal(4).optional(),product:productSchema,host:designHostSchema,stability:z.enum(['experimental','production']).default('experimental')}).optional(),
  shell: z.strictObject({ pattern: z.literal('sidebar'), navigation: z.array(z.strictObject({ screen: identity, label })).min(1).max(6) }),
  screens: z.record(identity, screenSchema),
});
export type CanvasApp = z.infer<typeof canvasAppSchema>;
