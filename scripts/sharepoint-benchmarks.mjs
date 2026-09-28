import process from 'node:process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {solutionPlan,critiqueSolution} from '../dist/solution/plan.js';
import {deploymentManifest} from '../dist/solution/alm.js';
const out=resolve(process.argv[2]??'output/sharepoint-v1-benchmarks-'+Date.now());
await mkdir(out,{recursive:true});
const results=[];
for(const name of ['document-approval','team-request-tracker','contract-library']){
 const spec=JSON.parse(await readFile('examples/solutions/sharepoint-v1/'+name+'.json','utf8'));
 const plan=solutionPlan(spec);await writeFile(resolve(out,name+'.plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 await writeFile(resolve(out,name+'.manifest.json'),JSON.stringify(deploymentManifest(plan.ir),null,2)+'\n',{flag:'wx'});
 await writeFile(resolve(out,name+'.critique.json'),JSON.stringify(critiqueSolution(plan.ir),null,2)+'\n',{flag:'wx'});
 results.push({name,resources:plan.ir.resources.length,sharepoint:plan.ir.sharepoint?.resources.length,edges:plan.ir.dependencies.length,blockers:plan.ir.validation.blockers.map(b=>({code:b.code,resource:b.resource,message:b.message})),remoteMutations:0});
}
await writeFile(resolve(out,'summary.json'),JSON.stringify(results,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({out,results},null,2));
