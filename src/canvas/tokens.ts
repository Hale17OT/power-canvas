import { z } from 'zod';
import { PowerCanvasError } from '../core/errors.js';

export const themeSchema = z.strictObject({
  mode: z.enum(['light', 'dark']).default('light'), density: z.enum(['comfortable', 'compact']).default('comfortable'),
  brand: z.strictObject({ primary: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).default({ primary: '#145C4F' }),
  font: z.enum(['Segoe UI', 'Arial']).default('Segoe UI'), radius: z.enum(['square', 'soft', 'rounded']).default('soft'),
});
export type Theme = z.infer<typeof themeSchema>;
export const spacing = { none: 0, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const breakpoints = { compact: 0, medium: 600, wide: 1024 } as const;
function luminance(color: string): number {
  const rgb = [1, 3, 5].map(index => { const value = parseInt(color.slice(index, index + 2), 16) / 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
export function contrast(a: string, b: string): number { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0]! + 0.05) / (values[1]! + 0.05); }
export function resolveTheme(input: unknown) {
  const theme = themeSchema.parse(input); const dark = theme.mode === 'dark';
  const onBrand = contrast(theme.brand.primary, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#111827';
  if (contrast(theme.brand.primary, onBrand) < 4.5) throw new PowerCanvasError('PF-CANVAS-001', 'Brand cannot meet the foreground contrast contract.', 'Choose a brand color with 4.5:1 text contrast.');
  return { ...theme, colors: { canvas: dark ? '#101820' : '#F4F7F8', surface: dark ? '#1A2632' : '#FFFFFF', text: dark ? '#F3F6FA' : '#152530', muted: dark ? '#BCC9D3' : '#465B68', border: dark ? '#8297A7' : '#6B7F8C', brand: theme.brand.primary, onBrand, focus: dark ? '#8BD6FF' : '#005A9E', danger: dark ? '#FFADB4' : '#A4262C', success: dark ? '#92D8B4' : '#145C4F' },
    spacing, typography: { family: theme.font, body: 16, caption: 14, heading: 28, metric: 32, lineHeight: 1.5, weight: { regular: 400, semibold: 600 } },
    radiusPx: { square: 0, soft: 8, rounded: 16 }[theme.radius], borderWidth: 1, controlHeight: theme.density === 'compact' ? 36 : 44,
    elevation: { none: 'none', card: dark ? '0 2px 6px #00000055' : '0 2px 8px #15253012' },
    icons: { menu: 'Hamburger', refresh: 'Reload', next: 'ChevronRight' }, motion: { durationMs: 120, reducedMotionMs: 0 }, layers: { content: 0, navigation: 10, overlay: 100 }, breakpoints };
}
export function responsiveLayout(width: number) {
  if (!Number.isFinite(width) || width < 240) throw new PowerCanvasError('PF-CANVAS-002', 'Viewport width is invalid.', 'Use a finite width of at least 240 pixels.');
  return width < breakpoints.medium ? { size: 'compact', navigation: 'bottom', direction: 'column', columns: 1, padding: 'md' } as const
    : width < breakpoints.wide ? { size: 'medium', navigation: 'collapsedSidebar', direction: 'column', columns: 2, padding: 'lg' } as const
      : { size: 'wide', navigation: 'sidebar', direction: 'row', columns: 3, padding: 'xl' } as const;
}
