import { button, text, stack, row, control, pattern, fxText, fill } from '../patterns.js';
import type { NativeBindings } from '../native-types.js';

/** Read-only analytical composition. Measures are honest snapshots, never invented SLA or resolution rates. */
export function analyticalScreen(name: string, p: string, screen: { title: string; subtitle: string; question: string }, binding: NativeBindings['sources'][string], titleLogical: string, groupLogical: string) {
  const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
  const ds = quote(binding.name); const title = quote(binding.fields[titleLogical]!); const priority = quote(binding.fields[groupLogical]!);
  const detail = `${p}_group`; const selected = `${p}_selected`;
  const refresh = `Set(${p}_loading, true); Set(${p}_error, ""); IfError(Refresh(${ds}), Set(${p}_error, FirstError.Message)); Set(${p}_loading, false)`;
  // Read-through named formula remains live; no ClearCollect truncation or mutations to Dataverse.
  const count = (label: string) => `CountIf(${ds}, ${priority} = LookUp(Choices(${ds}.${priority}), Text(Value) = ${fxText(label)}).Value)`;
  const total = `CountIf(${ds}, true)`;
  // The mobile search is created with its task surface. Reset only while that surface exists.
  const choose = (value: string) => `Set(${detail}, ${value}); Set(${selected}, Blank())`;
  const back = `If(IsBlank(${selected}.${quote(binding.primaryId)}), Reset(${p}_search)); Set(${detail}, Blank()); Set(${selected}, Blank())`;
  const comparison = control(`${p}_comparison`, 'Gallery', { ...fill, Items: '=Table(' + ['High', 'Normal', 'Low'].map(label => `{Label: ${fxText(label)}, Value: ${count(label)}}`).join(', ') + ')', AccessibleLabel: '="Priority comparison; select a measure to inspect its evidence"', TemplateSize: '=92', TemplatePadding: '=0', Height: '=276', TabIndex: '=0' }, [
    text(`${p}_measureLabel`, 'ThisItem.Label & " priority · " & Text(ThisItem.Value)', {X: '=0', Y: '=0', Width: '=Parent.TemplateWidth - 112', Height: '=44', Size: '=PF_typeSection'}),
    button(`${p}_measure`, '"Inspect"', choose('ThisItem.Label'), { AccessibleLabel: '="Inspect " & ThisItem.Label & " priority"', Y: '=0', Width: '=100', Height: '=44', X: '=Parent.TemplateWidth - 100', Appearance: "='ButtonCanvas.Appearance'.Subtle" }),
    control(`${p}_comparison_bar`, 'GroupContainer', { X: '=0', Y: '=56', Width: `=Max(2, (Parent.TemplateWidth - 16) * ThisItem.Value / Max(1, ${total}))`, Height: '=8', Fill: '=PF_brand', DropShadow: '=DropShadow.None' }, [], { Variant: 'ManualLayout' }),
  ], { Variant: 'Vertical' });
  const lead = stack(`${p}_lead`, [text(`${p}_eyebrow`, '"ATTENTION / CURRENT SNAPSHOT"', { Size: '=PF_typeCaption', Color: '=PF_muted', Height: '=28' }), text(`${p}_question`, fxText(screen.question), { Size: '=PF_typeTitle', Height: '=If(PF_mobile, 128, 84)', AutoHeight: '=true' }),
    text(`${p}_leadValue`, `If(${total} = 0, "—", Text(100 * ${count('High')} / ${total}, "0") & "%")`, { Size: '=PF_typeLead', FontWeight: '=FontWeight.Semibold', Height: '=88' }),
    text(`${p}_leadContext`, `Text(${count('High')}) & " of " & Text(${total}) & " accessible complaints are marked High priority."`, { Height: '=64', AutoHeight: '=true' }),
    button(`${p}_inspectHigh`, '"Inspect high-priority evidence"', choose('"High"'), { Width: '=288', Height: '=48', AlignInContainer: '=AlignInContainer.Start', Appearance: "='ButtonCanvas.Appearance'.Primary", FontColor: '=PF_onBrand' }),
  ], { Width: '=If(PF_mobile, Parent.Width, (Parent.Width - PF_spaceXl) * 0.52)', Height: '=If(PF_mobile, 440, 400)', LayoutGap: '=PF_spaceMd', PaddingRight: '=PF_spaceLg' });
  const supporting = stack(`${p}_supporting`, [text(`${p}_comparisonTitle`, '"Where attention sits"', { Size: '=PF_typeSection', FontWeight: '=FontWeight.Semibold', Height: '=32' }), text(`${p}_comparisonHint`, '"Select a priority to inspect the contributing records."', { Color: '=PF_muted', Height: '=48' }), comparison], { Width: '=If(PF_mobile, Parent.Width, (Parent.Width - PF_spaceXl) * 0.48)', Height: '=400' });
  const evidenceItems = `Filter(${ds}, ${priority} = LookUp(Choices(${ds}.${priority}), Text(Value) = ${detail}).Value && StartsWith(${title}, ${p}_search.Value))`;
  const evidence = pattern(`${p}_evidence`, 'DataTable', { label: 'Measure evidence', items: evidenceItems, title: `ThisItem.${title}`, subtitle: `"Created " & Text(ThisItem.'Created On', "dd mmm yyyy")`, badge: `Text(ThisItem.${priority})`, onSelect: `Set(${selected}, ThisItem)`, height: 'Max(240, App.Height - 470)' }, [], { Visible: `=!IsEmpty(${evidenceItems})` });
  const record = stack(`${p}_record`, [button(`${p}_recordBack`, '"Back to evidence"', `Set(${selected}, Blank())`, { Width: '=192' }), text(`${p}_recordTitle`, `${selected}.${title}`, { Height: '=100', AutoHeight: '=true', Size: '=PF_typeTitle' }), text(`${p}_recordPriority`, '"Priority · " & Text(' + selected + '.' + priority + ')', { Height: '=44' }), text(`${p}_recordDescription`, `Coalesce(${selected}.${quote(binding.fields.pfx_experimentdescription ?? 'Description')}, "No description provided")`, { Height: '=180', AutoHeight: '=true' }), text(`${p}_recordBoundary`, '"Read-only evidence. Operational updates belong in Complaint Desk."', { Height: '=64', Color: '=PF_muted' })], { Height: '=560', Visible: `=!IsBlank(${selected}.${quote(binding.primaryId)})`, LayoutOverflowY: '=LayoutOverflow.Scroll' });
  const body = stack(`${p}_brief`, [
    row(`${p}_masthead`, [text(`${p}_brand`, '"SERVICE PERFORMANCE / BRIEFING"', { FillPortions: '=1', Width: '=100', Size: '=PF_typeCaption' }), button(`${p}_refresh`, '"Refresh"', refresh, { Width: '=100', DisplayMode: `=If(${p}_loading, DisplayMode.Disabled, DisplayMode.Edit)` })], { Height: '=56' }),
    pattern(`${p}_pageHeader`, 'PageHeader', { title: fxText(screen.title), subtitle: fxText(screen.subtitle) }, [], { Visible: `=IsBlank(${detail})`, Height: '=If(PF_mobile, 96, 100)' }),
    row(`${p}_overview`, [lead, supporting], { Visible: `=IsBlank(${detail}) && !IsEmpty(${ds})`, Height: '=If(PF_mobile, 800, 420)', LayoutDirection: '=If(PF_mobile, LayoutDirection.Vertical, LayoutDirection.Horizontal)', LayoutAlignItems: '=LayoutAlignItems.Start', LayoutGap: '=PF_spaceXl' }),
    stack(`${p}_drilldown`, [button(`${p}_overviewBack`, '"Back to briefing"', back, { Width: '=192' }), text(`${p}_measureTitle`, `${detail} & " priority · supporting evidence"`, { Size: '=PF_typeTitle', Height: '=88', AutoHeight: '=true' }),
      stack(`${p}_evidenceStage`, [pattern(`${p}_search`, 'SearchBox', {label:'Find evidence'}, [], {OnChange: `=Set(${selected}, Blank())`}), evidence,
        pattern(`${p}_empty`, 'EmptyState', { title: '"No records in this measure"', description: '"Clear the search or return to inspect another priority."', visible: `IsEmpty(${evidenceItems})` })], {Visible: `=IsBlank(${selected}.${quote(binding.primaryId)})`, Height: '=Max(360, App.Height - 380)', LayoutGap: '=PF_spaceMd'}), record], { Visible: `=!IsBlank(${detail})`, Height: '=Max(560, App.Height - 220)' }),
    pattern(`${p}_noData`, 'EmptyState', { title: '"No accessible records"', description: '"There is no evidence to summarize in the current access scope."', visible: `IsEmpty(${ds}) && !${p}_loading && IsBlank(${p}_error)` }),
    pattern(`${p}_loadingState`, 'LoadingState', { label: 'Refreshing live snapshot', visible: `${p}_loading` }),
    pattern(`${p}_errorState`, 'ErrorState', { title: '"Snapshot unavailable"', description: `${p}_error`, visible: `!IsBlank(${p}_error)`, retry: refresh }),
    text(`${p}_scope`, '"LIVE DATAVERSE · YOUR ACCESS\nCurrent priority snapshot, not open backlog, SLA compliance or a historical trend. Large-volume aggregation is not certified."', { Height: '=88', Color: '=PF_muted', Size: '=PF_typeCaption' }),
  ], { Width: '=Parent.Width', Height: '=Parent.Height', PaddingLeft: '=If(PF_mobile, PF_spaceMd, PF_spaceXl)', PaddingRight: '=If(PF_mobile, PF_spaceMd, PF_spaceXl)', PaddingTop: '=PF_spaceMd', PaddingBottom: '=PF_spaceLg', LayoutGap: '=PF_spaceLg', LayoutOverflowY: '=LayoutOverflow.Scroll', Fill: '=PF_canvas' });
  return { Screens: { [name]: { Properties: { Fill: '=PF_canvas', OnVisible: '=If(IsBlank(pf_dark), Set(pf_dark, false)); ' + refresh }, Children: [body] } } };
}
