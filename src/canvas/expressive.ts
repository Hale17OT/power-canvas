import { z } from 'zod';
import { button, control, text, stack, row, surface, fxText } from './patterns.js';
import type { Control, Props } from './patterns.js';

const fx = z.string().min(1).max(20000);
const label = z.string().min(1).max(120);
const command = z.strictObject({ label, action: fx, disabled: fx.default('false') });
const navigation = z.strictObject({ items: z.array(command.extend({ selected: fx.default('false') })).min(1).max(12), disabled: fx.default('false') });
const overlay = z.strictObject({ title: fx, visible: fx, close: fx, returnFocus: z.string().regex(/^[A-Za-z_]\w*$/),
  returnFocusMobile: z.string().regex(/^[A-Za-z_]\w*$/).optional(),
  variant: z.enum(['standard', 'compact']).default('standard'), scrim: z.enum(['subtle', 'standard', 'strong']).default('standard'),
  surface: z.enum(['flat', 'standard', 'elevated', 'bordered', 'inset', 'dark', 'highContrast']).default('standard') });
const richList = z.strictObject({ label, items: fx, title: fx, subtitle: fx, status: fx, onSelect: fx, selected: fx.default('false'), disabled: fx.default('false'), variant: z.enum(['compact', 'comfortable', 'cards']).default('comfortable'), maxItems: z.number().int().min(1).max(200).default(50) });
export const expressiveContracts = {
  TopNavigation: navigation.extend({ variant: z.enum(['standard', 'underlined']).default('standard') }),
  BottomNavigation: navigation.extend({ items: navigation.shape.items.max(5), variant: z.enum(['standard', 'compact']).default('standard') }),
  NavigationDrawer: navigation.extend({ open: fx, close: fx, returnFocus: z.string().regex(/^[A-Za-z_]\w*$/), title: label, variant: z.enum(['standard', 'compact']).default('standard') }),
  CompactSidebar: navigation.extend({ title: label, variant: z.enum(['standard', 'grouped']).default('standard') }),
  SideSheet: overlay, BottomSheet: overlay, FullScreenTask: overlay, ContextPanel: overlay,
  OverflowMenu: z.strictObject({ label, open: fx, toggle: fx, close: fx, actions: z.array(command).min(1).max(8) }),
  BulkActionBar: z.strictObject({ count: fx, clear: fx, actions: z.array(command).min(1).max(3) }),
  FilterChips: z.strictObject({ label, options: z.array(z.strictObject({ label, selected: fx, action: fx })).min(1).max(8), reset: fx, disabled: fx.default('false') }),
  FilterPanel: z.strictObject({ title: fx, visible: fx, apply: fx, reset: fx, variant: z.enum(['inline', 'panel']).default('panel') }),
  RichList: richList,
  GroupedList: richList.extend({ group: fx, groupStart: fx }),
  RecordHeader: z.strictObject({ title: fx, subtitle: fx, metadata: fx.default('""'), variant: z.enum(['compact', 'standard', 'editorial', 'mobile']).default('standard') }),
  SectionHeader: z.strictObject({ title: fx, subtitle: fx.default('""'), variant: z.enum(['compact', 'standard', 'numbered']).default('standard'), index: z.number().int().positive().default(1) }),
  Skeleton: z.strictObject({ label, visible: fx, rows: z.number().int().min(1).max(8).default(3), variant: z.enum(['content', 'table']).default('content') }),
  Snackbar: z.strictObject({ message: fx, visible: fx, dismiss: fx, action: command.optional(), variant: z.enum(['inline', 'floating']).default('floating') }),
  TaskForm: z.strictObject({ title: fx, variant: z.enum(['single-column', 'two-column', 'sectioned', 'wizard']).default('single-column'), step: fx.default('1'), next: fx.default('false'), back: fx.default('false') }),
} as const;
export type ExpressivePattern = keyof typeof expressiveContracts;
export const expressiveVariants = Object.fromEntries(Object.entries(expressiveContracts).map(([name, schema]) => [name, 'variant' in schema.shape ? (schema.shape.variant as z.ZodDefault<z.ZodEnum>).unwrap().options : ['standard']])) as Record<ExpressivePattern, string[]>;

/** Native composed patterns. Host owns data, state, commit, validation and authorization. No tenant API calls. */
export function expressivePattern(name: string, kind: ExpressivePattern, input: unknown, children: Control[] = [], properties: Props = {}): Control {
  const p = expressiveContracts[kind].parse(input) as Record<string, unknown>;
  const s = (k: string) => String(p[k]);
  const variant = p.variant ?? 'standard';
  const commands = (p.actions ?? p.items ?? []) as z.infer<typeof command>[];
  const actions = () => commands.map((a, i) => button(`${name}_action${i}`, fxText(a.label), a.action, { Height: '=44', Width: '=If(PF_mobile, Parent.Width, 160)', DisplayMode: `=If(${a.disabled}, DisplayMode.Disabled, DisplayMode.Edit)` }));
  let result: Control;
  switch (kind) {
    case 'TopNavigation': case 'BottomNavigation': case 'CompactSidebar': case 'NavigationDrawer': {
      const vertical = kind === 'CompactSidebar' || kind === 'NavigationDrawer';
      const items = p.items as z.infer<typeof navigation>['items'];
      const buttons = items.map((item, i) => button(`${name}_destination${i}`, fxText(item.label), item.action, {
        Height: '=44', Width: vertical ? '=Parent.Width' : `=Max(44, (Parent.Width - ${(items.length - 1) * 4}) / ${items.length})`,
        AccessibleLabel: `=${fxText(item.label)} & If(${item.selected}, " (current)", "")`,
        Appearance: `=If(${item.selected}, 'ButtonCanvas.Appearance'.Secondary, 'ButtonCanvas.Appearance'.Subtle)`,
        FontColor: '=PF_text', BorderColor: '=PF_brand', BorderThickness: variant === 'underlined' ? `=If(${item.selected}, 2, 0)` : '=0',
        DisplayMode: `=If((${s('disabled')}) || (${item.disabled}), DisplayMode.Disabled, DisplayMode.Edit)`,
      }));
      if (vertical) {
        const body = [text(`${name}_label`, fxText(s('title')), { Size: '=PF_typeSection', FontWeight: '=FontWeight.Semibold', Height: '=40' }), ...buttons];
        if (kind === 'NavigationDrawer') body.push(button(`${name}_close`, '"Close navigation"', `${s('close')}; SetFocus(${s('returnFocus')})`, { Width: '=Parent.Width', Height: '=44' }));
        if (variant === 'grouped') body.splice(1, 0, text(`${name}_group`, '"DESTINATIONS"', { Size: '=PF_typeCaption', Color: '=PF_muted' }));
        const panel = stack(kind === 'NavigationDrawer' ? `${name}_panel` : name, body, { ...surface, Width: variant === 'compact' ? '=Min(224, Parent.Width - 24)' : '=Min(264, Parent.Width - 24)', Height: '=Parent.Height', PaddingLeft: '=16', PaddingRight: '=16', LayoutOverflowY: '=LayoutOverflow.Scroll' });
        result = kind === 'NavigationDrawer' ? stack(name, [panel], { Width: '=Parent.Width', Height: '=Parent.Height', X: '=0', Y: '=0', Fill: '=PF_scrimSubtle', Visible: `=${s('open')}`, LayoutAlignItems: '=LayoutAlignItems.Start' }) : panel;
      } else result = row(name, buttons, { Fill: '=PF_surface', Height: kind === 'BottomNavigation' ? '=72' : '=56', PaddingBottom: kind === 'BottomNavigation' ? '=16' : '=0', LayoutGap: '=4', LayoutWrap: '=false' });
      break;
    }
    case 'SideSheet': case 'BottomSheet': case 'FullScreenTask': case 'ContextPanel': {
      const full = kind === 'FullScreenTask'; const bottom = kind === 'BottomSheet'; const context = kind === 'ContextPanel';
      const dark = p.surface === 'dark' || p.surface === 'highContrast';
      const themedChildren=structuredClone(children);
      const recolor=(nodes:Control[])=>{for(const c of nodes)for(const n of Object.values(c)){if(n.Control==='ModernText')n.Properties.Color='=Color.White';if(n.Children)recolor(n.Children);}};
      if(dark)recolor(themedChildren);
      const restore=p.returnFocusMobile?`If(PF_mobile, SetFocus(${s('returnFocusMobile')}), SetFocus(${s('returnFocus')}))`:`SetFocus(${s('returnFocus')})`;
      const close = button(`${name}_close`, '"Close"', `${s('close')}; ${restore}`, { Height: '=44', Width: '=88', ...(dark ? {FontColor:'=Color.White'} : {}) });
      const panel = stack(`${name}_panel`, [row(`${name}_heading`, [text(`${name}_title`, s('title'), { FillPortions: '=1', Width: '=0', Height: '=40', Size: '=PF_typeSection', ...(dark ? {Color:'=Color.White'} : {}) }), close], { Height: '=48' }), stack(`${name}_body`, themedChildren, { FillPortions: '=1', Height: '=0', LayoutOverflowY: '=LayoutOverflow.Scroll' })], {
        ...surface, Fill: dark ? '=ColorValue("#111722")' : p.surface === 'inset' ? '=PF_subtle' : '=PF_surface',
        BorderColor: dark ? '=Color.White' : '=PF_border', BorderThickness: p.surface === 'bordered' || p.surface === 'highContrast' ? '=2' : '=0',
        DropShadow: p.surface === 'elevated' ? '=DropShadow.Regular' : '=DropShadow.None',
        Width: full || bottom ? '=Parent.Width' : `=Min(${variant === 'compact' ? 360 : 560}, Parent.Width)`,
        Height: full || kind === 'SideSheet' ? '=Parent.Height' : `=Min(${variant === 'compact' ? 320 : 520}, Parent.Height - 16)`,
        AlignInContainer: full || bottom ? '=AlignInContainer.Stretch' : '=AlignInContainer.End',
      });
      result = stack(name, [panel], { X: '=0', Y: '=0', Width: '=Parent.Width', Height: '=Parent.Height', Visible: `=${s('visible')}`, Fill: full || context ? '=Color.Transparent' : `=PF_scrim${s('scrim')[0]!.toUpperCase() + s('scrim').slice(1)}`, LayoutJustifyContent: bottom ? '=LayoutJustifyContent.End' : '=LayoutJustifyContent.Start', LayoutAlignItems: '=LayoutAlignItems.End', LayoutGap: '=0' }); break;
    }
    case 'OverflowMenu': result = stack(name, [button(`${name}_toggle`, fxText(s('label')), s('toggle'), { Width: '=Parent.Width', Height: '=44' }), stack(`${name}_menu`, [...actions(), button(`${name}_close`, '"Close menu"', s('close'), { Width: '=Parent.Width', Height: '=44' })], { ...surface, Visible: `=${s('open')}`, Height: `=${(commands.length + 1) * 52 + 32}`, LayoutOverflowY: '=LayoutOverflow.Scroll' })], { Height: `=If(${s('open')}, ${(commands.length + 2) * 52 + 32}, 44)` }); break;
    case 'BulkActionBar': result = row(name, [text(`${name}_count`, `Text(${s('count')}) & " selected"`, { Width: '=140', Height: '=44' }), ...actions(), button(`${name}_clear`, '"Clear selection"', s('clear'), { Height: '=44', Width: '=160' })], { ...surface, Visible: `=${s('count')} > 0`, Height: '=If(PF_mobile, 264, 92)', LayoutDirection: '=If(PF_mobile, LayoutDirection.Vertical, LayoutDirection.Horizontal)' }); break;
    case 'FilterChips': result = row(name, [...(p.options as {label:string;selected:string;action:string}[]).map((o, i) => button(`${name}_chip${i}`, fxText(o.label), o.action, { AccessibleLabel: `=${fxText(s('label') + ': ' + o.label)} & If(${o.selected}, " selected", "")`, Appearance: `=If(${o.selected}, 'ButtonCanvas.Appearance'.Secondary, 'ButtonCanvas.Appearance'.Subtle)`, DisplayMode: `=If(${s('disabled')}, DisplayMode.Disabled, DisplayMode.Edit)`, Height: '=44', Width: '=136', BorderRadius: '=22' })), button(`${name}_reset`, '"Reset filters"', s('reset'), { Height: '=44', Width: '=136', DisplayMode: `=If(${s('disabled')}, DisplayMode.Disabled, DisplayMode.Edit)` })], { LayoutWrap: '=true', Height: `=Max(44, RoundUp(${(p.options as unknown[]).length + 1} / Max(1, RoundDown(Parent.Width / 144, 0)), 0) * 52)` }); break;
    case 'FilterPanel': result = stack(name, [text(`${name}_title`, s('title'), { Size: '=PF_typeSection', Height: '=32' }), ...children, row(`${name}_actions`, [button(`${name}_apply`, '"Apply filters"', s('apply'), { Height: '=44' }), button(`${name}_reset`, '"Reset"', s('reset'), { Height: '=44' })], { Height: '=48' })], { ...(variant === 'panel' ? surface : {}), Height: '=Min(420, Parent.Height)', Visible: `=${s('visible')}`, LayoutOverflowY: '=LayoutOverflow.Scroll' }); break;
    case 'RichList': case 'GroupedList': {
      const groupHeight = kind === 'GroupedList' ? 32 : 0; const height = variant === 'compact' ? 76 : variant === 'cards' ? 156 : 108;
      result = control(name, 'Gallery', { Width: '=Parent.Width', Height: '=Parent.Height', Items: `=FirstN(${s('items')}, ${s('maxItems')})`, AccessibleLabel: `=${fxText(s('label'))}`, TemplateSize: `=${height + groupHeight}`, TemplatePadding: variant === 'cards' ? '=8' : '=0', TemplateFill: `=If(${s('selected')}, PF_selected, PF_surface)`, TabIndex: '=0', WrapCount: variant === 'cards' ? '=If(PF_wide, 2, 1)' : '=1' }, [stack(`${name}_row`, [
        ...(kind === 'GroupedList' ? [text(`${name}_group`, s('group'), { Height: '=32', Visible: `=${s('groupStart')}`, FontWeight: '=FontWeight.Semibold' })] : []),
        button(`${name}_select`, s('title'), s('onSelect'), { Height: '=44', Width: '=Parent.Width', Align: '=Align.Left', Appearance: "='ButtonCanvas.Appearance'.Subtle", DisplayMode: `=If(${s('disabled')}, DisplayMode.Disabled, DisplayMode.Edit)` }),
        text(`${name}_summary`, `${s('subtitle')} & " · " & ${s('status')}`, { Size: '=PF_typeCaption', Color: '=PF_muted', Height: variant === 'compact' ? '=28' : '=48' }),
      ], { Width: '=Parent.TemplateWidth', Height: `=${height + groupHeight}`, LayoutGap: '=0', PaddingLeft: '=12', PaddingRight: '=12' })], { Variant: 'Vertical' }); break;
    }
    case 'RecordHeader': case 'SectionHeader': {
      const editorial = variant === 'editorial'; const compact = variant === 'compact';
      result = stack(name, [
        ...(editorial ? [text(`${name}_eyebrow`, s('metadata'), { Size: '=PF_typeCaption', Color: '=PF_muted' })] : []),
        text(`${name}_title`, variant === 'numbered' ? `${fxText(s('index') + ' / ')} & ${s('title')}` : s('title'), { Size: editorial ? '=32' : compact ? '=18' : '=24', Height: editorial ? '=80' : '=40', FontWeight: '=FontWeight.Semibold' }),
        text(`${name}_subtitle`, s('subtitle'), { Color: '=PF_muted', Height: '=40' }),
        ...(kind === 'RecordHeader' && !editorial && !compact ? [text(`${name}_metadata`, s('metadata'), { Size: '=PF_typeCaption', Color: '=PF_muted' })] : []),
      ], { Height: editorial ? '=160' : compact ? '=88' : '=128', LayoutGap: '=4', ...(variant === 'numbered' ? {BorderColor:'=PF_border',BorderThickness:'=1',PaddingLeft:'=16'} : {}) }); break;
    }
    case 'Skeleton': result = stack(name, [text(`${name}_label`, fxText(s('label')), { Height: '=32' }), ...Array.from({length:Number(p.rows)}, (_, i) => row(`${name}_row${i}`, Array.from({length:variant === 'table' ? 3 : 1}, (_, j) => control(`${name}_block${i}_${j}`, 'GroupContainer', { Width: variant === 'table' ? '=(Parent.Width - 16) / 3' : i % 2 ? '=Parent.Width * 0.7' : '=Parent.Width', Height: '=16', Fill: '=PF_subtle', DropShadow: '=DropShadow.None' }, [], { Variant:'ManualLayout' })), { Height:'=36' }))], { Visible: `=${s('visible')}`, Height: `=${Number(p.rows) * 44 + 40}` }); break;
    case 'Snackbar': {
      const a = p.action as z.infer<typeof command> | undefined;
      result = row(name, [text(`${name}_message`, s('message'), { FillPortions:'=1',Width:'=0',Height:'=56' }), ...(a ? [button(`${name}_action`,fxText(a.label),a.action,{Height:'=44',Width:'=128',DisplayMode:`=If(${a.disabled}, DisplayMode.Disabled, DisplayMode.Edit)`})] : []),button(`${name}_dismiss`,'"Dismiss"',s('dismiss'),{Height:'=44',Width:'=96'})], {...surface,Visible:`=${s('visible')}`,Height:'=If(PF_mobile, 176, 88)',LayoutDirection:'=If(PF_mobile, LayoutDirection.Vertical, LayoutDirection.Horizontal)',...(variant==='floating'?{BorderThickness:'=1',BorderColor:'=PF_border',X:'=16',Y:'=Parent.Height - Self.Height - 16',Width:'=Parent.Width - 32'}:{})});break;
    }
    case 'TaskForm': {
      const fields = children.map((child,i)=>{const c=structuredClone(child);Object.values(c)[0]!.Properties.Width=variant==='two-column'?'=If(PF_mobile, Parent.Width, (Parent.Width - PF_gap) / 2)':'=Parent.Width';if(variant==='wizard')Object.values(c)[0]!.Properties.Visible=`=${s('step')} = ${i+1}`;return c;});
      result=stack(name,[text(`${name}_title`,s('title'),{Size:'=PF_typeSection',Height:'=40'}),stack(`${name}_fields`,fields,{FillPortions:'=1',Height:'=0',LayoutDirection:variant==='two-column'?'=If(PF_mobile, LayoutDirection.Vertical, LayoutDirection.Horizontal)':'=LayoutDirection.Vertical',LayoutWrap:variant==='two-column'?'=true':'=false',LayoutOverflowY:'=LayoutOverflow.Scroll',LayoutGap:variant==='sectioned'?'=32':'=16'}),...(variant==='wizard'?[row(`${name}_steps`,[button(`${name}_back`,'"Previous"',s('back'),{Height:'=44'}),text(`${name}_progress`,`"Step " & Text(${s('step')}) & " of ${children.length}"`,{Width:'=120',Height:'=44'}),button(`${name}_next`,'"Continue"',s('next'),{Height:'=44'})],{Height:'=48'})]:[])],{Height:'=Parent.Height'});break;
    }
  }
  Object.assign(Object.values(result)[0]!.Properties, properties);
  return result;
}
