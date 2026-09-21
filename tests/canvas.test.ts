import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { parseProject, parseConfigData } from '../src/config/load.js';
import { projectSchema } from '../src/ir/schema.js';
import { compileCanvas, canvasDiagnostics } from '../src/canvas/compile.js';
import { componentCatalog, registry } from '../src/canvas/registry.js';
import { contrast, resolveTheme, responsiveLayout } from '../src/canvas/tokens.js';
import { planCanvasMerge, propertySnapshot, authoringPrerequisites, validateAuthoring } from '../src/canvas/adapter.js';
import { renderShowcase } from '../src/canvas/showcase.js';
import { fixture } from './helpers.js';
import { createPlan } from '../src/planner/dataverse.js';
import { emptyObservation } from './planner-fixtures.js';
const source = readFileSync('examples/canvas-complaints/powercanvas.yaml', 'utf8');
const example = () => parseProject(source);
it('blocks all-scope Dataverse apply when Canvas intent has no executable provider', () => {
  const p = example(); const observation = emptyObservation(p);
  expect(createPlan(p, observation, undefined, 'all').blockers.some(b => b.code === 'PF-CAPABILITY-004')).toBe(true);
  expect(createPlan(p, observation, undefined, 'dataverse').blockers.some(b => b.code === 'PF-CAPABILITY-004')).toBe(false);
});
it('extends the original project without changing legacy project hashes or inventing Canvas binary output', () => {
  expect(fixture()).not.toHaveProperty('canvasApps'); const project = example();
  const compiled = compileCanvas(project, 'complaintPortal'); expect(compiled).toEqual(compileCanvas(project, 'complaintPortal'));
  expect(compiled.authoring.executable).toBe(false); expect(compiled.authoring.nativeYamlEmitted).toBe(false);
  expect(compiled.queries[0]!.formula).toContain('StartsWith'); expect(compiled.queries[0]!.formula).not.toMatch(/ClearCollect|FirstN|CountRows/);
  expect(compiled.queries[0]!.states).toEqual(['loading', 'loaded', 'empty', 'error', 'forbidden']);
  expect(componentCatalog()).toHaveLength(18); expect(Object.keys(propertySnapshot(compiled.tree)).length).toBeGreaterThan(20);
  project.dataverse.tables.complaint!.columns.title!.schemaName = 'pfx_ChangedTitle';
  expect(compileCanvas(project, 'complaintPortal').sourceHash).not.toBe(compiled.sourceHash);
});
it('validates component props, composition, references, versions, policy and unknown fields', () => {
  const mutations = [
    (p: ReturnType<typeof example>) => { p.canvasApps!.complaintPortal!.shell.navigation[0]!.screen = 'missing'; },
    (p: ReturnType<typeof example>) => { p.canvasApps!.complaintPortal!.componentPolicy = 'stableOnly'; },
    (p: ReturnType<typeof example>) => { const s = p.canvasApps!.complaintPortal!.screens.complaints!; if (s.pattern === 'list') s.columns = ['missing']; },
    (p: ReturnType<typeof example>) => { const s = p.canvasApps!.complaintPortal!.screens.complaints!; if (s.pattern === 'list') s.search = { field: 'priority', label: 'Bad search' }; },
    (p: ReturnType<typeof example>) => { const s = p.canvasApps!.complaintPortal!.screens.components!; if (s.pattern === 'custom') s.content[0]!.props = { absoluteX: 10 }; },
    (p: ReturnType<typeof example>) => { const s = p.canvasApps!.complaintPortal!.screens.components!; if (s.pattern === 'custom') s.content[0]!.component = 'Button'; },
    (p: ReturnType<typeof example>) => { const s = p.canvasApps!.complaintPortal!.screens.components!; if (s.pattern === 'custom') s.content.push(structuredClone(s.content[0]!)); },
  ];
  for (const mutate of mutations) { const p = example(); mutate(p); expect(canvasDiagnostics(p).length).toBeGreaterThan(0); }
  const raw = parseConfigData(source) as Record<string, unknown>; expect(() => projectSchema.parse({ ...raw, unknown: true })).toThrow();
  expect(() => parseProject(source.replace('component: Row', 'component: NotAComponent'))).toThrow();
  expect(() => parseProject(source.replace('component: Row', 'component: Row\n            version: 7.0.0'))).toThrow();
  expect(() => parseProject(source.replace('props: { gap: lg }', 'props: { gap: lg, X: 200 }'))).toThrow();
  expect(() => parseProject(source.replace("primary: '#145C4F'", "primary: 'red'"))).toThrow();
});
it('keeps stable IDs through reorder and labels while insertion receives a new identity', () => {
  const p = example(); const before = compileCanvas(p, 'complaintPortal'); const app = p.canvasApps!.complaintPortal!;
  const screen = app.screens.dashboard!; if (screen.pattern !== 'dashboard') throw new Error('fixture');
  screen.cards.reverse(); screen.cards[0]!.label = 'Edited label';
  const after = compileCanvas(p, 'complaintPortal'); expect(Object.keys(propertySnapshot(after.tree)).sort()).toEqual(Object.keys(propertySnapshot(before.tree)).sort());
  screen.cards.push({ key: 'newMetric', label: 'New', value: '0' });
  expect(Object.keys(propertySnapshot(compileCanvas(p, 'complaintPortal').tree))).toHaveLength(Object.keys(propertySnapshot(before.tree)).length + 1);
});
it('resolves light/dark contrast, bounded overrides, density and responsive boundary rules', () => {
  for (const mode of ['light', 'dark'] as const) for (const brand of ['#145C4F', '#2563EB', '#F8FAFC', '#000000']) {
    const t = resolveTheme({ mode, brand: { primary: brand }, density: 'compact' });
    expect(contrast(t.colors.text, t.colors.canvas)).toBeGreaterThanOrEqual(4.5); expect(contrast(t.colors.muted, t.colors.surface)).toBeGreaterThanOrEqual(4.5); expect(contrast(t.colors.onBrand, brand)).toBeGreaterThanOrEqual(4.5); expect(t.controlHeight).toBe(36);
  }
  expect(responsiveLayout(599).navigation).toBe('bottom'); expect(responsiveLayout(600).navigation).toBe('collapsedSidebar'); expect(responsiveLayout(1023).columns).toBe(2); expect(responsiveLayout(1024).navigation).toBe('sidebar');
  expect(() => responsiveLayout(NaN)).toThrow(); expect(() => resolveTheme({ arbitraryToken: '#000000' })).toThrow();
  expect(registry.Button.capabilities.requiresModernControls).toBe(true);
});
it('preserves manual changes, blocks conflicts/removals/adoption and produces no writes on a second identical sync', () => {
  const base = { owned: { label: 'Original', padding: 16 } }; const current = { owned: { label: 'Manual', padding: 16, custom: true }, other: { label: 'Unowned' } };
  expect(planCanvasMerge(base, base, current)).toMatchObject({ executable: true, changes: [], preserved: [{ id: 'owned', property: 'label' }, { id: 'owned', property: 'custom' }] });
  expect(planCanvasMerge(base, { owned: { label: 'Generated', padding: 16 } }, current).executable).toBe(false);
  expect(planCanvasMerge(base, {}, current).executable).toBe(false); expect(planCanvasMerge({}, base, current).executable).toBe(false);
  const changed = { owned: { label: 'Original', padding: 24 } }; const plan = planCanvasMerge(base, changed, base); expect(plan.changes).toEqual([{ id: 'owned', property: 'padding', value: 24 }]);
  expect(planCanvasMerge(changed, changed, changed).changes).toEqual([]);
});
it('fails authoring prerequisites before adapter writes and distinguishes validation from synchronization', async () => {
  const compiled = compileCanvas(example(), 'complaintPortal'); const ownership = { appId: 'owned', solution: 'pfx_Lab', observedRevision: 'r1' };
  const session = { ...ownership, environmentType: 'Default', nonDisposable: true, saved: true, studioOpen: true, coauthoring: true, preparedSources: ['complaint'], revision: 'r1', controls: Object.fromEntries(compiled.requiredControls.map(c => [c, 'discovered-version'])) };
  expect(authoringPrerequisites(compiled, session, ownership).ready).toBe(true);
  const adapter = { inspect: vi.fn(async () => ({ ...session, revision: 'r2' })), validateNative: vi.fn(async () => ({ valid: true, diagnostics: [], artifactHash: 'hash' })), synchronize: vi.fn(async () => ({ revision: 'r3' })) };
  await expect(validateAuthoring(adapter, compiled, ownership)).rejects.toThrow('prerequisites'); expect(adapter.validateNative).not.toHaveBeenCalled(); expect(adapter.synchronize).not.toHaveBeenCalled();
});
it('renders an escaped standalone showcase with explicit approximation and synthetic-data boundaries', () => {
  const p = example(); const dashboard = p.canvasApps!.complaintPortal!.screens.dashboard!; dashboard.title = '</script><script>alert(1)</script>';
  const html = renderShowcase(compileCanvas(p, 'complaintPortal'));
  expect(html).toContain('HTML approximation'); expect(html).toContain('synthetic data'); expect(html).toContain('\\u003c/script>'); expect(html).not.toContain('<script>alert(1)</script>');
});
