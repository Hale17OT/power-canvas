import type { NativeFiles, NativeBindings } from '../native-types.js';
import { controls, dependencies } from './audit.js';
import { mergeFormulas } from './refine.js';
import { fxText } from '../patterns.js';

/** Separate, read-only native capture variant. Never a live-integration or publish artifact. */
export function visualFixtureVariant(input: NativeFiles, source: NativeBindings['sources'][string], count: 0 | 1 | 4 | 24) {
  const files = structuredClone(input);
  const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
  const ds = q(source.name); const priority = q(source.fields.pfx_experimentpriority!);
  const rows = Array.from({ length: 24 }, (_, i) => {
    const title = i % 4 === 0 ? `Visual fixture ${i + 1}: A deliberately long record title describing a complex service interruption across multiple locations and teams` : `Visual fixture ${i + 1}: Service request`;
    const name = i % 3 === 0 ? 'Alexandria Montgomery-Wellington · Regional customer experience lead' : `Reviewer ${i + 1}`;
    const props = {
      [q(source.primaryId)]: `GUID("00000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}")`,
      [q(source.fields.pfx_experimenttitle!)]: fxText(title), pfx_experimenttitle: fxText(title),
      [priority]: `LookUp(Choices(${ds}.${priority}), Text(Value) = ${fxText(['High', 'Normal', 'Low'][i % 3]!)}).Value`,
      [q(source.fields.pfx_experimentdescription!)]: i % 5 === 0 ? 'Blank()' : fxText(`${name}. Layout-only fixture; status ${['Awaiting review', 'In progress', 'Complete'][i % 3]}. No business record exists.`),
      [q(source.fields.pfx_experimentresolutionnotes!)]: i % 2 ? 'Blank()' : '"Visual fixture notes"',
      [q(source.fields.createdon!)]: `Date(2026, 9, ${i % 18 + 1})`, [q(source.fields.modifiedon!)]: `Date(2026, 9, ${i % 18 + 1})`, modifiedon: `Date(2026, 9, ${i % 18 + 1})`,
    };
    return '{' + Object.entries(props).map(([key, value]) => `${key}: ${value}`).join(', ') + '}';
  });
  for (const n of controls(files)) {
    for (const [key, formula] of Object.entries(n.node.Properties)) {
      if (key !== 'DataSource') n.node.Properties[key] = formula.replaceAll(new RegExp(ds.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\.)', 'g'), 'PF_fixtureData');
      if (/^On/.test(key) && /\b(?:SubmitForm|Patch|Remove|RemoveIf|Refresh)\s*\(/.test(formula)) n.node.Properties[key] = '=false';
    }
    for (const [key, formula] of Object.entries(n.node.Properties)) n.node.Properties[key] = formula.replace(/\bpf_ds2_\w+_(loading|busy)\b/g, 'false').replace(/\bpf_ds2_\w+_(loadError|error)\b/g, '""');
    if (n.node.Control === 'Form') {
      n.node.Properties.Item = '=Blank()';
      n.node.Properties.OnFailure = '=false'; n.node.Properties.OnSuccess = '=false';
    }
    if (/_new$|_edit$|_save$/.test(n.name)) n.node.Properties.DisplayMode = '=DisplayMode.Disabled';
    if (/_workspaceName$|_brand$/.test(n.name)) n.node.Properties.Text = '="VISUAL FIXTURES · NO WRITES"';
    if (/_pageTitle_title$|_pageHeader_title$/.test(n.name)) n.node.Properties.Text = `="Visual fixtures · " & Text(Coalesce(pf_fixtureCount, ${count}))`;
    if (/_scope$|_dataNote$/.test(n.name)) n.node.Properties.Text = '="VISUAL FIXTURE DATA · NONPERSISTENT. This demonstrates layout resilience, not Dataverse behavior or production scale."';
    if (/_refresh$/.test(n.name)) {
      const prefix=n.name.slice(0,-8);
      n.node.Properties.Text = '="Next volume"'; n.node.Properties.AccessibleLabel = '="Next fixture volume"';
      n.node.Properties.OnSelect = `=Set(pf_fixtureCount, Switch(Coalesce(pf_fixtureCount, ${count}), 24, 1, 1, 4, 4, 0, 24)); Set(${prefix}_selected, Blank())`;
    }
  }
  for (const value of Object.values(files)) {
    const root = value as {Screens?: Record<string, {Properties: Record<string,string>}>};
    for (const screen of Object.values(root.Screens ?? {})) screen.Properties.OnVisible = `=Set(pf_dark, false); Set(pf_fixtureCount, ${count})`;
  }
  mergeFormulas(files, { PF_fixtureRows: `Table(${rows.join(', ')})`, PF_fixtureData: `FirstN(PF_fixtureRows, Coalesce(pf_fixtureCount, ${count}))` });
  if (dependencies(files).some(d => /\b(?:SubmitForm|Patch|Remove|RemoveIf)\s*\(/.test(d.formula))) throw new Error('Visual fixture contains mutation path');
  return {files, evidence: {kind:'visual-fixture', count, persistent:false, businessWrites:0, proves:'Native component layout resilience only', doesNotProve:['Dataverse integration','delegation','permissions','production volume'], publishable:false}};
}
