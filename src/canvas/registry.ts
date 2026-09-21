import { z } from 'zod';
import { spacing } from './tokens.js';

export const componentNames = ['AppShell', 'Page', 'Stack', 'Row', 'Column', 'Sidebar', 'PageHeader', 'Button', 'TextInput', 'Dropdown', 'Card', 'MetricCard', 'Badge', 'SimpleList', 'LoadingState', 'EmptyState', 'ErrorState', 'RecordForm'] as const;
export type ComponentName = typeof componentNames[number];
export const identity = z.string().regex(/^[a-z][a-zA-Z0-9]*$/).max(64);
const text = z.string().min(1).max(200);
export const actionSchema = z.discriminatedUnion('type', [z.strictObject({ type: z.literal('navigate'), screen: identity }), z.strictObject({ type: z.literal('refresh'), source: identity })]);
const gap = z.enum(Object.keys(spacing) as [keyof typeof spacing, ...(keyof typeof spacing)[]]);
const layout = { gap: gap.default('md'), padding: gap.default('none'), align: z.enum(['stretch', 'start', 'center', 'end']).default('stretch') };
const fields = z.array(identity).min(1).max(6);
const props: Record<ComponentName, z.ZodType> = {
  RecordForm: z.strictObject({ source: identity, fields: z.array(identity).min(1).max(8), revealFields: z.array(identity).max(8), reasonField: identity.optional(), label: text }),
  AppShell: z.strictObject({ title: text }), Page: z.strictObject({ ...layout, label: text }), Stack: z.strictObject(layout), Row: z.strictObject({ ...layout, wrap: z.boolean().default(true) }), Column: z.strictObject(layout),
  Sidebar: z.strictObject({ items: z.array(z.strictObject({ label: text, screen: identity })).min(1).max(6) }),
  PageHeader: z.strictObject({ title: text, subtitle: text.optional() }),
  Button: z.strictObject({ label: text, variant: z.enum(['primary', 'secondary']).default('primary'), disabled: z.boolean().default(false), onSelect: actionSchema }),
  TextInput: z.strictObject({ label: text, placeholder: text.optional(), source: identity, field: identity }),
  Dropdown: z.strictObject({ label: text, options: z.array(text).min(1).max(20), default: text.optional() }),
  Card: z.strictObject({ ...layout, title: text }),
  MetricCard: z.strictObject({ label: text, value: text, supportingText: text.optional() }),
  Badge: z.strictObject({ label: text, tone: z.enum(['neutral', 'success', 'danger']).default('neutral') }),
  SimpleList: z.strictObject({ source: identity, columns: fields, maxVisible: z.int().min(1).max(100).default(25), label: text, state: z.enum(['loading', 'loaded', 'empty', 'error', 'forbidden']).default('loaded') }),
  LoadingState: z.strictObject({ label: text.default('Loading records') }), EmptyState: z.strictObject({ title: text, description: text.optional() }), ErrorState: z.strictObject({ title: text, description: text.optional(), kind: z.enum(['error', 'forbidden']).default('error'), retry: actionSchema.optional() }),
};
const containers = new Set<ComponentName>(['AppShell', 'Page', 'Stack', 'Row', 'Column', 'Card']);
const modern = new Set<ComponentName>(['Button', 'TextInput', 'Dropdown']);
const native: Record<ComponentName, string> = { RecordForm: 'Form', AppShell: 'GroupContainer', Page: 'GroupContainer', Stack: 'GroupContainer', Row: 'GroupContainer', Column: 'GroupContainer', Sidebar: 'Gallery', PageHeader: 'Label', Button: 'Button', TextInput: 'TextInput', Dropdown: 'DropDown', Card: 'GroupContainer', MetricCard: 'GroupContainer', Badge: 'Label', SimpleList: 'Gallery', LoadingState: 'Label', EmptyState: 'GroupContainer', ErrorState: 'GroupContainer' };
export const registry = Object.fromEntries(componentNames.map(name => [name, {
  name, version: '0.1.0', maturity: 'experimental', introducedInPowerCanvas: '0.1.0-dev.1', description: `PFDS ${name} semantic contract`,
  props: props[name], children: containers.has(name), nativeControl: native[name],
  events: name === 'Button' ? ['onSelect'] : name === 'TextInput' ? ['onChange'] : name === 'Dropdown' ? ['onChange'] : name === 'ErrorState' ? ['retry'] : [],
  states: name === 'SimpleList' ? ['loading', 'loaded', 'empty', 'error', 'forbidden'] : name === 'Button' ? ['default', 'hover', 'pressed', 'focused', 'disabled'] : ['default'],
  capabilities: { compact: true, dark: true, multiSelect: false, requiresModernControls: modern.has(name), arbitraryPositioning: false },
}])) as Record<ComponentName, { name: ComponentName; version: string; maturity: 'experimental'; introducedInPowerCanvas: string; description: string; props: z.ZodType; children: boolean; nativeControl: string; events: string[]; states: string[]; capabilities: { compact: boolean; dark: boolean; multiSelect: boolean; requiresModernControls: boolean; arbitraryPositioning: boolean } }>;
export function componentCatalog() { return componentNames.map(name => { const { props: schema, ...contract } = registry[name]; return { ...contract, propsSchema: z.toJSONSchema(schema, { io: 'input' }) }; }); }
