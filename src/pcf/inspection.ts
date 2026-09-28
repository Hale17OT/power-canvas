import {readFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {elements} from '../model-driven/xml.js';
import {sha256} from './build.js';
import {auditPCFSource} from './compile.js';

export async function inspectExternalPCF(directory:string,manifestPath='ControlManifest.Input.xml'){
 const base=resolve(directory);const file=resolve(base,manifestPath);if(relative(base,file).startsWith('..'))throw Error('Manifest escapes project');
 const manifest=await readFile(file,'utf8');if(/<!DOCTYPE|<!ENTITY/i.test(manifest))throw Error('DTD/entity declarations forbidden');
 const controls=elements(manifest,'control');if(controls.length!==1)throw Error('Exactly one control required');const c=controls[0]!;const namespace=c.getAttribute('namespace');const constructor=c.getAttribute('constructor');if(!namespace||!constructor)throw Error('Missing PCF identity');
 const resources=[];for(const kind of ['code','css','resx'])for(const node of elements(manifest,kind)){const path=node.getAttribute('path');if(!path)throw Error('Missing resource path');const absolute=resolve(base,path);if(relative(base,absolute).startsWith('..'))throw Error('Resource escapes project');const bytes=await readFile(absolute);resources.push({kind,path,hash:sha256(bytes),audit:kind==='code'?auditPCFSource(bytes.toString('utf8')):[]});}
 return {identity:namespace+'.'+constructor,version:c.getAttribute('version'),ownership:'EXTERNAL_SOURCE',manifestHash:sha256(manifest),resources,rewritten:false,liveRuntime:false};
}
export function pcfCollision(identity:string,observed:{identity:string;owned:boolean}[]){const matches=observed.filter(r=>r.identity.toLowerCase()===identity.toLowerCase());return matches.length>1||matches.some(r=>!r.owned)?'CONFLICT':matches.length?'OWNED_REQUIRES_FRESH_PLAN':'ABSENT';}
