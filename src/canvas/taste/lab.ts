import { expressiveContracts, expressiveVariants, type ExpressivePattern } from '../expressive.js';
import { pattern, text, button, stack, type Control } from '../patterns.js';
import type { NativeFiles } from '../native-types.js';
import { controls, auditNative } from './audit.js';
import { designTokens } from './generation.js';
import { planDesign } from './decisions.js';
import { componentEvidence } from './catalog.js';
import { hashJson } from '../../core/json.js';
import { compileField } from '../fields.js';

const nav={items:[{label:'Overview',action:'Set(lab_section, 1)',selected:'Coalesce(lab_section, 1) = 1'},{label:'Work',action:'Set(lab_section, 2)',selected:'lab_section = 2'},{label:'Activity',action:'Set(lab_section, 3)',selected:'lab_section = 3'}]};
const overlay={title:'"Example task"',visible:'lab_open',close:'Set(lab_open, false)',returnFocus:'lab_trigger'};
const list={label:'Synthetic list',items:'Table({Title:"Sample", Description:"Local fixture", Status:"Ready", Group:"Today", GroupStart:true})',title:'ThisItem.Title',subtitle:'ThisItem.Description',status:'ThisItem.Status',onSelect:'Set(lab_selected, ThisItem)',selected:'false'};
export const labSamples:Record<ExpressivePattern,Record<string,unknown>>={
  TopNavigation:nav,BottomNavigation:nav,NavigationDrawer:{...nav,title:'Lab',open:'lab_open',close:'Set(lab_open, false)',returnFocus:'lab_trigger'},CompactSidebar:{...nav,title:'Lab'},
  SideSheet:overlay,BottomSheet:overlay,FullScreenTask:overlay,ContextPanel:overlay,
  OverflowMenu:{label:'More actions',open:'lab_open',toggle:'Set(lab_open, !lab_open)',close:'Set(lab_open, false)',actions:[{label:'Inspect',action:'Set(lab_inspect, true)'},{label:'Compare',action:'Set(lab_compare, true)'}]},
  BulkActionBar:{count:'lab_count',clear:'Set(lab_count, 0)',actions:[{label:'Review selection',action:'Set(lab_review, true)'}]},
  FilterChips:{label:'View',options:[{label:'All',selected:'IsBlank(lab_filter)',action:'Set(lab_filter, Blank())'},{label:'Open',selected:'lab_filter = "Open"',action:'Set(lab_filter, "Open")'}],reset:'Set(lab_filter, Blank())'},
  FilterPanel:{title:'"Refine records"',visible:'true',apply:'Set(lab_applied, true)',reset:'Set(lab_filter, Blank())'},
  RichList:list,GroupedList:{...list,group:'ThisItem.Group',groupStart:'ThisItem.GroupStart'},
  RecordHeader:{title:'"Record identity"',subtitle:'"Supporting context"',metadata:'"REF-001 · Ready"'},SectionHeader:{title:'"Section title"',subtitle:'"Related information"'},
  Skeleton:{label:'Loading this region',visible:'lab_open',rows:3},Snackbar:{message:'"Local example completed"',visible:'lab_open',dismiss:'Set(lab_open, false)'},TaskForm:{title:'"Complete the task"',step:'lab_step',next:'Set(lab_step, Min(2, lab_step + 1))',back:'Set(lab_step, Max(1, lab_step - 1))'},
};
export function componentLab(mode:'light'|'dark'='light') {
  const plan=planDesign({name:'Component Lab',users:['Design reviewers'],jobs:['Review variants'],frequency:'occasional',purpose:'exploration',devices:['desktop','tablet','mobile'],criticalInformation:['Variants and states'],accessibility:['Named controls'],constraints:['Offline only']});
  const formulas=designTokens(plan,mode);const files:NativeFiles={'App.pa.yaml':{App:{Properties:{Formulas:'='+Object.entries(formulas).map(([k,v])=>`${k} = ${v};`).join('\n')}}}};
  const entries:{name:ExpressivePattern;variant:string;state:string;file:string;controls:number}[]=[];
  for(const name of Object.keys(expressiveContracts) as ExpressivePattern[])for(const variant of expressiveVariants[name]) {
    const key=`lab_${name}_${variant.replaceAll('-','_')}`;const sample={...labSamples[name],...('variant' in expressiveContracts[name].shape?{variant}:{}),...('returnFocus' in expressiveContracts[name].shape?{returnFocus:key+'_trigger'}:{})};
    const children:Control[]=['TaskForm','FilterPanel','SideSheet','BottomSheet','FullScreenTask','ContextPanel'].includes(name)?[stack(`${key}_slot`,[text(`${key}_text`,'"Host-provided content"')],{Height:'=120'})]:[];
    if(name==='TaskForm')children.splice(0,children.length,
      compileField(key+'_name',{type:'text',label:'Name',value:'Coalesce(lab_name, "")',onChange:'Set(lab_name, Self.Value)',required:true},'lab_attempted').control,
      compileField(key+'_amount',{type:'number',label:'Quantity',value:'Coalesce(lab_amount, 1)',onChange:'Set(lab_amount, Self.Value)',validation:[{rule:'range',min:1,max:20,message:'Use 1–20'}]},'lab_attempted').control);
    const component=pattern(key,name,sample as never,children);
    const file=`${key}.pa.yaml`; files[file]={Screens:{[key]:{Properties:{Fill:'=PF_canvas',OnVisible:'=Set(lab_open, false); Set(lab_count, 2); Set(lab_section, 1); Set(lab_step, 1); Set(lab_filter, Blank())'},Children:[button(key+'_trigger','"Open example"','Set(lab_open, true); Set(lab_count, 2)',{Height:'=44'}),component]}}};
    // Each lab fixture is a standalone source fragment, not another application resource.
    entries.push({name,variant,state:name==='Skeleton'?'loading':name==='OverflowMenu'?'open':'default',file,controls:controls({[file]:files[file]!}).length});
  }
  return {files,entries,manifest:{title:'PowerCanvas Component Lab',scope:'offline-native-fragments',theme:mode,nativeValidated:false,requiresNewApplication:false,remoteWrites:0,hash:hashJson(files)},support:entries.map(e=>({...e,...componentEvidence(e.name)})),audit:entries.map(e=>({file:e.file,report:auditNative({'App.pa.yaml':files['App.pa.yaml']!,[e.file]:files[e.file]!})}))};
}
