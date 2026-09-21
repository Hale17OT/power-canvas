import { controls, compareBehavior, dependencies } from './audit.js';
import type { NativeFiles } from '../native-types.js';
import type { DesignMemory } from './memory.js';
import { pattern } from '../patterns.js';

export const refinementPasses = ['layout', 'typeset', 'distill', 'color', 'polish', 'bolder', 'quieter'] as const;
export type RefinementFocus = typeof refinementPasses[number];
export function mergeFormulas(files: NativeFiles, formulas: Record<string, string>) {
  const app = files['App.pa.yaml'] as { App: { Properties: { Formulas: string } } };
  const original = app.App.Properties.Formulas.slice(1).split(';').map(v => v.trim()).filter(Boolean);
  app.App.Properties.Formulas = '=' + [...original.filter(line => !Object.hasOwn(formulas, line.split('=')[0]!.trim())), ...Object.entries(formulas).map(([k, v]) => `${k} = ${v}`)].join(';\n') + ';';
}
/** Native visual variants; all domain formulas and control parents are immutable. */
export function refineNative(input: NativeFiles, memory: DesignMemory, focus: RefinementFocus) {
  const files = structuredClone(input); const nodes = controls(files); const changes: string[] = [];
  const operational = memory.traits.includes('data-first') && memory.primary.density.level >= 7;
  const set = (name: string, props: Record<string, string>) => { const n = nodes.find(n => n.name === name); if (!n) return; for (const [k, v] of Object.entries(props)) if (n.node.Properties[k] !== v) { n.node.Properties[k] = v; changes.push(`${name}.${k}`); } };
  const removeDecorative = (name: string) => {
    const n = nodes.find(n => n.name === name); if (!n || dependencies(files).some(d => d.control === name && d.behavioral || d.references.includes(name))) throw new Error(`Cannot distill dependent control ${name}`);
    const parent = nodes.find(p => p.name === n.parent); if (parent?.node.Children) { parent.node.Children = parent.node.Children.filter(child => !Object.hasOwn(child, name)); changes.push(`removed decorative ${name}`); }
  };
  if (focus === 'typeset') {
    mergeFormulas(files, Object.fromEntries(memory.primary.typography.hierarchy.map(r => [r.token, String(r.size)])));
    if (operational) mergeFormulas(files, { PF_typeLead: '40' });
    for (const n of nodes) {
      if (operational && /_kpi1_value$/.test(n.name)) set(n.name, { Size: '=PF_typeLead', Height: '=56' });
      if (/_detail_title$/.test(n.name)) set(n.name, { Size: '=PF_typeTitle', Height: '=112', AutoHeight: '=true' });
    }
  }
  if (focus === 'layout' && operational) {
    mergeFormulas(files, { PF_navWidth: 'If(PF_mobile, 0, If(PF_tablet, 64, 168))', PF_detailWidth: '400', PF_headerHeight: '48', PF_chartShare: '0.55' });
    for (const n of nodes) {
      const p = n.node.Properties;
      if (/_metrics$/.test(n.name) && n.node.Children?.length === 3) {
        n.node.Children.sort((a, b) => (Object.keys(a)[0]!.endsWith('kpi1') ? -1 : Object.keys(b)[0]!.endsWith('kpi1') ? 1 : 0));
        set(n.name, { Height: '=If(PF_mobile, 288, 128)', LayoutGap: '=0' });
      }
      if (/_kpi[012]$/.test(n.name)) set(n.name, { Width: n.name.endsWith('kpi1') ? '=If(PF_mobile, Parent.Width, Parent.Width * 0.46)' : '=If(PF_mobile, Parent.Width, Parent.Width * 0.27)', Height: n.name.endsWith('kpi1') ? '=128' : '=If(PF_mobile, 80, 128)', Fill: '=PF_canvas', PaddingLeft: '=PF_spaceMd', PaddingTop: '=PF_spaceSm', LayoutGap: '=0' });
      if (/_kpi1$/.test(n.name)) set(n.name, { Fill: '=PF_subtle' });
      if (/_kpi1_label$/.test(n.name)) set(n.name, { Text: '="HIGH PRIORITY"', FontWeight: '=FontWeight.Semibold' });
      if (/_kpi1_caption$/.test(n.name)) set(n.name, { Text: '="Start with these records"' });
      if (/_kpi2_caption$/.test(n.name)) set(n.name, { Text: '="Normal priority"' });
      if (/_pageHeader$/.test(n.name)) set(n.name, { Height: '=If(PF_mobile, 116, 72)' });
      if (/_tablePanel$/.test(n.name)) set(n.name, { Fill: '=PF_canvas' });
      if (/_tableHeader$/.test(n.name)) set(n.name, { Fill: '=PF_canvas', Height: '=32' });
      if (p.TemplateFill) set(n.name, { TemplateFill: p.TemplateFill.replace('PF_surface', 'PF_canvas') });
      if (/_detail$/.test(n.name)) set(n.name, { PaddingLeft: '=PF_spaceLg', PaddingRight: '=PF_spaceLg', PaddingTop: '=PF_spaceLg', LayoutGap: '=PF_spaceMd' });
      if (/_detailFields$/.test(n.name)) set(n.name, { Height: p.Height!.replace('200', '64').replace('480', '360') });
      if (/_detail_title$/.test(n.name)) { const selectedTitle = nodes.find(x => x.name === n.name.replace('_detail_title', '_selectedTitle')); if (selectedTitle) set(n.name, { Text: selectedTitle.node.Properties.Text!, AccessibleLabel: selectedTitle.node.Properties.Text! }); }
      if (/_editDialog_panel$/.test(n.name)) set(n.name, { Height: '=Min(760, Parent.Height - 32)', PaddingTop: '=PF_spaceLg' });
      if (/_editDialog_description$/.test(n.name)) set(n.name, { Height: '=24' });
      if (/_formHeading$/.test(n.name)) set(n.name, { Text: '="Complaint and response"', Color: '=PF_muted', Size: '=PF_typeCaption' });
      if (/_recent_identity$/.test(n.name)) set(n.name, { LayoutJustifyContent: '=LayoutJustifyContent.Center' });
      if (/_recent_select$/.test(n.name)) {
        const label = p.AccessibleLabel!.replace(/^="View " & /, '');
        const limit = 'If(PF_mobile, 42, Max(18, RoundDown(Self.Width / 8, 0)))';
        set(n.name, { Text: `=If(Len(${label}) > ${limit}, Left(${label}, ${limit} - 1) & "…", ${label})` });
      }
      if (/_detailTabs$/.test(n.name)) set(n.name, { Height: '=If(PF_mobile, 52, 40)', Size: "=If(PF_mobile, 'TabList.Size'.Large, 'TabList.Size'.Small)" });
    }
  }
  if (focus === 'distill' && operational) {
    for (const n of nodes) {
      if (/_selectedTitle$/.test(n.name)) {
        const destination = n.name.replace('_selectedTitle', '_detail_title');
        if (!nodes.some(candidate => candidate.name === destination)) throw new Error('Cannot remove record identity without a replacement heading');
        set(destination, { Text: n.node.Properties.Text!, AccessibleLabel: n.node.Properties.Text! });
      }
      if (/_detail_subtitle$|_recordLabel$|_selectedTitle$/.test(n.name)) removeDecorative(n.name);
      if (/_nextText$/.test(n.name) && nodes.some(x => x.name === n.name.replace('_nextText', '_recent'))) removeDecorative(n.name);
      else if (/_nextText$/.test(n.name)) {
        // The existing bound chart provides real scoped priority totals; repeat no instructions.
        set(n.name, { Text: '="Review priority, read the full complaint, and leave a reason with each update."', Height: '=64', Size: '=PF_typeSection', Color: '=PF_text' });
      }
      if (/_next_title$/.test(n.name)) set(n.name, { Text: nodes.some(x => x.name === n.name.replace('_next_title', '_recent')) ? '="Recent changes"' : '="Continue triage"', Size: '=PF_typeSection', Height: '=32' });
      if (/_next_subtitle$/.test(n.name)) removeDecorative(n.name);
      if (/_chart$|_next$/.test(n.name)) set(n.name, { Fill: '=PF_canvas', PaddingTop: '=PF_spaceLg', PaddingLeft: '=PF_spaceMd' });
      if (/_sidebar_section$/.test(n.name)) set(n.name, { Text: '="CASEWORK"' });
      if (/_sidebar_foot$/.test(n.name)) set(n.name, { Text: '="Operations workspace"' });
      if (/_timeline_event$/.test(n.name)) set(n.name, { BorderThickness: '=0', PaddingLeft: '=0', LayoutGap: '=PF_spaceXs' });
    }
  }
  if (focus === 'color' && operational) {
    mergeFormulas(files, { PF_rail: 'PF_surface', PF_railText: 'PF_text', PF_railMuted: 'PF_muted' });
    for (const n of nodes) {
      if (/_sidebar_item\d+$/.test(n.name)) { const selected = /Primary|Secondary/.test(n.node.Properties.Appearance ?? ''); set(n.name, { Appearance: selected ? "='ButtonCanvas.Appearance'.Secondary" : "='ButtonCanvas.Appearance'.Subtle", FontColor: selected ? '=PF_accentText' : '=PF_text', BasePaletteColor: '=PF_brand' }); }
      if (/_filters_\d+$/.test(n.name)) set(n.name, { Appearance: n.node.Properties.Appearance!.replace("'ButtonCanvas.Appearance'.Primary", "'ButtonCanvas.Appearance'.Secondary"), FontColor: '=PF_text' });
      if (/_edit$|_revealButton$|_sort$|_refresh$/.test(n.name)) set(n.name, { Appearance: "='ButtonCanvas.Appearance'.Subtle", FontColor: '=PF_text' });
    }
  }
  if (focus === 'polish' && operational) {
    for (const n of nodes) if (/_status$|_priority$/.test(n.name) && n.node.Control === 'Badge') {
      const p = n.node.Properties; const label = p.Content!;
      n.node.Control = 'ModernText'; n.node.Properties = Object.values(pattern(n.name, 'StatusBadge', { label: label.slice(1), treatment: 'quiet' }, [], p.Visible ? { Visible: p.Visible } : {}))[0]!.Properties;
      changes.push(`${n.name}: quiet text priority (label retained)`);
    }
  }
  // Deliberate no-op: direction-changing passes require a new critique and memory decision.
  const behavior = compareBehavior(input, files);
  if (!behavior.preserved) throw new Error(`Refinement changed ${behavior.changed.length} functional properties`);
  return { files, focus, changes, outcome: changes.length ? 'Refined within design contract' : 'No justified change', behavior };
}
