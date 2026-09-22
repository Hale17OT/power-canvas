import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { hashJson } from '../core/json.js';
import type { NativeFiles } from './native-types.js';
import { componentEvidence } from './taste/catalog.js';
import { compileSucceeded } from './authoring-result.js';
import { controls } from './taste/audit.js';
import { componentMetadataSchema } from './taste/decision-schema.js';
import { nativeEvidenceBindingSchema, validateEvidenceBinding, variantChecks } from './native-evidence.js';
import { sourceSnapshotSchema } from './source-provider.js';
import { evidenceProfile, missingRuntimeEvidence, factoryFingerprint, capabilityFingerprint, verifyGeneratedInstance } from './variant-certification.js';

export function requiredRuntimeCases(name:string):string[]{
  if(['TopNavigation','BottomNavigation','NavigationDrawer','CompactSidebar','Tabs'].includes(name))return ['selected-state','change-destination','long-labels','destination-boundaries','overflow','accessible-names'];
  if(['ConfirmationDialog','SideSheet','BottomSheet','FullScreenTask','ContextPanel','EditDialog'].includes(name))return ['open','close','cancel','action','background-blocking','focus-return','unsaved-context'];
  if(['DataTable','RichList','GroupedList','ActivityTimeline','ChartCard'].includes(name))return ['0-records','1-record','4-records','24-records','long-text','missing-values','mixed-statuses'];
  if(['FilterChips','FilterPanel','FilterBar','SearchBox'].includes(name))return ['empty-filter','single-filter','multiple-filters','clear-filter','selected-state','mobile-presentation'];
  if(name==='BulkActionBar')return ['0-selected-hidden','1-selected','multiple-selected','clear-selection','mobile-presentation'];
  if(['Snackbar','Skeleton','EmptyState','ErrorState','LoadingState'].includes(name))return ['hidden','visible','dismiss-or-recover'];
  if(name==='TaskForm')return ['typed-values','required-validation','invalid-validation','read-only','disabled','current-step','previous','next','review','completion','reduced-height'];
  if(['RecordHeader','SectionHeader'].includes(name))return ['short-identity','long-identity','metadata','status','actions','mobile-wrapping'];
  return ['visible','interaction-or-static-review','accessible-names'];
}

const digest=z.string().regex(/^[a-f0-9]{64}$/);
const artifact=z.strictObject({path:z.string().min(1),sha256:digest});
export const nativeCertificationSchema=z.strictObject({
  version:z.literal('4.1'),component:z.string(),variant:z.string(),sourceHash:digest,planHash:digest,
  environment:z.literal('Default'),nonDisposable:z.literal(true),appId:z.uuid(),
  controlVersions:z.record(z.string(),z.string().min(1)),
  compile:artifact,appChecker:artifact,accessibility:artifact,
  captures:z.array(z.strictObject({kind:z.literal('native-player'),width:z.number().int(),theme:z.enum(['light','dark']),image:artifact,sourceHash:digest,planHash:digest,review:z.string().min(20)})).min(1),
  interactions:z.array(z.strictObject({name:z.string().min(1),passed:z.boolean(),sourceHash:digest,evidence:artifact})).min(1),
  productBenchmark:z.strictObject({functionalRegression:artifact,representativeData:artifact,qualityReview:artifact}).optional(),
});
export const nativeCertificationV42Schema=nativeCertificationSchema.extend({
  version:z.literal('4.2'),source:sourceSnapshotSchema,registryHash:digest,registryArtifact:artifact,sessionId:z.string().min(1),
  captures:z.array(nativeCertificationSchema.shape.captures.element.extend({binding:nativeEvidenceBindingSchema})).min(1),
});
export const nativeCertificationV43Schema=nativeCertificationV42Schema.extend({
  version:z.literal('4.3'),evidenceClass:z.enum(['COMPONENT_NATIVE_EVIDENCE','PRODUCT_BENCHMARK_EVIDENCE']),
  factoryHash:digest,capabilityHash:digest,capabilityArtifact:artifact,readback:artifact,generation:artifact,
  unverifiedControlVersions:z.array(z.string()).default([]),
  knownAccessibilitySuggestions:z.array(z.strictObject({screen:z.string(),check:z.literal('ReadableScreenNameNeeded'),reason:z.string().min(30)})).max(1).default([]),
  publication:z.strictObject({publishedSourceHash:digest,verification:artifact}).optional(),
});
/** Evidence verification never changes a global maturity flag or certifies an unrelated source. */
export async function certifyNative(raw:unknown,files:NativeFiles,planHash:string,directory:string,rawMetadata:unknown={}){
  const e=raw&&typeof raw==='object'&&'version' in raw&&raw.version==='4.3'?nativeCertificationV43Schema.parse(raw):raw&&typeof raw==='object'&&'version' in raw&&raw.version==='4.2'?nativeCertificationV42Schema.parse(raw):nativeCertificationSchema.parse(raw),definition=componentEvidence(e.component),failures:string[]=[];
  const metadata=z.record(z.string(),componentMetadataSchema).parse(rawMetadata),nodes=controls(files);
  if(!nodes.some(n=>metadata[n.name]?.recipe===e.component&&metadata[n.name]?.variant===e.variant))failures.push('Component/variant is not present in source-bound semantic metadata');
  if(!definition.executable||!definition.variants.includes(e.variant))failures.push('No executable component/variant');
  if(hashJson(files)!==e.sourceHash||planHash!==e.planHash)failures.push('Source/design hash mismatch');
  if(!Object.keys(e.controlVersions).length&&e.version!=='4.3')failures.push('Actual control versions missing');
  for(const kind of new Set(controls(files).map(n=>n.node.Control!.split('@')[0]!)))if(!e.controlVersions[kind]&&!(e.version==='4.3'&&e.unverifiedControlVersions.includes(kind)))failures.push('Missing actual control version: '+kind);
  const cases=e.version==='4.3'?missingRuntimeEvidence(e.component,e.variant,e.interactions):e.version==='4.2'?variantChecks(e.component,e.variant).checks.filter(c=>!['authoring-validation','source-readback','native-render','responsive-geometry','theme'].includes(c)):requiredRuntimeCases(e.component);
  for(const name of cases)if(!e.interactions.some(i=>i.name===name&&i.passed))failures.push('Missing runtime case: '+name);
  const read=async(a:z.infer<typeof artifact>)=>{
    const path=resolve(directory,a.path),rel=relative(resolve(directory),path);
    if(isAbsolute(rel)||rel==='..'||rel.startsWith('..\\')||rel.startsWith('../'))throw new Error('Evidence path escapes the evidence directory');
    const content=await readFile(path);if(createHash('sha256').update(content).digest('hex')!==a.sha256)throw new Error('Evidence hash mismatch: '+a.path);return content;
  };
  const results=await Promise.allSettled([e.compile,e.appChecker,e.accessibility].map(read));
  if(e.version!=='4.1'){
    if(e.source.sourceHash!==e.sourceHash||e.source.identity.appId!==e.appId||e.source.identity.sessionId!==e.sessionId)failures.push('Certification source/session mismatch');
    try{if(hashJson(JSON.parse((await read(e.registryArtifact)).toString()))!==e.registryHash)failures.push('Registry artifact/hash mismatch');}catch(error){failures.push(String(error));}
    for(const capture of e.captures){
      if(capture.binding.component!==e.component||capture.binding.variant!==e.variant||capture.binding.theme!==capture.theme||capture.binding.viewport.requestedWidth!==capture.width)failures.push('Capture variant/theme/viewport mismatch');
      if(e.version==='4.3'&&capture.binding.viewport.logicalWidth!==capture.width)failures.push('V4.3 requires exact logical capture width');
      failures.push(...validateEvidenceBinding(capture.binding,{sourceHash:e.sourceHash,designPlanHash:e.planHash,registryHash:e.registryHash,appId:e.appId,environmentId:e.source.identity.environmentId,sessionId:e.sessionId}).failures);
    }
  }
  const clean=['compile','app checker','accessibility'];
  results.forEach((r,i)=>{if(r.status==='rejected'){failures.push(clean[i]+': '+String(r.reason));return;}
    try{const record=JSON.parse(r.value.toString()) as {sourceHash?:string;planHash?:string;registryHash?:string;sessionId?:string;appId?:string;environmentId?:string;tool?:string;result?:{isError?:boolean;content?:{type:string;text?:string}[]};isError?:boolean;content?:{type:string;text?:string}[]};
      if(e.version!=='4.1'&&(record.sourceHash!==e.sourceHash||record.planHash!==e.planHash||record.registryHash!==e.registryHash||record.sessionId!==e.sessionId||record.appId!==e.appId||record.environmentId!==e.source.identity.environmentId||record.tool!==['compile_canvas','get_appchecker_errors','get_accessibility_errors'][i]))failures.push(clean[i]+': unbound official evidence');
      const result=e.version!=='4.1'?record.result:record;if(!result)throw new Error('Missing bound official response');const text=(result.content??[]).map(c=>c.text??'').join('\n');
      if(result.isError===true||!text.trim())failures.push(clean[i]+': missing successful official response');
      if(i===0&&!compileSucceeded(result))failures.push('Native compile success not established');
      if(i===1&&!/^(?:✓\s*)?No app checker issues found\s*$/i.test(text.trim()))failures.push('App Checker is not clean');
      if(i===2&&!/^(?:✓\s*)?No accessibility errors found\s*$/i.test(text.trim())){
        const known=e.version==='4.3'?e.knownAccessibilitySuggestions[0]:undefined;
        const findings=[...text.matchAll(/\[(\w+)\]\s+([^:]+):[^\r\n]*[\s\S]*?Check:\s*(\w+)/g)];
        const scoped=known&&/^✗ Accessibility issues found: 1\s/.test(text)&&findings.length===1&&findings[0]![1]==='Suggestion'&&findings[0]![2]===known.screen&&findings[0]![3]===known.check&&!nodes.some(n=>metadata[n.name]?.recipe===e.component&&metadata[n.name]?.variant===e.variant&&n.path.includes('/'+known.screen+'/'));
        if(!scoped)failures.push('Accessibility checker is not clean');
      }
    }catch{failures.push(clean[i]+': invalid official response JSON');}
  });
  for(const width of [390,640,834,1024,1440])for(const theme of ['light','dark'])if(!e.captures.some(c=>c.width===width&&c.theme===theme))failures.push(`Missing native capture: ${width}/${theme}`);
  for(const c of e.captures){if(c.sourceHash!==e.sourceHash||c.planHash!==e.planHash)failures.push('Stale native screenshot');
    try{const bytes=await read(c.image);if(bytes.length<24||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))failures.push('Native capture must be a PNG');else if(e.version==='4.1'&&bytes.readUInt32BE(16)!==c.width)failures.push('Native screenshot width differs from evidence');}catch(error){failures.push(String(error));}}
  for(const i of e.interactions){if(!i.passed||i.sourceHash!==e.sourceHash)failures.push('Unproven interaction: '+i.name);try{await read(i.evidence);}catch(error){failures.push(String(error));}}
  if(e.version==='4.3'){
    if(await factoryFingerprint(e.component,process.cwd())!==e.factoryHash)failures.push('Stale factory implementation evidence');
    for(const [label,a] of [['readback',e.readback],['generation',e.generation],['capability',e.capabilityArtifact]] as const)try{
      const record=JSON.parse((await read(a)).toString());
      if(label==='capability'){
        if(capabilityFingerprint(record)!==e.capabilityHash)failures.push('Capability hash mismatch');
        if(record.identity?.appId!==e.appId||record.identity?.environmentId!==e.source.identity.environmentId)failures.push('Capability environment/app mismatch');
        for(const kind of e.unverifiedControlVersions)if(record.controls?.[kind]?.available!==true||record.controls[kind].versionStatus!=='CONTROL VERSION UNVERIFIED')failures.push('Missing discovered unversioned capability: '+kind);
      }
      else if(record.sourceHash!==e.sourceHash||record.appId!==e.appId||record.environmentId!==e.source.identity.environmentId||record.registryHash!==e.registryHash||record.sessionId!==e.sessionId||record.planHash!==e.planHash)failures.push('Unbound '+label+' evidence');
      else if(label==='readback'&&(record.exact!==true||record.actualHash!==e.sourceHash))failures.push('Exact readback unproven');
      else if(label==='generation'){
        const node=nodes.find(n=>n.name===record.root);
        if(record.component!==e.component||record.variant!==e.variant||(record.request?.props?.variant??'standard')!==e.variant||record.factoryHash!==e.factoryHash||record.generated!==true||!node||hashJson({[node.name]:node.node})!==record.instanceHash||record.request?.component!==e.component||record.request?.key!==record.root||!verifyGeneratedInstance(record.request,{[node.name]:node.node}).passed)failures.push('Generated factory instance unproven');
        if(node&&evidenceProfile(e.component,e.variant).kind==='static'){
          const interactive=(value:unknown):boolean=>!!value&&typeof value==='object'&&(Object.entries(value).some(([key,v])=>(['OnSelect','OnChange','OnCheck','OnUncheck'].includes(key)&&typeof v==='string'&&!['=false','=true'].includes(v))||interactive(v)));
          if(interactive(node.node)&&!e.interactions.some(i=>i.name==='child-interactions'&&i.passed))failures.push('Interactive static-component descendants need child-interactions evidence');
        }
      }
    }catch(error){failures.push(String(error));}
    if(e.productBenchmark&&(e.evidenceClass!=='PRODUCT_BENCHMARK_EVIDENCE'||e.publication?.publishedSourceHash!==e.sourceHash))failures.push('Published product evidence required');
    if(e.publication)try{const p=JSON.parse((await read(e.publication.verification)).toString());if(p.publishedSourceHash!==e.sourceHash||p.appId!==e.appId||p.published!==true)failures.push('Publication readback unproven');}catch(error){failures.push(String(error));}
  }
  if(e.productBenchmark)for(const a of Object.values(e.productBenchmark))try{await read(a);}catch(error){failures.push(String(error));}
  return {component:e.component,variant:e.variant,sourceHash:e.sourceHash,planHash:e.planHash,...(e.version==='4.3'?{factoryHash:e.factoryHash,capabilityHash:e.capabilityHash,evidenceHash:hashJson(e),previewValidated:!failures.length,knownAccessibilitySuggestions:e.knownAccessibilitySuggestions,unverifiedControlVersions:e.unverifiedControlVersions}:{}),passed:!failures.length,maturity:failures.length?'IMPLEMENTED':e.productBenchmark?'PRODUCTION_BENCHMARKED':'NATIVE_VALIDATED',failures,remoteWrites:0,limitations:['Evidence records operator observations; it is not full screen-reader or physical-device certification','Certification applies only to these source and design hashes; registry-wide promotion is separate',...(e.version==='4.3'&&e.unverifiedControlVersions.length?['CONTROL VERSION UNVERIFIED: '+e.unverifiedControlVersions.join(', ')+'; certification scoped to observed capability contract and this native source, not arbitrary control upgrades']:[])]};
}
