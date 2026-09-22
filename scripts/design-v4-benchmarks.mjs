import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { stringify } from 'yaml';
import { planDesign, exploreDesign, signatureRisk } from '../dist/canvas/taste/decisions.js';
import { compileDesignCandidate } from '../dist/canvas/taste/generation.js';
import { renderCandidate } from '../dist/canvas/taste/preview.js';
import { componentLab } from '../dist/canvas/taste/lab.js';
import { componentEvidence } from '../dist/canvas/taste/catalog.js';
import { recipes } from '../dist/canvas/taste/registry.js';
import { patternCatalog } from '../dist/canvas/patterns.js';
import { loadProject } from '../dist/config/load.js';
import { compileNativeCanvas } from '../dist/canvas/native.js';
import { readFile } from 'node:fs/promises';
const root=resolve(process.argv[2]??'output/design-v4');await mkdir(join(root,'tooling'),{recursive:true});
// Share the exact offline host contracts exercised by unit tests; this bundle is ignored output.
await build({entryPoints:['tests/design-v4-fixtures.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:join(root,'tooling','fixtures.mjs')});
const {products,makeHost}=await import(pathToFileURL(join(root,'tooling','fixtures.mjs')).href);
const save=async(dir,name,data)=>{await mkdir(dir,{recursive:true});await writeFile(join(dir,name),typeof data==='string'?data:JSON.stringify(data,null,2)+'\n');};
const slug=p=>p.name.toLowerCase().replaceAll(' ','-');const plans=products.map(p=>planDesign(p));const renderings=[];
for(const [i,p]of products.entries()){
  const dir=join(root,slug(p));await save(dir,'PRODUCT.md',`# ${p.name}\n\nOffline synthetic benchmark.\n\n\`\`\`powercanvas-product\n${stringify(p)}\`\`\`\n`);await save(dir,'host.yaml',stringify(makeHost(p)));await save(dir,'design-plan.json',plans[i]);
  if(i<4)for(const device of ['desktop','tablet','mobile'])for(const theme of device==='tablet'?['light']:['light','dark']){
    const plan=planDesign(p,{device}),g=compileDesignCandidate(plan,makeHost(p),theme);const target=join(dir,device+'-'+theme);
    for(const [name,file]of Object.entries(g.files))await save(target,name,stringify(file,{lineWidth:0}));
    await save(target,'component-metadata.json',g.metadata);await save(target,'native-manifest.json',g.manifest);await save(target,'performance.json',g.performance);await save(target,'preflight.json',g.preflight);await save(target,'preview.html',renderCandidate(g,theme));await save(target,'structure.html',renderCandidate(g,theme,true));renderings.push({product:p.name,device,theme,dir:target,controls:g.performance.metrics.controls,hash:g.manifest.nativeHash});
  }
}
for(const plan of exploreDesign(products[0])){const g=compileDesignCandidate(plan,makeHost(products[0]));const dir=join(root,'directions',plan.direction);await save(dir,'plan.json',plan);await save(dir,'preview.html',renderCandidate(g));await save(dir,'structure.html',renderCandidate(g,'light',true));for(const [name,file]of Object.entries(g.files))await save(dir,name,stringify(file,{lineWidth:0}));}
for(const theme of ['light','dark']){const lab=componentLab(theme);const dir=join(root,'component-lab',theme);for(const [name,file]of Object.entries(lab.files))await save(dir,name,stringify(file,{lineWidth:0}));await save(dir,'manifest.json',lab.manifest);await save(dir,'support.json',lab.support);await save(dir,'audit.json',lab.audit);}
const {project}=await loadProject('examples/canvas-native-complaints');const existing=compileNativeCanvas(project,'complaintPortal',JSON.parse(await readFile('examples/canvas-native-complaints/bindings.json','utf8')));
await save(root,'complaint-regression.json',{nativeHash:existing.manifest.nativeHash,applicationBoundary:existing.manifest.applicationBoundary,devicePreservation:existing.devicePreservation,preflight:existing.taste.preflight,remoteWrites:0});
const inventory=recipes();await save(root,'component-inventory.json',inventory);
const summary={before:{nativeFactories:22,declaredRecipes:129,controlMappingsWithoutFactory:8,plannedNames:99,executableVariants:23},after:{nativeFactories:patternCatalog().length,executableVariants:patternCatalog().flatMap(p=>componentEvidence(p.name).variants).length},plans:plans.map(p=>({product:p.product,archetype:p.archetype,composition:p.composition,decisions:p.decisions,assumptions:p.assumptions,dimensions:p.dimensions})),signature:signatureRisk(plans),renderings,nativeRuntimeValidated:false,tenantMutations:{appsCreated:0,appsUpdated:0,flowsCreated:0,businessRecordsChanged:0}};
await save(root,'report.json',summary);console.log(JSON.stringify({output:root,before:summary.before,after:summary.after,renderings:renderings.length,tenantMutations:summary.tenantMutations},null,2));
