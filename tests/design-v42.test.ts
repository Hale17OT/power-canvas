import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { hashJson } from '../src/core/json.js';
import { AuthoringMcpProvider, assertFreshSource, authoringDoctor, compareSources, makeSourceBundle, readNativeSource, studioIdentity, type SourceIdentity } from '../src/canvas/source-provider.js';
import { immutableMutationPaths, lowerBehaviorBindings, normalizeFormula } from '../src/canvas/behavior-ir.js';
import { planCanvasMigration } from '../src/canvas/migration.js';
import { parseControlCapability, validateFieldCapabilities } from '../src/canvas/capabilities.js';
import type { NativeFiles } from '../src/canvas/native-types.js';
import { lowerExistingComposition, compileExistingComposition } from '../src/canvas/existing-composition.js';
import { variantChecks, transitionEvidence, validateEvidenceBinding } from '../src/canvas/native-evidence.js';

const appId='11111111-1111-4111-8111-111111111111',environmentId='Default-22222222-2222-4222-8222-222222222222';
const identity:SourceIdentity={appId,environmentId,sessionId:'test-session'};
const studioUrl=`https://make.powerapps.com/e/${environmentId}/canvas/?action=edit&app-id=%2Fproviders%2FMicrosoft.PowerApps%2Fapps%2F${appId}`;
const response=(text='Synced 2 files')=>({content:[{type:'text',text}]});
const files=(formula='=If(form.Valid, SubmitForm(form))'):NativeFiles=>({'App.pa.yaml':{App:{Properties:{StartScreen:'=Screen1'}}},'Screen1.pa.yaml':{Screens:{Screen1:{Properties:{},Children:[{form:{Control:'Form',Properties:{DataSource:"='Records'",Item:'=selected'}}},{save:{Control:'Button',Properties:{OnSelect:formula,Width:'=120'}}}]}}}});
const bundle=(mode:'authoringMcp'|'pacDownload'='authoringMcp',f=files())=>makeSourceBundle(f,identity,mode,['Records'],['Check'],response());

describe('fresh source boundary',()=>{
  it('extracts full Studio identity and rejects a different origin or malformed app',()=>{
    expect(studioIdentity(studioUrl)).toEqual({appId,environmentId,environmentCategory:'prod'});
    expect(()=>studioIdentity(studioUrl.replace('make.powerapps.com','example.com'))).toThrow('origin');
    expect(()=>studioIdentity(studioUrl.replace(appId,'wrong'))).toThrow('edit URL');
  });
  it.each([{}, {'App.pa.yaml':{}}, {'App.pa.yaml':{App:{Properties:{}}}}])('rejects empty or partial source',f=>expect(()=>makeSourceBundle(f,identity,'authoringMcp',[],[],response())).toThrow());
  it('rejects symbolic tool success with zero files',()=>expect(()=>makeSourceBundle(files(),identity,'authoringMcp',[],[],response('No files returned from server. Nothing written.'))).toThrow('zero-file'));
  it('requires actual new files from an authoring provider',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'pc-source-'));try{
      const provider=new AuthoringMcpProvider(async()=>response(),identity,[],[]);
      await expect(provider.read(join(dir,'missing'))).rejects.toThrow();
      await writeFile(join(dir,'stale.pa.yaml'),'stale');await expect(provider.read(dir)).rejects.toThrow('fresh and empty');
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('requires nonempty App and Screens rather than any YAML',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'pc-source-'));try{
      await mkdir(join(dir,'Src'));await writeFile(join(dir,'Src','App.pa.yaml'),'');await expect(readNativeSource(dir)).rejects.toThrow('Empty');
      for(const [name,value] of Object.entries(files()))await writeFile(join(dir,'Src',name),stringify(value));
      expect(await readNativeSource(dir)).toEqual(files());
      await writeFile(join(dir,'App.pa.yaml'),stringify(files()['App.pa.yaml']));await expect(readNativeSource(dir)).rejects.toThrow('Duplicate');
    }finally{await rm(dir,{recursive:true,force:true});}
  });
  it('invalidates changed, stale, future and mismatched-session source',()=>{
    const b=bundle();expect(()=>assertFreshSource(b,identity)).not.toThrow();
    expect(()=>assertFreshSource(b,{...identity,sessionId:'other'})).toThrow('session');
    expect(()=>assertFreshSource(b,identity,Date.parse(b.snapshot.acquiredAt)+900001)).toThrow('expired');
    expect(()=>assertFreshSource(b,identity,Date.parse(b.snapshot.acquiredAt)-1)).toThrow('expired');
    expect(()=>assertFreshSource({...b,files:files('=SubmitForm(form)')},identity)).toThrow('changed');
    const corrupt=structuredClone(b);corrupt.snapshot.screenHashes.Screen1='a'.repeat(64);expect(()=>assertFreshSource(corrupt,identity)).toThrow('inventory');
  });
  it('compares semantics across serialization versions, not raw bytes',()=>{
    const a=bundle(),f=files('= If ( form.Valid , SubmitForm ( form ) )');
    (f['Screen1.pa.yaml'] as {Screens:{Screen1:{Children:{save?:{Control:string}}[]}}}).Screens.Screen1.Children[1]!.save!.Control='Button@1.0';
    const b=bundle('pacDownload',f);expect(a.snapshot.sourceHash).not.toBe(b.snapshot.sourceHash);expect(compareSources(a,b).status).toBe('MATCH');
  });
  it.each(['formula','dataSource','app','provider'])('blocks material %s disagreement',kind=>{
    const a=bundle(),b=bundle('pacDownload',kind==='formula'?files('=SubmitForm(form)'):files());
    if(kind==='dataSource')b.snapshot.dataSources=['Other'];if(kind==='app')b.snapshot.identity.appId='11111111-1111-4111-8111-111111111112';if(kind==='provider')b.snapshot.mode='authoringMcp';
    expect(compareSources(a,b).status).toBe('FRESH SOURCE UNRESOLVED');
  });
  it('doctor cannot pass with authentication/discovery alone',()=>{
    const input={studioUrl,expected:identity,connected:identity,coauthoringEnabled:true,dotnetMajor:10,workspaceWritable:true,tools:['connect','sync_canvas','compile_canvas','list_controls','describe_control','list_apis','list_data_sources'],controls:response('Power Apps Controls:\n- TextInput'),apis:response('Available APIs: 0'),dataSources:response('Available Data Sources: 0')};
    expect(authoringDoctor(input).passed).toBe(false);expect(authoringDoctor({...input,source:bundle()}).passed).toBe(true);
    expect(authoringDoctor({...input,source:bundle(),dotnetMajor:8,coauthoringEnabled:false}).failures).toHaveLength(2);
  });
  it('gates official native compilation behind source agreement and review, never saves/publishes',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'pc-preview-'));const calls:string[]=[];
    try{
      const candidate=join(dir,'candidate');await mkdir(candidate);for(const [name,value]of Object.entries(files()))await writeFile(join(candidate,name),stringify(value));
      const provider=new AuthoringMcpProvider(async(name,args)=>{calls.push(name);if(name==='sync_canvas'){await mkdir(String(args.directoryPath));for(const [file,value]of Object.entries(files()))await writeFile(join(String(args.directoryPath),file),stringify(value));return response();}return response('✓ Validation PASSED\nFiles validated: 2');},identity,['Records'],['Check']);
      const review={candidateHash:hashJson(files()),baselineHash:hashJson(files()),reviewed:false,autoSaveDisabled:true};
      await expect(provider.preview(candidate,bundle(),bundle('pacDownload'),review,join(dir,'before'),join(dir,'after'))).rejects.toThrow('review');expect(calls).toEqual([]);
      const result=await provider.preview(candidate,bundle(),bundle('pacDownload'),{...review,reviewed:true},join(dir,'before'),join(dir,'after'));
      expect(result.accepted).toBe(true);expect(result.exactReadback).toBe(true);expect(result.appSaves).toBe(0);expect(result.appPublishes).toBe(0);expect(calls).toEqual(['sync_canvas','compile_canvas','sync_canvas']);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
});
describe('behavior bindings and immutable commit paths',()=>{
  it('ignores whitespace outside literals without merging tokens',()=>{
    expect(normalizeFormula('= If( x , "a b" )').tokens).toEqual(normalizeFormula('If(x,"a b")').tokens);
    expect(normalizeFormula('a b').tokens).not.toEqual(normalizeFormula('ab').tokens);
    expect(normalizeFormula('"a b"').tokens).not.toEqual(normalizeFormula('"ab"').tokens);
    expect(normalizeFormula('/* unsupported */ x').complete).toBe(false);
    expect(normalizeFormula('"unterminated').complete).toBe(false);
  });
  it('normalizes qualified self scope only when identity is known',()=>{
    expect(normalizeFormula('Self.Value',{self:'input'}).tokens).toEqual(normalizeFormula('input.Value').tokens);
    expect(normalizeFormula('"Self.Value"',{self:'input'}).tokens).toEqual(['"Self.Value"']);
  });
  it('accepts safe serialization normalization, retaining the full guard',()=>{
    const plan=planCanvasMigration(files(),files('= If (form.Valid, SubmitForm(form))'));
    expect(plan.safe).toBe(true);expect(plan.classifications.every(c=>c.category==='SEMANTICALLY_EQUIVALENT')).toBe(true);
  });
  it.each(['=SubmitForm(form)','=If(form.Valid,SubmitForm(other))','=If(form.Valid,SubmitForm(form);SubmitForm(form))','=false'])('blocks changed commit path: %s',formula=>{
    expect(immutableMutationPaths(files(),files(formula)).preserved).toBe(false);expect(planCanvasMigration(files(),files(formula)).safe).toBe(false);
  });
  it('protects flow invocation and its arguments; ignores invocation-looking strings',()=>{
    const a=files('=If(!busy, Check.Run(id, reason))');expect(lowerBehaviorBindings(a).mutationPaths).toHaveLength(1);
    expect(immutableMutationPaths(a,files('=If(!busy, Check.Run(id, "different"))')).preserved).toBe(false);
    expect(lowerBehaviorBindings(files('="Check.Run(id)"')).mutationPaths).toHaveLength(0);
  });
  it('does not claim type checking from a lexical behavioral inventory',()=>{
    const ir=lowerBehaviorBindings(files());expect(ir.bindings.find(b=>b.role==='submit')?.expression.typeStatus).toBe('NATIVE_CHECK_REQUIRED');
    expect(ir.sourceHash).toBe(hashJson(files()));expect(ir.mutationPaths).toHaveLength(1);
  });
  it('requires exact explicit approval for intentional behavior, and never relaxes commit immutability',()=>{
    const a=files('=SetFocus(create)'),b=files('=SetFocus(edit)');
    const approval={control:'save',property:'OnSelect',beforeFormulaHash:hashJson('=SetFocus(create)'),afterFormulaHash:hashJson('=SetFocus(edit)'),reason:'Explicitly approved accessibility focus correction',authorization:'explicit-user-approval'};
    expect(planCanvasMigration(a,b).safe).toBe(false);expect(planCanvasMigration(a,b,[],[approval]).safe).toBe(true);
    expect(planCanvasMigration(a,files('=SetFocus(other)'),[],[approval]).safe).toBe(false);
    const submitApproval={...approval,beforeFormulaHash:hashJson('=SubmitForm(form)'),afterFormulaHash:hashJson('=SubmitForm(other)')};
    expect(planCanvasMigration(files('=SubmitForm(form)'),files('=SubmitForm(other)'),[],[submitApproval]).safe).toBe(false);
  });
});
describe('capability honesty',()=>{
  it('does not confuse provider versions with control versions',()=>{
    const c=parseControlCapability(response('# Control TextInput\nControl creation keywords:\n```yaml\nControl: TextInput\n```\nInput Properties:\n - Value: Text\nOutput Properties:\n - Value: Text'));
    expect(c.version).toBeNull();expect(c.versionStatus).toBe('CONTROL VERSION UNVERIFIED');expect(c.inputProperties).toEqual(['Value']);
  });
  it('classifies all sixteen fields and fails closed without discovered controls',()=>{
    const result=validateFieldCapabilities({});expect(result).toHaveLength(16);expect(result.every(r=>r.status==='FALLBACK_REQUIRED'&&!r.nativeCompile&&!r.nativeRuntime)).toBe(true);
  });
});
describe('existing composition lowers presentation separately from business behavior',()=>{
  it('round-trips current design without legacy generation or new controls',()=>{const original=files(),ir=lowerExistingComposition(original),result=compileExistingComposition(ir.composition,ir.behavior,original);expect(result.files).toEqual(original);expect(result.legacyGeneratorInvoked).toBe(false);expect(result.migration.mutationPaths.preserved).toBe(true);});
  it('allows a presentation-only width change through IR',()=>{const original=files(),ir=lowerExistingComposition(original);ir.composition.nodes.find(n=>n.name==='save')!.presentation.Width='=144';const {hash:_,...body}=ir.composition;void _;ir.composition.hash=hashJson(body);expect(compileExistingComposition(ir.composition,ir.behavior,original).migration.safe).toBe(true);});
  it('rejects lost binding and presentation shadowing of a submit command',()=>{const original=files(),ir=lowerExistingComposition(original);ir.composition.nodes.find(n=>n.name==='save')!.presentation.OnSelect='=SubmitForm(other)';const {hash:_,...body}=ir.composition;void _;ir.composition.hash=hashJson(body);expect(()=>compileExistingComposition(ir.composition,ir.behavior,original)).toThrow('shadowed');});
  it('rejects duplicate placement rather than duplicating a commit control',()=>{const original=files(),ir=lowerExistingComposition(original);ir.composition.nodes.find(n=>n.name==='Screen1')!.children.push('save');const {hash:_,...body}=ir.composition;void _;ir.composition.hash=hashJson(body);expect(()=>compileExistingComposition(ir.composition,ir.behavior,original)).toThrow('duplicate');});
});
describe('native evidence applicability and lifecycle',()=>{
  it('does not require wizard steps or dismissal for static variants',()=>{expect(variantChecks('TaskForm','single-column').checks).not.toContain('step-navigation');expect(variantChecks('TaskForm','wizard').checks).toContain('step-navigation');expect(variantChecks('Skeleton','standard').checks).not.toContain('interaction');expect(variantChecks('SideSheet','standard').checks).toContain('focus-return');});
  it('blocks skipped stages and resets on source change',()=>{expect(()=>transitionEvidence('UNVERIFIED','certify',{})).toThrow('blocked');expect(transitionEvidence('CERTIFIED','sourceChanged',{})).toBe('UNVERIFIED');expect(transitionEvidence('UNVERIFIED','acquire',{freshSource:true,identity:true})).toBe('SOURCE_ACQUIRED');expect(()=>transitionEvidence('PLANNED','compile',{officialValidation:true})).toThrow('blocked');});
  it('binds logical geometry independently from image width or browser zoom',()=>{const s=bundle().snapshot;const expected={sourceHash:s.sourceHash,designPlanHash:'a'.repeat(64),registryHash:'b'.repeat(64),...identity};const evidence={version:'4.2',source:s,designPlanHash:expected.designPlanHash,registryHash:expected.registryHash,component:'RecordHeader',variant:'standard',sessionId:identity.sessionId,theme:'light',viewport:{requestedWidth:390,browserWidth:313,browserHeight:844,cssWidth:391,cssHeight:1007,logicalWidth:390,logicalHeight:952,devicePixelRatio:.8,stableSamples:3}};expect(validateEvidenceBinding(evidence,expected).passed).toBe(true);expect(validateEvidenceBinding({...evidence,viewport:{...evidence.viewport,logicalWidth:1799,stableSamples:1}},expected).passed).toBe(false);expect(validateEvidenceBinding(evidence,{...expected,registryHash:'c'.repeat(64)}).passed).toBe(false);});
});
