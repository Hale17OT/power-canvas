import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {VERSION} from '../core/version.js';
import {hashJson} from '../core/json.js';
import {patternCatalog} from '../canvas/patterns.js';
import {componentEvidence,adapters} from '../canvas/taste/catalog.js';
import {loadCertifiedSelection} from '../canvas/certified-selection.js';
import {recipeRegistry} from '../flows/recipes.js';
import {actionRegistry} from '../flows/registry.js';
import {providers} from '../flows/providers.js';
import {providerHealth} from '../canvas/provider-health.js';
import {readNativeSource,sourceSnapshotSchema,assertFreshSource} from '../canvas/source-provider.js';
import {capabilityFingerprint} from '../solution/compile.js';

export const agentContractVersion='1.0';
export function versionInfo(){return {name:'PowerCanvas',version:VERSION,agentContractVersion,skillCompatibility:{major:1},coreAuthority:'deterministic compiler and validators'};}
export async function authoringHealth(directory?:string){
  if(!directory)return {...providerHealth('authoringMcp',{readSucceeded:false}),verification:'NOT_CHECKED',writeEligible:false,reason:'Supply current diagnostic artifacts; capability discovery never connects.'};
  const read=async(name:string)=>JSON.parse(await readFile(join(directory,name),'utf8')) as unknown;
  try{
    const diagnostics=await read('diagnostics.json').catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return [];throw error;});
    if(Array.isArray(diagnostics)&&diagnostics.some(d=>d.httpStatus===422))return {...providerHealth('authoringMcp',{readSucceeded:false,rejected:true}),verification:'RECORDED_FAILURE',writeEligible:false};
    if(Array.isArray(diagnostics)&&diagnostics.some(d=>typeof d.kind==='string'&&d.phase==='connect'))return {...providerHealth('authoringMcp',{readSucceeded:false}),verification:'RECORDED_FAILURE',writeEligible:false};
    const snapshot=sourceSnapshotSchema.parse(await read('source-snapshot.json'));
    const files=await readNativeSource(join(directory,'source'));assertFreshSource({files,snapshot},snapshot.identity);
    if(snapshot.mode==='pacDownload')return {...providerHealth('pacDownload',{readSucceeded:true}),verification:'FRESH_SAVED_WITNESS',writeEligible:false};
    const doctor=await read('doctor.json') as {passed?:boolean;identity?:unknown};
    const sameIdentity=doctor.identity!==undefined&&hashJson(doctor.identity as never)===hashJson(snapshot.identity);
    return {...providerHealth(snapshot.mode,{readSucceeded:true,doctorPassed:doctor.passed===true&&sameIdentity}),verification:'FRESH_ARTIFACTS',identity:snapshot.identity,writeEligible:false,reason:'Read-only assessment, not write authorization; current session and stability gates still required.'};
  }catch{return {...providerHealth('authoringMcp',{readSucceeded:false}),verification:'MISSING_INVALID_OR_EXPIRED',writeEligible:false};}
}
export async function capabilities(options:{certifications?:string;authoringEvidence?:string}={}){
 const components=patternCatalog().map(p=>({name:p.name,...componentEvidence(p.name)}));
 const certificates=options.certifications?(await loadCertifiedSelection(options.certifications)).certificates:[];
 return {...versionInfo(),remoteCalls:0,canvas:{status:'IMPLEMENTED',families:components.length,variants:components.reduce((n,p)=>n+p.variants.length,0),components,adapters,certification:{verification:options.certifications?'VERIFIED':'NOT_CHECKED',variants:certificates.map(c=>({component:c.component,variant:c.variant,maturity:c.maturity})),productionBenchmarked:certificates.filter(c=>c.maturity==='PRODUCTION_BENCHMARKED').length},nativeSource:true,sameAppDeviceCompositions:true},taste:{status:'IMPLEMENTED',productDesignMemory:true,decisions:true,maturityEnforced:true},flows:{status:'IMPLEMENTED',actions:actionRegistry,recipes:recipeRegistry,providers,evidence:'Schema/compiler availability is not deployment or live execution proof. Query plans/export evidence for the intended target.'},authoring:await authoringHealth(options.authoringEvidence),unifiedSolutionCompiler:{status:'IMPLEMENTED_WITH_LIMITS',version:1,offlinePlanning:true,executable:false,capabilityHash:capabilityFingerprint(),commands:['solution plan','solution inspect','solution graph','solution diff','solution critique','solution audit','solution apply','solution verify-export'],apply:'Existing Dataverse/Flow executors only; exact native plans and fresh target preflight required',canvasApply:'BLOCKED: separate authoring lifecycle',productionReady:false},powerCanvasMcp:{status:'PLANNED',executable:false}};
}
