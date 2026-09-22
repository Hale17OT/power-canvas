import { readdir, readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { z } from 'zod';
import { hashJson } from '../core/json.js';
import type { NativeFiles } from './native-types.js';
import { controls, dependencies } from './taste/audit.js';
import { normalizeFormula, isBehavioralBinding } from './behavior-ir.js';
import { planCanvasMigration } from './migration.js';
import { compileSucceeded } from './authoring-result.js';
import {providerHealth,type ProviderHealthEvidence} from './provider-health.js';

const guid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export function studioIdentity(studioUrl:string) {
  const url=new URL(studioUrl);
  const categories:Record<string,string>={'make.powerapps.com':'prod','make.preview.powerapps.com':'prod','make.preprod.powerapps.com':'preprod','make.gov.powerapps.us':'gov','make.high.powerapps.us':'high','make.apps.appsplatform.us':'dod','make.powerapps.cn':'china'};
  if(url.protocol!=='https:'||url.username||url.password||!categories[url.hostname])throw new Error('Unsupported Studio origin');
  const environmentId=url.pathname.match(/\/e\/([^/]+)\/canvas\/?$/)?.[1];
  const appId=url.searchParams.get('app-id')?.split('/').at(-1);
  if(!environmentId||!guid.test(environmentId.replace(/^Default-/i,''))||!appId||!guid.test(appId)||url.searchParams.get('action')!=='edit')throw new Error('Complete existing-app Studio edit URL required');
  return {environmentId,appId:appId.toLowerCase(),environmentCategory:categories[url.hostname]!};
}
export const sourceIdentitySchema=z.strictObject({environmentId:z.string().min(1),appId:z.uuid(),sessionId:z.string().min(1)});
export type SourceIdentity=z.infer<typeof sourceIdentitySchema>;
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const sourceSnapshotSchema=z.strictObject({
  version:z.literal('4.2'),identity:sourceIdentitySchema,mode:z.enum(['authoringMcp','pacDownload']),acquiredAt:z.iso.datetime(),
  sourceHash:digest,screenHashes:z.record(z.string(),digest),businessFormulaHashes:z.record(z.string(),digest),
  dataSources:z.array(z.string()),connectors:z.array(z.string()),evidenceHash:digest,readOnly:z.boolean(),
});
export type SourceSnapshot=z.infer<typeof sourceSnapshotSchema>;
export interface SourceBundle {files:NativeFiles;snapshot:SourceSnapshot}
export interface ToolResult {isError?:boolean;content?:{type:string;text?:string}[]}
export type AuthoringCall=(name:string,args:Record<string,unknown>)=>Promise<ToolResult>;
export function toolText(result:ToolResult) {return (result.content??[]).filter(c=>c.type==='text').map(c=>c.text??'').join('\n');}
export function requireToolResult(result:ToolResult) {if(result.isError||!toolText(result).trim())throw new Error('Authoring returned missing/error evidence');return toolText(result);}
export async function readNativeSource(directory:string):Promise<NativeFiles> {
  const files:NativeFiles={};
  async function visit(path:string):Promise<void>{for(const entry of await readdir(path,{withFileTypes:true})){
    if(entry.isSymbolicLink())throw new Error('Source symlinks are not permitted');
    if(entry.isDirectory()){await visit(join(path,entry.name));continue;}
    if(!entry.name.endsWith('.pa.yaml')||entry.name==='_EditorState.pa.yaml')continue;
    if(Object.hasOwn(files,entry.name))throw new Error('Duplicate source filename: '+entry.name);
    const text=await readFile(join(path,entry.name),'utf8');if(!text.trim())throw new Error('Empty native source: '+entry.name);
    files[entry.name]=parse(text);
  }}
  await visit(resolve(directory));validateNativeSource(files);return files;
}
export function screenInventory(files:NativeFiles) {
  return Object.fromEntries(Object.values(files).flatMap(value=>value&&typeof value==='object'&&!Array.isArray(value)&&value.Screens&&typeof value.Screens==='object'&&!Array.isArray(value.Screens)?Object.entries(value.Screens):[]));
}
export function validateNativeSource(files:NativeFiles) {
  const app=files['App.pa.yaml'];
  if(!app||typeof app!=='object'||Array.isArray(app)||!app.App||typeof app.App!=='object')throw new Error('Fresh source unresolved: App.pa.yaml missing or invalid');
  const screens=screenInventory(files);if(!Object.keys(screens).length)throw new Error('Fresh source unresolved: screen source missing');
  for(const [name,screen] of Object.entries(screens))if(!screen||typeof screen!=='object'||Array.isArray(screen))throw new Error('Invalid screen source: '+name);
  const names=controls(files).map(n=>n.name);if(new Set(names).size!==names.length)throw new Error('Duplicate source control identities');
}
export function makeSourceBundle(files:NativeFiles,identity:SourceIdentity,mode:SourceSnapshot['mode'],dataSources:string[],connectors:string[],evidence:ToolResult,acquiredAt=new Date().toISOString()):SourceBundle {
  validateNativeSource(files);requireToolResult(evidence);
  if(/No files returned|Nothing written/i.test(toolText(evidence)))throw new Error('Fresh source unresolved: zero-file synchronization');
  const businessFormulaHashes=Object.fromEntries(dependencies(files).filter(isBehavioralBinding).map(d=>[`${d.control}.${d.property}`,hashJson(normalizeFormula(d.formula,{self:d.control,parent:d.parent}).tokens)]));
  return {files,snapshot:sourceSnapshotSchema.parse({version:'4.2',identity,mode,acquiredAt,sourceHash:hashJson(files),screenHashes:Object.fromEntries(Object.entries(screenInventory(files)).map(([name,value])=>[name,hashJson(value!)])),businessFormulaHashes,dataSources:[...new Set(dataSources)].sort(),connectors:[...new Set(connectors)].sort(),evidenceHash:hashJson(evidence as never),readOnly:mode==='pacDownload'})};
}
export function assertFreshSource(bundle:SourceBundle,expected:SourceIdentity,now=Date.now(),maxAgeMs=15*60_000) {
  const s=sourceSnapshotSchema.parse(bundle.snapshot);validateNativeSource(bundle.files);
  if(s.identity.appId!==expected.appId||s.identity.environmentId!==expected.environmentId||s.identity.sessionId!==expected.sessionId)throw new Error('Stale or mismatched source/session identity');
  if(hashJson(bundle.files)!==s.sourceHash)throw new Error('Source changed after acquisition');
  const age=now-Date.parse(s.acquiredAt);if(age<0||age>maxAgeMs)throw new Error('Fresh source unresolved: acquisition expired');
  const recomputed=makeSourceBundle(bundle.files,s.identity,s.mode,s.dataSources,s.connectors,{content:[{type:'text',text:'integrity check'}]},s.acquiredAt).snapshot;
  if(hashJson(recomputed.screenHashes)!==hashJson(s.screenHashes)||hashJson(recomputed.businessFormulaHashes)!==hashJson(s.businessFormulaHashes))throw new Error('Source inventory hash mismatch');
}
export function compareSources(authoring:SourceBundle,pac:SourceBundle,now=Date.now()) {
  assertFreshSource(authoring,authoring.snapshot.identity,now);assertFreshSource(pac,pac.snapshot.identity,now);
  const a=authoring.snapshot,b=pac.snapshot;
  const inventory=(files:NativeFiles)=>controls(files).map(n=>({name:n.name,parent:n.parent??null,type:n.node.Control?.split('@')[0]??'',variant:n.node.Variant??''})).sort((x,y)=>x.name.localeCompare(y.name));
  const same=(x:Parameters<typeof hashJson>[0],y:Parameters<typeof hashJson>[0])=>hashJson(x)===hashJson(y);
  const checks={independentProviders:a.mode==='authoringMcp'&&b.mode==='pacDownload',appIdentity:a.identity.appId===b.identity.appId&&a.identity.environmentId===b.identity.environmentId,screens:same(Object.keys(a.screenHashes).sort(),Object.keys(b.screenHashes).sort()),controls:same(inventory(authoring.files),inventory(pac.files)),businessFormulas:same(a.businessFormulaHashes,b.businessFormulaHashes),dataSources:same(a.dataSources,b.dataSources),connectors:same(a.connectors,b.connectors)};
  const differences=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
  return {version:'4.2',status:differences.length?'FRESH SOURCE UNRESOLVED':'MATCH',checks,differences,authoring:a,pac:b,remoteWrites:0};
}
export interface SourceProvider {readonly mode:SourceSnapshot['mode'];readonly capabilities:{read:boolean;validate:boolean;write:boolean;sync:boolean};health(evidence?:Omit<ProviderHealthEvidence,'readSucceeded'>):ReturnType<typeof providerHealth>;read(directory:string):Promise<SourceBundle>}
export class AuthoringMcpProvider implements SourceProvider {
  readonly mode='authoringMcp' as const;
  private readSucceeded=false;
  health(evidence:Omit<ProviderHealthEvidence,'readSucceeded'>={}){return providerHealth(this.mode,{...evidence,readSucceeded:this.readSucceeded});}
  // compile_canvas may update the live draft: validation is not advertised as a read-only operation.
  readonly capabilities={read:true,validate:true,write:true,sync:true};
  constructor(private call:AuthoringCall,readonly identity:SourceIdentity,private dataSources:string[],private connectors:string[]){}
  async read(directory:string) {
    this.readSucceeded=false;
    await requireEmptyDirectory(directory);
    const result=await this.call('sync_canvas',{directoryPath:resolve(directory)});requireToolResult(result);
    if(/No files returned|Nothing written/i.test(toolText(result)))throw new Error('Fresh source unresolved: zero-file synchronization');
    const bundle=makeSourceBundle(await readNativeSource(directory),this.identity,this.mode,this.dataSources,this.connectors,result);
    this.readSucceeded=true;return bundle;
  }
  async preview(directory:string,baseline:SourceBundle,independent:SourceBundle,review:{candidateHash:string;baselineHash:string;reviewed:boolean;autoSaveDisabled:boolean;approvedBehaviorChanges?:unknown},preflightDirectory:string,readbackDirectory:string) {
    assertFreshSource(baseline,this.identity);
    if(compareSources(baseline,independent).status!=='MATCH')throw new Error('Independent source disagreement blocks preview');
    const candidate=await readNativeSource(directory);
    if(!review.reviewed||!review.autoSaveDisabled||review.candidateHash!==hashJson(candidate)||review.baselineHash!==baseline.snapshot.sourceHash)throw new Error('Hash-bound preview review/autosave guard missing');
    const fresh=await this.read(preflightDirectory);
    if(fresh.snapshot.sourceHash!==baseline.snapshot.sourceHash)throw new Error('Studio changed after review');
    const migration=planCanvasMigration(fresh.files,candidate,[],review.approvedBehaviorChanges??[]);if(!migration.safe)throw new Error('Protected behavioral difference blocks native preview');
    // Microsoft's compiler writes into coauthoring. It is deliberately NOT exposed as an unguarded read-only validate method.
    const result=await this.call('compile_canvas',{directoryPath:resolve(directory)});
    const readback=await this.read(readbackDirectory);
    const readbackPlan=planCanvasMigration(candidate,readback.files);
    const exactReadback=hashJson(candidate)===readback.snapshot.sourceHash;
    return {result,readback,migration,accepted:compileSucceeded(result)&&readbackPlan.safe&&exactReadback,exactReadback,authoringSessionWritesAttempted:1,appSaves:0,appPublishes:0,appCreates:0,limitations:['No automatic retry or rollback after uncertain native compile outcome.','An accepted source is not native runtime or accessibility certification.']};
  }
}
export class PacDownloadProvider implements SourceProvider {
  readonly mode='pacDownload' as const;readonly capabilities={read:true,validate:false,write:false,sync:false};
  private readSucceeded=false;
  health(evidence:Omit<ProviderHealthEvidence,'readSucceeded'>={}){return providerHealth(this.mode,{...evidence,readSucceeded:this.readSucceeded});}
  constructor(readonly executable:string,readonly identity:SourceIdentity,readonly dataverseUrl:string,readonly expectedName:string,private environment:NodeJS.ProcessEnv=process.env){
    const url=new URL(dataverseUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Explicit Dataverse HTTPS origin required');
  }
  async read(directory:string) {
    this.readSucceeded=false;
    await requireEmptyDirectory(directory);await mkdir(directory,{recursive:true});
    // Download never overwrites, imports, packs, saves or publishes. PAC's own supported extractor owns package interpretation.
    await promisify(execFile)(this.executable,['canvas','download','--environment',this.dataverseUrl,'--name',this.identity.appId,'--extract-to-directory',join(resolve(directory),'extracted')],{env:this.environment,windowsHide:true,timeout:120_000,maxBuffer:4*1024*1024});
    const files=await readNativeSource(join(directory,'extracted'));
    // Metadata must be independently extracted, never copied from authoring discovery.
    const metadata=await readPacMetadata(join(directory,'extracted'));
    if(metadata.name!==this.expectedName)throw new Error('PAC package name differs from owned application');
    const bundle=makeSourceBundle(files,this.identity,this.mode,metadata.dataSources,metadata.connectors,{content:[{type:'text',text:`PAC exact-GUID download and extraction completed for ${this.identity.appId}; package name verified. Package Id is an internal document ID, not the Canvas resource ID.`}]});
    this.readSucceeded=true;return bundle;
  }
}
export async function readPacMetadata(directory:string):Promise<{name:string;dataSources:string[];connectors:string[]}> {
  // Read-only PAC 2.12.2 extraction metadata. Id/FileID are document IDs, never app resource IDs.
  const result:{name:string;dataSources:string[];connectors:string[]}={name:'',dataSources:[],connectors:[]};
  const properties=JSON.parse(await readFile(join(directory,'Properties.json'),'utf8')) as Record<string,unknown>;
  if(typeof properties.Name!=='string')throw new Error('PAC package name missing');result.name=properties.Name;
  const data=JSON.parse(await readFile(join(directory,'References','DataSources.json'),'utf8')) as {DataSources?:{Name?:string;Type?:string}[]};
  if(!Array.isArray(data.DataSources))throw new Error('Unrecognized PAC data-source metadata');
  for(const source of data.DataSources){if(!source.Name)throw new Error('PAC data source identity missing');if(source.Type==='ServiceInfo')result.connectors.push(source.Name);else if(source.Type==='NativeCDSDataSourceInfo')result.dataSources.push(source.Name);else if(!['OptionSetInfo','ViewInfo','StaticDataSourceInfo'].includes(source.Type??''))throw new Error('Unrecognized PAC data source kind: '+source.Type);}
  return result;
}
export async function requireEmptyDirectory(directory:string) {try{if((await readdir(directory)).length)throw new Error('Source destination must be fresh and empty');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
export async function workspaceWritable(directory:string) {await mkdir(directory,{recursive:true});const probe=join(directory,'.powercanvas-doctor-'+randomUUID());await writeFile(probe,'probe',{flag:'wx'});await unlink(probe);return true;}
export function authoringDoctor(input:{studioUrl:string;expected:SourceIdentity;connected:SourceIdentity;coauthoringEnabled:boolean;dotnetMajor:number;workspaceWritable:boolean;tools:string[];controls:ToolResult;apis:ToolResult;dataSources:ToolResult;source?:SourceBundle},now=Date.now()) {
  const failures:string[]=[];
  try{const actual=studioIdentity(input.studioUrl);if(actual.appId!==input.expected.appId||actual.environmentId!==input.expected.environmentId)failures.push('Studio/project identity mismatch');}catch(error){failures.push(String(error));}
  if(hashJson(input.expected)!==hashJson(input.connected))failures.push('Stale authoring session identity');
  if(!input.coauthoringEnabled)failures.push('Coauthoring not verified enabled');
  if(input.dotnetMajor<10)failures.push('.NET 10 or newer required');
  if(!input.workspaceWritable)failures.push('Workspace not writable');
  for(const tool of ['connect','sync_canvas','compile_canvas','list_controls','describe_control','list_apis','list_data_sources'])if(!input.tools.includes(tool))failures.push('Missing official tool: '+tool);
  for(const [name,result] of Object.entries({controls:input.controls,apis:input.apis,dataSources:input.dataSources}))try{const text=requireToolResult(result);if(name==='controls'?!/Power Apps Controls:\s*\r?\n\s*-\s*\w/i.test(text):!/Available (?:APIs|Data Sources):\s*\d+/i.test(text))failures.push('Unrecognized '+name+' discovery');}catch{failures.push('Failed '+name+' discovery');}
  if(!input.source)failures.push('Live coauthoring not proven by fresh source');else try{assertFreshSource(input.source,input.expected,now);}catch(error){failures.push(String(error));}
  return {version:'4.2',passed:failures.length===0,identity:input.expected,checkedAt:new Date(now).toISOString(),failures,remoteWrites:0};
}
