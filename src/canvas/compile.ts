import type { Project } from '../ir/schema.js';
import type { Diagnostic } from '../core/errors.js';
import { PowerCanvasError } from '../core/errors.js';
import { hashJson } from '../core/json.js';
import { canvasAppSchema } from './schema.js';
import type { CanvasApp, ComponentNode } from './schema.js';
import { registry } from './registry.js';
import type { ComponentName } from './registry.js';
import { resolveTheme, responsiveLayout } from './tokens.js';
import { planApplicationOperation } from './application-boundary.js';
import {planDesign} from './taste/decisions.js';
import {compileDesignCandidate} from './taste/generation.js';
import {createCompositionIR} from './composition-ir.js';

export interface CanvasExternalSource {provider:'sharepoint';resource:string;dataSourceName:string;primaryName:string;columns:Record<string,{name:string;type:string;required:boolean}>;resolved:boolean}
export type CanvasSourceContracts=Record<string,Record<string,CanvasExternalSource>>;
function canvasTable(project:Project,key:string,external:Record<string,CanvasExternalSource>={}){
 if(project.dataverse.tables[key]&&external[key])throw Error('Ambiguous Canvas data-source alias shared by Dataverse and SharePoint');
 const table=project.dataverse.tables[key];if(table)return {name:table.schemaName.toLowerCase(),primaryName:table.primaryName,provider:'dataverse',columns:Object.fromEntries(Object.entries(table.columns).map(([k,c])=>[k,{name:c.schemaName.toLowerCase(),type:c.type,required:c.required}]))};
 const source=external[key];if(!source)return undefined;
 return {name:source.dataSourceName,primaryName:source.primaryName,provider:'sharepoint',columns:Object.fromEntries(Object.entries(source.columns).map(([k,c])=>[k,{name:c.name,type:c.type,required:c.required?'application':'none'}]))};
}
const node = (key: string, component: ComponentName, props: ComponentNode['props'], children: ComponentNode[] = []): ComponentNode => ({ key, component, version: '0.1.0', props, children });
export function expandPatterns(app: CanvasApp): ComponentNode {
  return node('shell', 'AppShell', { title: app.displayName }, [node('navigation', 'Sidebar', { items: app.shell.navigation }),
    ...Object.entries(app.screens).sort(([a], [b]) => a.localeCompare(b)).map(([key, screen]) => node(key, 'Page', { label: screen.title, padding: 'lg' }, [
      node('header', 'PageHeader', { title: screen.title, ...('subtitle' in screen && screen.subtitle ? { subtitle: screen.subtitle } : {}) }),
      ...(screen.pattern === 'analytical' ? [node('evidence', 'SimpleList', {source: screen.source, columns: [screen.groupBy], maxVisible: 25, label: screen.title})] : screen.pattern === 'custom' ? screen.content : screen.pattern === 'dashboard' ? [node('metrics', 'Row', { gap: 'md', wrap: true }, screen.cards.map(card => node(card.key, 'MetricCard', { label: card.label, value: card.value, ...(card.supportingText ? { supportingText: card.supportingText } : {}) })))] : [
        ...(screen.search ? [node('search', 'TextInput', { label: screen.search.label, source: screen.source, field: screen.search.field })] : []),
        node('refresh', 'Button', { label: 'Refresh', variant: 'secondary', onSelect: { type: 'refresh', source: screen.source } }),
        node('records', 'SimpleList', { source: screen.source, columns: screen.columns, maxVisible: screen.pageSize, label: screen.title }),
        ...(screen.pattern === 'masterDetail' ? [node('detail', 'RecordForm', { source: screen.source, label: screen.title + ' details', fields: screen.detail.fields, revealFields: screen.detail.revealFields, ...(screen.detail.reasonField ? { reasonField: screen.detail.reasonField } : {}) })] : []),
      ]),
    ])),
  ]);
}
function checkTree(project: Project, app: CanvasApp, root: ComponentNode, external:Record<string,CanvasExternalSource>={}): Diagnostic[] {
  const diagnostics: Diagnostic[] = []; let count = 0; const searchBindings = new Set<string>();
  const fail = (path: string, message: string) => diagnostics.push({ code: 'PF-CANVAS-003', severity: 'error', path, message });
  const navigate = (target: unknown, path: string) => { if (typeof target !== 'string' || !app.screens[target]) fail(path, 'Navigation target does not exist.'); };
  const source = (target: unknown, path: string) => { if (typeof target !== 'string' || !canvasTable(project,target,external)) fail(path, 'Data source does not exist in the project.'); };
  const visit = (item: ComponentNode, path: string, depth: number) => {
    if (++count > 500 || depth > 20) { fail(path, 'Component tree exceeds the 500-node or 20-level limit.'); return; }
    const contract = registry[item.component];
    if (item.version !== contract.version) fail(path, 'Unsupported component version.');
    if (app.componentPolicy === 'stableOnly' && contract.maturity !== ('stable' as string)) fail(path, 'stableOnly excludes this experimental component.');
    const parsed = contract.props.safeParse(item.props);
    if (!parsed.success) { for (const issue of parsed.error.issues) fail(`${path}.props.${issue.path.join('.')}`, issue.message); }
    if (!contract.children && item.children.length) fail(path, 'This component cannot contain children.');
    const identities = item.children.map(child => child.key.toLowerCase());
    if (new Set(identities).size !== identities.length) fail(path, 'Sibling component keys must be unique.');
    if (item.component === 'AppShell' && (item.children.filter(child => child.component === 'Sidebar').length !== 1 || item.children.some(child => !['Sidebar', 'Page'].includes(child.component)))) fail(path, 'AppShell requires one Sidebar and Pages.');
    if (depth > 0 && item.component === 'AppShell') fail(path, 'Nested AppShell is not supported.');
    if (depth !== 1 && ['Page', 'Sidebar'].includes(item.component)) fail(path, 'Page and Sidebar belong directly to AppShell.');
    if (item.component === 'Sidebar' && parsed.success) for (const entry of item.props.items as { screen: string }[]) navigate(entry.screen, path);
    for (const action of [item.props.onSelect, item.props.retry]) if (action && typeof action === 'object') { const a = action as { type: string; screen: string; source: string }; if (a.type === 'navigate') navigate(a.screen, path); if (a.type === 'refresh') source(a.source, path); }
    if (item.component === 'Dropdown' && parsed.success && item.props.default !== undefined && !(item.props.options as string[]).includes(item.props.default as string)) fail(path, 'Dropdown default must be one of its options.');
    if (item.component === 'TextInput' || item.component === 'SimpleList' || item.component === 'RecordForm') {
      if (item.component === 'TextInput') { const binding = `${path.split('/')[1]}/${String(item.props.source)}`; if (searchBindings.has(binding)) fail(path, 'Only one search input per screen/source is supported.'); searchBindings.add(binding); }
      source(item.props.source, path); const table = canvasTable(project,String(item.props.source),external);
      const columns = item.component === 'TextInput' ? [item.props.field] : item.component === 'RecordForm' ? item.props.fields as string[] : Array.isArray(item.props.columns) ? item.props.columns : [];
      if (item.component === 'RecordForm') {
        if (item.props.reasonField && (!columns.includes(item.props.reasonField) || table?.columns[String(item.props.reasonField)]?.type !== 'multilineText')) fail(path, 'Change reasons require an explicitly bound multiline form field.');
        for (const field of item.props.revealFields as string[]) if (!columns.includes(field) || table?.columns[field]?.required !== 'none') fail(path, 'Reveal fields must be optional fields in the form.');
        for (const field of columns) if (!['text', 'multilineText', 'choice'].includes(table?.columns[String(field)]?.type ?? '')) fail(path, 'Editable forms currently support text, multiline text and choice fields.');
      }
      if (new Set(columns).size !== columns.length) fail(path, 'Duplicate data columns.');
      for (const key of columns) {
        const column = table?.columns[String(key)]; if (!column) fail(path, 'Data field is not an ordinary declared column.');
        else if (item.component === 'TextInput' && column.type !== 'text') fail(path, 'Search supports StartsWith on a text column only.');
      }
    }
    for (const child of item.children) visit(child, `${path}/${child.key}`, depth + 1);
  };
  if (!Object.keys(app.screens).length) fail('screens', 'At least one screen is required.');
  const screenKeys = Object.keys(app.screens).map(key => key.toLowerCase()); if (new Set(screenKeys).size !== screenKeys.length) fail('screens', 'Screen identities must be unique ignoring case.');
  const targets = app.shell.navigation.map(item => item.screen); if (new Set(targets).size !== targets.length) fail('shell', 'Duplicate navigation target.');
  for (const key of Object.keys(app.screens)) if (!targets.includes(key)) fail(`screens.${key}`, 'Every DS1 screen must be reachable from navigation.');
  visit(root, 'shell', 0); return diagnostics;
}
export function canvasDiagnostics(project: Project, sources:CanvasSourceContracts={}): Diagnostic[] {
  const names = Object.values(project.canvasApps ?? {}).map(app => app.uniqueName.toLowerCase());
  return Object.entries(project.canvasApps ?? {}).flatMap(([key, app]) => {
    const diagnostics:Diagnostic[] = [];
    if(app.nativeDesign){
      try{
        if(Object.keys(app.screens).length)throw new Error('Explicit binding migration required: nativeDesign cannot discard legacy business screens.');
        const plan=planDesign(app.nativeDesign.product,{...(app.taste?.design?.v4?{design:app.taste.design.v4}:{})});
        compileDesignCandidate(plan,app.nativeDesign.host,app.theme.mode,createCompositionIR(plan,app.nativeDesign.stability));
      }catch(error){diagnostics.push({code:'PF-CANVAS-003',severity:'error',path:'nativeDesign',message:error instanceof Error?error.message:'Native design validation failed.'});}
    }else diagnostics.push(...checkTree(project, app, expandPatterns(app),sources[key]));
    const siblings = Object.values(project.canvasApps ?? {});
    if (siblings.length > 1 && !app.application?.existingAppId && !app.application?.requiresNewApplication) diagnostics.push({code:'PF-CANVAS-003',severity:'error',path:'application',message:'Multiple Canvas Apps require independently pinned existing IDs or explicit application-level requirements; device and benchmark variants are not app boundaries.'});
    if (app.application?.existingAppId && siblings.filter(s => s.application?.existingAppId === app.application!.existingAppId).length > 1) diagnostics.push({code:'PF-CANVAS-003',severity:'error',path:'application.existingAppId',message:'Device variations must be screens/compositions of one app declaration, not duplicate declarations for the same app ID.'});
    if (names.filter(name => name === app.uniqueName.toLowerCase()).length !== 1) diagnostics.push({ code: 'PF-CANVAS-003', severity: 'error', path: 'uniqueName', message: 'Canvas app names must be unique ignoring case.' });
    if (!app.uniqueName.startsWith(`${project.solution.publisher.prefix}_`)) diagnostics.push({ code: 'PF-CANVAS-003', severity: 'error', path: `canvasApps.${key}.uniqueName`, message: 'Canvas app name must use the solution publisher prefix.' });
    return diagnostics.map(diagnostic => ({ ...diagnostic, path: `canvasApps.${key}.${diagnostic.path}` }));
  });
}
export interface CompiledNode extends Omit<ComponentNode, 'children'> { id: string; controlName: string; children: CompiledNode[] }
const fxString = (value: string) => `"${value.replace(/"/g, '""')}"`;
const fxIdentifier = (value: string) => `'${value.replace(/'/g, "''")}'`;
export function compileCanvas(project: Project, appKey: string, sources:CanvasSourceContracts={}) {
  const raw = project.canvasApps?.[appKey]; if (!raw) throw new PowerCanvasError('PF-CANVAS-004', 'Canvas app does not exist.', 'Select a canvasApps key.');
  if(raw.nativeDesign)throw new PowerCanvasError('PF-CANVAS-004','Native design uses the existing native candidate compiler.','Use taste generate or canvas native with explicit host and bindings.');
  const app = canvasAppSchema.parse(raw); const root = expandPatterns(app); const diagnostics = canvasDiagnostics(project,sources);
  if (diagnostics.length) throw new PowerCanvasError('PF-CANVAS-003', 'Canvas semantics are invalid.', 'Resolve component and data-source diagnostics.', diagnostics);
  const required = new Set<string>(); const queries: { componentId: string; source: string; formula: string; maxVisible: number; delegation: string; states: string[] }[] = [];
  const formulas: Record<string, string> = {}; const theme = resolveTheme(app.theme);
  const searches = new Map<string, string>();
  function collect(item: ComponentNode, screen = '') { const current = item.component === 'Page' ? item.key : screen; if (item.component === 'TextInput') searches.set(`${current}/${String(item.props.source)}`, String(item.props.field)); item.children.forEach(child => collect(child, current)); }
  collect(root);
  function visit(item: ComponentNode, path: string, screenKey?: string): CompiledNode {
    const contract = registry[item.component]; required.add(`${contract.nativeControl}:${contract.capabilities.requiresModernControls ? 'modern' : 'classic-or-container'}`);
    const id = hashJson([project.project.id, appKey, path]).slice(0, 20); const controlName = `pf_${item.component}_${id.slice(0, 12)}`;
    const props = contract.props.parse(item.props) as ComponentNode['props'];
    const screen = item.component === 'Page' ? item.key : screenKey;
    if (item.component === 'Button') { const action = props.onSelect as { type: string; screen?: string; source?: string }; formulas[`${controlName}.OnSelect`] = action.type === 'navigate' ? `Navigate(pf_screen_${action.screen}, ScreenTransition.None)` : `Refresh(${fxIdentifier(canvasTable(project,action.source!,sources[appKey])!.name)})`; }
    if (item.component === 'TextInput') formulas[`${controlName}.OnChange`] = `Set(pf_search_${screen}_${props.source}, Self.Value)`;
    if (item.component === 'Dropdown') formulas[`${controlName}.OnChange`] = `Set(pf_selection_${id}, Self.Selected.Value)`;
    if (item.component === 'SimpleList') {
      const table = canvasTable(project,String(props.source),sources[appKey])!; const search = searches.get(`${screen}/${props.source}`);
      const tableName = fxIdentifier(table.name); const column = search ? table.columns[search]! : undefined;
      const stateKey = `${screen}_${props.source}`;
      const filter = column ? `Filter(${tableName}, StartsWith(${fxIdentifier(column.name)}, pf_search_${stateKey}))` : tableName;
      const formula = `SortByColumns(${filter}, ${fxString(table.columns[table.primaryName]!.name)}, SortOrder.Ascending)`;
      queries.push({ componentId: id, source: String(props.source), formula, maxVisible: Number(props.maxVisible), delegation: table.provider+' candidate; verify field capabilities, Studio delegation warnings and results above 2000 rows before certification. No ClearCollect/FirstN or total-count claim.', states: ['loading', 'loaded', 'empty', 'error', 'forbidden'] });
      formulas[`${controlName}.Items`] = formula;
      const onVisible = `Set(pf_search_${stateKey}, ""); Set(pf_state_${stateKey}, "loading"); IfError(Refresh(${tableName}), Set(pf_state_${stateKey}, "error"), Set(pf_state_${stateKey}, "loaded"))`;
      const existing = formulas[`pf_screen_${screen}.OnVisible`];
      if (!existing?.includes(`pf_state_${stateKey},`)) formulas[`pf_screen_${screen}.OnVisible`] = existing ? `${existing}; ${onVisible}` : onVisible;
    }
    return { ...item, props, id, controlName, children: item.children.map(child => visit(child, `${path}/${child.key}`, screen)) };
  }
  const tree = visit(root, 'shell');
  return { apiVersion: 'powercanvas.canvas-ir/v1alpha1', compilerVersion: '0.1.0', scope: 'semantic-canvas-ir', appKey, uniqueName: app.uniqueName, applicationBoundary: planApplicationOperation(app.application), sourceHash: hashJson(project), tree, theme,
    responsive: [390, 768, 1440].map(width => ({ width, ...responsiveLayout(width) })),
    formulas: { named: Object.fromEntries([...Object.entries(theme.colors).map(([key, value]) => [`PF_${key}`, `ColorValue(${fxString(value)})`]), ...Object.entries(theme.spacing).map(([key, value]) => [`PF_spacing_${key}`, String(value)]), ['PF_controlHeight', String(theme.controlHeight)], ['PF_radius', String(theme.radiusPx)], ['PF_fontBody', String(theme.typography.body)], ['PF_breakpointMedium', '600'], ['PF_breakpointWide', '1024']]), controls: formulas, status: 'typed intent templates; adapter must bind actual control versions, data-source identifiers and error kinds' },
    dataSources:sources[appKey]??{},queries, requiredControls: [...required].sort(), authoring: { executable: false, nativeYamlEmitted: false, requires: ['Saved app in the dedicated solution', 'Open coauthoring Studio session', 'Prepared Dataverse sources', '.NET SDK 10+', 'Microsoft Canvas authoring MCP and live control discovery'] },
    diagnostics: [{ severity: 'warning', message: 'PFDS 0.1 components are experimental. HTML showcase and semantic tests do not certify Canvas rendering, delegation or accessibility.' }] };
}
export type CompiledCanvas = ReturnType<typeof compileCanvas>;
