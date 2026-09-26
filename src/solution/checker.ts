import {z} from 'zod';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,mkdir,readdir,writeFile,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {checkerReport} from './alm.js';
import {zipEntries} from './archive.js';

export const checkerRequestSchema=z.strictObject({archive:z.string().min(1),environment:z.string().regex(/^https:\/\/[a-z0-9-]+\.(?:api\.)?crm[0-9]*\.dynamics\.com$/),pac:z.string().min(1),output:z.string().min(1),geo:z.enum(['UnitedStates','Europe','Asia','Australia','Japan','India','Canada','SouthAmerica','UnitedKingdom','France','SouthAfrica','Germany','UnitedArabEmirates','Switzerland','Norway','Singapore','Korea','Sweden','Italy','Poland','NewZealand','USGovernment','USGovernmentL4','USGovernmentL5DoD','China']),allowUpload:z.literal(true),blockOn:z.array(z.enum(['error','warning','note'])).default(['error'])});
export type CheckerRunner=(executable:string,args:string[])=>Promise<{exitCode:number}>;
const runner:CheckerRunner=async(executable,args)=>{try{await promisify(execFile)(executable,args,{windowsHide:true,timeout:900000,maxBuffer:8*1024*1024});return {exitCode:0};}catch(error){const code=(error as {code?:unknown}).code;if(typeof code==='number')return {exitCode:code};throw Error('Solution Checker could not execute; no automatic authentication or retry.',{cause:error});}};
export async function executeChecker(raw:unknown,run:CheckerRunner=runner){
 const request=checkerRequestSchema.parse(raw),archive=resolve(request.archive),output=resolve(request.output);
 if(!archive.toLowerCase().endsWith('.zip')||!(await lstat(archive)).isFile())throw Error('Checker requires one explicit local ZIP file');
 const bytes=await readFile(archive),entries=zipEntries(bytes);if(!entries.has('solution.xml')||!entries.has('customizations.xml'))throw Error('Checker requires an exported solution ZIP with solution.xml and customizations.xml');const archiveHash=createHash('sha256').update(bytes).digest('hex');
 // Exclusive fresh output prevents stale successful reports from satisfying a failed run.
 await mkdir(output,{recursive:false});
 const args=['solution','check','--path',archive,'--environment',request.environment,'--geo',request.geo,'--outputDirectory',output];
 const invocation={archiveHash,args,serviceUpload:true,businessMutations:0,authentication:'Existing PAC profile; never modified',startedAt:new Date().toISOString()};
 await writeFile(join(output,'invocation.json'),JSON.stringify(invocation,null,2),{flag:'wx'});
 const execution=await run(request.pac,args);const reports:ReturnType<typeof checkerReport>[]=[];
 async function visit(dir:string){for(const item of await readdir(dir,{withFileTypes:true})){if(item.isSymbolicLink())throw Error('Checker artifact symlink rejected');const path=join(dir,item.name);if(item.isDirectory()){await visit(path);continue;}if(/\.sarif(?:\.json)?$/i.test(item.name))reports.push(checkerReport(JSON.parse(await readFile(path,'utf8'))));else if(/\.zip$/i.test(item.name))for(const [name,content]of zipEntries(await readFile(path)))if(/\.sarif(?:\.json)?$/i.test(name))reports.push(checkerReport(JSON.parse(content.toString('utf8'))));}}
 await visit(output);if(!reports.length)throw Error('CHECKER_UNPROVEN: PAC returned no fresh SARIF report');
 const results=reports.flatMap(r=>r.results),blocked=execution.exitCode!==0||reports.some(r=>r.incomplete)||results.some(r=>r.rank==='critical'||request.blockOn.includes(r.severity as 'error'|'warning'|'note'));
 const report={...invocation,finishedAt:new Date().toISOString(),exitCode:execution.exitCode,status:blocked?'BLOCKED':'PASSED',results,executedByPowerCanvas:true,productionCertification:false};await writeFile(join(output,'checker-result.json'),JSON.stringify(report,null,2),{flag:'wx'});return report;
}
