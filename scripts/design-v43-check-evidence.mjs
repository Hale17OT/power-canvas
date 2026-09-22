// Optional local integration proof against real native artifacts; no tenant operations.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {certifyNative} from '../dist/canvas/certification.js';
import {loadCertifiedSelection} from '../dist/canvas/certified-selection.js';
import {resolveCompositionComponent} from '../dist/canvas/composition-ir.js';
import {readNativeSource} from '../dist/canvas/source-provider.js';
const root='output/design-v43/static-certification';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const evidence=await read(root+'/RecordHeader-evidence.json'),metadata=await read(root+'/component-metadata.json');
const files=await readNativeSource('output/design-v43/static-normalized-run/readback-source');
const cases=[
 ['missing runtime',e=>{e.interactions=e.interactions.filter(i=>i.name!=='content-visible');}],
 ['failed runtime',e=>{e.interactions[0].passed=false;}],
 ['missing mobile capture',e=>{e.captures=e.captures.filter(c=>c.width!==390);}],
 ['stale factory',e=>{e.factoryHash='0'.repeat(64);}],
 ['changed capability',e=>{e.capabilityHash='0'.repeat(64);}],
 ['wrong variant',e=>{e.variant='mobile';}],
 ['wrong logical width',e=>{e.captures[0].binding.viewport.logicalWidth--;}],
 ['tampered artifact',e=>{e.generation.sha256='0'.repeat(64);}],
 ['unpublished product claim',e=>{e.productBenchmark={functionalRegression:e.readback,representativeData:e.readback,qualityReview:e.readback};}],
];
const results=[];
assert.equal((await certifyNative(evidence,files,evidence.planHash,root,metadata)).passed,true);
for(const [name,mutate]of cases){const e=JSON.parse(JSON.stringify(evidence));mutate(e);const result=await certifyNative(e,files,e.planHash,root,metadata);assert.equal(result.passed,false,name);results.push({name,rejected:true,failures:result.failures});}
const selection=await loadCertifiedSelection(root+'/selection-manifest.json');
assert.equal(resolveCompositionComponent({preferred:'RecordHeader',variant:'standard'},'production',undefined,selection).maturity,'NATIVE_VALIDATED');
assert.throws(()=>resolveCompositionComponent({preferred:'RecordHeader',variant:'editorial'},'production',undefined,selection),/certification/);
await writeFile('output/design-v43/evidence-guard-proof.json',JSON.stringify({nativeCertificates:selection.certificates.length,standardAccepted:true,uncertifiedSiblingRejected:true,cases:results,remoteWrites:0},null,2));
console.log(JSON.stringify({nativeCertificates:selection.certificates.length,negativeCasesPassed:results.length,productionSelectionPassed:true}));

