import { z } from 'zod';
import { productSchema } from './memory.js';
import { contextSchema, v4DesignSchema, dimensionsSchema, type DecisionContext, type DesignDirection, type SemanticMap } from './decision-schema.js';
import { hashJson } from '../../core/json.js';
import { controls, dependencies } from './audit.js';
import type { NativeFiles } from '../native-types.js';

export type Device = 'desktop' | 'tablet' | 'mobile';
export type Candidate = { pattern: string; fit: number; reasons: string[]; eligible: boolean; limitation?: string };
export type Decision = { decision: string; selected: string; reasons: string[]; candidates: Candidate[]; rejected: Record<string, string> };
const candidate = (pattern: string, fit: number, reason: string, eligible = true, limitation?: string): Candidate => ({ pattern, fit, reasons: [reason], eligible, ...(limitation ? {limitation} : {}) });
function choose(decision: string, candidates: Candidate[], direction: DesignDirection): Decision {
  const evaluated = candidates.map(c => ({...c, eligible:c.eligible && !direction.bans.includes(c.pattern), fit:c.fit + (direction.preferences.includes(c.pattern) ? 2 : 0), reasons:[...c.reasons, ...(direction.bans.includes(c.pattern)?['Explicit design ban']:[]), ...(direction.preferences.includes(c.pattern)?['Explicit preference, subject to feasibility']:[])]}));
  const ranked = evaluated.filter(c => c.eligible).sort((a,b) => b.fit-a.fit || a.pattern.localeCompare(b.pattern));
  if (!ranked.length) throw new Error(`No feasible ${decision} candidate remains; revise the design bans or requirements.`);
  const best=ranked[0]!;
  return {decision,selected:best.pattern,reasons:best.reasons,candidates:evaluated,rejected:Object.fromEntries(evaluated.filter(c=>c!==best).map(c=>[c.pattern,(!c.eligible?'Unavailable: ':'Less appropriate: ')+c.reasons.join('; ')+(c.limitation?'; '+c.limitation:'')]))};
}
export function analyzeProduct(raw: unknown) {
  const product=productSchema.parse(raw); const mobile=product.devices[0]==='mobile';
  const inferred:DecisionContext={destinationCount:4,hierarchyDepth:1,navigationFrequency:product.frequency==='occasional'?'occasional':'frequent',userFamiliarity:product.frequency==='continuous'?'experienced':'new',persistentContext:!mobile,taskMinutes:product.purpose==='inspection'?8:3,fieldCount:product.purpose==='inspection'?10:product.purpose==='configuration'?12:4,fieldComplexity:'simple',validationBurden:'low',recordCount:product.purpose==='operations'?100:24,comparison:product.purpose==='executive',visualContent:product.purpose==='document-review',scanKey:product.purpose==='executive'?'measure':'identity',sorting:true,editing:product.purpose!=='executive',workflow:({operations:'queue',executive:'analysis','document-review':'reading',inspection:'entry',configuration:'configuration',approval:'queue',exploration:'reading'} as const)[product.purpose],overlayTask:'edit',destructive:false,actionCount:3,bulkActions:false};
  const context=contextSchema.parse({...inferred,...product.context});
  return {product,context,assumptions:Object.keys(inferred).filter(k=>!Object.hasOwn(product.context??{},k)).map(k=>({input:k,value:context[k as keyof DecisionContext],basis:'Conservative purpose/frequency default; review before generation'}))};
}
export function planDesign(raw:unknown, options:{device?:Device;screenWidth?:number;design?:unknown}={}) {
  const {product,context:c,assumptions}=analyzeProduct(raw);const device=options.device??product.devices[0]!;
  const width=z.number().int().min(320).max(7680).parse(options.screenWidth??(device==='mobile'?390:device==='tablet'?820:1440));
  const d=v4DesignSchema.parse(options.design??{}); const mobile=width<640; const narrow=width<1100;
  const branch=d.designVariance<4?'data-first':d.designVariance<7?'workspace-first':'content-first';
  const direction=d.direction??branch;
  const dimensions=dimensionsSchema.parse({density:c.recordCount>80?8:c.workflow==='analysis'?3:5,formality:7,warmth:c.workflow==='reading'?6:2,contrast:7,surfaceDepth:direction==='workspace-first'?3:1,radiusCharacter:2,typographyExpression:direction==='content-first'?7:4,navigationPresence:c.persistentContext?7:3,dataEmphasis:c.comparison?9:5,brandExpression:3,motion:0,decorativeIntensity:0,...d.dimensions,...(d.reducedMotion?{motion:0}:{})});
  const navigation=choose('navigation',[
    candidate('CompactSidebar',(c.destinationCount>=6?12:c.persistentContext?8:3)+(dimensions.navigationPresence>=7?1:0),`${c.destinationCount} destinations; persistent labeled context ${c.persistentContext?'needed':'optional'}; ${c.hierarchyDepth} hierarchy levels`,!mobile && width>=900),
    candidate('TopNavigation',c.destinationCount<=5&&c.navigationFrequency==='occasional'?12:direction==='content-first'?10:6,`${c.destinationCount} flat destinations; ${c.navigationFrequency} switching; content keeps full width`,!mobile&&c.destinationCount<=5&&c.hierarchyDepth===1),
    candidate('Tabs',c.workflow==='configuration'&&c.destinationCount<=6?14:4,'Peer configuration sections remain visible with labels',!mobile&&c.hierarchyDepth===1&&c.destinationCount>=2&&c.destinationCount<=6),
    candidate('BottomNavigation',c.navigationFrequency==='frequent'?14:7,`${c.destinationCount} peer destinations; frequent touch switching needs visible targets`,mobile&&c.destinationCount>=2&&c.destinationCount<=5&&c.hierarchyDepth===1),
    candidate('NavigationDrawer',mobile?c.destinationCount>5||c.hierarchyDepth>1?16:8:!c.persistentContext||narrow?10:5,`${width}px workspace; disclosure preserves content area for ${c.destinationCount} destinations`,c.destinationCount<=12),
  ],d);
  const overlay=choose('overlay',[
    candidate('ConfirmationDialog',20,'A consequential confirmation needs concise consequences and a safe cancel',c.overlayTask==='confirmation'),
    candidate('ContextPanel',12,'Short inspection preserves adjacent context without modal interruption',c.overlayTask==='inspect'&&c.fieldCount<=3&&!mobile&&!c.destructive),
    candidate('BottomSheet',18,'Secondary mobile filtering stays close to the current records',mobile&&c.overlayTask==='filter'&&c.fieldCount<=6),
    candidate('SideSheet',c.persistentContext?14:9,`${c.fieldCount} fields and ${c.taskMinutes} minutes; keep the source visible for review`,!mobile&&c.fieldCount<=12&&c.taskMinutes<=10&&!c.destructive),
    candidate('FullScreenTask',mobile?15:8,`${c.fieldCount} fields; sustained input needs available height and fixed task controls`,!c.destructive),
    candidate('DedicatedPage',18,'Long or dependent work benefits from a dedicated page',false,'No navigable task-page factory yet; use the executable FullScreenTask surface'),
  ],d);
  const data=choose('data',[
    candidate('DataTable',(c.comparison?15:c.recordCount>80?13:6)+(dimensions.dataEmphasis>=8?1:0),`${c.recordCount} records, ${c.fieldCount} fields; ${c.comparison?'cross-record comparison':'identity scanning'} with explicit selection`,!mobile&&!c.visualContent),
    candidate('RichList',mobile?14:direction==='workspace-first'?13:9,'Identity and supporting status support quick sequential scanning',true),
    candidate('Cards',c.visualContent?16:direction==='content-first'&&c.recordCount<=50?14:4,'Content previews benefit from a larger reading area',c.recordCount<=100),
    candidate('ActivityTimeline',20,'Chronological evidence is the primary scan key',c.workflow==='history'||c.scanKey==='time'),
    candidate('ChartCard',20,'Decision-making requires labeled comparisons and a data alternative',c.workflow==='analysis'),
    candidate('KanbanBoard',17,'Stage-oriented routing could use columns',false,'REFERENCE: drag/drop and a native board factory are not implemented'),
  ],d);
  const form=choose('form',[
    candidate('single-column',mobile?14:10,`${c.fieldCount} fields; predictable vertical reading`,c.fieldCount<=8),
    candidate('two-column',12,'Short independent desktop inputs fit two columns',!mobile&&c.fieldCount>=5&&c.fieldCount<=12&&c.fieldComplexity==='simple'),
    candidate('sectioned',c.fieldCount>10?16:7,'Related groups reduce the scanning cost of longer forms',c.fieldCount>4),
    candidate('wizard',18,'Dependent inputs require guarded steps and explicit review',c.fieldComplexity==='dependent'&&c.fieldCount>6),
  ],d);
  const actions=choose('actions',[
    candidate('CommandBar',10,'One primary command and bounded secondaries stay visible',c.actionCount<=4&&!mobile),
    candidate('OverflowMenu',16,`${c.actionCount} commands: disclose infrequent operations`,c.actionCount>4),
    candidate('BulkActionBar',18,'Selection-scoped operations require a visible count and clear selection',c.bulkActions&&c.actionCount>1),
    candidate('MobileBottomActions',mobile?15:5,'Fixed task controls stay reachable independently of scrolling',true),
  ],d);
  const archetype=d.archetype??(mobile&&c.workflow==='entry'?'field-companion':c.workflow==='analysis'?'analytical-briefing':c.workflow==='reading'?'document-workspace':c.workflow==='configuration'?'configuration-console':c.workflow==='history'?'timeline-workspace':product.purpose==='approval'?'inbox-workspace':direction==='workspace-first'?'case-workspace':direction==='content-first'?'editorial-workspace':'operational-console');
  const composition=c.workflow==='analysis'||archetype==='analytical-briefing'||archetype==='executive-brief'?'lead-comparison-evidence':c.workflow==='reading'||archetype==='document-workspace'||archetype==='content-library'?'document-context-index':mobile&&c.workflow==='entry'||archetype==='focused-task'||archetype==='field-companion'||direction==='task-first'?'task-progress-fields-dock':direction==='workspace-first'||archetype==='case-workspace'?'queue-inspector':direction==='content-first'||archetype==='editorial-workspace'?'record-led-sections':'command-filter-data';
  const plan={version:'4.0',product:product.name,productContext:product,design:d,productHash:hashJson(product),context:c,assumptions,device,width,direction,designVariance:d.designVariance,archetype,dimensions,
    decisions:[navigation,overlay,data,form,actions],composition,surface:d.surface??(c.workflow==='reading'?'editorial':direction==='workspace-first'?'panelled':'sectioned'),
    overlaySurface:d.overlaySurface,scrim:c.destructive?'strong':c.overlayTask==='inspect'||c.overlayTask==='filter'?'subtle':'standard',
    typography:{display:dimensions.typographyExpression>=7?40:32,pageTitle:28,recordTitle:24,sectionTitle:18,subsectionTitle:16,body:14,bodyStrong:14,supporting:14,metadata:12,label:14,caption:12,numericHero:c.workflow==='analysis'?48:32,numericMetric:28},
    rhythm:{row:mobile?96:dimensions.density>=7?64:88,intraComponent:8,section:c.workflow==='analysis'?32:dimensions.density>=7?16:24},
    mobileStrategy:mobile?'Task-first; labeled navigation; single-column fields; fixed reachable actions':'Resolve mobile from the same product and application identity',
    feasibility:{native:true,pcfPackagesCreated:0,limitations:['No browser focus trap or Escape guarantee without native validation','No drag, swipe, blur or font-feature emulation','Gallery truncation is bounded, not delegation certification','DataTable is an identity/status gallery, not a sortable multicolumn grid','Navigation contracts are flat; hierarchical destinations must be explicitly flattened by the host','Motion, formality, contrast and brandExpression remain intent-only; decorativeIntensity affects border treatment only']},
    evaluation:{taskEfficiency:`${composition} prioritizes ${product.jobs[0]}`,informationHierarchy:`${data.selected} supports ${c.scanKey} scanning`,deviceSuitability:`${navigation.selected} at ${width}px`,accessibility:'Labeled 44px commands; keyboard/runtime evidence pending',implementationFeasibility:'Only executable native pattern families selected',distinctiveness:`${direction} uses ${composition}`,consistency:'Shared semantic roles and tokens',businessContext:product.criticalInformation.join('; ')},
    remoteWrites:0 as const,requiresNewApplication:false as const};
  return {...plan,hash:hashJson(plan)};
}
export type DesignPlan = ReturnType<typeof planDesign>;
export function exploreDesign(product:unknown, count=3, options:{device?:Device;design?:unknown}={}) {
  z.number().int().min(2).max(4).parse(count);
  const branches=['data-first','workspace-first','content-first','task-first'] as const;
  const base=v4DesignSchema.parse(options.design??{});
  return branches.slice(0,count).map((direction,i)=>planDesign(product,{...options,design:{...base,direction,designVariance:[2,5,8,6][i]}}));
}
export function signatureRisk(plans:DesignPlan[]) {
  const groups=new Map<string,string[]>();
  for(const p of plans){const key=[p.composition,...p.decisions.map(d=>d.selected),p.surface].join('/');groups.set(key,[...(groups.get(key)??[]),p.product]);}
  return {basis:'Composition and selected families, excluding names, colors and branding',risks:[...groups].filter(([,products])=>new Set(products).size>=3).map(([structure,products])=>({code:'GENERATOR SIGNATURE RISK',structure,products})),comparisons:plans.length};
}
export function performanceBudget(files:NativeFiles,metadata:SemanticMap={}) {
  const nodes=controls(files);const deps=dependencies(files);const galleries=nodes.filter(n=>n.node.Control==='Gallery');
  const metrics={controls:nodes.length,containers:nodes.filter(n=>n.node.Control==='GroupContainer').length,maxDepth:Math.max(0,...nodes.map(n=>n.depth)),galleryTemplates:galleries.map(g=>({name:g.name,controls:nodes.filter(n=>n.path.startsWith(g.path+'/')).length})),expensiveFormulas:deps.filter(d=>/\b(ForAll|GroupBy|SortByColumns|LookUp)\s*\(/.test(d.formula)).length,crossScreenReferences:deps.filter(d=>/\b\w+Screen\./.test(d.formula)).length,semanticControls:Object.keys(metadata).length};
  return {metrics,limits:{controls:240,maxDepth:12,galleryTemplate:16},passed:metrics.controls<=240&&metrics.maxDepth<=12&&metrics.galleryTemplates.every(g=>g.controls<=16),runtimePerformanceProven:false};
}
