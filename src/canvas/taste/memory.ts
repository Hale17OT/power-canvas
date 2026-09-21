import { z } from 'zod';
import { parseDocument } from 'yaml';
import { createHash } from 'node:crypto';
import { deviceStrategiesSchema } from './devices.js';

const words = z.array(z.string().min(1)).min(1);
export const modes = ['operate', 'review', 'analyze', 'configure', 'enter', 'approve', 'explore'] as const;
export const traitGroups = {
  accent: ['restrained-accent'], density: ['high-density', 'low-density'], border: ['hairline-borders', 'borderless-sections'],
  radius: ['low-radius', 'medium-radius', 'soft-radius'], surface: ['flat-surfaces', 'layered-surfaces'],
  type: ['strong-type-hierarchy', 'quiet-type-hierarchy'], navigation: ['compact-navigation', 'spacious-navigation'],
  spacing: ['editorial-spacing', 'operational-spacing'], foundation: ['monochrome-foundation', 'warm-neutral-foundation', 'cool-neutral-foundation'],
  elevation: ['minimal-elevation', 'moderate-elevation'], priority: ['data-first', 'content-first', 'task-first'],
  actions: ['quiet-secondary-actions', 'command-heavy'], data: ['dense-table', 'comfortable-list'], disclosure: ['progressive-disclosure', 'always-visible-controls'],
};
export const traits = Object.values(traitGroups).flat();
const trait = z.string().refine(v => traits.includes(v), 'Unknown abstract design trait');
export const productSchema = z.strictObject({
  name: z.string().min(1), users: words, jobs: words, frequency: z.enum(['occasional', 'daily', 'continuous']),
  purpose: z.enum(['operations', 'executive', 'approval', 'document-review', 'inspection', 'configuration', 'exploration']),
  devices: z.array(z.enum(['desktop', 'tablet', 'mobile'])).min(1), criticalInformation: words, accessibility: words, constraints: words,
});
export const referenceSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]+$/), source: z.string().optional(), atmosphere: words, visualCharacter: words,
  density: z.strictObject({ level: z.number().min(0).max(10), notes: z.string() }),
  color: z.strictObject({ strategy: z.string().min(1), roles: z.record(z.string(), z.string()), semanticRoles: z.record(z.string(), z.string()) }),
  typography: z.strictObject({ hierarchy: z.array(z.strictObject({ role: z.string(), token: z.string().regex(/^PF_/), size: z.number().min(12).max(64) })).min(3), philosophy: z.string() }),
  spacing: z.strictObject({ scale: z.array(z.number().nonnegative()).min(2), philosophy: z.string() }),
  radius: z.strictObject({ scale: z.array(z.number().nonnegative()).min(1), philosophy: z.string() }),
  surfaces: z.strictObject({ strategy: z.enum(['flat', 'layered', 'reading', 'focused']) }), borders: z.strictObject({ strategy: z.enum(['hairline', 'sectionless']) }),
  elevation: z.strictObject({ strategy: z.enum(['none', 'overlay-only']) }), navigation: z.strictObject({ characteristics: words }),
  components: z.strictObject({ treatments: z.record(z.string(), z.string()) }), layout: z.strictObject({ principles: words }), responsive: z.strictObject({ principles: words }),
  dos: words, donts: words, powerAppsAdaptation: z.strictObject({ supported: words, translated: words, unsupported: words }),
});
export const designSchema = z.strictObject({
  devices: deviceStrategiesSchema.optional(),
  version: z.literal('2.0'), personality: z.enum(['fluent-enterprise', 'clean-saas', 'dense-operations', 'executive-dashboard', 'minimal-workspace']),
  primary: referenceSchema, secondaryTraits: z.array(trait).max(3).default([]), traits: z.array(trait).min(1),
  modes: z.record(z.string(), z.enum(modes)), exceptions: z.array(z.strictObject({ rule: z.string().min(1), control: z.string().min(1), property: z.string().min(1), reason: z.string().min(20) })).default([]),
}).superRefine((d, ctx) => {
  for (const group of Object.values(traitGroups)) if (group.filter(t => [...d.traits, ...d.secondaryTraits].includes(t)).length > 1) ctx.addIssue({ code: 'custom', message: `Incompatible traits: ${group.join(', ')}` });
  if (d.traits.includes('high-density') && d.primary.density.level < 7) ctx.addIssue({ code: 'custom', message: 'High density requires a density level of at least 7' });
});
export type DesignMemory = z.infer<typeof designSchema>;
export type ProductContext = z.infer<typeof productSchema>;
export const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

/** Explicit contract extraction, not an invented natural-language interpretation. Prose remains human context. */
export function parseMemory<T>(markdown: string, kind: 'product' | 'design' | 'reference', schema: z.ZodType<T>): T {
  if (Buffer.byteLength(markdown) > 1024 * 1024) throw new Error('Design memory exceeds 1 MiB');
  const blocks = [...markdown.matchAll(new RegExp('```powercanvas-' + kind + '\\s*\\n([\\s\\S]*?)```', 'g'))];
  if (blocks.length !== 1) throw new Error(`Expected exactly one powercanvas-${kind} contract block; normalize prose explicitly first.`);
  const document = parseDocument(blocks[0]![1]!, { uniqueKeys: true });
  if (document.errors.length || document.warnings.length) throw new Error('Invalid memory contract');
  return schema.parse(document.toJS({ maxAliasCount: 0 }));
}
export function companion(productMarkdown: string, designMarkdown: string) {
  return { productHash: sha256(productMarkdown), designHash: sha256(designMarkdown), product: parseMemory(productMarkdown, 'product', productSchema), design: parseMemory(designMarkdown, 'design', designSchema) };
}
export function inferMode(product: ProductContext): typeof modes[number] {
  return ({ operations: 'operate', executive: 'analyze', approval: 'approve', 'document-review': 'review', inspection: 'enter', configuration: 'configure', exploration: 'explore' } as const)[product.purpose];
}
