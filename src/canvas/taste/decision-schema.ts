import { z } from 'zod';

const dial = z.number().min(0).max(10);
export const dimensionNames = ['density', 'formality', 'warmth', 'contrast', 'surfaceDepth', 'radiusCharacter', 'typographyExpression', 'navigationPresence', 'dataEmphasis', 'brandExpression', 'motion', 'decorativeIntensity'] as const;
export const dimensionsSchema = z.strictObject(Object.fromEntries(dimensionNames.map(k => [k, dial])) as Record<typeof dimensionNames[number], typeof dial>);
export const archetypes = ['operational-console', 'editorial-workspace', 'command-center', 'focused-task', 'analytical-briefing', 'document-workspace', 'collaborative-workspace', 'case-workspace', 'configuration-console', 'field-companion', 'executive-brief', 'process-tracker', 'inbox-workspace', 'content-library', 'timeline-workspace', 'mobile-utility'] as const;
export const directions = ['data-first', 'workspace-first', 'task-first', 'content-first'] as const;
export const contextSchema = z.strictObject({
  destinationCount: z.number().int().min(1).max(30), hierarchyDepth: z.number().int().min(1).max(4),
  navigationFrequency: z.enum(['occasional', 'frequent']), userFamiliarity: z.enum(['new', 'experienced']),
  persistentContext: z.boolean(), taskMinutes: z.number().positive().max(480), fieldCount: z.number().int().min(0).max(100),
  fieldComplexity: z.enum(['simple', 'dependent']), validationBurden: z.enum(['low', 'high']),
  recordCount: z.number().int().nonnegative(), comparison: z.boolean(), visualContent: z.boolean(),
  scanKey: z.enum(['identity', 'status', 'time', 'measure']), sorting: z.boolean(), editing: z.boolean(),
  workflow: z.enum(['queue', 'analysis', 'reading', 'entry', 'configuration', 'stages', 'history']),
  overlayTask: z.enum(['confirmation', 'edit', 'filter', 'inspect']), destructive: z.boolean(),
  actionCount: z.number().int().min(1).max(20), bulkActions: z.boolean(),
});
export type DecisionContext = z.infer<typeof contextSchema>;
export const v4DesignSchema = z.strictObject({
  direction: z.enum(directions).optional(), designVariance: dial.default(3),
  archetype: z.enum(archetypes).optional(), dimensions: dimensionsSchema.partial().default({}),
  preferences: z.array(z.string().min(1)).default([]), bans: z.array(z.string().min(1)).default([]),
  surface: z.enum(['flat', 'sectioned', 'layered', 'carded', 'panelled', 'editorial']).optional(),
  overlaySurface: z.enum(['flat', 'standard', 'elevated', 'bordered', 'inset', 'dark', 'highContrast']).default('standard'),
  color: z.enum(['monochrome-accent', 'neutral-enterprise', 'warm-neutral', 'cool-technical', 'semantic-heavy', 'brand-forward', 'data-viz']).default('neutral-enterprise'),
  border: z.enum(['none', 'hairline', 'section', 'component', 'emphasis-only']).default('hairline'),
  radius: z.enum(['square', 'low', 'moderate', 'soft', 'mixed-semantic']).default('low'),
  reducedMotion: z.boolean().default(true),
});
export type DesignDirection = z.infer<typeof v4DesignSchema>;
export const dimensionPresets = {
  'dense-operations': {density:9,formality:8,warmth:2,contrast:7,surfaceDepth:2,radiusCharacter:2,typographyExpression:4,navigationPresence:6,dataEmphasis:10,brandExpression:2,motion:0,decorativeIntensity:0},
  'executive-dashboard': {density:3,formality:7,warmth:4,contrast:7,surfaceDepth:3,radiusCharacter:4,typographyExpression:7,navigationPresence:3,dataEmphasis:9,brandExpression:4,motion:1,decorativeIntensity:1},
  'minimal-workspace': {density:3,formality:5,warmth:4,contrast:7,surfaceDepth:1,radiusCharacter:2,typographyExpression:4,navigationPresence:2,dataEmphasis:4,brandExpression:1,motion:0,decorativeIntensity:0},
  'clean-saas': {density:4,formality:5,warmth:6,contrast:7,surfaceDepth:3,radiusCharacter:5,typographyExpression:6,navigationPresence:4,dataEmphasis:5,brandExpression:5,motion:1,decorativeIntensity:1},
  'fluent-enterprise': {density:5,formality:8,warmth:3,contrast:7,surfaceDepth:3,radiusCharacter:3,typographyExpression:4,navigationPresence:6,dataEmphasis:6,brandExpression:3,motion:0,decorativeIntensity:0},
} as const;
export const semanticRoles = ['page-title', 'section-title', 'record-primary-identity', 'record-secondary-identity', 'primary-command', 'secondary-command', 'destructive-command', 'navigation-primary', 'navigation-secondary', 'metadata', 'status', 'form-field', 'filter', 'activity-item', 'lead-metric', 'supporting-metric', 'data-view', 'overlay', 'feedback'] as const;
export const componentMetadataSchema = z.strictObject({ recipe: z.string(), variant: z.string(), role: z.enum(semanticRoles), composition: z.string(), slot: z.string() });
export type ComponentMetadata = z.infer<typeof componentMetadataSchema>;
export type SemanticMap = Record<string, ComponentMetadata>;
