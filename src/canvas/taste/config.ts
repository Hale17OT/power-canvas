import { z } from 'zod';
import { designSchema } from './memory.js';
import { strategies } from './strategies.js';

export const personalityNames = ['fluent-enterprise', 'clean-saas', 'dense-operations', 'executive-dashboard', 'minimal-workspace'] as const;
const dial = z.number().min(0).max(10);
export const dialsSchema = z.strictObject({ designVariance: dial, visualDensity: dial, brandExpression: dial, componentComplexity: dial, motionIntensity: dial });
export const tasteSchema = z.strictObject({
  memory: z.strictObject({ product: z.string().min(1), design: z.string().min(1) }).optional(),
  design: designSchema.optional(),
  personality: z.enum(personalityNames).optional(), dials: dialsSchema.partial().default({}), reducedMotion: z.boolean().default(true),
  intent: z.strictObject({ audience: z.string().min(1), workflow: z.string().min(1), frequency: z.enum(['occasional', 'daily', 'continuous']), purpose: z.enum(['operations', 'executive', 'entry', 'consumption']), primaryAction: z.string().min(1), secondaryInformation: z.string().min(1), rationale: z.string().min(1) }),
});
export type Taste = z.infer<typeof tasteSchema>;
export const personalities = {
  'fluent-enterprise': [2, 5, 3, 5, 1], 'clean-saas': [4, 4, 5, 5, 2],
  'dense-operations': [1, 8, 2, 8, 0], 'executive-dashboard': [5, 2, 4, 4, 2], 'minimal-workspace': [1, 2, 1, 2, 0],
} as const;
export function resolveTaste(input: unknown) {
  const config = tasteSchema.parse(input);
  if (config.design && config.personality && config.design.personality !== config.personality) throw new Error('Taste personality conflicts with DESIGN.md');
  const personality = config.design?.personality ?? config.personality ?? (config.intent.purpose === 'executive' ? 'executive-dashboard' : config.intent.frequency === 'continuous' ? 'dense-operations' : config.intent.purpose === 'entry' ? 'minimal-workspace' : 'fluent-enterprise');
  const [designVariance, visualDensity, brandExpression, componentComplexity, motionIntensity] = personalities[personality];
  const dials = dialsSchema.parse({ designVariance, visualDensity, brandExpression, componentComplexity, motionIntensity, ...config.dials });
  const dense = dials.visualDensity >= 7; const spacious = dials.visualDensity <= 3;
  return { ...config, personality, strategy: strategies[personality], dials, tokens: {
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
    pagePadding: dense ? 16 : spacious ? 32 : 24, gap: dense ? 8 : spacious ? 24 : 16,
    controlHeight: dense ? 36 : 44, rowHeight: dense ? 64 : spacious ? 96 : 76,
    titleSize: personality === 'executive-dashboard' ? 30 : dense ? 24 : 26,
    radius: personality === 'minimal-workspace' ? 0 : dials.designVariance >= 4 ? 8 : 4,
    sidebarWidth: personality === 'minimal-workspace' ? 192 : dense ? 200 : 216,
    detailWidth: dials.designVariance >= 5 ? 420 : 360,
    chartShare: dials.designVariance >= 5 ? 0.67 : 0.6,
    showMetadata: dials.componentComplexity >= 4,
    brandRail: dials.brandExpression >= 7,
    transition: !config.reducedMotion && dials.motionIntensity >= 3 ? 'ScreenTransition.Fade' : 'ScreenTransition.None',
  } };
}
export type DesignIntent = ReturnType<typeof resolveTaste>;
export function tasteFormulas(intent: DesignIntent): Record<string, string> {
  const t = intent.tokens;
  return { PF_gap: String(t.gap), PF_spaceMd: '16', PF_spaceLg: String(t.pagePadding), PF_spaceXl: '32', PF_radius: String(t.radius),
    PF_controlHeight: `If(PF_mobile, 44, ${t.controlHeight})`, PF_typeTitle: String(t.titleSize), PF_pagePadding: `If(PF_mobile, 16, ${t.pagePadding})`,
    PF_navWidth: `If(PF_mobile, 0, If(PF_tablet, 64, ${t.sidebarWidth}))`, PF_rowHeight: `If(PF_mobile, 96, ${t.rowHeight})`,
    PF_detailWidth: String(t.detailWidth), PF_chartShare: String(t.chartShare), PF_showMetadata: String(t.showMetadata),
    PF_navigationTransition: t.transition, PF_elevation: 'DropShadow.None',
    ...(t.brandRail ? { PF_rail: 'PF_brand', PF_railText: 'PF_onBrand', PF_railMuted: 'PF_onBrand' } : {}),
  };
}
