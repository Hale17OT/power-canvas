import {create} from 'xmlbuilder2';
import {parseControlDescriptions, type ObservedBinding} from './binding-parser.js';

export interface InstalledOracleComponent {
 name:string;
 platformId:string;
 namespace:string;
 constructor:string;
 version:string;
 manifestHash:string;
}
interface ElementNode {getAttribute(name:string):string|null;attributes:ArrayLike<{name:string;value:string}>}
const identity=(s:string)=>s.replace(/^\{|\}$/g,'').toLowerCase();
/** Resolve observed references only. Never infer host identity from labels or a package path. */
export function resolveOracleHosts(xml:string,installed:InstalledOracleComponent[]){
 const bindings=parseControlDescriptions(xml);
 const document=create(xml).node as unknown as {getElementsByTagName(name:string):ArrayLike<ElementNode>};
 const hosts=Array.from(document.getElementsByTagName('control'));
 const names=new Set<string>();for(const c of installed){if(names.has(c.name))throw Error('Ambiguous installed component identity');names.add(c.name);}
 return bindings.map(binding=>{
  // V1.0B observed forControl references control.uniqueid. Do not fall back to control.id.
  const matches=hosts.filter(h=>h.getAttribute('uniqueid')&&identity(h.getAttribute('uniqueid')!)===identity(binding.forControl));
  if(matches.length!==1)throw Error('Oracle forControl must resolve to exactly one base control.uniqueid');
  const host=Object.fromEntries(Array.from(matches[0]!.attributes).map(a=>[a.name,a.value]));
  const controls=binding.controls.map(control=>{
   const component=installed.find(c=>c.name===control.attributes.name);
   return {control,installed:component??null,identityVerified:component!==undefined};
  });
  return {binding,host,controls};
 });
}

/** An oracle can be captured successfully without satisfying the requested certification boundary. */
export function assessOracleCapture(input:{componentName:string;draftComponentState:number;ordinaryReadContainsBinding:boolean;bindings:ObservedBinding[];uiSelectedFormFactors:string[];verifiedFormFactorMap:Record<string,string>}){
 const blockers:string[]=[];
 // Internal row state and ordinary metadata visibility do not establish publication.
 const selected=input.uiSelectedFormFactors.map(name=>input.verifiedFormFactorMap[name]);
 if(selected.some(value=>value===undefined))blockers.push('UI_FORM_FACTOR_MAPPING_UNVERIFIED');
 const observed=[...new Set(input.bindings.flatMap(b=>b.controls.filter(c=>c.attributes.name===input.componentName).map(c=>c.attributes.formFactor)))];
 if(!blockers.includes('UI_FORM_FACTOR_MAPPING_UNVERIFIED')&&(observed.some(f=>!selected.includes(f!))||selected.some(f=>!observed.includes(f))))blockers.push('UI_SERIALIZATION_FORM_FACTOR_MISMATCH');
 return {status:blockers.length?'BLOCKED':'CAPTURE_BOUNDARY_VERIFIED',blockers,observedFormFactors:observed,runtimeVisibility:'UNPROVEN',componentStateDiagnostic:input.draftComponentState,productionLoweringVerified:false,mutationAuthorized:false};
}

/** Publication action evidence is independent of internal SystemForm lifecycle values. */
export function classifyOraclePublication(input:{makerAction:'SAVE_ONLY'|'SAVE_AND_PUBLISH'|'UNKNOWN';explicitPublishRequests:number;componentState:number;ordinaryReadContainsBinding:boolean}) {
 return {makerAction:input.makerAction,publicationAction:input.explicitPublishRequests>0||input.makerAction==='SAVE_AND_PUBLISH'?'OBSERVED':'NONE_OBSERVED',runtimeVisibility:'UNPROVEN',componentStateDiagnostic:input.componentState,continuationAllowed:input.makerAction==='SAVE_ONLY'&&input.explicitPublishRequests===0};
}

