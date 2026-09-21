import { controls, dependencies, compareBehavior, auditNative } from './audit.js';
import type { NativeFiles } from '../native-types.js';
import type { DesignMemory } from './memory.js';
import { button, pattern } from '../patterns.js';

/** Architecture migration is explicit and opt-in through DESIGN.md. Business formulas are never rewritten. */
export function composeMobileTasks(files: NativeFiles, design: DesignMemory) {
  const decisions: { decision: string; desktop: string; mobile: string; reason: string }[] = [];
  if (design.devices?.mobile.composition !== 'MobileTaskFlow') return decisions;
  const nodes = controls(files); const byName = new Map(nodes.map(n => [n.name, n]));
  for (const record of nodes.filter(n => n.name.endsWith('_detail') && byName.has(n.name.replace(/_detail$/, '_form')))) {
    const p = record.name.slice(0, -7);
    const props = (suffix: string) => { const n = byName.get(p + suffix); if (!n) throw new Error(`Missing mobile task slot ${p + suffix}`); return n.node.Properties; };
    const selected = record.node.Properties.Visible!.slice(1);
    const adaptiveTablet = design.devices.tablet.recordPresentation === 'focus-or-split';
    const focused = adaptiveTablet ? '(PF_mobile || (PF_tablet && App.Width < 960))' : 'PF_mobile';
    // Selection already carries a typed Dataverse record. Do not introduce a second identity or copy the form.
    for (const suffix of ['_toolbar', '_tablePanel', '_pageTitle']) {
      const q = props(suffix); q.Visible = `=If(${focused}, !(${selected}), ${q.Visible?.slice(1) ?? 'true'})`;
    }
    props('_header').Visible = '=!PF_mobile';
    props('_pageHeader').Height = `=If(PF_mobile, If(${selected}, 52, 116), 72)`;
    props('_content').PaddingTop = '=If(PF_mobile, PF_spaceSm, PF_spaceLg)';
    props('_body').Height = '=If(PF_mobile, Max(360, App.Height - 280), If(PF_wide, Max(380, App.Height - 280), 420 + If(' + selected + ', 576, 0)))';
    props('_detail').Height = '=If(PF_mobile, Max(360, App.Height - 180), If(PF_wide, Max(380, App.Height - 280), 560))';
    props('_detail').Fill = '=If(PF_mobile, PF_canvas, PF_surface)';
    props('_detail').PaddingLeft = '=If(PF_mobile, 0, PF_spaceLg)';
    props('_detail').PaddingRight = '=If(PF_mobile, 0, PF_spaceLg)';
    if (adaptiveTablet) {
      props('_pageHeader').LayoutJustifyContent = '=If(PF_tablet && App.Width < 960, LayoutJustifyContent.End, LayoutJustifyContent.Start)';
      props('_pageHeader').Height = `=If(PF_mobile, If(${selected}, 52, 116), If(PF_tablet && App.Width < 960 && (${selected}), 52, 72))`;
      props('_body').LayoutDirection = '=If(PF_wide || (PF_tablet && App.Width >= 960), LayoutDirection.Horizontal, LayoutDirection.Vertical)';
      props('_body').Height = '=If(PF_mobile, Max(360, App.Height - 280), Max(380, App.Height - 240))';
      props('_detail').Width = `=If(PF_tablet && App.Width >= 960, Parent.Width * 0.52, ${props('_detail').Width!.slice(1)})`;
      props('_detail').Height = '=If(PF_mobile, Max(360, App.Height - 180), If(PF_tablet, Max(380, App.Height - 240), Max(380, App.Height - 280)))';
      props('_detailTabs').Height = '=If(PF_wide, 40, 52)';
      props('_detailTabs').Size = "=If(PF_wide, 'TabList.Size'.Small, 'TabList.Size'.Large)";
      decisions.push({ decision: 'tablet-record-navigation', desktop: 'split-list-detail', mobile: 'tablet below 960: focused record with Back; wider tablet: compact split', reason: design.devices.tablet.reason });
    }
    const backButton = button(`${p}_recordBack`, '"Back to complaints"', `Set(${p}_selected, Blank()); SetFocus(${p}_new)`, { Visible: '=PF_mobile', Width: '=196', AlignInContainer: '=AlignInContainer.Start', Appearance: "='ButtonCanvas.Appearance'.Subtle", Icon: '="ArrowLeft"', X: '=PF_spaceMd', Y: '=PF_spaceSm' });
    Object.values(files).forEach(value => { const root = value as { Screens?: Record<string, {Children: typeof record.node.Children}> }; for (const screen of Object.values(root.Screens ?? {})) if (JSON.stringify(screen).includes(record.name)) screen.Children!.push(backButton); });
    props('_refresh').Visible = `=If(${focused}, !(${selected}), true)`;
    Object.values(backButton)[0]!.Properties.Visible = `=${focused} && (${selected}) && !${p}_editor`;
    if (adaptiveTablet) Object.assign(Object.values(backButton)[0]!.Properties, { X: '=If(PF_mobile, PF_spaceMd, PF_navWidth + PF_pagePadding)', Y: '=If(PF_mobile, PF_spaceSm, PF_headerHeight + PF_spaceLg)' });
    const panel = byName.get(`${p}_editDialog_panel`)!;
    const children = panel.node.Children!;
    const action = children.find(c => Object.hasOwn(c, `${p}_editorActions`));
    if (!action) throw new Error('Missing editor action slot');
    // Only direct children move. Parent-bound card/input formulas retain their original scope.
    for (const child of children.filter(c => c !== action)) {
      const name = Object.keys(child)[0]!;
      if (dependencies(files).some(d => d.control === name && d.behavioral && /\bParent\b/.test(d.formula))) throw new Error(`Unsafe parent-dependent move: ${name}`);
    }
    const actionNode = Object.values(action)[0]!;
    Object.assign(actionNode.Properties, Object.values(pattern(`${p}_editorActions`, 'MobileBottomActions', {}, actionNode.Children))[0]!.Properties);
    // Three review commands must fit 320px content width at 390px viewport.
    props('_back').Width = '=If(PF_mobile, 60, 88)';
    props('_cancel').Width = '=If(PF_mobile, 76, 88)';
    props('_save').Width = '=If(PF_mobile, 132, 144)';
    const original = { ...panel.node.Properties };
    const task = Object.values(pattern(panel.name, 'MobileTaskForm', {}, [...children.filter(c => c !== action), action], {
      ...original, Width: '=If(PF_mobile, Parent.Width, Min(760, Parent.Width - 32))', Height: '=If(PF_mobile, Parent.Height, Min(760, Parent.Height - 32))',
      PaddingLeft: '=If(PF_mobile, PF_spaceMd, PF_spaceLg)', PaddingRight: '=If(PF_mobile, PF_spaceMd, PF_spaceLg)', PaddingTop: '=If(PF_mobile, PF_spaceMd, PF_spaceLg)', PaddingBottom: '=0', LayoutOverflowY: '=LayoutOverflow.Hide',
    }))[0]!;
    panel.node.Children = task.Children!; panel.node.Properties = task.Properties;
    decisions.push({ decision: 'mobile-record-navigation', desktop: 'split-list-detail', mobile: 'list → record → full-screen task; persistent actions', reason: design.devices.mobile.reason });
  }
  return decisions;
}

/** Exact expected migration, including newly added formulas. No arbitrary formula/parent allowlist. */
export function compareDeviceMigration(before: NativeFiles, after: NativeFiles, design: DesignMemory) {
  const expected = structuredClone(before); composeMobileTasks(expected, design);
  const result = compareBehavior(expected, after);
  const known = new Map(dependencies(expected).filter(d => d.behavioral).map(d => [`${d.control}.${d.property}`, d]));
  const unexpected = dependencies(after).filter(d => d.behavioral && !known.has(`${d.control}.${d.property}`));
  const blockers = auditNative(after).findings.filter(f => f.severity !== 'review');
  return { ...result, preserved: result.preserved && !unexpected.length && !blockers.length, unexpected, blockers, policy: 'Exact deterministic device migration; all existing business formulas and card scopes remain immutable.' };
}
