import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { planDesign, exploreDesign, signatureRisk, performanceBudget } from '../src/canvas/taste/decisions.js';
import { dimensionsSchema, v4DesignSchema } from '../src/canvas/taste/decision-schema.js';
import { productSchema } from '../src/canvas/taste/memory.js';
import { componentEvidence, resolveAdapter, taxonomy, inspirationCardSchema } from '../src/canvas/taste/catalog.js';
import { pattern, patternCatalog, designFormulas, control, stack } from '../src/canvas/patterns.js';
import { expressiveContracts, expressiveVariants } from '../src/canvas/expressive.js';
import { compileDesignCandidate, designTokens } from '../src/canvas/taste/generation.js';
import { controls, compareBehavior } from '../src/canvas/taste/audit.js';
import { generateDesign } from '../src/canvas/taste/strategies.js';
import { refineNative } from '../src/canvas/taste/refine.js';
import { renderCandidate } from '../src/canvas/taste/preview.js';
import { makeHost, products } from './design-v4-fixtures.js';
import { componentLab } from '../src/canvas/taste/lab.js';
const brief=products[0]!;
const choose=(p:ReturnType<typeof planDesign>,d:string)=>p.decisions.find(x=>x.decision===d)!.selected;
it('has strict backwards-compatible product context, dimensions and design input',()=>{
  expect(productSchema.safeParse({...brief,context:{...brief.context,fieldCount:-1}}).success).toBe(false);
  expect(productSchema.safeParse({...brief,context:{unknown:3}}).success).toBe(false);
  expect(v4DesignSchema.safeParse({dimensions:{density:11}}).success).toBe(false);
  expect(dimensionsSchema.shape).toHaveProperty('navigationPresence');
  const old={...brief};delete old.context;expect(productSchema.safeParse(old).success).toBe(true);
  expect(planDesign(old).assumptions.length).toBeGreaterThan(0);
});
it('separates executable native factories, mappings, reference patterns and PCF candidates',()=>{
  expect(taxonomy).toHaveLength(21);
  for(const p of patternCatalog()){const evidence=componentEvidence(p.name);expect(evidence.executable).toBe(true);expect(evidence.actualFactory).toBeTruthy();expect(evidence.nativeValidated).toBe(false);expect(evidence.variants.length).toBeGreaterThan(0);}
  expect(componentEvidence('KanbanBoard')).toMatchObject({maturity:'PLANNED',executable:false,variants:[]});
  expect(resolveAdapter('HoverCard')).toMatchObject({nativeTranslation:['ContextPanel'],implemented:true,mobileTranslation:'BottomSheet on tap'});
  expect(resolveAdapter('ResizableSidebar','drag')).toMatchObject({resolution:'PCF_CANDIDATE',implemented:false,packageCreated:false});
  expect(resolveAdapter('CommandPalette').implemented).toBe(false);
  expect(()=>resolveAdapter('NativeBackdropBlur')).toThrow('backdrop');
});
it('requires curated reference observations and prevents claiming copied source through ingestion',()=>{
  const card={source:'https://example.com/reference',category:'navigation',observations:['Labels remain visible'],adaptablePatterns:['TopNavigation'],notAdaptable:['Hover-only controls'],sourceAdapted:false,reviewedAt:'2026-09-21'};
  expect(inspirationCardSchema.safeParse(card).success).toBe(true);expect(inspirationCardSchema.safeParse({...card,sourceAdapted:true}).success).toBe(false);
});
it('chooses navigation from capacity, hierarchy, frequency and viewport',()=>{
  expect(choose(planDesign(brief),'navigation')).toBe('CompactSidebar');
  const small={...brief,context:{...brief.context,destinationCount:4,hierarchyDepth:1}};
  expect(choose(planDesign(small,{device:'mobile'}),'navigation')).toBe('BottomNavigation');
  expect(choose(planDesign({...small,context:{...small.context,hierarchyDepth:2}},{device:'mobile'}),'navigation')).toBe('NavigationDrawer');
  expect(choose(planDesign(products[1]!),'navigation')).toBe('TopNavigation');
  expect(choose(planDesign(products[8]!),'navigation')).toBe('Tabs');
});
it('rejects excessive navigation rather than silently dropping destinations',()=>{
  expect(()=>planDesign({...brief,context:{...brief.context,destinationCount:25}},{device:'mobile'})).toThrow('No feasible navigation');
});
it('chooses overlays from task duration, destructive intent and touch filtering',()=>{
  expect(choose(planDesign(products[5]!),'overlay')).toBe('ConfirmationDialog');
  expect(choose(planDesign({...brief,context:{...brief.context,overlayTask:'filter',fieldCount:3}},{device:'mobile'}),'overlay')).toBe('BottomSheet');
  expect(choose(planDesign(products[3]!),'overlay')).toBe('FullScreenTask');
  expect(choose(planDesign(products[8]!),'overlay')).toBe('FullScreenTask');
  expect(planDesign(products[8]!).decisions.find(d=>d.decision==='overlay')!.rejected.DedicatedPage).toContain('No navigable task-page factory');
  expect(planDesign(products[5]!).scrim).toBe('strong');
});
it('selects data and form representations from their actual job and rejects unimplemented boards',()=>{
  expect(choose(planDesign(brief),'data')).toBe('DataTable');
  expect(choose(planDesign(products[1]!),'data')).toBe('ChartCard');
  expect(choose(planDesign(products[2]!),'data')).toBe('Cards');
  expect(choose(planDesign(products[9]!),'data')).toBe('ActivityTimeline');
  expect(choose(planDesign(products[3]!),'form')).toBe('wizard');
  expect(choose(planDesign(brief),'form')).toBe('two-column');
  expect(choose(planDesign(brief,{device:'mobile'}),'form')).toBe('single-column');
  expect(planDesign(brief).decisions.find(d=>d.decision==='data')!.rejected.KanbanBoard).toContain('not implemented');
});
it('uses explicit bans and preferences only among feasible alternatives',()=>{
  expect(choose(planDesign(brief,{design:{bans:['CompactSidebar']}}),'navigation')).toBe('NavigationDrawer');
  expect(()=>planDesign(brief,{design:{bans:['CompactSidebar','NavigationDrawer']}})).toThrow('No feasible');
  expect(choose(planDesign(brief,{design:{preferences:['KanbanBoard']}}),'data')).not.toBe('KanbanBoard');
});
it('generates reproducible design directions with structural rather than color differences',()=>{
  const a=exploreDesign(brief);expect(a).toEqual(exploreDesign(brief));
  expect(new Set(a.map(p=>p.composition)).size).toBe(3);
  const low=planDesign(brief,{design:{designVariance:1}}),medium=planDesign(brief,{design:{designVariance:5}}),high=planDesign(brief,{design:{designVariance:9}});
  expect(new Set([low,medium,high].map(p=>p.composition)).size).toBe(3);
  expect(planDesign(brief,{design:v4DesignSchema.parse({designVariance:8})}).direction).toBe('content-first');
  expect(planDesign(brief,{design:{dimensions:{motion:8},reducedMotion:true}}).dimensions.motion).toBe(0);
});
it('detects repeated structures without treating colors or product names as diversity',()=>{
  const p=planDesign(brief);expect(signatureRisk([{...p,product:'One'},{...p,product:'Two'},{...p,product:'Three'}]).risks[0]!.code).toBe('GENERATOR SIGNATURE RISK');
  expect(new Set(products.slice(0,4).map(p=>planDesign(p).composition)).size).toBe(4);
});
it.each(products)('compiles $name through shared factories with one local screen identity and bounded controls',p=>{
  const plan=planDesign(p);const host=makeHost(p);const result=compileDesignCandidate(plan,host);
  expect(result.manifest).toMatchObject({requiresNewApplication:false,remoteWrites:0,nativeValidated:false});
  expect(result.performance.passed).toBe(true);expect(result.files).toHaveProperty('Screen1.pa.yaml');
  expect(result.preflight.staticPassed).toBe(true);expect(result.preflight.complete).toBe(false);
  expect(compileDesignCandidate(plan,host)).toEqual(result);
  expect(Object.keys(result.metadata).length).toBeGreaterThan(8);
  expect(Object.keys(result.metadata).every(name=>controls(result.files).some(n=>n.name===name))).toBe(true);
  expect(JSON.stringify(result.files)).not.toMatch(/Patch\(|SubmitForm\(|Remove\(|\.Run\(/);
  expect(renderCandidate(result)).toContain('Power Apps rendering unverified');
  expect(controls(result.files).filter(n=>n.node.Control==='Button').every(n=>!!n.node.Properties.AccessibleLabel)).toBe(true);
});
it('rejects stale plans and inconsistent host bindings before emitting controls',()=>{
  const plan=planDesign(brief),host=makeHost(brief);expect(()=>compileDesignCandidate({...plan,composition:'different'},host)).toThrow('changed');
  expect(()=>compileDesignCandidate(plan,{...host,navigation:host.navigation.slice(1)})).toThrow('Destination count');
  expect(()=>compileDesignCandidate(plan,{...host,fields:[]})).toThrow('Field count');
});
it('keeps all host commands or rejects unsupported menu capacity instead of silently dropping actions',()=>{
  const p={...brief,context:{...brief.context,actionCount:20,bulkActions:false}};
  expect(()=>compileDesignCandidate(planDesign(p),makeHost(p))).toThrow('menu capacity');
  const singleton={...brief,context:{...brief.context,actionCount:1,bulkActions:false}};
  const source=JSON.stringify(compileDesignCandidate(planDesign(singleton),makeHost(singleton)).files);
  expect(source).not.toContain('pc_actionPreview');
  expect(source).toContain('Set(pc_overlay, true)');
});
it('emits one responsive source with a fixed mobile command region and guarded background inputs',()=>{
  const g=compileDesignCandidate(planDesign(products[3]!),makeHost(products[3]!));const nodes=controls(g.files);
  const dock=nodes.find(n=>n.name==='pc_taskDock')!;expect(dock.depth).toBe(0);expect(dock.node.Properties.Y).toContain('Parent.Height');
  const field=nodes.find(n=>n.name==='pc_input0')!;expect(field.node.Properties.DisplayMode).toContain('pc_overlay || pc_drawer');
  expect(JSON.stringify(g.files)).toContain('SetFocus(pc_taskDock_0)');
});
it('applies token choices and archetype composition before factories execute',()=>{
  const warm=planDesign(brief,{design:{color:'warm-neutral',radius:'soft',archetype:'focused-task'}});
  const cool=planDesign(brief,{design:{color:'cool-technical',radius:'square'}});
  expect(designTokens(warm,'light').PF_brand).not.toBe(designTokens(cool,'light').PF_brand);
  expect(designTokens(warm,'light').PF_canvas).not.toBe(designTokens(cool,'light').PF_canvas);
  expect(designTokens(warm,'light').PF_radius).toBe('12');expect(designTokens(cool,'light').PF_radius).toBe('0');
  expect(warm.composition).toBe('task-progress-fields-dock');
  expect(new Set(exploreDesign(brief,4).map(p=>p.composition)).size).toBe(4);
});
it('refines semantic roles with arbitrary control names and preserves business behavior',()=>{
  const input={'App.pa.yaml':{App:{Properties:{Formulas:'='+Object.entries(designFormulas({})).map(([k,v])=>`${k} = ${v};`).join('\n')}}},'Screen1.pa.yaml':{Screens:{Screen1:{Children:[stack('arbitrary',[control('totallyUnrelated','ModernText',{Text:'"Inventory"',Size:'=14'}),control('act','Button',{OnSelect:'=Set(saved, true)',Height:'=44',AccessibleLabel:'"Save"'})])]}}}};
  const roles={totallyUnrelated:{recipe:'RecordHeader',variant:'standard',role:'record-primary-identity' as const,composition:'record',slot:'identity'}};
  const result=refineNative(input,generateDesign(brief),'typeset',roles);
  expect(controls(result.files).find(n=>n.name==='totallyUnrelated')!.node.Properties.Size).toBe('=PF_typeTitle');expect(compareBehavior(input,result.files).preserved).toBe(true);
  expect(()=>refineNative(input,generateDesign(brief),'typeset',{missing:roles.totallyUnrelated})).toThrow('missing');
});
it('keeps generic refinement free of application identifiers and suffix rules',()=>{
  const source=readFileSync('src/canvas/taste/refine.ts','utf8');expect(source).not.toMatch(/_kpi|_formHeading|CASEWORK|Complaint and response|_detail_title/);
});
it('measures actual control budget and blocks excessively nested or oversized output',()=>{
  let tree=control('leaf','Button',{Height:'=44'});for(let i=0;i<14;i++)tree=stack('level'+i,[tree]);
  expect(performanceBudget({screen:tree}).passed).toBe(false);
});
it('new variant names correspond to bounded enum contracts, not aspirational variants',()=>{
  for(const name of Object.keys(expressiveContracts) as (keyof typeof expressiveContracts)[])expect(expressiveVariants[name].length).toBeGreaterThan(0);
  expect(()=>pattern('panel','SideSheet',{title:'"Edit"',visible:'open',close:'Set(open, false)',returnFocus:'trigger',variant:'made-up' as never})).toThrow();
  expect(()=>pattern('nav','BottomNavigation',{items:Array.from({length:6},()=>({label:'Destination',action:'false'}))})).toThrow();
  const sheet=JSON.stringify(pattern('sheet','BottomSheet',{title:'"Filters"',visible:'open',close:'Set(open, false)',returnFocus:'trigger'}));expect(sheet).toContain('LayoutJustifyContent.End');expect(sheet).toContain('SetFocus(trigger)');expect(sheet).not.toContain('OnSwipe');
});
it('executes every new factory and variant in the native Component Lab with valid named controls',()=>{
  const lab=componentLab();expect(new Set(lab.entries.map(e=>e.name)).size).toBe(19);
  expect(lab.entries.length).toBe(Object.values(expressiveVariants).flat().length);
  for(const e of lab.entries){const nodes=controls({[e.file]:lab.files[e.file]!});expect(new Set(nodes.map(n=>n.name)).size).toBe(nodes.length);expect(nodes.filter(n=>n.node.Control==='Button').every(n=>n.node.Properties.AccessibleLabel&&n.node.Properties.OnSelect)).toBe(true);}
  expect(componentLab('dark').files['App.pa.yaml']).not.toEqual(lab.files['App.pa.yaml']);
  expect(lab.manifest).toMatchObject({remoteWrites:0,nativeValidated:false});
});
