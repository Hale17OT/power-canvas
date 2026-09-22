import {mkdir,writeFile} from 'node:fs/promises';
import process from 'node:process';
import {stringify} from 'yaml';
import {readNativeSource} from '../dist/canvas/source-provider.js';
import {validateHarnessCandidate,harnessFile,harnessScreen} from '../dist/canvas/certification-harness.js';
import {pattern,stack,button,text} from '../dist/canvas/patterns.js';
import {compileField,validationSummary} from '../dist/canvas/fields.js';
import {hashJson} from '../dist/core/json.js';
const [batch='static',out='output/canvas/native/v43-static']=process.argv.slice(2);
const base=await readNativeSource('output/design-v43/initial-authoring/source');
const entries=[];const instance=(key,component,props,children=[],style={})=>{const node=pattern('pc_cert_'+key,component,props,children,style);entries.push({key:'pc_cert_'+key,component,variant:props.variant??'standard',props,children,style,instanceHash:hashJson(node)});return node;};
let children,init='false';
if(batch==='static')children=[
 instance('page','PageHeader',{title:'"Native component certification"',subtitle:'"Preview fixture: no business operations"'}),
 instance('record','RecordHeader',{title:'"Request PC-043"',subtitle:'"A deliberately long supporting description tests responsive wrapping and readable hierarchy"',metadata:'"Preview only · Local state"',variant:'standard'}),
 instance('section','SectionHeader',{title:'"Record context"',subtitle:'"Supporting information"',variant:'standard'}),
 instance('detail','DetailPanel',{title:'"Details"',subtitle:'"Synthetic record content"'},[text('pc_cert_content','"No customer records are used by these fixtures."')],{Height:'=120'}),
 instance('empty','EmptyState',{title:'"No matching records"',description:'"Change the filter to inspect another local fixture."'}),
 instance('loading','LoadingState',{label:'Loading preview fixture'}),
];
else if(batch==='navigation'){
 init='Set(pc_cert_destination, 1); Set(pc_cert_tab, "Overview")';
 const items=['Overview','Long destination label','Activity'].map((label,i)=>({label,action:`Set(pc_cert_destination, ${i+1})`,selected:`pc_cert_destination = ${i+1}`}));
 children=[instance('top','TopNavigation',{items,variant:'standard'}),instance('bottom','BottomNavigation',{items,variant:'standard'}),instance('rail','CompactSidebar',{title:'Preview navigation',items,variant:'standard'},[],{Height:'=240'}),instance('tabs','Tabs',{label:'Preview sections',items:['Overview','Activity'],selected:'pc_cert_tab',onChange:'Set(pc_cert_tab, Self.Selected.Value)'}),text('pc_cert_destinationResult','"Destination " & Text(pc_cert_destination) & " / Tab " & pc_cert_tab')];
}else if(batch.startsWith('fields')){
 const types=batch==='fields-basic'?['text','multiline','number','percentage']:batch==='fields-choice'?['boolean','toggle','date','singleChoice']:batch==='fields-semantic'?['email','phone','url','currency']:['datetime','lookup','person','multiChoice'];
 init='Set(pc_cert_errors, false); Set(pc_cert_disabled, false); Set(pc_cert_changed, false)';
 const fields=types.map((type,i)=>compileField('pc_cert_field'+i,{label:type,type,value:['singleChoice','lookup','person','multiChoice'].includes(type)?'FirstN(Table({Value:"Normal", Id:GUID("00000000-0000-0000-0000-000000000043")}), 1)':['date','datetime'].includes(type)?'Date(2026, 9, 22)':['boolean','toggle'].includes(type)?'false':['number','percentage','currency'].includes(type)?'25':'""',onChange:'Set(pc_cert_changed, true)',required:true,disabled:'pc_cert_disabled',...(type==='currency'?{currencyCode:'USD'}:{}),timeZone:'UTC',items:'Table({Value:"Normal", Id:GUID("00000000-0000-0000-0000-000000000043")},{Value:"High", Id:GUID("00000000-0000-0000-0000-000000000044")})'},'pc_cert_errors'));
 children=[button('pc_cert_validate','"Validate fields"','Set(pc_cert_errors, true)'),button('pc_cert_disable','"Toggle disabled"','Set(pc_cert_disabled, !pc_cert_disabled)'),button('pc_cert_inspect','"Inspect typed values"',fields.map((f,i)=>`Set(pc_cert_output${i}, JSON(${f.value}, JSONFormat.Compact))`).join('; ')),text('pc_cert_changedLabel','"Input changed: " & Text(pc_cert_changed)'),...fields.map(f=>f.control),validationSummary('pc_cert_summary',fields,'pc_cert_errors'),...fields.map((f,i)=>text('pc_cert_value'+i,`"${f.field.type} output: " & Coalesce(pc_cert_output${i}, "Not inspected")`,{Height:'=48'}))];
 entries.push(...fields.map((f,i)=>({key:'pc_cert_field'+i,field:f.field.type,value:f.value,invalid:f.invalid,instanceHash:hashJson(f.control)})));
}else throw Error('Unknown reviewed batch');
const root=stack('pc_cert_root',children,{X:'=0',Y:'=0',Width:'=Parent.Width',Height:'=Parent.Height',PaddingLeft:'=16',PaddingRight:'=16',LayoutOverflowY:'=LayoutOverflow.Scroll'});
const files={...base,[harnessFile]:{Screens:{[harnessScreen]:{Properties:{Fill:'=PF_canvas',OnVisible:'='+init},Children:[root]}}}};
const receipt=validateHarnessCandidate(base,files);
await mkdir(out,{recursive:true});for(const [name,value]of Object.entries(files))await writeFile(out+'/'+name,stringify(value,{lineWidth:0}),{flag:'wx'});
await writeFile(out+'/harness-receipt.json',JSON.stringify(receipt,null,2));await writeFile(out+'/instances.json',JSON.stringify(entries,null,2));
console.log(JSON.stringify({batch,...receipt}));
