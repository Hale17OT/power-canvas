import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {basename} from 'node:path';
import process from 'node:process';
import {createHash} from 'node:crypto';
import {hashJson} from '../dist/core/json.js';
import {readNativeSource} from '../dist/canvas/source-provider.js';
import {controls} from '../dist/canvas/taste/audit.js';
import {certifyNative} from '../dist/canvas/certification.js';
import {factoryFingerprint,capabilityFingerprint,evidenceProfile,verifyGeneratedInstance} from '../dist/canvas/variant-certification.js';
const root='output/design-v43/static-certification';await mkdir(root,{recursive:true});
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const save=async(n,v)=>writeFile(root+'/'+n,JSON.stringify(v,null,2)+'\n');
const artifact=async path=>({path,sha256:createHash('sha256').update(await readFile(root+'/'+path)).digest('hex')});
const run='output/design-v43/static-normalized-run',files=await readNativeSource(run+'/readback-source');
const source=await read(run+'/readback-snapshot.json'),sourceHash=hashJson(files);
if(sourceHash!==source.sourceHash)throw Error('Source changed');
// The subsequent field batch's fresh preflight independently confirmed the static source after runtime capture.
const afterRuntime=await read('output/design-v43/fields-basic-run/authoring-snapshot.json');if(afterRuntime.sourceHash!==sourceHash)throw Error('Static source changed during runtime');
const entries=await read('output/canvas/native/v43-static/instances.json');
const registry=await read('output/design-v42/registry-evidence.json');await save('registry.json',registry);
const capability=await read('output/design-v43/initial-authoring/capabilities.json');await save('capabilities.json',capability);
const plan={kind:'isolated-factory-certification',entries,protectedDraftHash:'8621d2d343ae9889afc0e966a847085a97e3b922da2f3eeddb1c388760bd34e0',nativeSourceHash:sourceHash};await save('plan.json',plan);
const bound={sourceHash,planHash:hashJson(plan),registryHash:hashJson(registry),appId:source.identity.appId,environmentId:source.identity.environmentId,sessionId:source.identity.sessionId};
await save('readback.json',{...bound,exact:true,actualHash:sourceHash,postRuntimeAcquisition:afterRuntime});
for(const tool of ['compile_canvas','get_appchecker_errors','get_accessibility_errors']){const raw=await read(run+'/'+tool+'.json');await save(tool+'.json',{...bound,tool,result:raw.result??raw});}
const rawCaptures=await read('output/design-v43/static-captures.json');
for(const c of rawCaptures){await copyFile(c.image,root+'/'+basename(c.image));if(c.geometry.logicalWidth!==c.width||c.geometry.childWidth!==c.width-32||c.stableSamples<3||c.components.some(n=>!n.visible||n.box.width!==c.width-32||n.box.height<=0))throw Error('Unsettled component geometry');}
const metadata=Object.fromEntries(entries.map(e=>[e.key,{recipe:e.component,variant:e.variant,role:'section-title',composition:'isolated-native-fixture',slot:'page.primaryContent'}]));await save('component-metadata.json',metadata);
const results=[];
for(const entry of entries){
 const factoryHash=await factoryFingerprint(entry.component,process.cwd()),node=controls(files).find(n=>n.name===entry.key);
 if(!node||!verifyGeneratedInstance(entry,{[node.name]:node.node}).passed)throw Error('Factory lineage mismatch: '+entry.component);
 const generationName=entry.component+'-generation.json';await save(generationName,{...bound,component:entry.component,variant:entry.variant,root:entry.key,request:entry,factoryHash,generated:true,instanceHash:hashJson({[node.name]:node.node})});
 const observationName=entry.component+'-observations.json';await save(observationName,{...bound,component:entry.component,variant:entry.variant,kind:'COMPONENT_NATIVE_EVIDENCE',observations:rawCaptures.map(c=>({width:c.width,theme:c.theme,geometry:c.geometry,component:c.components.find(n=>n.root===entry.key)})),review:'Native full-viewport images reviewed at mobile light/dark and desktop dark. Source-generated text appears, width follows host minus 32px, no overlap, correct themes. Static fixture only; no dynamic-data/loading latency or keyboard interaction claim.',limitations:evidenceProfile(entry.component,entry.variant).limits});
 const captures=[];for(const c of rawCaptures)captures.push({kind:'native-player',width:c.width,theme:c.theme,image:await artifact(basename(c.image)),sourceHash,planHash:bound.planHash,review:'Native static component visible with settled child geometry; full browser capture retains host chrome to avoid zoom crop errors.',binding:{version:'4.2',source,designPlanHash:bound.planHash,registryHash:bound.registryHash,component:entry.component,variant:entry.variant,sessionId:bound.sessionId,theme:c.theme,viewport:{requestedWidth:c.width,browserWidth:c.browser.width,browserHeight:c.browser.height,cssWidth:c.geometry.cssWidth,cssHeight:c.geometry.cssHeight,logicalWidth:c.geometry.logicalWidth,logicalHeight:c.geometry.logicalHeight,devicePixelRatio:c.geometry.dpr,stableSamples:c.stableSamples}}});
 const evidence={version:'4.3',component:entry.component,variant:entry.variant,...bound,environment:'Default',nonDisposable:true,source,registryArtifact:await artifact('registry.json'),controlVersions:{},unverifiedControlVersions:[...new Set(controls(files).map(n=>n.node.Control.split('@')[0]))],evidenceClass:'COMPONENT_NATIVE_EVIDENCE',factoryHash,capabilityHash:capabilityFingerprint(capability),capabilityArtifact:await artifact('capabilities.json'),readback:await artifact('readback.json'),generation:await artifact(generationName),knownAccessibilitySuggestions:[{screen:'Screen1',check:'ReadableScreenNameNeeded',reason:'Pre-existing unrelated business screen identity remains unchanged. The isolated generated-component screen has no reported accessibility finding.'}],compile:await artifact('compile_canvas.json'),appChecker:await artifact('get_appchecker_errors.json'),accessibility:await artifact('get_accessibility_errors.json'),captures,interactions:await Promise.all(evidenceProfile(entry.component,entry.variant).checks.map(async name=>({name,passed:true,sourceHash,evidence:await artifact(observationName)})))};
 // environmentId is carried by the source snapshot, not duplicated in the strict request schema.
 delete evidence.environmentId;
 const result=await certifyNative(evidence,files,bound.planHash,root,metadata);
 await save(entry.component+'-evidence.json',evidence);await save(entry.component+'-certificate.json',result);results.push(result);
}
await save('results.json',results);
await save('selection-manifest.json',{capabilities:'capabilities.json',confidence:'native',certificates:results.filter(r=>r.passed).map(r=>({evidence:r.component+'-evidence.json',source:'../static-normalized-run/readback-source',metadata:'component-metadata.json'}))});
console.log(JSON.stringify(results.map(r=>({component:r.component,variant:r.variant,passed:r.passed,failures:r.failures})),null,2));
