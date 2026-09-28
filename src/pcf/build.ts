import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {compileManifest,auditPCFSource} from './compile.js';
import {pcfComponentSchema,type PCFComponentIR,pcfIdentity} from './schema.js';
import {resolveTheme} from '../canvas/tokens.js';
import {representativePCF} from './representatives.js';
import {hashJson} from '../core/json.js';
export const sha256=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
export const pcfToolchain={node:'22.18.0',pcfScripts:'1.51.1',typescript:'5.9.3',frameworkTypes:'1.3.18',pcfProjectMsbuild:'1.52.1',implementation:'standard'};
export async function writePCFProject(root:string,output:string,raw:unknown){
 const c=pcfComponentSchema.parse(raw);if(c.implementationSource.kind!=='generated')throw Error('EXTERNAL_SOURCE cannot be rewritten.');
 const expected={ColorContrastField:'colorContrast',AdvancedDataGrid:'resizableDataset',CalendarDataset:'calendarNavigation'};
 if(c.constructor!==c.implementationSource.template||expected[c.constructor as keyof typeof expected]!==c.requirement)throw Error('Generated implementation must match its reviewed template/requirement.');
 const contract=(v:PCFComponentIR)=>({properties:v.properties,datasets:v.datasets,resources:v.resources,features:v.features});
 if(hashJson(contract(c))!==hashJson(contract(representativePCF.components[c.constructor]!)))throw Error('Generated template contract differs from its implementation.');
 const target=resolve(output);if(!relative(resolve(root,'output'),target)||relative(resolve(root,'output'),target).startsWith('..'))throw Error('Build must use a fresh output subdirectory.');
 await mkdir(target,{recursive:false});const control=join(target,c.constructor);await mkdir(control);
 const token=(mode:'light'|'dark')=>{const t=resolveTheme({mode});return {text:t.colors.text,surface:t.colors.surface,border:t.colors.border,focus:t.colors.focus,space:t.spacing.md+'px',font:t.typography.family,fontSize:t.typography.body+'px',radius:t.radiusPx+'px'};};
 const template=await readFile(join(root,'pcf/provider-v1/templates/control.ts.txt'),'utf8');
 const source=template.replaceAll('__COMPONENT__',c.constructor).replace('__LIGHT__',JSON.stringify(token('light'))).replace('__DARK__',JSON.stringify(token('dark')));
 const security=auditPCFSource(source);if(security.length)throw Error('PCF source security audit failed: '+security.map(s=>s.code));
 const manifest=compileManifest(c);await writeFile(join(control,'ControlManifest.Input.xml'),manifest);await writeFile(join(control,'index.ts'),source);await copyFile(join(root,'pcf/provider-v1/templates/style.css'),join(control,'style.css'));
 for(const file of ['package.json','package-lock.json','tsconfig.json','eslint.config.mjs','pcfconfig.json'])await copyFile(join(root,'pcf/Timeline',file),join(target,file));
 let project=await readFile(join(root,'pcf/Timeline/Timeline.pcfproj'),'utf8');project=project.replace('<Name>Timeline</Name>','<Name>'+c.constructor+'</Name>').replace('Version="1.*"','Version="1.52.1"');await writeFile(join(target,c.constructor+'.pcfproj'),project);
 return {identity:pcfIdentity(c),version:c.version,sourceHash:sha256(source),manifestHash:sha256(manifest),cssHash:sha256(await readFile(join(control,'style.css'))),dependencyLockHash:sha256(await readFile(join(target,'package-lock.json'))),security,ownership:'UNKNOWN',toolchain:pcfToolchain};
}
export async function artifactInventory(directory:string):Promise<{path:string;hash:string;bytes:number}[]>{const result:{path:string;hash:string;bytes:number}[]=[];async function visit(dir:string){for(const item of await readdir(dir,{withFileTypes:true})){const p=join(dir,item.name);if(item.isSymbolicLink())throw Error('Artifact symlinks forbidden');if(item.isDirectory())await visit(p);else {const bytes=await readFile(p);result.push({path:relative(directory,p).replaceAll('\\','/'),hash:sha256(bytes),bytes:bytes.length});}}}await visit(directory);return result.sort((a,b)=>a.path.localeCompare(b.path));}
export function assertBuildOwnership(c:PCFComponentIR,evidence:{identity:string;sourceHash:string;manifestHash:string;artifactHash:string;packageHash:string},actual:{source:string;manifest:string;artifacts:{path:string;hash:string;bytes:number}[];packageBytes:Buffer}){
 if(c.implementationSource.kind!=='generated'||evidence.identity!==pcfIdentity(c)||evidence.sourceHash!==sha256(actual.source)||actual.manifest!==compileManifest(c)||evidence.manifestHash!==sha256(actual.manifest)||evidence.artifactHash!==hashJson(actual.artifacts)||evidence.packageHash!==sha256(actual.packageBytes))throw Error('Incomplete or stale provenance');
 return 'POWERCANVAS_OWNED' as const;
}
