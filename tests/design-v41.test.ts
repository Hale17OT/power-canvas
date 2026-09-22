import { it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { hashJson } from '../src/core/json.js';
import { createCompositionIR,validateCompositionIR,resolveCompositionComponent,compositionIRSchema } from '../src/canvas/composition-ir.js';
import { compileField,fieldTypes,mapDataverseField,safeFieldPredicate,validationSummary } from '../src/canvas/fields.js';
import { planCanvasMigration,mapFormulaIdentifiers } from '../src/canvas/migration.js';
import { taskContextActions,compileDocumentPreview } from '../src/canvas/task-context.js';
import { nativeCertificationSchema,certifyNative } from '../src/canvas/certification.js';
import { applySemanticTreatments } from '../src/canvas/taste/semantic-treatments.js';
import { dimensionExecution } from '../src/canvas/taste/dimension-execution.js';
import { planDesign } from '../src/canvas/taste/decisions.js';
import { compileDesignCandidate } from '../src/canvas/taste/generation.js';
import { controls } from '../src/canvas/taste/audit.js';
import { control,stack } from '../src/canvas/patterns.js';
import { compileNativeCanvas } from '../src/canvas/native.js';
import { parseProject } from '../src/config/load.js';
import { makeHost,products } from './design-v4-fixtures.js';
const plan=planDesign(products[0]!);
function rehash<T extends {hash:string}>(v:T):T {const body=Object.fromEntries(Object.entries(v).filter(([key])=>key!=='hash'));return {...v,hash:hashJson(body)};}
it('resolves composition before generation and binds it to the plan hash',()=>{
  const ir=createCompositionIR(plan);expect(ir).toEqual(createCompositionIR(plan));
  expect(validateCompositionIR(ir,plan).resolved.some(r=>r.slot==='data.view')).toBe(true);
  expect(()=>compileDesignCandidate(plan,makeHost(products[0]!), 'light',{...ir,family:'wrong'})).toThrow('hash');
  expect(compositionIRSchema.safeParse({...ir,regions:[{...ir.regions[0],slot:'invented'}]}).success).toBe(false);
});
it('rejects missing slots and incompatible components even with a valid hash',()=>{
  const ir=createCompositionIR(plan);ir.regions.pop();expect(()=>validateCompositionIR(rehash(ir),plan)).toThrow('Missing required');
  const wrong=createCompositionIR(plan);wrong.regions[0]!.component={preferred:'ChartCard',variant:'standard'};expect(()=>validateCompositionIR(rehash(wrong),plan)).toThrow('incompatible');
});
it('records explicit fallback and never silently substitutes an unavailable component',()=>{
  expect(resolveCompositionComponent({preferred:'Unavailable',fallback:'SideSheet',variant:'standard'},'experimental')).toMatchObject({selected:'SideSheet',fallbackUsed:true});
  expect(()=>resolveCompositionComponent({preferred:'Unavailable',variant:'standard'},'experimental')).toThrow('blocked');
  expect(()=>resolveCompositionComponent({preferred:'SideSheet',fallback:'FullScreenTask',variant:'standard'},'production')).toThrow('certification required');
});
it('semantic data slot changes the emitted native factory',()=>{
  const ir=createCompositionIR(plan);const data=ir.regions.find(r=>r.slot==='data.view')!;data.component={preferred:'RichList',variant:'cards'};
  const result=compileDesignCandidate(plan,makeHost(products[0]!), 'light',rehash(ir));
  expect(controls(result.files).find(n=>n.name==='pc_data')!.node.Properties.WrapCount).toBe('=If(PF_wide, 2, 1)');
  expect(result.metadata.pc_data?.recipe).toBe('RichList');
});
it('resolves three responsive contexts and focused tasks omit global navigation',()=>{
  const ir=createCompositionIR(plan);expect(new Set(ir.responsive.map(r=>r.navigation.preferred)).size).toBeGreaterThan(1);
  const focused=planDesign(products[0]!,{design:{archetype:'focused-task'}});
  const output=compileDesignCandidate(focused,makeHost(products[0]!));expect(controls(output.files).some(n=>/pc_(?:mobileNavigation|tabletNavigation|navigation)$/.test(n.name))).toBe(false);
});
it.each(fieldTypes)('emits an actual discovered control for %s with no native certification claim',type=>{
  const f=compileField('field',{label:'Value',type,value:['singleChoice','multiChoice','lookup','person'].includes(type)?'Table()':'Blank()',onChange:'Set(changed, true)',items:'Table({Value:"A"})',timeZone:'UTC',currencyCode:'USD',required:true});
  const nodes=controls({field:f.control});expect(nodes.some(n=>n.name==='field_input')).toBe(true);expect(f.invalid).not.toBe('false');expect(f.evidence.nativeValidated).toBe(false);
  const discovered=JSON.parse(readFileSync('docs/canvas/references/native-control-contracts.v41.json','utf8')).controls as Record<string,{inputProperties:string[]}>;
  for(const node of nodes.filter(n=>discovered[n.node.Control??'']))for(const prop of Object.keys(node.node.Properties))expect(discovered[node.node.Control!]!.inputProperties,`${type}/${node.node.Control}.${prop}`).toContain(prop);
  expect(nodes.find(n=>n.name==='field_input')!.node.Properties.DisplayMode).toContain('DisplayMode.Edit');
  expect(JSON.stringify(f.control)).not.toContain('TextInputCanvas.Type.Email');
});
it.each([['Picklist','singleChoice'],['MultiSelectPicklist','multiChoice'],['Boolean','boolean'],['Money','currency'],['Memo','multiline'],['Integer','number']])('maps Dataverse %s to %s',(type,expected)=>expect(mapDataverseField({type})).toBe(expected));
it('requires lookup targets, preserves date behavior and rejects unsupported metadata',()=>{
  expect(mapDataverseField({type:'Lookup',targets:['systemuser']})).toBe('person');
  expect(mapDataverseField({type:'Lookup',targets:['account','contact']})).toBe('lookup');
  expect(mapDataverseField({type:'DateTime',format:'DateOnly'})).toBe('date');
  expect(mapDataverseField({type:'DateTime'})).toBe('datetime');
  expect(()=>mapDataverseField({type:'Lookup'})).toThrow('target');expect(()=>mapDataverseField({type:'Image'})).toThrow('Unsupported');
});
it('requires typed selection data and currency/time contracts',()=>{
  const base={label:'Test',value:'Blank()',onChange:'false'};
  for(const type of ['singleChoice','multiChoice','lookup','person'])expect(()=>compileField('x',{...base,type})).toThrow('typed record table');
  expect(()=>compileField('x',{...base,type:'datetime'})).toThrow('UTC/Local');expect(()=>compileField('x',{...base,type:'currency'})).toThrow('currencyCode');
});
it('rejects mutation and unbounded references in custom validation',()=>{
  expect(safeFieldPredicate('Len({value}) > 2','x.Value')).toBe('Len((x.Value)) > 2');
  for(const expression of ['Patch(Data, {})','Set(x, 1); true','Other.Value > 2','Launch("https://example.test")','"unterminated'])expect(()=>safeFieldPredicate(expression,'x.Value')).toThrow();
});
it('enforces validation type/bounds, exposes errors and summary text',()=>{
  const base={label:'Amount',type:'number',value:'amount',onChange:'Set(amount, Self.Value)'};
  expect(()=>compileField('x',{...base,validation:[{rule:'length',min:1,message:'Too short'}]})).toThrow('incompatible');
  expect(()=>compileField('x',{...base,validation:[{rule:'range',min:9,max:2,message:'Range'}]})).toThrow('bounds');
  const f=compileField('x',{...base,required:true,readOnly:true,validation:[{rule:'range',min:1,max:10,message:'Use 1–10'}]});
  expect(f.error).toContain('Use 1–10');expect(JSON.stringify(f.control)).toContain('DisplayMode.View');
  expect(JSON.stringify(validationSummary('summary',[f],'attempted'))).toContain('Amount: ');
});
it('typed candidate gates commit and wizard progression with field predicates',()=>{
  const p=planDesign(products[3]!);const host=makeHost(products[3]!);host.fields[0]={...host.fields[0]!,type:'email',required:true} as typeof host.fields[number];
  const generated=compileDesignCandidate(p,host);const nodes=controls(generated.files);
  expect(nodes.find(n=>n.name==='pc_commit')!.node.Properties.OnSelect).toContain('IsMatch');
  expect(nodes.find(n=>n.name==='pc_form_next')!.node.Properties.OnSelect).toContain('pc_validationAttempted');
  expect(generated.typedFields).toHaveLength(1);
});
const source=(name='input',parent='container',formula='=Set(value, input.Value)')=>({ 'Screen1.pa.yaml':{Screens:{Screen1:{Properties:{},Children:[stack(parent,[control(name,'TextInput',{Value:'=value',OnChange:formula,AccessibleLabel:'="Input"'})])]}}}});
it('migration retains source, permits safe moves and explicitly maps replacements',()=>{
  const before=source();expect(planCanvasMigration(before,before).safe).toBe(true);
  expect(planCanvasMigration(before,source('input','other')).moved).toHaveLength(1);
  expect(planCanvasMigration(before,source('renamed','container','=Set(value, renamed.Value)'),[{from:'input',to:'renamed',slot:'form.fields'}]).safe).toBe(true);
  expect(mapFormulaIdentifiers('Set(input, "input"); \'input\'.Value',{input:'newInput'})).toBe('Set(newInput, "input"); \'input\'.Value');
});
it('migration blocks lost dependencies, ambiguous replacements, scope changes and unexpected writes',()=>{
  expect(planCanvasMigration(source(),source('other')).safe).toBe(false);
  expect(planCanvasMigration(source('input','container','=Set(value, Parent.Default)'),source('input','newContainer','=Set(value, Parent.Default)')).changed.some(c=>c.reason==='Binding scope changed')).toBe(true);
  expect(planCanvasMigration(source(),source('input','container','=Patch(Records, Defaults(Records), {})')).safe).toBe(false);
  expect(()=>planCanvasMigration(source(),source(),[{from:'input',to:'input',slot:'form.fields'},{from:'input',to:'input',slot:'form.fields'}])).toThrow('Ambiguous');
  expect(planCanvasMigration(source('input','container',"=Set(value, 'input'.Value)"),source('renamed','container',"=Set(value, 'input'.Value)"),[{from:'input',to:'renamed',slot:'form.fields'}]).safe).toBe(false);
});
it('task context captures origin and guards discard without owning the save',()=>{
  const actions=taskContextActions({originScreen:'App.ActiveScreen',originRecord:'selected',originNavigationState:'tab',dirty:'form.Unsaved',returnAction:'Navigate(pc_originScreen)',discardAction:'ResetForm(form)'});
  expect(actions.enter).toContain('pc_originRecord');expect(actions.exit).toContain('form.Unsaved');expect(actions.discard).toContain('ResetForm(form)');expect(JSON.stringify(actions)).not.toContain('SubmitForm');
  expect(JSON.stringify(compileDocumentPreview('doc',{kind:'external-link',title:'"Report"',url:'selected.Url',description:'"Read report"'}))).toContain('Launch(selected.Url)');
  expect(()=>compileDocumentPreview('doc',{kind:'pdf-viewer'})).toThrow();
});
it('dedicated tasks emit a separate screen in the same app and require origin contracts',()=>{
  const ir=createCompositionIR(plan);ir.regions.find(r=>r.slot==='form.review')!.component={preferred:'DedicatedPage',variant:'standard'};
  const host=makeHost(products[0]!);expect(()=>compileDesignCandidate(plan,host,'light',rehash(ir))).toThrow('taskContext');
  const generated=compileDesignCandidate(plan,{...host,taskContext:{originScreen:'App.ActiveScreen',originRecord:'pc_selected',originNavigationState:'pc_destination',dirty:'pc_changed',returnAction:'Navigate(pc_originScreen)',discardAction:'Set(pc_changed, false)'}},'light',rehash(ir));
  expect(generated.files).toHaveProperty('pc_taskScreen.pa.yaml');expect(JSON.stringify(generated.files)).toContain('pc_discardTask');
  expect(generated.manifest.requiresNewApplication).toBe(false);
});
it.each([0,1,4,24])('generates typed fixture data for %i records without Dataverse writes',count=>{
  const host=makeHost(products[0]!);host.fixtureRows=Array.from({length:count},(_,i)=>({title:i?'A very long identity '.repeat(8):'',subtitle:i%2?'':'Missing optional metadata',status:i%2?'Ready':'Waiting',value:i}));
  const generated=compileDesignCandidate(plan,host);expect(generated.preflight.staticPassed).toBe(true);expect(generated.manifest.remoteWrites).toBe(0);
  if(!count){expect(generated.host.items).toContain('FirstN(Table(');expect(generated.host.empty).toBe('true');}
});
it('certification refuses structural screenshots and incomplete evidence',()=>{
  expect(nativeCertificationSchema.safeParse({version:'4.1',captures:[{kind:'chromium-projection'}]}).success).toBe(false);
});
it('certification rejects non-verdict artifacts, stale captures, absent runtime cases and missing versions',async()=>{
  const path='docs/canvas/references/native-control-contracts.v41.json';const artifact={path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')};
  const files=source(),sourceHash=hashJson(files);
  const report=await certifyNative({version:'4.1',component:'TopNavigation',variant:'standard',sourceHash,planHash:plan.hash,environment:'Default',nonDisposable:true,appId:'11111111-1111-4111-8111-111111111111',controlVersions:{},compile:artifact,appChecker:artifact,accessibility:artifact,captures:[{kind:'native-player',width:390,theme:'light',image:artifact,sourceHash:'0'.repeat(64),planHash:plan.hash,review:'This intentionally invalid fixture cannot certify native rendering.'}],interactions:[{name:'open',passed:true,sourceHash,evidence:artifact}]},files,plan.hash,'.');
  expect(report.passed).toBe(false);expect(report.maturity).toBe('IMPLEMENTED');
  expect(report.failures).toContain('Native compile success not established');expect(report.failures).toContain('Stale native screenshot');expect(report.failures).toContain('Missing runtime case: selected-state');expect(report.failures).toContain('Actual control versions missing');
});
it('semantic treatments work with arbitrary identities and explicit dimensions change native properties',()=>{
  const files={fragment:control('unrelated_identifier','ModernText',{Text:'"Title"',Size:'=14'})};
  applySemanticTreatments(files,'typeset',{unrelated_identifier:'detail-title'},false);
  expect(controls(files)[0]!.node.Properties.Size).toBe('=PF_typeTitle');
  const p=planDesign(products[0]!,{design:{dimensions:{typographyExpression:9,decorativeIntensity:8}}});
  const generated=compileDesignCandidate(p,makeHost(products[0]!));
  expect(controls(generated.files).find(n=>n.name==='pc_recordHeader_title')!.node.Properties.Size).toBe('=PF_text_display');
  expect(dimensionExecution.filter(d=>d.status==='EXECUTABLE')).toHaveLength(8);
});
it('native entrypoint consumes composition and refuses silent legacy business replacement',()=>{
  const p=parseProject(readFileSync('examples/canvas-native-complaints/powercanvas.yaml','utf8'));const app=p.canvasApps!.complaintPortal!;
  app.nativeDesign={product:products[0]!,host:makeHost(products[0]!),stability:'experimental'};
  const bindings=JSON.parse(readFileSync('examples/canvas-native-complaints/bindings.json','utf8'));
  expect(()=>compileNativeCanvas(p,'complaintPortal',bindings)).toThrow('legacy business screens');
  app.screens={};expect(()=>compileNativeCanvas(p,'complaintPortal',bindings)).toThrow('flow binding migration');
  const result=compileNativeCanvas(p,'complaintPortal',{...bindings,flowSources:{}});
  expect(result.composition?.version).toBe('4.1');expect(result.manifest.appId).toBe(bindings.appId);expect(result.manifest.applicationBoundary.applicationCreates).toBe(0);
});
