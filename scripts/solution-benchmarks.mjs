import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {solutionPlan} from '../dist/solution/plan.js';
import {parseConfigData} from '../dist/config/load.js';
import {deploymentManifest} from '../dist/solution/alm.js';
const out='output/solution-v1/benchmarks';await mkdir(out,{recursive:true});const results=[];
for(const name of ['leave-management','supplier-quotes','document-approval','field-inspection']){
 const spec=parseConfigData(await readFile(`examples/solutions/${name}.json`,'utf8'));const plan=solutionPlan(spec);
 await writeFile(`${out}/${name}.plan.json`,JSON.stringify(plan,null,2)+'\n');
 await writeFile(`${out}/${name}.manifest.json`,JSON.stringify(deploymentManifest(plan.ir),null,2)+'\n');
 results.push({name,status:plan.ir.status,requirements:plan.ir.requirements.length,resources:plan.ir.resources.length,counts:Object.fromEntries([...new Set(plan.ir.resources.map(r=>r.kind))].map(k=>[k,plan.ir.resources.filter(r=>r.kind===k).length])),compositions:Object.entries(plan.ir.canvasPlans).map(([app,p])=>({app,family:p.composition.family,archetype:p.composition.archetype,devices:p.sameAppDevices})),compileErrors:plan.ir.validation.issues.filter(i=>i.severity==='error'),remoteMutations:0});
}
await writeFile(`${out}/summary.json`,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
