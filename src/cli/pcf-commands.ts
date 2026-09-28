import type {Command} from 'commander';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {parse} from 'yaml';
import {pcfSchema} from '../pcf/schema.js';
import {compileManifest} from '../pcf/compile.js';
import {inspectExternalPCF} from '../pcf/inspection.js';
import {inspectBindingXML} from '../pcf/binding-parser.js';
import {pcfCapabilities} from '../pcf/binding-capabilities.js';
import {implementationCatalog} from '../canvas/registry.js';
import {representativePCF} from '../pcf/representatives.js';
import {emit} from './output.js';
export function registerPCFCommands(program:Command,global:()=>{json:boolean;project:string}){
 const pcf=program.command('pcf').description('Offline PCF contracts; no tenant push/import route');
 pcf.command('catalog').action(()=>emit({capabilities:pcfCapabilities(),components:implementationCatalog(representativePCF.components)},'PCF/native implementation catalog',global().json));
 pcf.command('inspect <directory>').option('--binding','Interpret the argument as a local FormXML file; observation only').option('--manifest <path>','Manifest relative to the project directory','ControlManifest.Input.xml').action(async(directory:string,options:{manifest:string;binding?:boolean})=>emit(options.binding?inspectBindingXML(await readFile(resolve(global().project,directory),'utf8')):await inspectExternalPCF(resolve(global().project,directory),options.manifest),'PCF inspection; no adoption or semantic certification',global().json));
 pcf.command('compile <file>').requiredOption('--output <directory>','Fresh local output directory').action(async(file:string,options:{output:string})=>{
  const source=pcfSchema.parse(parse(await readFile(resolve(global().project,file),'utf8')));const output=resolve(global().project,options.output);await mkdir(output,{recursive:false});
  for(const [key,c]of Object.entries(source.components))await writeFile(join(output,key+'.ControlManifest.Input.xml'),compileManifest(c));emit({components:Object.keys(source.components),output,tenantMutations:0},'Typed PCF manifests compiled; build/package/live evidence separate',global().json);
 });
}

