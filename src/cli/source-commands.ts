import type { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { z } from 'zod';
import { connectAuthoring } from '../canvas/authoring-client.js';
import { AuthoringMcpProvider, PacDownloadProvider, authoringDoctor, compareSources, readNativeSource, sourceSnapshotSchema, studioIdentity, toolText, workspaceWritable, type SourceBundle } from '../canvas/source-provider.js';
import { planCanvasMigration } from '../canvas/migration.js';
import { emit } from './output.js';
import { discoverCapabilities } from '../canvas/capabilities.js';
import { lowerExistingComposition, compileExistingComposition } from '../canvas/existing-composition.js';
import { stringify } from 'yaml';
import { planHarnessRecovery } from '../canvas/authoring-lifecycle.js';
import { loadCertifiedSelection } from '../canvas/certified-selection.js';
import { buildProductionCore } from '../canvas/production-core.js';

async function save(path:string,data:unknown){await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(data,null,2)+'\n',{flag:'wx'});}
async function readBundle(path:string):Promise<SourceBundle>{return {files:await readNativeSource(join(path,'source')),snapshot:sourceSnapshotSchema.parse(JSON.parse(await readFile(join(path,'source-snapshot.json'),'utf8')))};}
const observationSchema=z.strictObject({appId:z.uuid(),environmentId:z.string(),observedAt:z.iso.datetime(),coauthoringEnabled:z.literal(true),autoSaveDisabled:z.literal(true),artifact:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/)});
type Options={studioUrl:string;bindings:string;out:string;provider:string;coauthoringEvidence?:string;dotnet:string;serverVersion:string;loginHint?:string;pac:string;dataverseUrl?:string;expectedName?:string};
export function registerSourceCommands(canvas:Command,json:()=>boolean){
  canvas.command('production-core').requiredOption('--request <file>').requiredOption('--certificates <file>').requiredOption('--out <file>')
    .description('Verify native certificates and dependency closure; emit scoped Canvas capability readiness')
    .action(async(o:{request:string;certificates:string;out:string})=>{
      const result=buildProductionCore(JSON.parse(await readFile(o.request,'utf8')),await loadCertifiedSelection(o.certificates));
      await save(o.out,result.manifest);emit(result.manifest,JSON.stringify(result.manifest,null,2),json());
    });
  const source=canvas.command('source').description('Fresh source acquisition and independent semantic agreement');
  const authoring=canvas.command('authoring');
  const configure=(command:Command)=>command.requiredOption('--studio-url <url>').requiredOption('--bindings <file>').requiredOption('--out <directory>').option('--provider <provider>','authoringMcp or pacDownload','authoringMcp').option('--coauthoring-evidence <file>','Hash-bound current Studio settings observation').option('--dotnet <path>','Official .NET runtime',resolve('.powercanvas/tooling/dotnet/dotnet.exe')).option('--server-version <version>','Official MCP package version','1.1.5').option('--login-hint <upn>').option('--pac <path>','PAC executable',resolve('.powercanvas/tooling/pac/pac.exe')).option('--dataverse-url <url>').option('--expected-name <name>','Owned Canvas display name');
  const acquire=async(o:Options,emitReport=true)=>{
    const binding=z.object({appId:z.uuid(),environmentId:z.string()}).parse(JSON.parse(await readFile(o.bindings,'utf8'))),identity=studioIdentity(o.studioUrl);
    if(identity.appId!==binding.appId||identity.environmentId!==binding.environmentId)throw new Error('Studio differs from bound existing application');
    if(!['authoringMcp','pacDownload'].includes(o.provider))throw new Error('Unknown source provider');
    if(o.provider==='pacDownload'){
      if(!o.dataverseUrl||!o.expectedName)throw new Error('PAC requires explicit Dataverse URL and owned app name');
      const provider=new PacDownloadProvider(o.pac,{...binding,sessionId:randomUUID()},o.dataverseUrl,o.expectedName,{...process.env,DOTNET_ROOT:resolve(o.dotnet,'..')});
      const bundle=await provider.read(join(o.out,'source'));await save(join(o.out,'source-snapshot.json'),bundle.snapshot);emit(bundle.snapshot,JSON.stringify(bundle.snapshot,null,2),json());return;
    }
    if(!o.coauthoringEvidence)throw new Error('Current Studio coauthoring/autosave observation required');
    const observation=observationSchema.parse(JSON.parse(await readFile(o.coauthoringEvidence,'utf8')));
    if(observation.appId!==binding.appId||observation.environmentId!==binding.environmentId||Date.now()-Date.parse(observation.observedAt)>30*60_000||Date.parse(observation.observedAt)>Date.now())throw new Error('Stale/wrong Studio observation');
    if(createHash('sha256').update(await readFile(observation.artifact)).digest('hex')!==observation.sha256)throw new Error('Studio observation artifact changed');
    const runtime=await promisify(execFile)(o.dotnet,['--version'],{windowsHide:true});const major=Number(runtime.stdout.trim().split('.')[0]);
    if(!Number.isFinite(major)||major<10)throw new Error('.NET 10 required');
    if(!/^\d+\.\d+\.\d+$/.test(o.serverVersion))throw new Error('Explicit official server version required');
    const writable=await workspaceWritable(o.out);
    const diagnostics:Record<string,unknown>[]=[];
    const session=await connectAuthoring({command:o.dotnet,args:['dnx',`Microsoft.PowerApps.CanvasAuthoring.McpServer@${o.serverVersion}`,'--yes'],env:{...process.env,DOTNET_ROOT:resolve(o.dotnet,'..')},studioUrl:o.studioUrl,expectedAppId:binding.appId,onDiagnostic:record=>diagnostics.push(record),...(o.loginHint?{loginHint:o.loginHint}:{})}).catch(async error=>{await save(join(o.out,'connection-diagnostics.json'),diagnostics);throw error;});
    await save(join(o.out,'connection-diagnostics.json'),diagnostics);
    try{
      const controls=await session.call('list_controls',{}),apis=await session.call('list_apis',{}),dataSources=await session.call('list_data_sources',{});
      const names=(text:string)=>[...text.matchAll(/^\s*-\s+([^\r\n(]+?)(?:\s+\(Kind:|\r?$)/gm)].map(m=>m[1]!.trim());
      await save(join(o.out,'discovery.json'),{identity:session.identity,catalog:session.catalog,controls,apis,dataSources});
      const readiness=authoringDoctor({studioUrl:o.studioUrl,expected:session.identity,connected:session.identity,coauthoringEnabled:true,dotnetMajor:major,workspaceWritable:writable,tools:session.catalog.tools.map(t=>t.name),controls,apis,dataSources});
      if(readiness.failures.some(f=>f!=='Live coauthoring not proven by fresh source')){await save(join(o.out,'doctor.json'),readiness);throw new Error('Authoring prerequisites failed before sync');}
      const provider=new AuthoringMcpProvider(session.call,session.identity,names(toolText(dataSources)),names(toolText(apis)));
      let bundle:SourceBundle|undefined;let acquisitionError:string|undefined;
      try{bundle=await provider.read(join(o.out,'source'));}catch(error){acquisitionError=String(error);}
      const doctor=authoringDoctor({studioUrl:o.studioUrl,expected:session.identity,connected:session.identity,coauthoringEnabled:observation.coauthoringEnabled,dotnetMajor:major,workspaceWritable:writable,tools:session.catalog.tools.map(t=>t.name),controls,apis,dataSources,...(bundle?{source:bundle}:{})});
      await save(join(o.out,'doctor.json'),{...doctor,acquisitionError});if(bundle)await save(join(o.out,'source-snapshot.json'),bundle.snapshot);
      if(bundle&&doctor.passed)await save(join(o.out,'capabilities.json'),await discoverCapabilities(session.call,bundle,`Microsoft.PowerApps.CanvasAuthoring.McpServer@${o.serverVersion}`));
      if(emitReport)emit(doctor,JSON.stringify(doctor,null,2),json());if(!doctor.passed)process.exitCode=1;
      return doctor.passed?bundle:undefined;
    }finally{session.close();}
  };
  configure(authoring.command('doctor').description('Connect, discover and prove live coauthoring through nonempty source; no app writes')).action(async(o:Options)=>{await acquire(o);});
  configure(authoring.command('recover').description('Doctor, acquire and plan removal of a proven owned harness; never writes Studio source'))
    .requiredOption('--protected-source <directory>').requiredOption('--ownership <file>')
    .action(async(o:Options&{protectedSource:string;ownership:string})=>{
      if(o.provider!=='authoringMcp')throw new Error('Recovery requires live authoring source');
      const base=await readNativeSource(o.protectedSource),ownership=JSON.parse(await readFile(o.ownership,'utf8'));
      const current=await acquire(o,false);if(!current)throw new Error('Recovery blocked by authoring doctor');
      const plan=planHarnessRecovery(current,base,ownership);await save(join(o.out,'recovery-plan.json'),plan);
      emit(plan,JSON.stringify(plan,null,2),json());
    });
  configure(source.command('sync').description('Acquire fresh source; PAC is read-only and never imports')).action(async(o:Options)=>{await acquire(o);});
  source.command('compare').requiredOption('--authoring <directory>').requiredOption('--pac <directory>').requiredOption('--out <file>').action(async(o:{authoring:string;pac:string;out:string})=>{const report=compareSources(await readBundle(o.authoring),await readBundle(o.pac));await save(o.out,report);emit(report,JSON.stringify(report,null,2),json());if(report.status!=='MATCH')process.exitCode=1;});
  canvas.command('migration-validate').requiredOption('--authoring <directory>').requiredOption('--pac <directory>').requiredOption('--candidate <directory>').requiredOption('--out <file>').action(async(o:{authoring:string;pac:string;candidate:string;out:string})=>{
    const a=await readBundle(o.authoring),b=await readBundle(o.pac),agreement=compareSources(a,b),plan=planCanvasMigration(a.files,await readNativeSource(o.candidate));
    const report={...plan,source:a.snapshot,agreement,safe:plan.safe&&agreement.status==='MATCH',authorization:'REVIEW_REQUIRED',appSaves:0,appPublishes:0};await save(o.out,report);emit(report,JSON.stringify(report,null,2),json());if(!report.safe)process.exitCode=1;
  });
  canvas.command('composition-lower').requiredOption('--authoring <directory>').requiredOption('--pac <directory>').requiredOption('--out <directory>').description('Lower fresh existing source into presentation IR and immutable business bindings; current design is candidate zero').action(async(o:{authoring:string;pac:string;out:string})=>{
    const a=await readBundle(o.authoring),b=await readBundle(o.pac),agreement=compareSources(a,b);if(agreement.status!=='MATCH')throw new Error('Fresh source unresolved');
    const lowered=lowerExistingComposition(a.files),candidate=compileExistingComposition(lowered.composition,lowered.behavior,a.files);
    await mkdir(o.out,{recursive:true});for(const [name,value] of Object.entries(candidate.files))await writeFile(join(o.out,name),stringify(value,{lineWidth:0}),{flag:'wx'});
    await save(join(o.out,'composition-ir.json'),lowered.composition);await save(join(o.out,'behavior-ir.json'),lowered.behavior);
    await save(join(o.out,'migration-plan.json'),{...candidate.migration,source:a.snapshot,agreement,selectedCandidate:0,selectionReason:'Retain current design until native evidence justifies a structural change; retention does not certify factory variants.'});
    emit({sourceHash:a.snapshot.sourceHash,compositionHash:lowered.composition.hash,retained:candidate.migration.retained.length,behaviorBindings:lowered.behavior.bindings.length,mutationPaths:candidate.migration.mutationPaths,safe:candidate.migration.safe,remoteWrites:0},`Lowered existing source into ${o.out}; no native compile or app write performed.`,json());
  });
}
