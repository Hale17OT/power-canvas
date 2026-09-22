import type {Command} from 'commander';
import {readFile} from 'node:fs/promises';
import {capabilities,versionInfo} from '../agent/capabilities.js';
import {commandManifest} from '../agent/commands.js';
import {routeRequest,routingRules} from '../agent/routing.js';
import {writeTask,resumeTask} from '../agent/journal.js';
import {emit} from './output.js';
export function registerAgentCommands(program:Command,globals:()=>{json:boolean;project:string}){
 const report=(value:object)=>emit(value,JSON.stringify(value,null,2),globals().json);
 program.command('version').description('Structured CLI/core and agent-contract compatibility').action(()=>report(versionInfo()));
 program.command('capabilities').description('Offline registry inventory; optional certificate/health artifacts, no live requests').option('--certifications <file>').option('--authoring-evidence <directory>').action(async(o:{certifications?:string;authoringEvidence?:string})=>report({...await capabilities(o),commands:commandManifest(program)}));
 const agent=program.command('agent').description('Offline agent discovery, bounded routing and resumable fact journals');
 agent.command('commands').description('Authoritative registered command inventory and conservative mutation risks').action(()=>report({version:'1.0',commands:commandManifest(program)}));
 agent.command('route <request>').description('Deterministic routing hints; never executes the suggested workflow').option('--powercanvas-context','Request concerns a confirmed PowerCanvas project').option('--authoring-health <state>').action((request:string,o:{powercanvasContext?:boolean;authoringHealth?:string})=>report({rules:routingRules,...routeRequest(request,{powerCanvasProject:o.powercanvasContext,authoringHealth:o.authoringHealth})}));
 agent.command('journal').description('Create a new local fact journal; never overwrite or authorize mutations').requiredOption('--spec <file>').requiredOption('--out <path>').action(async(o:{spec:string;out:string})=>report(await writeTask(JSON.parse(await readFile(o.spec,'utf8')),globals().project,o.out)));
 agent.command('resume').description('Verify journal artifact hashes and surface stale/unknown state; never execute').requiredOption('--journal <file>').action(async(o:{journal:string})=>report(await resumeTask(JSON.parse(await readFile(o.journal,'utf8')),globals().project)));
}
