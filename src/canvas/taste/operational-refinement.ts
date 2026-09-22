import { controls, compareBehavior, dependencies } from './audit.js';
import type { NativeFiles } from '../native-types.js';
import type { DesignMemory } from './memory.js';
import { applySemanticTreatments, type TreatmentRole } from './semantic-treatments.js';


export const refinementPasses = ['layout', 'typeset', 'distill', 'color', 'polish', 'bolder', 'quieter'] as const;
export type RefinementFocus = typeof refinementPasses[number];
export function mergeFormulas(files: NativeFiles, formulas: Record<string, string>) {
  const app = files['App.pa.yaml'] as { App: { Properties: { Formulas: string } } };
  const original = app.App.Properties.Formulas.slice(1).split(';').map(v => v.trim()).filter(Boolean);
  app.App.Properties.Formulas = '=' + [...original.filter(line => !Object.hasOwn(formulas, line.split('=')[0]!.trim())), ...Object.entries(formulas).map(([k, v]) => `${k} = ${v}`)].join(';\n') + ';';
}
export interface OperationalContract {
  roles:Record<string,TreatmentRole>;
  layoutRoles:Record<string,string[]>;
  related:Record<string,Record<string,string>>;
  copy:Record<string,string>;
}
/** Generic operational treatments consume explicit roles and business copy from an adapter. */
export function refineOperational(input: NativeFiles, memory: DesignMemory, focus: RefinementFocus, contract: OperationalContract) {
  const files = structuredClone(input); const nodes = controls(files); const changes: string[] = [];
  const operational = memory.traits.includes('data-first') && memory.primary.density.level >= 7;
  const roles=contract.roles;
  const has=(name:string,role:string)=>contract.layoutRoles[name]?.includes(role)??false;
  const related=(name:string,role:string)=>contract.related[name]?.[role]??'';
  changes.push(...applySemanticTreatments(files,focus,roles,operational));
  const set = (name: string, props: Record<string, string>) => { const n = nodes.find(n => n.name === name); if (!n) return; for (const [k, v] of Object.entries(props)) if (n.node.Properties[k] !== v) { n.node.Properties[k] = v; changes.push(`${name}.${k}`); } };
  const removeDecorative = (name: string) => {
    const n = nodes.find(n => n.name === name); if (!n || dependencies(files).some(d => d.control === name && d.behavioral || d.references.includes(name))) throw new Error(`Cannot distill dependent control ${name}`);
    const parent = nodes.find(p => p.name === n.parent); if (parent?.node.Children) { parent.node.Children = parent.node.Children.filter(child => !Object.hasOwn(child, name)); changes.push(`removed decorative ${name}`); }
  };
  if (focus === 'typeset') {
    mergeFormulas(files, Object.fromEntries(memory.primary.typography.hierarchy.map(r => [r.token, String(r.size)])));
    if (operational) mergeFormulas(files, { PF_typeLead: '40' });
  }
  if (focus === 'layout' && operational) {
    mergeFormulas(files, { PF_navWidth: 'If(PF_mobile, 0, If(PF_tablet, 64, 168))', PF_detailWidth: '400', PF_headerHeight: '48', PF_chartShare: '0.55' });
    for (const n of nodes) {
      const p = n.node.Properties;
      if (has(n.name, 'metrics') && n.node.Children?.length === 3) {
        n.node.Children.sort((a, b) => (has(Object.keys(a)[0]!, 'lead-metric') ? -1 : has(Object.keys(b)[0]!, 'lead-metric') ? 1 : 0));
        set(n.name, { Height: '=If(PF_mobile, 288, 128)', LayoutGap: '=0' });
      }
      if (has(n.name, 'metric')) set(n.name, { Width: has(n.name, 'lead-metric') ? '=If(PF_mobile, Parent.Width, Parent.Width * 0.46)' : '=If(PF_mobile, Parent.Width, Parent.Width * 0.27)', Height: has(n.name, 'lead-metric') ? '=128' : '=If(PF_mobile, 80, 128)', Fill: '=PF_canvas', PaddingLeft: '=PF_spaceMd', PaddingTop: '=PF_spaceSm', LayoutGap: '=0' });
      if (has(n.name, 'lead-metric')) set(n.name, { Fill: '=PF_subtle' });
      if (has(n.name, 'lead-label')) set(n.name, { Text: contract.copy.leadLabel!, FontWeight: '=FontWeight.Semibold' });
      if (has(n.name, 'lead-caption')) set(n.name, { Text: contract.copy.leadCaption! });
      if (has(n.name, 'secondary-caption')) set(n.name, { Text: contract.copy.secondaryCaption! });
      if (has(n.name, 'page-header')) set(n.name, { Height: '=If(PF_mobile, 116, 72)' });
      if (has(n.name, 'table-panel')) set(n.name, { Fill: '=PF_canvas' });
      if (has(n.name, 'table-header')) set(n.name, { Fill: '=PF_canvas', Height: '=32' });
      if (p.TemplateFill) set(n.name, { TemplateFill: p.TemplateFill.replace('PF_surface', 'PF_canvas') });
      if (has(n.name, 'detail')) set(n.name, { PaddingLeft: '=PF_spaceLg', PaddingRight: '=PF_spaceLg', PaddingTop: '=PF_spaceLg', LayoutGap: '=PF_spaceMd' });
      if (has(n.name, 'detail-fields')) set(n.name, { Height: p.Height!.replace('200', '64').replace('480', '360') });
      if (has(n.name, 'detail-title')) { const selectedTitle = nodes.find(x => x.name === related(n.name, 'redundantIdentity')); if (selectedTitle) set(n.name, { Text: selectedTitle.node.Properties.Text!, AccessibleLabel: selectedTitle.node.Properties.Text! }); }
      if (has(n.name, 'edit-panel')) set(n.name, { Height: '=Min(760, Parent.Height - 32)', PaddingTop: '=PF_spaceLg' });
      if (has(n.name, 'edit-description')) set(n.name, { Height: '=24' });
      if (has(n.name, 'form-heading')) set(n.name, { Text: contract.copy.formHeading!, Color: '=PF_muted', Size: '=PF_typeCaption' });
      if (has(n.name, 'row-identity')) set(n.name, { LayoutJustifyContent: '=LayoutJustifyContent.Center' });
      if (has(n.name, 'row-select')) {
        const label = p.AccessibleLabel!.replace(/^="View " & /, '');
        const limit = 'If(PF_mobile, 42, Max(18, RoundDown(Self.Width / 8, 0)))';
        set(n.name, { Text: `=If(Len(${label}) > ${limit}, Left(${label}, ${limit} - 1) & "…", ${label})` });
      }
      if (has(n.name, 'detail-tabs')) set(n.name, { Height: '=If(PF_mobile, 52, 40)', Size: "=If(PF_mobile, 'TabList.Size'.Large, 'TabList.Size'.Small)" });
    }
  }
  if (focus === 'distill' && operational) {
    for (const n of nodes) {
      if (has(n.name, 'redundant-identity')) {
        const destination = related(n.name, 'detailTitle');
        if (!nodes.some(candidate => candidate.name === destination)) throw new Error('Cannot remove record identity without a replacement heading');
        set(destination, { Text: n.node.Properties.Text!, AccessibleLabel: n.node.Properties.Text! });
      }
      if (has(n.name, 'redundant-detail')) removeDecorative(n.name);
      if (has(n.name, 'continuation-text') && nodes.some(x => x.name === related(n.name, 'recentRecords'))) removeDecorative(n.name);
      else if (has(n.name, 'continuation-text')) {
        // The existing bound chart provides real scoped priority totals; repeat no instructions.
        set(n.name, { Text: contract.copy.continuation!, Height: '=64', Size: '=PF_typeSection', Color: '=PF_text' });
      }
      if (has(n.name, 'continuation-title')) set(n.name, { Text: nodes.some(x => x.name === related(n.name, 'recentRecords')) ? contract.copy.recentTitle! : contract.copy.continuationTitle!, Size: '=PF_typeSection', Height: '=32' });
      if (has(n.name, 'redundant-continuation')) removeDecorative(n.name);
      if (has(n.name, 'content-panel')) set(n.name, { Fill: '=PF_canvas', PaddingTop: '=PF_spaceLg', PaddingLeft: '=PF_spaceMd' });
      if (has(n.name, 'navigation-section')) set(n.name, { Text: contract.copy.navigationSection! });
      if (has(n.name, 'navigation-footer')) set(n.name, { Text: contract.copy.navigationFooter! });
      if (has(n.name, 'timeline-event')) set(n.name, { BorderThickness: '=0', PaddingLeft: '=0', LayoutGap: '=PF_spaceXs' });
    }
  }
  if (focus === 'color' && operational) {
    mergeFormulas(files, { PF_rail: 'PF_surface', PF_railText: 'PF_text', PF_railMuted: 'PF_muted' });
  }
  // Deliberate no-op: direction-changing passes require a new critique and memory decision.
  const behavior = compareBehavior(input, files);
  if (!behavior.preserved) throw new Error(`Refinement changed ${behavior.changed.length} functional properties`);
  return { files, focus, changes, outcome: changes.length ? 'Refined within design contract' : 'No justified change', behavior };
}
