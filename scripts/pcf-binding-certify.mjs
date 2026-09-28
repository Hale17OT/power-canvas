import {readFile,writeFile,mkdir} from 'node:fs/promises';
import process from 'node:process';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {create} from 'xmlbuilder2';
import {createHash} from 'node:crypto';
import {representativePCF} from '../dist/pcf/representatives.js';
import {resolveOracleHosts} from '../dist/pcf/binding-oracle.js';
import {parseControlDescriptions,serializeObservedBindings,bindingSemanticHash} from '../dist/pcf/binding-parser.js';
import {lowerModelDrivenFieldPCFBinding,parseModelDrivenFieldPCFBinding,compareFieldBinding} from '../dist/pcf/field-binding.js';
import {lowerModelDrivenDatasetPCFBinding,parseModelDrivenDatasetPCFBinding,compareDatasetBinding} from '../dist/pcf/dataset-binding.js';
import {bindingSourceHashes} from '../dist/pcf/binding-capabilities.js';
import {hashJson} from '../dist/core/json.js';
const root=process.cwd(),out=resolve('output/pcf-binding-offline',new Date().toISOString().replaceAll(':','-')),sources=bindingSourceHashes();await mkdir(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function run(exe,args){const p=spawnSync(exe,args,{cwd:root,windowsHide:true,encoding:'utf8',env:{...process.env,DOTNET_ROOT:resolve('.powercanvas/tooling/dotnet')}});if(p.status!==0)throw Error(p.stdout+p.stderr);return p.stdout;}
await writeFile(join(out,'tests.log'),run(process.execPath,['node_modules/vitest/vitest.mjs','run','tests/pcf-field-binding.test.ts','tests/pcf-dataset-binding.test.ts','tests/pcf-binding-oracle.test.ts']));
const pac=process.env.POWERCANVAS_PAC??resolve('.powercanvas/tooling/pac/pac.exe');const pacVersion=run(pac,['help']).match(/Version: ([^+\s]+)/)?.[1];if(!pacVersion)throw Error('Missing PAC version');
const results=[];
for(const kind of ['field','dataset']){
 const input=await readFile(`tests/pcf/binding/${kind==='field'?'field-final-v10c':'dataset-v10c'}.xml`,'utf8');const observed=resolveOracleHosts(input,[])[0];const c=representativePCF.components[kind==='field'?'ColorContrastField':'AdvancedDataGrid'];
 const references=kind==='field'?{component:'ColorContrastField',form:'fieldLab',host:'text',column:'text'}:{component:'AdvancedDataGrid',form:'datasetLab',host:'probes',table:'probe',view:'active',relationship:'categoryProbe'};
 const resolution={references,component:c,installedName:'pfx_PowerCanvas.'+c.constructor,hostUniqueId:observed.host.uniqueid,hostId:observed.host.id,...(kind==='field'?{columnLogicalName:'sample_text'}:{tableLogicalName:'sample_probe',viewId:'{00000000-0000-0000-0000-000000000010}',relationshipSchemaName:'sample_CategoryProbe',columns:{status:{logicalName:'sample_state',type:'choice'},title:{logicalName:'sample_name',type:'string'}},nativeFallback:observed.binding.controls[0]})};
 const desired={...references,staticInputs:{theme:'light'},...(kind==='field'?{boundProperty:'value',selections:{Phone:'native',Tablet:'native',Web:'pcf'}}:{dataset:'records',propertySets:{status:'status',title:'title'},selections:{Phone:'pcf',Tablet:'pcf',Web:'pcf'}})};
 const lower=kind==='field'?lowerModelDrivenFieldPCFBinding:lowerModelDrivenDatasetPCFBinding,parse=kind==='field'?parseModelDrivenFieldPCFBinding:parseModelDrivenDatasetPCFBinding,compare=kind==='field'?compareFieldBinding:compareDatasetBinding;
 const generated=input.replace(/<controlDescriptions>[\s\S]*?<\/controlDescriptions>/,serializeObservedBindings([lower(desired,resolution)]));
 if(hashJson(parse(input,resolution))!==hashJson(parse(generated,resolution))||compare(desired,resolution,input,true)!=='NO_OP'||compare({...desired,staticInputs:{theme:'dark'}},resolution,input,true)!=='UPDATE')throw Error('Semantic gate '+kind);
 const folder=join(out,kind);await mkdir(join(folder,'source/Other'),{recursive:true});const solution=create().ele('ImportExportXml',{version:'9.1.0.0',generatedBy:'CrmLive',SolutionPackageVersion:'9.1',languagecode:'1033'}).ele('SolutionManifest');solution.ele('UniqueName').txt('sample_BindingProof');solution.ele('LocalizedNames').ele('LocalizedName',{description:'Offline binding proof',languagecode:'1033'});solution.ele('Descriptions');solution.ele('Version').txt('1.0.0.0');solution.ele('Managed').txt('0');const publisher=solution.ele('Publisher');publisher.ele('UniqueName').txt('PowerCanvasLocal');publisher.ele('LocalizedNames').ele('LocalizedName',{description:'PowerCanvas Local',languagecode:'1033'});publisher.ele('Descriptions');publisher.ele('CustomizationPrefix').txt('sample');publisher.ele('CustomizationOptionValuePrefix').txt('70000');const roots=solution.ele('RootComponents');roots.ele('RootComponent',{type:'1',schemaName:'sample_oracle',behavior:'0'});roots.ele('RootComponent',{type:'60',id:'{00000000-0000-0000-0000-000000000010}',behavior:'0'});solution.ele('MissingDependencies');await writeFile(join(folder,'source/Other/Solution.xml'),solution.end({prettyPrint:true}));
 const doc=create().ele('ImportExportXml'),entity=doc.ele('Entities').ele('Entity');entity.ele('Name').txt('sample_oracle');entity.ele('EntityInfo').ele('entity',{Name:'sample_oracle'});const form=entity.ele('FormXml').ele('forms',{type:'main'}).ele('systemform');form.ele('formid').txt('{00000000-0000-0000-0000-000000000010}');form.ele('LocalizedNames').ele('LocalizedName',{description:'Offline binding oracle',languagecode:'1033'});form.ele('Descriptions');form.import(create(generated).root());doc.ele('Languages').ele('Language').txt('1033');await writeFile(join(folder,'source/Other/Customizations.xml'),doc.end({prettyPrint:true}));
 for(const [label,args]of [['pack-1',['pack','--folder',join(folder,'source'),'--zipfile',join(folder,'first.zip')]],['unpack',['unpack','--folder',join(folder,'unpacked'),'--zipfile',join(folder,'first.zip')]],['pack-2',['pack','--folder',join(folder,'unpacked'),'--zipfile',join(folder,'second.zip')]]])await writeFile(join(folder,label+'.log'),run(pac,['solution',...args,'--packagetype','Unmanaged']));
 const expected=bindingSemanticHash(parseControlDescriptions(generated));const packages=[];for(const name of ['first.zip','second.zip']){const path=join(folder,name);const xml=run('python',['-c','import zipfile,sys; print(zipfile.ZipFile(sys.argv[1]).read("customizations.xml").decode("utf-8-sig"))',path]);if(bindingSemanticHash(parseControlDescriptions(xml))!==expected)throw Error('Package semantics changed');packages.push({archive:name,sha256:hash(await readFile(path))});}
 results.push({kind,roundtrip:true,noOp:true,update:true,packageRoundtrip:true,fixtureHash:hash(input),packages,hostRuntime:false});
}
if(hashJson(sources)!==hashJson(bindingSourceHashes()))throw Error('Source changed during certification');
const certificate={version:1,grammar:'MICROSOFT_MAKER_ORACLE_V10C',sourceHashes:sources,toolchain:{node:process.version,pac:pacVersion},results,dimensions:{'modelDriven.fieldBinding.compile':true,'modelDriven.datasetBinding.compile':true,liveBindingApply:false,publishedHostRuntime:false},provenance:'Sanitized live Microsoft Maker oracles; static input and host surface bounded',tenantMutations:0};
await writeFile(join(out,'certificate.json'),JSON.stringify({...certificate,integrityHash:hashJson(certificate)},null,2));
if(process.argv.includes('--record-evidence'))await writeFile('tests/pcf/binding/certification.json',JSON.stringify({...certificate,integrityHash:hashJson(certificate)},null,2)+'\n');
console.log(JSON.stringify({output:out,results,tenantMutations:0}));

