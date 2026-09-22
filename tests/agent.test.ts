import {afterEach,describe,it,expect} from 'vitest';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parse,stringify} from 'yaml';
import {createProgram} from '../src/cli/program.js';
import {commandManifest,commandPolicy} from '../src/agent/commands.js';
import {capabilities,authoringHealth} from '../src/agent/capabilities.js';
import {evaluateRouting,type RoutingCase} from '../src/agent/eval.js';
import {interpretResult} from '../src/agent/routing.js';
import {writeTask,resumeTask,taskJournalSchema} from '../src/agent/journal.js';
import {temporary,clean,root} from './helpers.js';
import {makeSourceBundle} from '../src/canvas/source-provider.js';
const dirs:string[]=[];afterEach(async()=>{for(const d of dirs.splice(0))await clean(d);});
const cases=JSON.parse(await readFile(join(root,'tests/fixtures/agent/routing.json'),'utf8')) as RoutingCase[];
const commands=commandManifest(createProgram());
describe('agent workflow fixtures',()=>{
 it.each(cases)('$id',c=>expect(evaluateRouting([c],commands.map(c=>c.command))).toMatchObject({passed:true,remoteCalls:0}));
 it.each(['BLOCKED','CONFLICT','STALE','UNSUPPORTED'])('interprets %s without retry or permission',status=>expect(interpretResult({status})).toMatchObject({status,autoRetry:false,mutationAuthorized:false}));
 it('treats unsuccessful plans and structured errors as blocked',()=>{expect(interpretResult({executable:false}).status).toBe('BLOCKED');expect(interpretResult({ok:false,error:{code:'PF-PLAN-001'}}).autoRetry).toBe(false);});
});
describe('actual CLI discovery and mutation classification',()=>{
 it('covers every registered leaf and fails closed for newly unclassified commands',()=>{const p=createProgram();expect(commandManifest(p).length).toBeGreaterThan(80);p.command('unclassified-write').action(()=>{});expect(()=>commandManifest(p)).toThrow('Unclassified');expect(()=>commandPolicy('flows execute')).toThrow('UNSUPPORTED');});
 it('distinguishes remote reads/local plans, saved-plan apply and activation effects',()=>{const find=(name:string)=>commands.find(c=>c.command===name)!;expect(find('flows plan')).toMatchObject({risk:'LOCAL_WRITE',network:true,mutatesTenant:false});expect(find('flows apply')).toMatchObject({risk:'TENANT_WRITE',requiresSavedPlan:true});expect(find('flows activate')).toMatchObject({risk:'BUSINESS_DATA_WRITE',requiresSavedPlan:false});expect(find('canvas compile')).toMatchObject({risk:'LOCAL_WRITE',requiresAuthoringMcp:false});expect(find('canvas authoring recover')).toMatchObject({network:true,requiresAuthoringMcp:true,mutatesTenant:false});expect(find('recover-create').requiresSavedPlan).toBe(true);});
 it('gets implementation and planned capability from existing registries without inventing certificates',async()=>{const c=await capabilities();expect(c.canvas.families).toBe(41);expect(c.canvas.variants).toBe(65);expect(c.canvas.certification).toMatchObject({verification:'NOT_CHECKED',variants:[]});expect(c.unifiedSolutionCompiler.executable).toBe(false);expect(c.authoring.writeEligible).toBe(false);expect(c.flows.recipes.length).toBeGreaterThan(0);});
 it('emits parseable JSON for version, capability and command discovery',async()=>{for(const args of [['version'],['capabilities'],['agent','commands']]){const r=await promisify(execFile)(process.execPath,[join(root,'dist/cli/index.js'),...args,'--json','--non-interactive']);expect(()=>JSON.parse(r.stdout)).not.toThrow();}});
 it('evaluates recorded rejection without connecting and rejects missing evidence',async()=>{const dir=await temporary();dirs.push(dir);await writeFile(join(dir,'diagnostics.json'),JSON.stringify([{httpStatus:422}]));expect(await authoringHealth(dir)).toMatchObject({health:'SESSION_REJECTED',writeEligible:false});expect(await authoringHealth(join(dir,'absent'))).toMatchObject({health:'AUTHORING_UNAVAILABLE',writeEligible:false});});
 it('recognizes a fresh PAC-only witness without doctor evidence or write authority',async()=>{const dir=await temporary();dirs.push(dir);const files={'App.pa.yaml':{App:{Properties:{}}},'Screen1.pa.yaml':{Screens:{Screen1:{Properties:{},Children:[]}}}};const bundle=makeSourceBundle(files,{appId:'00000000-0000-4000-8000-000000000001',environmentId:'unit',sessionId:'saved'},'pacDownload',[],[],{content:[{type:'text',text:'Synthetic saved witness'}]});await mkdir(join(dir,'source'));for(const [name,value]of Object.entries(files))await writeFile(join(dir,'source',name),stringify(value));await writeFile(join(dir,'source-snapshot.json'),JSON.stringify(bundle.snapshot));expect(await authoringHealth(dir)).toMatchObject({health:'DEGRADED_READ_ONLY',verification:'FRESH_SAVED_WITNESS',writeEligible:false});});
 it('reports a planned component as unsupported rather than internal failure',async()=>{try{await promisify(execFile)(process.execPath,[join(root,'dist/cli/index.js'),'components','variants','KanbanBoard','--json']);throw Error('Expected unsupported');}catch(error){const response=JSON.parse((error as {stdout:string}).stdout);expect(response.error.code).toBe('PF-CAPABILITY-UNSUPPORTED');}});
 it('returns a structured artifact summary for previously silent design generation',async()=>{const dir=await temporary();dirs.push(dir);const r=await promisify(execFile)(process.execPath,[join(root,'dist/cli/index.js'),'taste','design','generate','--product',join(root,'examples/canvas-native-complaints/design/complaintPortal/PRODUCT.md'),'--out',dir,'--json']);const output=JSON.parse(r.stdout);expect(output.remoteWrites).toBe(0);expect(output.artifacts).toContain('DESIGN.md');expect((await readFile(join(dir,'design.json'))).length).toBeGreaterThan(0);});
});
describe('resumable facts without authority',()=>{
 const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
 async function setup(){const dir=await temporary();dirs.push(dir);await writeFile(join(dir,'plan.json'),'{}');const journal={version:'1.0' as const,project:dir,goal:'Review a local candidate',workflow:'canvas' as const,phase:'plan' as const,plannedOperations:['canvas migration-validate'],blockers:[],facts:['No remote calls'],mutationState:'NONE' as const,artifacts:[{kind:'plan' as const,path:'plan.json',sha256:hash('{}')}]};return {dir,journal};}
 it('records immutable revisions and detects changed artifacts on resume',async()=>{const {dir,journal}=await setup();await writeTask(journal,dir,'.powercanvas/agent/task-1.json');await expect(writeTask(journal,dir,'.powercanvas/agent/task-1.json')).rejects.toThrow();expect(await resumeTask(journal,dir)).toMatchObject({status:'INSPECT_BEFORE_RESUME',mutationAuthorized:false});await writeFile(join(dir,'plan.json'),'changed');expect(await resumeTask(journal,dir)).toMatchObject({status:'STALE',autoRetry:false});});
 it('blocks unknown outcomes, expired artifacts, project mismatch and outside paths',async()=>{const {dir,journal}=await setup();expect(await resumeTask({...journal,mutationState:'UNKNOWN'},dir)).toMatchObject({status:'BLOCKED',autoRetry:false});expect(await resumeTask({...journal,artifacts:[{...journal.artifacts[0],expiresAt:'2020-01-01T00:00:00Z'}]},dir)).toMatchObject({status:'STALE'});await expect(resumeTask(journal,root)).rejects.toThrow('project mismatch');expect(await resumeTask({...journal,artifacts:[{...journal.artifacts[0],path:join(root,'package.json')}]},dir)).toMatchObject({status:'STALE'});await expect(writeTask(journal,dir,'elsewhere.json')).rejects.toThrow('under .powercanvas/agent');});
 it('rejects secret-bearing facts and unknown command IDs',async()=>{const {dir,journal}=await setup();expect(()=>taskJournalSchema.parse({...journal,facts:['Authorization: Bearer secret']})).toThrow();await expect(writeTask({...journal,plannedOperations:['flows overwrite --force']},dir,'.powercanvas/agent/bad.json')).rejects.toThrow('UNSUPPORTED');});
});
describe('portable skill packaging',()=>{
 it('hashes LF source bytes and rejects CRLF generation before Git can normalize them',async()=>{
  const dir=await temporary();dirs.push(dir);
  const source=join(dir,'.agents/skills/fixture/SKILL.md'),mirror=join(dir,'plugins/powercanvas/skills/fixture/SKILL.md'),manifestPath=join(dir,'plugins/powercanvas/skills-manifest.json');
  const content='# Portable fixture\n\nSame bytes on every checkout.\n';
  await mkdir(dirname(source),{recursive:true});await writeFile(source,content);
  const run=(args:string[]=[])=>promisify(execFile)(process.execPath,[join(root,'scripts/package-agent-plugin.mjs'),...args],{cwd:dir});
  await run();await run(['--check']);
  const manifest=await readFile(manifestPath,'utf8');
  expect(JSON.parse(manifest).files).toEqual([{path:'fixture/SKILL.md',sha256:createHash('sha256').update(content).digest('hex')}]);
  expect(await readFile(mirror,'utf8')).toBe(content);
  // Both copies can match locally while a CRLF hash disagrees with Git's LF blobs.
  const crlf=content.replaceAll('\n','\r\n');await writeFile(source,crlf);await writeFile(mirror,crlf);
  await expect(run()).rejects.toThrow('LF line endings');await expect(run(['--check'])).rejects.toThrow('LF line endings');
  expect(await readFile(manifestPath,'utf8')).toBe(manifest);
  await writeFile(source,content);
  await expect(run(['--check'])).rejects.toThrow('Generated skill drift');
 });
 it('discovers five compact versioned skills with valid local references and implicit metadata',async()=>{const base=join(root,'.agents/skills');const names=await readdir(base);expect(names.sort()).toEqual(['powercanvas','powercanvas-canvas','powercanvas-debug','powercanvas-flows','powercanvas-taste']);for(const name of names){const file=join(base,name,'SKILL.md'),text=await readFile(file,'utf8'),front=parse(text.split('---')[1]!);expect(front.name).toBe(name);expect(front.description.length).toBeLessThan(1025);expect(front.metadata.version).toBe('1.0.0');expect(text.split(/\s+/).length).toBeLessThan(600);const ui=parse(await readFile(join(base,name,'agents/openai.yaml'),'utf8'));expect(ui.policy.allow_implicit_invocation).toBe(true);for(const m of text.matchAll(/\]\(([^)]+)\)/g))if(!m[1]!.startsWith('https:'))expect((await readFile(resolve(dirname(file),m[1]!))).length).toBeGreaterThan(0);}});
 it('keeps packaged skills identical and all packaged Markdown links inside the plugin',async()=>{const plugin=join(root,'plugins/powercanvas');const manifest=JSON.parse(await readFile(join(plugin,'skills-manifest.json'),'utf8')) as {files:{path:string;sha256:string}[]};for(const f of manifest.files){const path=join(plugin,'skills',f.path),content=await readFile(path);expect(createHash('sha256').update(content).digest('hex')).toBe(f.sha256);expect(content.equals(await readFile(join(root,'.agents/skills',f.path)))).toBe(true);if(f.path.endsWith('.md'))for(const match of content.toString().matchAll(/\]\(([^)]+)\)/g)){if(match[1]!.startsWith('https:'))continue;const target=resolve(dirname(path),match[1]!);expect(target.startsWith(plugin)).toBe(true);expect((await readFile(target)).length).toBeGreaterThan(0);}}});
 it('discovery wrapper checks version before making read-only inventory calls',async()=>{const dir=await temporary();dirs.push(dir);await mkdir(join(dir,'calls'));const fake=join(dir,'fake.mjs'),record=join(dir,'calls/log');await writeFile(fake,`import fs from 'node:fs';fs.appendFileSync(${JSON.stringify(record)},process.argv[2]+'\\n');console.log(JSON.stringify({name:'PowerCanvas',agentContractVersion:'9.0',skillCompatibility:{major:9}}));`);await expect(promisify(execFile)(process.execPath,[join(root,'.agents/skills/powercanvas/scripts/discover.mjs'),fake,dir])).rejects.toThrow();expect((await readFile(record,'utf8')).trim()).toBe('version');});
});
