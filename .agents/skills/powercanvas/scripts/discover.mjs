// Offline discovery only. No shell, auth, native authoring or mutation commands.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import process from 'node:process';
const [entry,project]=process.argv.slice(2);
if(!entry||!project)throw Error('Usage: node discover.mjs <PowerCanvas CLI entry.js> <project-directory>');
const call=async args=>JSON.parse((await promisify(execFile)(process.execPath,[resolve(entry),...args,'--project',resolve(project),'--json','--non-interactive'],{windowsHide:true,timeout:30000,maxBuffer:8*1024*1024})).stdout);
const version=await call(['version']);
if(version.name!=='PowerCanvas'||version.agentContractVersion!=='1.0'||version.skillCompatibility?.major!==1)throw Error('UNSUPPORTED: PowerCanvas agent contract 1.0 required');
const capabilities=await call(['capabilities']);
console.log(JSON.stringify({version,capabilities,remoteWrites:0}));
