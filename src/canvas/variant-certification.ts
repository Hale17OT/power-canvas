import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hashJson } from '../core/json.js';
import { patternCatalog, pattern } from './patterns.js';
import type { Control } from './patterns.js';
import { componentEvidence } from './taste/catalog.js';

export function evidenceProfile(component:string,variant:string){
  const common=['accessible-name','responsive-geometry','light-theme','dark-theme'];
  const staticNames=['PageHeader','SectionHeader','RecordHeader','FormSection','DetailPanel','EmptyState','LoadingState','Skeleton'];
  if(staticNames.includes(component))return {kind:'static',checks:[...common,'content-visible'],limits:component==='LoadingState'||component==='Skeleton'?['Visual state only; backend latency not certified']:[]};
  if(['CompactSidebar','TopNavigation','BottomNavigation','Tabs'].includes(component))return {kind:'navigation',checks:[...common,'selected-state','destination-change','long-label','destination-bound'],limits:[]};
  if(['SideSheet','BottomSheet','FullScreenTask','ConfirmationDialog','ContextPanel'].includes(component))return {kind:'overlay',checks:[...common,'open','close','cancel','action','background-blocking','focus-return','responsive-transition'],limits:component==='BottomSheet'?['Bottom-anchored sheet; no drag/swipe']:[]};
  if(component==='TaskForm')return {kind:'input',checks:[...common,'typed-value','required','invalid','read-only','disabled','draft-preservation',...(variant==='wizard'?['next','previous','review','completion-gate','hidden-step-inert']:[])],limits:[]};
  if(['DataTable','RichList','GroupedList','ActivityTimeline'].includes(component))return {kind:'data',checks:[...common,'0-records','1-record','4-records','24-records','long-text','missing-values','mixed-statuses',...(component==='GroupedList'?['group-order','empty-group','long-group']:[])],limits:[]};
  if(component==='BulkActionBar')return {kind:'selection',checks:[...common,'0-selected-hidden','1-selected','multiple-selected','clear-selection'],limits:[]};
  if(['SearchBox','FilterBar','FilterChips'].includes(component))return {kind:'filter',checks:[...common,'empty-filter','selected-state','multiple-filters','clear-filter','overflow'],limits:[]};
  if(component==='Snackbar')return {kind:'feedback',checks:[...common,'appear','dismiss','repeat'],limits:[]};
  return {kind:'interactive',checks:[...common,'content-visible','interaction','disabled'],limits:[]};
}

export function missingRuntimeEvidence(component:string,variant:string,interactions:readonly {name:string;passed:boolean}[]){
  return evidenceProfile(component,variant).checks.filter(name=>!interactions.some(i=>i.name===name&&i.passed));
}

/** Only executable implementation dependencies affect expiry; documentation and unrelated repository state do not. */
export async function factoryFingerprint(component:string,root:string){
  const definition=patternCatalog().find(c=>c.name===component);if(!definition)throw new Error('Unknown factory');
  const files=['src/canvas/patterns.ts','src/canvas/expressive.ts','src/canvas/tokens.ts','src/canvas/native-types.ts',...(['TaskForm','FormSection'].includes(component)?['src/canvas/fields.ts']:[])];
  const implementation=Object.fromEntries(await Promise.all(files.map(async path=>[path,await readFile(resolve(root,path),'utf8')])));
  return hashJson({component,contract:JSON.stringify(definition.propsSchema),implementation});
}
export function capabilityFingerprint(raw:{controls:Record<string,{available:boolean;creationName:string|null;inputProperties:string[];outputProperties:string[];variants:string[];version:string|null}>}){
  return hashJson(Object.fromEntries(Object.entries(raw.controls).sort(([a],[b])=>a.localeCompare(b)).map(([name,c])=>[name,{available:c.available,creationName:c.creationName,inputs:[...c.inputProperties].sort(),outputs:[...c.outputProperties].sort(),variants:[...c.variants].sort(),version:c.version}])));
}
/** Reproduce the factory call; permit only observed authoring omission of bounded default properties. */
export function verifyGeneratedInstance(request:{key:string;component:string;props:Record<string,unknown>;children:Control[];style:Record<string,string>},actual:Control){
  const generated=pattern(request.key,request.component as Parameters<typeof pattern>[1],request.props as never,request.children,request.style);
  const permitted:Record<string,string[]>={LayoutMinWidth:['=0'],LayoutMinHeight:['=0'],FillPortions:['=0'],AlignInContainer:['=AlignInContainer.Stretch'],X:['=0'],Y:['=0'],Icon:['=""'],AutoHeight:['=false'],Height:['=32'],Visible:['=true'],Value:['=""'],AccessibleLabel:['=""'],Checked:['=false'],SelectMultiple:['=false'],IsSearchable:['=true'],Required:['=false'],Text:['=""']};
  const failures:string[]=[];
  const compare=(a:unknown,b:unknown,path:string[])=>{
    if(JSON.stringify(a)===JSON.stringify(b))return;
    if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))compare((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key],[...path,key]);return;}
    if(b===undefined&&path.at(-2)==='Properties'&&typeof a==='string'&&permitted[path.at(-1)!]?.includes(a))return;
    failures.push(path.join('/'));
  };compare(generated,actual,[]);return {passed:failures.length===0,failures,generatedHash:hashJson(generated),observedHash:hashJson(actual)};
}

export interface VariantCertificate {
  component:string;variant:string;passed:boolean;maturity:string;factoryHash:string;capabilityHash:string;sourceHash:string;planHash:string;evidenceHash:string;
}
export function certifiedVariant(component:string,variant:string,certificates:readonly VariantCertificate[],current:{factoryHash:string;capabilityHash:string},confidence:'native'|'published'='native'){
  return certificates.find(c=>c.component===component&&c.variant===variant&&c.passed&&c.factoryHash===current.factoryHash&&c.capabilityHash===current.capabilityHash&&/^[a-f0-9]{64}$/.test(c.evidenceHash)&&['NATIVE_VALIDATED','PRODUCTION_BENCHMARKED'].includes(c.maturity)&&(confidence!=='published'||c.maturity==='PRODUCTION_BENCHMARKED'));
}
/** A registry view derives variant maturity from validated certificates, never family-wide flags. */
export function certifiedSupport(certificates:readonly VariantCertificate[],current:Record<string,{factoryHash:string;capabilityHash:string}>){
  return patternCatalog().flatMap(p=>componentEvidence(p.name).variants.map(variant=>{const c=current[p.name]?certifiedVariant(p.name,variant,certificates,current[p.name]!):undefined;return {component:p.name,variant,maturity:c?.maturity??'IMPLEMENTED',certificate:c?.evidenceHash??null,productionSelectable:!!c};}));
}
