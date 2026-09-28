import {create} from 'xmlbuilder2';
import {hashJson} from '../core/json.js';
import {pcfComponentSchema,propertyTypes,pcfIdentity,type PCFComponentIR} from './schema.js';

export function compileManifest(raw:unknown){
 const c=pcfComponentSchema.parse(raw);const xml=create({version:'1.0',encoding:'utf-8'}).ele('manifest').ele('control',{namespace:c.namespace,constructor:c.constructor,version:c.version,'display-name-key':c.constructor,'description-key':c.designRole,'control-type':'standard'});
 xml.ele('external-service-usage',{enabled:'false'}).up();
 for(const [name,p]of Object.entries(c.properties).sort(([a],[b])=>a.localeCompare(b)))xml.ele('property',{name,'display-name-key':name,'of-type':propertyTypes[p.type],usage:p.usage,required:String(p.required)}).up();
 for(const [name,d]of Object.entries(c.datasets)){const ds=xml.ele('data-set',{name,'display-name-key':name});for(const [key,p]of Object.entries(d.columns).sort(([a],[b])=>a.localeCompare(b)))ds.ele('property-set',{name:key,'display-name-key':key,'of-type':propertyTypes[p.type],usage:'bound',required:String(p.required)}).up();}
 const resources=xml.ele('resources');for(const r of c.resources)resources.ele(r.kind,{path:r.path,...(r.kind==='resx'?{version:c.version}:{order:'1'})}).up();
 if(c.features.length){const features=xml.ele('feature-usage');for(const f of c.features)features.ele('uses-feature',{name:f.name,required:String(f.required)}).up();}
 return xml.end({prettyPrint:true});
}
export function classifyPCFChange(before:PCFComponentIR,after:PCFComponentIR){
 if(pcfIdentity(before)!==pcfIdentity(after))return 'IDENTITY_CHANGE';
 if(hashJson(before.datasets)!==hashJson(after.datasets))return 'DATASET_CONTRACT_CHANGE';
 if(hashJson(before.properties)!==hashJson(after.properties))return 'PROPERTY_CONTRACT_CHANGE';
 const contract=(v:PCFComponentIR)=>({...v,version:'',implementationSource:null});
 return hashJson(contract(before))===hashJson(contract(after))?'IMPLEMENTATION_ONLY':'MANIFEST_CHANGE';
}
export function bumpPCFPatch(before:PCFComponentIR,after:PCFComponentIR){if(classifyPCFChange(before,after)!=='IMPLEMENTATION_ONLY')throw Error('Contract change requires explicit reviewed version policy.');const [major,minor,patch]=before.version.split('.').map(Number);return {...after,version:`${major}.${minor}.${patch!+1}`};}
export function auditPCFSource(source:string){
 const checks:Record<string,RegExp>={BUSINESS_MUTATION:/\b(?:createRecord|updateRecord|deleteRecord|executeMultiple)\s*\(/,EVAL:/\beval\s*\(/,DYNAMIC_FUNCTION:/new\s+Function\b/,COOKIE:/document\s*(?:\.\s*cookie|\[\s*['"]cookie)/,CREDENTIAL_STORAGE:/\b(?:localStorage|sessionStorage|indexedDB)\b/,UNSAFE_HTML:/\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/,REMOTE_SCRIPT:/createElement\s*\(\s*['"]script/,NETWORK:/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/,SECRET:/(?:api[_-]?key|client[_-]?secret|password|connectionstring|access[_-]?token)\s*[:=]\s*['"][^'"]{6,}/i};
 return Object.entries(checks).filter(([,pattern])=>pattern.test(source)).map(([code])=>({code,severity:'error' as const}));
}
