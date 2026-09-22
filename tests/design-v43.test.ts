import { describe,it,expect } from 'vitest';
import { readFile,writeFile,mkdir,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashJson } from '../src/core/json.js';
import { pattern,stack,button,text } from '../src/canvas/patterns.js';
import { compileField } from '../src/canvas/fields.js';
import { controls } from '../src/canvas/taste/audit.js';
import { compareSourceStates,validateHarnessCandidate,verifyHarnessRestoration,harnessFile,harnessScreen,checkLogicalBoundary,readableScreenNamePlan } from '../src/canvas/certification-harness.js';
import { makeSourceBundle } from '../src/canvas/source-provider.js';
import { evidenceProfile,missingRuntimeEvidence,factoryFingerprint,capabilityFingerprint,certifiedVariant,verifyGeneratedInstance } from '../src/canvas/variant-certification.js';
import { resolveCompositionComponent,createCompositionIR } from '../src/canvas/composition-ir.js';
import { compileDesignCandidate } from '../src/canvas/taste/generation.js';
import { planDesign } from '../src/canvas/taste/decisions.js';
import { products,makeHost } from './design-v4-fixtures.js';
import { nativeCertificationV43Schema } from '../src/canvas/certification.js';
import type { NativeFiles } from '../src/canvas/native-types.js';

const id={appId:'11111111-1111-4111-8111-111111111111',environmentId:'Default-test',sessionId:'current'};
const baseline=():NativeFiles=>({'App.pa.yaml':{App:{Properties:{StartScreen:'=Screen1'}}},'Screen1.pa.yaml':{Screens:{Screen1:{Properties:{},Children:[button('save','"Save"','If(valid, SubmitForm(form))'),button('cancel','"Cancel"','SetFocus(save)')]}}}});
const harness=(base=baseline(),action='Set(pc_cert_state, true)'):NativeFiles=>({...base,[harnessFile]:{Screens:{[harnessScreen]:{Properties:{OnVisible:'=false'},Children:[stack('pc_cert_root',[button('pc_cert_action','"Local action"',action)])]}}}});
const bundle=(files:NativeFiles,mode:'authoringMcp'|'pacDownload')=>makeSourceBundle(files,id,mode,[],[],{content:[{type:'text',text:'Synthetic unit-test source fixture'}]});
describe('saved/draft lifecycle separation',()=>{
 it('retains ordinary independent MATCH',()=>expect(compareSourceStates(bundle(baseline(),'authoringMcp'),bundle(baseline(),'pacDownload'),baseline(),[]).status).toBe('MATCH'));
 it('recognizes exactly approved unsaved differences without saving',()=>{
  const saved=baseline(),draft=baseline();controls(draft).find(n=>n.name==='cancel')!.node.Properties.OnSelect='=SetFocus(cancel)';
  const approval={control:'cancel',property:'OnSelect',beforeFormulaHash:hashJson('=SetFocus(save)'),afterFormulaHash:hashJson('=SetFocus(cancel)'),reason:'Explicit test-only focus change approval',authorization:'explicit-user-approval'};
  const r=compareSourceStates(bundle(draft,'authoringMcp'),bundle(saved,'pacDownload'),draft,[approval]);expect(r.status).toBe('APPROVED_DRAFT_DELTA');expect(r.remoteWrites).toBe(0);
  const rogue=structuredClone(draft);controls(rogue)[0]!.node.Properties.Width='=999';expect(()=>compareSourceStates(bundle(rogue,'authoringMcp'),bundle(saved,'pacDownload'),rogue,[approval])).toThrow('Unresolved');
 });
 it('does not treat an unknown draft as the approved correction',()=>expect(()=>compareSourceStates(bundle(harness(),'authoringMcp'),bundle(baseline(),'pacDownload'),baseline(),[])).toThrow('Unreviewed'));
});
describe('isolated same-app harness',()=>{
 it('keeps original sources and protected mutation inventory intact',()=>{const r=validateHarnessCandidate(baseline(),harness());expect(r.mutationPaths.preserved).toBe(true);expect(r.metrics.controls).toBe(4);expect(r.previewOnly).toBe(true);});
 it.each(['Patch(Records, {})','SubmitForm(form)','Office.SendEmail("x")','Launch("https://example.test")','Set(businessState, true)','SetFocus(save)','Refresh(Records)','ClearCollect(pc_cert_records, Table())'])('rejects unsafe fixture behavior %s',action=>expect(()=>validateHarnessCandidate(baseline(),harness(baseline(),action))).toThrow());
 it('rejects changed original source and namespace collisions',()=>{const c=harness();controls(c).find(n=>n.name==='save')!.node.Properties.Width='=999';expect(()=>validateHarnessCandidate(baseline(),c)).toThrow('protected');expect(()=>validateHarnessCandidate(harness(),harness())).toThrow('collision');});
 it('retains control and depth budgets',()=>{const c=harness();const screen=(c[harnessFile] as {Screens:Record<string,{Children:unknown[]}>}).Screens[harnessScreen]!;screen.Children=Array.from({length:241},(_,i)=>text('pc_cert_'+i,'"Text"'));expect(()=>validateHarnessCandidate(baseline(),c)).toThrow('budget');});
 it('restoration requires exact reviewed candidate and protected draft',()=>{const c=harness(),r=validateHarnessCandidate(baseline(),c);expect(verifyHarnessRestoration(c,baseline(),r).restoredHash).toBe(hashJson(baseline()));expect(()=>verifyHarnessRestoration(harness(baseline(),'Set(pc_cert_other, true)'),baseline(),r)).toThrow('changed');});
});
describe('evidence profiles and expiry',()=>{
 it('does not demand a wizard interaction from static headers',()=>{expect(evidenceProfile('SectionHeader','standard').checks).not.toContain('next');expect(evidenceProfile('TaskForm','wizard').checks).toContain('hidden-step-inert');expect(evidenceProfile('TaskForm','single-column').checks).not.toContain('next');});
 it('navigation and overlays demand meaningful behavior',()=>{expect(evidenceProfile('BottomNavigation','standard').checks).toContain('destination-bound');expect(evidenceProfile('SideSheet','standard').checks).toContain('background-blocking');expect(evidenceProfile('BulkActionBar','standard').checks).toContain('0-selected-hidden');});
 it('keeps native, preview and product evidence separate',()=>{expect(nativeCertificationV43Schema.shape.evidenceClass.safeParse('CHROMIUM').success).toBe(false);expect(nativeCertificationV43Schema.shape.publication.safeParse({published:true}).success).toBe(false);});
 it('variant-specific certification does not promote siblings or stale implementations',()=>{
  const c={component:'RecordHeader',variant:'standard',passed:true,maturity:'NATIVE_VALIDATED',factoryHash:'a',capabilityHash:'b',sourceHash:'c',planHash:'d',evidenceHash:'f'.repeat(64)};
  expect(certifiedVariant('RecordHeader','standard',[c],{factoryHash:'a',capabilityHash:'b'})).toBe(c);
  expect(certifiedVariant('RecordHeader','mobile',[c],{factoryHash:'a',capabilityHash:'b'})).toBeUndefined();
  expect(certifiedVariant('RecordHeader','standard',[c],{factoryHash:'changed',capabilityHash:'b'})).toBeUndefined();
  expect(certifiedVariant('RecordHeader','standard',[c],{factoryHash:'a',capabilityHash:'changed'})).toBeUndefined();
  expect(certifiedVariant('RecordHeader','standard',[c],{factoryHash:'a',capabilityHash:'b'},'published')).toBeUndefined();
 });
 it('production selection refuses manually manufactured passed flags',()=>expect(()=>resolveCompositionComponent({preferred:'RecordHeader',variant:'standard'},'production',undefined,{certificates:[],current:{},confidence:'native'})).toThrow('certification'));
 it('experimental mode keeps contextual executable choices',()=>expect(resolveCompositionComponent({preferred:'RecordHeader',variant:'editorial'},'experimental').variant).toBe('editorial'));
 it('fingerprints follow implementation changes but not documentation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'pc-v43-'));
  try{await mkdir(join(dir,'src/canvas'),{recursive:true});for(const file of ['patterns.ts','expressive.ts','tokens.ts','fields.ts','native-types.ts'])await writeFile(join(dir,'src/canvas',file),await readFile('src/canvas/'+file));const a=await factoryFingerprint('RecordHeader',dir);await writeFile(join(dir,'README.md'),'Documentation changed');expect(await factoryFingerprint('RecordHeader',dir)).toBe(a);await writeFile(join(dir,'src/canvas/fields.ts'),'unrelated field implementation');expect(await factoryFingerprint('RecordHeader',dir)).toBe(a);await writeFile(join(dir,'src/canvas/expressive.ts'),'changed implementation');expect(await factoryFingerprint('RecordHeader',dir)).not.toBe(a);}finally{await rm(dir,{recursive:true,force:true});}
 });
 it('capability fingerprints exclude acquisition time and react to changed properties',()=>{const controls={TextInput:{available:true,creationName:'TextInput',inputProperties:['Value'],outputProperties:[],variants:[],version:null}};expect(capabilityFingerprint({controls})).toBe(capabilityFingerprint({controls:structuredClone(controls)}));expect(capabilityFingerprint({controls})).not.toBe(capabilityFingerprint({controls:{TextInput:{...controls.TextInput,inputProperties:['Value','Mode']}}}));});
 it('reproduces factory output and rejects invented generation lineage',()=>{const request={key:'pc_cert_header',component:'RecordHeader',props:{title:'"Identity"',subtitle:'"Context"',variant:'standard' as const},children:[],style:{}};const actual=pattern(request.key,'RecordHeader',request.props);expect(verifyGeneratedInstance(request,actual).passed).toBe(true);Object.values(actual)[0]!.Properties.Height='=1';expect(verifyGeneratedInstance(request,actual).passed).toBe(false);});
});
describe('typed field contracts',()=>{
 it('keeps Date Only display on its calendar day instead of applying UTC conversion',()=>{const f=compileField('day',{type:'date',label:'Day',value:'Date(2026,9,22)',onChange:'false',timeZone:'UTC'});expect(controls({field:f.control}).find(n=>n.name==='day_input')!.node.Properties.DateTimeZone).toBe("='DatePickerCanvas.DateTimeZone'.Local");});
 it.each(['singleChoice','multiChoice','lookup','person'] as const)('preserves %s record defaults and output shape',type=>{const f=compileField('choice',{type,label:'Choice',value:'defaults',items:'typedRecords',onChange:'Set(changed, true)'});const input=controls({field:f.control}).find(n=>n.name==='choice_input')!;expect(input.node.Control).toBe('ComboBox');expect(input.node.Properties.DefaultSelectedItems).toBe('=defaults');expect(input.node.Properties.Items).toBe('=typedRecords');expect(f.value).toBe(type==='multiChoice'?'choice_input.SelectedItems':'choice_input.Selected');expect(f.value).not.toContain('Text(');});
 it('maps required/default/disabled/read-only properties explicitly',()=>{const f=compileField('read',{type:'text',label:'Value',value:'"Default"',onChange:'false',required:true,disabled:'busy',readOnly:true});const input=controls({field:f.control}).find(n=>n.name==='read_input')!;expect(input.node.Properties.DisplayMode).toContain('DisplayMode.View');expect(input.node.Properties.DisplayMode).toContain('busy');expect(input.node.Properties.Value).toBe('="Default"');expect(f.invalid).toContain('IsBlank(read_input.Value)');});
});
describe('logical boundaries and readable names',()=>{
 const contract=[{min:0,composition:'mobile'},{min:640,composition:'tablet'},{min:960,composition:'split'},{min:1100,composition:'desktop'}];
 it.each([638,639,640,641,958,959,960,961,1098,1099,1100,1101])('checks exact logical width %i',width=>{const composition=[...contract].reverse().find(b=>width>=b.min)!.composition;expect(checkLogicalBoundary({requested:width,logical:width,stableSamples:3,composition},contract).passed).toBe(true);expect(checkLogicalBoundary({requested:width,logical:width-1,stableSamples:3,composition},contract).passed).toBe(false);});
 it('does not rename screen identity when no separate property exists',()=>expect(readableScreenNamePlan('Screen1',['Fill','Name']).action).toBe('RETAIN_KNOWN_SUGGESTION'));
 it('only uses separately discovered accessibility property',()=>expect(readableScreenNamePlan('Screen1',['AccessibleLabel']).rename).toBe(false));
});
it('V4 plan changes native navigation and legacy rendering cannot substitute it',()=>{
 const plan=planDesign(products[0]!),host=makeHost(products[0]!),a=createCompositionIR(plan),b=structuredClone(a);
 a.responsive=a.responsive.map(r=>({...r,navigation:{preferred:'CompactSidebar',variant:'standard'}}));b.responsive=b.responsive.map(r=>({...r,navigation:{preferred:'TopNavigation',variant:'standard'}}));
 const rehash=(ir:typeof a)=>{const {hash,...body}=ir;void hash;return {...body,hash:hashJson(body)};};
 const one=compileDesignCandidate(plan,host,'light',rehash(a)),two=compileDesignCandidate(plan,host,'light',rehash(b));
 expect(hashJson(one.files)).not.toBe(hashJson(two.files));expect(one.resolutions.filter(n=>'device' in n).every(n=>n.selected==='CompactSidebar')).toBe(true);expect(two.resolutions.filter(n=>'device' in n).every(n=>n.selected==='TopNavigation')).toBe(true);
});


it('rejects missing or failed native interactions while static evidence needs no overlay actions',()=>{const observed=evidenceProfile('SectionHeader','standard').checks.map(name=>({name,passed:true}));expect(missingRuntimeEvidence('SectionHeader','standard',observed)).toEqual([]);expect(missingRuntimeEvidence('SectionHeader','standard',observed.filter(x=>x.name!=='dark-theme'))).toEqual(['dark-theme']);expect(missingRuntimeEvidence('TopNavigation','standard',observed)).toContain('destination-change');expect(missingRuntimeEvidence('SectionHeader','standard',observed.map(x=>({...x,passed:x.name!=='content-visible'})))).toEqual(['content-visible']);});
it.each(['boolean','toggle'] as const)('binds %s label contrast to theme tokens',type=>{const field=compileField('check',{type,label:'Confirm',value:'false',onChange:'false'});expect(controls({field:field.control}).find(n=>n.name==='check_input')!.node.Properties.FontColor).toBe('=PF_text');});

it('omits empty hidden help controls instead of emitting missing accessible labels',()=>{const noHelp=compileField('field',{label:'Name',type:'text',value:'""',onChange:'false'});expect(controls({field:noHelp.control}).some(n=>n.name==='field_help')).toBe(false);const help=compileField('field',{label:'Name',type:'text',value:'""',onChange:'false',helpText:'Use the full name'});expect(controls({field:help.control}).find(n=>n.name==='field_help')!.node.Properties.AccessibleLabel).toBe('="Use the full name"');});
