import {pcfSourceHashes} from '../dist/pcf/capabilities.js';
import process from 'node:process';
import {mkdir,readFile,writeFile,copyFile,symlink,cp,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {create} from 'xmlbuilder2';
import {representativePCF} from '../dist/pcf/representatives.js';
import {writePCFProject,artifactInventory,sha256,pcfToolchain,assertBuildOwnership} from '../dist/pcf/build.js';
import {hashJson} from '../dist/core/json.js';
import {runPCFHarness} from './pcf-harness.mjs';
const root=resolve('.');const output=join(root,'output/pcf-v1/run-'+new Date().toISOString().replaceAll(':','-'));await mkdir(output,{recursive:true});
const env={...process.env,DOTNET_ROOT:join(root,'.powercanvas/tooling/dotnet'),POWERPLATFORM_CLI_TELEMETRY_OPTOUT:'true'};
function run(exe,args,cwd,log){const r=spawnSync(exe,args,{cwd,env,encoding:'utf8',maxBuffer:20*1024*1024,windowsHide:true});const text=(r.stdout??'')+(r.stderr??'');if(log)return writeFile(log,text).then(()=>{if(r.error||r.status!==0||/\[build\] Failed/.test(text))throw Error('Local tool failed; see '+log);return text;});if(r.error||r.status!==0)throw Error(text||String(r.error));return text;}
const save=async(name,data)=>writeFile(join(output,name+'.json'),JSON.stringify(data,null,2)+'\n');
const sourceHashesAtStart=pcfSourceHashes(root);
console.log('PCF local certification: '+output);
await run(process.execPath,[join(root,'node_modules/vitest/vitest.mjs'),'run','tests/pcf.test.ts'],root,join(output,'component-tests.log'));
const restore=join(output,'toolchain');await mkdir(restore);for(const f of ['package.json','package-lock.json'])await copyFile(join(root,'pcf/Timeline',f),join(restore,f));
// npm CLI is located beside node on Windows; avoid shell interpolation.
const npmCli=join(process.execPath,'..','node_modules/npm/bin/npm-cli.js');
await run(process.execPath,[npmCli,'ci','--ignore-scripts','--no-audit','--no-fund'],restore,join(output,'restore.log'));
for(const [name,expected]of [['pcf-scripts',pcfToolchain.pcfScripts],['typescript',pcfToolchain.typescript],['@types/powerapps-component-framework',pcfToolchain.frameworkTypes]]){const actual=JSON.parse(await readFile(join(restore,'node_modules',name,'package.json'),'utf8')).version;if(actual!==expected)throw Error('Toolchain mismatch '+name);}
const npm=run(process.execPath,[npmCli,'--version'],root).trim();const toolchain={...pcfToolchain,actualNode:process.version,npm,pac:'2.12.2'};await save('toolchain',toolchain);
const builds=[];const components=[];const entries=Object.entries(representativePCF.components);
for(let cycle=1;cycle<=3;cycle++){
 const cycleDir=join(output,'build-'+cycle);await mkdir(cycleDir);
 for(const [key,c]of entries){const project=join(cycleDir,key);const source=await writePCFProject(root,project,c);await symlink(join(restore,'node_modules'),join(project,'node_modules'),'junction');
  console.log('Build '+cycle+'/3 '+key);await run(process.execPath,[join(restore,'node_modules/pcf-scripts/bin/pcf-scripts.js'),'build','--buildMode','production'],project,join(cycleDir,key+'.log'));
  const artifacts=await artifactInventory(join(project,'out/controls',key));if(!artifacts.some(a=>a.path==='bundle.js')||!artifacts.some(a=>a.path==='ControlManifest.xml'))throw Error('Missing compiled artifact');
  builds.push({cycle,key,...source,artifacts,artifactHash:hashJson(artifacts)});if(cycle===1)components.push({key,...source});
 }
}
for(const [key]of entries){const runs=builds.filter(b=>b.key===key);if(new Set(runs.map(b=>b.artifactHash)).size!==1)throw Error('Unexplained nondeterminism: '+key);}
await save('builds',builds);await save('components',components);await save('manifest-validation',{validator:'Microsoft pcf-scripts '+pcfToolchain.pcfScripts,passed:true,identities:components.map(c=>c.identity)});
const sourceDir=join(output,'solution');await mkdir(join(sourceDir,'Other'),{recursive:true});
const xml=create({version:'1.0',encoding:'utf-8'}).ele('ImportExportXml',{version:'9.1.0.0',generatedBy:'CrmLive',SolutionPackageVersion:'9.1',languagecode:'1033','xmlns:xsi':'http://www.w3.org/2001/XMLSchema-instance'}).ele('SolutionManifest');
xml.ele('UniqueName').txt('pcv_PCFLocalProof');xml.ele('LocalizedNames').ele('LocalizedName',{description:'PowerCanvas PCF Local Proof',languagecode:'1033'});xml.ele('Descriptions');xml.ele('Version').txt('1.0.0.0');xml.ele('Managed').txt('0');const publisher=xml.ele('Publisher');publisher.ele('UniqueName').txt('PowerCanvasLocal');publisher.ele('LocalizedNames').ele('LocalizedName',{description:'PowerCanvas Local',languagecode:'1033'});publisher.ele('Descriptions');publisher.ele('CustomizationPrefix').txt('pcv');publisher.ele('CustomizationOptionValuePrefix').txt('70000');const roots=xml.ele('RootComponents');
for(const [key,c]of entries){const identity='pcv_'+c.namespace+'.'+c.constructor;roots.ele('RootComponent',{type:'66',schemaName:identity,behavior:'0'});await cp(join(output,'build-1',key,'out/controls',key),join(sourceDir,'Controls',identity),{recursive:true});}
xml.ele('MissingDependencies');await writeFile(join(sourceDir,'Other/Solution.xml'),xml.end({prettyPrint:true}));
await writeFile(join(sourceDir,'Other/Customizations.xml'),'<?xml version="1.0"?><ImportExportXml><Entities/><Roles/><Workflows/><CustomControls/><Languages><Language>1033</Language></Languages></ImportExportXml>');
const pac=process.env.POWERCANVAS_PAC??join(root,'.powercanvas/tooling/pac/pac.exe');const archive=join(output,'PCFLocalProof.zip');await run(pac,['solution','pack','--zipfile',archive,'--folder',sourceDir,'--packagetype','Unmanaged'],root,join(output,'package.log'));
const pacVersion=run(pac,['help'],root).match(/Version: ([^+\s]+)/)?.[1];if(!pacVersion)throw Error('PAC version missing from package evidence');toolchain.pac=pacVersion;await save('toolchain',toolchain);
const archiveHash=sha256(await readFile(archive));
const membership=JSON.parse(run('python',['-c',`import zipfile,json,xml.etree.ElementTree as E,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n s=E.fromstring(z.read('solution.xml')); rows=[]\n for n in z.namelist():\n  if n.endswith('/ControlManifest.xml'):\n   c=E.fromstring(z.read(n)).find('control'); resources=[r.attrib['path'] for r in c.find('resources')]; rows.append(dict(c.attrib,resources=resources,present=all(n.rsplit('/',1)[0]+'/'+p in z.namelist() for p in resources)))\n print(json.dumps(dict(components=rows,solution=s.findtext('SolutionManifest/UniqueName'),publisher=s.findtext('SolutionManifest/Publisher/UniqueName'),prefix=s.findtext('SolutionManifest/Publisher/CustomizationPrefix'),managed=s.findtext('SolutionManifest/Managed'))))`,archive],root));
if(membership.solution!=='pcv_PCFLocalProof'||membership.publisher!=='PowerCanvasLocal'||membership.prefix!=='pcv'||membership.managed!=='0'||membership.components.length!==3||entries.some(([,c])=>!membership.components.some(m=>m.namespace===c.namespace&&m.constructor===c.constructor&&m.version===c.version&&m.present)))throw Error('Package membership failed');
await save('package-membership',{...membership,archiveHash,verified:true});
const receipts=[];for(const [key,c]of entries){const b=builds.find(b=>b.key===key&&b.cycle===1);const project=join(output,'build-1',key,c.constructor);const proof={...b,packageHash:archiveHash};const ownership=assertBuildOwnership(c,proof,{source:await readFile(join(project,'index.ts'),'utf8'),manifest:await readFile(join(project,'ControlManifest.Input.xml'),'utf8'),artifacts:b.artifacts,packageBytes:await readFile(archive)});receipts.push({identity:b.identity,version:c.version,ownership,sourceHash:b.sourceHash,manifestHash:b.manifestHash,artifactHash:b.artifactHash,packageHash:archiveHash,dependencyLockHash:b.dependencyLockHash,revision:1,scope:'LOCAL_BUILD_AND_PACKAGE_ONLY',tenantOwnership:false});}await save('ownership',receipts);
const runtime=await runPCFHarness(output,entries);await save('local-runtime',runtime);await save('accessibility',runtime.accessibility);
await save('security-audit',{scope:'Bounded static generated source checks; not security certification',findings:components.flatMap(c=>c.security),networkEnabled:false});
const lock=JSON.parse(await readFile(join(restore,'package-lock.json'),'utf8'));await save('dependency-audit',{runtimeDependencies:[],devDependencies:lock.packages[''].devDependencies,packages:Object.entries(lock.packages).filter(([p])=>p).map(([p,v])=>({package:p,version:v.version,license:v.license??'UNRECORDED'})),bundles:builds.filter(b=>b.cycle===1).map(b=>({key:b.key,bytes:b.artifacts.find(a=>a.path==='bundle.js').bytes,warning:b.artifacts.find(a=>a.path==='bundle.js').bytes>100*1024?'Above local 100 KiB review budget (not a platform limit)':null})),performance:'UNPROVEN'});
await save('capabilities',{schema:true,compile:true,manifest:true,build:true,package:true,localRuntime:runtime.passed,liveImport:false,powerAppsRuntime:false,react:false});
const files=[];for(const path of (await readdir(output,{withFileTypes:true})).filter(p=>p.isFile()).map(p=>p.name).sort()){const bytes=await readFile(join(output,path));files.push({path,hash:sha256(bytes),bytes:bytes.length});}await save('integrity-audit',{files,hash:hashJson(files),tenantMutations:0});console.log('Local evidence written: '+output);

if(hashJson(sourceHashesAtStart)!==hashJson(pcfSourceHashes(root)))throw Error('Source changed during certification');
const certificate={version:1,sourceHashes:sourceHashesAtStart,toolchain,identities:components.map(c=>({identity:c.identity,version:c.version,manifestHash:c.manifestHash,sourceHash:c.sourceHash})),dimensions:{'component.schema':true,'component.compile':true,'component.manifest':true,'component.build':true,'component.package':true,field:true,dataset:true,localHarness:runtime.passed,'modelDriven.fieldBinding':false,'modelDriven.datasetBinding':false,'canvas.binding':true,liveImport:false,powerAppsRuntime:false,react:false},evidenceIntegrity:hashJson(files),packageHash:archiveHash};
if(process.argv.includes('--record-evidence')){await mkdir(join(root,'tests/pcf'),{recursive:true});await writeFile(join(root,'tests/pcf/certification.json'),JSON.stringify({...certificate,integrityHash:hashJson(certificate)},null,2)+'\n');}
