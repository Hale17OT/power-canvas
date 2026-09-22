import { z } from 'zod';
import { pattern, button, text, stack, row, control, fxText, designFormulas, type Control, type Pattern } from '../patterns.js';
import type { NativeFiles } from '../native-types.js';
import type { DesignPlan } from './decisions.js';
import { performanceBudget } from './decisions.js';
import { createCompositionIR, validateCompositionIR, type CanvasCompositionIR } from '../composition-ir.js';
import { compileField, formFieldSchema, validationSummary } from '../fields.js';
import { taskContextSchema, documentPreviewSchema, taskContextActions, compileDocumentPreview } from '../task-context.js';
import type { SemanticMap, ComponentMetadata } from './decision-schema.js';
import { controls, preflight } from './audit.js';
import { hashJson } from '../../core/json.js';
import { productionVariant, type CertifiedSelection } from '../certified-selection.js';

const fx=z.string().min(1).max(20000);
const command=z.strictObject({label:z.string().min(1),action:fx});
/** A design plan never invents data, destinations, writes, approvers or save logic. */
export const designHostSchema=z.strictObject({
  title:z.string().min(1),subtitle:z.string(),navigation:z.array(command).min(1).max(12),
  items:fx,titleField:fx,subtitleField:fx,statusField:fx,select:fx,selected:fx,selectedTitle:fx,selectedBody:fx,
  commands:z.array(command).min(1).max(20),fields:z.array(z.union([z.strictObject({label:z.string().min(1),value:fx,onChange:fx}),formFieldSchema])).max(30),
  empty:fx,loading:fx,error:fx,retry:fx,commit:fx,canCommit:fx,filters:z.array(z.string()).max(8),
  chartItems:fx,chartMaximum:fx,metric:fx,metricLabel:z.string(),
  timelineItems:fx,group:fx.default('""'),groupStart:fx.default('false'),
  filterPredicate:fx.default('true'),
  selectionCount:fx.default('0'),clearSelection:fx.default('false'),
  taskContext:taskContextSchema.optional(),documentPreview:documentPreviewSchema.optional(),
  fixture:z.boolean().default(false),
  fixtureRows:z.array(z.strictObject({title:z.string(),subtitle:z.string(),status:z.string(),value:z.number().nonnegative()})).max(24).optional(),
});
export type DesignHost=z.infer<typeof designHostSchema>;
export const compositionSlots={
  'command-filter-data':['identity','primaryActions','filters','mainContent','feedback'],
  'queue-inspector':['identity','primaryActions','filters','mainContent','secondaryContent','feedback'],
  'record-led-sections':['identity','secondaryContent','filters','mainContent','primaryActions','feedback'],
  'lead-comparison-evidence':['identity','leadMeasure','mainContent','secondaryContent','feedback'],
  'document-context-index':['identity','mainContent','secondaryContent','primaryActions','feedback'],
  'task-progress-fields-dock':['identity','progress','mainContent','primaryActions','feedback'],
} as const;
export function designTokens(plan:DesignPlan,mode:'light'|'dark') {
  const color=plan.design.color;
  const brand=color==='warm-neutral'?'#805331':color==='monochrome-accent'?'#334155':color==='cool-technical'?'#075A70':color==='brand-forward'?'#6337A6':color==='data-viz'?'#244A9E':color==='semantic-heavy'?'#176B4A':'#244A9E';
  const warm=color==='warm-neutral'||plan.dimensions.warmth>=7;
  const radius={square:0,low:4,moderate:8,soft:12,'mixed-semantic':6}[plan.design.radius];
  return {...designFormulas({mode}),PF_brand:`ColorValue("${brand}")`,PF_onBrand:'Color.White',PF_accentText:'If(PF_dark, ColorValue("#C4D2FF"), PF_brand)',
    PF_canvas:`If(PF_dark, ColorValue("#111722"), ColorValue("${warm?'#F8F5EF':'#F5F6FA'}"))`,
    PF_elevation:plan.dimensions.surfaceDepth>=6?'DropShadow.Regular':'DropShadow.None',
    PF_borderWidth:plan.design.border==='none'?'0':plan.design.border==='component'||plan.dimensions.decorativeIntensity>=7?'2':'1',
    PF_scrimSubtle:'RGBA(10, 18, 32, 0.20)',PF_scrimStandard:'RGBA(10, 18, 32, 0.40)',PF_scrimStrong:'RGBA(10, 18, 32, 0.64)',
    PF_scrim:`PF_scrim${plan.scrim[0]!.toUpperCase()+plan.scrim.slice(1)}`,PF_controlHeight:'44',PF_rowHeight:String(plan.rhythm.row),PF_gap:String(plan.rhythm.intraComponent),PF_spaceLg:String(plan.rhythm.section),PF_pagePadding:'If(PF_mobile, 16, 32)',
    PF_radius:String(plan.design.dimensions.radiusCharacter===undefined?radius:plan.dimensions.radiusCharacter>=7?12:plan.dimensions.radiusCharacter>=4?8:4),
    ...Object.fromEntries(Object.entries(plan.typography).map(([k,v])=>['PF_text_'+k,String(v)])),
    PF_typeTitle:String(plan.typography.pageTitle),PF_typeLead:String(plan.typography.numericHero),PF_typeMetric:String(plan.typography.numericMetric)};
}
/** Decision-first composition through the existing native pattern factories; no parallel runtime. */
export function compileDesignCandidate(plan:DesignPlan,raw:unknown,mode:'light'|'dark'='light',composition:CanvasCompositionIR=createCompositionIR(plan),certifications?:CertifiedSelection) {
  const {hash,...body}=plan;if(hashJson(body)!==hash)throw new Error('Design plan was changed after selection');
  const {ir,resolved,navigation}=validateCompositionIR(composition,plan,certifications);
  const h=designHostSchema.parse(raw); if(h.navigation.length!==plan.context.destinationCount)throw new Error('Destination count differs from the planned host contract');
  if(h.fixtureRows&&!h.fixture)throw new Error('Synthetic rows require an explicit fixture contract');
  if(h.fixtureRows){h.items='Table('+h.fixtureRows.map(r=>`{Title:${fxText(r.title)}, Description:${fxText(r.subtitle)}, Status:${fxText(r.status)}, Value:${r.value}}`).join(',')+')';h.chartItems='Table('+h.fixtureRows.map(r=>`{Label:${fxText(r.title)}, Value:${r.value}}`).join(',')+')';h.chartMaximum=String(Math.max(1,...h.fixtureRows.map(r=>r.value)));}
  if(h.fixtureRows?.length===0){h.items='FirstN(Table({Title:"", Description:"", Status:"", Value:0}), 0)';h.chartItems='FirstN(Table({Label:"", Value:0}), 0)';h.empty='true';}
  h.items=`Filter(${h.items}, ${h.filterPredicate})`;
  if(h.fields.length!==plan.context.fieldCount)throw new Error('Field count differs from the planned host contract');
  if(h.commands.length!==plan.context.actionCount)throw new Error('Command count differs from the planned host contract');
  const region=(slot:string)=>resolved.find(r=>r.slot===slot)!;
  const dedicated=region('form.review').requested==='DedicatedPage';
  if(dedicated&&!h.taskContext)throw new Error('DedicatedPage requires an explicit origin/return/unsaved taskContext');
  const taskActions=dedicated?taskContextActions(h.taskContext):undefined;
  if(taskActions)h.commands[0]!.action+='; '+taskActions.enter;
  const metadata:SemanticMap={}; const part=(key:string,kind:Pattern,props:unknown,role:ComponentMetadata['role'],slot:string,children:Control[]=[],extra:Record<string,string>={})=>{
    const variant=typeof props==='object'&&props&&'variant' in props?String(props.variant):'standard';
    if(ir.stability==='production'&&!productionVariant(certifications,kind,variant))throw new Error(`Native certification required for emitted factory ${kind}.${variant}`);
    const result=pattern(key,kind,props as never,children,extra);
    slot=({identity:'record.identity',primaryActions:'record.actions',secondaryActions:'data.commands',navigation:'page.navigation',filters:'data.filters',mainContent:'page.primaryContent',secondaryContent:'page.secondaryContent',fields:'form.fields',feedback:'page.feedback',activity:'record.activity',progress:'form.header',leadMeasure:'page.primaryContent'} as Record<string,string>)[slot]??slot;
    metadata[key]={recipe:kind,variant:typeof props==='object'&&props&&'variant' in props?String(props.variant):'standard',role,slot,composition:plan.composition};
    // Factory output acquires roles once; refinement reads roles rather than names.
    for(const n of controls({fragment:result}))if(n.name!==key&&!metadata[n.name]){
      const childRole=n.node.Control==='Button'?(role==='navigation-primary'?'navigation-primary':'secondary-command'):n.node.Control==='ModernText'?(kind==='RecordHeader'&&n.name===`${key}_title`?'record-primary-identity':kind==='KpiCard'&&n.name===`${key}_value`?'lead-metric':'metadata'):'metadata';
      metadata[n.name]={...metadata[key]!,recipe:'native:'+n.node.Control,role:childRole};
    }
    return result;
  };
  const navItems=h.navigation.map((n,i)=>({...n,selected:`Coalesce(pc_destination, 1) = ${i+1}`,action:`Set(pc_destination, ${i+1}); Set(pc_drawer, false); ${n.action}`,disabled:'pc_overlay'}));
  const navKinds=Object.fromEntries(navigation.map(n=>[n.device,n.selected]));
  const mobileNavKind=navKinds.mobile!;
  const createNav=(key:string,kind:string,when:string)=>kind==='Tabs'?
    part(key,'Tabs',{label:'Workspace sections',items:h.navigation.map(n=>n.label),onChange:`Switch(Self.Selected.Value, ${h.navigation.map(n=>`${fxText(n.label)}, ${n.action}`).join(', ')})`},'navigation-primary','navigation',[],{Visible:'='+when}):
    part(key,kind as Pattern,{items:navItems,disabled:'pc_overlay',...(kind==='CompactSidebar'?{title:h.title}:{}),...(kind==='NavigationDrawer'?{open:'pc_drawer',close:'Set(pc_drawer, false)',returnFocus:'pc_menu',title:h.title}:{})},'navigation-primary','navigation',[],{Visible:'='+when+(kind==='NavigationDrawer'?' && pc_drawer':''),...(kind==='BottomNavigation'?{X:'=0',Y:'=Parent.Height - 72',Width:'=Parent.Width'}:{})});
  const responsiveNav=ir.shell==='focused'?[]:[
    {device:'desktop',kind:navKinds.desktop!,when:'PF_wide',control:createNav('pc_navigation',navKinds.desktop!,'PF_wide')},
    {device:'tablet',kind:navKinds.tablet!,when:'PF_tablet',control:createNav('pc_tabletNavigation',navKinds.tablet!,'PF_tablet')},
    {device:'mobile',kind:mobileNavKind,when:'PF_mobile',control:createNav('pc_mobileNavigation',mobileNavKind,'PF_mobile')},
  ];
  const drawerCondition=responsiveNav.filter(n=>n.kind==='NavigationDrawer').map(n=>n.when).join(' || ');
  const heading=part('pc_recordHeader',region('page.header').selected as Pattern,{title:fxText(h.title),subtitle:fxText(h.subtitle),metadata:fxText(plan.archetype.replaceAll('-',' ')),variant:region('page.header').variant},'record-primary-identity','page.header');
  if(plan.design.dimensions.typographyExpression!==undefined){
    const title=controls({heading}).find(n=>n.name==='pc_recordHeader_title');
    if(title){title.node.Properties.Size='=PF_text_display';title.node.Properties.Height='=80';}
  }
  const primary=button('pc_task',fxText(h.commands[0]!.label),h.commands[0]!.action,{Height:'=44',Width:'=200',Appearance:"='ButtonCanvas.Appearance'.Primary",FontColor:'=PF_onBrand',DisplayMode:'=If(pc_overlay || pc_drawer, DisplayMode.Disabled, DisplayMode.Edit)'});
  metadata.pc_task={recipe:'Button',variant:'primary',role:'primary-command',slot:'record.actions',composition:plan.composition};
  const actionKind=region('data.commands').selected;
  if(actionKind==='OverflowMenu'&&h.commands.length>9 || actionKind==='BulkActionBar'&&h.commands.length>12)throw new Error('Action count exceeds the selected native menu capacity; split the task or reduce commands');
  const actions=actionKind==='OverflowMenu'?part('pc_more','OverflowMenu',{label:'More actions',open:'pc_menuOpen',toggle:'Set(pc_menuOpen, !pc_menuOpen)',close:'Set(pc_menuOpen, false)',actions:h.commands.slice(1).map(a=>({...a,disabled:'pc_overlay || pc_drawer'}))},'secondary-command','secondaryActions'):
    actionKind==='BulkActionBar'?stack('pc_selectionCommands',[part('pc_bulk','BulkActionBar',{count:h.selectionCount,clear:h.clearSelection,actions:h.commands.slice(1,4).map(a=>({...a,disabled:'pc_overlay || pc_drawer'}))},'secondary-command','primaryActions'),...(h.commands.length>4?[part('pc_selectionOverflow','OverflowMenu',{label:'Other actions',open:'pc_menuOpen',toggle:'Set(pc_menuOpen, !pc_menuOpen)',close:'Set(pc_menuOpen, false)',actions:h.commands.slice(4).map(a=>({...a,disabled:'pc_overlay || pc_drawer'}))},'secondary-command','secondaryActions')]:[])],{Height:`=If(pc_menuOpen, 400, If(${h.selectionCount} > 0, 160, 44))`}) :
      h.commands.length>1?part('pc_commands','CommandBar',{actions:h.commands.slice(1).map(a=>({...a,primary:false}))},'secondary-command','secondaryActions'):stack('pc_noSecondaryCommands',[],{Height:'=0'});
  const toolbar=row('pc_toolbar',[primary,...(drawerCondition?[button('pc_menu','"Navigation"','Set(pc_drawer, true)',{Height:'=44',Width:'=144',Visible:'='+drawerCondition})]:[]),actions],{Height:actionKind==='OverflowMenu'?`=If(pc_menuOpen, ${(h.commands.length+2)*52+120}, If(PF_mobile, 168, 64))`:'=If(PF_mobile, 168, 64)',LayoutDirection:'=If(PF_mobile, LayoutDirection.Vertical, LayoutDirection.Horizontal)',LayoutAlignItems:'=LayoutAlignItems.Start'});
  // A mobile task has a real fixed command region outside the scrolling page.
  Object.values(primary)[0]!.Properties.Visible='=!PF_mobile';
  const dock=part('pc_taskDock','CommandBar',{actions:[{label:h.commands[0]!.label,action:h.commands[0]!.action,primary:true}]},'primary-command','primaryActions',[],{Visible:'=PF_mobile',X:'=0',Y:`=Parent.Height - ${mobileNavKind==='BottomNavigation'?152:80}`,Width:'=Parent.Width',Height:'=80',Fill:'=PF_surface'});
  const filters=part('pc_filters','FilterChips',{label:'View',options:h.filters.length?h.filters.map(f=>({label:f,selected:`pc_filter = ${fxText(f)}`,action:`Set(pc_filter, ${fxText(f)})`})):[{label:'All',selected:'true',action:'Set(pc_filter, Blank())'}],reset:'Set(pc_filter, Blank())',disabled:'pc_overlay || pc_drawer'},'filter','filters');
  const rich={label:'Records',items:h.items,title:h.titleField,subtitle:h.subtitleField,status:h.statusField,onSelect:h.select,selected:h.selected,disabled:'pc_overlay || pc_drawer',maxItems:50};
  const dataKind=region('data.view').selected;
  let data:Control;
  if(dataKind==='DataTable')data=part('pc_data','DataTable',{label:'Records',items:`FirstN(${h.items}, 50)`,title:h.titleField,subtitle:h.subtitleField,badge:h.statusField,onSelect:h.select,selected:h.selected,disabled:'pc_overlay || pc_drawer',height:'Max(280, Parent.Height - 32)'},'data-view','mainContent');
  else if(dataKind==='ChartCard')data=part('pc_data','ChartCard',{title:'"Comparison"',description:'"Current scope • values included in labels"',items:h.chartItems,maximum:h.chartMaximum},'data-view','mainContent');
  else if(dataKind==='ActivityTimeline')data=part('pc_data','ActivityTimeline',{label:'Recorded events',items:h.timelineItems,empty:'No events available'},'data-view','mainContent');
  else if(dataKind==='GroupedList')data=part('pc_data','GroupedList',{...rich,group:h.group,groupStart:h.groupStart},'data-view','data.view');
  else data=part('pc_data','RichList',{...rich,variant:region('data.view').variant},'data-view','data.view');
  const typedFields=h.fields.flatMap((f,i)=>'type'in f?[{index:i,...compileField(`pc_typedField${i}`,f)}]:[]);
  const fieldControls=h.fields.map((f,i)=>stack(`pc_field${i}`,[text(`pc_label${i}`,fxText(f.label),{Height:'=28'}),control(`pc_input${i}`,'TextInput',{Value:'='+f.value,OnChange:'='+f.onChange,AccessibleLabel:'='+fxText(f.label),Height:'=44',Width:'=Parent.Width',FontSize:'=14',FontColor:'=PF_text',Fill:'=PF_surface',DisplayMode:'=DisplayMode.Edit'})],{Height:'=88'}));
  fieldControls.forEach((_,i)=>{metadata[`pc_input${i}`]={recipe:'TextInput',variant:'standard',role:'form-field',slot:'fields',composition:plan.composition};});
  for(const f of typedFields){fieldControls[f.index]=f.control;metadata[`pc_typedField${f.index}_input`]={recipe:f.evidence.control,variant:f.field.type,role:'form-field',slot:'form.fields',composition:ir.family};}
  const valid=typedFields.length?'!('+typedFields.map(f=>'('+f.invalid+')').join(' || ')+')':'true';
  const currentValid=typedFields.map(f=>`(Coalesce(pc_step, 1) <> ${f.index+1} || !(${f.invalid}))`).join(' && ')||'true';
  const wizard=region('form.fields').variant==='wizard';
  const task=part('pc_form',region('form.fields').selected as Pattern,{title:'"Review details"',variant:region('form.fields').variant,step:'Coalesce(pc_step, 1)',next:`Set(pc_validationAttempted, true); If((${h.canCommit}) && (${currentValid}), If(Coalesce(pc_step, 1) >= ${Math.max(1,h.fields.length)}, If(${valid}, Set(pc_reviewing, true)${dedicated?'':'; Set(pc_overlay, true)'}), Set(pc_step, Coalesce(pc_step, 1) + 1); Set(pc_validationAttempted, false)))`,back:'Set(pc_step, Max(1, Coalesce(pc_step, 1) - 1)); Set(pc_validationAttempted, false)'},'form-field','form.fields',fieldControls,wizard?{Visible:'=!pc_reviewing'}:{});
  const detail=stack('pc_context',[text('pc_contextTitle',h.selectedTitle,{Height:'=64',Size:'=PF_text_recordTitle',FontWeight:'=FontWeight.Semibold'}),text('pc_contextBody',h.selectedBody,{Height:'=160',Size:'=PF_typeBody',Color:'=PF_muted'}),part('pc_activity','ActivityTimeline',{label:'Recorded events',items:h.timelineItems,empty:'No events available'},'activity-item','activity')],{Height:'=560',Width:'=If(PF_mobile, Parent.Width, 340)',Fill:'=PF_surface',PaddingLeft:'=24',PaddingRight:'=24',PaddingTop:'=24',LayoutOverflowY:'=LayoutOverflow.Scroll'});
  if(plan.composition==='record-led-sections'){
    Object.assign(Object.values(detail)[0]!.Properties,{Width:'=Parent.Width',Height:'=320'});
    for(const n of controls({detail}))if(n.name==='pc_contextBody')n.node.Properties.Height='=64';
  }
  const dataRegion=stack('pc_dataRegion',[data],{FillPortions:'=1',Width:'=0',Height:'=480'});
  let bodyContent:Control[];
  if(plan.composition==='lead-comparison-evidence')bodyContent=[part('pc_lead','KpiCard',{label:fxText(h.metricLabel),value:h.metric,caption:'"Current scope"'},'lead-metric','leadMeasure',[],{Width:'=Parent.Width',Height:'=152'}),row('pc_evidence',[dataRegion,detail],{Height:'=560',LayoutDirection:'=If(PF_mobile, LayoutDirection.Vertical, LayoutDirection.Horizontal)'})];
  else if(plan.composition==='document-context-index')bodyContent=[row('pc_document',[h.documentPreview?compileDocumentPreview('pc_documentPreview',h.documentPreview):detail,dataRegion],{Height:'=600',LayoutDirection:'=If(PF_mobile, LayoutDirection.Vertical, LayoutDirection.Horizontal)'})];
  else if(plan.composition==='task-progress-fields-dock')bodyContent=[part('pc_progress','Stepper',{steps:['Details','Review'],current:'If(pc_overlay, 2, 1)'},'status','progress'),...(dedicated?[]:[task])];
  else if(plan.composition==='queue-inspector')bodyContent=[filters,row('pc_split',[dataRegion,detail],{Height:'=560',LayoutDirection:'=If(PF_mobile, LayoutDirection.Vertical, LayoutDirection.Horizontal)'})];
  else if(plan.composition==='record-led-sections')bodyContent=[detail,filters,dataRegion];
  else bodyContent=[filters,dataRegion];
  const feedback=stack('pc_feedback',[part('pc_empty','EmptyState',{title:'"Nothing in this view"',description:'"Adjust the view or return to all records."',visible:h.empty},'feedback','feedback'),part('pc_loading','Skeleton',{label:'Loading this region',visible:h.loading,rows:3,variant:'table'},'feedback','feedback'),part('pc_error','ErrorState',{title:'"Unable to load"',description:h.error,visible:`!IsBlank(${h.error})`,retry:h.retry},'feedback','feedback')],{Height:`=If(${h.empty} || ${h.loading} || !IsBlank(${h.error}), 180, 0)`});
  const page=stack('pc_page',[heading,toolbar,...bodyContent,feedback],{FillPortions:'=1',Width:'=0',Height:'=Parent.Height',PaddingLeft:'=PF_pagePadding',PaddingRight:'=PF_pagePadding',PaddingTop:'=24',PaddingBottom:'=24',LayoutGap:'=PF_spaceLg',LayoutOverflowY:'=LayoutOverflow.Scroll'});
  const inlineNav=responsiveNav.filter(n=>!['NavigationDrawer','BottomNavigation'].includes(n.kind));
  const root=stack('pc_root',[...inlineNav.map(n=>n.control),page],{Width:'=Parent.Width',Height:`=Parent.Height - If(PF_mobile, ${mobileNavKind==='BottomNavigation'?152:80}, 0)`,LayoutDirection:navKinds.desktop==='CompactSidebar'?'=If(PF_wide, LayoutDirection.Horizontal, LayoutDirection.Vertical)':'=LayoutDirection.Vertical',LayoutGap:'=0',LayoutAlignItems:'=LayoutAlignItems.Stretch'});
  const overlayKind=region('form.review').selected;
  const commitAction=`Set(pc_validationAttempted, true); If((${h.canCommit}) && (${valid}), ${h.commit})`;
  const commit=button('pc_commit','"Review and continue"',commitAction,{Height:'=44',Width:'=200',Visible:wizard?'=pc_reviewing':'=true',DisplayMode:`=If(${h.canCommit}, DisplayMode.Edit, DisplayMode.Disabled)`});
  const overlayTask=plan.composition==='task-progress-fields-dock'&&!dedicated?stack('pc_review',[text('pc_reviewTitle','"Review before continuing"',{Height:'=48'}),commit],{Height:'=240'}):stack('pc_editBody',[task,commit],{Height:'=Parent.Height'});
  if(typedFields.length)Object.values(overlayTask)[0]!.Children!.push(validationSummary('pc_validationSummary',typedFields,'pc_validationAttempted'));
  if(wizard)Object.values(overlayTask)[0]!.Children!.push(button('pc_reviewBack','"Back to fields"','Set(pc_reviewing, false)'+(plan.composition==='task-progress-fields-dock'?'; Set(pc_overlay, false)':''),{Visible:'=pc_reviewing',Height:'=44',Width:'=160'}));
  const overlay=dedicated?stack('pc_unusedOverlay',[]):overlayKind==='ConfirmationDialog'?part('pc_overlaySurface','ConfirmationDialog',{title:'"Confirm this action"',description:'"Review the consequences before continuing."',visible:'pc_overlay',confirm:commitAction,cancel:'Set(pc_overlay, false); If(PF_mobile, SetFocus(pc_taskDock_0), SetFocus(pc_task))',confirmLabel:'Confirm'},'overlay','form.review',[],{Fill:'=PF_scrim'}):part('pc_overlaySurface',overlayKind as Pattern,{title:'"Review task"',visible:'pc_overlay',close:'Set(pc_overlay, false)',returnFocus:'pc_task',returnFocusMobile:'pc_taskDock_0',scrim:plan.scrim,surface:plan.overlaySurface},'overlay','form.review',[overlayTask]);
  const formulas:Record<string,string>=designTokens(plan,mode);
  const files:NativeFiles={'App.pa.yaml':{App:{Properties:{StartScreen:'=Screen1',Formulas:'='+Object.entries(formulas).map(([k,v])=>`${k} = ${v};`).join('\n')}}},'Screen1.pa.yaml':{Screens:{Screen1:{Properties:{Fill:'=PF_canvas',OnVisible:'=Set(pc_overlay, false); Set(pc_drawer, false)'},Children:[root,...responsiveNav.filter(n=>n.kind==='BottomNavigation').map(n=>n.control),dock,...responsiveNav.filter(n=>n.kind==='NavigationDrawer').map(n=>n.control),overlay]}}}};
  if(taskActions){
    const screen=(files['Screen1.pa.yaml'] as {Screens:{Screen1:{Children:Control[]}}}).Screens.Screen1;
    screen.Children=screen.Children.filter(c=>c!==overlay);
    // A real separate screen in the same app, with an explicit unsaved decision and host-owned return.
    files['pc_taskScreen.pa.yaml']={Screens:{pc_taskScreen:{Properties:{Fill:'=PF_canvas',OnVisible:'=Set(pc_overlay, false)'},Children:[stack('pc_dedicatedTask',[button('pc_return','"Return"',taskActions.exit,{Height:'=44',Width:'=120'}),overlayTask,
      part('pc_taskEmpty','EmptyState',{title:'"No task context"',description:'"Return to select a record."',visible:h.empty},'feedback','page.feedback'),
      part('pc_taskLoading','LoadingState',{label:'Loading task',visible:h.loading},'feedback','page.feedback'),
      part('pc_taskError','ErrorState',{title:'"Unable to load task"',description:h.error,visible:`!IsBlank(${h.error})`,retry:h.retry},'feedback','page.feedback')],{Width:'=Parent.Width',Height:'=Parent.Height',LayoutOverflowY:'=LayoutOverflow.Scroll'}),part('pc_discardDialog','ConfirmationDialog',{title:'"Discard unsaved changes?"',description:'"Your changes have not been saved."',visible:'pc_discardTask',confirm:taskActions.discard,cancel:taskActions.cancel+'; SetFocus(pc_return)',confirmLabel:'Discard'},'overlay','form.review',[],{Fill:'=PF_scrim'})]}}};
    for(const n of controls({'pc_taskScreen.pa.yaml':files['pc_taskScreen.pa.yaml']}))if(n.path.includes('/pc_dedicatedTask/')&&['Button','TextInput','NumberInput','ComboBox','DatePicker','CheckBox','Toggle'].includes(n.node.Control??''))n.node.Properties.DisplayMode=`=If(pc_discardTask, DisplayMode.Disabled, ${n.node.Properties.DisplayMode?.slice(1)??'DisplayMode.Edit'})`;
  }
  // Disable every background command while a task overlay is open. Input/mutation formulas remain host-owned.
  for(const n of controls(files))if(['Button','TextInput','TabList','NumberInput','ComboBox','DatePicker','CheckBox','Toggle'].includes(n.node.Control??'')&&!n.path.includes('/pc_overlaySurface/')&&!n.path.includes('/pc_navigation/')&&!n.path.includes('/pc_mobileNavigation/')&&!n.path.includes('/pc_tabletNavigation/')&&n.name!=='pc_task')n.node.Properties.DisplayMode=`=If(pc_overlay || pc_drawer, DisplayMode.Disabled, ${n.node.Properties.DisplayMode?.slice(1)??'DisplayMode.Edit'})`;
  for(const n of controls(files))if(n.node.Control==='GroupContainer'&&n.node.Properties.Fill==='=PF_surface'&&!n.path.includes('/pc_overlaySurface/')){
    n.node.Properties.DropShadow='=PF_elevation';
    n.node.Properties.BorderColor='=PF_border';
    n.node.Properties.BorderThickness=plan.surface==='flat'?'=0':'=PF_borderWidth';
    if(plan.surface==='flat'||plan.surface==='editorial')n.node.Properties.Fill='=Color.Transparent';
  }
  const names=controls(files).map(n=>n.name);if(new Set(names).size!==names.length)throw new Error('Generated controls contain duplicate identities');
  for(const key of Object.keys(metadata))if(!names.includes(key))delete metadata[key];
  // Convert factory-local constants into named design tokens without changing geometry.
  for(const n of controls(files))for(const [property,value]of Object.entries(n.node.Properties)){
    if(/^=\d+$/.test(value)&&value!=='=0'&&/^(FontSize|Size|Radius\w*|BorderRadius|Padding\w*|LayoutGap)$/.test(property)){
      const family=/Size/.test(property)?'type':/Radius/.test(property)?'radius':'space';const token=`PF_${family}_${value.slice(1)}`;
      formulas[token]=value.slice(1);n.node.Properties[property]='='+token;
    }
    if(value==='=ColorValue("#111722")'){formulas.PF_overlayDark='ColorValue("#111722")';n.node.Properties[property]='=PF_overlayDark';}
    if(property==='DropShadow'&&value==='=DropShadow.Regular'){formulas.PF_elevationLayer='DropShadow.Regular';n.node.Properties[property]='=PF_elevationLayer';}
  }
  (files['App.pa.yaml'] as {App:{Properties:{Formulas:string}}}).App.Properties.Formulas='='+Object.entries(formulas).map(([k,v])=>`${k} = ${v};`).join('\n');
  const sourcePreflight=preflight(files,undefined,undefined,metadata);
  if(!sourcePreflight.staticPassed)throw new Error('Native candidate failed existing source preflight: '+sourcePreflight.blockers.map(b=>b.rule+': '+b.evidence).join('; '));
  const performance=performanceBudget(files,metadata);if(!performance.passed)throw new Error('Native composition exceeds the local performance budget');
  return {files,metadata,plan,composition:ir,resolutions:[...resolved,...navigation],typedFields:typedFields.map(f=>({field:f.field,value:f.value,evidence:f.evidence})),host:h,performance,preflight:sourcePreflight,manifest:{version:'4.1',compositionHash:ir.hash,planHash:plan.hash,nativeHash:hashJson(files),scope:'offline-native-candidate',requiresNewApplication:false,fixture:h.fixture,remoteWrites:0,nativeValidated:false,limitations:['Local structural rendering is not Power Apps runtime proof','Host event and Power Fx validation remain required','No live mutations or app provisioning performed']}};
}
