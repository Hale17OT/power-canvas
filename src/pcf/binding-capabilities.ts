import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {hashJson} from '../core/json.js';
import {pcfCapabilities as baseCapabilities} from './capabilities.js';
export const bindingEvidenceSources=['src/pcf/host-lowering.ts','src/pcf/solution.ts','src/pcf/schema.ts','src/pcf/representatives.ts','src/pcf/binding-parser.ts','src/pcf/binding-oracle.ts','src/pcf/field-binding.ts','src/pcf/dataset-binding.ts','src/pcf/binding-capabilities.ts','scripts/pcf-binding-certify.mjs','tests/pcf-field-binding.test.ts','tests/pcf-dataset-binding.test.ts','tests/pcf-binding-oracle.test.ts','tests/pcf/binding/field-final-v10c.xml','tests/pcf/binding/state-A-v10c.xml','tests/pcf/binding/state-B-v10c.xml','tests/pcf/binding/state-C-v10c.xml','tests/pcf/binding/dataset-v10c.xml','tests/pcf/binding/v10c-provenance.json'];
export function bindingSourceHashes(root=process.cwd()){return Object.fromEntries(bindingEvidenceSources.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));}
export function bindingEvidence(root=process.cwd()){
 try{const p=JSON.parse(readFileSync(resolve(root,'tests/pcf/binding/certification.json'),'utf8')) as {integrityHash:string;sourceHashes:Record<string,string>;dimensions:Record<string,boolean>};const {integrityHash,...body}=p;if(hashJson(body)!==integrityHash||hashJson(p.sourceHashes)!==hashJson(bindingSourceHashes(root)))return {status:'STALE',dimensions:{} as Record<string,boolean>};return {status:'VERIFIED',dimensions:p.dimensions};}catch{return {status:'UNRECORDED',dimensions:{} as Record<string,boolean>};}
}
export function pcfCapabilities(){const base=baseCapabilities(),proof=bindingEvidence();return {...base,bindingEvidence:proof.status,capabilities:[...base.capabilities,...['modelDriven.fieldBinding.compile','modelDriven.datasetBinding.compile'].map(name=>({name:'pcf.'+name,status:proof.dimensions[name]?'VERIFIED':'UNPROVEN',live:false}))],bindingBoundary:'Microsoft-oracle serialization and offline package proof only. Live generated binding apply remains disabled.'};}


