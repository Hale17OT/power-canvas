import type { Command } from 'commander';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stringify, parse } from 'yaml';
import { z } from 'zod';
import { parseMemory, productSchema, designSchema } from '../canvas/taste/memory.js';
import { planDesign, exploreDesign, type DesignPlan } from '../canvas/taste/decisions.js';
import { adapters, componentEvidence, taxonomy, resolveAdapter, inspirationCardSchema } from '../canvas/taste/catalog.js';
import { compileDesignCandidate } from '../canvas/taste/generation.js';
import { renderCandidate } from '../canvas/taste/preview.js';
import { emit } from './output.js';
import { pattern, patternCatalog } from '../canvas/patterns.js';
import { loadProject } from '../config/load.js';
import { componentLab } from '../canvas/taste/lab.js';
import { createCompositionIR, validateCompositionIR } from '../canvas/composition-ir.js';
import { planCanvasMigration } from '../canvas/migration.js';
import { certifyNative } from '../canvas/certification.js';
import { readNativeDirectory } from './taste-commands.js';
import { loadCertifiedSelection } from '../canvas/certified-selection.js';
import {PowerCanvasError} from '../core/errors.js';

export function registerDesignV4Commands(program:Command,taste:Command,components:Command,globals:()=>{project:string;json:boolean}) {
  const report=(data:object)=>emit(data,JSON.stringify(data,null,2),globals().json);
  const readProduct=async(file:string)=>parseMemory(await readFile(resolve(file),'utf8'),'product',productSchema);
  const write=async(dir:string,name:string,data:unknown)=>{await mkdir(resolve(dir),{recursive:true});await writeFile(resolve(dir,name),typeof data==='string'?data:JSON.stringify(data,null,2)+'\n',{flag:'wx'});};
  const writeCandidate=async(dir:string,plan:DesignPlan,host?:string,theme:'light'|'dark'='light',stability:'experimental'|'production'='experimental',certificationFile?:string)=>{
    const certified=certificationFile?await loadCertifiedSelection(resolve(certificationFile)):undefined;
    validateCompositionIR(createCompositionIR(plan,stability),plan,certified);
    await write(dir,'design-plan.json',plan);
    if(host){const generated=compileDesignCandidate(plan,parse(await readFile(resolve(host),'utf8')),theme,createCompositionIR(plan,stability),certified);for(const [name,file]of Object.entries(generated.files))await write(dir,name,stringify(file,{lineWidth:0}));await write(dir,'composition-ir.json',generated.composition);await write(dir,'component-resolutions.json',generated.resolutions);await write(dir,'typed-fields.json',generated.typedFields);await write(dir,'component-metadata.json',generated.metadata);await write(dir,'native-manifest.json',generated.manifest);await write(dir,'performance.json',generated.performance);await write(dir,'preflight.json',generated.preflight);await write(dir,'preview.html',renderCandidate(generated,theme));}
  };
  taste.command('decisions').option('--product <file>').option('--app <key>').option('--device <device>','desktop, tablet or mobile').option('--width <pixels>').option('--design <file>').action(async(o:{product?:string;app?:string;device?:string;width?:string;design?:string})=>{
    let product=o.product?await readProduct(o.product):undefined;let design;
    if(o.app){const {project}=await loadProject(globals().project);const app=project.canvasApps?.[o.app];if(!app?.taste?.memory)throw new Error('App decisions require PRODUCT.md memory');product=await readProduct(resolve(globals().project,app.taste.memory.product));design=app.taste.design?.v4;}
    if(!product)throw new Error('Provide --product or an --app with product memory');
    if(o.design)design=parseMemory(await readFile(resolve(o.design),'utf8'),'design',designSchema).v4;
    report(planDesign(product,{...(o.device?{device:z.enum(['desktop','tablet','mobile']).parse(o.device)}:{}),...(o.width?{screenWidth:Number(o.width)}:{}),...(design?{design}:{})}));
  });
  taste.command('explore').requiredOption('--product <file>').requiredOption('--out <directory>').option('--host <file>','Explicit host bindings; otherwise plan only').option('--count <number>','Two to four directions','3').option('--device <device>','desktop, tablet or mobile','desktop').option('--stability <mode>','experimental or production','experimental').action(async(o:{product:string;out:string;host?:string;count:string;device:string;stability:string})=>{
    const plans=exploreDesign(await readProduct(o.product),Number(o.count),{device:z.enum(['desktop','tablet','mobile']).parse(o.device)});
    for(const plan of plans)await writeCandidate(resolve(o.out,plan.direction),plan,o.host,'light',z.enum(['experimental','production']).parse(o.stability));
    const distinctStructures=new Set(plans.map(p=>[p.composition,...p.decisions.map(d=>d.selected)].join('/'))).size;
    report({plans:plans.map(p=>({direction:p.direction,composition:p.composition,decisions:p.decisions,hash:p.hash})),distinctStructures,converged:distinctStructures<plans.length,remoteWrites:0});
  });
  taste.command('generate').requiredOption('--product <file>').requiredOption('--host <file>').requiredOption('--out <directory>').option('--design <file>').option('--variance <number>','Design variance, 0–10','3').option('--device <device>','desktop, tablet or mobile','desktop').option('--theme <theme>','light or dark','light').option('--stability <mode>','experimental or production','experimental').option('--certifications <file>','Verified variant evidence manifest for production selection').action(async(o:{product:string;host:string;out:string;design?:string;variance:string;device:string;theme:string;stability:string;certifications?:string})=>{
    const design=o.design?parseMemory(await readFile(resolve(o.design),'utf8'),'design',designSchema).v4:{designVariance:Number(o.variance)};
    const plan=planDesign(await readProduct(o.product),{device:z.enum(['desktop','tablet','mobile']).parse(o.device),design});await writeCandidate(o.out,plan,o.host,z.enum(['light','dark']).parse(o.theme),z.enum(['experimental','production']).parse(o.stability),o.certifications);report({generated:true,planHash:plan.hash,remoteWrites:0,nativeValidated:false});
  });
  taste.command('migration-plan').requiredOption('--before <directory>').requiredOption('--after <directory>').requiredOption('--out <directory>').option('--mapping <file>').action(async(o:{before:string;after:string;out:string;mapping?:string})=>{
    const [before,after]=await Promise.all([readNativeDirectory(o.before),readNativeDirectory(o.after)]);
    const result=planCanvasMigration(before,after,o.mapping?parse(await readFile(resolve(o.mapping),'utf8')):[]);await write(o.out,'migration-plan.json',result);report(result);
  });
  components.command('certify <directory>').requiredOption('--evidence <file>').requiredOption('--plan <file>').requiredOption('--out <directory>').action(async(directory:string,o:{evidence:string;plan:string;out:string})=>{
    const evidence=JSON.parse(await readFile(resolve(o.evidence),'utf8'));const plan=JSON.parse(await readFile(resolve(o.plan),'utf8')) as {hash:string};
    const metadata=JSON.parse(await readFile(resolve(directory,'component-metadata.json'),'utf8'));
    const result=await certifyNative(evidence,await readNativeDirectory(directory),plan.hash,resolve(o.evidence,'..'),metadata);await write(o.out,'certification.json',result);report(result);if(!result.passed)process.exitCode=1;
  });
  const patterns=program.command('patterns').description('Curated pattern adapters, feasibility and native factories');
  patterns.command('list').action(()=>report({taxonomy,adapters,components:patternCatalog().map(p=>({name:p.name,...componentEvidence(p.name)}))}));
  patterns.command('info <name>').action((name:string)=>report(resolveAdapter(name)));
  patterns.command('ingest <file>').requiredOption('--out <directory>').action(async(file:string,o:{out:string})=>{const card=inspirationCardSchema.parse(parse(await readFile(resolve(file),'utf8')));await write(o.out,'inspiration.json',card);report({stored:true,remoteWrites:0});});
  components.command('variants <name>').action((name:string)=>{if(!patternCatalog().some(p=>p.name===name))throw new PowerCanvasError('PF-CAPABILITY-UNSUPPORTED','This component has no executable native factory or variants.','Inspect components info or patterns info for planned capability and supported alternatives. Do not infer production support.');report(componentEvidence(name));});
  components.command('lab').requiredOption('--out <directory>').option('--theme <theme>','light or dark','light').action(async(o:{out:string;theme:string})=>{
    const lab=componentLab(z.enum(['light','dark']).parse(o.theme));for(const [name,file]of Object.entries(lab.files))await write(o.out,name,stringify(file,{lineWidth:0}));await write(o.out,'manifest.json',lab.manifest);await write(o.out,'support.json',lab.support);await write(o.out,'audit.json',lab.audit);report({variants:lab.entries.length,...lab.manifest});
  });
  components.command('preview <name>').requiredOption('--props <file>').requiredOption('--out <directory>').action(async(name:string,o:{props:string;out:string})=>{const found=patternCatalog().find(p=>p.name===name);if(!found)throw new Error('No executable native factory');const result=pattern('pc_preview',name as Parameters<typeof pattern>[1],parse(await readFile(resolve(o.props),'utf8')));await write(o.out,'component.pa.yaml',stringify([result],{lineWidth:0}));await write(o.out,'evidence.json',componentEvidence(name));report({generated:true,nativeValidated:false,remoteWrites:0});});
}
