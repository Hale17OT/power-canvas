import { hashJson } from '../../core/json.js';
import type { NativeFiles, NativeControl } from '../native-types.js';

export interface Node { name: string; path: string; parent: string | undefined; node: NativeControl; depth: number }
export function controls(files: NativeFiles): Node[] {
  const result: Node[] = [];
  const visit = (value: unknown, path: string, parent?: string, depth = 0) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(v => visit(v, path, parent, depth)); return; }
    for (const [name, child] of Object.entries(value)) {
      if (child && typeof child === 'object' && 'Control' in child) { const node = child as NativeControl; result.push({ name, path: `${path}/${name}`, parent, node, depth }); visit(node.Children, `${path}/${name}`, name, depth + 1); }
      else visit(child, `${path}/${name}`, parent, depth);
    }
  };
  visit(files, ''); return result;
}
export interface Finding { rule: string; severity: 'error' | 'warning' | 'review'; path: string; evidence: string; remedy: string }
const functional = /^(On\w+|Items|Item|DataSource|DataField|Default|DefaultSelectedItems|DefaultMode|Value|Update|Required|MaxLength|Visible|DisplayMode)$/;
/** Lexical inventory, not a Power Fx type checker. Keep original formulas for human review. */
export function dependencies(files: NativeFiles) {
  const nodes = controls(files);
  for (const [file, value] of Object.entries(files)) {
    const root = value as { Screens?: Record<string, NativeControl>; App?: NativeControl };
    for (const [name, node] of Object.entries(root.Screens ?? {})) nodes.push({ name, node, path: `${file}/${name}`, parent: undefined, depth: 0 });
    if (root.App) nodes.push({ name: 'App', node: root.App, path: file, parent: undefined, depth: 0 });
  }
  const names = new Set(nodes.map(n => n.name));
  return nodes.flatMap(n => Object.entries(n.node.Properties ?? {}).map(([property, formula]) => {
    const withoutStrings = formula.replace(/"(?:""|[^"])*"/g, '""');
    return { control: n.name, parent: n.parent ?? null, property, formula, behavioral: functional.test(property), references: [...new Set(withoutStrings.match(/\b[A-Za-z_]\w*\b/g) ?? [])].filter(x => names.has(x)),
      calls: [...new Set([...withoutStrings.matchAll(/\b([A-Za-z_]\w*(?:\.Run)?)\s*\(/g)].map(x => x[1]!))],
      writes: [...withoutStrings.matchAll(/\b(Set|UpdateContext|Collect|ClearCollect|Patch|SubmitForm|Remove|RemoveIf)\s*\(\s*([^,;)]+)/g)].map(m => ({ operation: m[1], target: m[2] })),
    };
  }));
}
export function compareBehavior(before: NativeFiles, after: NativeFiles) {
  const current = new Map(dependencies(after).map(d => [`${d.control}.${d.property}`, d]));
  const changed = dependencies(before).filter(d => d.behavioral).filter(d => {
    const next = current.get(`${d.control}.${d.property}`);
    // Navigation transition is a design decision; retain destination and all other behavior.
    const normalize = (s: string) => s.replace(/ScreenTransition\.(None|Fade)|PF_navigationTransition/g, 'TRANSITION');
    return !next || next.parent !== d.parent || normalize(next.formula) !== normalize(d.formula);
  });
  return { preserved: changed.length === 0, changed, limitation: 'Lexical comparison; runtime data, permissions and service behavior require live tests.' };
}
export function auditNative(files: NativeFiles) {
  const nodes = controls(files); const findings: Finding[] = [];
  const add = (rule: string, n: Node, severity: Finding['severity'], evidence: string, remedy: string) => findings.push({ rule, path: n.path, severity, evidence, remedy });
  const modernNames = new Set(['ModernText', 'Button', 'TextInput', 'ModernDropdown', 'Badge', 'Avatar', 'Spinner', 'TabList']);
  let modern = 0; let legacy = 0; let containers = 0; let tokenStyles = 0; let styleProperties = 0;
  const duplicates = nodes.filter((n, index) => nodes.findIndex(other => other.name === n.name) !== index);
  for (const n of duplicates) add('duplicate-identity', n, 'error', n.name, 'Assign stable unique control identities before generation.');
  const formulaSource = (files['App.pa.yaml'] as { App?: { Properties?: { Formulas?: string } } } | undefined)?.App?.Properties?.Formulas ?? '';
  const definedTokens = new Set([...formulaSource.matchAll(/\b(PF_\w+)\s*=/g)].map(m => m[1]));
  for (const n of nodes) {
    const kind = n.node.Control?.split('@')[0] ?? ''; const p = n.node.Properties ?? {};
    if (modernNames.has(kind)) modern++;
    if (/Classic|^Label$|^TextInputClassic$|^DropDown$/.test(kind)) { legacy++; add('modern-equivalent', n, 'error', kind, 'Use a discovered modern equivalent or record a capability-specific exception.'); }
    if (kind === 'Gallery') add('classic-template', n, 'review', kind, 'Verify the mixed row template needs Gallery; record the resolver justification.');
    if (kind === 'GroupContainer' && n.node.Variant === 'AutoLayout') containers++;
    if (['Button', 'TextInput', 'ModernDropdown', 'TabList', 'Gallery', 'Spinner'].includes(kind) && !p.AccessibleLabel) add('accessible-name', n, 'error', kind, 'Provide a meaningful AccessibleLabel.');
    if (kind === 'GroupContainer' && n.node.Variant !== 'AutoLayout' && /^=\d+$/.test(p.X ?? '') && /^=\d+$/.test(p.Y ?? '') && !/bar|overlay/i.test(n.name)) add('fixed-layout', n, 'warning', `${p.X},${p.Y}`, 'Prefer responsive containers; explicitly justify local graphics and overlays.');
    if (p.DropShadow && !/None|PF_elevation/.test(p.DropShadow)) add('shadow-restraint', n, 'warning', p.DropShadow, 'Use elevation only to communicate a layer.');
    for (const [property, value] of Object.entries(p)) {
      for (const token of new Set(value.match(/\bPF_\w+\b/g) ?? [])) if (!definedTokens.has(token)) add('undefined-token', n, 'error', `${property}: ${token}`, 'Define the named Power Fx token in App.Formulas.');
      if (/^(Color|FontColor|Fill|BorderColor|FontSize|Size|Radius\w*|BorderRadius|Padding\w*|LayoutGap)$/.test(property)) {
        styleProperties++; if (/PF_/.test(value) || value === '=0') tokenStyles++;
        else if (/^=\d+$/.test(value) && /Padding|Gap|Size|Radius/.test(property)) add('token-style', n, 'warning', `${property}: ${value}`, 'Use a named spacing, typography or radius token.');
        else if (/ColorValue|RGBA/.test(value)) add('hardcoded-color', n, 'warning', `${property}: ${value}`, 'Move semantic color into App.Formulas.');
      }
    }
    const ancestors: Node[] = []; let parent = n.parent;
    while (parent) { const a = nodes.find(x => x.name === parent); if (!a) break; ancestors.push(a); parent = a.parent; }
    if (p.Fill === '=PF_surface' && ancestors.filter(a => a.node.Properties.Fill === '=PF_surface').length >= 2) add('nested-surfaces', n, 'warning', 'Three nested surface fills', 'Remove redundant card layers.');
    if (kind === 'Gallery') {
      const buttons = nodes.filter(c => c.parent === n.name && c.node.Control === 'Button' && /Primary/.test(c.node.Properties.Appearance ?? ''));
      if (buttons.length > 1) add('row-action-noise', n, 'error', `${buttons.length} primary row actions`, 'Keep one contextual action; use a quiet command group.');
    }
  }
  if (!nodes.length) findings.push({ rule: 'source-empty', severity: 'error', path: '/', evidence: 'No native controls', remedy: 'Audit exported .pa.yaml screen source.' });
  const screens = Object.entries(files).filter(([name]) => name !== 'App.pa.yaml');
  const stateCoverage = screens.map(([screen, value]) => { const source = JSON.stringify(value); return { screen, empty: /empty|IsEmpty/i.test(source), loading: /Spinner|LoadingState/.test(source), error: /IfError|\.Error|ErrorState/.test(source) }; });
  for (const s of stateCoverage) for (const state of ['empty', 'loading', 'error'] as const) if (!s[state]) findings.push({ rule: `state-${state}`, severity: 'warning', path: s.screen, evidence: `No ${state} source evidence`, remedy: `Implement or explicitly justify ${state} handling for this screen.` });
  return { version: '1.0', sourceHash: hashJson(files), metrics: { controls: nodes.length, modern, classicVisual: legacy, autoLayoutContainers: containers, styleProperties, tokenStyles }, findings, stateCoverage, dependencies: dependencies(files), limitations: ['Source heuristics are not runtime accessibility certification.', 'No visual-quality percentage is assigned.', 'Unknown external formulas, permissions and service behavior require runtime review.'] };
}
export interface RuntimeEvidence { sourceHash: string; desktop: boolean; tablet: boolean; narrow: boolean; accessibility: boolean; behavior: boolean; visualReview: boolean }
export function preflight(files: NativeFiles, before?: NativeFiles, evidence?: RuntimeEvidence) {
  const audit = auditNative(files); const behavior = before ? compareBehavior(before, files) : undefined;
  const blockers = audit.findings.filter(f => f.severity === 'error' || f.severity === 'warning');
  if (behavior && !behavior.preserved) blockers.push({ rule: 'functional-preservation', severity: 'error', path: '/', evidence: `${behavior.changed.length} functional properties changed`, remedy: 'Restore behavior or explicitly review the functional migration.' });
  const runtime = ['desktop', 'tablet', 'narrow', 'accessibility', 'behavior', 'visualReview'] as const;
  const pending = runtime.filter(key => !evidence || evidence.sourceHash !== audit.sourceHash || !evidence[key]);
  const checked = (key: typeof runtime[number]) => !pending.includes(key);
  const checks = [
    { name: 'Visual hierarchy and primary action', passed: checked('visualReview'), method: 'native visual review' },
    { name: 'Modern controls and justified classic templates', passed: !blockers.some(b => b.rule === 'modern-equivalent') && checked('visualReview'), method: 'source rules, resolver reasons and native review' },
    { name: 'Responsive containers and fixed-position exceptions', passed: audit.metrics.autoLayoutContainers > 0 && checked('desktop') && checked('tablet') && checked('narrow'), method: 'source inventory and three native viewport tests' },
    { name: 'Tokens, typography, radius and colors', passed: !blockers.some(b => /token|color/.test(b.rule)), method: 'source style/token rules' },
    { name: 'Empty, loading and error states', passed: !blockers.some(b => b.rule.startsWith('state-')), method: 'source evidence; live failure injection is a separate test' },
    { name: 'Disabled actions, validation and unsaved changes', passed: checked('behavior'), method: 'native behavioral tests' },
    { name: 'Component reuse, navigation consistency and PCF necessity', passed: checked('visualReview'), method: 'registry decisions and implementation review' },
    { name: 'Accessibility', passed: checked('accessibility'), method: 'official checks and keyboard/focus review; not full screen-reader certification' },
    { name: 'Functional preservation', passed: (!behavior || behavior.preserved) && checked('behavior'), method: 'formula comparison and native workflows' },
    { name: 'Anti-pattern rules', passed: blockers.length === 0, method: 'deterministic source findings' },
  ];
  return { sourceHash: audit.sourceHash, staticPassed: blockers.length === 0, complete: blockers.length === 0 && pending.length === 0 && checks.every(c => c.passed), blockers, pending, checks, findings: audit.findings, behavior };
}
