import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {solutionPlan} from '../dist/solution/plan.js';
import {deploymentManifest} from '../dist/solution/alm.js';
const output='output/solution-v2/benchmarks';await mkdir(output,{recursive:true});const results=[];
for(const name of ['service-administration-v2','leave-management-v2']){
 const spec=JSON.parse(await readFile(`examples/solutions/${name}.json`,'utf8'));
 const plan=solutionPlan(spec,{authoring:'AUTHORING_UNAVAILABLE'});
 const errors=plan.ir.validation.issues.filter(i=>i.severity==='error');if(errors.length)throw Error(JSON.stringify(errors));
 await writeFile(`${output}/${name}.plan.json`,JSON.stringify(plan,null,2)+'\n');
 await writeFile(`${output}/${name}.manifest.json`,JSON.stringify(deploymentManifest(plan.ir),null,2)+'\n');
 results.push({name,resources:plan.ir.resources.length,status:plan.ir.status,appDecisions:plan.ir.appDecisions,personas:plan.ir.security.personas.map(p=>p.id),compileErrors:errors,remoteMutations:0,runtime:'UNPROVEN'});
}
await writeFile(`${output}/summary.json`,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
